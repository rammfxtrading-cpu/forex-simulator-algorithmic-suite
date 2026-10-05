/**
 * BD-03 · UNA PETICION NUEVA COMPARTE UNA LECTURA ANTERIOR A LA PUBLICACION
 *
 * Astra (verificacion del bloque D, 5-oct): /api/candles compartia por par y
 * año TODA la comprobacion y lectura en curso (unaVez). A consulta v1 y lee un
 * Blob de 1.200 velas; se retiene la entrega. Se publica v2 (1.440). DESPUES
 * llega B, se une a la promesa de A y recibe 1.200: empezo despues de publicar
 * y no comprobo su version.
 * Decision del CTO (bloque E, punto 2): la version se comprueba POR PETICION y
 * las descargas se comparten por RUTA + VERSION, no por peticion en curso.
 *
 * ORACULOS: B (llega tras publicar v2) sirve 1.440 y no espera a la descarga
 * retenida de A; dos peticiones de la misma version comparten UNA descarga.
 */
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, importa, db, asienta } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
const candles = (await importa('pages/api/candles.js')).default
const velas = n => JSON.stringify(diaM1('2025-01-06', n).map(c => ({ time: c.timestamp / 1000, open: 1, high: 1, low: 1, close: 1, volume: 1 })))
const q = { pair: 'NZDUSD', timeframe: 'M1', from: String(Date.parse('2025-01-06T00:00:00Z') / 1000), to: String(Date.parse('2025-01-07T00:00:00Z') / 1000), year: '2025' }
const pide = () => llama(candles, { method: 'GET', token: tok(A), query: q })
const descargas = () => db.log.filter(l => l.op === 'download').length

titulo('1 · A lee v1 (1.200) y su entrega se retiene; se publica v2 (1.440); llega B')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'NZDUSD/M1/2025.json': velas(1200) } } })
let suelta, retenida = new Promise(r => { suelta = r }), retenidas = 0
db.entrega = async () => { if (++retenidas === 1) await retenida }
const pa = pide()
await asienta(100)
ver('control: la lectura de A ya tiene el contenido de v1 y su entrega esta retenida', retenidas === 1)
db.storage['forex-data']['NZDUSD/M1/2025.json'] = velas(1440)           // se publica v2
let bTermino = false
const pb = pide().then(r => { bTermino = true; return r })
await asienta(200)
oraculo('BD03', 'B (empezo despues de publicar v2) no espera a la descarga retenida de A', bTermino)
suelta()
const [ra, rb] = await Promise.all([pa, pb])
db.entrega = null
oraculo('BD03', 'B sirve v2: 1.440 velas', rb.estado === 200 && rb.cuerpo.count === 1440, `estado ${rb.estado}, ${rb.cuerpo?.count} velas`)
ver('control: A tambien responde (1.200 o 1.440; no se le exige ver v2)', ra.estado === 200 && [1200, 1440].includes(ra.cuerpo.count), `${ra.estado} ${ra.cuerpo?.count}`)

titulo('2 · dos peticiones de la misma version comparten una descarga')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'NZDUSD/M1/2025.json': velas(1300) } } })
let suelta2, retenida2 = new Promise(r => { suelta2 = r })
db.pausa = c => c.op === 'download' ? retenida2 : null
const p1 = pide(), p2 = pide()
await asienta(150)
suelta2()
const [r1, r2] = await Promise.all([p1, p2])
db.pausa = null
oraculo('BD03', 'una sola descarga para las dos, y las dos sirven 1.300', descargas() === 1 && r1.cuerpo?.count === 1300 && r2.cuerpo?.count === 1300, `${descargas()} descargas`)
fin()
