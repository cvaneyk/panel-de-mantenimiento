-- Verificación del criterio de "hecho" de la fase 1 (§8 del SPEC):
-- "Un usuario client de prueba consulta la BD y no ve las webs de otro
-- cliente. Verificado con SQL, no de palabra."
--
-- IMPORTANTE: `set local role` / `set local request.jwt.claims` solo tienen
-- efecto dentro de una transacción explícita. Fuera de un BEGIN, `SET LOCAL`
-- emite un warning y no hace nada, y la sesión se queda como el usuario que
-- ejecuta el script (normalmente postgres, que se salta RLS por ser dueño de
-- las tablas). Todo lo de abajo va envuelto en BEGIN/ROLLBACK.
--
-- Pasos:
--
-- 1. Aplica la migración y el seed contra el proyecto de Supabase:
--      psql "$DATABASE_URL" -f supabase/migrations/20260815183447_initial_schema.sql
--      psql "$DATABASE_URL" -f supabase/seed.sql
--
-- 2. Crea dos usuarios de prueba. Con la Admin API (sirve el service_role key):
--
--      curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" \
--        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
--        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
--        -H "Content-Type: application/json" \
--        -d '{"email":"staff-test@example.com","password":"...","email_confirm":true}'
--
--      (repite para client-test@example.com). El trigger on_auth_user_created
--      les crea el perfil solo. Guarda los dos UUIDs devueltos.
--
--    O bien, a mano: Authentication > Users > Add user en el dashboard.
--
-- 3. Sustituye :staff_id y :client_id por los UUIDs reales y ejecuta el resto.

-- --- 3a. Marca al usuario staff y da de alta la membresía del cliente ---

update public.profiles set is_staff = true
where id = '00000000-0000-0000-0000-000000000001'; -- staff_id

insert into public.memberships (user_id, client_id) values
  ('00000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111') -- client_id, Cliente Uno
on conflict do nothing;

-- --- 3b. Simula la sesión del cliente y comprueba el aislamiento ---

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

-- Debe devolver únicamente la web de Cliente Uno (aaaaaaaa...).
select id, name, client_id from public.sites;

-- Debe devolver 0 filas: la web de Cliente Dos no debe aparecer nunca.
select count(*) as deberia_ser_cero
from public.sites
where client_id = '22222222-2222-2222-2222-222222222222';

-- Debe fallar con "new row violates row-level security policy": el cliente
-- no tiene permiso de escritura en ninguna tabla.
insert into public.sites (client_id, name, url, platform)
values ('11111111-1111-1111-1111-111111111111', 'intento', 'https://x.test', 'other');

rollback;

-- --- 3c. Confirma que el staff sí ve ambas webs ---

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

-- Debe devolver las dos webs (Cliente Uno y Cliente Dos).
select id, name, client_id from public.sites;

rollback;
