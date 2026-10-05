/**
 * D01 · RECARGAR PIERDE LAS POSICIONES ABIERTAS Y LAS PENDIENTES; UN SALDO 0 SE LEE COMO 10.000
 *
 * Astra (4-oct): las posiciones y las limit viven solo en memoria
 * (pairState); nada las guarda ni las lee de la base. El saldo se restaura con
 * `parseFloat(data.balance) || parseFloat(data.capital) || 10000`
 * (components/_SessionInner.js:706): un 0 guardado es «falso» y vuelve el
 * capital. Y el guardado al salir (_SessionInner.js:1344) es un builder de
 * PostgREST sin await ni then: no se ejecuta nunca.
 *
 * Se ejecuta: la PAGINA DE SESION REAL (components/_SessionInner.js) con el
 * React falso, sin grafico (los refs de callback no se modelan, asi que el
 * chart de lightweight-charts nunca se crea). La compra va por el boton Buy y
 * el OrderModal REAL (cargado por next/dynamic). Salir = desmontar; volver =
 * montar otra vez sobre la misma base. Las velas, por /api/candles REAL.
 *
 * ORACULOS:
 *   · saldo guardado 0 con capital 10.000 → la pagina enseña Balance $0.00
 *   · al salir con una posicion abierta, se guarda algo (al menos el saldo y
 *     last_timestamp)
 * ⚠️ LIMITES (H08, revision de Astra): el reloj NO se avanza antes de salir;
 *    no prueba que se guarde un cursor movido, ni la reanudacion en el punto
 *    exacto. La aceptacion de la cartera durable lo exigira (A15, A16, A22).
 *     (al menos last_timestamp y el saldo)
 *   · al volver, la posicion abierta sigue: «1 POS»
 *   · (limit pendiente: el loader crea el estado del par SIN `orders` y nada
 *     lee pendientes de la base — se comprueba en la fuente, ver seccion 4)
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, importa, monta, router, db, vela, fuente } from '../lib.mjs'
import { velasEnStorage } from '../banco-motor.mjs'
const Sesion = (await importa('components/_SessionInner.js')).default
const T = Date.parse('2025-03-03T10:00:00Z') / 1000
const VELAS = Array.from({ length: 30 }, (_, i) => vela(T + i * 60, 1.1, 1.1002, 1.0998, 1.1))
const entra = async () => { const p = monta(Sesion, {}); await p.asienta(300); return p }
// el contador es un boton «N POS» de la barra inferior (no aparece si no hay posiciones)
const pos = p => { const b = p.busca(x => x.tipo === 'button' && /^\d+ POS$/.test(p.texto(x).trim())); return b ? p.texto(b).trim().split(' ')[0] : '0' }
const saldo = p => /Balance: \$([\d.,-]+)/.exec(p.texto())?.[1]

titulo('1 · saldo guardado 0')
escenario({ sim_sessions: [sesionSim({ id: 'ses0', balance: 0, capital: 10000 })] })
velasEnStorage('EUR/USD', VELAS, [2024], { tramoAbierto: true }); router.query = { id: 'ses0' }
const p0 = await entra()
ver('control: la pagina cargo la sesion (sin errores de pintado)', p0.errores.length === 0 && /Sesion/.test(p0.texto()), p0.errores.map(e => e.message).join(';'))
oraculo('D01', 'saldo guardado 0 → la pagina enseña $0.00', saldo(p0) === '0.00', `enseña $${saldo(p0)}`)
p0.desmonta()

titulo('2 · una compra a mercado y salir')
const ses = sesionSim({ id: 'ses1', balance: 10000, capital: 10000 })
escenario({ sim_sessions: [ses] })
velasEnStorage('EUR/USD', VELAS, [2024], { tramoAbierto: true }); router.query = { id: 'ses1' }
const p1 = await entra()
ver('control: el boton Buy esta activo (datos y precio cargados)', p1.boton('▲ Buy')?.props.disabled === false)
p1.pulsa(p1.boton('▲ Buy')); await p1.asienta(100)
ver('control: se abrio el OrderModal real', /BUY MARKET/.test(p1.texto()))
p1.pulsa(p1.boton('Ejecutar Buy')); await p1.asienta(100)
ver('control: la pagina enseña 1 POS', pos(p1) === '1', pos(p1))
const escrituras = () => db.log.filter(l => ['insert', 'update', 'upsert'].includes(l.op) && !l.tabla.startsWith('storage'))
const antes = escrituras().length
ver('control: abrir la posicion no escribio nada en la base', antes === 0 || !escrituras().some(l => /entry|position/i.test(JSON.stringify(l.payload))), JSON.stringify(escrituras().map(l => [l.tabla, Object.keys(l.payload || {})])))
p1.desmonta(); await new Promise(r => setTimeout(r, 100))
const todasAlSalir = escrituras().slice(antes)
ver('control: la limpieza de salida SI corrio (guardo los dibujos: session_drawings)', todasAlSalir.some(l => l.tabla === 'session_drawings'), JSON.stringify(todasAlSalir.map(l => l.tabla)))
const alSalir = todasAlSalir.filter(l => l.tabla === 'sim_sessions')
oraculo('D01', 'al salir se guarda el progreso (update de sim_sessions)', alSalir.length > 0, `${alSalir.length} escrituras al salir`)

titulo('3 · volver a entrar')
const p2 = await entra()
ver('control: la pagina volvio a cargar con datos', p2.boton('▲ Buy')?.props.disabled === false)
oraculo('D01', 'la posicion abierta sigue al volver (1 POS)', pos(p2) === '1', `enseña ${pos(p2)} POS`)
p2.desmonta()

titulo('4 · las limit pendientes (lectura)')
const pd = fuente('components/usePairData.js'), si = fuente('components/_SessionInner.js')
ver('control (lectura): el loader crea el par sin `orders`', /const ps=\{engine,ready:true,positions:\[\],trades:\[\],/.test(pd))
oraculo('D01', 'algo lee posiciones o pendientes de la base al cargar', /from\(['"]sim_(positions|orders)|open_positions|pending_orders/.test(pd + si), 'ni usePairData ni _SessionInner leen posiciones/pendientes')
fin()
