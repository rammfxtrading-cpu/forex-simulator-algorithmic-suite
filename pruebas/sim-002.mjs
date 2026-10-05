/**
 * sim-002 · LECTURA ESTABLE DE LOS TRADES, ENSAYADA EN POSTGRESQL 17 LOCAL
 *
 * Bloque E, punto 3 (CTO, 5-oct-2026; Astra BD-04). Esquema INVENTADO de la s04
 * (pruebas/estado-s04.mjs) y, como en Supabase, privilegios por defecto que
 * conceden EXECUTE sobre funciones nuevas a anon, authenticated y service_role.
 *
 *   1. se aplica entero y acaba en FIN | sim-002 aplicada; segunda vez, igual
 *   2. permisos: anon y un rol cualquiera (PUBLIC) no ejecutan; authenticated
 *      y service_role si; SECURITY INVOKER, STABLE, search_path vacio
 *   3. RLS: A recibe sus trades; pedir la sesion o el usuario de B da []
 *   4. BD-04, el caso de Astra con UPDATE alterno: cuatro trades que alternan
 *      entre [100, 200, −300, −400] y [−1100, 200, 300, 200] (los dos suman
 *      −400). Paginando (dos sentencias con el cambio en medio) sale +800;
 *      la funcion, una sentencia, da −400 en cualquier momento
 *   5. atomico: si una comprobacion falla despues de crear las funciones
      (anon hereda EXECUTE), revienta con «sim-002:» y no queda ninguna
 * ⚠️ No prueba el editor de Supabase.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { A, B, S1, S2, ESTADO, DATOS } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const SQL = readFileSync(path.join(REPO, 'sql/sim-002-lectura-estable.sql'), 'utf8')
const pg = cluster()
const DEFECTO = 'alter default privileges in schema public grant all on functions to anon, authenticated, service_role;'
const nueva = (nombre, extra = '') => {
  const c = pg.psql(`create database ${nombre}`, 'postgres')
  const r = pg.psql(ESTADO + DATOS + DEFECTO + extra, nombre)
  if (!c.ok || !r.ok) throw new Error('montaje ' + nombre + ': ' + (c.err || r.err))
}
const filas = r => r.out.split('\n')
const uno = (q, db) => pg.psql(q, db).out
const n = txt => { try { return JSON.parse(txt).length } catch { return txt } }

try {
  pg.arranca()

  titulo('1 · aplicar y repetir')
  nueva('base')
  const r1 = pg.psql(SQL, 'base')
  ver('se aplica entero y acaba en FIN | sim-002 aplicada', r1.ok && filas(r1).at(-1) === 'FIN|sim-002 aplicada', r1.err.split('\n')[0] || filas(r1).at(-1))
  ver('informe: las dos funciones, SECURITY INVOKER, STABLE, search_path vacio', filas(r1).filter(l => /^funcion\|public\.sim_trades_de_(sesion|usuario)\(p_(session|user)_id uuid\) · devuelve jsonb · security_definer=false · volatil=s · config=search_path=""$/.test(l)).length === 2, filas(r1).filter(l => l.startsWith('funcion')).join(' / '))
  ver('informe: EXECUTE anon=false, authenticated=true, service_role=true, PUBLIC=false (x2)', ['anon=false', 'authenticated=true', 'service_role=true', 'PUBLIC=false'].every(x => filas(r1).filter(l => l.startsWith('execute|') && l.endsWith(x)).length === 2), filas(r1).filter(l => l.startsWith('execute')).join(' / '))
  const r1b = pg.psql(SQL, 'base')
  ver('segunda ejecucion: sin error, el mismo informe', r1b.ok && r1b.out === r1.out, r1b.err.split('\n')[0])

  titulo('2 · quien puede ejecutar')
  pg.psql('create role cualquiera nologin; grant usage on schema public to cualquiera;', 'base')
  ver('anon: denegado', pg.como('anon', A, `select public.sim_trades_de_sesion('${S1}');`, 'base') === 'DENEGADO')
  ver('un rol cualquiera (solo PUBLIC): denegado', pg.como('cualquiera', A, `select public.sim_trades_de_sesion('${S1}');`, 'base') === 'DENEGADO')
  ver('service_role: ve los trades de las dos sesiones', n(pg.como('service_role', A, `select public.sim_trades_de_sesion('${S1}');`, 'base')) === 1 && n(pg.como('service_role', A, `select public.sim_trades_de_usuario('${B}');`, 'base')) === 1)

  titulo('3 · RLS (SECURITY INVOKER)')
  ver('A: su sesion y su usuario → su trade', n(pg.como('authenticated', A, `select public.sim_trades_de_sesion('${S1}');`, 'base')) === 1 && n(pg.como('authenticated', A, `select public.sim_trades_de_usuario('${A}');`, 'base')) === 1)
  ver('A pidiendo la sesion o el usuario de B → [] (ni error ni datos)', pg.como('authenticated', A, `select public.sim_trades_de_sesion('${S2}');`, 'base') === '[]' && pg.como('authenticated', A, `select public.sim_trades_de_usuario('${B}');`, 'base') === '[]')

  titulo('4 · BD-04: el caso de Astra con UPDATE alterno')
  const ids = ['b', 'c', 'd', 'e'].map((l, i) => `2000000${i}-0000-0000-0000-00000000000${l}`)
  const estado = pnls => `begin; ${pnls.map((p, i) => `update sim_trades set pnl = ${p} where id = '${ids[i]}';`).join(' ')} commit;`
  const E1 = [100, 200, -300, -400], E2 = [-1100, 200, 300, 200]
  pg.psql(`delete from sim_trades where session_id = '${S1}'; insert into sim_trades (id, user_id, session_id, pnl, closed_at) values ${ids.map(id => `('${id}', '${A}', '${S1}', 0, now())`).join(', ')};`, 'base')
  pg.psql(estado(E1), 'base')
  const pagina = off => uno(`select coalesce(sum(pnl), 0) from (select pnl from sim_trades where session_id = '${S1}' order by id limit 2 offset ${off}) p;`, 'base')
  const p1 = Number(pagina(0)); pg.psql(estado(E2), 'base'); const p2 = Number(pagina(2))
  ver('control: paginando con el cambio entre paginas sale +800 (el hazard existe en PostgreSQL)', p1 + p2 === 800, `${p1} + ${p2}`)
  const sumaFn = () => JSON.parse(uno(`select public.sim_trades_de_sesion('${S1}');`, 'base')).reduce((a, t) => a + Number(t.pnl), 0)
  const vistas = []
  for (let i = 0; i < 6; i++) { pg.psql(estado(i % 2 ? E2 : E1), 'base'); vistas.push(sumaFn()) }
  ver('la funcion (una sentencia) da −400 en cualquier estado: nunca un conjunto mezclado', vistas.every(v => v === -400), vistas.join(', '))

  titulo('5 · atomico: una comprobacion que falla DESPUES de crear las funciones')
  // anon miembro de authenticated hereda su EXECUTE: la comprobacion revienta
  // despues de crear las funciones; todo el DO se deshace
  nueva('heredado', 'grant authenticated to anon;')
  const r5 = pg.psql(SQL, 'heredado')
  ver('revienta con «sim-002: anon puede ejecutar…»', !r5.ok && /sim-002: anon puede ejecutar/.test(r5.err), r5.err.split('\n')[0])
  ver('y no queda ninguna funcion creada', uno(`select count(*) from pg_proc where proname like 'sim_trades_de_%';`, 'heredado') === '0')
} finally {
  pg.cierra()
}
fin()
