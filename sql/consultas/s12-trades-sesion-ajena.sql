-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S12 · trades en una sesion ajena o inexistente
--
-- Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md, o.16.7 (CTO
-- 13-oct). Las politicas nuevas de sim-004a-preparatoria impiden desde ese
-- momento que un alumno escriba o mueva trades a una sesion que no es suya;
-- esta consulta mide si YA hay alguno. Runbook: paso previo OBLIGATORIO a la
-- preparatoria, junto a s11. Ramon la ejecuta y devuelve el resultado
-- completo, que va a revisiones-suite. Si sale algun caso (algun total
-- distinto de 0), se PARA y decide el CTO.
--
-- NO cambia nada: es UNA sola SELECT, sin escrituras ni EXECUTE. Ensayada
-- dentro de una transaccion READ ONLY (pruebas/s12-trades-sesion-ajena.mjs),
-- limpia y con casos plantados. Se pega entera en el editor SQL de Supabase.
-- Acaba en «FIN | s12 | consulta».
--
-- Nada personal: por cada caso solo el id del trade, su session_id y la fecha
-- (closed_at, o opened_at, o created_at). Ni emails, ni nombres, ni importes,
-- ni el user_id.
--
-- Que trae, por este orden:
--   0 hora                 ahora (UTC) y version del servidor
--   1 total                usuario_distinto: trades cuyo user_id no es el de su
--                          sesion · sesion_inexistente: trades con un
--                          session_id que no existe en sim_sessions
--   2 usuario_distinto     cada caso: trade, sesion y fecha
--   3 sesion_inexistente   cada caso: trade, sesion y fecha
-- ============================================================================
with casos as (
  select t.id, t.session_id,
         coalesce(t.closed_at, t.opened_at, t.created_at) fecha,
         case when s.id is null then 'sesion_inexistente' else 'usuario_distinto' end tipo
    from public.sim_trades t
    left join public.sim_sessions s on s.id = t.session_id
   where t.session_id is not null
     and (s.id is null or s.user_id is distinct from t.user_id)
)
select seccion, objeto, detalle from (
  select 0 o, 0 o2, 'hora' seccion, to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC' objeto, version() detalle
  union all
  select 1, 1, 'total', 'usuario_distinto', (select count(*) from casos where tipo = 'usuario_distinto')::text
  union all
  select 1, 2, 'total', 'sesion_inexistente', (select count(*) from casos where tipo = 'sesion_inexistente')::text
  union all
  select case tipo when 'usuario_distinto' then 2 else 3 end, 0, tipo, id::text,
         'sesion=' || session_id::text || ' · fecha=' || coalesce(to_char(fecha at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC', '-')
    from casos
  union all
  select 4, 0, 'FIN', 's12', 'consulta'
) x order by o, o2, objeto collate "C";
