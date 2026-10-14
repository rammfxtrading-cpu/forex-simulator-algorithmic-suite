/**
 * ETAPA 3 · LOS TRAMOS DEL AVANCE (diseño sim-004 i.2 S4-08, h.10; spec § 1.7). Escrito
 * ANTES que el codigo (contra el commit de estado/borrar: en rojo).
 *
 * El servidor acota cada `avanzar`, de forma DETERMINISTA (el mismo comando sobre el
 * mismo estado da siempre lo mismo: nada depende del reloj):
 *   · el tramo: hasta − (cursor, o el inicio de la sesion) ≤ el tope. Por defecto, 7 dias
 *     naturales (604.800 s): nunca recorre mas de 7 dias de mercado (§ 1.7). Mas:
 *     422 tramo_demasiado_largo con el hasta maximo, sin calcular ni llamar a la RPC;
 *   · el tamaño: la llamada a la RPC en UTF-8 ≤ 4 MB (h.10). Mas: 413
 *     resultado_demasiado_grande, sin llamar a la RPC (rechazo seguro: el cliente parte);
 *   · un comando que no se calcula (version distinta) no se acota: la RPC decide.
 * El umbral MEDIDO (p99 ≤ 10 s) es otra cosa: pruebas/medidas/tramos.mjs y diseño q.6.
 */
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
import { titulo, ver, oraculo, fin, importa } from './lib.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const SO = await importa('lib/servidor/sobre.mjs'), CR = await importa('lib/servidor/crear.mjs'), CO = await importa('lib/servidor/comando.mjs')
const { manifiestosVigentes } = await importa('lib/servidor/mercado.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velas(par) { const o = []; for (let t = U('2025-01-06T00:00:00Z'); t < U('2025-01-25T00:00:00Z'); t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: PX[par], high: PX[par], low: PX[par], close: PX[par], volume: 1 }); return o }
function almacen() { const o = new Map(); return { async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const alm = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: alm, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velas(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const { fijados } = await manifiestosVigentes(alm, SO.PARES)
const i = SO.validaCrear({ session_id: u(1001), command_id: u(2001), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null }, { ahora: Date.parse('2026-10-14T10:00:00Z') }).intencion
const e0 = CR.estadoInicial(i, fijados).estado
const fila = (estado, version = 0) => ({ id: u(1001), user_id: u(1), motor_version: 1, legado: false, terminal: null, version, epoca: 1, date_from: '2025-01-06', estado: JSON.parse(CA.serializa(estado)) })
const D0 = U('2025-01-06T00:00:00Z'), SEMANA = 7 * 86400
let llamadas = []
const puertos = (f, extra = {}) => ({ almacen: alm, leeSesion: async () => f, rpc: async (n, a) => { llamadas.push({ n, bytes: Buffer.byteLength(JSON.stringify(a), 'utf8'), a }); return { data: { ok: true, http: 200, version: 1 }, error: null } }, ...extra })
let n = 3000
const av = (hasta, version = 0) => ({ session_id: u(1001), command_id: u(++n), tipo: 'avanzar', epoca: 1, version_esperada: version, cliente_id: 'p', testigo: 'a'.repeat(64), hasta, motivo: 'play' })

titulo('1 · el tope del tramo (7 dias naturales por defecto)')
llamadas = []
const r1 = await CO.ordenComando({ actor: u(1), cuerpo: av(D0 + SEMANA + 60), puertos: puertos(fila(e0)) })
oraculo('TRAM', 'desde el inicio, 7 dias + 1 min: 422 tramo_demasiado_largo con el hasta maximo (inicio + 7 dias), sin RPC', r1.http === 422 && r1.cuerpo?.motivo === 'tramo_demasiado_largo' && r1.cuerpo.hasta_maximo === D0 + SEMANA && llamadas.length === 0, JSON.stringify(r1))
llamadas = []
const r2 = await CO.ordenComando({ actor: u(1), cuerpo: av(D0 + SEMANA), puertos: puertos(fila(e0)) })
oraculo('TRAM', '7 dias justos desde el inicio: se calcula y va a la RPC', r2.http === 200 && llamadas.length === 1 && llamadas[0].a.p_resultado?.estado?.reloj?.cursor != null, JSON.stringify({ r2, n: llamadas.length }))
const e1 = CA.deserializa(JSON.stringify(llamadas[0]?.a?.p_resultado?.estado ?? null))
llamadas = []
const r3 = await CO.ordenComando({ actor: u(1), cuerpo: av(e1.reloj.cursor + SEMANA + 60, 1), puertos: puertos(fila(e1, 1)) })
oraculo('TRAM', 'desde un cursor, cursor + 7 dias + 1 min: 422 con hasta_maximo = cursor + 7 dias', r3.http === 422 && r3.cuerpo?.hasta_maximo === e1.reloj.cursor + SEMANA && llamadas.length === 0, JSON.stringify(r3))
llamadas = []
const r4 = await CO.ordenComando({ actor: u(1), cuerpo: av(D0 + 30 * 86400, 0), puertos: puertos(fila(e1, 1)) })
oraculo('TRAM', 'un comando que no se calcula (version esperada vieja) no se acota: va a la RPC, que decide', llamadas.length === 1 && llamadas[0].a.p_resultado?.motivo === 'no_calculado', JSON.stringify({ r4, n: llamadas.length }))
llamadas = []
const r5 = await CO.ordenComando({ actor: u(1), cuerpo: av(D0 + 3600), puertos: puertos(fila(e0), { limites: { tramo: 1800 } }) })
oraculo('TRAM', 'el tope es un parametro (limites.tramo): con 30 min, 1 h → 422', r5.http === 422 && r5.cuerpo?.hasta_maximo === D0 + 1800 && llamadas.length === 0, JSON.stringify(r5))

titulo('2 · el tamaño de la llamada a la RPC (4 MB)')
llamadas = []
const r6 = await CO.ordenComando({ actor: u(1), cuerpo: av(D0 + 3600), puertos: puertos(fila(e0)) })
ver('control: una hora va a la RPC y pesa menos de 4 MB', llamadas.length === 1 && llamadas[0].bytes < 4 * 1048576, String(llamadas[0]?.bytes))
const peso = llamadas[0]?.bytes ?? 0
llamadas = []
const r7 = await CO.ordenComando({ actor: u(1), cuerpo: av(D0 + 3600), puertos: puertos(fila(e0), { limites: { bytes: peso - 1 } }) })
oraculo('TRAM', 'si la llamada pesa un byte mas que el limite: 413 resultado_demasiado_grande, sin RPC', r7.http === 413 && r7.cuerpo?.motivo === 'resultado_demasiado_grande' && llamadas.length === 0, JSON.stringify(r7))
llamadas = []
const r8 = await CO.ordenComando({ actor: u(1), cuerpo: av(D0 + 3600), puertos: puertos(fila(e0), { limites: { bytes: peso } }) })
oraculo('TRAM', 'con el limite justo, pasa (≤)', r8.http === 200 && llamadas.length === 1, JSON.stringify(r8))
oraculo('TRAM', 'los limites por defecto: 7 dias y 4 MB', CO.LIMITES?.tramo === SEMANA && CO.LIMITES?.bytes === 4 * 1048576, JSON.stringify(CO.LIMITES))
fin()
