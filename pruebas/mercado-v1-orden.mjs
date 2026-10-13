/**
 * MERCADO V1 · LAS ORDENES DE LOS SCRIPTS (etapa 2; diseño sim-004 p.9).
 * Escrito ANTES que el codigo.
 *
 * scripts/mercado-v1-publica.mjs y scripts/mercado-v1-verifica.mjs son finos:
 * la logica vive en lib/mercado/orden-v1.mjs (ordenPublica, ordenVerifica) con
 * las dependencias inyectadas (copia local, descarga, almacen, fichero de
 * aceptaciones, informe). Aqui, con dependencias falsas:
 *   · SIMULACRO POR DEFECTO: sin --publica no se construye almacen (o, con
 *     --vigente, uno de SOLO LECTURA que lanza si se intenta escribir);
 *   · los datos: --base (copia local) o --descarga-autorizada (CTO 5-oct:
 *     hasta el 2-nov ningun anual sin su si); uno de los dos, no los dos;
 *   · --anota solo con --publica; argumentos desconocidos: uso (codigo 4);
 *   · codigos: 0 bien · 1 incidente o problema · 3 sin comprobar · 4 uso.
 */
import { titulo, oraculo, fin, importa, db } from './lib.mjs'
const O = await importa('lib/mercado/orden-v1.mjs')
const A = await importa('lib/mercado/aceptaciones.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const S = d => Date.parse(d + 'T00:00:00Z') / 1000
const U = iso => Date.parse(iso) / 1000
const linea = o => JSON.stringify(o) + '\n'
const ac = (o = {}) => ({ tipo: 'aceptacion', par: 'EURUSD', inicio: '2026-03-03T10:01Z', minutos: 20, motivo: 'corte_del_proveedor', fecha: '2026-10-14', nota: 'prueba', ...o })
function velas(desde, hasta, { faltan = [], px = () => 1.1 } = {}) {
  const out = []
  for (let t = S(desde); t < S(hasta); t += 60) {
    if (minutoCerrado(t) || faltan.some(([a, b]) => t >= U(a) && t < U(b))) continue
    const p = px(t); out.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 })
  }
  return out
}
function almacen() {
  const o = new Map(), registro = []
  return {
    o, registro,
    async lee(r) { registro.push(['lee', r]); const b = o.get(r); return b == null ? null : Buffer.from(b) },
    async sube(r, b, { upsert = false } = {}) { registro.push(['sube', r]); if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' },
    async borra(r) { registro.push(['borra', r]); o.delete(r) },
    async lista(p) { return [...o].filter(([k]) => k.startsWith(p)).map(([ruta, b]) => ({ ruta, bytes: b.length })) },
  }
}
const datos = { EURUSD: velas('2026-03-01', '2026-03-06', { faltan: [['2026-03-03T10:01Z', '2026-03-03T10:21Z']] }) }
// dependencias falsas: lo que se pide queda apuntado
function deps({ texto = linea(ac()), alm = null, copia = datos } = {}) {
  const d = {
    llamadas: [], texto, informes: {}, almacenes: 0, alm: alm ?? almacen(),
    leeCopia: async (base, par) => { d.llamadas.push(['copia', base, par]); if (!copia[par]) throw new Error(`sin ${par}`); return copia[par] },
    descarga: async par => { d.llamadas.push(['descarga', par]); return copia[par] },
    almacen: () => { d.almacenes++; return d.alm },
    leeTexto: async () => d.texto,
    escribeTexto: async t => { d.llamadas.push(['escribeTexto']); d.texto = t },
    escribeInforme: async (ruta, t) => { d.informes[ruta] = t },
    diasAceptadosDe: () => new Map(),
    ahora: () => '2026-10-14T10:00:00Z',
  }
  return d
}
const pub = (args, d) => O.ordenPublica(args, d)

titulo('1 · uso')
for (const [que, args] of [['sin --base ni --descarga-autorizada', ['--pares', 'EURUSD']], ['con los dos', ['--base', '/x', '--descarga-autorizada']], ['--anota sin --publica', ['--base', '/x', '--anota']], ['un argumento desconocido', ['--base', '/x', '--publicar']], ['un par desconocido', ['--base', '/x', '--pares', 'EURGBP']]]) {
  const d = deps(); const r = await pub(args, d)
  oraculo('ORD', `uso (${que}): codigo 4 y nada pedido`, r.codigo === 4 && d.llamadas.length === 0 && d.almacenes === 0, JSON.stringify(r.lineas?.slice(-2)))
}

titulo('2 · simulacro por defecto')
const d1 = deps()
const r1 = await pub(['--base', '/copia', '--pares', 'EURUSD', '--informe', '/tmp/informe.md'], d1)
oraculo('ORD', 'sin --publica: codigo 0, ni almacen ni descarga; lee la copia y escribe el informe', r1.codigo === 0 && d1.almacenes === 0 && !d1.llamadas.some(x => x[0] === 'descarga') && d1.llamadas.some(x => x[0] === 'copia' && x[1] === '/copia') && /EURUSD/.test(d1.informes['/tmp/informe.md'] ?? ''), JSON.stringify(r1.lineas))
oraculo('ORD', 'lo dice: SIMULACRO, y que sin --vigente planifica como primera publicacion', r1.lineas.some(l => /SIMULACRO/.test(l)) && r1.lineas.some(l => /primera publicacion/.test(l)))
const d2 = deps(); await O.ordenPublica(['--base', '/copia', '--pares', 'EURUSD', '--publica'], d2)
const d3 = deps({ alm: d2.alm })
const n3 = d2.alm.registro.length
const r3 = await pub(['--base', '/copia', '--pares', 'EURUSD', '--vigente'], d3)
oraculo('ORD', '--vigente: lee el puntero (solo lecturas en el almacen) y planifica desde el vigente: sin_cambios', r3.codigo === 0 && d3.almacenes === 1 && d2.alm.registro.length > n3 && d2.alm.registro.slice(n3).every(x => x[0] === 'lee') && r3.lineas.some(l => /sin_cambios/.test(l)), JSON.stringify(r3.lineas))
const soloLectura = O.soloLectura(almacen())
oraculo('ORD', 'soloLectura(almacen): subir o borrar lanzan', await (async () => { try { await soloLectura.sube('x', Buffer.from('')); return false } catch { try { await soloLectura.borra('x'); return false } catch { return true } } })())

titulo('3 · publicar y anotar')
const d4 = deps()
const r4 = await pub(['--base', '/copia', '--pares', 'EURUSD', '--publica', '--anota'], d4)
oraculo('ORD', '--publica: codigo 0, puntero en el almacen con EURUSD v1.1', r4.codigo === 0 && JSON.parse(d4.alm.o.get('v1/actual.json')).pares.EURUSD.version === 'v1.1', JSON.stringify(r4.lineas))
oraculo('ORD', '--anota: el fichero de aceptaciones recibe la publicacion (con el sha del trozo del martes) y valida', A.validaAceptaciones(d4.texto).publicadas.has('EURUSD|2026-03-03T10:01Z') && d4.llamadas.some(x => x[0] === 'escribeTexto'))
oraculo('ORD', 'y recuerda que el fichero entra por commit', r4.lineas.some(l => /commit/.test(l)))
const d5 = deps({ texto: linea(ac({ nota: 'cambiada' })), alm: d4.alm })
const r5 = await pub(['--base', '/copia', '--pares', 'EURUSD', '--publica'], d5)
oraculo('ORD', 'incidente (aceptacion publicada editada): codigo 1 y el puntero intacto', r5.codigo === 1 && JSON.parse(d4.alm.o.get('v1/actual.json')).pares.EURUSD.version === 'v1.1' && r5.lineas.some(l => /INCIDENTE/.test(l)), JSON.stringify(r5.lineas))
const d6 = deps({ copia: {} })
oraculo('ORD', 'la copia no se puede leer: codigo 3', (await pub(['--base', '/copia', '--pares', 'EURUSD'], d6)).codigo === 3)
const d7 = deps()
await pub(['--descarga-autorizada', '--pares', 'EURUSD'], d7)
oraculo('ORD', '--descarga-autorizada: descarga (y no lee la copia)', d7.llamadas.some(x => x[0] === 'descarga') && !d7.llamadas.some(x => x[0] === 'copia'))

titulo('4 · verificar')
const n0 = d4.alm.registro.length
const v0 = await O.ordenVerifica(['--base', '/copia', '--pares', 'EURUSD'], deps({ texto: d4.texto, alm: d4.alm }))
const soloLee = d4.alm.registro.slice(n0).every(x => x[0] === 'lee') && d4.alm.registro.length > n0
oraculo('ORD', 'verificar lo publicado contra la copia: codigo 0', v0.codigo === 0, JSON.stringify(v0.lineas))
const v1 = await O.ordenVerifica([], deps({ texto: d4.texto, alm: d4.alm }))
oraculo('ORD', 'verificar sin datos con que comparar: codigo 3 (no comprobado)', v1.codigo === 3, JSON.stringify(v1.lineas))
const malo = deps({ texto: d4.texto, alm: d4.alm }); malo.alm = almacen(); for (const [k, v] of d4.alm.o) malo.alm.o.set(k, v)
malo.alm.o.set([...malo.alm.o.keys()].find(k => /\.bin\.br$/.test(k)), Buffer.from('x'))
oraculo('ORD', 'un trozo roto en Storage: codigo 1', (await O.ordenVerifica(['--base', '/copia', '--pares', 'EURUSD'], malo)).codigo === 1)
oraculo('ORD', 'verificar no escribe nada: solo lecturas en el almacen', soloLee)

titulo('5 · los scripts reales, sin red (humo): uso, copia local verificada y copia alterada')
const { spawnSync } = await import('child_process')
const { mkdtempSync, writeFileSync, rmSync } = await import('fs')
const { createHash } = await import('crypto')
const os = await import('os')
const nodo = (script, args) => spawnSync(process.execPath, ['--import', './pruebas/sin-red.mjs', script, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, TZ: 'Europe/Madrid' } })
const u = nodo('scripts/mercado-v1-publica.mjs', [])
oraculo('ORD', 'publica sin argumentos: uso, codigo 4', u.status === 4 && /Uso/.test(u.stdout), u.stdout + u.stderr)
const dir = mkdtempSync(os.tmpdir() + '/mercado-v1-copia-')
try {
  const cuerpo = Buffer.from(JSON.stringify(velas('2026-03-01', '2026-03-06')))
  writeFileSync(`${dir}/EURUSD_2026.json`, cuerpo)
  writeFileSync(`${dir}/EURUSD_2026.json.sha256`, createHash('sha256').update(cuerpo).digest('hex') + '  EURUSD_2026.json\n')
  const ok = nodo('scripts/mercado-v1-publica.mjs', ['--base', dir, '--pares', 'EURUSD'])
  oraculo('ORD', 'simulacro con una copia local verificada: codigo 0 y EURUSD hasta el miercoles', ok.status === 0 && /EURUSD publica v1\.1 hasta 2026-03-04/.test(ok.stdout), ok.stdout + ok.stderr)
  writeFileSync(`${dir}/EURUSD_2026.json.sha256`, 'f'.repeat(64) + '  EURUSD_2026.json\n')
  const malo = nodo('scripts/mercado-v1-publica.mjs', ['--base', dir, '--pares', 'EURUSD'])
  oraculo('ORD', 'la copia no cuadra con su .sha256: codigo 3, sin planificar', malo.status === 3 && /sha256/.test(malo.stdout) && !/publica v1/.test(malo.stdout), malo.stdout + malo.stderr)
  const vu = nodo('scripts/mercado-v1-verifica.mjs', ['--base', dir, '--descarga-autorizada'])
  oraculo('ORD', 'verifica con --base y --descarga-autorizada a la vez: uso, codigo 4', vu.status === 4, vu.stdout + vu.stderr)
} finally { rmSync(dir, { recursive: true, force: true }) }


titulo('6 · E2-02 y E2-04 en la orden (Astra, CTO 14-oct)')
const FUGA = /FUGA123|supabase\.co|apikey/
// E2-02: el 503 al releer el puntero tras un PUT correcto, con --anota y un hueco aceptado
const dI = deps({ alm: (() => { const a = almacen(); let escrito = false; const s = a.sube, l = a.lee
  a.sube = async (r, b, o) => { const x = await s(r, b, o); if (r === 'v1/actual.json') escrito = true; return x }
  a.lee = async r => { if (r === 'v1/actual.json' && escrito) throw Object.assign(new Error('503 https://proyecto.supabase.co/?apikey=FUGA123'), { statusCode: 503 }); return l(r) }
  return a })() })
dI.id = () => '0b7c2f4e-1a2b-4c3d-8e9f-a0b1c2d3e4f5'
const rI = await pub(['--base', '/copia', '--pares', 'EURUSD', '--publica', '--anota'], dI)
const lI = rI.lineas.join('\n')
oraculo('E2-02', 'incierto: codigo 3, «INCIERTO: reconciliar», el cerrojo conservado con su id y la instruccion', rI.codigo === 3 && rI.incierto === true && /INCIERTO: reconciliar/.test(lI) && dI.alm.o.has('v1/_cerrojo.json') && lI.includes('0b7c2f4e-1a2b-4c3d-8e9f-a0b1c2d3e4f5') && /liberar-cerrojo/.test(lI) && /HTTP 503/.test(lI) && !FUGA.test(lI), lI)
oraculo('E2-02', 'no anota nada aunque se pida --anota; enseña la publicacion pendiente (con el sha del trozo) y el puntero esperado', !dI.llamadas.some(x => x[0] === 'escribeTexto') && rI.lineas.some(l => { try { const o = JSON.parse(l); return o.tipo === 'publicacion' && o.par === 'EURUSD' && o.trozos.length === 1 } catch { return false } }) && /puntero esperado: \{"esquema":"mercado-puntero@1"/.test(lI), lI)
const dL = deps({ alm: (() => { const a = almacen(); a.borra = async () => { throw new Error('500') }; return a })() })
const rL = await pub(['--base', '/copia', '--pares', 'EURUSD', '--publica'], dL)
oraculo('E2-03', 'publicado pero el cerrojo no se pudo soltar: codigo 3 y lo dice con el script para liberarlo', rL.codigo === 3 && rL.lineas.some(l => /publicado EURUSD/.test(l)) && rL.lineas.some(l => /no se pudo soltar/.test(l) && /liberar-cerrojo/.test(l)), rL.lineas.join(' / '))
// E2-04: en la frontera del log, solo mensajes propios o «clase codigo»
const dJ = deps(); dJ.leeCopia = async () => { throw Object.assign(new SyntaxError('Unexpected token F, "FUGA123" is not valid JSON'), {}) }
const rJ = await pub(['--base', '/copia', '--pares', 'EURUSD'], dJ)
oraculo('E2-04', 'un error ajeno de los datos (no propio): «SyntaxError otro», sin su texto', rJ.codigo === 3 && rJ.lineas.some(l => /SyntaxError otro/.test(l)) && !FUGA.test(rJ.lineas.join(' ')), rJ.lineas.join(' / '))
const dK = deps({ alm: (() => { const a = almacen(); a.lee = async () => { throw new Error('ECONNRESET https://proyecto.supabase.co/?apikey=FUGA123') }; return a })() })
const rK = await O.ordenVerifica(['--pares', 'EURUSD'], dK)
oraculo('E2-04', 'verificar con un almacen que lanza un error ajeno: codigo 1 o 3 y sin su texto', [1, 3].includes(rK.codigo) && !FUGA.test(rK.lineas.join(' ')), rK.lineas.join(' / '))
// el saneador de las dependencias reales: tambien al materializar el cuerpo (arrayBuffer)
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto-falso.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-falsa-FUGA123'
const D = await importa('scripts/mercado-v1-dependencias.mjs')
db.storage.mercado = { 'v1/actual.json': '{}' }
db.cuerpoFalla = Object.assign(new TypeError('terminated: https://proyecto.supabase.co/storage/v1/object/mercado/v1/actual.json?apikey=FUGA123'), { cause: { code: 'UND_ERR_SOCKET' } })
let eB = null; try { await D.dependencias().almacen().lee('v1/actual.json') } catch (e) { eB = e }
db.cuerpoFalla = null
oraculo('E2-04', 'dependencias reales: si arrayBuffer() lanza, el error sale saneado y propio («TypeError UND_ERR_SOCKET»)', eB?.propio === true && /leer v1\/actual.json: TypeError UND_ERR_SOCKET/.test(eB.message) && !FUGA.test(eB.message), eB?.message)
fin()
