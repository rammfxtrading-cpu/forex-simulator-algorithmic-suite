/**
 * MC04 · EL CONTRATO DE LA DESCARGA LIMITADA, EN UNA LECTURA ACOTADA
 * (paso 6 del despliegue; CTO 10-oct-2026)
 *
 * scripts/comprueba-descarga.js PAR (logica en lib/mercado/comprueba.mjs):
 * SOLO LECTURA. Una consulta de informacion y UNA descarga atada por el mismo
 * camino que el diario (fetchConTope sobre fetchConLimite), sin publicar y sin
 * proveedor. Informe: etag (presencia y forma), tamaño, claves de metadatos y
 * sha256; del GET, estado HTTP, etag recibida y bytes. Salida:
 *   0  el diario funcionaria (etag y tamaño cuadran; sha256 si hay metadatos)
 *   3  el diario saldria con 3: sin objeto, sin tamaño, etag distinta o
 *      ausente sin sha256 que la sustituya, descarga cortada o fallida
 *   1  el sha256 del cuerpo no es el de los metadatos
 *   (4  uso: par no valido)
 *
 * ORACULOS: (A) con el SDK REAL (StorageClient) y un transporte en memoria
 * que responde la info y el GET como Storage: los casos 0/3/1 y que solo hay
 * una info por ruta y un GET del objeto, nada mas; (B) el script con los
 * dobles del arnes: sin proveedor, sin escrituras, una descarga, sin URL en el
 * log, y 4 con un par que no existe. NUNCA se ejecuta contra Storage.
 */
import { titulo, ver, oraculo, fin, importa, REPO, escenario, proveedor, db } from '../lib.mjs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { existsSync } from 'node:fs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const L = await importa('lib/mercado/limites.mjs').catch(() => ({}))
const F = await importa('lib/mercado/ficheros.mjs').catch(() => ({}))
const K = await importa('lib/mercado/comprueba.mjs').catch(() => null)
const { StorageClient } = await import(createRequire(REPO + 'package.json').resolve('@supabase/storage-js'))
const sha = b => createHash('sha256').update(b).digest('hex')
const LIM = { pequenaMs: 20000, grandeMs: 120000, plazo: ms => AbortSignal.timeout(ms) }
const GZ = 'EURUSD/M1/2026.json.gz'
const CUERPO = gzipSync(Buffer.from(JSON.stringify([{ time: 1767312000, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }])))

// Storage en memoria, al nivel HTTP: info → JSON; GET del objeto → cuerpo con cabeceras
function storage({ info, get }) {
  const pedidas = []
  const f = async (url, init = {}) => {
    const u = new URL(url), metodo = init.method ?? 'GET'
    pedidas.push(`${metodo} ${u.pathname.replace('/storage/v1', '')}`)
    if (u.pathname.includes('/object/info/')) {
      const ruta = decodeURIComponent(u.pathname.split('/object/info/forex-data/')[1])
      if (ruta !== GZ || !info) return new Response(JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found' }), { status: 400, headers: { 'content-type': 'application/json' } })
      return new Response(JSON.stringify(info), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const g = get()
    return new Response(g.cuerpo, { status: g.status ?? 200, headers: g.cab ?? {} })
  }
  return { f, pedidas }
}
async function comprueba({ info, get }) {
  if (!K?.compruebaDescarga || !L.fetchConTope) return { codigo: null, texto: '(sin lib/mercado/comprueba.mjs)', pedidas: [] }
  const s = storage({ info, get })
  const sb = { storage: new StorageClient('http://storage.local/storage/v1', {}, L.fetchConTope(s.f)) }
  const r = await K.compruebaDescarga(sb, 'EURUSD', 2026, { ...LIM, tiempos: [] })
  return { ...r, texto: r.lineas.join('\n'), pedidas: s.pedidas }
}
const infoBuena = (extra = {}) => ({ name: GZ, etag: '"abc"', version: 'v1', size: CUERPO.length, metadata: { sha256: sha(CUERPO), velas: '1' }, ...extra })
const unGet = p => p.filter(x => x === `GET /object/${GZ}` || x === `GET /object/forex-data/${GZ}`).length

titulo('A · con el SDK real y Storage en memoria')
const a = await comprueba({ info: infoBuena(), get: () => ({ cuerpo: CUERPO, cab: { etag: '"abc"' } }) })
oraculo('Paso 6', 'todo cuadra: 0, y el informe dice etag (con comillas), tamaño, claves de metadatos, etag del GET que coincide, bytes y sha256 bien', a.codigo === 0 && /etag.*"abc"|etag.*comillas/i.test(a.texto) && new RegExp(`${CUERPO.length}`).test(a.texto) && /sha256/.test(a.texto) && /velas/.test(a.texto) && /coincide/i.test(a.texto), a.texto.replace(/\n/g, ' | '))
oraculo('Paso 6', 'solo lectura: las peticiones son infos y UN GET del objeto (ningun POST, PUT ni DELETE)', a.pedidas.length >= 2 && a.pedidas.every(p => p.startsWith('GET ')) && unGet(a.pedidas) === 1, a.pedidas.join(' · '))
const b = await comprueba({ info: infoBuena(), get: () => ({ cuerpo: CUERPO, cab: { etag: '"otra"' } }) })
oraculo('Paso 6', 'la etag del GET no es la de info(): 3, y el informe lo dice', b.codigo === 3 && /etag/i.test(b.texto), b.texto.replace(/\n/g, ' | '))
const c = await comprueba({ info: infoBuena({ size: undefined }), get: () => ({ cuerpo: CUERPO, cab: { etag: '"abc"' } }) })
oraculo('Paso 6', 'info() sin tamaño: 3 y NINGUN GET del objeto', c.codigo === 3 && unGet(c.pedidas) === 0 && /tama/i.test(c.texto), `${c.texto.replace(/\n/g, ' | ')} · ${c.pedidas.join(' · ')}`)
const d = await comprueba({ info: infoBuena({ metadata: { sha256: sha(Buffer.from('otro')), velas: '1' } }), get: () => ({ cuerpo: CUERPO, cab: { etag: '"abc"' } }) })
oraculo('Paso 6', 'el sha256 del cuerpo no es el de los metadatos: 1, sin reintento (un solo GET)', d.codigo === 1 && unGet(d.pedidas) === 1 && /sha256/i.test(d.texto), d.texto.replace(/\n/g, ' | '))
const e = await comprueba({ info: infoBuena(), get: () => ({ cuerpo: CUERPO }) })
oraculo('Paso 6', 'el GET sin etag pero con el sha256 de los metadatos: 0, y el informe avisa de que el GET no trae etag', e.codigo === 0 && /sin etag|no trae etag/i.test(e.texto), e.texto.replace(/\n/g, ' | '))
const f = await comprueba({ info: infoBuena({ metadata: {} }), get: () => ({ cuerpo: CUERPO }) })
oraculo('Paso 6', 'el GET sin etag y sin sha256 en los metadatos: 3', f.codigo === 3, f.texto.replace(/\n/g, ' | '))
const g = await comprueba({ info: infoBuena({ metadata: {} }), get: () => ({ cuerpo: CUERPO, cab: { etag: '"abc"' } }) })
oraculo('Paso 6', 'sin sha256 en los metadatos pero con etag y tamaño: 0, y el informe avisa de que falta el sha256', g.codigo === 0 && /sin sha256|falta.*sha256|no trae.*sha256/i.test(g.texto), g.texto.replace(/\n/g, ' | '))
const h = await comprueba({ info: null, get: () => ({ cuerpo: CUERPO }) })
oraculo('Paso 6', 'sin objeto (.json.gz ni .json): 3 y ningun GET del objeto', h.codigo === 3 && unGet(h.pedidas) === 0, h.texto.replace(/\n/g, ' | '))

titulo('A2 · MDC2-02: solo con identidad comprobada (etag igual o sha256 igual); velas de metadatos = velas del cuerpo')
// Astra cierres-2: info() sin etag ni sha256 y un GET de igual tamaño con otro contenido daba 0
const OTRO = gzipSync(Buffer.from(JSON.stringify([{ time: 1767312000, open: 1.9, high: 1.9, low: 1.9, close: 1.9, volume: 1 }])))
ver('control: la sustitucion tiene el mismo tamaño que el cuerpo esperado', OTRO.length === CUERPO.length, `${OTRO.length} / ${CUERPO.length}`)
const sinId = { name: GZ, version: 'v1', size: CUERPO.length, metadata: {} }
const i1 = await comprueba({ info: sinId, get: () => ({ cuerpo: CUERPO, cab: { etag: '"abc"' } }) })
oraculo('MDC2-02', 'info() sin etag ni sha256, GET con etag: no hay con que contrastar → 3', i1.codigo === 3 && /identidad/i.test(i1.texto), i1.texto.replace(/\n/g, ' | '))
const i2 = await comprueba({ info: sinId, get: () => ({ cuerpo: CUERPO }) })
oraculo('MDC2-02', 'info() sin etag ni sha256, GET sin etag → 3', i2.codigo === 3, i2.texto.replace(/\n/g, ' | '))
const i3 = await comprueba({ info: sinId, get: () => ({ cuerpo: OTRO }) })
oraculo('MDC2-02', 'sustitucion de igual tamaño (OHLC 1,9 en vez de 1,1) sin etag ni sha256 → 3', i3.codigo === 3, i3.texto.replace(/\n/g, ' | '))
const i4 = await comprueba({ info: infoBuena({ metadata: { sha256: sha(CUERPO), velas: '999' } }), get: () => ({ cuerpo: CUERPO, cab: { etag: '"abc"' } }) })
oraculo('MDC2-02', 'el informe muestra velas de metadatos (999) frente a las del cuerpo (1); no coinciden → 3', i4.codigo === 3 && /999/.test(i4.texto) && /velas/.test(i4.texto), i4.texto.replace(/\n/g, ' | '))
const i5 = await comprueba({ info: infoBuena({ metadata: { velas: '1' } }), get: () => ({ cuerpo: CUERPO, cab: { etag: '"abc"' } }) })
oraculo('MDC2-02', 'positivo: etag igual sin sha256 → 0 y «identidad verificada por etag»', i5.codigo === 0 && /identidad verificada por etag/.test(i5.texto), i5.texto.replace(/\n/g, ' | '))
const i6 = await comprueba({ info: { name: GZ, version: 'v1', size: CUERPO.length, metadata: { sha256: sha(CUERPO), velas: '1' } }, get: () => ({ cuerpo: CUERPO }) })
oraculo('MDC2-02', 'positivo: sha256 igual sin etag (ni en info() ni en el GET) → 0 y «identidad verificada por sha256»', i6.codigo === 0 && /identidad verificada por sha256/.test(i6.texto), i6.texto.replace(/\n/g, ' | '))

titulo('B · el script, con los dobles del arnes')
const hay = existsSync(REPO + 'scripts/comprueba-descarga.js')
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://proyecto-secreto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
escenario({ storage: { 'forex-data': { [GZ]: CUERPO } } })
db.metadatos['forex-data'] = { [GZ]: { sha256: sha(CUERPO), velas: '1' } }
const s = hay ? await correScript('scripts/comprueba-descarga.js', { ahora: '2026-10-11T08:00:00Z', argv: ['EURUSD'], env: ENV }) : { codigo: null, salida: [] }
const ops = db.log.filter(l => String(l.tabla).startsWith('storage'))
oraculo('Paso 6', 'el script: 0, sin proveedor, solo info y download (una descarga real del objeto), sin URL en el log', s.codigo === 0 && proveedor.llamadas.length === 0 && ops.every(l => l.op === 'info' || l.op === 'download') && ops.filter(l => l.op === 'download' && l.encontrado !== false).length === 1 && !s.salida.some(l => /proyecto-secreto|https?:/.test(l)), `codigo ${s.codigo} · ${ops.map(l => l.op).join(',')} · ${s.salida.slice(-1).join('')}`)
const s2 = hay ? await correScript('scripts/comprueba-descarga.js', { ahora: '2026-10-11T08:00:00Z', argv: ['XXXYYY'], env: ENV }) : { codigo: null }
oraculo('Paso 6', 'un par que no existe: 4 y nada pedido', s2.codigo === 4, `codigo ${s2.codigo}`)
titulo('C · el lector del diario aplica la misma regla (MDC2-02)')
{
  const correDiario = () => correScript('scripts/actualizar-diario.js', { ahora: '2026-02-03T06:00:00Z', argv: ['--subir', '--pares', 'EURUSD'], env: { ...ENV, MERCADO_TOPE_BYTES: '45000000' } })
  escenario({ storage: { 'forex-data': { [GZ]: CUERPO } } })
  db.infoSinEtag = true
  const d1 = await correDiario()
  oraculo('MDC2-02', 'diario: info() sin etag y sin sha256 en los metadatos → codigo 3, nada subido', d1.codigo === 3 && !db.log.some(l => l.op === 'upload' && !String(l.payload?.ruta).startsWith('_cerrojos/')), `codigo ${d1.codigo} · ${d1.salida.find(l => /EURUSD\/M1/.test(l)) ?? ''}`)
  escenario({ storage: { 'forex-data': { [GZ]: CUERPO } } })
  db.infoSinEtag = true
  db.metadatos['forex-data'] = { [GZ]: { sha256: sha(CUERPO), velas: '1' } }
  const d2 = await correDiario()
  db.infoSinEtag = false
  oraculo('MDC2-02', 'diario, control positivo: sin etag pero con el sha256 de los metadatos, la lectura se acepta (no 3)', d2.codigo !== 3 && !/identidad sin confirmar/.test(d2.salida.join('\n')), `codigo ${d2.codigo} · ${d2.salida.find(l => /EURUSD\/M1/.test(l)) ?? ''}`)
}
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(x => x.terminoPor !== 'timeout'))
fin()
