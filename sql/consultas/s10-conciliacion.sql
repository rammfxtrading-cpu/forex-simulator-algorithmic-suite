-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S10 · conciliacion del registro de escrituras v0
--
-- Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md: k.1 e, k.4 d,
-- l.1 c, l.2, m.1, m.3, n.1–n.3, n.7, n.9 y o.0–o.4. Necesita
-- sql/sim-004a-preparatoria.sql aplicada (lee sim_escrituras_v0 y llama a sus
-- funciones sim_escrituras_v0_parejas y sim_escrituras_v0_canonico, que solo
-- ejecuta el dueño: se pega como postgres en el editor).
--
-- NO cambia nada: es UNA sola SELECT, DENTRO de una transaccion READ ONLY real
-- (regla del LEEME del buzon, 18-oct; orden 1-029): BEGIN READ ONLY al principio
-- y ROLLBACK al final. Si se pega por partes, o el editor la ejecuta fuera de esa
-- transaccion, la guarda la hace fallar cerrada con el mensaje «s10: pegala
-- ENTERA…», sin dar datos (como la s16 y la s16h). Ensayada sobre el montaje
-- literal (pruebas/s10-conciliacion.mjs).
-- Se pega entera en el editor SQL de Supabase y se devuelve el resultado
-- COMPLETO: va a revisiones-suite tal cual. Acaba en «FIN | s10 | consulta».
--
-- ⚠️ Trae ids de alumnos y de sesiones e importes (delta, pnl) de las filas que
--    hay que conciliar: es lo que el CTO necesita para resolver. No trae
--    nombres, correos ni el texto de ningun trade.
--
-- «Sin firma de alumno» (k.4 d): rol_jwt ∈ {authenticated, anon} y
-- cliente = 'sin-firma'. Solo esas filas se emparejan y clasifican.
--
-- Que trae, por este orden:
--   0 hora           ahora (UTC) y version del servidor
--   1 timeout        statement_timeout efectivo de authenticated y anon (l.1 c,
--                    paso 3): por rol y base, por rol, por base y del servidor,
--                    con el que manda. 0 = sin limite: la regla de 2 × timeout
--                    no se puede aplicar y decide el CTO.
--   2 estado         registro instalado o registro + puerta; filas por tipo
--   3 volumen        filas por dia (k.3.7, l.6.8)
--   4 alumno         por alumno: ultima version vista (firmada), escrituras sin
--                    firma en las ultimas 72 h y la ultima (m.3 a)
--   5 pareja         el emparejamiento de l.2 / o.4 (por sesion, en orden)
--   6 incidencia     lo que bloquea el corte (l.2, o.2, o.3)
--   7 dudoso         UPDATE sin pareja, delta 0, que menciona balance (m.1)
--   8 anomalia       rol_jwt IS DISTINCT FROM rol_guc (k.4 d); marcas
--                    huerfanas, duplicadas o en una transaccion ajena (n.7, n.9)
--   9 foto           por sesion con filas sin firma de alumno: sus ids y el
--                    sha256 canonico (n.2, o.0). Provisional hasta la foto final
--                    (puerta activa + segunda lectura, n.1)
--  10 service_role   escrituras de servidor, aparte: no cuentan (k.4 d)
-- ============================================================================
begin read only;
with
-- la guarda: falla cerrada si no estamos dentro de la transaccion READ ONLY
guarda as (select case when pg_catalog.current_setting('transaction_read_only') = 'on' then true
                       -- el texto depende de un valor de ejecucion: si fuera constante, PostgreSQL lo convertiria al
                       -- planificar y la guarda saltaria siempre
                       else ('s10: pegala ENTERA, con su BEGIN READ ONLY y su ROLLBACK (transaction_read_only='
                             || pg_catalog.current_setting('transaction_read_only') || ')')::boolean end ok),
sinfirma as (
  select e.* from public.sim_escrituras_v0 e where e.cliente = 'sin-firma' and e.rol_jwt in ('authenticated', 'anon')
), sesiones as (
  select distinct session_id from sinfirma where session_id is not null
), parejas as (
  select s.session_id, p.orden, p.escritura_update, p.escritura_insert
    from sesiones s cross join lateral public.sim_escrituras_v0_parejas(s.session_id) p
), emparejadas as (
  select escritura_update id from parejas union all select escritura_insert from parejas
), clasif as (
  select f.*,
         exists (select 1 from public.sim_escrituras_v0_marcas m where m.escritura_id = f.id) menciona_balance,
         case
           when f.id in (select id from emparejadas) then 'emparejada'
           when f.tabla = 'sim_sessions' and f.operacion = 'UPDATE' and f.delta <> 0 then 'incidencia: cambio de saldo sin pareja'
           when f.tabla = 'sim_sessions' and f.operacion = 'UPDATE'
                and exists (select 1 from public.sim_escrituras_v0_marcas m where m.escritura_id = f.id) then 'dudoso: delta 0, menciona balance, sin pareja'
           when f.tabla = 'sim_sessions' and f.operacion = 'UPDATE' then 'nada: no menciona balance (m.1)'
           when f.tabla = 'sim_sessions' and f.operacion = 'INSERT' and f.delta is distinct from 0 then 'incidencia: sesion creada con balance distinto de capital'
           when f.tabla = 'sim_sessions' then 'nada'
           when f.tabla = 'sim_trades' and f.operacion = 'INSERT' then 'incidencia: INSERT de trade sin pareja'
           when f.tabla = 'sim_trades' and f.operacion = 'DELETE'
                and not exists (select 1 from public.sim_escrituras_v0 s where s.tabla = 'sim_sessions' and s.operacion = 'DELETE'
                                   and s.session_id = f.session_id and s.xact = f.xact) then 'incidencia: DELETE de trade sin el de su sesion en la misma transaccion'
           when f.tabla = 'sim_trades' and f.operacion = 'UPDATE'
                and exists (select 1 from unnest(f.columnas) c where c not in ('notes', 'tags')) then 'incidencia: UPDATE de trade con columnas economicas (o.3)'
           else 'nada'
         end clase
    from sinfirma f
), timeout as (
  select r.rolname,
         (select split_part(c, '=', 2) from pg_db_role_setting s, unnest(s.setconfig) c
           where s.setrole = r.oid and s.setdatabase = (select oid from pg_database where datname = current_database()) and c like 'statement_timeout=%') rol_base,
         (select split_part(c, '=', 2) from pg_db_role_setting s, unnest(s.setconfig) c
           where s.setrole = r.oid and s.setdatabase = 0 and c like 'statement_timeout=%') rol,
         (select split_part(c, '=', 2) from pg_db_role_setting s, unnest(s.setconfig) c
           where s.setrole = 0 and s.setdatabase = (select oid from pg_database where datname = current_database()) and c like 'statement_timeout=%') base,
         (select reset_val || coalesce(unit, '') || ' (fuente ' || source || ', arranque ' || boot_val || coalesce(unit, '') || ')' from pg_settings where name = 'statement_timeout') servidor
    from pg_roles r where r.rolname in ('authenticated', 'anon', 'authenticator')
)
select seccion, objeto, detalle from (
  select 0 o, 0 o2, 'hora' seccion, 'ahora (UTC)' objeto, to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') detalle
  union all select 0, 1, 'hora', 'servidor', current_setting('server_version')
  union all
  select 1, 0, 'timeout', t.rolname,
         'rol+base=' || coalesce(t.rol_base, '-') || ' · rol=' || coalesce(t.rol, '-') || ' · base=' || coalesce(t.base, '-') || ' · servidor=' || t.servidor
         || ' · MANDA: ' || coalesce(t.rol_base, t.rol, t.base, 'el del servidor')
         || case when coalesce(t.rol_base, t.rol, t.base, (select reset_val from pg_settings where name = 'statement_timeout')) in ('0', '0ms', '0s')
                 then ' · SIN LIMITE: la regla de 2 × statement_timeout no se puede aplicar; decide el CTO (l.1 c)' else '' end
    from timeout t
  union all
  select 2, 0, 'estado', 'registro',
         case when exists (select 1 from pg_trigger where tgname = 'sim_escrituras_v0_puerta' and tgrelid = 'public.sim_sessions'::regclass)
              then 'registro + puerta' else 'registro instalado (puerta NO activa)' end
  union all
  select 2, 1, 'estado', 'filas', 'total=' || count(*)
         || ' · sin firma de alumno=' || count(*) filter (where cliente = 'sin-firma' and rol_jwt in ('authenticated', 'anon'))
         || ' · firmadas=' || count(*) filter (where cliente <> 'sin-firma' and rol_jwt in ('authenticated', 'anon'))
         || ' · service_role=' || count(*) filter (where rol_jwt = 'service_role')
         || ' · otras (dueño, SQL directo)=' || count(*) filter (where rol_jwt is null or rol_jwt not in ('authenticated', 'anon', 'service_role'))
         || ' · desde ' || coalesce(to_char(min(en) at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS'), '-') || ' UTC'
    from public.sim_escrituras_v0
  union all
  select 3, 0, 'volumen', to_char(date_trunc('day', en at time zone 'UTC'), 'YYYY-MM-DD'), count(*)::text || ' filas'
    from public.sim_escrituras_v0 group by 2, date_trunc('day', en at time zone 'UTC')
  union all
  select 4, 0, 'alumno', a.user_id::text,
         'ultima version firmada=' || coalesce((select e.cliente from public.sim_escrituras_v0 e where e.user_id = a.user_id and e.cliente <> 'sin-firma'
                                                   and e.rol_jwt in ('authenticated', 'anon') order by e.id desc limit 1), '-')
         || ' · sin firma 72 h=' || (select count(*) from sinfirma f where f.user_id = a.user_id and f.en > clock_timestamp() - interval '72 hours')
         || ' · ultima sin firma=' || coalesce((select to_char(max(f.en) at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') from sinfirma f where f.user_id = a.user_id), '-')
    from (select distinct user_id from public.sim_escrituras_v0 where rol_jwt in ('authenticated', 'anon') and user_id is not null) a
  union all
  select 5, p.orden, 'pareja', p.session_id::text,
         'u=' || p.escritura_update || ' (delta ' || trim_scale(u.delta) || ') · i=' || p.escritura_insert || ' (pnl ' || trim_scale(i.pnl) || ')'
         || ' · ' || to_char(abs(extract(epoch from u.en - i.en)), 'FM990.000') || ' s'
    from parejas p join public.sim_escrituras_v0 u on u.id = p.escritura_update join public.sim_escrituras_v0 i on i.id = p.escritura_insert
  union all
  select case when c.clase like 'incidencia%' then 6 else 7 end, c.id::integer,
         case when c.clase like 'incidencia%' then 'incidencia' else 'dudoso' end, c.id::text,
         c.clase || ' · sesion=' || coalesce(c.session_id::text, '-') || ' · alumno=' || coalesce(c.user_id::text, '-') || ' · ' || c.tabla || ' ' || c.operacion
         || ' · delta=' || coalesce(trim_scale(c.delta)::text, '-') || ' · pnl=' || coalesce(trim_scale(c.pnl)::text, '-')
         || ' · cols=' || array_to_string(c.columnas, ',') || ' · ' || to_char(c.en at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || ' UTC'
    from clasif c where c.clase like 'incidencia%' or c.clase like 'dudoso%'
  union all
  select 8, e.id::integer, 'anomalia', e.id::text,
         'rol_jwt=' || coalesce(e.rol_jwt, 'NULL') || ' ≠ rol_guc=' || coalesce(e.rol_guc, 'NULL') || ' · ' || e.tabla || ' ' || e.operacion
         || ' · sesion=' || coalesce(e.session_id::text, '-') || ' · cliente=' || e.cliente || ' · ' || to_char(e.en at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || ' UTC'
    from public.sim_escrituras_v0 e where e.rol_jwt is distinct from e.rol_guc
  union all
  select 8, m.id::integer, 'anomalia', 'marca ' || m.id,
         case when e.id is null then 'marca huerfana (sin su fila de registro ' || m.escritura_id || ')'
              when e.xact is distinct from m.xact then 'marca en una transaccion ajena (fila ' || e.id || ')'
              else 'marca duplicada (fila ' || e.id || ')' end
    from public.sim_escrituras_v0_marcas m left join public.sim_escrituras_v0 e on e.id = m.escritura_id
   where e.id is null or e.xact is distinct from m.xact
      or (select count(*) from public.sim_escrituras_v0_marcas m2 where m2.escritura_id = m.escritura_id) > 1
  union all
  select 9, 0, 'foto', s.session_id::text,
         'ids=' || (select string_agg(f.id::text, ',' order by f.id) from sinfirma f where f.session_id = s.session_id)
         || ' · abiertas=' || (select count(*) from clasif c where c.session_id = s.session_id and (c.clase like 'incidencia%' or c.clase like 'dudoso%'))
         || ' · sha256=' || (select k.sha256 from public.sim_escrituras_v0_canonico(s.session_id) k)
    from sesiones s
  union all
  select 10, 0, 'service_role', coalesce(e.user_id::text, '-'),
         count(*) || ' escrituras · ' || string_agg(distinct e.tabla || ' ' || e.operacion, ', ') || ' · ultima '
         || to_char(max(e.en) at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC'
    from public.sim_escrituras_v0 e where e.rol_jwt = 'service_role' group by e.user_id
  union all
  select 11, 0, 'FIN', 's10', 'consulta'
) x where (select g.ok from guarda g) order by o, objeto, o2;
rollback;
