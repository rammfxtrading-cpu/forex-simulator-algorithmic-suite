-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S10 · conciliacion del registro de escrituras v0
--
-- Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md: k.1 e, k.4 d,
-- l.1 c, l.2, m.1, m.3, n.1–n.3, n.7, n.9 y o.0–o.4. Necesita
-- sql/sim-004a-preparatoria.sql aplicada (lee sim_escrituras_v0 y llama a sus
-- funciones sim_escrituras_v0_parejas y sim_escrituras_v0_canonico, que solo
-- ejecuta el dueño: se pega como postgres en el editor).
--
-- NO cambia nada: es UNA sola SELECT, precedida de SET LOCAL search_path (se
-- deshace con el ROLLBACK), DENTRO de una transaccion READ ONLY real
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
-- F8 (bateria de familias, informe 1-036; orden 1-041): pegada sin su BEGIN, el SET LOCAL no hace nada, y un =
-- homonimo con RESTRICT = eqsel se ejecutaba al PLANIFICAR, antes de la guarda. Ahora todo el cuerpo va calificado con
-- pg_catalog (operadores, IN → = any (array[…]), NOT IN → <> all, LIKE → ~~, IS DISTINCT FROM → coalesce, funciones,
-- conversiones, catalogos), como la s16 (GR1-02): no depende del SET LOCAL. Mismo pg_get_viewdef que la de a6bb3a5.
-- ============================================================================
begin read only;
-- S10RO-01: lo primero, el search_path de pg_catalog (LEEME): nada de la consulta resuelve en otro esquema por su nombre
set local search_path = pg_catalog, pg_temp;
with
-- la guarda: falla cerrada si no estamos dentro de la transaccion READ ONLY
guarda as (select case when pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on' then true
                       -- el texto depende de un valor de ejecucion: si fuera constante, PostgreSQL lo convertiria al
                       -- planificar y la guarda saltaria siempre. S10RO-01 (Astra; LEEME «Guardas de las consultas:
                       -- calificadas»): operadores y conversion de pg_catalog, para que un operador homonimo (= o ||)
                       -- en otro esquema del search_path no la haga pasar
                       else ('s10: pegala ENTERA, con su BEGIN READ ONLY y su ROLLBACK (transaction_read_only='
                             OPERATOR(pg_catalog.||) pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.||) ')')::pg_catalog.bool end ok),
sinfirma as (
  select e.* from public.sim_escrituras_v0 e where e.cliente OPERATOR(pg_catalog.=) 'sin-firma' and e.rol_jwt OPERATOR(pg_catalog.=) any (array['authenticated', 'anon'])
), sesiones as (
  select distinct session_id from sinfirma where session_id is not null
), parejas as (
  select s.session_id, p.orden, p.escritura_update, p.escritura_insert
    from sesiones s cross join lateral public.sim_escrituras_v0_parejas(s.session_id) p
), emparejadas as (
  select escritura_update id from parejas union all select escritura_insert from parejas
), clasif as (
  select f.*,
         exists (select 1 from public.sim_escrituras_v0_marcas m where m.escritura_id OPERATOR(pg_catalog.=) f.id) menciona_balance,
         case
           when f.id OPERATOR(pg_catalog.=) any (select id from emparejadas) then 'emparejada'
           when f.tabla OPERATOR(pg_catalog.=) 'sim_sessions' and f.operacion OPERATOR(pg_catalog.=) 'UPDATE' and f.delta OPERATOR(pg_catalog.<>) 0 then 'incidencia: cambio de saldo sin pareja'
           when f.tabla OPERATOR(pg_catalog.=) 'sim_sessions' and f.operacion OPERATOR(pg_catalog.=) 'UPDATE'
                and exists (select 1 from public.sim_escrituras_v0_marcas m where m.escritura_id OPERATOR(pg_catalog.=) f.id) then 'dudoso: delta 0, menciona balance, sin pareja'
           when f.tabla OPERATOR(pg_catalog.=) 'sim_sessions' and f.operacion OPERATOR(pg_catalog.=) 'UPDATE' then 'nada: no menciona balance (m.1)'
           when f.tabla OPERATOR(pg_catalog.=) 'sim_sessions' and f.operacion OPERATOR(pg_catalog.=) 'INSERT' and not coalesce(f.delta OPERATOR(pg_catalog.=) 0, f.delta is null and 0 is null) then 'incidencia: sesion creada con balance distinto de capital'
           when f.tabla OPERATOR(pg_catalog.=) 'sim_sessions' then 'nada'
           when f.tabla OPERATOR(pg_catalog.=) 'sim_trades' and f.operacion OPERATOR(pg_catalog.=) 'INSERT' then 'incidencia: INSERT de trade sin pareja'
           when f.tabla OPERATOR(pg_catalog.=) 'sim_trades' and f.operacion OPERATOR(pg_catalog.=) 'DELETE'
                and not exists (select 1 from public.sim_escrituras_v0 s where s.tabla OPERATOR(pg_catalog.=) 'sim_sessions' and s.operacion OPERATOR(pg_catalog.=) 'DELETE'
                                   and s.session_id OPERATOR(pg_catalog.=) f.session_id and s.xact OPERATOR(pg_catalog.=) f.xact) then 'incidencia: DELETE de trade sin el de su sesion en la misma transaccion'
           when f.tabla OPERATOR(pg_catalog.=) 'sim_trades' and f.operacion OPERATOR(pg_catalog.=) 'UPDATE'
                and exists (select 1 from pg_catalog.unnest(f.columnas) c where c OPERATOR(pg_catalog.<>) all (array['notes', 'tags'])) then 'incidencia: UPDATE de trade con columnas economicas (o.3)'
           else 'nada'
         end clase
    from sinfirma f
), timeout as (
  select r.rolname,
         (select pg_catalog.split_part(c, '=', 2) from pg_catalog.pg_db_role_setting s, pg_catalog.unnest(s.setconfig) c
           where s.setrole OPERATOR(pg_catalog.=) r.oid and s.setdatabase OPERATOR(pg_catalog.=) (select oid from pg_catalog.pg_database where datname OPERATOR(pg_catalog.=) pg_catalog.current_database()) and c OPERATOR(pg_catalog.~~) 'statement_timeout=%') rol_base,
         (select pg_catalog.split_part(c, '=', 2) from pg_catalog.pg_db_role_setting s, pg_catalog.unnest(s.setconfig) c
           where s.setrole OPERATOR(pg_catalog.=) r.oid and s.setdatabase OPERATOR(pg_catalog.=) 0 and c OPERATOR(pg_catalog.~~) 'statement_timeout=%') rol,
         (select pg_catalog.split_part(c, '=', 2) from pg_catalog.pg_db_role_setting s, pg_catalog.unnest(s.setconfig) c
           where s.setrole OPERATOR(pg_catalog.=) 0 and s.setdatabase OPERATOR(pg_catalog.=) (select oid from pg_catalog.pg_database where datname OPERATOR(pg_catalog.=) pg_catalog.current_database()) and c OPERATOR(pg_catalog.~~) 'statement_timeout=%') base,
         (select reset_val OPERATOR(pg_catalog.||) coalesce(unit, '') OPERATOR(pg_catalog.||) ' (fuente ' OPERATOR(pg_catalog.||) source OPERATOR(pg_catalog.||) ', arranque ' OPERATOR(pg_catalog.||) boot_val OPERATOR(pg_catalog.||) coalesce(unit, '') OPERATOR(pg_catalog.||) ')' from pg_catalog.pg_settings where name OPERATOR(pg_catalog.=) 'statement_timeout') servidor
    from pg_catalog.pg_roles r where r.rolname OPERATOR(pg_catalog.=) any (array['authenticated', 'anon', 'authenticator']::pg_catalog.name[])
)
select seccion, objeto, detalle from (
  select 0 o, 0 o2, 'hora' seccion, 'ahora (UTC)' objeto, pg_catalog.to_char(pg_catalog.clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') detalle
  union all select 0, 1, 'hora', 'servidor', pg_catalog.current_setting('server_version')
  union all
  select 1, 0, 'timeout', t.rolname,
         'rol+base=' OPERATOR(pg_catalog.||) coalesce(t.rol_base, '-') OPERATOR(pg_catalog.||) ' · rol=' OPERATOR(pg_catalog.||) coalesce(t.rol, '-') OPERATOR(pg_catalog.||) ' · base=' OPERATOR(pg_catalog.||) coalesce(t.base, '-') OPERATOR(pg_catalog.||) ' · servidor=' OPERATOR(pg_catalog.||) t.servidor
         OPERATOR(pg_catalog.||) ' · MANDA: ' OPERATOR(pg_catalog.||) coalesce(t.rol_base, t.rol, t.base, 'el del servidor')
         OPERATOR(pg_catalog.||) case when coalesce(t.rol_base, t.rol, t.base, (select reset_val from pg_catalog.pg_settings where name OPERATOR(pg_catalog.=) 'statement_timeout')) OPERATOR(pg_catalog.=) any (array['0', '0ms', '0s'])
                 then ' · SIN LIMITE: la regla de 2 × statement_timeout no se puede aplicar; decide el CTO (l.1 c)' else '' end
    from timeout t
  union all
  select 2, 0, 'estado', 'registro',
         case when exists (select 1 from pg_catalog.pg_trigger where tgname OPERATOR(pg_catalog.=) 'sim_escrituras_v0_puerta' and tgrelid OPERATOR(pg_catalog.=) 'public.sim_sessions'::pg_catalog.regclass)
              then 'registro + puerta' else 'registro instalado (puerta NO activa)' end
  union all
  select 2, 1, 'estado', 'filas', 'total=' OPERATOR(pg_catalog.||) pg_catalog.count(*)
         OPERATOR(pg_catalog.||) ' · sin firma de alumno=' OPERATOR(pg_catalog.||) pg_catalog.count(*) filter (where cliente OPERATOR(pg_catalog.=) 'sin-firma' and rol_jwt OPERATOR(pg_catalog.=) any (array['authenticated', 'anon']))
         OPERATOR(pg_catalog.||) ' · firmadas=' OPERATOR(pg_catalog.||) pg_catalog.count(*) filter (where cliente OPERATOR(pg_catalog.<>) 'sin-firma' and rol_jwt OPERATOR(pg_catalog.=) any (array['authenticated', 'anon']))
         OPERATOR(pg_catalog.||) ' · service_role=' OPERATOR(pg_catalog.||) pg_catalog.count(*) filter (where rol_jwt OPERATOR(pg_catalog.=) 'service_role')
         OPERATOR(pg_catalog.||) ' · otras (dueño, SQL directo)=' OPERATOR(pg_catalog.||) pg_catalog.count(*) filter (where rol_jwt is null or rol_jwt OPERATOR(pg_catalog.<>) all (array['authenticated', 'anon', 'service_role']))
         OPERATOR(pg_catalog.||) ' · desde ' OPERATOR(pg_catalog.||) coalesce(pg_catalog.to_char(pg_catalog.min(en) at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS'), '-') OPERATOR(pg_catalog.||) ' UTC'
    from public.sim_escrituras_v0
  union all
  select 3, 0, 'volumen', pg_catalog.to_char(pg_catalog.date_trunc('day', en at time zone 'UTC'), 'YYYY-MM-DD'), pg_catalog.count(*)::pg_catalog.text OPERATOR(pg_catalog.||) ' filas'
    from public.sim_escrituras_v0 group by 2, pg_catalog.date_trunc('day', en at time zone 'UTC')
  union all
  select 4, 0, 'alumno', a.user_id::pg_catalog.text,
         'ultima version firmada=' OPERATOR(pg_catalog.||) coalesce((select e.cliente from public.sim_escrituras_v0 e where e.user_id OPERATOR(pg_catalog.=) a.user_id and e.cliente OPERATOR(pg_catalog.<>) 'sin-firma'
                                                   and e.rol_jwt OPERATOR(pg_catalog.=) any (array['authenticated', 'anon']) order by e.id desc limit 1), '-')
         OPERATOR(pg_catalog.||) ' · sin firma 72 h=' OPERATOR(pg_catalog.||) (select pg_catalog.count(*) from sinfirma f where f.user_id OPERATOR(pg_catalog.=) a.user_id and f.en OPERATOR(pg_catalog.>) (pg_catalog.clock_timestamp() OPERATOR(pg_catalog.-) interval '72 hours'))
         OPERATOR(pg_catalog.||) ' · ultima sin firma=' OPERATOR(pg_catalog.||) coalesce((select pg_catalog.to_char(pg_catalog.max(f.en) at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') from sinfirma f where f.user_id OPERATOR(pg_catalog.=) a.user_id), '-')
    from (select distinct user_id from public.sim_escrituras_v0 where rol_jwt OPERATOR(pg_catalog.=) any (array['authenticated', 'anon']) and user_id is not null) a
  union all
  select 5, p.orden, 'pareja', p.session_id::pg_catalog.text,
         'u=' OPERATOR(pg_catalog.||) p.escritura_update OPERATOR(pg_catalog.||) ' (delta ' OPERATOR(pg_catalog.||) pg_catalog.trim_scale(u.delta) OPERATOR(pg_catalog.||) ') · i=' OPERATOR(pg_catalog.||) p.escritura_insert OPERATOR(pg_catalog.||) ' (pnl ' OPERATOR(pg_catalog.||) pg_catalog.trim_scale(i.pnl) OPERATOR(pg_catalog.||) ')'
         OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) pg_catalog.to_char(pg_catalog.abs(extract(epoch from u.en OPERATOR(pg_catalog.-) i.en)), 'FM990.000') OPERATOR(pg_catalog.||) ' s'
    from parejas p join public.sim_escrituras_v0 u on u.id OPERATOR(pg_catalog.=) p.escritura_update join public.sim_escrituras_v0 i on i.id OPERATOR(pg_catalog.=) p.escritura_insert
  union all
  select case when c.clase OPERATOR(pg_catalog.~~) 'incidencia%' then 6 else 7 end, c.id::pg_catalog.int4,
         case when c.clase OPERATOR(pg_catalog.~~) 'incidencia%' then 'incidencia' else 'dudoso' end, c.id::pg_catalog.text,
         c.clase OPERATOR(pg_catalog.||) ' · sesion=' OPERATOR(pg_catalog.||) coalesce(c.session_id::pg_catalog.text, '-') OPERATOR(pg_catalog.||) ' · alumno=' OPERATOR(pg_catalog.||) coalesce(c.user_id::pg_catalog.text, '-') OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) c.tabla OPERATOR(pg_catalog.||) ' ' OPERATOR(pg_catalog.||) c.operacion
         OPERATOR(pg_catalog.||) ' · delta=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.trim_scale(c.delta)::pg_catalog.text, '-') OPERATOR(pg_catalog.||) ' · pnl=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.trim_scale(c.pnl)::pg_catalog.text, '-')
         OPERATOR(pg_catalog.||) ' · cols=' OPERATOR(pg_catalog.||) pg_catalog.array_to_string(c.columnas, ',') OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) pg_catalog.to_char(c.en at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') OPERATOR(pg_catalog.||) ' UTC'
    from clasif c where c.clase OPERATOR(pg_catalog.~~) 'incidencia%' or c.clase OPERATOR(pg_catalog.~~) 'dudoso%'
  union all
  select 8, e.id::pg_catalog.int4, 'anomalia', e.id::pg_catalog.text,
         'rol_jwt=' OPERATOR(pg_catalog.||) coalesce(e.rol_jwt, 'NULL') OPERATOR(pg_catalog.||) ' ≠ rol_guc=' OPERATOR(pg_catalog.||) coalesce(e.rol_guc, 'NULL') OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) e.tabla OPERATOR(pg_catalog.||) ' ' OPERATOR(pg_catalog.||) e.operacion
         OPERATOR(pg_catalog.||) ' · sesion=' OPERATOR(pg_catalog.||) coalesce(e.session_id::pg_catalog.text, '-') OPERATOR(pg_catalog.||) ' · cliente=' OPERATOR(pg_catalog.||) e.cliente OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) pg_catalog.to_char(e.en at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') OPERATOR(pg_catalog.||) ' UTC'
    from public.sim_escrituras_v0 e where not coalesce(e.rol_jwt OPERATOR(pg_catalog.=) e.rol_guc, e.rol_jwt is null and e.rol_guc is null)
  union all
  select 8, m.id::pg_catalog.int4, 'anomalia', 'marca ' OPERATOR(pg_catalog.||) m.id,
         case when e.id is null then 'marca huerfana (sin su fila de registro ' OPERATOR(pg_catalog.||) m.escritura_id OPERATOR(pg_catalog.||) ')'
              when not coalesce(e.xact OPERATOR(pg_catalog.=) m.xact, e.xact is null and m.xact is null) then 'marca en una transaccion ajena (fila ' OPERATOR(pg_catalog.||) e.id OPERATOR(pg_catalog.||) ')'
              else 'marca duplicada (fila ' OPERATOR(pg_catalog.||) e.id OPERATOR(pg_catalog.||) ')' end
    from public.sim_escrituras_v0_marcas m left join public.sim_escrituras_v0 e on e.id OPERATOR(pg_catalog.=) m.escritura_id
   where e.id is null or not coalesce(e.xact OPERATOR(pg_catalog.=) m.xact, e.xact is null and m.xact is null)
      or (select pg_catalog.count(*) from public.sim_escrituras_v0_marcas m2 where m2.escritura_id OPERATOR(pg_catalog.=) m.escritura_id) OPERATOR(pg_catalog.>) 1
  union all
  select 9, 0, 'foto', s.session_id::pg_catalog.text,
         'ids=' OPERATOR(pg_catalog.||) (select pg_catalog.string_agg(f.id::pg_catalog.text, ',' order by f.id) from sinfirma f where f.session_id OPERATOR(pg_catalog.=) s.session_id)
         OPERATOR(pg_catalog.||) ' · abiertas=' OPERATOR(pg_catalog.||) (select pg_catalog.count(*) from clasif c where c.session_id OPERATOR(pg_catalog.=) s.session_id and (c.clase OPERATOR(pg_catalog.~~) 'incidencia%' or c.clase OPERATOR(pg_catalog.~~) 'dudoso%'))
         OPERATOR(pg_catalog.||) ' · sha256=' OPERATOR(pg_catalog.||) (select k.sha256 from public.sim_escrituras_v0_canonico(s.session_id) k)
    from sesiones s
  union all
  select 10, 0, 'service_role', coalesce(e.user_id::pg_catalog.text, '-'),
         pg_catalog.count(*) OPERATOR(pg_catalog.||) ' escrituras · ' OPERATOR(pg_catalog.||) pg_catalog.string_agg(distinct e.tabla OPERATOR(pg_catalog.||) ' ' OPERATOR(pg_catalog.||) e.operacion, ', ') OPERATOR(pg_catalog.||) ' · ultima '
         OPERATOR(pg_catalog.||) pg_catalog.to_char(pg_catalog.max(e.en) at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') OPERATOR(pg_catalog.||) ' UTC'
    from public.sim_escrituras_v0 e where e.rol_jwt OPERATOR(pg_catalog.=) 'service_role' group by e.user_id
  union all
  select 11, 0, 'FIN', 's10', 'consulta'
) x where (select g.ok from guarda g) order by o, objeto, o2;
rollback;
