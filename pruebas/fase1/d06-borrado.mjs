/**
 * D06 · BORRAR UNA SESION PUEDE SER UN EXITO SOLO VISUAL; EL WIPE PUEDE QUEDAR A MEDIAS
 *
 * Astra (4-oct): A) el dashboard borra con cuatro deletes en Promise.all y no
 * mira ningun { error } (pages/dashboard.js:287-295): la tarjeta se quita igual,
 * y TRADES TAKEN / TOTAL P&L siguen contando los trades de la sesion. B) el
 * wipe de admin borra tabla a tabla y revoca el acceso AL FINAL
 * (pages/api/admin/wipe-simulador.js:64-102): si falla a mitad, el libro ya se
 * perdio y el acceso sigue activo. C) la lista del wipe no incluye
 * user_chart_config ni user_tool_config.
 *
 * Se ejecuta: el dashboard REAL (React falso) y el handler REAL del wipe sobre
 * la base falsa. ⚠️ La base falsa NO tiene cascadas: una FK ON DELETE CASCADE
 * real podria completar parte del borrado de A y de C; la consulta s04 lo dira.
 *
 * ORACULOS:
 *   A: si los cuatro deletes devuelven error, la tarjeta sigue y se dice que no
 *      se ha borrado.
 *   B: tras un wipe que falla a mitad, o no se ha borrado nada, o el acceso ya
 *      esta revocado (estado reanudable, nunca «libro perdido y acceso activo»).
 *   C: tras un wipe con exito, cero filas del alumno en las 7 tablas del
 *      simulador.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, tradeSim, perfil, db, importa, monta, A, B, ADM, tok, asienta } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
const Dashboard = (await importa('pages/dashboard.js')).default
const wipe = (await importa('pages/api/admin/wipe-simulador.js')).default

titulo('A · el dashboard con los cuatro deletes en error')
const ses = sesionSim({ name: 'Sesion-A-uno' })
escenario({ sim_sessions: [ses], sim_trades: [tradeSim({ session_id: ses.id, pnl: 250 }), tradeSim({ session_id: ses.id, pnl: 150 })] })
const p = monta(Dashboard, {}); await p.asienta()
// el dashboard pinta el valor delante de la etiqueta: «2TRADES TAKEN», «+$400.00TOTAL P&L»
const metricas = () => ({ trades: /(\d+)TRADES TAKEN/.exec(p.texto())?.[1], pnl: /([+-]\$[\d.,]+)TOTAL P&L/.exec(p.texto())?.[1] })
ver('control: la tarjeta y los dos trades (+400) en pantalla', p.texto().includes('Sesion-A-uno') && metricas().trades === '2' && metricas().pnl === '+$400.00', JSON.stringify(metricas()))
db.falla = c => c.op === 'delete' ? { message: 'permission denied for table ' + c.tabla, code: '42501' } : null
const boton = p.busca(x => x.tipo === 'button' && p.texto(x) === '✕')
p.pulsa(boton); await p.asienta()
ver('control: se intento borrar, fallo, y la base sigue con la sesion y sus 2 trades', db.log.some(l => l.op === 'delete') && db.tablas.sim_sessions.length === 1 && db.tablas.sim_trades.length === 2)
oraculo('D06', 'A: la tarjeta sigue (no se borro nada)', p.texto().includes('Sesion-A-uno'), p.texto().includes('Sesion-A-uno') ? '' : 'la tarjeta desaparece')
oraculo('D06', 'A: y se dice que no se ha podido borrar', /no se ha podido|error/i.test(p.texto()), /no se ha podido|error/i.test(p.texto()) ? '' : 'ningun aviso')
p.desmonta()

titulo('A2 · el mismo borrado, esta vez con exito')
escenario({ sim_sessions: [ses], sim_trades: [tradeSim({ session_id: ses.id, pnl: 250 }), tradeSim({ session_id: ses.id, pnl: 150 })] })
const p2 = monta(Dashboard, {}); await p2.asienta()
p2.pulsa(p2.busca(x => x.tipo === 'button' && p2.texto(x) === '✕')); await p2.asienta()
const m2 = { trades: /(\d+)TRADES TAKEN/.exec(p2.texto())?.[1], pnl: /([+-]\$[\d.,]+)TOTAL P&L/.exec(p2.texto())?.[1] }
ver('control: la base quedo sin la sesion ni sus trades, y la tarjeta se fue', db.tablas.sim_sessions.length === 0 && db.tablas.sim_trades.length === 0 && !p2.texto().includes('Sesion-A-uno'))
oraculo('D06', 'A2: tras borrar, las metricas ya no cuentan esos trades (0 y +$0.00)', m2.trades === '0' && m2.pnl === '+$0.00', `siguen: ${m2.trades} trades, ${m2.pnl}`)
p2.desmonta()

titulo('B · wipe que falla al borrar los dibujos')
const sA = sesionSim({ id: 'sA' })
const montaWipe = () => escenario({ sesion: ADM, perfiles: [perfil(A), perfil(B), perfil(ADM, { rol_global: 'admin' })], sim_sessions: [sA],
  sim_trades: [tradeSim({ session_id: 'sA' }), tradeSim({ session_id: 'sA' })],
  otras: { session_drawings: [{ id: 'd1', user_id: A, session_id: 'sA' }], session_chart_config: [{ id: 'c1', user_id: A, session_id: 'sA' }],
    sim_drawing_templates: [{ id: 'p1', user_id: A }], user_chart_config: [{ id: 'u1', user_id: A }], user_tool_config: [{ id: 'u2', user_id: A }] } })
montaWipe()
db.falla = c => c.tabla === 'session_drawings' && c.op === 'delete' ? { message: 'statement timeout', code: '57014' } : null
const rb = await llama(wipe, { method: 'POST', token: tok(ADM), body: { user_id: A, confirm_email: 'a@ejemplo.test' } })
const trades = db.tablas.sim_trades.filter(t => t.user_id === A).length
const acceso = db.tablas.profiles.find(x => x.id === A).simulador_activo
ver('control: el wipe respondio 500 «INCOMPLETO»', rb.estado === 500 && /INCOMPLETO/.test(rb.cuerpo.error), rb.cuerpo?.error)
oraculo('D06', 'B: o no se borro nada, o el acceso ya esta revocado', trades === 2 || acceso === false, `trades del alumno: ${trades} de 2; simulador_activo: ${acceso}`)

titulo('C · wipe con exito')
montaWipe()
const rc = await llama(wipe, { method: 'POST', token: tok(ADM), body: { user_id: A, confirm_email: 'a@ejemplo.test' } })
ver('control: 200 y acceso revocado', rc.estado === 200 && db.tablas.profiles.find(x => x.id === A).simulador_activo === false, JSON.stringify(rc.cuerpo?.deleted))
const TABLAS = ['sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']
const quedan = TABLAS.map(t => [t, (db.tablas[t] || []).filter(f => f.user_id === A).length]).filter(([, n]) => n)
oraculo('D06', 'C: cero filas del alumno en las 7 tablas del simulador', quedan.length === 0, `quedan: ${quedan.map(([t, n]) => `${t} ${n}`).join(', ')}`)
fin()
