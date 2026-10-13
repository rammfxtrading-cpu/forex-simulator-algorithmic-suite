-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S13 · escrituras de los ultimos 30 minutos
--
-- Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md, o.9 y k.4 e
-- (runbook de la etapa 1, paso 7): despues del cierre de prueba de Ramon con
-- su cuenta de prueba, comprobar que el registro lo ve FIRMADO por el cliente
-- de la etapa 1 (x-sim-cliente = etapa1-<version>) y que cambio el saldo.
-- Necesita sql/sim-004a-preparatoria.sql aplicada (lee sim_escrituras_v0 y
-- sim_escrituras_v0_marcas, que solo lee el dueño: se pega como postgres en
-- el editor SQL de Supabase).
--
-- NO cambia nada: es UNA sola SELECT, sin escrituras ni EXECUTE. No hay nada
-- que editar: ni ids, ni emails, ni parametros. Ensayada dentro de una
-- transaccion READ ONLY (pruebas/s13-escrituras-recientes.mjs). Acaba en
-- «FIN | s13 | consulta».
--
-- Nada personal: ni user_id, ni emails, ni importes (ni delta ni pnl), ni
-- columnas. Por cada escritura: la hora (UTC, con milisegundos), la tabla, la
-- operacion, el id de la sesion, la firma y si cambio el saldo.
--
-- Que trae, por este orden:
--   0 hora         ahora (UTC) y desde cuando se mira (30 minutos antes)
--   1 escritura    una fila por escritura del registro en esos 30 minutos,
--                  de la mas antigua a la mas reciente:
--                    firma   firmada · <x-sim-cliente> (<rol del JWT>)
--                            firmada · servicio (service_role, sin cabecera)
--                            sin firma (<rol del JWT, o «ninguno»: SQL directo>)
--                    saldo   en un UPDATE de sim_sessions: «cambia» o «no
--                            cambia»; si «no cambia» pero el UPDATE lo
--                            menciona (marca B), «no cambia (lo menciona)»;
--                            en lo demas, «-»
--   2 total        firmadas (y cuantas de servicio) y sin firma
-- ============================================================================
with desde as (
  select now() - interval '30 minutes' t
), recientes as (
  select e.id, e.en, e.tabla, e.operacion, e.session_id, e.cliente, e.rol_jwt, e.delta,
         exists (select 1 from public.sim_escrituras_v0_marcas m where m.escritura_id = e.id) menciona,
         case when e.cliente <> 'sin-firma' then 'cliente'
              when e.rol_jwt = 'service_role' then 'servicio'
              else 'sin_firma' end firma
    from public.sim_escrituras_v0 e, desde d
   where e.en >= d.t
)
select seccion, objeto, detalle from (
  select 0 o, 0 o2, 'hora' seccion, 'ahora (UTC)' objeto, to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') detalle
  union all
  select 0, 1, 'hora', 'desde (UTC)', to_char(d.t at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') from desde d
  union all
  select 1, r.id::integer, 'escritura', to_char(r.en at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.MS'),
         r.tabla || ' ' || r.operacion || ' · sesion=' || coalesce(r.session_id::text, '-')
         || ' · ' || case r.firma when 'cliente' then 'firmada · ' || r.cliente || ' (' || coalesce(r.rol_jwt, 'ninguno') || ')'
                                  when 'servicio' then 'firmada · servicio (service_role, sin cabecera)'
                                  else 'sin firma (' || coalesce(r.rol_jwt, 'ninguno') || ')' end
         || ' · saldo: ' || case when r.tabla = 'sim_sessions' and r.operacion = 'UPDATE' then
                                   case when r.delta is distinct from 0 then 'cambia'
                                        when r.menciona then 'no cambia (lo menciona)'
                                        else 'no cambia' end
                                 else '-' end
    from recientes r
  union all
  select 2, 1, 'total', 'firmadas',
         (select count(*) from recientes where firma <> 'sin_firma')::text
         || ' (de servicio: ' || (select count(*) from recientes where firma = 'servicio') || ')'
  union all
  select 2, 2, 'total', 'sin firma', (select count(*) from recientes where firma = 'sin_firma')::text
  union all
  select 3, 0, 'FIN', 's13', 'consulta'
) x order by o, o2, objeto collate "C";
