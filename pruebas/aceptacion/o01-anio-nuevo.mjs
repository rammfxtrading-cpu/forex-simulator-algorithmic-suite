/**
 * O01 (año nuevo) · EL CRON NO ARRANCA EL AÑO NUEVO
 *
 * Astra (4-oct): scripts/actualizar-diario.js con reloj 2-ene-2027 y sin
 * fichero 2027 da error antes de pedir una vela (:58-63). (La otra mitad de
 * O01, la restauracion, esta en o01-restaurar.)
 *
 * Se ejecuta: el script REAL (pruebas/script-falso.mjs: proveedor y Supabase
 * falsos, reloj fijo, sin .env real).
 *
 * ORACULO: el 2-ene-2027 sin EURUSD/M1/2027.json, el actualizador pide las
 * velas de 2027 (al menos el viernes 1-ene) y crea el fichero.
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, db } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'

titulo('actualizar-diario el 2-ene-2027 sin fichero 2027')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(diaM1('2026-12-31').map(c => ({ ...c, time: c.timestamp / 1000 }))) } } })
proveedor.responde = ({ dates }) => diaM1(dates.from.toISOString().slice(0, 10))
const d = await correScript('scripts/actualizar-diario.js', { ahora: '2027-01-02T06:00:00Z', argv: ['--subir'],
  env: { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' } })
ver('control: no abrio ningun .env real', d.envLeidos.length === 0)
ver('control: el script corrio entero (veredicto final impreso)', d.salida.some(l => /=== (✓ TODO OK|⚠️ ATENCION)/.test(l)))
const pidio = proveedor.llamadas.filter(l => l.instrumento === 'eurusd').map(l => l.desde.slice(0, 10))
oraculo('O01', 'el 2-ene-2027 arranca 2027: pide sus velas y crea el fichero', pidio.some(x => x.startsWith('2027')) && 'EURUSD/M1/2027.json' in db.storage['forex-data'],
  `${d.salida.find(l => /no se pudo leer/.test(l))?.trim() ?? ''}; pidio ${pidio.length} dias`)
ver('control (H06): todos los scripts terminaron (veredicto o exit), ninguno por timeout', ejecucionesScripts.length > 0 && ejecucionesScripts.every(e => e.terminoPor !== 'timeout'), JSON.stringify(ejecucionesScripts.map(e => e.terminoPor + ':' + e.codigo)))
fin()
