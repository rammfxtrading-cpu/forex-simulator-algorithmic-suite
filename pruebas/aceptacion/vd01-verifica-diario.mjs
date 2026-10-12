/**
 * VD01 · LA VERIFICACION DEL DIARIO COMO HERRAMIENTA DEL REPO (CTO 11-oct-2026)
 *
 * scripts/verifica-diario.js DESDE [--pares A,B] (logica en
 * lib/mercado/verifica.mjs). SOLO LECTURA. Por par, del año de DESDE:
 *   · ultima vela del .json.gz;
 *   · cada dia desde DESDE hasta el de la ultima vela, completo (C.estadoDia,
 *     con los dias cortos aceptados); el ultimo a medias tambien es hallazgo;
 *   · sha256 del cuerpo del .gz igual al de sus metadatos (y velas iguales);
 *   · ningun .json del año;
 *   · ningun cerrojo;
 * y del bucket entero: objetos y bytes (suma de metadata.size, recorriendo
 * carpetas y paginas), y cualquier ficha en _cerrojos/.
 * Salida: 0 todo bien · 1 algun hallazgo · 3 algo no se pudo comprobar · 4 uso.
 * Ninguna URL ni clave en la salida.
 *
 * ORACULOS: (A) con el SDK REAL (StorageClient) y Storage en memoria al nivel
 * HTTP: el caso bueno, que solo hace lecturas, que los bytes salen de list con
 * carpetas y paginas, un sha256 plantado y un list sin tamaño; (B) el script
 * con los dobles del arnes y un fallo plantado por cada comprobacion: cada uno
 * en rojo (1, 3 o 4) y nombrado. NUNCA se ejecuta contra Storage.
 */
import { titulo, ver, oraculo, fin, importa, REPO, escenario, proveedor, db } from '../lib.mjs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { existsSync } from 'node:fs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const L = await importa('lib/mercado/limites.mjs').catch(() => ({}))
const V = await importa('lib/mercado/verifica.mjs').catch(() => null)
const { StorageClient } = await import(createRequire(REPO + 'package.json').resolve('@supabase/storage-js'))
const sha = b => createHash('sha256').update(b).digest('hex')
const LIM = { pequenaMs: 20000, grandeMs: 120000, plazo: ms => AbortSignal.timeout(ms) }

// velas M1 de unos dias: { 'AAAA-MM-DD': n } → n velas desde las 00:00 UTC
const velasDe = dias => Object.entries(dias).flatMap(([d, n]) => {
  const t0 = Date.parse(d + 'T00:00:00Z') / 1000
  return Array.from({ length: n }, (_, i) => ({ time: t0 + i * 60, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }))
})
const gz = velas => gzipSync(Buffer.from(JSON.stringify(velas)))
// lo esperado hoy: EURUSD al 9-oct (viernes, 1.260 velas), NZDUSD al 8-oct
const EUR = gz(velasDe({ '2026-10-07': 1440, '2026-10-08': 1440, '2026-10-09': 1260 }))
const NZD = gz(velasDe({ '2026-10-07': 1440, '2026-10-08': 1440 }))
const meta = (b, velas) => ({ sha256: sha(b), velas: String(velas) })
const OTROS = { 'EURUSD/M1/2025.json': Buffer.from('x'.repeat(5000)), 'NZDUSD/M1/2025.json': Buffer.from('y'.repeat(7000)) }
const base = () => ({
  'EURUSD/M1/2026.json.gz': { cuerpo: EUR, meta: meta(EUR, 4140) },
  'NZDUSD/M1/2026.json.gz': { cuerpo: NZD, meta: meta(NZD, 2880) },
  ...Object.fromEntries(Object.entries(OTROS).map(([r, c]) => [r, { cuerpo: c, meta: null }])),
})
const bytesDe = o => Object.values(o).reduce((s, x) => s + x.cuerpo.length, 0)

// ── A · Storage en memoria al nivel HTTP, con el SDK real ─────────────────────
function storage(objetos, { sinTamano = false } = {}) {
  const pedidas = []
  const no = () => new Response(JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found' }), { status: 400, headers: { 'content-type': 'application/json' } })
  const etag = c => `"${sha(c).slice(0, 32)}"`
  const f = async (url, init = {}) => {
    const u = new URL(url), metodo = init.method ?? 'GET', p = decodeURIComponent(u.pathname.replace('/storage/v1', ''))
    pedidas.push(`${metodo} ${p}`)
    if (p.startsWith('/object/info/forex-data/')) {
      const r = p.slice('/object/info/forex-data/'.length), o = objetos[r]
      if (!o) return no()
      return Response.json({ name: r, etag: etag(o.cuerpo), version: 'v1', size: o.cuerpo.length, metadata: o.meta ?? {} })
    }
    if (p === '/object/list/forex-data' && metodo === 'POST') {
      const q = JSON.parse(init.body), pre = q.prefix ? q.prefix.replace(/\/$/, '') + '/' : ''
      const nivel = new Map()
      for (const r of Object.keys(objetos).filter(x => x.startsWith(pre))) {
        const resto = r.slice(pre.length), i = resto.indexOf('/')
        if (i >= 0) nivel.set(resto.slice(0, i), { name: resto.slice(0, i), id: null, metadata: null })
        else nivel.set(resto, { name: resto, id: sha(r).slice(0, 36), metadata: { size: sinTamano ? undefined : objetos[r].cuerpo.length, eTag: etag(objetos[r].cuerpo) } })
      }
      const filas = [...nivel.values()].sort((a, b) => a.name.localeCompare(b.name))
      return Response.json(filas.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 100)))
    }
    const r = p.replace(/^\/object\/(authenticated\/)?forex-data\//, ''), o = objetos[r]
    if (metodo !== 'GET') return new Response('{}', { status: 405 })
    if (!o) return no()
    return new Response(o.cuerpo, { status: 200, headers: { etag: etag(o.cuerpo) } })
  }
  return { f, pedidas }
}
async function verifica(objetos, opciones = {}, storageOps = {}) {
  if (!V?.verificaDiario || !L.fetchConTope) return { codigo: null, texto: '(sin lib/mercado/verifica.mjs)', pedidas: [] }
  const s = storage(objetos, storageOps)
  const sb = { storage: new StorageClient('http://storage.local/storage/v1', {}, L.fetchConTope(s.f)) }
  const r = await V.verificaDiario(sb, { desde: '2026-10-08', pares: ['EURUSD', 'NZDUSD'], lim: { ...LIM, tiempos: [] }, ...opciones })
  return { ...r, texto: r.lineas.join('\n'), pedidas: s.pedidas }
}

titulo('A · con el SDK real y Storage en memoria')
const ob = base()
const a = await verifica(ob)
oraculo('VD', 'lo esperado (EURUSD al 9-oct, NZDUSD al 8-oct, todo integro): 0, y el informe da la ultima vela de cada par y los dias completos', a.codigo === 0 && /EURUSD[\s\S]*9-oct-2026/.test(a.texto) && /NZDUSD[\s\S]*8-oct-2026/.test(a.texto) && /2026-10-09 completo/.test(a.texto) && /2026-10-08 completo/.test(a.texto), a.texto.replace(/\n/g, ' | '))
oraculo('VD', 'sha256 y velas del .gz frente a sus metadatos, ningun .json de 2026 y ningun cerrojo, dichos por par', /sha256[^\n]*✓|✓[^\n]*sha256/.test(a.texto) && /sin \.json de 2026/.test(a.texto) && /sin cerrojo/.test(a.texto), a.texto.replace(/\n/g, ' | '))
oraculo('VD', `bytes del bucket: la suma de metadata.size de TODOS los objetos, entrando en carpetas (${Object.keys(ob).length} objetos, ${bytesDe(ob)} B)`, new RegExp(`${Object.keys(ob).length} objetos · ${bytesDe(ob).toLocaleString('es-ES')} bytes`).test(a.texto), a.texto.split('\n').find(l => /bytes/.test(l)) ?? '')
oraculo('VD', 'solo lectura: GET de info y objetos y POST de list; ningun PUT, DELETE ni POST de subida', a.pedidas.length > 0 && a.pedidas.every(p => p.startsWith('GET ') || p === 'POST /object/list/forex-data'), a.pedidas.filter(p => !p.startsWith('GET ')).join(' · '))
const ap = await verifica(ob, { pagina: 1 })
oraculo('VD', 'con paginas de 1 entrada el total es el mismo (recorre todas las paginas)', ap.codigo === 0 && new RegExp(`${bytesDe(ob).toLocaleString('es-ES')} bytes`).test(ap.texto), ap.texto.split('\n').find(l => /bytes/.test(l)) ?? '')
const as = await verifica({ ...ob, 'EURUSD/M1/2026.json.gz': { cuerpo: EUR, meta: meta(Buffer.from('otro'), 4140) } })
oraculo('VD', 'plantado: el sha256 de los metadatos no es el del cuerpo → 1, y lo nombra', as.codigo === 1 && /EURUSD[^\n]*sha256/.test(as.texto), as.texto.replace(/\n/g, ' | '))
const at = await verifica(ob, {}, { sinTamano: true })
oraculo('VD', 'plantado: list sin tamaño → 3 (no se suma un 0 a escondidas)', at.codigo === 3 && /tama/i.test(at.texto), at.texto.split('\n').find(l => /tama/i.test(l)) ?? at.texto.slice(-200))

titulo('B · el script, con los dobles del arnes')
const hay = existsSync(REPO + 'scripts/verifica-diario.js')
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://proyecto-secreto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'clave-secreta-falsa' }
function monta(objetos) {
  escenario({ storage: { 'forex-data': Object.fromEntries(Object.entries(objetos).map(([r, o]) => [r, o.cuerpo])) } })
  db.metadatos['forex-data'] = Object.fromEntries(Object.entries(objetos).map(([r, o]) => [r, o.meta]))
}
const corre = async (objetos, argv = ['2026-10-08', '--pares', 'EURUSD,NZDUSD'], prepara = null) => {
  if (!hay) return { codigo: null, salida: [], texto: '(sin scripts/verifica-diario.js)' }
  monta(objetos); prepara?.()
  const s = await correScript('scripts/verifica-diario.js', { ahora: '2026-10-11T12:00:00Z', argv, env: ENV })
  return { ...s, texto: s.salida.join('\n') }
}
const limpio = t => !/proyecto-secreto|clave-secreta|https?:/.test(t)
const b0 = await corre(base())
const opsB = db.log.filter(l => String(l.tabla).startsWith('storage'))
oraculo('VD', 'el script, lo esperado: 0; solo info, download y list; sin proveedor; sin URL ni clave en la salida', b0.codigo === 0 && opsB.length > 0 && opsB.every(l => ['info', 'download', 'list'].includes(l.op)) && proveedor.llamadas.length === 0 && limpio(b0.texto), `codigo ${b0.codigo} · ${[...new Set(opsB.map(l => l.op))].join(',')} · ${b0.salida.slice(-1).join('')}`)
oraculo('VD', 'el script dice la ultima vela de cada par (EURUSD 9-oct, NZDUSD 8-oct) y los bytes del bucket', /EURUSD[\s\S]*9-oct-2026/.test(b0.texto) && /NZDUSD[\s\S]*8-oct-2026/.test(b0.texto) && new RegExp(`${bytesDe(base()).toLocaleString('es-ES')} bytes`).test(b0.texto), b0.salida.filter(l => /ultima|bytes/.test(l)).join(' | '))

const planta = async (desc, objetos, espera, patron, argv, prepara) => {
  const r = await corre(objetos, argv, prepara)
  oraculo('VD', `plantado: ${desc} → ${espera}`, r.codigo === espera && patron.test(r.texto) && limpio(r.texto), `codigo ${r.codigo} · ${r.salida.filter(l => patron.test(l)).slice(0, 2).join(' | ') || r.salida.slice(-2).join(' | ')}`)
}
const EUR8corto = gz(velasDe({ '2026-10-07': 1440, '2026-10-08': 900, '2026-10-09': 1260 }))
const EUR9medias = gz(velasDe({ '2026-10-07': 1440, '2026-10-08': 1440, '2026-10-09': 300 }))
await planta('dia interior incompleto (8-oct con 900 velas)', { ...base(), 'EURUSD/M1/2026.json.gz': { cuerpo: EUR8corto, meta: meta(EUR8corto, 3600) } }, 1, /2026-10-08[^\n]*(incompleto|pendiente)/)
await planta('ultimo dia a medias (9-oct con 300 velas)', { ...base(), 'EURUSD/M1/2026.json.gz': { cuerpo: EUR9medias, meta: meta(EUR9medias, 3180) } }, 1, /2026-10-09[^\n]*(medias|incompleto|pendiente)/)
await planta('ultima vela anterior a DESDE (nada desde el 9-oct en NZDUSD)', base(), 1, /NZDUSD[^\n]*(ninguna|sin velas|anterior)/, ['2026-10-09', '--pares', 'NZDUSD'])
await planta('sha256 de los metadatos distinto', { ...base(), 'NZDUSD/M1/2026.json.gz': { cuerpo: NZD, meta: meta(Buffer.from('otro'), 2880) } }, 1, /NZDUSD[^\n]*sha256/)
await planta('metadatos sin sha256', { ...base(), 'NZDUSD/M1/2026.json.gz': { cuerpo: NZD, meta: { velas: '2880' } } }, 1, /NZDUSD[^\n]*sha256/)
await planta('velas de los metadatos distintas de las del cuerpo', { ...base(), 'NZDUSD/M1/2026.json.gz': { cuerpo: NZD, meta: meta(NZD, 9999) } }, 1, /NZDUSD[^\n]*9999/)
await planta('un .json de 2026 todavia en el bucket', { ...base(), 'EURUSD/M1/2026.json': { cuerpo: Buffer.from('[]'), meta: null } }, 1, /EURUSD[^\n]*\.json de 2026/)
await planta('un cerrojo puesto', { ...base(), '_cerrojos/EURUSD_2026.json': { cuerpo: Buffer.from(JSON.stringify({ dueno: 'diario-38130667637', desde: '2026-10-11T10:06:40Z' })), meta: null } }, 1, /cerrojo[^\n]*diario-38130667637/)
await planta('un cerrojo de OTRO par o año (en _cerrojos/)', { ...base(), '_cerrojos/AUDCAD_2025.json': { cuerpo: Buffer.from('{}'), meta: null } }, 1, /_cerrojos[^\n]*AUDCAD_2025/)
await planta('falta el .json.gz del par', { 'EURUSD/M1/2026.json.gz': base()['EURUSD/M1/2026.json.gz'] }, 1, /NZDUSD[^\n]*(no hay|falta)/)
await planta('Storage falla con la URL en el mensaje: 3 y la URL no sale', base(), 3, /NZDUSD[^\n]*(no se pudo|error|fallo)/i, undefined, () => { db.falla = ctx => (ctx.op === 'info' && String(ctx.payload).startsWith('NZDUSD') ? { message: 'fetch failed https://proyecto-secreto.supabase.co/storage/v1 clave-secreta-falsa', statusCode: '500' } : null) })
await planta('sin DESDE', base(), 4, /Uso/, [])
await planta('DESDE que no es una fecha', base(), 4, /Uso/, ['2026-13-40'])
await planta('un par que no existe', base(), 4, /Uso/, ['2026-10-08', '--pares', 'XXXYYY'])
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(x => x.terminoPor !== 'timeout'))
fin()
