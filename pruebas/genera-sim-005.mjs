// node pruebas/genera-sim-005.mjs → reescribe sql/sim-005-progreso-monotono.sql y sql/sim-005-vuelta-atras.sql
// (SIMGOTO3-01 y 05, orden 1-090 del CTO). El BLOQUE y ORIGEN de la canonica v4 (revisiones-suite/guardas/contexto.mjs),
// tal cual; lo esperado de produccion, ⟦HUECO s-contexto v4⟧ hasta medirlo con sql/consultas/s-contexto-sim.sql (la
// genera este mismo script, con la misma lista de tablas). NO editar los .sql a mano: cambiar aqui y regenerar.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CC = await import(pathToFileURL('/Users/principal/Desktop/revisiones-suite/guardas/contexto.mjs').href)
const HUECO = '⟦HUECO s-contexto v4⟧'

// el cierre de tablas de la canonica v4 (FALTAN), medido en el montaje de produccion del simulador (s04 + sim-002/003/
// 004a/puerta/004b): sim_sessions, sus hijas en cascada, las que nombran las funciones de sus disparadores y politicas
// y, por profiles (enforce_sim_session_limit), sus hijas. En produccion puede haber mas: la s-contexto-sim lo dice
// (fila «cierre») y entonces se añaden aqui
export const TABLAS = ['public.sim_sessions', 'public.profiles', 'public.session_chart_config', 'public.session_drawings', 'public.sim_arrendamientos',
  'public.sim_escrituras_v0', 'public.sim_escrituras_v0_marcas', 'public.sim_eventos', 'public.sim_recibos', 'public.sim_trades',
  'public.ia_alertas', 'public.ia_borrados', 'public.ia_consentimiento', 'public.ia_conversaciones', 'public.ia_notas_mentor', 'public.ia_operaciones',
  'public.ia_perfil_alumno', 'public.ia_recados', 'public.ia_turnos', 'public.ia_uso', 'public.macro_conversaciones', 'public.macro_ia_uso',
  'public.macro_planes', 'public.notas', 'public.sim_alumnos', 'public.trades']

export const FUNCION = 'public.sim_sessions_progreso_monotono()'
export const CUERPO = `
BEGIN
  -- sim-005 (SIMGOTO3-01, orden 1-090): last_timestamp nunca baja, venga de donde venga la escritura (el cierre
  -- atomico, el guardado del progreso o cualquier otro UPDATE). NULL tampoco borra un progreso ya guardado
  IF OLD.last_timestamp IS NOT NULL AND (NEW.last_timestamp IS NULL OR NEW.last_timestamp OPERATOR(pg_catalog.<) OLD.last_timestamp) THEN
    NEW.last_timestamp := OLD.last_timestamp;
  END IF;
  RETURN NEW;
END
`
export const DISPARADOR = 'CREATE TRIGGER sim_sessions_progreso_monotono BEFORE UPDATE OF last_timestamp ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION public.sim_sessions_progreso_monotono()'

const lista = (nombre) => `  ${nombre} constant pg_catalog.text[] := ARRAY[\n${TABLAS.map(t => `    ARRAY['${t}', '${HUECO}']`).join(',\n')}\n  ];\n`
const DECLARE = (prefijo) => `DECLARE
  -- CONTEXTO COMPLETO (revisiones-suite/guardas/contexto.mjs ${CC.VERSION}): lo esperado, ${HUECO} hasta medirlo en produccion
  -- (sql/consultas/s-contexto-sim.sql); el destino, el de produccion con solo lo que cambia esta migracion
  CC_PREFIJO constant pg_catalog.text := '${prefijo}';
  CC_FUNCIONES constant pg_catalog.text[] := '{}';
  CC_GRAFO constant pg_catalog.text := '${HUECO}';
${lista('CC_DISP_PARTIDA')}${lista('CC_DISP_DESTINO')}  CC_DISPARADORES pg_catalog.text[];
  CUERPO constant pg_catalog.text := $c$${CUERPO}$c$;
  DISPARADOR constant pg_catalog.text := '${DISPARADOR}';
  hay_f pg_catalog.int4;
  hay_t pg_catalog.int4;
  f_ok pg_catalog.bool;
  t_ok pg_catalog.bool;
  estado pg_catalog.text;`

// en que estado esta: partida (ni la funcion ni el disparador) o destino (los dos, exactos); otra cosa, PARA
const ESTADO = (prefijo) => `  -- 01 · en que estado esta (lo demas lo decide el contexto completo)
  SELECT pg_catalog.count(*)::pg_catalog.int4, pg_catalog.bool_and(p.prosrc OPERATOR(pg_catalog.=) CUERPO AND NOT p.prosecdef
           AND p.provolatile OPERATOR(pg_catalog.=) 'v' AND p.proconfig OPERATOR(pg_catalog.=) ARRAY['search_path=""']::pg_catalog.text[]
           AND p.prorettype OPERATOR(pg_catalog.=) 'pg_catalog.trigger'::pg_catalog.regtype AND p.pronargs OPERATOR(pg_catalog.=) 0)
    INTO hay_f, f_ok
    FROM pg_catalog.pg_proc p
   WHERE p.proname OPERATOR(pg_catalog.=) 'sim_sessions_progreso_monotono' AND p.pronamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace;
  SELECT pg_catalog.count(*)::pg_catalog.int4, pg_catalog.bool_and(pg_catalog.pg_get_triggerdef(t.oid) OPERATOR(pg_catalog.=) DISPARADOR AND t.tgenabled OPERATOR(pg_catalog.=) 'O')
    INTO hay_t, t_ok
    FROM pg_catalog.pg_trigger t
   WHERE t.tgname OPERATOR(pg_catalog.=) 'sim_sessions_progreso_monotono' AND t.tgrelid OPERATOR(pg_catalog.=) 'public.sim_sessions'::pg_catalog.regclass;
  IF hay_f OPERATOR(pg_catalog.=) 0 AND hay_t OPERATOR(pg_catalog.=) 0 THEN estado := 'partida';
  ELSIF hay_f OPERATOR(pg_catalog.=) 1 AND f_ok AND hay_t OPERATOR(pg_catalog.=) 1 AND t_ok THEN estado := 'destino';
  ELSE
    RAISE EXCEPTION '${prefijo}-01: ni partida ni destino (funcion: % %, disparador: % %). Nada cambiado; avisar al CTO', hay_f, f_ok, hay_t, t_ok;
  END IF;`

const GUARDA = (prefijo) => `  -- 00 · la guarda: el contexto de resolucion, lo primero
  IF pg_catalog.current_setting('search_path') OPERATOR(pg_catalog.<>) 'pg_catalog, pg_temp' THEN
    RAISE EXCEPTION '${prefijo}-00: el search_path no es «pg_catalog, pg_temp»: pegala ENTERA, con su BEGIN. Nada aplicado';
  END IF;`

const CABECERA = (titulo, cuerpo) => `-- ============================================================================
-- ${titulo}
${cuerpo.map(l => '-- ' + l).join('\n')}
-- ⛔ NO se aplica por el buzon: la aplica Ramon con el OK del CTO, despues de Astra.
-- GENERADA por pruebas/genera-sim-005.mjs: NO editar a mano.
-- ============================================================================
`

export const migracion = CABECERA('sim-005 · last_timestamp NO RETROCEDE, venga de donde venga (SIMGOTO3-01 y 05, Astra; orden 1-090 del CTO)', [
  'Un disparador BEFORE UPDATE OF last_timestamp en public.sim_sessions: si la fila ya tiene last_timestamp y el UPDATE',
  'lo baja (o lo pone a NULL), se queda el que tenia. Cubre el cierre atomico (sim_cierre_v0), el guardado del progreso',
  'del cliente y cualquier UPDATE ordinario. No cambia sim_cierre_v0 ni nada mas. Sustituye a la sim-005 de 79eeb8d (un',
  'GREATEST dentro de sim_cierre_v0: no cubria el UPDATE ordinario, SIMGOTO3-01), que no se llego a aplicar.',
  '  funcion   public.sim_sessions_progreso_monotono() RETURNS trigger, plpgsql, INVOKER, VOLATILE, search_path vacio,',
  '            sin EXECUTE para nadie mas que su dueño (como las de sim-004a)',
  '  disparador sim_sessions_progreso_monotono BEFORE UPDATE OF last_timestamp FOR EACH ROW',
  'CONTEXTO COMPLETO (canonica v4, CTO 1-071/1-081): el BLOQUE de revisiones-suite/guardas/contexto.mjs, tal cual, en la',
  'guarda (antes del «ya estaba hecho») y en la comprobacion final; ORIGEN justo antes de cada escritura. Lo esperado',
  '(grafo y fichas de las tablas del cierre) es ⟦HUECO s-contexto v4⟧ hasta medirlo en produccion con',
  'sql/consultas/s-contexto-sim.sql: con el hueco, PARA siempre (S005-CC) sin tocar nada. Las pruebas ponen lo del montaje',
  '(pruebas/sim-005.mjs). Atomica, idempotente, guarda primero; errores S005-NN. Vuelta atras: sql/sim-005-vuelta-atras.sql.',
  '⚠️ Tras aplicarla, el inventario de sim-004b y la s16 veran un disparador mas en sim_sessions: su esperado se actualiza',
  'en la misma hoja.',
])
+ `begin;
set local search_path = pg_catalog, pg_temp;
set local lock_timeout = '5s';
DO $sim005$
${DECLARE('S005')}
BEGIN
${GUARDA('S005')}
${ESTADO('S005')}
  -- 02 · el contexto completo, ANTES del «ya estaba hecho»
  CC_DISPARADORES := CASE estado WHEN 'destino' THEN CC_DISP_DESTINO ELSE CC_DISP_PARTIDA END;
${CC.BLOQUE}
  IF estado OPERATOR(pg_catalog.=) 'destino' THEN
    RAISE NOTICE 'S005: ya aplicada; no se cambia nada';
  ELSE
    -- 03 · la funcion y el disparador
${CC.ORIGEN}
    EXECUTE pg_catalog.format('CREATE FUNCTION public.sim_sessions_progreso_monotono() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '''' AS %L', CUERPO);
${CC.ORIGEN}
    REVOKE ALL ON FUNCTION public.sim_sessions_progreso_monotono() FROM PUBLIC, anon, authenticated, service_role;
${CC.ORIGEN}
    EXECUTE DISPARADOR;
  END IF;
  -- 04 · la comprobacion final: lo mismo que el «ya estaba hecho», y el contexto completo del destino
  hay_f := NULL; hay_t := NULL; f_ok := NULL; t_ok := NULL;
  SELECT pg_catalog.count(*)::pg_catalog.int4, pg_catalog.bool_and(p.prosrc OPERATOR(pg_catalog.=) CUERPO AND NOT p.prosecdef
           AND p.provolatile OPERATOR(pg_catalog.=) 'v' AND p.proconfig OPERATOR(pg_catalog.=) ARRAY['search_path=""']::pg_catalog.text[])
    INTO hay_f, f_ok FROM pg_catalog.pg_proc p
   WHERE p.proname OPERATOR(pg_catalog.=) 'sim_sessions_progreso_monotono' AND p.pronamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace;
  SELECT pg_catalog.count(*)::pg_catalog.int4, pg_catalog.bool_and(pg_catalog.pg_get_triggerdef(t.oid) OPERATOR(pg_catalog.=) DISPARADOR AND t.tgenabled OPERATOR(pg_catalog.=) 'O')
    INTO hay_t, t_ok FROM pg_catalog.pg_trigger t
   WHERE t.tgname OPERATOR(pg_catalog.=) 'sim_sessions_progreso_monotono' AND t.tgrelid OPERATOR(pg_catalog.=) 'public.sim_sessions'::pg_catalog.regclass;
  IF NOT (hay_f OPERATOR(pg_catalog.=) 1 AND f_ok AND hay_t OPERATOR(pg_catalog.=) 1 AND t_ok) THEN
    RAISE EXCEPTION 'S005-04: no quedo con la definicion de destino. Nada aplicado';
  END IF;
  CC_DISPARADORES := CC_DISP_DESTINO;
${CC.BLOQUE}
END
$sim005$;
select 'FIN' fin, 'sim-005 aplicada (sim_sessions_progreso_monotono)' estado;
commit;
`

export const vuelta = CABECERA('sim-005 · VUELTA ATRAS: quita el disparador sim_sessions_progreso_monotono y su funcion', [
  'Solo si estan con la definicion de la sim-005 (o ya no estan: idempotente); con otra, PARA (V005-01) y no quita nada.',
  'Mismo contexto completo que la sim-005 y con los mismos nombres (partida = sin el disparador; destino = con el). Atomica.',
  'Errores V005-NN.',
  'Tras quitarla, last_timestamp puede volver a bajar (SIMGOTO3-01): el cliente sigue sin bajarlo (lib/sim/progreso.js).',
])
+ `begin;
set local search_path = pg_catalog, pg_temp;
set local lock_timeout = '5s';
DO $v005$
${DECLARE('V005')}
BEGIN
${GUARDA('V005')}
${ESTADO('V005')}
  -- 02 · el contexto completo, ANTES de quitar nada (aqui la «partida» de la vuelta es el destino de la sim-005)
  CC_DISPARADORES := CASE estado WHEN 'destino' THEN CC_DISP_DESTINO ELSE CC_DISP_PARTIDA END;
${CC.BLOQUE}
  IF estado OPERATOR(pg_catalog.=) 'partida' THEN
    RAISE NOTICE 'V005: no esta aplicada; no se cambia nada';
  ELSE
${CC.ORIGEN}
    DROP TRIGGER sim_sessions_progreso_monotono ON public.sim_sessions;
${CC.ORIGEN}
    DROP FUNCTION public.sim_sessions_progreso_monotono();
  END IF;
  IF EXISTS (SELECT FROM pg_catalog.pg_trigger t WHERE t.tgname OPERATOR(pg_catalog.=) 'sim_sessions_progreso_monotono' AND t.tgrelid OPERATOR(pg_catalog.=) 'public.sim_sessions'::pg_catalog.regclass)
     OR EXISTS (SELECT FROM pg_catalog.pg_proc p WHERE p.proname OPERATOR(pg_catalog.=) 'sim_sessions_progreso_monotono' AND p.pronamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace) THEN
    RAISE EXCEPTION 'V005-04: no quedo sin el disparador y su funcion. Nada cambiado';
  END IF;
  CC_DISPARADORES := CC_DISP_PARTIDA;
${CC.BLOQUE}
END
$v005$;
select 'FIN' fin, 'sim-005 retirada (sin sim_sessions_progreso_monotono)' estado;
commit;
`

const cab = `-- ============================================================================
-- CONSULTA s-contexto-sim (contexto completo ${CC.VERSION}) — lo que espera la sim-005 (sql/sim-005-progreso-monotono.sql),
-- MEDIDO en produccion: el grafo de roles, la ficha entera de cada tabla de su cierre (las de pruebas/genera-sim-005.mjs),
-- lo que falta declarar (fila «cierre»: tiene que salir vacia; si no, sus fichas en «tabla+») y una cuenta de huerfanos por FK.
-- Generada por pruebas/genera-sim-005.mjs con revisiones-suite/guardas/contexto.mjs (sContexto): NO EDITAR A MANO.
-- ⛔ SOLO LECTURA. Del catalogo, todo; de los datos, solo una CUENTA por FK (ni un id, ni un email).
-- ⭐ Se pega ENTERA, de una vez, en el editor de Supabase. La PRIMERA fila es la «envoltura»
--    («READ ONLY · lock_timeout 2s · statement_timeout 30s») y la ULTIMA, «FIN». Exportar a CSV y pasarlo a la ventana 1.
-- ============================================================================
`
export const consulta = CC.sContexto([], TABLAS, cab)
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
writeFileSync(path.join(REPO, 'sql/sim-005-progreso-monotono.sql'), migracion)
writeFileSync(path.join(REPO, 'sql/sim-005-vuelta-atras.sql'), vuelta)
writeFileSync(path.join(REPO, 'sql/consultas/s-contexto-sim.sql'), consulta)
console.log('sim-005, su vuelta atras y s-contexto-sim, generadas')
}
