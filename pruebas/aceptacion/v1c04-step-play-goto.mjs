/**
 * V1C04 · STEP, PLAY Y GO TO COMO EL COMANDO AVANZAR (etapa 2 del motor, pieza 4; plan-etapa2.md; orden 1-122). Escrita
 * ANTES que el codigo: no hay lib/sim/v1/avance.js y el servidor no para el Play en la vela de un evento (en rojo).
 *   Step = avanzar 1 vela M1 del par visible (motivo paso); Go to = avanzar en tramos (motivo goto; LIMITES del
 *   servidor, aqui 7 minutos para forzar varios); Play = lotes de N velas por delante (motivo play), animadas en el
 *   navegador; un fill, un cierre o un breach paran la ANIMACION del Play en su vela (el recibo del lote trae sus
 *   paradas; el servidor NO corta el lote: el contrato de S4-08/E3-02 no cambia, ver la nota de abajo).
 *   A · Step = Play = Go to vela a vela: el mismo estado final, los mismos eventos y los mismos trades (practica con un
 *       SL que salta y una limit que se llena en el minuto 10, y un TP en el 20); el Play para en el 10 y en el 20 y
 *       anima cada vela una vez; el Go to no para en los eventos
 *   B · reto: el Play para en la vela del breach; despues no avanza
 *   C · Step rapido (mas de 10/s, con el tope de sim-006 agotado): 429 demasiados_pasos, reintento con la MISMA clave
 *       tras reintentar_en_ms; ni se pierde ni se duplica un avance
 *   D · respuesta perdida (despues y antes de llegar) en el Step y en el Play: reintento con la misma clave, ni de mas
 *       ni de menos
 *   E · apagado: ninguna pagina ni componente importa lib/sim/v1/ (la pantalla de hoy no cambia)
 * Contra el servidor REAL (lib/servidor) y sim_comando en PostgreSQL desechable (montaje-v1 + sim-004b + sim-006, con
 * el hueco de su guarda sustituido como en pruebas/sim-006.mjs). Lo unico doble es el transporte. Datos inventados.
 * Mercado: EURUSD 1,1 hasta el minuto 10 del 6-ene-2025; 1,09 del 10 al 19; 1,1 desde el 20. El resto, constante.
 *
 * NOTA (tras el rojo, antes del verde): la primera version esperaba que el SERVIDOR cortase el lote del Play en la vela
 * del evento. Hacerlo cambiaba el calculo de todo avanzar con motivo play, y servidor-tramos y motor/tramos-fuentes
 * (contrato S4-08/E3-02, que usan motivo play como avance grande) se ponian en rojo. Se cambio a parar la animacion
 * con las paradas del recibo; A mira ahora la vela MOSTRADA (av.mostrado), no el cursor confirmado.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, importa, REPO } from '../lib.mjs'
import { hayPostgres } from '../pg-ensayo.mjs'
import { montajeV1, L, conUidDelMontaje } from '../montaje-v1.mjs'
import { cerrojoEnMemoria } from '../cerrojo-falso.mjs'
const AV = await importa('lib/sim/v1/avance.js').catch(() => null)
const N = 18
if (!AV?.creaAvance) { for (let i = 0; i < N; i++) oraculo('V1C04', `caso ${i}: sin lib/sim/v1/avance.js no se puede`, false, 'no esta'); fin() }
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const C = await importa('lib/sim/v1/cliente.js'), OR = await importa('lib/sim/v1/ordenes.js'), VI = await importa('lib/sim/v1/vista.js')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs')
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c04)';") }
const S4B = conUidDelMontaje(lee('sql/sim-004b-contrato-v1.sql')), S6 = deEnsayo(lee('sql/sim-006-tope-de-pasos.sql'))

const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const M0 = U('2025-01-06T00:00:00Z'), m = k => M0 + 60 * k
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
const precioEn = (par, t) => (par === 'EURUSD' && t >= m(10) && t < m(20) ? 1.09 : PX[par])
function velasDe(par) { const o = []; for (let t = M0; t < U('2025-01-11T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const p = precioEn(par, t); o.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 }) } return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
// las velas M1 del par visible, como las tiene cargadas la pantalla (solo sus tiempos)
const TIEMPOS = velasDe('EURUSD').map(v => v.time)
const web = () => { const o = new Map(); return { getItem: k => (o.has(k) ? o.get(k) : null), setItem: (k, v) => o.set(k, String(v)), removeItem: k => o.delete(k) } }
const AL = u(1)
let nId = 90000

const pg = montajeV1()
try {
  pg.arranca()
  // una base con sim-004b y sim-006, una sesion, su cliente y su avance; transporte doble con fallos a la carta
  async function sesion(d, sid, { reto = null, limites = null } = {}) {
    pg.base(d)
    const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
    ver(`control (${d}): sim-004b y sim-006 aplicadas`, a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
    pg.alumno(d, AL)
    const leeSesion = async id => { const t = pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
    const puertos = { almacen: mercado, rpc: pg.rpc(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z'), ...(limites ? { limites } : {}) }
    const orden = { '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado }
    const fallos = [], vistos = []
    async function llama(ruta, { cuerpo }) {
      const f = fallos.length && ruta === '/api/sim/comando' && (!fallos[0].motivo || fallos[0].motivo === cuerpo?.motivo) ? fallos.shift() : null
      if (f?.pierde === 'antes') { vistos.push({ ruta, command_id: cuerpo?.command_id, motivo: cuerpo?.motivo, http: null }); throw new Error('red: la peticion no llego') }
      const r = await orden[ruta]({ actor: AL, cuerpo, puertos })
      if (ruta === '/api/sim/comando') vistos.push({ ruta, command_id: cuerpo.command_id, tipo: cuerpo.tipo, motivo: cuerpo.motivo ?? null, hasta: cuerpo.hasta ?? null, http: r.http, motivo_r: r.cuerpo?.motivo ?? null, repetido: r.cuerpo?.repetido === true, alcanzado: r.cuerpo?.alcanzado ?? null })
      // los 5 s del goto: pasa el tiempo (como v1c01); el tope de los pasos se espera de verdad (≤ 1 s)
      if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') pg.uno(d, 'update public.sim_alumnos set siguiente_avance_desde = null')
      if (f?.pierde === 'despues') throw new Error('red: la respuesta se perdio')
      return { http: r.http, cuerpo: r.cuerpo }
    }
    ver(`control (${d}): sesion creada`, (await CR.ordenCrear({ actor: AL, cuerpo: { session_id: sid, command_id: u(++nId), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'M1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: reto }, puertos })).http === 201)
    const c = C.creaCliente({ sessionId: sid, usuario: AL, epoca: 1, llama, local: web(), sesion: web(), nuevoId: () => u(++nId), plazoMs: 3000, espera429Ms: 5 })
    await c.toma(); await c.leeEstado()
    const animadas = []
    const av = AV.creaAvance({ cliente: c, tiempos: () => TIEMPOS, alAnimar: async velas => { animadas.push(...velas) } })
    const uno = q => pg.uno(d, q)
    const eventos = () => JSON.parse(uno(`select coalesce(json_agg(json_build_object('tipo', tipo, 't', t_mercado, 'datos', datos) order by seq), '[]')::text from public.sim_eventos where session_id = ${L(sid)}`))
    const trades = () => JSON.parse(uno(`select coalesce(json_agg(json_build_object('pair', pair, 'side', side, 'entry', entry_price, 'exit', exit_price, 'pnl', pnl, 'neto', neto_micro, 'cerrado', closed_at) order by closed_at, evento_id), '[]')::text from public.sim_trades where session_id = ${L(sid)}`))
    const fila = async () => leeSesion(sid)
    return { c, av, fallos, vistos, animadas, uno, eventos, trades, fila, envia: x => c.envia(x.tipo, x.carga) }
  }
  const cursorDe = e => (e?.estado?.esquema === 'reto@1' ? e.estado.horizonte : e?.estado?.reloj?.cursor) ?? null
  const velasEntre = (a, b) => TIEMPOS.filter(t => t > a && t <= b)
  // la misma practica en las tres sesiones: hasta el minuto 2, compra a mercado con SL 1,095 y una BUY LIMIT 1,0901 con TP 1,095
  async function prepara(s) {
    await s.av.irA(m(2))
    const a = await s.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, sl: 1.095, cursor: m(2) }))
    const b = await s.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY_LIMIT', entry: 1.0901, lots: 1, tp: 1.095 }))
    return a.conclusion === 'confirmado' && b.conclusion === 'confirmado' && cursorDe(s.c.estado) === m(2)
  }

  titulo('A · Step = Play = Go to vela a vela')
  const sS = await sesion('p4s', u(1101)), sP = await sesion('p4p', u(1102)), sG = await sesion('p4g', u(1103), { limites: { minutos: 7 } })
  ver('control: las tres sesiones preparadas igual (minuto 2, una posicion y una limit)', (await prepara(sS)) && (await prepara(sP)) && (await prepara(sG)))
  const animadasAntes = { s: sS.animadas.length, p: sP.animadas.length }
  let pasos = 0
  while ((cursorDe(sS.c.estado) ?? 0) < m(30) && pasos < 40) { const r = await sS.av.paso(); if (r.conclusion !== 'confirmado') break; pasos++ }
  oraculo('V1C04', 'A · Step: 28 pasos confirmados, uno por vela M1 (motivo paso), hasta el minuto 30', pasos === 28 && cursorDe(sS.c.estado) === m(30) && sS.vistos.filter(v => v.motivo === 'paso' && v.http === 200).length === 28, tx({ pasos, cursor: cursorDe(sS.c.estado) }))
  const paradas = []
  for (let k = 0; k < 6 && (sP.av.mostrado ?? 0) < m(30); k++) { const r = await sP.av.play({ lote: 10, hasta: m(30) }); paradas.push({ conclusion: r.conclusion, en: sP.av.mostrado, confirmado: cursorDe(sP.c.estado), parada: r.parada?.tipos?.join('+') ?? null }) }
  const min = x => (x == null ? null : (x - M0) / 60)
  oraculo('V1C04', 'A · Play (lotes de 10): la animacion para en la vela del fill y el SL del minuto 10, en la del TP del 20, y llega al 30', paradas.length === 3 && paradas[0].conclusion === 'parado' && paradas[0].en === m(10) && paradas[0].parada?.split('+').sort().join('+') === 'cierre+fill' && paradas[1].conclusion === 'parado' && paradas[1].en === m(20) && paradas[1].parada === 'cierre' && paradas[2].conclusion === 'llegado' && paradas[2].en === m(30) && cursorDe(sP.c.estado) === m(30), tx(paradas.map(p => ({ ...p, en: min(p.en), confirmado: min(p.confirmado) }))))
  const anP = sP.animadas.slice(animadasAntes.p)
  oraculo('V1C04', 'A · el Play anima cada vela del par visible UNA vez y en orden (minutos 3 a 30)', tx(anP) === tx(velasEntre(m(2), m(30))), tx(anP.map(t => (t - M0) / 60)))
  const rG = await sG.av.irA(m(30))
  const tramos = sG.vistos.filter(v => v.motivo === 'goto' && v.http === 200 && v.hasta === m(30)).map(v => (v.alcanzado - M0) / 60)
  oraculo('V1C04', 'A · Go to: llega al 30 en tramos de 7 minutos (9, 16, 23, 30), cada uno tras el 429 de los 5 s gestionado por el cliente, sin parar en los eventos del 10 y el 20', rG.conclusion === 'llegado' && cursorDe(sG.c.estado) === m(30) && tx(tramos) === tx([9, 16, 23, 30]) && sG.vistos.filter(v => v.motivo === 'goto' && v.http === 429).length >= 3, tx({ c: rG.conclusion, tramos, n429: sG.vistos.filter(v => v.http === 429).length }))
  const fS = await sS.fila(), fP = await sP.fila(), fG = await sG.fila()
  oraculo('V1C04', 'A · el mismo estado final en los tres modos (estado guardado entero)', tx(fS.estado) === tx(fP.estado) && tx(fS.estado) === tx(fG.estado), tx({ s: fS.estado?.saldo_µ, p: fP.estado?.saldo_µ, g: fG.estado?.saldo_µ }))
  const eS = sS.eventos(), eP = sP.eventos(), eG = sG.eventos()
  const tipos = eS.map(e => `${e.tipo}@${(e.t - M0) / 60}`)
  oraculo('V1C04', 'A · los mismos eventos en los tres (tipo, minuto y datos), con el fill y el SL en el 10 y el TP en el 20', tx(eS) === tx(eP) && tx(eS) === tx(eG) && tipos.filter(t => t === 'fill@10').length === 1 && tipos.filter(t => t === 'cierre@10').length === 1 && tipos.includes('cierre@20'), tx(tipos))
  oraculo('V1C04', 'A · los mismos trades en los tres (dos, con su neto)', tx(sS.trades()) === tx(sP.trades()) && tx(sS.trades()) === tx(sG.trades()) && sS.trades().length === 2, tx(sS.trades().map(t => t.neto)))
  const resP = JSON.parse(sP.uno(`select resumen::text from public.sim_recibos where session_id = ${L(u(1102))} and tipo = 'avanzar' and resumen ? 'paradas' order by id limit 1`) || 'null')
  oraculo('V1C04', 'A · el recibo del primer lote (2 → 12, sin cortar) lista sus paradas: el fill y el cierre del minuto 10; el Step y el Go to no las llevan', resP?.alcanzado === m(12) && resP.cortado === false && tx(resP.paradas.map(p => p.tipo + '@' + min(p.t)).sort()) === tx(['cierre@10', 'fill@10']) && Number(sS.uno(`select count(*) from public.sim_recibos where resumen ? 'paradas'`)) === 0 && Number(sG.uno(`select count(*) from public.sim_recibos where resumen ? 'paradas'`)) === 0, tx(resP && { paradas: resP.paradas, alcanzado: min(resP.alcanzado), cortado: resP.cortado }))

  titulo('B · reto: el Play para en el breach')
  const sR = await sesion('p4r', u(1201), { reto: '2F' })
  await sR.av.irA(m(5))
  ver('control: 6 lotes a mercado en el minuto 5', (await sR.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 6, cursor: m(5) }))).conclusion === 'confirmado')
  const pr = await sR.av.play({ lote: 10 })
  oraculo('V1C04', 'B · el Play para en la vela del breach (minuto 10), con el reto en breach', pr.conclusion === 'parado' && pr.parada?.tipo === 'breach' && cursorDe(sR.c.estado) === m(10) && sR.c.estado.estado.estado === 'breach', tx({ c: pr.conclusion, p: pr.parada, en: (cursorDe(sR.c.estado) - M0) / 60 }))
  const n0 = sR.vistos.length, pr2 = await sR.av.play({ lote: 10 })
  oraculo('V1C04', 'B · tras el breach, otro Play no avanza: termina (como mucho un comando, sin progreso)', pr2.conclusion === 'terminada' && cursorDe(sR.c.estado) === m(10) && sR.vistos.length - n0 <= 1, tx({ c: pr2.conclusion, comandos: sR.vistos.length - n0 }))

  titulo('C · Step rapido: mas de 10 por segundo')
  const sQ = await sesion('p4q', u(1301))
  await sQ.av.irA(m(2))
  const c0 = cursorDe(sQ.c.estado), v0 = sQ.c.estado.version
  sQ.uno(`update public.sim_alumnos set pasos_ventana_desde = clock_timestamp(), pasos_en_ventana = 10 where user_id = ${L(AL)}`)
  const n1 = sQ.vistos.length
  const rs = await Promise.all(Array.from({ length: 15 }, () => sQ.av.paso()))
  const vq = sQ.vistos.slice(n1)
  const e429 = vq.filter(v => v.http === 429 && v.motivo_r === 'demasiados_pasos')
  oraculo('V1C04', 'C · el servidor contesta 429 demasiados_pasos (tope de sim-006) al Step rapido', e429.length >= 1, tx(vq.map(v => v.http)))
  const ok = vq.filter(v => v.http === 200)
  oraculo('V1C04', 'C · cada 429 se reintenta con la MISMA clave y se confirma; 15 claves distintas confirmadas una vez cada una', e429.every(e => ok.some(o => o.command_id === e.command_id)) && new Set(ok.map(o => o.command_id)).size === 15 && ok.length === 15 && rs.every(r => r.conclusion === 'confirmado'), tx({ ok: ok.length, claves: new Set(ok.map(o => o.command_id)).size, conclusiones: [...new Set(rs.map(r => r.conclusion))] }))
  oraculo('V1C04', 'C · ni se pierde ni se duplica: 15 velas exactas y 15 versiones', cursorDe(sQ.c.estado) === TIEMPOS[TIEMPOS.indexOf(c0) + 15] && sQ.c.estado.version === v0 + 15, tx({ velas: TIEMPOS.indexOf(cursorDe(sQ.c.estado)) - TIEMPOS.indexOf(c0), versiones: sQ.c.estado.version - v0 }))

  titulo('D · respuesta perdida y reintento')
  const sD = await sesion('p4d', u(1401))
  await sD.av.irA(m(2))
  const d0 = cursorDe(sD.c.estado), dv = sD.c.estado.version
  sD.fallos.push({ pierde: 'despues', motivo: 'paso' })
  const p1 = await sD.av.paso()
  oraculo('V1C04', 'D · Step con la respuesta perdida tras confirmarse: incierto y en la cola (la pantalla no lo da por hecho)', p1.conclusion === 'incierto' && sD.c.pendientes().length === 1, tx({ c: p1.conclusion, cola: sD.c.pendientes().length }))
  const p2 = await sD.av.paso()
  const re = sD.vistos.filter(v => v.command_id === sD.vistos.find(x => x.motivo === 'paso').command_id)
  oraculo('V1C04', 'D · el siguiente Step reenvia la MISMA clave (recibo repetido) y luego avanza: 2 velas, 2 versiones, ni 1 ni 3', p2.conclusion === 'confirmado' && re.length === 2 && re[1].repetido && cursorDe(sD.c.estado) === TIEMPOS[TIEMPOS.indexOf(d0) + 2] && sD.c.estado.version === dv + 2, tx({ re: re.map(x => x.http + (x.repetido ? 'r' : '')), velas: TIEMPOS.indexOf(cursorDe(sD.c.estado)) - TIEMPOS.indexOf(d0) }))
  sD.fallos.push({ pierde: 'antes', motivo: 'paso' })
  const d1 = cursorDe(sD.c.estado)
  const p3 = await sD.av.paso(), p4 = await sD.av.paso()
  oraculo('V1C04', 'D · peticion que no llega: incierto; el siguiente Step la envia una vez y luego el suyo: 2 velas', p3.conclusion === 'incierto' && p4.conclusion === 'confirmado' && cursorDe(sD.c.estado) === TIEMPOS[TIEMPOS.indexOf(d1) + 2] && sD.c.pendientes().length === 0, tx({ p3: p3.conclusion, p4: p4.conclusion, velas: TIEMPOS.indexOf(cursorDe(sD.c.estado)) - TIEMPOS.indexOf(d1) }))
  const d2 = cursorDe(sD.c.estado), an0 = sD.animadas.length
  sD.fallos.push({ pierde: 'despues', motivo: 'play' })
  const q1 = await sD.av.play({ lote: 3, hasta: TIEMPOS[TIEMPOS.indexOf(d2) + 9] })
  const q2 = await sD.av.play({ lote: 3, hasta: TIEMPOS[TIEMPOS.indexOf(d2) + 9] })
  const anD = sD.animadas.slice(an0)
  oraculo('V1C04', 'D · Play con una respuesta perdida: para incierto; al reanudar recupera la misma clave y llega: 9 velas exactas, cada una animada una vez',
    q1.conclusion === 'incierto' && q2.conclusion === 'llegado' && cursorDe(sD.c.estado) === TIEMPOS[TIEMPOS.indexOf(d2) + 9] && tx(anD) === tx(velasEntre(d2, TIEMPOS[TIEMPOS.indexOf(d2) + 9])), tx({ q1: q1.conclusion, q2: q2.conclusion, animadas: anD.length }))

  titulo('E · apagado')
  const usos = []
  const recorre = dir => { if (!existsSync(dir)) return; for (const n of readdirSync(dir)) { const p = path.join(dir, n); if (statSync(p).isDirectory()) recorre(p); else if (/\.(js|jsx|mjs)$/.test(n) && /sim\/v1\//.test(readFileSync(p, 'utf8'))) usos.push(path.relative(REPO, p)) } }
  recorre(path.join(REPO, 'pages')); recorre(path.join(REPO, 'components'))
  oraculo('V1C04', 'E · ninguna pagina ni componente importa lib/sim/v1/: con todo apagado la pantalla de hoy no cambia', usos.length === 0, tx(usos))
} finally { pg.cierra() }
fin()
