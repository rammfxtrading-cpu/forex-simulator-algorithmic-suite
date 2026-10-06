/**
 * scripts/copia-mercado.js · COPIA LOCAL Y DIAGNOSTICO, SOLO LECTURA (5-oct-2026)
 *
 * Herramienta nueva para el plan de recuperacion de los pares retrasados (no se
 * ejecuta contra produccion aqui). Con Storage y proveedor FALSOS:
 *   · copia EURUSD 2026 a una carpeta temporal, con su sha256, y la verifica
 *   · dice la ultima vela real y los dias laborables que faltan hasta ayer
 *   · un par que no existe sale con ✗ y codigo 1
 *   · cero escrituras en el bucket y cero llamadas al proveedor
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { titulo, ver, fin, escenario, db, proveedor } from './lib.mjs'
import { diaM1 } from './proveedor-falso.mjs'
import { correScript } from './script-falso.mjs'
const DIA = 86400000
const velas = []
for (let t = Date.UTC(2026, 0, 2); t <= Date.UTC(2026, 0, 7); t += DIA) { const w = new Date(t).getUTCDay(); if (w >= 1 && w <= 5) velas.push(...diaM1(new Date(t).toISOString().slice(0, 10)).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))) }
const TEXTO = JSON.stringify(velas)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copia-'))
titulo('copia y diagnostico de EURUSD (datos hasta el 7-ene) y AUDUSD (no existe), hoy 14-ene-2026')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': TEXTO } } })
const r = await correScript('scripts/copia-mercado.js', { ahora: '2026-01-14T09:00:00Z', argv: ['EURUSD', 'AUDUSD'], env: { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa', COPIA_DIR: dir } })
// BE-03: la copia va en la carpeta de la ejecucion, dentro de COPIA_DIR
const carpetaDe = r => r.salida.find(l => l.startsWith('Copia en '))?.slice('Copia en '.length).trim()
const copia = path.join(carpetaDe(r) ?? dir, 'EURUSD_2026.json')
const sha = createHash('sha256').update(TEXTO).digest('hex')
ver('copia el fichero tal cual, con su sha256 y verificada', fs.existsSync(copia) && fs.readFileSync(copia, 'utf8') === TEXTO && fs.readFileSync(copia + '.sha256', 'utf8').startsWith(sha) && r.salida.some(l => l.includes(sha) && l.includes('copia verificada')))
ver('dice la ultima vela real (7-ene 23:59 UTC)', r.salida.some(l => l.includes('ultima vela real: 2026-01-07T23:59:00.000Z')), r.salida.find(l => l.includes('ultima vela')))
const faltan = r.salida.find(l => l.includes('dias laborables cortos')) ?? ''
ver('y los dias que faltan hasta ayer: 1-ene (no, festivo), 8, 9, 12 y 13 de enero', /: 4 → 2026-01-08 \(0\/1200\), 2026-01-09 \(0\/1000\), 2026-01-12 \(0\/1200\), 2026-01-13 \(0\/1200\)$/.test(faltan), faltan)
ver('el par que no existe sale con ✗ y el script acaba con codigo 1', r.salida.some(l => /AUDUSD 2026: ✗ no existe/.test(l)) && r.codigo === 1)
ver('solo lectura: cero subidas o borrados en el bucket y cero llamadas al proveedor', !db.log.some(l => l.op === 'upload' || l.op === 'remove') && proveedor.llamadas.length === 0)
ver('dice el tamaño en bytes de la copia', r.salida.some(l => l.includes(`${Buffer.byteLength(TEXTO)} bytes`)), Buffer.byteLength(TEXTO))
ver('y deja un resumen-2026.txt (el año en el nombre)', fs.existsSync(path.join(carpetaDe(r) ?? dir, 'resumen-2026.txt')))
titulo('ANIO=2025 copia 2025, no el año en curso (5-oct: «AÑO» no llegaba y se copio 2026 dos veces)')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2025.json': TEXTO.replaceAll('"time":176', '"time":173'), 'EURUSD/M1/2026.json': TEXTO } } })
const r25 = await correScript('scripts/copia-mercado.js', { ahora: '2026-01-14T09:00:00Z', argv: ['EURUSD'], env: { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa', COPIA_DIR: dir, ANIO: '2025' } })
ver('lee EURUSD/M1/2025.json y escribe EURUSD_2025.json', db.log.some(l => l.op === 'download' && l.payload === 'EURUSD/M1/2025.json') && !db.log.some(l => l.op === 'download' && l.payload === 'EURUSD/M1/2026.json') && fs.existsSync(path.join(carpetaDe(r25) ?? dir, 'EURUSD_2025.json')) && r25.salida.some(l => /^Año 2025$/.test(l)), r25.salida[0])
const rmal = await correScript('scripts/copia-mercado.js', { ahora: '2026-01-14T09:00:00Z', argv: ['EURUSD'], env: { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa', COPIA_DIR: dir, ANIO: 'dosmil' } })
ver('un ANIO no valido no copia nada y acaba con codigo 1', rmal.codigo === 1 && rmal.salida.some(l => /ANIO no valido/.test(l)))

titulo('BE-03 (Astra, cierres-3; bloque G, punto 4): cada ejecucion en su carpeta; nunca sobrescribe')
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'copias-'))
const corre2 = () => correScript('scripts/copia-mercado.js', { ahora: '2026-01-14T09:00:00Z', argv: ['EURUSD'], env: { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa', COPIA_DIR: base } })
const carpeta = r => r.salida.find(l => l.startsWith('Copia en '))?.slice('Copia en '.length).trim()
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': TEXTO } } })
const e1 = await corre2()
const MEJOR = JSON.stringify([...JSON.parse(TEXTO), ...diaM1('2026-01-08').map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))])
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': MEJOR } } })            // el bucket cambia (p. ej. tras recuperar)
const e2 = await corre2()
const c1 = carpeta(e1), c2 = carpeta(e2)
ver('dos ejecuciones → dos carpetas distintas dentro de la base', !!c1 && !!c2 && c1 !== c2 && path.dirname(c1) === fs.realpathSync(base) && path.dirname(c2) === fs.realpathSync(base), `${c1} · ${c2}`)
ver('la copia de la primera sigue intacta (la de antes de cambiar el bucket)', !!c1 && fs.readFileSync(path.join(c1, 'EURUSD_2026.json'), 'utf8') === TEXTO && !!c2 && fs.readFileSync(path.join(c2, 'EURUSD_2026.json'), 'utf8') === MEJOR)
ver('cada carpeta tiene su resumen, que nombra su propia ejecucion', !!c1 && fs.readFileSync(path.join(c1, 'resumen-2026.txt'), 'utf8').includes(path.basename(c1)) && !!c2 && fs.readFileSync(path.join(c2, 'resumen-2026.txt'), 'utf8').includes(path.basename(c2)))
fs.rmSync(base, { recursive: true, force: true })
fs.rmSync(dir, { recursive: true, force: true })
fin()
