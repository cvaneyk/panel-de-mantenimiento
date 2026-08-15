-- Fase 1: esquema inicial + RLS.
-- Cada tabla se crea junto con sus políticas en esta misma migración (regla del
-- proyecto: la migración que crea la tabla crea las políticas).

create extension if not exists pgcrypto;

-- ============================================================================
-- Tablas (orden que respeta las dependencias de claves foráneas)
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  contact_email text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.memberships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  primary key (user_id, client_id)
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  url text not null,
  platform text not null check (platform in ('wordpress', 'prestashop', 'other')),
  agent_key_hash text,
  agent_last_seen_at timestamptz,
  monitoring_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index sites_client_id_idx on public.sites (client_id);

-- Capa A: serie temporal cruda (retención 30 días, ver §5 del SPEC)
create table public.checks (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites (id) on delete cascade,
  checked_at timestamptz not null default now(),
  ok boolean not null,
  status_code int,
  response_ms int,
  error text
);

create index checks_site_id_checked_at_idx on public.checks (site_id, checked_at desc);

-- Agregado diario, lo que consulta la interfaz
create table public.metrics_daily (
  site_id uuid not null references public.sites (id) on delete cascade,
  day date not null,
  uptime_pct numeric(5, 2),
  checks_total int,
  checks_failed int,
  response_ms_avg int,
  response_ms_p95 int,
  lcp_ms int,
  inp_ms int,
  cls numeric,
  ssl_expires_at timestamptz,
  primary key (site_id, day)
);

-- Capa B: última foto conocida del inventario WordPress, se sobreescribe
create table public.site_inventory (
  site_id uuid primary key references public.sites (id) on delete cascade,
  collected_at timestamptz not null default now(),
  wp_version text,
  php_version text,
  plugins jsonb not null default '[]'::jsonb,
  themes jsonb not null default '[]'::jsonb,
  updates_pending int,
  admin_count int,
  debug_enabled boolean,
  db_size_mb int,
  last_backup_at timestamptz
);

create table public.incidents (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites (id) on delete cascade,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  kind text not null check (kind in ('down', 'ssl_expiring', 'slow')),
  severity text not null,
  detail text
);

create index incidents_site_id_idx on public.incidents (site_id);

-- El corazón del producto
create table public.worklog (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites (id) on delete cascade,
  performed_at timestamptz not null default now(),
  author_id uuid not null references public.profiles (id),
  category text not null check (category in ('update', 'fix', 'improvement', 'content', 'security')),
  summary text not null,
  minutes int,
  visible_to_client boolean not null default true
);

create index worklog_site_id_idx on public.worklog (site_id);

-- Informes mensuales (se modela ya, se llena en fase 7)
create table public.reports (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  period_month date not null,
  generated_at timestamptz not null default now(),
  pdf_url text,
  summary_md text
);

create unique index reports_client_period_idx on public.reports (client_id, period_month);

-- ============================================================================
-- Funciones auxiliares para las políticas de RLS.
-- security definer + dueño postgres: se saltan RLS al consultar profiles /
-- memberships / sites por dentro, evitando la recursión típica de estas
-- comprobaciones. No exponen nada por sí mismas: solo devuelven un booleano o
-- un uuid derivado de auth.uid().
-- ============================================================================

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_staff from public.profiles where id = auth.uid()), false);
$$;

create function public.is_member_of_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and client_id = target_client_id
  );
$$;

create function public.client_id_for_site(target_site_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.sites where id = target_site_id;
$$;

-- ============================================================================
-- RLS: staff lee y escribe todo, client solo lee lo suyo. Los recolectores
-- (n8n) entran con service_role, que se salta RLS por diseño, así que no
-- necesitan política propia.
-- ============================================================================

alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

create policy "profiles_staff_insert" on public.profiles
  for insert to authenticated
  with check (public.is_staff());

create policy "profiles_staff_update" on public.profiles
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "profiles_staff_delete" on public.profiles
  for delete to authenticated
  using (public.is_staff());

alter table public.clients enable row level security;

create policy "clients_staff_all" on public.clients
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "clients_client_select" on public.clients
  for select to authenticated
  using (public.is_member_of_client(id));

alter table public.memberships enable row level security;

create policy "memberships_staff_all" on public.memberships
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "memberships_client_select_own" on public.memberships
  for select to authenticated
  using (user_id = auth.uid());

alter table public.sites enable row level security;

create policy "sites_staff_all" on public.sites
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "sites_client_select" on public.sites
  for select to authenticated
  using (public.is_member_of_client(client_id));

alter table public.checks enable row level security;

create policy "checks_staff_all" on public.checks
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "checks_client_select" on public.checks
  for select to authenticated
  using (public.is_member_of_client(public.client_id_for_site(site_id)));

alter table public.metrics_daily enable row level security;

create policy "metrics_daily_staff_all" on public.metrics_daily
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "metrics_daily_client_select" on public.metrics_daily
  for select to authenticated
  using (public.is_member_of_client(public.client_id_for_site(site_id)));

alter table public.site_inventory enable row level security;

create policy "site_inventory_staff_all" on public.site_inventory
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "site_inventory_client_select" on public.site_inventory
  for select to authenticated
  using (public.is_member_of_client(public.client_id_for_site(site_id)));

alter table public.incidents enable row level security;

create policy "incidents_staff_all" on public.incidents
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "incidents_client_select" on public.incidents
  for select to authenticated
  using (public.is_member_of_client(public.client_id_for_site(site_id)));

alter table public.worklog enable row level security;

create policy "worklog_staff_all" on public.worklog
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "worklog_client_select" on public.worklog
  for select to authenticated
  using (
    visible_to_client
    and public.is_member_of_client(public.client_id_for_site(site_id))
  );

alter table public.reports enable row level security;

create policy "reports_staff_all" on public.reports
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "reports_client_select" on public.reports
  for select to authenticated
  using (public.is_member_of_client(client_id));

-- ============================================================================
-- Alta automática de perfil al crear un usuario en Auth (invitaciones, fase 2).
-- ============================================================================

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
