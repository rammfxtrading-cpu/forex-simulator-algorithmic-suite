/**
 * SIM-006 · EL TOPE DE LOS AVANCES «PASO» (orden 1-122 del CTO; decision de Ramon y el CTO). Escrita ANTES que la
 * migracion (sql/sim-006-tope-de-pasos.sql y sql/sim-006-vuelta-atras.sql no existen: en rojo).
 *
 * Hoy (sim-004b) sim_comando deja UN avance (avanzar o checkpoint) cada 5 s por alumno, sea cual sea su motivo. Con
 * sim-006, los avanzar con motivo «paso» o «play» (Step y Play) ya no miran los 5 s: su tope es de 10 por segundo y
 * alumno (429 demasiados_pasos, con un mensaje que empieza por «sim-006:»). El resto conserva lo suyo: un avanzar
 * «goto» o un checkpoint, 429 demasiados_avances si hubo un avance del alumno en los ultimos 5 s (un paso sigue
 * contando para eso, como hoy); abrir, modificar, cancelar y cerrar, sin limite (como hoy).
 *
 * PostgreSQL 17 desechable (montaje-v1: s04 literal + sim-002 + sim-003 + preparatoria + sim-004b, como el ejecutor
 * de s06). Las rafagas van en UNA llamada a psql (once sim_comando seguidos, cada uno en su transaccion), para que caigan
 * en el mismo segundo sin depender de lo que tarde el proceso. Datos inventados. Nada toca Supabase.
 *   A · la guarda: con el hueco de la guarda canonica sin rellenar, para sin tocar nada; aplicada, su informe
 *   B · 10 pasos en el mismo segundo pasan y el 11.º da 429 demasiados_pasos sin efectos; paso y play cuentan juntos;
 *       tras un segundo vuelven a pasar; por alumno; un reintento con la misma clave no cuenta
 *   C · los demas como antes: goto y checkpoint con sus 5 s; goto tras un paso, 429; abrir sin limite
 *   D · idempotente (dos veces = lo mismo); sim-004b no se vuelve a ejecutar encima; a medias, para
 *   E · la vuelta atras deja el catalogo y el comportamiento de antes (sim-004b vuelve a acreditarse), dos veces igual
 *   T · ORDEN 1-125 (f): el tope de TAMAÑO. Un avanzar «paso» llega como mucho a 1 minuto de mercado y uno «play» a
 *       LOTE_PLAY_MAX (100; lib/sim/v1/topes.mjs). lib/servidor/comando.mjs corta el calculo ahi (cortado) y lo declara
 *       en resumen.minutos; sim_comando rechaza (422 avance_demasiado_grande, «sim-006: …», sin efectos) un paso o un
 *       play que declare mas, o que no lo declare. El goto y el checkpoint no tienen este tope. Asi un Go to marcado
 *       «paso» ya no se salta los 5 s: avanza 1 minuto
 *   ORDEN 1-127 (g): el paso es UNA VELA CON DATOS, no un minuto: en un hueco o un festivo salta a la siguiente vela con
 *       datos (nunca un minuto vacio) y nunca mas alla. El servidor, que tiene el mercado, corta el paso en la siguiente
 *       vela con datos del par del paso (carga.par, el par visible; sin el, la primera de cualquier par de la sesion) y
 *       declara resumen.velas (las velas con datos que cruzo: 0 o 1). La base, sin calendario, exige velas entre 0 y 1
 *       (y ya no mira los minutos del paso); el play sigue con sus 100 minutos. Un Go to disfrazado de «paso» llega a
 *       la siguiente vela con datos y ahi para: no se salta los 5 s mas alla de una vela.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { titulo, ver, oraculo, fin, importa, REPO, espera } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, L, conUidDelMontaje } from './montaje-v1.mjs'
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'

const N = 36
const F_APLICA = 'sql/sim-006-tope-de-pasos.sql', F_VUELTA = 'sql/sim-006-vuelta-atras.sql'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
if (!existsSync(path.join(REPO, F_APLICA)) || !existsSync(path.join(REPO, F_VUELTA))) {
  for (let i = 0; i < N; i++) oraculo('SIM006', `caso ${i}: sin ${F_APLICA} y ${F_VUELTA} no se puede`, false, 'no estan')
  fin()
}
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }

// el hueco de la guarda canonica: el montaje lo sustituye (exactamente una vez; si no, revienta)
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => {
  if (t.split(HUECO).length !== 2) throw new Error('deEnsayo: el hueco de la guarda canonica no esta exactamente una vez')
  return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (pruebas/sim-006.mjs)';")
}
const S4B = conUidDelMontaje(lee('sql/sim-004b-contrato-v1.sql'))
const APLICA0 = lee(F_APLICA), VUELTA0 = lee(F_VUELTA)
const APLICA = deEnsayo(APLICA0), VUELTA = deEnsayo(VUELTA0)

const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs')
const TO6 = await importa('lib/sim/v1/topes.mjs').catch(() => null)
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const M0 = U('2025-01-06T00:00:00Z'), m = k => M0 + 60 * k
const tx = x => JSON.stringify(x)
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
// orden 1-127 (g): EURUSD sin velas del minuto 1500 al 1509 (un hueco de 10 minutos, menor que el maximo de 15: se valora)
const HUECO_G = t => t >= m(1500) && t < m(1510)
function velas(par) { const o = []; for (let t = M0; t < U('2025-01-09T00:00:00Z'); t += 60) if (!minutoCerrado(t) && !(par === 'EURUSD' && HUECO_G(t))) o.push({ time: t, open: PX[par], high: PX[par], low: PX[par], close: PX[par], volume: 1 }); return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velas(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })

// el cuerpo de sim_comando de sim-004b y el de sim-006: el nuevo es el viejo con SOLO estos cambios
const cuerpo = (t, decl) => { const i = t.indexOf(decl); if (i < 0 || t.indexOf(decl, i + 1) >= 0) return null; const a = i + decl.length; return t.slice(a, t.indexOf('$c$;', a)) }
const CUERPO_004B = cuerpo(lee('sql/sim-004b-contrato-v1.sql'), 'v_comando pg_catalog.text := $c$')
const sha = t => createHash('sha256').update(t ?? '', 'utf8').digest('hex')
const CAMBIOS = [
  ['      v_avance boolean;\n', '      v_avance boolean; v_paso boolean; v_ventana timestamptz; v_pasos integer;\n'],
  ["      v_digest := encode(extensions.digest(convert_to(p_sobre, 'UTF8'), 'sha256'), 'hex');\n",
   "      v_digest := encode(extensions.digest(convert_to(p_sobre, 'UTF8'), 'sha256'), 'hex');\n" +
   "      -- sim-006 (orden 1-122): Step y Play son avanzar con motivo paso o play (el sobre canonico lo lleva en payload)\n" +
   "      v_paso := coalesce(p_tipo = 'avanzar' AND v_sobre->'payload'->>'motivo' IN ('paso', 'play'), false);\n"],
  ["      IF v_avance AND (v_al->>'siguiente_avance_desde')::timestamptz > v_t THEN\n        RETURN public.sim_error(429, 'demasiados_avances');\n      END IF;\n",
   "      -- sim-006: un paso no mira los 5 s; su tope, 10 por segundo y alumno (ventana fija de 1 s desde el primero)\n" +
   "      IF v_paso THEN\n" +
   "        SELECT a.pasos_ventana_desde, a.pasos_en_ventana INTO v_ventana, v_pasos FROM public.sim_alumnos a WHERE a.user_id = p_actor;\n" +
   "        IF v_ventana IS NULL OR v_t >= v_ventana + interval '1 second' THEN v_ventana := v_t; v_pasos := 0; END IF;\n" +
   "        IF v_pasos >= 10 THEN\n" +
   "          RETURN public.sim_error(429, 'demasiados_pasos', jsonb_build_object(\n" +
   "            'mensaje', 'sim-006: mas de 10 avances paso o play por segundo y alumno; reintentar con la misma clave',\n" +
   "            'tope', 10, 'ventana_ms', 1000,\n" +
   "            'reintentar_en_ms', greatest(1, ceil(extract(epoch FROM (v_ventana + interval '1 second' - v_t)) * 1000))::integer));\n" +
   "        END IF;\n" +
   "      ELSIF v_avance AND (v_al->>'siguiente_avance_desde')::timestamptz > v_t THEN\n        RETURN public.sim_error(429, 'demasiados_avances');\n      END IF;\n"],
  ["      IF v_avance THEN\n        UPDATE public.sim_alumnos SET siguiente_avance_desde = v_t + interval '5 seconds' WHERE user_id = p_actor;\n      END IF;\n",
   "      IF v_paso THEN\n" +
   "        UPDATE public.sim_alumnos SET siguiente_avance_desde = v_t + interval '5 seconds', pasos_ventana_desde = v_ventana,\n" +
   "               pasos_en_ventana = v_pasos + 1 WHERE user_id = p_actor;\n" +
   "      ELSIF v_avance THEN\n        UPDATE public.sim_alumnos SET siguiente_avance_desde = v_t + interval '5 seconds' WHERE user_id = p_actor;\n      END IF;\n"],
  // orden 1-125 (f): el tope de TAMAÑO, dentro del bloque del paso (tras el recibo repetido: un reintento con la misma
  // clave sigue devolviendo su recibo) y antes de contar en la ventana
  ["      -- sim-006: un paso no mira los 5 s; su tope, 10 por segundo y alumno (ventana fija de 1 s desde el primero)\n      IF v_paso THEN\n",
   "      -- sim-006: un paso no mira los 5 s; su tope, 10 por segundo y alumno (ventana fija de 1 s desde el primero)\n      IF v_paso THEN\n" +
   `        -- sim-006 (ordenes 1-125 f y 1-127 g): y su tope de TAMAÑO, declarado por lib/servidor/comando.mjs (que tiene el
        -- mercado; la base no tiene calendario). Un paso: resumen.velas, las velas CON DATOS que cruzo (del par del paso),
        -- entre 0 y 1: llega a la siguiente vela con datos, salte el hueco o el festivo que salte, y nunca mas alla. Un
        -- play: resumen.minutos, minutos de mercado, entre 0 y 100 (LOTE_PLAY_MAX de lib/sim/v1/topes.mjs). Mas, o sin
        -- declarar, rechazo puro sin efectos
        IF (v_sobre->'payload'->>'motivo' = 'paso' AND (jsonb_typeof(p_resultado->'resumen'->'velas') IS DISTINCT FROM 'number'
              OR (p_resultado->'resumen'->>'velas')::numeric NOT BETWEEN 0 AND 1))
           OR (v_sobre->'payload'->>'motivo' = 'play' AND (jsonb_typeof(p_resultado->'resumen'->'minutos') IS DISTINCT FROM 'number'
              OR (p_resultado->'resumen'->>'minutos')::numeric NOT BETWEEN 0 AND 100)) THEN
          RETURN public.sim_error(422, 'avance_demasiado_grande', jsonb_build_object(
            'mensaje', 'sim-006: un avance paso llega como mucho a la siguiente vela con datos y uno play a 100 minutos de mercado; mas lejos, goto',
            'tope', CASE v_sobre->'payload'->>'motivo' WHEN 'paso' THEN 1 ELSE 100 END,
            'unidad', CASE v_sobre->'payload'->>'motivo' WHEN 'paso' THEN 'velas' ELSE 'minutos' END,
            'velas', p_resultado->'resumen'->'velas',
            'minutos', p_resultado->'resumen'->'minutos'));
        END IF;
`],
]
const esperado = (() => { let t = CUERPO_004B; for (const [a, b] of CAMBIOS) { if (t == null || t.split(a).length !== 2) return null; t = t.replace(a, b) } return t })()

const FIRMA = 'public.sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb)'
// el catalogo que la migracion toca o no deberia tocar
const FOTO = `select pg_catalog.concat_ws(' | ',
  (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') || ' acl=' || coalesce(p.proacl::text, '-') || ' dueno=' || p.proowner::regrole || ' cfg=' || coalesce(array_to_string(p.proconfig, ','), '-')
          || ' def=' || p.prosecdef || ' vol=' || p.provolatile::text || ' leng=' || (select l.lanname from pg_language l where l.oid = p.prolang) || ' ret=' || p.prorettype::regtype
     from pg_proc p where p.oid = '${FIRMA}'::regprocedure),
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-') || ':' || coalesce(a.attacl::text, '-'), ',' order by a.attnum)
     from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum where a.attrelid = 'public.sim_alumnos'::regclass and a.attnum > 0 and not a.attisdropped),
  (select coalesce(c.relacl::text, '-') || ' rls=' || c.relrowsecurity || '/' || c.relforcerowsecurity || ' dueno=' || c.relowner::regrole from pg_class c where c.oid = 'public.sim_alumnos'::regclass),
  (select string_agg(p.oid::regprocedure::text || '=' || encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), ',' order by p.oid::regprocedure::text) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'sim\\_%' and p.oid <> '${FIRMA}'::regprocedure))`
const shaCuerpo = `select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = '${FIRMA}'::regprocedure`

const AL = u(1), OT = u(2)
let nCmd = 90000
const pg = montajeV1()
try {
  pg.arranca()
  const leeSesion = d => async id => { const t = pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  async function monta(d) {
    pg.base(d)
    const a = pg.comoEjecutor(d, S4B)
    ver(`control (${d}): sim-004b aplicada en el montaje`, a.ok, a.err.slice(0, 300))
    pg.alumno(d, AL); pg.alumno(d, OT)
    const puertos = { almacen: mercado, rpc: pg.rpc(d), parDeId: pg.parDeId(d), leeSesion: leeSesion(d), ahora: () => Date.parse('2026-10-14T10:00:00Z') }
    const ses = {}
    for (const [actor, sid] of [[AL, u(1001)], [OT, u(1002)]]) {
      const c = await CR.ordenCrear({ actor, cuerpo: { session_id: sid, command_id: u(++nCmd), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null }, puertos })
      const t = await TO.ordenTomar({ actor, cuerpo: { session_id: sid, command_id: u(++nCmd), epoca: 1, cliente_id: 'pestana-1', forzar: true }, puertos })
      ver(`control (${d}): sesion de ${actor.slice(-1)} creada y tomada`, c.http === 201 && typeof t.cuerpo?.testigo === 'string')
      ses[actor] = { sid, testigo: t.cuerpo.testigo }
    }
    const version = actor => Number(pg.uno(d, `select version from public.sim_sessions where id = ${L(ses[actor].sid)}`))
    const cmd = (actor, o) => ({ session_id: ses[actor].sid, command_id: u(++nCmd), epoca: 1, cliente_id: 'pestana-1', testigo: ses[actor].testigo, version_esperada: version(actor), ...o })
    const ordena = (actor, o) => CO.ordenComando({ actor, cuerpo: cmd(actor, o), puertos })
    const sinTasa = () => pg.uno(d, 'update public.sim_alumnos set siguiente_avance_desde = null')
    // los argumentos de sim_comando de un avance que no mueve nada (hasta = el cursor confirmado): la misma version y el
    // mismo resultado valen para toda una rafaga; cada uno con su command_id
    async function argsQuieto(actor, motivo, tipo = 'avanzar') {
      const fila = await puertos.leeSesion(ses[actor].sid)
      const c = cmd(actor, tipo === 'avanzar' ? { tipo, hasta: fila.estado.reloj.cursor, motivo } : { tipo })
      const v = CO.validaComando(c)
      const resultado = await CO.calcula({ fila, intencion: v.intencion, puertos })
      return k => ({ p_actor: actor, p_session_id: c.session_id, p_command_id: u(800000 + k), p_tipo: tipo, p_sobre: CO.sobreComando(v.intencion), p_epoca: 1,
        p_version_esperada: c.version_esperada, p_cliente_id: 'pestana-1', p_testigo: c.testigo, p_resultado: resultado })
    }
    // n llamadas a sim_comando en UN psql (cada una en su transaccion, como la RPC de supabase-js)
    function rafaga(lista) {
      const s = lista.map(a => `begin; set local role service_role;\nselect public.sim_comando(${Object.entries(a).map(([k, v]) => `${k} => ${L(v)}`).join(', ')})::text;\ncommit;`).join('\n')
      const r = pg.pg.psql(s, d)
      if (!r.ok) throw new Error(r.err)
      return r.out.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l))
    }
    return { d, puertos, ses, ordena, sinTasa, argsQuieto, rafaga, version, uno: q => pg.uno(d, q), foto: () => pg.uno(d, FOTO) }
  }
  const aplica = (d, t = APLICA) => pg.comoEjecutor(d, t)
  const finDe = r => r.out.split('\n').at(-1)
  const errDe = r => (r.err.split('\n').find(l => /ERROR/.test(l)) ?? r.err).replace(/^.*ERROR:\s*/, '')

  titulo('A · la guarda y la aplicacion')
  const b = await monta('t6a')
  // un primer paso real (para tener cursor) con sim-004b
  b.sinTasa()
  ver('control: un paso con sim-004b', (await b.ordena(AL, { tipo: 'avanzar', hasta: m(5), motivo: 'paso' })).http === 200)
  ver('control: un paso del otro alumno', (await b.ordena(OT, { tipo: 'avanzar', hasta: m(5), motivo: 'paso' })).http === 200)
  const antes = b.foto()
  const q0 = await b.argsQuieto(AL, 'paso')
  b.sinTasa()
  const r0 = b.rafaga([q0(1), q0(2)])
  ver('control (rojo de hoy): sin sim-006, el segundo paso seguido es 429 demasiados_avances', r0[0]?.http === 200 && r0[1]?.http === 429 && r0[1]?.motivo === 'demasiados_avances', tx(r0.map(x => x.http + ' ' + (x.motivo ?? ''))))
  oraculo('SIM006', 'A · el cuerpo de sim_comando de sim-004b es el aplicado en produccion (sha256 94f4db48…bc36, s16 del 20-oct)', sha(CUERPO_004B) === '94f4db481cc09a2bc9b5d86512931186d8ec5aa98689bf6dc54bd6418798bc36' && b.uno(shaCuerpo) === sha(CUERPO_004B), sha(CUERPO_004B))
  oraculo('SIM006', 'A · el cuerpo nuevo de sim-006 es el de sim-004b con SOLO los cinco cambios declarados, y la vuelta atras trae el de sim-004b tal cual',
    esperado != null && cuerpo(APLICA0, 'v_nuevo pg_catalog.text := $c$') === esperado && cuerpo(VUELTA0, 'v_viejo pg_catalog.text := $c$') === CUERPO_004B && cuerpo(VUELTA0, 'v_nuevo pg_catalog.text := $c$') === esperado,
    `nuevo ${sha(cuerpo(APLICA0, 'v_nuevo pg_catalog.text := $c$')).slice(0, 12)} esperado ${sha(esperado).slice(0, 12)}`)
  const h = aplica(b.d, APLICA0)
  oraculo('SIM006', 'A · con el hueco de la guarda canonica sin rellenar, para con «sim-006: …» y no toca nada', !h.ok && /^sim-006: .*guarda canonica/.test(errDe(h)) && b.foto() === antes, errDe(h).slice(0, 160))
  const a1 = aplica(b.d)
  oraculo('SIM006', 'A · aplicada: el informe acaba en FIN | sim-006 aplicada', a1.ok && finDe(a1) === 'FIN|sim-006 aplicada', a1.ok ? a1.out.split('\n').slice(-4).join(' / ') : errDe(a1).slice(0, 200))
  const despues = b.foto()

  titulo('B · los pasos: 10 por segundo y alumno')
  const q = await b.argsQuieto(AL, 'paso'), qp = await b.argsQuieto(AL, 'play')
  const r1 = b.rafaga([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(k => q(100 + k)))
  oraculo('SIM006', 'B · 10 pasos en el mismo segundo: los 10 pasan (200)', r1.length === 11 && r1.slice(0, 10).every(x => x.http === 200 && x.ok), tx(r1.map(x => x.http)))
  const e11 = r1[10]
  oraculo('SIM006', 'B · el 11.º: 429 demasiados_pasos con mensaje «sim-006: …», tope 10, ventana 1000 ms y reintentar_en_ms en (0, 1000]',
    e11?.http === 429 && e11.ok === false && e11.motivo === 'demasiados_pasos' && /^sim-006: /.test(e11.mensaje ?? '') && e11.tope === 10 && e11.ventana_ms === 1000 && e11.reintentar_en_ms > 0 && e11.reintentar_en_ms <= 1000, tx(e11))
  oraculo('SIM006', 'B · el 11.º no deja efectos: sin recibo con su clave, la cuenta sigue en 10', Number(b.uno(`select count(*) from public.sim_recibos where command_id = ${L(u(800111))}`)) === 0 && b.uno(`select pasos_en_ventana from public.sim_alumnos where user_id = ${L(AL)}`) === '10', b.uno(`select pasos_en_ventana from public.sim_alumnos where user_id = ${L(AL)}`))
  // un reintento con la MISMA clave del ultimo paso confirmado, con el tope agotado: su recibo, no 429 (no cuenta). El
  // ultimo: el recibo ultimo_avance de un paso se sobrescribe con el siguiente (S4-04)
  const rep = b.rafaga([q(110)])[0]
  oraculo('SIM006', 'B · con el tope agotado, el reintento de un paso confirmado (misma clave) da su recibo repetido, no 429', rep?.http === 200 && rep.repetido === true, tx({ http: rep?.http, repetido: rep?.repetido, motivo: rep?.motivo }))
  const ot = b.rafaga([(await b.argsQuieto(OT, 'paso'))(201)])[0]
  oraculo('SIM006', 'B · por alumno: con el de AL agotado, el paso del otro alumno pasa', ot?.http === 200, tx(ot))
  await espera(1100)
  const r2 = b.rafaga([1, 2, 3, 4, 5].map(k => q(300 + k)).concat([1, 2, 3, 4, 5, 6].map(k => qp(310 + k))))
  oraculo('SIM006', 'B · tras un segundo vuelven a pasar; paso y play cuentan juntos: 5 pasos + 5 play pasan, el 6.º play es 429 demasiados_pasos',
    r2.length === 11 && r2.slice(0, 10).every(x => x.http === 200) && r2[10].http === 429 && r2[10].motivo === 'demasiados_pasos', tx(r2.map(x => x.http)))
  await espera(1100)
  const r3 = b.rafaga([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(k => qp(400 + k)))
  oraculo('SIM006', 'B · otro segundo despues: 10 play pasan y el 11.º es 429', r3.slice(0, 10).every(x => x.http === 200) && r3[10]?.http === 429 && r3[10].motivo === 'demasiados_pasos', tx(r3.map(x => x.http)))

  titulo('C · los demas comandos, como antes')
  await espera(1100)
  b.sinTasa()
  const g = await b.argsQuieto(AL, 'goto')
  const rg = b.rafaga([g(501), g(502)])
  oraculo('SIM006', 'C · goto: dos seguidos, el segundo 429 demasiados_avances (sus 5 s, sin el mensaje de sim-006)', rg[0]?.http === 200 && rg[1]?.http === 429 && rg[1].motivo === 'demasiados_avances' && rg[1].mensaje === undefined, tx(rg.map(x => x.http + ' ' + (x.motivo ?? ''))))
  b.sinTasa()
  const ck = await b.argsQuieto(AL, null, 'checkpoint')
  const rc = b.rafaga([ck(511), ck(512)])
  oraculo('SIM006', 'C · checkpoint: dos seguidos, el segundo 429 demasiados_avances', rc[0]?.http === 200 && rc[1]?.http === 429 && rc[1].motivo === 'demasiados_avances', tx(rc.map(x => x.http + ' ' + (x.motivo ?? ''))))
  await espera(1100)
  b.sinTasa()
  const rpg = b.rafaga([q(521), g(522)])
  oraculo('SIM006', 'C · un goto justo despues de un paso: 429 demasiados_avances (el paso sigue contando para los 5 s del goto, como hoy)', rpg[0]?.http === 200 && rpg[1]?.http === 429 && rpg[1].motivo === 'demasiados_avances', tx(rpg.map(x => x.http + ' ' + (x.motivo ?? ''))))
  b.sinTasa()
  const rgp = b.rafaga([g(531), q(532), q(533)])
  oraculo('SIM006', 'C · un paso justo despues de un goto: pasa (los pasos ya no miran los 5 s)', rgp[0]?.http === 200 && rgp[1]?.http === 200 && rgp[2]?.http === 200, tx(rgp.map(x => x.http + ' ' + (x.motivo ?? ''))))
  const abiertos = []
  for (let k = 0; k < 12; k++) abiertos.push((await b.ordena(AL, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'limit', lotes: '0.01', precio: '1.00000' })).http)
  oraculo('SIM006', 'C · abrir: 12 seguidos, los 12 confirmados (sin limite, como antes)', abiertos.every(x => x === 200), tx(abiertos))

  titulo('T · el tope de TAMAÑO de un paso (una vela con datos: orden 1-127 g) o un play (100 minutos: orden 1-125 f)')
  await espera(1100)
  b.sinTasa()
  const conRes = (f, extra) => k => { const a = f(k); return { ...a, p_resultado: { ...a.p_resultado, resumen: { ...a.p_resultado.resumen, ...extra } } } }
  const sinCampo = (f, campo) => k => { const a = f(k); const r = { ...a.p_resultado.resumen }; delete r[campo]; return { ...a, p_resultado: { ...a.p_resultado, resumen: r } } }
  const qT = await b.argsQuieto(AL, 'paso'), qTp = await b.argsQuieto(AL, 'play')
  const rT = b.rafaga([conRes(qT, { velas: 1, minutos: 3000 })(901), conRes(qT, { velas: 2, minutos: 2 })(902), conRes(qTp, { minutos: 100 })(903), conRes(qTp, { minutos: 101 })(904), sinCampo(conRes(qT, { minutos: 1 }), 'velas')(905)])
  const fx = x => x && `${x.http} ${x.motivo ?? ''} ${x.tope ?? ''} ${x.unidad ?? ''} ${x.velas ?? ''} ${x.minutos ?? ''}`.trim()
  oraculo('SIM006', 'T · un paso que declara 1 vela (aunque cruce 3.000 minutos: un hueco o un festivo) y un play que declara 100 minutos: pasan (200)', rT[0]?.http === 200 && rT[2]?.http === 200, tx(rT.map(fx)))
  oraculo('SIM006', 'T · un paso de 2 velas y un play de 101 minutos: 422 avance_demasiado_grande, «sim-006: …», con su tope (1 vela, 100 minutos) y lo declarado',
    rT[1]?.http === 422 && rT[1].motivo === 'avance_demasiado_grande' && /^sim-006: /.test(rT[1].mensaje ?? '') && rT[1].tope === 1 && rT[1].unidad === 'velas' && rT[1].velas === 2 &&
    rT[3]?.http === 422 && rT[3].motivo === 'avance_demasiado_grande' && /^sim-006: /.test(rT[3].mensaje ?? '') && rT[3].tope === 100 && rT[3].unidad === 'minutos' && rT[3].minutos === 101, tx(rT.map(fx)))
  oraculo('SIM006', 'T · un paso que no declara sus velas (solo minutos, como antes): 422 avance_demasiado_grande (falla cerrado)', rT[4]?.http === 422 && rT[4].motivo === 'avance_demasiado_grande', tx(fx(rT[4])))
  oraculo('SIM006', 'T · los rechazos no dejan efectos: sin recibo con sus claves y la ventana cuenta solo los 2 que pasaron',
    Number(b.uno(`select count(*) from public.sim_recibos where command_id in (${[902, 904, 905].map(k => L(u(800000 + k))).join(', ')})`)) === 0 && b.uno(`select pasos_en_ventana from public.sim_alumnos where user_id = ${L(AL)}`) === '2',
    b.uno(`select pasos_en_ventana from public.sim_alumnos where user_id = ${L(AL)}`))
  b.sinTasa()
  const rTg = b.rafaga([conRes(await b.argsQuieto(AL, 'goto'), { minutos: 5000 })(911)])[0]
  oraculo('SIM006', 'T · el goto no tiene tope de tamaño (declara 5.000 minutos y pasa)', rTg?.http === 200, tx(fx(rTg)))
  // el servidor (Node): corta el calculo en el tope y lo declara; los numeros del SQL son los de lib/sim/v1/topes.mjs. Los
  // avances quietos de antes no mueven el cursor: la base es la que haya (todos los minutos del 6-ene tienen velas)
  const calculaA = async (motivo, hasta, actor = AL, extra = {}) => {
    const fila = await b.puertos.leeSesion(b.ses[actor].sid)
    const v = CO.validaComando({ session_id: b.ses[actor].sid, command_id: u(++nCmd), epoca: 1, cliente_id: 'pestana-1', testigo: b.ses[actor].testigo, version_esperada: Number(fila.version), tipo: 'avanzar', hasta, motivo, ...extra })
    if (!v.ok) return { invalido: v.en }
    const r = await CO.calcula({ fila, intencion: v.intencion, puertos: b.puertos })
    return { base: (fila.estado.reloj.cursor - M0) / 60, alcanzado: (r.resumen?.alcanzado - M0) / 60, cortado: r.resumen?.cortado, minutos: r.resumen?.minutos, velas: r.resumen?.velas }
  }
  const nP = await calculaA('paso', m(1000)), nY = await calculaA('play', m(1000)), nG = await calculaA('goto', m(300))
  oraculo('SIM006', 'T · lib/servidor/comando.mjs corta un paso en la siguiente vela con datos (velas 1) y un play en 100 minutos (cortado, declarados); un goto hasta el minuto 300 llega entero',
    nP.alcanzado === nP.base + 1 && nP.cortado === true && nP.velas === 1 && nY.alcanzado === nY.base + 100 && nY.cortado === true && nY.minutos === 100 && nY.velas === undefined && nG.alcanzado === 300 && nG.cortado === false && nG.minutos === 300 - nG.base &&
    TO6?.TOPE_AVANCE?.paso === 1 && TO6?.TOPE_AVANCE?.play === 100 && TO6?.LOTE_PLAY_MAX === 100 && APLICA0.includes("CASE v_sobre->'payload'->>'motivo' WHEN 'paso' THEN 1 ELSE 100 END") && APLICA0.includes("(p_resultado->'resumen'->>'velas')::numeric NOT BETWEEN 0 AND 1"),
    tx({ nP, nY, nG, topes: TO6?.TOPE_AVANCE ?? null }))
  // (g) un hueco: EURUSD no tiene velas del minuto 1500 al 1509. El otro alumno llega al 1499 con un goto
  b.sinTasa()
  ver('control: el otro alumno, con un goto, en el minuto 1499', (await b.ordena(OT, { tipo: 'avanzar', hasta: m(1499), motivo: 'goto' })).http === 200 && (await calculaA('paso', m(1499), OT)).base === 1499)
  const gE = await calculaA('paso', m(2000), OT, { par: 'EURUSD' }), gS = await calculaA('paso', m(2000), OT), gG = await calculaA('paso', m(2000), OT, { par: 'GBPUSD' })
  oraculo('SIM006', 'T · (g) un paso del par visible (EURUSD) en el hueco salta a su siguiente vela con datos (1510: 11 minutos, 1 vela) y ahi para aunque pida el 2000; de GBPUSD o sin par, la vela del 1500',
    gE.alcanzado === 1510 && gE.velas === 1 && gE.minutos === 11 && gE.cortado === true && gS.alcanzado === 1500 && gS.velas === 1 && gG.alcanzado === 1500 && gG.velas === 1, tx({ gE, gS, gG }))
  b.sinTasa()
  const rgE = await b.ordena(OT, { tipo: 'avanzar', hasta: m(2000), motivo: 'paso', par: 'EURUSD' })
  const rgE2 = await b.ordena(OT, { tipo: 'avanzar', hasta: m(2000), motivo: 'paso', par: 'EURUSD' })
  oraculo('SIM006', 'T · (g) por la base: ese paso se confirma (200, alcanzado 1510) y el siguiente, sin esperar los 5 s del goto, llega solo a la vela 1511: un Go to disfrazado de paso no salta mas alla de una vela',
    rgE.http === 200 && (rgE.cuerpo?.alcanzado - M0) / 60 === 1510 && rgE2.http === 200 && (rgE2.cuerpo?.alcanzado - M0) / 60 === 1511, tx({ a: rgE.http, al: (rgE.cuerpo?.alcanzado - M0) / 60, b: rgE2.http, al2: (rgE2.cuerpo?.alcanzado - M0) / 60, m: rgE.cuerpo?.motivo }))

  titulo('D · idempotente; sim-004b no se vuelve a ejecutar encima; a medias, para')
  const cuenta = b.uno(`select pasos_en_ventana || ' ' || pasos_ventana_desde from public.sim_alumnos where user_id = ${L(AL)}`)
  const a2 = aplica(b.d)
  oraculo('SIM006', 'D · aplicarla otra vez: el mismo informe, el mismo catalogo y las cuentas de los alumnos sin tocar',
    a2.ok && a2.out === a1.out && b.foto() === despues && b.uno(`select pasos_en_ventana || ' ' || pasos_ventana_desde from public.sim_alumnos where user_id = ${L(AL)}`) === cuenta, a2.ok ? 'igual' : errDe(a2).slice(0, 200))
  const x4 = pg.comoEjecutor(b.d, S4B)
  oraculo('SIM006', 'D · sim-004b ejecutada encima de sim-006: para con «sim-004b: A MEDIAS …» y no toca nada', !x4.ok && /^sim-004b: A MEDIAS/.test(errDe(x4)) && b.foto() === despues, errDe(x4).slice(0, 160))
  const m1 = await monta('t6m')
  ver('control: aplicada en la base de a medias', aplica(m1.d).ok)
  m1.uno('alter table public.sim_alumnos drop column pasos_en_ventana')
  const fm = m1.foto()
  const am = aplica(m1.d)
  oraculo('SIM006', 'D · a medias (el cuerpo nuevo y una sola columna): para con «sim-006: A MEDIAS …» sin tocar nada', !am.ok && /^sim-006: A MEDIAS/.test(errDe(am)) && m1.foto() === fm, errDe(am).slice(0, 160))
  const vm = pg.comoEjecutor(m1.d, VUELTA)
  oraculo('SIM006', 'D · y la vuelta atras sobre esa base tambien para sin tocar nada', !vm.ok && /^sim-006: A MEDIAS/.test(errDe(vm)) && m1.foto() === fm, errDe(vm).slice(0, 160))
  const m2 = await monta('t6n')
  m2.uno(`alter table public.sim_alumnos add column pasos_en_ventana integer not null default 0`)
  const fn = m2.foto()
  const an = aplica(m2.d)
  oraculo('SIM006', 'D · sin aplicar pero con una columna de las suyas ya creada: para con «sim-006: A MEDIAS …» sin tocar nada', !an.ok && /^sim-006: A MEDIAS/.test(errDe(an)) && m2.foto() === fn, errDe(an).slice(0, 160))

  titulo('E · la vuelta atras')
  const vh = pg.comoEjecutor(b.d, VUELTA0)
  oraculo('SIM006', 'E · la vuelta atras con el hueco sin rellenar: para con «sim-006: …» y no toca nada', !vh.ok && /^sim-006: .*guarda canonica/.test(errDe(vh)) && b.foto() === despues, errDe(vh).slice(0, 160))
  const v1 = pg.comoEjecutor(b.d, VUELTA)
  oraculo('SIM006', 'E · deshecha: el informe acaba en FIN | sim-006 deshecha', v1.ok && finDe(v1) === 'FIN|sim-006 deshecha', v1.ok ? v1.out.split('\n').slice(-3).join(' / ') : errDe(v1).slice(0, 200))
  oraculo('SIM006', 'E · el catalogo queda EXACTAMENTE como antes de sim-006 (cuerpo, ACL, dueño, atributos; columnas de sim_alumnos; ACL y RLS de la tabla; las demas sim_*)', b.foto() === antes, b.foto() === antes ? 'igual' : `${antes}\n≠\n${b.foto()}`)
  const y4 = pg.comoEjecutor(b.d, S4B)
  oraculo('SIM006', 'E · sim-004b vuelve a acreditarse entera encima (su DO y su informe: FIN | sim-004b aplicada)', y4.ok && /FIN\|sim-004b aplicada$/.test(y4.out), y4.ok ? finDe(y4) : errDe(y4).slice(0, 200))
  await espera(1100)
  b.sinTasa()
  const qv = await b.argsQuieto(AL, 'paso')
  const rv = b.rafaga([qv(601), qv(602)])
  oraculo('SIM006', 'E · el comportamiento de antes: dos pasos seguidos, el segundo 429 demasiados_avances', rv[0]?.http === 200 && rv[1]?.http === 429 && rv[1].motivo === 'demasiados_avances', tx(rv.map(x => x.http + ' ' + (x.motivo ?? ''))))
  const v2 = pg.comoEjecutor(b.d, VUELTA)
  oraculo('SIM006', 'E · la vuelta atras dos veces: el mismo informe y el mismo catalogo', v2.ok && v2.out === v1.out && b.foto() === antes, v2.ok ? 'igual' : errDe(v2).slice(0, 200))
  const a3 = aplica(b.d)
  b.sinTasa()
  const q3 = await b.argsQuieto(AL, 'paso')
  const r4 = b.rafaga([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(k => q3(700 + k)))
  oraculo('SIM006', 'E · aplicarla de nuevo tras la vuelta atras: el mismo catalogo que la primera vez y el tope otra vez (10 pasan, el 11.º 429)',
    a3.ok && b.foto().split(' | ')[0] === despues.split(' | ')[0] && b.foto().split(' | ')[1] === despues.split(' | ')[1] && r4.slice(0, 10).every(x => x.http === 200) && r4[10]?.motivo === 'demasiados_pasos', tx(r4.map(x => x.http)))
} finally { pg.cierra() }
fin()
