/**
 * ETAPA 3 · E3-01 (Astra 15-oct; decision del CTO del 15-oct): EL ACK SALE SOLO DEL RECIBO.
 * Escrito ANTES que el codigo (contra 79f39a2: en rojo).
 *
 * El ACK de un comando (alcanzado, cortado y el resumen) y el de pasar de fase se construyen
 * SOLO desde el recibo que confirma la RPC, sea nuevo o repetido. Nunca se mezclan con el
 * calculo local. En un 409 o un 429 no se añade ningun progreso calculado.
 *
 * Contra sim_comando REAL (montaje-v1, PostgreSQL de ensayo), practica de los nueve pares:
 *   A · el intercalado de Astra: dos calculos de la MISMA clave sobre la misma foto, con dos
 *       relojes distintos. El lento confirma primero (corta en 00:59); el rapido llega despues
 *       (calculo hasta 02:00, sin cortar) y la RPC responde repetido con el recibo de 00:59.
 *       El ACK del repetido dice 00:59 y cortado, como el recibo y como la fila;
 *   B · el mismo intercalado al reves (el rapido confirma primero): el repetido del lento dice
 *       02:00 y sin cortar;
 *   C · 409 comando_caducado de un avance calculado sobre una foto vieja: sin alcanzado ni cortado;
 *   D · 429 demasiados_avances de un avance calculado: sin alcanzado ni cortado;
 *   E · pasar de fase: el ACK es la respuesta de sim_avanzar_fase tal cual (nuevo, repetido y
 *       error), sin claves añadidas.
 */
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
import { titulo, ver, oraculo, fin, importa } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, L } from './montaje-v1.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), FA = await importa('lib/servidor/fase.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const AHORA = Date.parse('2026-10-14T10:00:00Z')
const U = iso => Date.parse(iso) / 1000
const M0 = U('2025-01-06T00:00:00Z')
const m = k => M0 + 60 * k
let nCmd = 7000
const cmd = (o = {}) => ({ session_id: u(1001), command_id: u(++nCmd), epoca: 1, cliente_id: 'pestana-1', ...o })
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
// lo que el ACK añade a la respuesta de la RPC (claves que no estan en datos, o que cambian)
const anadido = (cuerpo, datos) => Object.fromEntries(Object.entries(cuerpo ?? {}).filter(([k, v]) => tx(datos?.[k]) !== tx(v)))

const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velas(par) { const o = []; for (let t = U('2025-01-06T00:00:00Z'); t < U('2025-01-11T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const p = PX[par]; o.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 }) } return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
const planes = SO.PARES.map(par => P.planificaPar({ par, velas: velas(par), texto: '', anterior: null, diasAceptados: new Map() }))
ver('control: los nueve pares publican', planes.every(p => p.estado === 'publica'))
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes, dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })

titulo('E · pasar de fase: el ACK es la respuesta de la RPC, tal cual')
{
  // la madre con una version MAYOR que la esperada: fase.mjs no calcula y llama a la RPC (que decide)
  const madre = { id: u(1), user_id: u(1), motor_version: 1, legado: false, terminal: null, version: 5, estado: { esquema: 'reto@1' } }
  const respuestas = [
    ['nuevo', { ok: true, http: 201, recibo: { id: 'r1', resumen: { fase: 2, inicio: 1736125200 } } }],
    ['repetido', { ok: true, http: 200, repetido: true, recibo: { id: 'r1', resumen: { fase: 2, inicio: 1736125200 } }, version: 5 }],
    ['409', { ok: false, http: 409, motivo: 'conflicto', version: 5 }],
  ]
  for (const [que, datos] of respuestas) {
    const r = await FA.ordenFase({ actor: u(1), cuerpo: { padre_id: u(1), hija_id: u(2), command_id: u(3), epoca: 1, version_esperada: 4 }, puertos: { leeSesion: async () => madre, rpc: async () => ({ data: datos, error: null }) } })
    oraculo('ACK', `fase, ${que}: el cuerpo es la respuesta de sim_avanzar_fase, sin nada añadido`, r.http === datos.http && tx(r.cuerpo) === tx(datos), tx(r))
  }
}

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay; la parte contra la RPC real no se ha ejecutado', false); fin() }
const pg = montajeV1()
try {
  pg.arranca()
  const AL = u(1)
  const leeSesion = d => async id => { const t = pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  // el puerto rpc espia: guarda la respuesta de la RPC para compararla con el ACK
  const monta = d => {
    pg.base(d); pg.alumno(d, AL)
    const real = pg.rpc(d), visto = []
    return { visto, almacen: mercado, rpc: async (n, a) => { const r = await real(n, a); visto.push(r.data); return r }, leeSesion: leeSesion(d), ahora: () => AHORA }
  }
  const crear = puertos => CR.ordenCrear({ actor: AL, cuerpo: { session_id: u(1001), command_id: u(2001), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null }, puertos })
  const toma = async puertos => (await TO.ordenTomar({ actor: AL, cuerpo: { session_id: u(1001), command_id: u(++nCmd), epoca: 1, cliente_id: 'pestana-1', forzar: true }, puertos })).cuerpo?.testigo
  const sinTasa = d => pg.uno(d, 'update public.sim_alumnos set siguiente_avance_desde = null')
  const cursorFila = d => JSON.parse(pg.uno(d, `select estado::text from public.sim_sessions where id = '${u(1001)}'`)).reloj?.cursor
  // dos relojes: el lento agota los 6 s tras el primer trozo (corta en el minuto 59); el rapido no corta
  const lento = () => { let x = 0; return () => { const y = x; x += 7000; return y } }
  const rapido = () => () => 0
  const ordena = (puertos, c) => CO.ordenComando({ actor: AL, cuerpo: c, puertos })

  // el intercalado: los dos leen la MISMA foto (version 0) antes de que se confirme ninguno
  async function intercalado(d, primero, segundo) {
    const pu = monta(d)
    ver(`control (${d}): sesion creada`, (await crear(pu)).http === 201)
    const testigo = await toma(pu)
    sinTasa(d)
    const foto = await pu.leeSesion(u(1001))
    const c = cmd({ tipo: 'avanzar', version_esperada: 0, testigo, hasta: m(120), motivo: 'play' })
    const a = await ordena({ ...pu, leeSesion: async () => foto, reloj: primero() }, c)
    const datosA = pu.visto.at(-1)
    sinTasa(d)
    const b = await ordena({ ...pu, leeSesion: async () => foto, reloj: segundo() }, c)
    const datosB = pu.visto.at(-1)
    return { a, b, datosA, datosB, cursor: cursorFila(d) }
  }

  titulo('A · el intercalado de Astra: el lento confirma primero')
  const A = await intercalado('ack1', lento, rapido)
  ver('control: el primero confirma un tramo cortado en el minuto 59 (nuevo)', A.a.http === 200 && A.a.cuerpo?.repetido !== true && A.datosA?.recibo?.resumen?.alcanzado === m(59) && A.datosA.recibo.resumen.cortado === true && A.cursor === m(59), tx({ a: A.a.cuerpo?.alcanzado, r: A.datosA?.recibo?.resumen, cursor: A.cursor }))
  ver('control: el segundo es un repetido de la RPC (la fila no cambia)', A.b.http === 200 && A.b.cuerpo?.repetido === true && A.cursor === m(59), tx(A.b.cuerpo?.recibo?.resumen))
  oraculo('ACK', 'el ACK del repetido dice lo que confirmo el recibo: alcanzado 00:59 y cortado (no las 02:00 del calculo descartado)', A.b.cuerpo?.alcanzado === m(59) && A.b.cuerpo?.cortado === true, tx({ alcanzado: A.b.cuerpo?.alcanzado, cortado: A.b.cuerpo?.cortado, recibo: A.datosB?.recibo?.resumen }))
  oraculo('ACK', 'el ACK del repetido = la respuesta de la RPC + alcanzado/cortado de SU recibo, nada mas', tx(anadido(A.b.cuerpo, A.datosB)) === tx({ alcanzado: A.datosB?.recibo?.resumen?.alcanzado, cortado: A.datosB?.recibo?.resumen?.cortado }), tx(anadido(A.b.cuerpo, A.datosB)))
  oraculo('ACK', 'el ACK del nuevo = la respuesta de la RPC + alcanzado/cortado de su recibo', tx(anadido(A.a.cuerpo, A.datosA)) === tx({ alcanzado: m(59), cortado: true }), tx(anadido(A.a.cuerpo, A.datosA)))

  titulo('B · el mismo intercalado al reves: el rapido confirma primero')
  const B = await intercalado('ack2', rapido, lento)
  ver('control: el primero confirma 02:00 sin cortar; el segundo es repetido', B.a.http === 200 && B.datosA?.recibo?.resumen?.alcanzado === m(120) && B.datosA.recibo.resumen.cortado === false && B.b.cuerpo?.repetido === true && B.cursor === m(120), tx({ r: B.datosA?.recibo?.resumen, rep: B.b.cuerpo?.repetido, cursor: B.cursor }))
  oraculo('ACK', 'el ACK del repetido dice 02:00 sin cortar (el recibo), no el corte en 00:59 de su propio calculo', B.b.cuerpo?.alcanzado === m(120) && B.b.cuerpo?.cortado === false, tx({ alcanzado: B.b.cuerpo?.alcanzado, cortado: B.b.cuerpo?.cortado }))

  titulo('C · 409 comando_caducado de un avance calculado: sin progreso')
  {
    const d = 'ack3', pu = monta(d)
    ver('control: sesion creada', (await crear(pu)).http === 201)
    const testigo = await toma(pu)
    sinTasa(d)
    const foto = await pu.leeSesion(u(1001))
    const otro = await ordena(pu, cmd({ tipo: 'avanzar', version_esperada: 0, testigo, hasta: m(10), motivo: 'paso' }))
    sinTasa(d)
    const cad = await ordena({ ...pu, leeSesion: async () => foto }, cmd({ tipo: 'avanzar', version_esperada: 0, testigo, hasta: m(30), motivo: 'paso' }))
    ver('control: otro avance confirmo antes (version 1) y este se calculo sobre la foto vieja', otro.http === 200 && cad.http === 409 && cad.cuerpo?.motivo === 'comando_caducado', tx(cad.cuerpo))
    oraculo('ACK', '409 comando_caducado: el cuerpo es el de la RPC, sin alcanzado ni cortado del calculo', !('alcanzado' in (cad.cuerpo ?? {})) && !('cortado' in (cad.cuerpo ?? {})) && tx(anadido(cad.cuerpo, pu.visto.at(-1))) === '{}', tx(cad.cuerpo))

    titulo('D · 429 demasiados_avances de un avance calculado: sin progreso')
    const v = Number(pg.uno(d, `select version from public.sim_sessions where id = '${u(1001)}'`))
    const p1 = await ordena(pu, cmd({ tipo: 'avanzar', version_esperada: v, testigo, hasta: m(20), motivo: 'paso' }))
    const p2 = await ordena(pu, cmd({ tipo: 'avanzar', version_esperada: v + 1, testigo, hasta: m(40), motivo: 'paso' }))
    ver('control: el segundo avance sin esperar 5 s es 429', p1.http === 200 && p2.http === 429 && p2.cuerpo?.motivo === 'demasiados_avances', tx(p2.cuerpo))
    oraculo('ACK', '429 demasiados_avances: el cuerpo es el de la RPC, sin alcanzado ni cortado del calculo', !('alcanzado' in (p2.cuerpo ?? {})) && !('cortado' in (p2.cuerpo ?? {})) && tx(anadido(p2.cuerpo, pu.visto.at(-1))) === '{}', tx(p2.cuerpo))
  }
} finally { pg.cierra() }
fin()
