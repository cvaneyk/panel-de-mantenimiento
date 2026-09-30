-- Fase 6: agente WordPress + inventario, capturas de portada y barras de uptime.
-- Ver §3, §5 y §7 del SPEC (revisión 2026-09-30).

create extension if not exists supabase_vault;

-- ============================================================================
-- Inventario: campos nuevos que devuelve el agente (todos de solo lectura).
-- null = el agente no lo ha informado, nunca "false" ni "0" por defecto.
-- ============================================================================

alter table public.site_inventory
  add column core_update_available text,
  add column updates_checked_at timestamptz,
  add column search_engines_discouraged boolean,
  add column db_revisions int,
  add column db_expired_transients int,
  add column db_autoload_kb int,
  add column backup_source text;

-- ============================================================================
-- Clave del agente: cifrada en Vault en vez de hasheada, porque n8n necesita
-- enviarla en claro al agente (§3 del SPEC). La columna del hash nunca llegó
-- a usarse.
-- ============================================================================

alter table public.sites drop column agent_key_hash;
alter table public.sites add column agent_key_secret_id uuid;

-- Captura diaria de la portada (sale de la llamada a PageSpeed).
alter table public.sites
  add column screenshot_path text,
  add column screenshot_taken_at timestamptz;

-- Guarda (o rota) la clave del agente de una web. La clave la genera el
-- servidor del panel y se muestra una sola vez; aquí solo se cifra.
-- security definer para poder escribir en vault, con la comprobación de staff
-- hecha a mano porque RLS no actúa dentro.
create function public.set_agent_key(p_site_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_secret_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Solo la agencia puede gestionar claves de agente.';
  end if;

  if p_key is null or length(p_key) < 32 then
    raise exception 'La clave del agente debe tener al menos 32 caracteres.';
  end if;

  select agent_key_secret_id into existing_secret_id
  from public.sites where id = p_site_id;

  if not found then
    raise exception 'La web no existe.';
  end if;

  if existing_secret_id is null then
    update public.sites
    set agent_key_secret_id = vault.create_secret(p_key, 'agent_key_' || p_site_id::text)
    where id = p_site_id;
  else
    perform vault.update_secret(existing_secret_id, p_key);
  end if;
end;
$$;

revoke all on function public.set_agent_key(uuid, text) from public, anon;
grant execute on function public.set_agent_key(uuid, text) to authenticated;

-- Lo que n8n necesita para llamar a los agentes: URL y clave descifrada.
-- Solo service_role: la clave en claro no debe poder leerla ningún usuario,
-- ni siquiera staff (se ve una vez al generarla y ya).
create function public.agent_targets()
returns table (site_id uuid, url text, agent_key text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.url, d.decrypted_secret
  from public.sites s
  join vault.decrypted_secrets d on d.id = s.agent_key_secret_id
  where s.monitoring_enabled and s.platform = 'wordpress';
$$;

revoke all on function public.agent_targets() from public, anon, authenticated;
grant execute on function public.agent_targets() to service_role;

-- Al borrar una web, su secreto no se queda huérfano en Vault.
create function public.delete_site_agent_secret()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.agent_key_secret_id is not null then
    delete from vault.secrets where id = old.agent_key_secret_id;
  end if;
  return old;
end;
$$;

create trigger on_site_deleted_delete_agent_secret
  after delete on public.sites
  for each row execute function public.delete_site_agent_secret();

-- ============================================================================
-- Storage: capturas en un bucket privado. Ruta: <site_id>/latest.jpg.
-- Solo n8n (service_role) escribe; staff y los miembros del cliente leen.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-screenshots', 'site-screenshots', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Comparación como texto para no romper con un cast a uuid si algún día
-- aparece un nombre de objeto con otra forma.
create policy "site_screenshots_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'site-screenshots'
    and exists (
      select 1 from public.sites s
      where s.id::text = (storage.foldername(name))[1]
        and (public.is_staff() or public.is_member_of_client(s.client_id))
    )
  );

-- ============================================================================
-- Barras de uptime: totales por día (hora de Madrid) a partir de checks.
-- security invoker: RLS de checks filtra como en cualquier otra lectura.
-- ============================================================================

create function public.uptime_daily(p_site_ids uuid[], p_days int)
returns table (site_id uuid, day date, checks_total int, checks_failed int)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.site_id,
    (c.checked_at at time zone 'Europe/Madrid')::date as day,
    count(*)::int as checks_total,
    (count(*) filter (where not c.ok))::int as checks_failed
  from public.checks c
  where c.site_id = any (p_site_ids)
    and c.checked_at >= (
      date_trunc('day', now() at time zone 'Europe/Madrid')
      - make_interval(days => p_days - 1)
    ) at time zone 'Europe/Madrid'
  group by 1, 2;
$$;

revoke all on function public.uptime_daily(uuid[], int) from public, anon;
grant execute on function public.uptime_daily(uuid[], int) to authenticated;
