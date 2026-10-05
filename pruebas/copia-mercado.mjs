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
const copia = path.join(dir, 'EURUSD_2026.json')
const sha = createHash('sha256').update(TEXTO).digest('hex')
ver('copia el fichero tal cual, con su sha256 y verificada', fs.existsSync(copia) && fs.readFileSync(copia, 'utf8') === TEXTO && fs.readFileSync(copia + '.sha256', 'utf8').startsWith(sha) && r.salida.some(l => l.includes(sha) && l.includes('copia verificada')))
ver('dice la ultima vela real (7-ene 23:59 UTC)', r.salida.some(l => l.includes('ultima vela real: 2026-01-07T23:59:00.000Z')), r.salida.find(l => l.includes('ultima vela')))
const faltan = r.salida.find(l => l.includes('dias laborables cortos')) ?? ''
ver('y los dias que faltan hasta ayer: 1-ene (no, festivo), 8, 9, 12 y 13 de enero', /: 4 → 2026-01-08 \(0\/1200\), 2026-01-09 \(0\/1000\), 2026-01-12 \(0\/1200\), 2026-01-13 \(0\/1200\)$/.test(faltan), faltan)
ver('el par que no existe sale con ✗ y el script acaba con codigo 1', r.salida.some(l => /AUDUSD 2026: ✗ no existe/.test(l)) && r.codigo === 1)
ver('solo lectura: cero subidas o borrados en el bucket y cero llamadas al proveedor', !db.log.some(l => l.op === 'upload' || l.op === 'remove') && proveedor.llamadas.length === 0)
ver('y deja un resumen.txt', fs.existsSync(path.join(dir, 'resumen.txt')))
fs.rmSync(dir, { recursive: true, force: true })
fin()
