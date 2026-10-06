/**
 * BF03 · EL PRESUPUESTO ES UN TIEMPO MAXIMO, TAMBIEN DENTRO DE LA E/S
 * (Astra, cierres-3, añadido F; bloque G, punto 9; CTO 6-oct-2026)
 *
 * Astra: el presupuesto evitaba esperas que no cabian, pero no cancelaba nada
 * en curso: el fetch no recibia señal, la lectura del cuerpo no tenia limite,
 * un 200 que llegaba tarde se aceptaba, con ahora === limite se empezaba otro
 * fetch (> en vez de >=), y leer/subir/verificar/liberar en Storage no tenian
 * limite: una subida retenida dejaba el cerrojo puesto y la operacion abierta.
 * Decision del CTO: cancelacion real (AbortController) de fetch y del cuerpo;
 * presupuesto comprobado al terminar cada descarga y antes de publicar, con
 * reserva para publicar, verificar y liberar; limites tambien en Storage. Una
 * subida de resultado incierto se reconcilia y conserva el cerrojo.
 *
 * Las piezas se prueban con un reloj y unos plazos MANUALES (la prueba los
 * adelanta); el cableado del script, con el script real y un reloj movible.
 *
 * ORACULOS, a mano:
 *   Descarga (lib/mercado/descarga.mjs): fetch colgado → al llegar el limite
 *   se aborta y es «presupuesto»; cuerpo colgado, igual; un 200 que termina
 *   despues del limite se descarta; con ahora === limite no se empieza; un
 *   intento colgado mas alla de su plazo por peticion se aborta y se reintenta.
 *   fetchConLimite (lib/mercado/limites.mjs, para el cliente de Storage):
 *   aborta la peticion y la lectura del cuerpo a su plazo; respeta la señal de
 *   quien llama.
 *   publicarAnio con limites: relectura colgada → error de tiempo, sin subir y
 *   soltando el cerrojo; subida colgada sin aplicar → «incierto», cerrojo
 *   CONSERVADO (aunque la subida se aplique tarde, nadie mas publica); subida
 *   aplicada con la respuesta retenida → se reconcilia: publicado y suelto;
 *   verificacion colgada → error «no verificado», cerrojo suelto.
 *   Script: sin reserva para publicar no se empieza ningun par; una descarga
 *   que acaba despues del limite del par no se publica; el cliente de Storage
 *   se crea con un fetch con plazo.
 */
import { titulo, ver, oraculo, fin, escenario, importa, db, guardado, proveedor } from '../lib.mjs'
import { createClient } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'

// en el codigo auditado (c470c8f) no existe lib/mercado/: sin modulo, los
// oraculos salen en rojo (no se rompe ningun control)
const carga = async r => { try { return await importa(r) } catch { return null } }
const D = await carga('lib/mercado/descarga.mjs'), L = await carga('lib/mercado/limites.mjs'), F = await carga('lib/mercado/ficheros.mjs')

// reloj y plazos manuales: plazo(ms) da una señal que se aborta cuando la prueba
// adelanta el reloj hasta ese instante; mueve() adelanta SIN disparar (un
// temporizador que llega tarde)
function relojManual() {
  let t = 0; const pend = []
  return {
    ahora: () => t,
    plazo: ms => { const c = new AbortController(); pend.push({ en: t + ms, c }); return c.signal },
    avanza(ms) { t += ms; for (const p of pend) if (!p.c.signal.aborted && p.en <= t) p.c.abort(Object.assign(new Error('plazo'), { name: 'TimeoutError' })) },
    mueve(ms) { t += ms },
  }
}
const ticks = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)) }
// ¿termino la promesa? → { ok } | { err } | null (sigue pendiente)
async function termino(p, n = 60) { let h = null; p.then(v => { h = { ok: v } }, e => { h = { err: e } }); await ticks(n); return h }
const abortErr = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError', code: 'ABORT_ERR' })
const colgado = (signal, alAbortar = () => {}) => new Promise((_, mal) => signal?.addEventListener('abort', () => { alAbortar(); mal(abortErr()) }, { once: true }))
const pide = (R, fetch, extra = {}) => !D ? Promise.resolve({ tipo: 'sin-modulo' }) : D.pideUrl('https://falso.invalid/x', { fetch, espera: async () => {}, log: l => logs.push(l), etiqueta: 'EURUSD 2026-01-05', ahora: R.ahora, plazo: R.plazo, limite: 1000, peticionMs: 60000, ...extra })
let logs = []

titulo('1 · descarga: cancelacion real y presupuesto al terminar')
{
  const R = relojManual(); let abortado = false
  const p = pide(R, (url, init) => colgado(init?.signal, () => { abortado = true }))
  await ticks(); R.avanza(1000)
  const h = await termino(p)
  oraculo('BF03', 'fetch colgado: al llegar el limite se aborta (señal) y es «presupuesto»', abortado && h?.err?.tipo === 'presupuesto', h ? (h.err ? `${h.err.tipo ?? h.err.name}` : 'ok') : 'sigue pendiente')
}
{
  const R = relojManual(); let abortado = false
  const p = pide(R, async (url, init) => ({ status: 200, headers: { get: () => null }, arrayBuffer: () => colgado(init?.signal, () => { abortado = true }) }))
  await ticks(); R.avanza(1000)
  const h = await termino(p)
  oraculo('BF03', 'cuerpo colgado (200 y arrayBuffer pendiente): se aborta la lectura y es «presupuesto»', abortado && h?.err?.tipo === 'presupuesto', h ? (h.err ? `${h.err.tipo ?? h.err.name}` : 'ok') : 'sigue pendiente')
}
{
  const R = relojManual(); let entrega
  const p = pide(R, () => new Promise(ok => { entrega = ok }))
  await ticks(); R.mueve(5000)
  entrega?.({ status: 200, headers: { get: () => null }, arrayBuffer: async () => new TextEncoder().encode('[1]').buffer })
  const h = await termino(p)
  oraculo('BF03', 'un 200 que termina despues del limite (temporizador tardio) se descarta: «presupuesto»', h?.err?.tipo === 'presupuesto', h ? (h.err ? `${h.err.tipo ?? h.err.name}` : `ok (${h.ok?.tipo})`) : 'sigue pendiente')
}
{
  const R = relojManual(); R.mueve(1000); let llamadas = 0
  const p = pide(R, async () => { llamadas++; return { status: 200, headers: { get: () => null }, arrayBuffer: async () => new TextEncoder().encode('[1]').buffer } })
  const h = await termino(p)
  oraculo('BF03', 'con ahora === limite no se empieza ninguna peticion', llamadas === 0 && h?.err?.tipo === 'presupuesto', `${llamadas} peticion(es)`)
}
{
  const R = relojManual(); let n = 0; logs = []
  const p = pide(R, async (url, init) => { n++; if (n === 1) return colgado(init?.signal); return { status: 200, headers: { get: () => null }, arrayBuffer: async () => new TextEncoder().encode('[1]').buffer } }, { limite: Infinity, peticionMs: 10000 })
  await ticks(); R.avanza(10000)
  const h = await termino(p)
  oraculo('BF03', 'un intento colgado mas alla de su plazo por peticion se aborta y se reintenta (el 2.º responde)', n === 2 && h?.ok?.tipo === 'ok' && /intento 1\/5 · red \(plazo/.test(logs.join('\n')), `${n} intento(s) · ${logs.join(' | ')}`)
}

titulo('2 · fetchConLimite: el fetch con plazo del cliente de Storage')
if (L?.fetchConLimite) {
  { const R = relojManual(); let abortado = false
    const f = L.fetchConLimite((u, init) => colgado(init?.signal, () => { abortado = true }), 5000, R.plazo)
    const p = f('https://falso.supabase.co/storage/v1/object/x'); await ticks(); R.avanza(5000)
    const h = await termino(p)
    oraculo('BF03', 'una peticion colgada se aborta a su plazo', abortado && h?.err?.name === 'AbortError', h ? (h.err?.name ?? 'ok') : 'sigue pendiente') }
  { const R = relojManual(); let abortado = false
    const f = L.fetchConLimite(async (u, init) => ({ status: 200, arrayBuffer: () => colgado(init?.signal, () => { abortado = true }) }), 5000, R.plazo)
    const r = await f('https://falso.supabase.co/storage/v1/object/x'); const p = r.arrayBuffer(); await ticks(); R.avanza(5000)
    const h = await termino(p)
    oraculo('BF03', 'la lectura del cuerpo tambien se aborta a su plazo', abortado && h?.err?.name === 'AbortError', h ? (h.err?.name ?? 'ok') : 'sigue pendiente') }
  { const R = relojManual(); const mia = new AbortController()
    const f = L.fetchConLimite((u, init) => colgado(init?.signal), 5000, R.plazo)
    const p = f('https://falso.supabase.co/x', { signal: mia.signal }); await ticks(); mia.abort()
    const h = await termino(p)
    oraculo('BF03', 'respeta la señal de quien llama (se aborta antes del plazo)', h?.err?.name === 'AbortError', h ? (h.err?.name ?? 'ok') : 'sigue pendiente') }
} else {
  for (const t of ['una peticion colgada se aborta a su plazo', 'la lectura del cuerpo tambien se aborta a su plazo', 'respeta la señal de quien llama (se aborta antes del plazo)']) oraculo('BF03', t, false, 'no existe lib/mercado/limites.mjs')
}

titulo('3 · publicarAnio con limites en Storage')
const sb = createClient('https://falso.supabase.co', 'falsa')
const velasDe = (dia, n) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const BASE = JSON.stringify(velasDe('2026-01-02', 1200))
const RUTA = 'EURUSD/M1/2026.json', CERROJO = '_cerrojos/EURUSD_2026.json'
const hayCerrojo = () => Object.hasOwn(db.storage['forex-data'] ?? {}, CERROJO)
const subidasDatos = () => db.log.filter(l => l.op === 'upload' && l.payload?.ruta === RUTA).length
const LIM = { pequenaMs: 20000, grandeMs: 120000 }
const publica = (R, dueno = 'A') => !F ? Promise.resolve({ estado: 'sin-modulo', problemas: [] }) : F.publicarAnio(sb, { pair: 'EURUSD', year: 2026, dueno, componer: () => velasDe('2026-01-02', 1440), ahoraMs: () => Date.parse('2026-01-02T12:00:00Z'), limites: { ...LIM, plazo: R.plazo } })
let suelta = null
const retiene = pred => { let pillada = false; db.pausa = async c => { if (!pillada && pred(c)) { pillada = true; await new Promise(r => { suelta = r }) } }; return () => pillada }

{ escenario({ storage: { 'forex-data': { [RUTA]: BASE } } }); const R = relojManual()
  const pillada = retiene(c => c.op === 'download' && c.payload === RUTA)
  const p = publica(R); await ticks(); ver('control: la relectura esta retenida', !F || pillada())
  R.avanza(LIM.grandeMs); const h = await termino(p, 120)
  oraculo('BF03', 'relectura colgada: error de tiempo, sin subir y soltando el cerrojo', h?.ok?.estado === 'error' && /tiempo/i.test(h.ok.problemas.join(' ')) && subidasDatos() === 0 && !hayCerrojo(), h ? JSON.stringify({ e: h.ok?.estado, p: h.ok?.problemas, c: hayCerrojo() }) : 'sigue pendiente')
  db.pausa = null; suelta?.(); await ticks(200) }

{ escenario({ storage: { 'forex-data': { [RUTA]: BASE } } }); const R = relojManual()
  const pillada = retiene(c => c.op === 'upload' && c.payload?.ruta === RUTA)
  const p = publica(R); await ticks(); ver('control: la subida esta retenida antes de aplicarse', !F || pillada())
  R.avanza(LIM.grandeMs); const h = await termino(p, 200)
  oraculo('BF03', 'subida colgada sin aplicar: «incierto», el cerrojo se CONSERVA y lo dice', h?.ok?.estado === 'incierto' && hayCerrojo() && /cerrojo/.test(h.ok.problemas.join(' ')), h ? JSON.stringify({ e: h.ok?.estado, p: h.ok?.problemas, c: hayCerrojo() }) : 'sigue pendiente')
  db.pausa = null; suelta?.(); await ticks(200)
  const b = F && h ? await F.publicarAnio(sb, { pair: 'EURUSD', year: 2026, dueno: 'B', componer: () => velasDe('2026-01-02', 1300) }) : { estado: 'sin-probar' }
  oraculo('BF03', 'la subida se aplica tarde: el cerrojo sigue puesto y otro escritor no publica encima', guardado('EURUSD/M1/2026').velas?.length === 1440 && hayCerrojo() && b.estado === 'ocupado', `quedan ${guardado('EURUSD/M1/2026').velas?.length} · B ${b.estado}`) }

{ escenario({ storage: { 'forex-data': { [RUTA]: BASE } } }); const R = relojManual(); let retenida = false
  db.trasAplicar = async c => { if (c.payload === RUTA && !retenida) { retenida = true; await new Promise(r => { suelta = r }) } }
  const p = publica(R); await ticks(); ver('control: la subida se aplico y su respuesta esta retenida', !F || (retenida && guardado('EURUSD/M1/2026').velas?.length === 1440))
  R.avanza(LIM.grandeMs); const h = await termino(p, 200)
  oraculo('BF03', 'subida aplicada con la respuesta retenida: se reconcilia (lo vigente es lo subido), publicado y cerrojo suelto', h?.ok?.estado === 'publicado' && !hayCerrojo(), h ? JSON.stringify({ e: h.ok?.estado, p: h.ok?.problemas, a: h.ok?.avisos, c: hayCerrojo() }) : 'sigue pendiente')
  db.trasAplicar = null; suelta?.(); await ticks(200) }

{ escenario({ storage: { 'forex-data': { [RUTA]: BASE } } }); const R = relojManual()
  // bloque G, punto 11: la verificacion es info() (metadatos) y, si no, una
  // descarga: se retienen LAS DOS despues de la subida
  const sueltas = []; let retenidas = 0
  db.pausa = async c => { if ((c.op === 'download' || c.op === 'info') && c.payload === RUTA && db.log.some(l => l.op === 'upload' && l.payload?.ruta === RUTA)) { retenidas++; await new Promise(r => sueltas.push(r)) } }
  suelta = () => sueltas.forEach(f => f())
  const pillada = () => retenidas > 0
  const p = publica(R); await ticks(60); ver('control: la verificacion esta retenida tras subir', !F || (pillada() && guardado('EURUSD/M1/2026').velas?.length === 1440))
  for (let k = 0; k < 3; k++) { R.avanza(LIM.grandeMs); await ticks(60) }
  const h = await termino(p, 200)
  oraculo('BF03', 'verificacion colgada: error «no verificado» por tiempo y cerrojo suelto (la subida ya termino)', h?.ok?.estado === 'error' && /no verificado/.test(h.ok.problemas.join(' ')) && !hayCerrojo(), h ? JSON.stringify({ e: h.ok?.estado, p: h.ok?.problemas, c: hayCerrojo() }) : 'sigue pendiente')
  db.pausa = null; suelta?.(); await ticks(200) }

titulo('4 · el script: reserva para publicar, descarga tardia y cliente con plazo')
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const historial = hasta => { const v = []; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += 86400000) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d, 1440)); else if (w === 0) v.push(...velasDe(d, 1440).slice(22 * 60)) } return v }
const NUEVE = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'AUDCAD', 'GBPJPY']
const todos = hasta => Object.fromEntries(NUEVE.map(p => [`${p}/M1/2026.json`, JSON.stringify(historial(hasta))]))
escenario({ storage: { 'forex-data': todos('2026-02-01') } })
proveedor.http = (url, n, { dia }) => ({ status: 200, body: JSON.stringify(diaM1(dia)) })
const r1 = await correScript('scripts/actualizar-diario.js', { ahora: '2026-02-03T06:00:00Z', argv: ['--subir'], env: { ...ENV, PRESUPUESTO_JOB_S: '300', RESERVA_PUBLICAR_S: '420' } })
oraculo('BF03', 'sin reserva para publicar (job 300 s, reserva 420 s): ningun par empieza, ninguna descarga ni cerrojo', proveedor.llamadas.length === 0 && r1.salida.filter(l => /SIN TIEMPO/.test(l)).length === 9 && !db.log.some(l => l.op === 'upload'), `${proveedor.llamadas.length} peticiones · ${r1.salida.filter(l => /SIN TIEMPO/.test(l)).length} sin tiempo`)
escenario({ storage: { 'forex-data': todos('2026-02-01') } })
const reloj = {}
proveedor.http = (url, n, { instrumento, dia }) => { if (instrumento === 'audusd' && dia === '2026-02-02') reloj.ms += 300000; return { status: 200, body: JSON.stringify(diaM1(dia)) } }
const r2 = await correScript('scripts/actualizar-diario.js', { ahora: '2026-02-03T06:00:00Z', argv: ['--subir'], env: { ...ENV, PRESUPUESTO_PAR_S: '240' }, reloj })
const lin2 = r2.salida.find(l => l.includes('AUDUSD/M1')) ?? ''
oraculo('BF03', 'una descarga que termina despues del limite del par (5 min > 4) no se publica: «presupuesto»', /sin descargar: 2026-02-02 \(presupuesto/.test(lin2) && !(guardado('AUDUSD/M1/2026').velas ?? []).some(v => v.time >= Date.parse('2026-02-02T00:00:00Z') / 1000), lin2)
proveedor.http = null
const cli = db.clientes.at(-1)
oraculo('BF03', 'el actualizador crea el cliente de Storage con un fetch con plazo', Number(cli?.global?.fetch?.conLimite) > 0, JSON.stringify(cli ?? null))
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
