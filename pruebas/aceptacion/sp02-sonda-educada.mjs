/**
 * SP02 · SONDA EDUCADA (CTO, 6-oct-2026, tras la sonda 1)
 *
 * Sonda 1 (23:12): 75 peticiones en 8 min 37 s, 69 con HTTP 429 (limite de
 * volumen del proveedor) y 6 fallos de conexion al final. Decision del CTO:
 * la sonda hace UN solo intento por dia, sin reintentos; pausa configurable
 * entre peticiones (por defecto 30 s); se detiene entera al primer 429 o al
 * segundo fallo de conexion seguido, y enseña el Retry-After si viene. La
 * lista va por parametro.
 *
 * ORACULOS, a mano (proveedor falso):
 *   un 503 en un dia: una sola peticion para ese dia (sin reintentos);
 *   entre peticiones, «pausa 30 s» por defecto y «pausa 5 s» con --pausa 5;
 *   ninguna pausa despues de la ultima;
 *   el 2.º de cuatro dias da 429 con Retry-After 120: se para ahi (2
 *   peticiones), dice «Retry-After 120 s» y los dos restantes salen «no
 *   pedido»; con codigo 2;
 *   dos fallos de conexion seguidos: se para tras el 2.º; red, bien, red: no
 *   se para (no son seguidos).
 */
import { titulo, oraculo, fin, escenario, proveedor, REPO } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
import { existsSync } from 'node:fs'

const hay = existsSync(REPO + 'scripts/sonda-proveedor.js')
const corre = argv => hay ? correScript('scripts/sonda-proveedor.js', { ahora: '2026-10-07T07:00:00Z', argv, env: {} }) : Promise.resolve({ salida: [], codigo: null })
const pedidas = () => proveedor.llamadas.map(l => `${l.instrumento.toUpperCase()} ${l.desde.slice(0, 10)}`)
const fila = (r, par, dia) => r.salida.find(l => l.includes(par) && l.includes(dia) && !/intento/.test(l)) ?? ''
const red = () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }) }
const ok = dia => ({ status: 200, body: JSON.stringify(diaM1(dia)) })

titulo('1 · un intento por dia y pausa entre peticiones')
escenario({}); proveedor.http = (url, n, { dia }) => dia === '2026-07-20' ? { status: 503, body: '' } : ok(dia)
const r1 = await corre(['AUDUSD:2026-07-20', 'AUDUSD:2026-09-28', 'EURUSD:2026-07-21'])
oraculo('SP02', 'un 503: una sola peticion para ese dia (sin reintentos)', hay && pedidas().filter(x => x === 'AUDUSD 2026-07-20').length === 1 && /error\s+servidor\s+HTTP 503/.test(fila(r1, 'AUDUSD', '2026-07-20')), pedidas().join(' | '))
const pausas1 = r1.salida.filter(l => /^\s*\(pausa \d+ s\)/.test(l))
oraculo('SP02', 'entre peticiones, «pausa 30 s» por defecto, y ninguna tras la ultima', pausas1.length === 2 && pausas1.every(l => /pausa 30 s/.test(l)), pausas1.join(' | ') || '(sin pausas)')
escenario({}); proveedor.http = (url, n, { dia }) => ok(dia)
const r1b = await corre(['--pausa', '5', 'AUDUSD:2026-09-28..2026-09-29'])
const pausas1b = r1b.salida.filter(l => /^\s*\(pausa \d+ s\)/.test(l))
oraculo('SP02', 'con --pausa 5: «pausa 5 s»', pausas1b.length === 1 && /pausa 5 s/.test(pausas1b[0]) && r1b.codigo === 0, pausas1b.join(' | ') || `(sin pausas) codigo ${r1b.codigo}`)

titulo('2 · se detiene al primer 429 y enseña el Retry-After')
escenario({}); proveedor.http = (url, n, { dia }) => dia === '2026-09-28' ? { status: 429, headers: { 'Retry-After': '120' }, body: '' } : ok(dia)
const r2 = await corre(['AUDUSD:2026-09-27..2026-09-30'])
oraculo('SP02', '429 en el 2.º dia: se para ahi (2 peticiones), dice el Retry-After y los restantes «no pedido»', pedidas().length === 2 && r2.salida.some(l => /Retry-After 120 s/.test(l)) && /no pedido/.test(fila(r2, 'AUDUSD', '2026-09-29')) && /no pedido/.test(fila(r2, 'AUDUSD', '2026-09-30')) && r2.codigo === 2, `${pedidas().length} peticiones · ${r2.salida.filter(l => /429|Retry|no pedido/.test(l)).join(' | ')}`)

// CTO 7-oct (politica del 429): el actualizador espera un Retry-After que cabe y
// reintenta; la sonda NO: corta siempre al primer 429, aunque el Retry-After sea corto
escenario({}); proveedor.http = (url, n, { dia }) => dia === '2026-09-27' ? { status: 429, headers: { 'Retry-After': '1' }, body: '' } : ok(dia)
const r2b = await corre(['AUDUSD:2026-09-27..2026-09-28'])
oraculo('SP02', 'con un Retry-After de 1 s la sonda tampoco espera ni reintenta: una peticion y fin', pedidas().length === 1 && !r2b.esperas.includes(1000) && r2b.salida.some(l => /Retry-After 1 s/.test(l)), `${pedidas().length} peticion(es) · esperas ${JSON.stringify(r2b.esperas)}`)

titulo('2b · --cabeceras: solo las de limite (CTO 7-oct), sin URL')
escenario({}); proveedor.http = () => ({ status: 429, headers: { 'Retry-After': '30', 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '0', Server: 'cloudflare', Via: '1.1 proxy', 'CF-Ray': 'abc123-FRA', 'CF-Cache-Status': 'MISS', 'Set-Cookie': 'sesion=SECRETO', Location: 'https://x.invalid/SECRETO', 'Content-Type': 'text/html' }, body: '' })
const rc = await corre(['--cabeceras', 'EURUSD:2026-10-06'])
const cab = rc.salida.filter(l => /cabeceras:/i.test(l)).join(' ')
oraculo('SP02', 'imprime Retry-After, X-RateLimit-*, Server, Via y CF-*; nunca Set-Cookie, Location ni otras, ni URL', ['retry-after: 30', 'x-ratelimit-limit: 100', 'x-ratelimit-remaining: 0', 'server: cloudflare', 'via: 1.1 proxy', 'cf-ray: abc123-FRA', 'cf-cache-status: MISS'].every(x => cab.toLowerCase().includes(x.toLowerCase())) && !/SECRETO|set-cookie|location|content-type|https?:/i.test(rc.salida.join(' ')), cab || '(sin linea de cabeceras)')

titulo('3 · se detiene al segundo fallo de conexion seguido')
escenario({}); proveedor.http = () => red()
const r3 = await corre(['AUDUSD:2026-09-27..2026-09-30'])
oraculo('SP02', 'dos fallos de conexion seguidos: se para tras el 2.º', hay && pedidas().length === 2 && /no pedido/.test(fila(r3, 'AUDUSD', '2026-09-29')), `${pedidas().length} peticiones`)
escenario({}); proveedor.http = (url, n, { dia }) => dia === '2026-09-28' ? ok(dia) : red()
const r3b = await corre(['AUDUSD:2026-09-27..2026-09-29'])
oraculo('SP02', 'red, bien, red: no son seguidos, no se para (3 peticiones)', hay && pedidas().length === 3, `${pedidas().length} peticiones`)
proveedor.http = null
// MER-R2: una fecha imposible es una entrada no valida (4), sin RangeError
for (const mal of ['EURUSD:2026-99-99', 'EURUSD:2026-13-01']) { escenario({}); const r = await corre([mal]); oraculo('SP02', `${mal}: entrada no valida (4), sin pedir nada ni RangeError`, r.codigo === 4 && proveedor.llamadas.length === 0 && !r.salida.some(l => /RangeError|Invalid time/.test(l)), `codigo ${r.codigo} · ${r.salida.slice(-1)}`) }
oraculo('SP02', 'ningun script por timeout', hay && ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
