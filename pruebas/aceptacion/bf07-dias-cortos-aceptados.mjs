/**
 * BF07 · DIAS CORTOS ACEPTADOS: UNA LISTA EXPLICITA Y VERSIONADA
 * (CTO, 6-oct-2026, sobre 4030318)
 *
 * Con G10 un dia interior corto sin reparar deja el año en codigo 1. Un dia que
 * el proveedor no tiene entero nunca (NZDUSD 29-mar-2024, Viernes Santo: 973
 * velas de 00:01 a 20:59 en la copia del 5-oct; umbral del viernes 1.000) lo
 * dejaria asi para siempre. Decision del CTO: lista explicita de dias
 * aceptados (par, fecha, velas, motivo) en un fichero versionado que solo
 * cambia por commit (lib/mercado/dias-aceptados.json; no hay variable ni
 * opcion que lo sustituya). Un dia de la lista con AL MENOS esas velas no deja
 * el año en codigo 1. Primera entrada: NZDUSD 2024-03-29, 973, Viernes Santo.
 * El 20-jul-2026 no entra: se recupera.
 *
 * ORACULOS, a mano (hoy miercoles 3-abr-2024; 2024 completo hasta el 2-abr):
 *   NZDUSD con el 29-mar en 973: codigo 0, TODO OK, y el 29-mar ni se pide.
 *   Con 972: codigo 1 y el estado lo nombra (hacen falta al menos 973).
 *   AUDUSD con 973 el mismo dia: codigo 1 (la lista es por par).
 *   El fichero: exactamente la entrada de NZDUSD, y la validacion rechaza una
 *   entrada sin motivo, con fecha mal escrita, velas no enteras o par
 *   desconocido.
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, importa } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
import { readFileSync, existsSync } from 'node:fs'
import { REPO } from '../lib.mjs'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const velasDe = (dia, n = 1440, desde = 0) => diaM1(dia, 1440).slice(desde, desde + n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
// 2024 hasta el 2-abr: 1-ene reducido (22:00–23:59), laborables enteros, domingos de 120; el 29-mar con `n` velas desde las 00:01
const historial = n => { const v = []; for (let t = Date.parse('2024-01-01T00:00:00Z'); t <= Date.parse('2024-04-02T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (d === '2024-01-01' || w === 0) v.push(...velasDe(d, 120, 22 * 60)); else if (d === '2024-03-29') v.push(...velasDe(d, n, 1)); else if (w >= 1 && w <= 5) v.push(...velasDe(d)) } return v }
const filasMs = vs => JSON.stringify(vs.map(v => ({ timestamp: v.time * 1000, open: v.open, high: v.high, low: v.low, close: v.close, volume: 1 })))
const seccion = (r, t) => { const i = r.salida.findIndex(l => l.includes(t)); if (i < 0) return []; const out = []; for (let k = i + 1; k < r.salida.length && !/^\s*===/.test(r.salida[k]) && r.salida[k].trim() !== ''; k++) out.push(r.salida[k]); return out }
// el proveedor tampoco tiene mas del 29-mar que las velas guardadas
const responde = n => { proveedor.http = (url, i, { dia }) => ({ status: 200, body: dia === '2024-03-29' ? filasMs(velasDe(dia, n, 1)) : JSON.stringify(diaM1(dia)) }) }
const corre = par => correScript('scripts/actualizar-diario.js', { ahora: '2024-04-03T06:00:00Z', argv: ['--subir', '--pares', par], env: ENV })
const pidio29 = par => proveedor.llamadas.some(l => l.instrumento === par.toLowerCase() && l.desde.startsWith('2024-03-29'))

titulo('1 · NZDUSD con el Viernes Santo de 2024 en 973 velas (la entrada de la lista)')
escenario({ storage: { 'forex-data': { 'NZDUSD/M1/2024.json': JSON.stringify(historial(973)) } } }); responde(973)
const r1 = await corre('NZDUSD')
oraculo('BF07', 'codigo 0 y TODO OK: el dia aceptado no deja el año en codigo 1', r1.codigo === 0 && r1.salida.some(l => /TODO OK/.test(l)), `codigo ${r1.codigo} · ${seccion(r1, 'ESTADO DE LOS DATOS').join(' | ')}`)
oraculo('BF07', 'y el 29-mar no se vuelve a pedir', !pidio29('NZDUSD'), proveedor.llamadas.map(l => l.desde.slice(0, 10)).join(' '))

titulo('2 · con 972 velas: por debajo de lo aceptado')
escenario({ storage: { 'forex-data': { 'NZDUSD/M1/2024.json': JSON.stringify(historial(972)) } } }); responde(972)
const r2 = await corre('NZDUSD')
oraculo('BF07', 'codigo 1 y el estado de los datos nombra el 2024-03-29', r2.codigo === 1 && seccion(r2, 'ESTADO DE LOS DATOS').some(l => /NZDUSD/.test(l) && /2024-03-29/.test(l)), `codigo ${r2.codigo} · ${seccion(r2, 'ESTADO DE LOS DATOS').join(' | ')}`)

titulo('3 · AUDUSD con 973 el mismo dia: la lista es por par')
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2024.json': JSON.stringify(historial(973)) } } }); responde(973)
const r3 = await corre('AUDUSD')
oraculo('BF07', 'AUDUSD: codigo 1 y su 29-mar sigue pendiente', r3.codigo === 1 && pidio29('AUDUSD'), `codigo ${r3.codigo}`)

titulo('4 · el fichero versionado y su validacion')
// 6-oct (CTO): la lista paso de .json a .mjs para que la cargue tambien el navegador
const RUTA = REPO + 'lib/mercado/dias-aceptados.mjs'
let lista = null
try { lista = (await importa('lib/mercado/dias-aceptados.mjs')).default } catch { lista = null }
oraculo('BF07', 'lib/mercado/dias-aceptados.mjs tiene exactamente la entrada de NZDUSD', Array.isArray(lista) && lista.length === 1 && lista[0].par === 'NZDUSD' && lista[0].fecha === '2024-03-29' && lista[0].velas === 973 && /viernes santo/i.test(lista[0].motivo ?? ''), existsSync(RUTA) ? JSON.stringify(lista) : 'no existe')
let A = null
try { A = await importa('lib/mercado/aceptados.mjs') } catch { A = null }
const rechaza = e => { try { A.validaAceptados(JSON.stringify([e])); return false } catch { return true } }
const buena = { par: 'NZDUSD', fecha: '2024-03-29', velas: 973, motivo: 'Viernes Santo' }
oraculo('BF07', 'la validacion acepta la buena y rechaza: sin motivo, fecha mal escrita, velas no enteras, par desconocido, repetida', !!A?.validaAceptados && !rechaza(buena) && rechaza({ ...buena, motivo: '' }) && rechaza({ ...buena, fecha: '29-03-2024' }) && rechaza({ ...buena, velas: 97.3 }) && rechaza({ ...buena, par: 'XXXYYY' }) && (() => { try { A.validaAceptados(JSON.stringify([buena, buena])); return false } catch { return true } })(), A ? 'validaAceptados' : 'no existe lib/mercado/aceptados.mjs')
proveedor.http = null
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
