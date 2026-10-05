/**
 * EL ARNES SE COMPRUEBA ANTES QUE NADA: si el arnes miente, todo lo demas tambien.
 *
 *   1. la red esta cortada (fetch, https, net, dns) y no hay secretos en el entorno
 *   1b. H01: tambien en el hilo del cargador, en workers, en hijos node y, a
 *       nivel de sistema, en cualquier subproceso (sandbox-exec / unshare)
 *   2. lo que el repo importa como Supabase es el doble (navegador y servidor),
 *      y el proveedor de velas que importa /api/candles es el falso
 *   3. el doble de Supabase es PEREZOSO como PostgREST: un builder sin then no
 *      ejecuta nada (D01 depende de esto); control positivo: con then, si
 *   4. el doble de Storage guarda y devuelve contenido; los errores se devuelven
 */
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { Worker } from 'node:worker_threads'
import { spawnSync } from 'node:child_process'
import { titulo, ver, fin, importa, escenario, db, proveedor, A, tok } from './lib.mjs'
import { llama } from './supabase-falso.mjs'
import { diaM1 } from './proveedor-falso.mjs'

titulo('1 · sin red y sin secretos')
let corte = ''
try { await fetch('https://example.com/') } catch (e) { corte = e.message }
ver('fetch a internet lanza RED BLOQUEADA', /RED BLOQUEADA/.test(corte), corte)
let h = ''; try { https.request('https://example.com') } catch (e) { h = e.message }
ver('https.request bloqueado', /RED BLOQUEADA/.test(h))
let nn = ''; try { net.connect(443, 'example.com') } catch (e) { nn = e.message }
ver('net.connect bloqueado', /RED BLOQUEADA/.test(nn))
ver('ninguna variable de Supabase en el entorno', !Object.keys(process.env).some(k => /SUPABASE|DIAG_CREDS/.test(k)), Object.keys(process.env).join(','))

let t = ''; try { tls.connect(443, 'example.com') } catch (e) { t = e.message }
ver('tls.connect bloqueado', /RED BLOQUEADA/.test(t))
let sk = ''; try { new net.Socket().connect(443, '93.184.215.14') } catch (e) { sk = e.message }
ver('un net.Socket construido a mano no conecta', /RED BLOQUEADA/.test(sk))

titulo('1b · H01: cargador, workers, hijos y sistema')
const sonda = (await import('falso:sonda-red')).default
ver('el hilo del cargador tiene la red cortada (net y fetch)', sonda.sinRed && /RED BLOQUEADA/.test(sonda.net) && /RED BLOQUEADA/.test(sonda.fetch), JSON.stringify(sonda))
const enWorker = await new Promise(ok => {
  const w = new Worker(`const { parentPort } = require('node:worker_threads');
    fetch('https://example.com').then(() => parentPort.postMessage('RESPONDE')).catch(e => parentPort.postMessage(e.message))`, { eval: true })
  w.once('message', m => { ok(m); w.terminate() }); w.once('error', e => ok('error: ' + e.message))
})
ver('un worker hereda el corte', /RED BLOQUEADA/.test(enWorker), enWorker)
const { connect: connectConNombre } = await import('node:net')
let cn = ''; try { connectConNombre(443, '93.184.215.14') } catch (e) { cn = e.message }
ver('control: `import { connect } from node:net` tambien esta cortado', /RED BLOQUEADA/.test(cn), cn)
const hijo = spawnSync(process.execPath, ['-e', "fetch('https://example.com').then(()=>console.log('RESPONDE')).catch(e=>console.log(e.message))"], { encoding: 'utf8', timeout: 20000 })
ver('un hijo node hereda el corte (NODE_OPTIONS)', /RED BLOQUEADA/.test(hijo.stdout), (hijo.stdout || hijo.stderr).trim().slice(0, 80))
const modo = process.env.PRUEBAS_AISLADO
ver('el guion aislo la prueba a nivel de sistema', modo === 'sandbox-exec' || modo === 'unshare', modo ?? '(sin guion)')
if (modo === 'sandbox-exec' || modo === 'unshare') {
  // curl no es node: solo lo para el sistema. Con sandbox-exec la resolucion de
  // nombres funciona y la CONEXION se deniega (curl 7): eso distingue «el
  // sandbox la corta» de «no hay internet» (curl 6, no resuelve).
  const c = spawnSync('/usr/bin/curl', ['-sS', '--max-time', '8', 'https://example.com', '-o', '/dev/null'], { encoding: 'utf8', timeout: 20000 })
  ver('un subproceso que no es node (curl) no sale a la red', c.status !== 0, `curl ${c.status}: ${(c.stderr || '').trim().slice(0, 70)}`)
  if (modo === 'sandbox-exec') ver('control: curl resolvio el nombre y el sistema le nego la conexion (codigo 7)', c.status === 7, c.status)
}

titulo('2 · los dobles son los que se cargan')
escenario()
const { supabase } = await importa('lib/supabase.js')
const q = supabase.from('sim_sessions')
ver('lib/supabase.js usa el doble (navegador)', typeof q.ejecuta === 'function')
const authApi = await importa('lib/authApi.js')
ver('lib/authApi.js usa el doble (servidor)', typeof authApi.supabaseAdmin.from('x').ejecuta === 'function')
// Bloque D (5-oct): /api/candles ya no llama al proveedor (solo lee Storage); lo
// llaman los scripts, que reciben el doble por script-falso.mjs (require
// interceptado). OJO: el cargador solo redirige lo que importa el codigo del
// producto; un import('dukascopy-node') desde pruebas/ da el REAL (y lo para el
// corte de red): las pruebas importan proveedor-falso.mjs directamente.
const { correScript } = await import('./script-falso.mjs')
escenario({ storage: { 'forex-data': {} } })
proveedor.responde = a => diaM1(a.dates.from.toISOString().slice(0, 10))
await correScript('scripts/actualizar-diario.js', { ahora: '2026-01-07T06:00:00Z', argv: [], env: { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' } })
ver('los scripts llaman al proveedor FALSO (en seco: sin subir)', proveedor.llamadas.length >= 1 && proveedor.llamadas.some(l => l.instrumento === 'eurusd') && !db.log.some(l => l.op === 'upload'), `${proveedor.llamadas.length} llamadas, ${db.log.filter(l => l.op === 'upload').length} subidas`)
const candles = (await importa('pages/api/candles.js')).default
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2025.json': JSON.stringify(diaM1('2025-01-06').map(c => ({ time: c.timestamp / 1000, open: 1, high: 1, low: 1, close: 1, volume: 1 }))) } } })
const r = await llama(candles, { method: 'GET', token: tok(A), query: { pair: 'EURUSD', timeframe: 'M1', from: '1736121600', year: '2025' } })
ver('/api/candles lee el Storage FALSO', r.estado === 200 && r.cuerpo.count === 1440 && db.log.some(l => l.tabla === 'storage:forex-data'), `estado ${r.estado} · ${r.cuerpo?.count} velas`)

titulo('3 · el doble es perezoso como PostgREST')
escenario()
const antes = db.log.length
supabase.from('sim_sessions').update({ balance: 1 }).eq('id', 'x')     // sin then
await new Promise(r => setTimeout(r, 20))
ver('un builder sin then no ejecuta nada', db.log.length === antes, `${db.log.length - antes} operaciones`)
await supabase.from('sim_sessions').update({ balance: 1 }).eq('id', 'x')
ver('control positivo: con await, si', db.log.length === antes + 1 && db.log.at(-1).op === 'update')

titulo('4 · Storage con contenido')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2025.json': '[1,2,3]' } } })
const st = authApi.supabaseAdmin.storage.from('forex-data')
const d = await st.download('EURUSD/M1/2025.json')
ver('download devuelve el contenido', JSON.parse(await d.data.text()).length === 3)
const no = await st.download('EURUSD/M1/2024.json')
ver('un objeto que no esta: error devuelto, no lanzado', no.data === null && /not found/i.test(no.error?.message))
db.falla = c => c.op === 'upload' ? { message: 'Payload too large', statusCode: '413' } : null
const up = await st.upload('EURUSD/M1/2025.json', new Blob(['[]']), { upsert: true })
ver('un upload fallido devuelve { error } y no pisa', up.error?.statusCode === '413' && db.storage['forex-data']['EURUSD/M1/2025.json'] === '[1,2,3]')
fin()
