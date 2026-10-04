/**
 * sim-001b · PERMISOS E INTEGRIDAD BORRANDO ANTES LAS HUERFANAS, ENSAYADO
 *
 * sim-001 fallo en produccion (4-oct) con su precondicion: «session_chart_config
 * tiene 2 fila(s) huerfana(s)». Decision del CTO: se eliminan. sim-001b es
 * sim-001 mas ese borrado, en el mismo DO, con salvaguarda de 10.
 * PostgreSQL 17 desechable con el estado INVENTADO de la s04
 * (pruebas/estado-s04.mjs, el mismo que el ensayo de sim-001).
 *
 *   1. 0 huerfanas: aplica; borradas 0; FIN | sim-001b aplicada
 *   2. 2 huerfanas (y una fila con session_id nulo): aplica; borra las 2 y SOLO
 *      esas (las configs de sesiones vivas y la de session_id nulo siguen);
 *      FK, indices, NOT NULL y permisos como sim-001; segunda ejecucion: borra 0
 *   3. 10 huerfanas (el limite): aplica y borra 10
 *   4. 11 huerfanas: revienta con «sim-001b:» y NO aplica ni borra nada
 *   5. un grant a PUBLIC con 2 huerfanas: revienta y NO borra nada (atomico)
 * ⚠️ No prueba el editor de Supabase (ni si ejecuta las dos ordenes en la misma
 *    conexion: por eso el informe tambien dice cuantas QUEDAN).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { A, B, SIETE, ESTADO, DATOS } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const SQL = readFileSync(path.join(REPO, 'sql/sim-001b-permisos-e-integridad.sql'), 'utf8')
const pg = cluster()
const huerfanas = n => n ? `insert into session_chart_config (user_id, session_id, config) select '${A}', gen_random_uuid(), '{}' from generate_series(1, ${n});` : ''
const NULA = `insert into session_chart_config (user_id, session_id, config) values ('${B}', null, '{"nula":true}');`
const nueva = (nombre, extra = '') => {
  const c = pg.psql(`create database ${nombre}`, 'postgres')
  const r = pg.psql(ESTADO + DATOS + extra, nombre)
  if (!c.ok || !r.ok) throw new Error('montaje ' + nombre + ': ' + (c.err || r.err))
}
const filas = r => r.out.split('\n')
const uno = (q, db) => pg.psql(q, db).out
const anonLee = db => pg.como('anon', A, 'select count(*) from sim_trades;', db)
const sinIndices = db => uno(`select count(*) from pg_indexes where indexname like 'sim_%_idx';`, db) === '0'

try {
  pg.arranca()

  titulo('1 · 0 huerfanas')
  nueva('cero')
  const r1 = pg.psql(SQL, 'cero')
  ver('se aplica entero', r1.ok, r1.err.split('\n')[0])
  ver('informe: borradas 0, quedan 0', filas(r1).includes('huerfanas|borradas por este bloque: 0') && filas(r1).includes('huerfanas|que quedan (session_id que no existe en sim_sessions): 0'), filas(r1).filter(l => l.startsWith('huerfanas')).join(' / '))
  ver('acaba en FIN | sim-001b aplicada', filas(r1).at(-1) === 'FIN|sim-001b aplicada', filas(r1).at(-1))

  titulo('2 · 2 huerfanas y una fila con session_id nulo')
  nueva('dos', huerfanas(2) + NULA)
  ver('control: 5 filas en session_chart_config (2 vivas, 2 huerfanas, 1 nula)', uno('select count(*) from session_chart_config;', 'dos') === '5')
  const r2 = pg.psql(SQL, 'dos')
  ver('se aplica entero', r2.ok && filas(r2).at(-1) === 'FIN|sim-001b aplicada', r2.err.split('\n')[0])
  ver('informe: borradas 2, quedan 0, 1 nula sin tocar', filas(r2).includes('huerfanas|borradas por este bloque: 2') && filas(r2).includes('huerfanas|que quedan (session_id que no existe en sim_sessions): 0')
    && filas(r2).includes('huerfanas|filas con session_id nulo (no son huerfanas, no se tocan): 1'), filas(r2).filter(l => l.startsWith('huerfanas')).join(' / '))
  ver('borro SOLO las 2: siguen las 2 de sesiones vivas y la nula', uno('select count(*) from session_chart_config;', 'dos') === '3'
    && uno(`select count(*) from session_chart_config where config->>'nula' = 'true';`, 'dos') === '1')
  ver('anon fuera de las 7 tablas', SIETE.every(t => pg.como('anon', A, `select count(*) from ${t};`, 'dos') === 'DENEGADO'))
  ver('authenticated: TRUNCATE denegado y lee lo suyo', pg.como('authenticated', A, 'truncate session_chart_config cascade;', 'dos') === 'DENEGADO' && pg.como('authenticated', A, 'select count(*) from sim_trades;', 'dos') === '1')
  ver('la FK con CASCADE, validada', filas(r2).includes('fk|session_chart_config · session_chart_config_session_id_fkey · FOREIGN KEY (session_id) REFERENCES sim_sessions(id) ON DELETE CASCADE · validada=true'))
  ver('los tres indices y los cuatro NOT NULL', filas(r2).filter(l => l.startsWith('indice|') && l.endsWith('valido=true')).length === 3 && filas(r2).filter(l => /^not null\|.*not_null=true · nulos=0$/.test(l)).length === 4)
  const r2b = pg.psql(SQL, 'dos')
  ver('segunda ejecucion: sin error, borra 0, quedan 0', r2b.ok && filas(r2b).includes('huerfanas|borradas por este bloque: 0') && filas(r2b).includes('huerfanas|que quedan (session_id que no existe en sim_sessions): 0') && filas(r2b).at(-1) === 'FIN|sim-001b aplicada', r2b.err.split('\n')[0])
  ver('y la tabla sigue con sus 3 filas', uno('select count(*) from session_chart_config;', 'dos') === '3')

  titulo('3 · 10 huerfanas (el limite)')
  nueva('diez', huerfanas(10))
  const r3 = pg.psql(SQL, 'diez')
  ver('se aplica y borra 10', r3.ok && filas(r3).includes('huerfanas|borradas por este bloque: 10'), r3.err.split('\n')[0])

  titulo('4 · 11 huerfanas')
  nueva('once', huerfanas(11))
  const r4 = pg.psql(SQL, 'once')
  ver('revienta con «sim-001b:» y dice cuantas', !r4.ok && /sim-001b: session_chart_config tiene 11 fila\(s\) huerfana\(s\), mas de 10/.test(r4.err), r4.err.split('\n')[0])
  ver('y NO aplica ni borra nada: las 13 filas siguen, anon lee, sin indices', uno('select count(*) from session_chart_config;', 'once') === '13' && anonLee('once') === '0' && sinIndices('once'))

  titulo('5 · un grant a PUBLIC con 2 huerfanas')
  nueva('publico', huerfanas(2) + 'grant select on public.sim_trades to public;')
  const r5 = pg.psql(SQL, 'publico')
  ver('revienta: anon conserva SELECT sobre sim_trades (¿grant a PUBLIC?)', !r5.ok && /sim-001b: anon conserva SELECT sobre sim_trades/.test(r5.err), r5.err.split('\n')[0])
  ver('y NO borra las huerfanas (todo o nada)', uno('select count(*) from session_chart_config;', 'publico') === '4' && sinIndices('publico'))
} catch (e) {
  ver('el ensayo arranco', false, e.message)
} finally {
  pg.cierra()
}
fin()
