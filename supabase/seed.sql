-- Datos de partida para desarrollo y para la verificación de RLS de la fase 1.
-- UUIDs fijos a propósito para poder referenciarlos desde
-- supabase/verify_rls_phase1.sql sin tener que copiarlos cada vez.
--
-- Uso local:  supabase db reset          (lo aplica automáticamente)
-- Uso remoto: psql "$DATABASE_URL" -f supabase/seed.sql
--             o pegado en el editor SQL de supabase.com

insert into public.clients (id, name, slug, contact_email, status) values
  ('11111111-1111-1111-1111-111111111111', 'Cliente Uno', 'cliente-uno', 'contacto@clienteuno.test', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Cliente Dos', 'cliente-dos', 'contacto@clientedos.test', 'active')
on conflict (id) do nothing;

-- monitoring_enabled = false: son dominios .test que no resuelven por DNS. Con
-- el recolector real (fase 3) comprobándolas de verdad, quedarían "caídas"
-- para siempre y el recolector abriría una incidencia que nunca se cierra
-- (fase 4). Sirven para RLS (fase 1), no para monitorización real.
insert into public.sites (id, client_id, name, url, platform, monitoring_enabled) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Web principal Cliente Uno', 'https://clienteuno.test', 'wordpress', false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Web principal Cliente Dos', 'https://clientedos.test', 'wordpress', false)
on conflict (id) do nothing;

insert into public.checks (site_id, checked_at, ok, status_code, response_ms) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), true, 200, 340),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), true, 200, 280);

insert into public.worklog (site_id, author_id, category, summary, minutes, visible_to_client)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, 'update', 'Actualizamos 3 plugins y el núcleo de WordPress.', 20, true
from public.profiles where is_staff limit 1;
