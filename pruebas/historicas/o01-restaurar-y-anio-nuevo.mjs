/**
 * O01 · RESTAURAR PUEDE EMPEORAR EL HISTORICO Y EL CRON NO ARRANCA EL AÑO NUEVO
 *
 * Astra (4-oct): scripts/restore-2026.js sube lo que devuelva el proveedor sin
 * comprobar cobertura (:44-52), despues borra los 2023 sin mirar el resultado
 * (:58-62) y acaba en «Done.». Y scripts/actualizar-diario.js con reloj
 * 2-ene-2027 y sin fichero 2027 da error antes de pedir una vela (:58-63).
 *
 * Se ejecuta: los dos scripts REALES (pruebas/script-falso.mjs: proveedor y
 * Supabase falsos, reloj fijo, .env.local FALSO en una carpeta temporal; un
 * espia de fs comprueba que no se abre ningun .env de verdad).
 *
 * ORACULOS, a mano:
 *   · el proveedor devuelve [] para todo: el 2026 guardado (100 velas) NO se
 *     sustituye por uno vacio; los 2023 no se borran como efecto colateral; el
 *     script no acaba en «Done.» con codigo 0 como si todo hubiera ido bien.
 *   · 2-ene-2027 sin EURUSD/M1/2027.json: el actualizador pide las velas de
 *     2027 (al menos el viernes 1-ene) y crea el fichero.
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, db } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript } from '../script-falso.mjs'
const cien = JSON.stringify(diaM1('2026-01-05', 100).map(c => ({ time: c.timestamp / 1000, open: 1, high: 1, low: 1, close: 1, volume: 1 })))

titulo('1 · restore-2026 con el proveedor vacio')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': cien, 'EURUSD/M1/2023.json': '[]', 'GBPUSD/M1/2023.json': '[]' } } })
proveedor.responde = () => []
const r = await correScript('scripts/restore-2026.js', { ahora: '2026-10-04T12:00:00Z' })
ver('control positivo del espia: vio la lectura del .env.local FALSO de la carpeta temporal', r.envTodos.length === 1 && r.envTodos[0].endsWith('.env.local'), r.envTodos.length)
ver('control: no abrio ningun .env real', r.envLeidos.length === 0, r.envLeidos.length)
ver('control: el script llego al final', r.salida.includes('Done.'), r.salida.slice(-2).join(' | '))
const queda = JSON.parse(db.storage['forex-data']['EURUSD/M1/2026.json']).length
oraculo('O01', 'con el proveedor vacio, el 2026 guardado no se sustituye', queda === 100, `EURUSD 2026 pasa de 100 a ${queda} velas`)
oraculo('O01', 'restaurar no borra los 2023 de paso', 'EURUSD/M1/2023.json' in db.storage['forex-data'], `2023 que quedan: ${Object.keys(db.storage['forex-data']).filter(k => k.includes('2023')).length} de 2`)
oraculo('O01', 'y no acaba como si todo hubiera ido bien', !r.salida.includes('Done.') || (r.exitCode ?? 0) !== 0, `ultimas lineas: ${r.salida.slice(-2).join(' | ')}; codigo ${r.exitCode ?? 0}`)

titulo('2 · actualizar-diario el 2-ene-2027 sin fichero 2027')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(diaM1('2026-12-31').map(c => ({ ...c, time: c.timestamp / 1000 }))) } } })
proveedor.responde = ({ dates }) => diaM1(dates.from.toISOString().slice(0, 10))
const d = await correScript('scripts/actualizar-diario.js', { ahora: '2027-01-02T06:00:00Z', argv: ['--subir'],
  env: { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' } })
ver('control: el script corrio entero (veredicto final impreso)', d.salida.some(l => /=== (✓ TODO OK|⚠️ ATENCION)/.test(l)))
const pidio = proveedor.llamadas.filter(l => l.instrumento === 'eurusd').map(l => l.desde.slice(0, 10))
oraculo('O01', 'el 2-ene-2027 arranca 2027: pide sus velas y crea el fichero', pidio.some(x => x.startsWith('2027')) && 'EURUSD/M1/2027.json' in db.storage['forex-data'],
  `${d.salida.find(l => /no se pudo leer/.test(l))?.trim() ?? ''}; pidio ${pidio.length} dias`)
fin()
