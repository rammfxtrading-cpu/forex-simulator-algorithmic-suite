/**
 * ETAPA 3 · LOS TRAMOS DEL AVANCE (diseño sim-004 i.2 S4-08; decision del CTO del 14-oct,
 * q.10 f; calibracion en q.12). Reescrito ANTES que el codigo (contra a8e40a4: en rojo).
 *
 * Fuera el tope de 7 dias. Un `avanzar` llega hasta su `hasta` o se CORTA antes:
 *   · por el presupuesto de reloj (6 s por defecto; se mira entre trozos de 60 minutos de
 *     mercado, nunca a mitad de un trozo);
 *   · por el maximo de minutos de mercado (2.400 por defecto, calibrado: q.12);
 *   · por un terminal (breach, objetivo) o una detencion del mercado.
 * La respuesta dice hasta donde llego (`alcanzado`) y si se corto (`cortado`); el cliente
 * encadena. Cada tramo es UNA llamada a sim_comando (atomica, con el CAS). Paso = salto: el
 * estado y los eventos de un tramo cortado son EXACTAMENTE los de avanzar de un tirón hasta
 * donde llego, y encadenar tramos da lo mismo que un avance sin cortes (nada a medias).
 * El tope de 4 MB de la llamada sigue (413, sin RPC).
 */
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
import { titulo, ver, oraculo, fin, importa } from './lib.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const SO = await importa('lib/servidor/sobre.mjs'), CR = await importa('lib/servidor/crear.mjs'), CO = await importa('lib/servidor/comando.mjs')
const ME = await importa('lib/servidor/mercado.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velas(par) { const o = []; for (let t = U('2025-01-06T00:00:00Z'); t < U('2025-01-25T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const p = PX[par] * (1 + 0.0001 * Math.sin(t / 600)); const r = Number(p.toFixed(/JPY/.test(par) ? 3 : 5)); o.push({ time: t, open: r, high: r, low: r, close: r, volume: 1 }) } return o }
function almacen() { const o = new Map(); return { async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const alm = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: alm, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velas(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const { fijados, manifiestos } = await ME.manifiestosVigentes(alm, SO.PARES)
const i = SO.validaCrear({ session_id: u(1001), command_id: u(2001), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null }, { ahora: Date.parse('2026-10-14T10:00:00Z') }).intencion
const e0 = CR.estadoInicial(i, fijados).estado
const fila = (estado, version = 0) => ({ id: u(1001), user_id: u(1), motor_version: 1, legado: false, terminal: null, version, epoca: 1, date_from: '2025-01-06', estado: JSON.parse(CA.serializa(estado)) })
const D0 = U('2025-01-06T00:00:00Z')
let llamadas = []
// el doble de sim_comando confirma como la real: su recibo guarda el resumen enviado (E3-01: el ACK
// sale de ahi, no del calculo)
const puertos = (f, extra = {}) => ({ almacen: alm, leeSesion: async () => f, rpc: async (n, a) => { llamadas.push({ n, bytes: Buffer.byteLength(JSON.stringify(a), 'utf8'), a }); return { data: { ok: true, http: 200, version: 1, recibo: { resumen: a.p_resultado?.resumen ?? null } }, error: null } }, ...extra })
let n = 3000
const av = (hasta, version = 0) => ({ session_id: u(1001), command_id: u(++n), tipo: 'avanzar', epoca: 1, version_esperada: version, cliente_id: 'p', testigo: 'a'.repeat(64), hasta, motivo: 'play' })
const enviado = () => llamadas.at(-1)?.a?.p_resultado
const deEnviado = () => CA.deserializa(JSON.stringify(enviado()?.estado ?? null))
// la referencia: avanzar de un tiron hasta h, con el motor directamente
const fu = await ME.creaLector({ almacen: alm, cache: ME.creaCache() }).fuentes(manifiestos, { desde: D0, hasta: D0 + 30 * 86400 })
const unTiron = (e, h) => CA.avanza(e, h, fu, { desde: D0 })
// el minuto en que se cumplen k minutos de mercado despues de t
const tras = (t, k) => { for (let x = t + 60; ; x += 60) if (!minutoCerrado(x) && --k === 0) return x }
// E3-02: una practica con posiciones (TP y SL a pocos ticks) y una pendiente, para que el tramo
// cortado tenga eventos y trades que comparar (sin posiciones, 2.400 minutos no dan ninguno)
const M = await importa('lib/motor/motor.mjs')
let ep = CA.avanza(e0, D0, fu, { desde: D0 }).estado
const cerca = (par, k) => M.precioTexto(par, ep.cotizaciones[par].bid + BigInt(k))
const abre = [
  { par: 'EURUSD', lado: 'BUY', orden: 'mercado', tp: cerca('EURUSD', 8) },
  { par: 'USDJPY', lado: 'SELL', orden: 'mercado', tp: cerca('USDJPY', -8) },
  { par: 'GBPUSD', lado: 'BUY', orden: 'mercado', sl: cerca('GBPUSD', -6) },
  { par: 'AUDUSD', lado: 'BUY', orden: 'limit', precio: cerca('AUDUSD', -4), tp: cerca('AUDUSD', 4) },
]
const aceptadas = abre.map(o => { const x = CA.aplica(ep, { tipo: 'abrir', lotes: '1', ...o, ...(o.orden === 'mercado' ? { cotizadoEn: ep.reloj.cursor } : {}) }, {}); ep = x.estado; return x.resultado })
ver('control: la practica con posiciones abre las tres y la pendiente', aceptadas.every(r => r === 'aceptado'), JSON.stringify(aceptadas))

titulo('1 · el maximo de minutos de mercado (sin prisa de reloj)')
llamadas = []
const lejos = D0 + 20 * 86400
const r1 = await CO.ordenComando({ actor: u(1), cuerpo: av(lejos), puertos: puertos(fila(ep)) })
const tope = CO.LIMITES?.minutos
const b1 = tope ? tras(D0, tope) : null
oraculo('TRAM', `20 dias pedidos: un solo tramo, cortado en ${tope} minutos de mercado; la respuesta dice alcanzado y cortado`, r1.http === 200 && llamadas.length === 1 && r1.cuerpo?.cortado === true && r1.cuerpo.alcanzado === b1 && enviado()?.resumen?.alcanzado === b1, JSON.stringify({ c: r1.cuerpo, b1 }))
const ref1 = unTiron(ep, b1)
// E3-02 (Astra 15-oct): los eventos COMPLETOS (tipo, instante y datos) y los trades, no su numero.
// La referencia pasa por el mismo adaptador (resultadoDe) con los eventos del motor de un tiron.
const adaptado = (antes, ref, h) => CO.resultadoDe({ tipo: 'avanzar', comando: { tipo: 'avanzar', hasta: h, motivo: 'play' }, antes, despues: ref.estado ?? ref.reto, eventos: ref.eventos })
const sinOrd = xs => JSON.stringify((xs ?? []).map(({ ordinal, ...x }) => x))
const mismos = (enviados, ref) => sinOrd(enviados?.eventos) === sinOrd(ref.eventos) && sinOrd(enviados?.trades) === sinOrd(ref.trades)
const a1 = adaptado(ep, ref1, b1)
ver('control: la comparacion completa ve un cambio de orden y un dato cambiado (no es una comparacion de longitudes)', a1.eventos.length > 1 && !mismos({ ...a1, eventos: [...a1.eventos].reverse() }, a1) && !mismos({ ...a1, eventos: a1.eventos.map((x, i) => (i ? x : { ...x, t_mercado: x.t_mercado + 60 })) }, a1), String(a1.eventos.length))
oraculo('TRAM', 'el tramo cortado es EXACTAMENTE avanzar de un tiron hasta donde llego (estado, y eventos y trades completos)', b1 != null && CA.serializa(deEnviado()) === CA.serializa(ref1.estado) && mismos(enviado(), a1), `${enviado()?.eventos?.length} / ${ref1.eventos.length}`)
oraculo('TRAM', 'los limites por defecto: 2.400 minutos de mercado, 6 s, 4 MB; sin tope de dias', CO.LIMITES?.minutos === 2400 && CO.LIMITES?.ms === 6000 && CO.LIMITES?.bytes === 4 * 1048576 && !('tramo' in (CO.LIMITES ?? {})), JSON.stringify(CO.LIMITES))

titulo('2 · el presupuesto de reloj: se corta entre trozos, nunca a medias')
llamadas = []
let t = 0
const reloj = () => { const x = t; t += 7000; return x }          // el primer trozo ya agota los 6 s
const r2 = await CO.ordenComando({ actor: u(1), cuerpo: av(lejos), puertos: puertos(fila(ep), { reloj }) })
const b2 = tras(D0, 60)
oraculo('TRAM', 'el reloj se agota tras el primer trozo: alcanzado = 60 minutos de mercado, cortado; un solo tramo a la RPC', r2.http === 200 && llamadas.length === 1 && r2.cuerpo?.alcanzado === b2 && r2.cuerpo.cortado === true, JSON.stringify(r2.cuerpo))
const ref2 = unTiron(ep, b2)
oraculo('TRAM', 'y es exactamente el avance de un tiron hasta ahi', CA.serializa(deEnviado()) === CA.serializa(ref2.estado), '')
const e2 = deEnviado()
llamadas = []
const r3 = await CO.ordenComando({ actor: u(1), cuerpo: av(b1, 1), puertos: puertos(fila(e2, 1)) })
oraculo('TRAM', 'encadenar (60 min y luego el resto hasta el corte de 2.400): el MISMO estado que un solo avance hasta ahi (nada a medias)', r3.http === 200 && r3.cuerpo?.alcanzado === b1 && CA.serializa(deEnviado()) === CA.serializa(ref1.estado), JSON.stringify(r3.cuerpo))
llamadas = []
const corto = D0 + 3600
const r4 = await CO.ordenComando({ actor: u(1), cuerpo: av(corto), puertos: puertos(fila(e0)) })
oraculo('TRAM', 'un avance que cabe: alcanzado = hasta, sin cortar', r4.http === 200 && r4.cuerpo?.alcanzado === corto && r4.cuerpo.cortado === false, JSON.stringify(r4.cuerpo))
oraculo('TRAM', 'el tope es un parametro (limites.minutos = 30): corta en 30 minutos de mercado', (await CO.ordenComando({ actor: u(1), cuerpo: av(corto), puertos: puertos(fila(e0), { limites: { minutos: 30 } }) })).cuerpo?.alcanzado === tras(D0 - 60, 30))

titulo('2b · un reto cortado en trozos (q.14.4)')
const RT = await importa('lib/motor/reto.mjs')
const i3 = SO.validaCrear({ session_id: u(1001), command_id: u(2001), epoca: 1, name: 'R', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '3F' }, { ahora: Date.parse('2026-10-14T10:00:00Z') }).intencion
const r0 = CR.estadoInicial(i3, fijados).estado
llamadas = []; t = 0
const rr1 = await CO.ordenComando({ actor: u(1), cuerpo: av(D0 + 86400), puertos: puertos(fila(r0), { reloj }) })
const rc1 = deEnviado()
const primerR = enviado()
llamadas = []
const rr2 = await CO.ordenComando({ actor: u(1), cuerpo: av(D0 + 86400, 1), puertos: puertos(fila(rc1, 1)) })
const rc2 = deEnviado()
const unoR = RT.avanzaReto(r0, D0 + 86400, fu)
// E3-02: los eventos y trades de los dos tramos, seguidos, = los de avanzaReto de un tiron (completos)
const aR = adaptado(r0, unoR, D0 + 86400)
const enviadosR = { eventos: [...(primerR?.eventos ?? []), ...(llamadas[0]?.a?.p_resultado?.eventos ?? [])], trades: [...(primerR?.trades ?? []), ...(llamadas[0]?.a?.p_resultado?.trades ?? [])] }
ver('control: el reto de un tiron tiene eventos que comparar', aR.eventos.length > 0, String(aR.eventos.length))
oraculo('TRAM', 'reto 3F: un trozo por reloj y luego el resto = avanzaReto de un tiron (estado, y eventos y trades completos de los dos tramos)', rr1.cuerpo?.cortado === true && rr2.cuerpo?.cortado === false && CA.serializa(rc2) === CA.serializa(unoR.reto) && mismos(enviadosR, aR), JSON.stringify({ c1: rr1.cuerpo, c2: rr2.cuerpo, n: [enviadosR.eventos.length, aR.eventos.length] }))

titulo('3 · lo que no se acota, y el tamaño')
llamadas = []
await CO.ordenComando({ actor: u(1), cuerpo: av(D0 + 300 * 86400, 0), puertos: puertos(fila(e2, 1)) })
oraculo('TRAM', 'un comando que no se calcula (version vieja) no se acota: va a la RPC, que decide', llamadas.length === 1 && llamadas[0].a.p_resultado?.motivo === 'no_calculado')
llamadas = []
await CO.ordenComando({ actor: u(1), cuerpo: av(corto), puertos: puertos(fila(e0)) })
const peso = llamadas[0]?.bytes ?? 0
ver('control: una hora va a la RPC y pesa menos de 4 MB', llamadas.length === 1 && peso < 4 * 1048576, String(peso))
llamadas = []
const r7 = await CO.ordenComando({ actor: u(1), cuerpo: av(corto), puertos: puertos(fila(e0), { limites: { bytes: peso - 1 } }) })
oraculo('TRAM', 'si la llamada pesa un byte mas que el limite: 413 resultado_demasiado_grande, sin RPC', r7.http === 413 && r7.cuerpo?.motivo === 'resultado_demasiado_grande' && llamadas.length === 0, JSON.stringify(r7))
fin()
