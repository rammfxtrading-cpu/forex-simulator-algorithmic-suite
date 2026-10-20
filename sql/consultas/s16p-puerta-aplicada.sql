-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S16p · ¿esta aplicada la puerta (sql/sim-004a-puerta.sql)? (orden 1-027, D3; S16RO-01,
-- orden 1-031)
--
-- sql/APLICADOS.md no apuntaba la puerta y la s16 esperada cambia con ella (estado 1 o 2): esto lo mide en vez de
-- suponerlo. Trae:
--   1 funcion     public.sim_escrituras_v0_puerta(): si existe, el sha256 de su cuerpo y su ficha (lenguaje, SECURITY,
--                 volatilidad, proconfig, retorno, argumentos, dueño = quien la ejecuta) y quien puede ejecutarla
--   2 disparador  cada disparador sim_escrituras_v0_puerta de public, con su tabla y lo que de verdad hace: la funcion a
--                 la que llama, el tipo (BEFORE, FOR EACH ROW, INSERT, UPDATE y DELETE: tgtype 31), sin WHEN, sin
--                 columnas, sin argumentos, no interno ni de restriccion, y activo (tgenabled O)
--   3 veredicto   APLICADA (la funcion con su cuerpo y su ficha exactos, y los 2 disparadores, en sim_sessions y
--                 sim_trades, EXACTOS y llamandola a ella), SIN APLICAR (ni funcion ni disparadores) o A MEDIAS
--                 (cualquier otra cosa: PARAR, decide el CTO)
-- S16RO-01 (Astra, 18-oct): antes solo miraba el nombre del disparador y el cuerpo de la funcion, y daba APLICADA con un
-- disparador del mismo nombre que llamaba a otra funcion, solo con INSERT, con WHEN(false), AFTER o FOR EACH STATEMENT,
-- o con la funcion SECURITY DEFINER o con otro search_path. Ahora cada una de esas da A MEDIAS. Se mide por los
-- campos del catalogo (tgfoid, tgtype, tgqual…), no por el texto, que depende del search_path del editor.
--
-- GR1-01 (Astra, 18-oct; regresion de RG-02): con la busqueda en cualquier esquema, contaba la pareja por el NOMBRE de
-- la tabla, y una tabla TEMPORAL llamada sim_sessions con su disparador exacto pasaba por la de public (y salia
-- impresa como «public.»). Ahora la pareja se acredita por tgrelid = la tabla de public (to_regclass), y cada
-- disparador sale con su esquema y su tabla reales; los de otras tablas que llamen a la puerta siguen en el
-- inventario para rechazarlos.
--
-- ALCANCE (RG-01 del revisor interno): acredita que los objetos de la puerta son exactos, no que bloquee. Otros
-- disparadores de las mismas tablas, hijas por herencia o reglas podrian rodearla: eso lo inventaria la s16 completa,
-- que es la que acredita la puerta (orden 1-031 del CTO).
--
-- NO cambia nada: una sola SELECT de catalogo, precedida de SET LOCAL search_path (se deshace con el ROLLBACK), sin
-- escrituras ni EXECUTE ni set_config, DENTRO de una transaccion
-- READ ONLY real (regla del LEEME del buzon, 18-oct). Si se pega por partes, o el editor la ejecuta fuera de esa
-- transaccion, la guarda la hace fallar cerrada con el mensaje «s16p: pegala ENTERA…», sin dar datos. Ningun dato de
-- alumnos. Ensayada (pruebas/s16p-puerta-aplicada.mjs). Ramon la pega ENTERA en el editor SQL de Supabase cuando el CTO
-- la pida. Acaba en «FIN | s16p | consulta».
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
                       else ('s16p: pegala ENTERA, con su BEGIN READ ONLY y su ROLLBACK (transaction_read_only='
                             OPERATOR(pg_catalog.||) pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.||) ')')::pg_catalog.bool end ok),
fn as (select p.oid,
              pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc, 'UTF8')), 'hex') sha,
              -- la ficha, como la escribe sim-004a-puerta: plpgsql, INVOKER, VOLATILE, search_path vacio, devuelve
              -- trigger, sin argumentos, y su dueño es quien la ejecuta (en el editor, postgres)
              l.lanname OPERATOR(pg_catalog.||) '|definer=' OPERATOR(pg_catalog.||) p.prosecdef::pg_catalog.text OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) p.provolatile::pg_catalog.text
              OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) coalesce(pg_catalog.array_to_string(p.proconfig, ','), '-')
              OPERATOR(pg_catalog.||) '|ret=' OPERATOR(pg_catalog.||) pg_catalog.format_type(p.prorettype, null) OPERATOR(pg_catalog.||) '|args=' OPERATOR(pg_catalog.||) p.pronargs::pg_catalog.text
              OPERATOR(pg_catalog.||) '|dueño=' OPERATOR(pg_catalog.||) case when p.proowner OPERATOR(pg_catalog.=) (select r.oid from pg_catalog.pg_roles r where r.rolname OPERATOR(pg_catalog.=) current_user)
                                   then 'ejecutor' else pg_catalog.pg_get_userbyid(p.proowner) end ficha,
              -- quien puede ejecutarla, aparte del dueño (un disparador no necesita EXECUTE: lo esperado es nadie)
              coalesce((select pg_catalog.string_agg(case when a.grantee OPERATOR(pg_catalog.=) 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end, ',' order by a.grantee)
                          from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
                         where a.privilege_type OPERATOR(pg_catalog.=) 'EXECUTE' and a.grantee OPERATOR(pg_catalog.<>) p.proowner), 'nadie') ejecutan
         from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid OPERATOR(pg_catalog.=) p.prolang
        where p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_escrituras_v0_puerta()')),
-- GR1-01: las dos tablas de public por su oid (to_regclass no falla si no estan: NULL, y nada casa con NULL)
pareja as (select pg_catalog.to_regclass('public.sim_sessions') ses, pg_catalog.to_regclass('public.sim_trades') tra),
trg as (select n.nspname::pg_catalog.text OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) c.relname::pg_catalog.text tabla, t.tgrelid,
               -- lo que el disparador hace de verdad, por los campos del catalogo
               case when t.tgfoid OPERATOR(pg_catalog.=) (select f.oid from fn f) then 'llama a la puerta'
                    else 'llama a OTRA funcion: ' OPERATOR(pg_catalog.||) t.tgfoid::pg_catalog.regprocedure::pg_catalog.text end
               OPERATOR(pg_catalog.||) ' · tgtype=' OPERATOR(pg_catalog.||) t.tgtype::pg_catalog.text
               OPERATOR(pg_catalog.||) ' · when=' OPERATOR(pg_catalog.||) case when t.tgqual is null then 'no' else 'SI' end
               OPERATOR(pg_catalog.||) ' · columnas=' OPERATOR(pg_catalog.||) case when t.tgattr OPERATOR(pg_catalog.=) ''::pg_catalog.int2vector then 'ninguna' else t.tgattr::pg_catalog.text end
               OPERATOR(pg_catalog.||) ' · args=' OPERATOR(pg_catalog.||) t.tgnargs::pg_catalog.text
               OPERATOR(pg_catalog.||) ' · interno=' OPERATOR(pg_catalog.||) t.tgisinternal::pg_catalog.text
               OPERATOR(pg_catalog.||) ' · restriccion=' OPERATOR(pg_catalog.||) (t.tgconstraint OPERATOR(pg_catalog.<>) 0)::pg_catalog.text
               OPERATOR(pg_catalog.||) ' · tgenabled=' OPERATOR(pg_catalog.||) t.tgenabled::pg_catalog.text detalle,
               t.tgname OPERATOR(pg_catalog.=) 'sim_escrituras_v0_puerta' and t.tgfoid OPERATOR(pg_catalog.=) (select f.oid from fn f) and t.tgtype OPERATOR(pg_catalog.=) 31 and t.tgqual is null
               and t.tgattr OPERATOR(pg_catalog.=) ''::pg_catalog.int2vector and t.tgnargs OPERATOR(pg_catalog.=) 0 and not t.tgisinternal and t.tgconstraint OPERATOR(pg_catalog.=) 0
               and t.tgenabled OPERATOR(pg_catalog.=) 'O'
               -- GR1-01: y en una de las DOS tablas de public, por su oid, no por su nombre
               and (t.tgrelid OPERATOR(pg_catalog.=) (select pa.ses from pareja pa) or t.tgrelid OPERATOR(pg_catalog.=) (select pa.tra from pareja pa)) exacto
          from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid OPERATOR(pg_catalog.=) t.tgrelid
               join pg_catalog.pg_namespace n on n.oid OPERATOR(pg_catalog.=) c.relnamespace
         -- por su nombre en public, y tambien cualquier otro disparador, de CUALQUIER esquema, que llame a la funcion de
         -- la puerta (RG-02 del revisor interno)
         where (c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and t.tgname OPERATOR(pg_catalog.=) 'sim_escrituras_v0_puerta')
            or t.tgfoid OPERATOR(pg_catalog.=) (select f.oid from fn f)),
fn_bien as (select coalesce((select f.sha OPERATOR(pg_catalog.=) 'fe4c7c32b146e7d525665760047af0ad49d85d2dc538e1afcf3b080a9f305883'
                                    and f.ficha OPERATOR(pg_catalog.=) 'plpgsql|definer=false|v|search_path=""|ret=trigger|args=0|dueño=ejecutor'
                                    and f.ejecutan OPERATOR(pg_catalog.=) 'nadie' from fn f), false) ok),
filas as (
  select 1 o, 'funcion' seccion, 'public.sim_escrituras_v0_puerta()' objeto,
         coalesce((select 'existe · cuerpo sha256=' OPERATOR(pg_catalog.||) f.sha
                          OPERATOR(pg_catalog.||) case when f.sha OPERATOR(pg_catalog.=) 'fe4c7c32b146e7d525665760047af0ad49d85d2dc538e1afcf3b080a9f305883'
                                  then ' (el de sim-004a-puerta)' else ' (OTRO cuerpo)' end
                          OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) f.ficha OPERATOR(pg_catalog.||) ' · la ejecutan ademas del dueño: ' OPERATOR(pg_catalog.||) f.ejecutan
                          OPERATOR(pg_catalog.||) case when (select b.ok from fn_bien b) then ' · exacta' else ' · NO es la de sim-004a-puerta' end
                     from fn f), 'no existe') detalle
  union all
  -- GR1-01: el esquema y la tabla reales (una temporal sale como pg_temp_N.sim_sessions, no como public)
  select 2, 'disparador', t.tabla OPERATOR(pg_catalog.||) '.sim_escrituras_v0_puerta',
         t.detalle OPERATOR(pg_catalog.||) case when t.exacto then ' · exacto' else ' · NO es el de sim-004a-puerta' end from trg t
  union all
  select 3, 'veredicto', 'puerta',
         case when (select b.ok from fn_bien b)
                   and (select pg_catalog.count(*) from trg) OPERATOR(pg_catalog.=) 2
                   -- GR1-01: los dos exactos, uno en cada tabla de public, por su oid
                   and (select pg_catalog.count(*) from trg t where t.exacto and t.tgrelid OPERATOR(pg_catalog.=) (select pa.ses from pareja pa)) OPERATOR(pg_catalog.=) 1
                   and (select pg_catalog.count(*) from trg t where t.exacto and t.tgrelid OPERATOR(pg_catalog.=) (select pa.tra from pareja pa)) OPERATOR(pg_catalog.=) 1
              then 'APLICADA (los objetos de sim-004a-puerta, exactos; que bloquee lo acredita la s16 completa)'
              when (select pg_catalog.count(*) from fn) OPERATOR(pg_catalog.=) 0 and (select pg_catalog.count(*) from trg) OPERATOR(pg_catalog.=) 0 then 'SIN APLICAR'
              else 'A MEDIAS: PARAR (decide el CTO)' end
  union all
  select 4, 'FIN', 's16p', 'consulta')
select seccion, objeto, detalle from filas
 where (select g.ok from guarda g)
 order by o, objeto collate pg_catalog."C";
rollback;
