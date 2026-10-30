// EL MOTOR V1 REAL DETRAS DE LA PAGINA REAL (orden 1-175: ps01 y ps02, PSIMM1-01/02). Para las pruebas de Chrome con la
// bandera v1 encendida: lib/servidor (crear, tomar, estado, comando) contra un PostgreSQL 17 DESECHABLE (montaje-v1 +
// sim-004b + sim-006, como v1c04/v1c05), con el mercado publicado en memoria a partir de las MISMAS velas que ve la pagina
// (sesion-comun.mjs: EUR/USD 2-6 mar 2026 y la misma semana +7 dias; el resto de pares, constante; la sesion del servidor va
// hasta el 30-sep-2026 por los 180 dias minimos de crear, la de la pagina hasta el 13-mar como siempre). El servidor corre en un
// proceso HIJO (motor-v1-hijo.mjs) con sin-red.mjs y registro.mjs delante, como la tanda. La pagina llama a /api/sim/* y
// app.mjs (gancho api) se lo pasa aqui: nada sale de la maquina ni toca Supabase.
//   const m = await motorV1Real(); await m.prepara({ hasta })  sesion v1 creada (SESION de app.mjs) y su cursor en `hasta`
//   m.api                      el gancho para montaPagina({ api })
//   m.fila()                   la fila de sim_sessions (estado, version) tal cual la tiene la base
//   m.llamadas                 lo que la pagina ha pedido a /api/sim/* ({ ruta, tipo, id, http })
//   m.trampas                  los fallos que se inyectan aqui, en el transporte (nunca en el servidor):
//                                estadoCaido   todo GET de estado responde 503 (no_disponible)
//                                caeTrasAbrir  tras el siguiente ACK 200 de un abrir, estadoCaido = true
//                                retenerAbrir  el siguiente abrir se retiene hasta m.suelta()
//                                pierdeAbrir   el siguiente abrir llega al servidor, pero a la pagina le llega un 500 (incierto)
//                                conflictosCancelar  los N siguientes cancelar responden 409 conflicto sin llegar al servidor
//   m.caducaEscritor()         el escritor de la pagina cerrada caduca (para abrir otra, como un alumno que vuelve)
//   m.cierra()                 apaga el PostgreSQL y el hijo
// Datos inventados.
import { fork } from 'node:child_process'
import path from 'node:path'
import { REPO } from './cdp.mjs'

export async function motorV1Real() {
  const hijo = fork(path.join(REPO, 'pruebas/navegador/motor-v1-hijo.mjs'), [], { cwd: REPO, execArgv: ['--import', './pruebas/sin-red.mjs', '--import', './pruebas/registro.mjs'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  let n = 0
  const pend = new Map()
  let listo
  const arrancado = new Promise((r, j) => { listo = r; hijo.once('exit', c => j(new Error('el hijo del motor salio con ' + c))) })
  hijo.on('message', ({ id, ok, valor, error }) => { if (id === 0) return listo(); const p = pend.get(id); if (!p) return; pend.delete(id); ok ? p.r(valor) : p.j(new Error(error)) })
  const pide = (op, arg) => new Promise((r, j) => { const id = ++n; pend.set(id, { r, j }); hijo.send({ id, op, arg }) })
  await arrancado
  const llamadas = [], retenidas = []
  const trampas = { estadoCaido: false, caeTrasAbrir: false, retenerAbrir: false, pierdeAbrir: false, conflictosCancelar: 0 }
  const RUTAS = new Set(['/api/sim/tomar', '/api/sim/estado', '/api/sim/comando'])
  async function api(u, request) {
    const ruta = u.pathname
    if (!RUTAS.has(ruta)) return null
    const cuerpo = request.method === 'GET' ? Object.fromEntries(u.searchParams) : JSON.parse(request.postData || '{}')
    const nota = { ruta, tipo: cuerpo.tipo ?? null, id: cuerpo.id ?? null, http: null, ms: Date.now() }
    llamadas.push(nota)
    if (ruta === '/api/sim/estado' && trampas.estadoCaido) { nota.http = 503; return { estado: 503, cuerpo: { ok: false, http: 503, motivo: 'no_disponible' } } }
    if (ruta === '/api/sim/comando' && cuerpo.tipo === 'abrir' && trampas.retenerAbrir) { trampas.retenerAbrir = false; await new Promise(r => retenidas.push(r)) }
    if (ruta === '/api/sim/comando' && cuerpo.tipo === 'cancelar' && trampas.conflictosCancelar > 0) { trampas.conflictosCancelar--; nota.http = 409; return { estado: 409, cuerpo: { ok: false, http: 409, motivo: 'conflicto' } } }
    const r = await pide('api', { ruta, cuerpo })
    if (ruta === '/api/sim/comando' && cuerpo.tipo === 'abrir' && trampas.pierdeAbrir) { trampas.pierdeAbrir = false; nota.http = 500; nota.real = r.http; return { estado: 500, cuerpo: { ok: false, motivo: 'error_interno' } } }
    if (ruta === '/api/sim/comando' && cuerpo.tipo === 'abrir' && r.http === 200 && trampas.caeTrasAbrir) { trampas.caeTrasAbrir = false; trampas.estadoCaido = true }
    nota.http = r.http
    return { estado: r.http, cuerpo: r.cuerpo }
  }
  let cerrado = false
  const cierra = () => { if (cerrado) return; cerrado = true; try { hijo.send({ id: ++n, op: 'cierra' }) } catch {} ; setTimeout(() => { try { hijo.kill('SIGKILL') } catch {} }, 5000).unref() }
  process.on('exit', () => { try { hijo.kill('SIGKILL') } catch {} })
  return { prepara: arg => pide('prepara', arg), api, fila: () => pide('fila'), caducaEscritor: () => pide('caducaEscritor'), llamadas, trampas, retenidas, suelta: () => { for (const r of retenidas.splice(0)) r() }, cierra }
}

// la fila de la sesion v1 para el doble de Supabase de la pagina (lo que lee _SessionInner al abrir)
export const sesionDelDoble = f => ({ motor_version: 1, epoca: Number(f.epoca), version: Number(f.version), timeframe: 'M15', date_from: '2026-03-02', date_to: '2026-03-13',
  capital: 10000, balance: Number(f.balance), last_timestamp: Number(f.last_timestamp ?? f.estado?.reloj?.cursor), terminal: null, legado: false, creada_por_rpc: true })
