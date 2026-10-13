-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S12 · filas en una sesion ajena o inexistente
--
-- Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md, o.16.7 y o.16.9
-- (CTO 13-oct). Las politicas y el disparador nuevos de sim-004a-preparatoria
-- impiden desde ese momento que un alumno escriba o mueva trades, dibujos o
-- configuracion del grafico a una sesion que no es suya, y que una sesion
-- tenga como padre una sesion de otro usuario; esta consulta mide si YA hay
-- alguno. Runbook: paso previo OBLIGATORIO a la preparatoria, junto a s11.
-- Ramon la ejecuta y devuelve el resultado completo, que va a
-- revisiones-suite. Si sale algun caso (algun total distinto de 0), se PARA y
-- decide el CTO.
--
-- NO cambia nada: es UNA sola SELECT, sin escrituras ni EXECUTE. Ensayada
-- dentro de una transaccion READ ONLY (pruebas/s12-trades-sesion-ajena.mjs),
-- limpia y con casos plantados. Se pega entera en el editor SQL de Supabase.
-- Acaba en «FIN | s12 | consulta».
--
-- Nada personal: por cada caso solo el id de la fila, la sesion a la que
-- apunta y la fecha. Ni emails, ni nombres, ni importes, ni contenido (config,
-- dibujos), ni el user_id.
--
-- Que trae, por este orden. En «total», un contador por tabla y tipo
-- (<tabla>.usuario_distinto, <tabla>.sesion_inexistente); despues cada caso:
--   sim_trades            el user_id del trade no es el de su sesion, o su
--                         session_id no existe · fecha: closed_at, opened_at
--                         o created_at
--   session_drawings      lo mismo para un dibujo · fecha: updated_at
--   session_chart_config  lo mismo para una configuracion · fecha: updated_at
--   sim_sessions          su challenge_parent_id es de otro usuario o no existe
--                         · fecha: created_at
--   rls                   RLS activa en las cuatro tablas (Astra E1R3-01): sin
--                         ella las politicas de la preparatoria no se aplican.
--                         Si alguna sale rls=false o NO EXISTE, se PARA
-- ============================================================================
with casos as (
  select 'sim_trades' tabla, t.id, t.session_id apunta, coalesce(t.closed_at, t.opened_at, t.created_at) fecha,
         case when s.id is null then 'sesion_inexistente' else 'usuario_distinto' end tipo
    from public.sim_trades t left join public.sim_sessions s on s.id = t.session_id
   where t.session_id is not null and (s.id is null or s.user_id is distinct from t.user_id)
  union all
  select 'session_drawings', d.id, d.session_id, d.updated_at,
         case when s.id is null then 'sesion_inexistente' else 'usuario_distinto' end
    from public.session_drawings d left join public.sim_sessions s on s.id = d.session_id
   where d.session_id is not null and (s.id is null or s.user_id is distinct from d.user_id)
  union all
  select 'session_chart_config', c.id, c.session_id, c.updated_at,
         case when s.id is null then 'sesion_inexistente' else 'usuario_distinto' end
    from public.session_chart_config c left join public.sim_sessions s on s.id = c.session_id
   where c.session_id is not null and (s.id is null or s.user_id is distinct from c.user_id)
  union all
  select 'sim_sessions', h.id, h.challenge_parent_id, h.created_at,
         case when p.id is null then 'sesion_inexistente' else 'usuario_distinto' end
    from public.sim_sessions h left join public.sim_sessions p on p.id = h.challenge_parent_id
   where h.challenge_parent_id is not null and (p.id is null or p.user_id is distinct from h.user_id)
), tipos (o, tabla, tipo) as (
  values (1, 'sim_trades', 'usuario_distinto'), (2, 'sim_trades', 'sesion_inexistente'),
         (3, 'session_drawings', 'usuario_distinto'), (4, 'session_drawings', 'sesion_inexistente'),
         (5, 'session_chart_config', 'usuario_distinto'), (6, 'session_chart_config', 'sesion_inexistente'),
         (7, 'sim_sessions', 'usuario_distinto'), (8, 'sim_sessions', 'sesion_inexistente')
)
select seccion, objeto, detalle from (
  select 0 o, 0 o2, 'hora' seccion, to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC' objeto, version() detalle
  union all
  select 1, t.o, 'total', t.tabla || '.' || t.tipo, (select count(*) from casos c where c.tabla = t.tabla and c.tipo = t.tipo)::text
    from tipos t
  union all
  select 2, t.o, c.tabla || '.' || c.tipo, c.id::text,
         case when c.tabla = 'sim_sessions' then 'padre=' else 'sesion=' end || c.apunta::text
         || ' · fecha=' || coalesce(to_char(c.fecha at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC', '-')
    from casos c join tipos t on t.tabla = c.tabla and t.tipo = c.tipo
  union all
  select 3, v.o, 'rls', v.nombre, coalesce('rls=' || (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || v.nombre)), 'NO EXISTE')
    from (values (1, 'sim_sessions'), (2, 'sim_trades'), (3, 'session_drawings'), (4, 'session_chart_config')) v(o, nombre)
  union all
  select 4, 0, 'FIN', 's12', 'consulta'
) x order by o, o2, objeto collate "C";
