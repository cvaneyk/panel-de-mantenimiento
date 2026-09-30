-- Verificación de permisos de la fase 6 (agente, capturas, uptime).
-- Mismo método que verify_rls_phase1.sql: todo dentro de BEGIN/ROLLBACK,
-- porque `set local` fuera de una transacción no hace nada.
--
-- Usa los mismos UUIDs de prueba que la fase 1:
--   ...0001 = staff, ...0002 = client de "Cliente Uno" (1111...),
--   Cliente Dos = 2222..., su web = bbbbbbbb-... (ajusta a tu seed).

-- --- 1. Un cliente NO puede leer claves de agente descifradas ---------------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

-- Debe fallar con "permission denied for function agent_targets".
select * from public.agent_targets();

rollback;

-- --- 2. Ni siquiera staff puede leerlas: solo service_role (n8n) -------------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

-- Debe fallar con "permission denied for function agent_targets".
select * from public.agent_targets();

rollback;

-- --- 3. Un cliente NO puede generar ni rotar claves --------------------------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

-- Debe fallar con "Solo la agencia puede gestionar claves de agente."
select public.set_agent_key(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  repeat('x', 64)
);

rollback;

-- --- 4. Un cliente no ve uptime, inventario ni capturas de otro cliente ------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

-- Debe devolver 0 filas aunque se pida explícitamente la web de Cliente Dos
-- (uptime_daily es security invoker: RLS de checks filtra).
select count(*) as deberia_ser_cero
from public.uptime_daily(array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']::uuid[], 30);

-- Debe devolver 0.
select count(*) as deberia_ser_cero
from public.site_inventory
where site_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Debe devolver 0: la política de Storage no deja ver capturas ajenas.
select count(*) as deberia_ser_cero
from storage.objects
where bucket_id = 'site-screenshots'
  and name like 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/%';

rollback;
