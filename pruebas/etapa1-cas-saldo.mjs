/**
 * EL SALDO DEL CAS DE /api/challenge/advance VIAJA COMO TEXTO (autorrevision de a7ba57f, CTO 13-oct)
 *
 * PostgREST devuelve un numeric como NUMERO JSON (to_json): supabase-js lo parsea a float. Si
 * el CAS filtrara con ese float (String(n) → balance=eq.<n>), un numeric con mas cifras de las
 * que un double conserva no casaria NUNCA: 409 eterno sin carrera real. Por eso advance lee
 * tambien balance::text y filtra con ese texto, exacto.
 *
 *   1 PostgreSQL 17 local: saldos de decimales problematicos escritos por SQL. Por cada uno, lo
 *     que filtraria cada camino, como lo haria PostgREST (balance = '<valor>'):
 *       numero  JSON.parse(to_json(balance)) → String(n)
 *       texto   balance::text
 *     El texto casa SIEMPRE; el numero no (control: el instrumento ve el problema)
 *   2 el handler: lee balance_texto:balance::text en la misma lectura de la sesion y lo usa en
 *     el WHERE del CAS (no session.balance)
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'

titulo('1 · PostgreSQL: el numero JS frente al texto de la base')
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const SALDOS = ['10234.57', '10234.50', '10234.5700', '0.10', '99999999.99', '10000.300000000001', '123456789012345.67', '10000.300000000000000001', '10234.570000000000000000001']
const pg = cluster()
const filas = []
try {
  pg.arranca()
  const c = pg.psql('create database p', 'postgres'); const m = pg.psql(PRODUCCION, 'p')
  ver('montaje s04', c.ok && m.ok, (c.err || m.err).split('\n')[0])
  const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
  // una raiz y los saldos como hijas: el cupo de s04 (6 raices por alumno) no cuenta las hijas
  const alta = [pg.psql(`insert into auth.users values ('${u(1)}');
    insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to) values ('${u(99)}', '${u(1)}', 'raiz', 'EURUSD', 'H1', '2026-01-01', '2026-02-01');`, 'p'),
    ...SALDOS.map((v, i) => pg.psql(`insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance, challenge_parent_id)
    values ('${u(100 + i)}', '${u(1)}', 's', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, ${v}::numeric, '${u(99)}');`, 'p'))]
  ver('los saldos se escriben por SQL tal cual', alta.every(x => x.ok), alta.map(x => x.err).filter(Boolean).join(' ').split('\n')[0])
  for (const [i, v] of SALDOS.entries()) {
    const id = u(100 + i)
    const json = pg.psql(`select to_json(balance)::text from public.sim_sessions where id = '${id}'`, 'p').out
    const texto = pg.psql(`select balance::text from public.sim_sessions where id = '${id}'`, 'p').out
    const numero = String(JSON.parse(json))
    const casa = f => pg.psql(`select count(*) from public.sim_sessions where id = '${id}' and balance = '${f}'`, 'p').out === '1'
    filas.push({ v, json, numero, texto, porNumero: casa(numero), porTexto: casa(texto) })
  }
} finally { pg.cierra() }
for (const f of filas) console.log(`   ${f.v.padEnd(28)} json ${f.json.padEnd(28)} → numero ${f.numero.padEnd(22)} casa=${f.porNumero} · texto ${f.texto.padEnd(28)} casa=${f.porTexto}`)
ver('control: por el numero JS hay saldos que NO casan (el instrumento ve el problema)', filas.some(f => !f.porNumero), filas.filter(f => !f.porNumero).map(f => f.v).join(', '))
oraculo('CAS-texto-exacto', `por el texto de la base (balance::text) casan los ${SALDOS.length} saldos, incluidos los que el numero JS pierde`,
  filas.length === SALDOS.length && filas.every(f => f.porTexto), filas.filter(f => !f.porTexto).map(f => f.v).join(', ') || 'todos')

titulo('2 · el handler usa el texto')
const fuente = readFileSync(path.join(REPO, 'pages/api/challenge/advance.js'), 'utf8')
const lectura = /\.from\('sim_sessions'\)\s*\.select\('\*, balance_texto:balance::text'\)\s*\.eq\('id', session_id\)/.test(fuente)
const filtro = /\.eq\('balance', session\.balance_texto\)/.test(fuente)
const sinFloat = !/\.eq\('balance', session\.balance\)/.test(fuente)
oraculo('CAS-texto-handler', 'advance lee balance_texto:balance::text en la MISMA lectura de la sesion y el WHERE del CAS usa ese texto (no session.balance)',
  lectura && filtro && sinFloat, JSON.stringify({ lectura, filtro, sinFloat }))
fin()
