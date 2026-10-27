// Chrome REAL por CDP para las pruebas de pruebas/navegador/ (pesadas: SIEMPRE bajo revisiones-suite/con-turno).
// Servidor estatico propio en 127.0.0.1 (solo el worktree: la pagina, node_modules y components), Chrome sin interfaz
// en su propio grupo de procesos con perfil desechable, y un tope: al acabar o al pasarlo, se cierra el grupo entero.
// Ni red de fuera ni base: el servidor solo sirve ficheros del repo y la pagina no pide nada mas.
import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as espera } from 'node:timers/promises'

export const REPO = path.resolve(import.meta.dirname, '..', '..')
const CHROMES = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.map': 'application/json', '.json': 'application/json' }

export function servidor() {
  const fuera = []
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    // /components/x.mjs → components/x.js (el codigo de la app tal cual, como modulo)
    if (/^\/components\/[\w-]+\.mjs$/.test(u)) u = u.replace(/\.mjs$/, '.js')
    const f = path.join(REPO, u)
    if (!f.startsWith(REPO + path.sep) || /\/\.env/.test(f) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { fuera.push(u); res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res)
  })
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${srv.address().port}`, cierra: () => srv.close(), fuera })))
}

export async function abre(url, { tope = 60000, antes = null, listo = '!!window.banco?.listo', esperaListo = 10000 } = {}) {
  const chrome = process.env.PRUEBA_CHROME || CHROMES.find(c => fs.existsSync(c))
  if (!chrome) throw new Error('no hay Chrome')
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-chrome-'))
  const puerto = 9300 + Math.floor(Math.random() * 600)
  const p = spawn(chrome, ['--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--window-size=1100,700', 'about:blank'], { detached: true, stdio: 'ignore' })
  const mata = () => { try { process.kill(-p.pid, 'SIGKILL') } catch {} ; try { fs.rmSync(perfil, { recursive: true, force: true }) } catch {} }
  const reloj = setTimeout(() => { console.log('✗ TOPE del arnes (no del producto): Chrome no termino a tiempo'); mata(); process.exit(3) }, tope)
  let ws
  for (let i = 0; i < 100 && !ws; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json(); const pg = l.find(t => t.type === 'page'); if (pg) ws = pg.webSocketDebuggerUrl } catch {}
    if (!ws) await espera(100)
  }
  if (!ws) { mata(); throw new Error('Chrome no abrio CDP') }
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j })
  let n = 0; const pend = new Map(), errores = [], oyentes = {}
  const on = (metodo, f) => { (oyentes[metodo] ??= []).push(f) }
  sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) }
    if (d.method && oyentes[d.method]) for (const f of oyentes[d.method]) Promise.resolve(f(d.params)).catch(e => errores.push('arnes: ' + e.message))
    if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails?.exception?.description || d.params.exceptionDetails?.text)
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errores.push(d.params.args.map(a => a.value ?? a.description).join(' ')) }
  const cdp = (method, params = {}) => new Promise(r => { const id = ++n; pend.set(id, r); sock.send(JSON.stringify({ id, method, params })) })
  await cdp('Runtime.enable'); await cdp('Page.enable')
  if (antes) await antes(cdp, on)
  await cdp('Page.navigate', { url })
  const evalua = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval'); return r.result?.result?.value }
  for (let t = Date.now(); Date.now() - t < esperaListo;) { if (await evalua(listo).catch(() => false)) break; await espera(100) }
  const raton = async (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra })
  // un arrastre de verdad: pulsar, mover en pasos (con temblor opcional en vertical), soltar
  // modificadores (CDP: 8 = Shift): los lleva cada evento del raton, como e.shiftKey de verdad (sin ellos, 0)
  const arrastra = async (de, a, { pasos = 12, temblor = 0, modificadores = 0 } = {}) => {
    const m = { modifiers: modificadores }
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: de.x, y: de.y, button: 'none', buttons: 0, ...m }); await espera(30)
    await raton('mousePressed', de.x, de.y, m); await espera(30)
    for (let i = 1; i <= pasos; i++) { const f = i / pasos, tr = temblor ? (i % 2 ? temblor : -temblor) : 0
      await raton('mouseMoved', de.x + (a.x - de.x) * f, de.y + (a.y - de.y) * f + (i < pasos ? tr : 0), m); await espera(16) }
    await raton('mouseReleased', a.x, a.y, m); await espera(60)
  }
  const clic = async (x, y, { modificadores = 0 } = {}) => { const m = { modifiers: modificadores }; await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, ...m }); await espera(20); await raton('mousePressed', x, y, m); await espera(20); await raton('mouseReleased', x, y, m); await espera(60) }
  const cierra = () => { clearTimeout(reloj); try { sock.close() } catch {} ; mata() }
  return { evalua, arrastra, clic, cierra, errores, cdp, on }
}
