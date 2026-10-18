-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S16p · ¿esta aplicada la puerta (sql/sim-004a-puerta.sql)? (orden 1-027, D3)
--
-- sql/APLICADOS.md no apunta la puerta y la s16 esperada cambia con ella (estado 1 o 2): esto lo mide en vez de
-- suponerlo. Trae:
--   1 funcion     public.sim_escrituras_v0_puerta(): si existe, el sha256 de su cuerpo y si es el de sim-004a-puerta
--   2 disparador  cada disparador sim_escrituras_v0_puerta de public, con su tabla y si esta activo (tgenabled)
--   3 veredicto   APLICADA (la funcion con su cuerpo y sus 2 disparadores, en sim_sessions y sim_trades, activos),
--                 SIN APLICAR (ni funcion ni disparadores) o A MEDIAS (cualquier otra cosa: PARAR, decide el CTO)
--
-- NO cambia nada: una sola SELECT de catalogo, sin escrituras ni EXECUTE ni set_config, DENTRO de una transaccion
-- READ ONLY real (regla del LEEME del buzon, 18-oct). Si se pega por partes, o el editor la ejecuta fuera de esa
-- transaccion, la guarda la hace fallar cerrada con el mensaje «s16p: pegala ENTERA…», sin dar datos. Ningun dato de
-- alumnos. Ensayada (pruebas/s16p-puerta-aplicada.mjs). Ramon la pega ENTERA en el editor SQL de Supabase cuando el CTO
-- la pida. Acaba en «FIN | s16p | consulta».
-- ============================================================================
begin read only;
with
-- la guarda: falla cerrada si no estamos dentro de la transaccion READ ONLY
guarda as (select case when pg_catalog.current_setting('transaction_read_only') = 'on' then true
                       -- el texto depende de un valor de ejecucion: si fuera constante, PostgreSQL lo convertiria al
                       -- planificar y la guarda saltaria siempre
                       else ('s16p: pegala ENTERA, con su BEGIN READ ONLY y su ROLLBACK (transaction_read_only='
                             || pg_catalog.current_setting('transaction_read_only') || ')')::boolean end ok),
fn as (select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc, 'UTF8')), 'hex') sha
         from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.sim_escrituras_v0_puerta()')),
trg as (select c.relname tabla, t.tgenabled::text activo
          from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid
         where c.relnamespace = 'public'::pg_catalog.regnamespace and t.tgname = 'sim_escrituras_v0_puerta' and not t.tgisinternal),
filas as (
  select 1 o, 'funcion' seccion, 'public.sim_escrituras_v0_puerta()' objeto,
         coalesce((select 'existe · cuerpo sha256=' || f.sha
                          || case when f.sha = 'fe4c7c32b146e7d525665760047af0ad49d85d2dc538e1afcf3b080a9f305883'
                                  then ' (el de sim-004a-puerta)' else ' (OTRO cuerpo)' end from fn f), 'no existe') detalle
  union all
  select 2, 'disparador', 'public.' || t.tabla || '.sim_escrituras_v0_puerta', 'tgenabled=' || t.activo from trg t
  union all
  select 3, 'veredicto', 'puerta',
         case when (select count(*) from fn) = 1
                   and (select f.sha from fn f) = 'fe4c7c32b146e7d525665760047af0ad49d85d2dc538e1afcf3b080a9f305883'
                   and (select count(*) from trg) = 2
                   and (select count(*) from trg t where t.tabla in ('sim_sessions', 'sim_trades') and t.activo = 'O') = 2
              then 'APLICADA'
              when (select count(*) from fn) = 0 and (select count(*) from trg) = 0 then 'SIN APLICAR'
              else 'A MEDIAS: PARAR (decide el CTO)' end
  union all
  select 4, 'FIN', 's16p', 'consulta')
select seccion, objeto, detalle from filas
 where (select g.ok from guarda g)
 order by o, objeto collate "C";
rollback;
