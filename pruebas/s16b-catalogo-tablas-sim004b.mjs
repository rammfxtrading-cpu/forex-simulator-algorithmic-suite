/**
 * S16b (EL CATALOGO DE LAS 14 TABLAS FUERA DE pg_proc, Y LAS TRES FUNCIONES AJENAS) · ENSAYO EN POSTGRESQL 17 LOCAL
 * (etapa 3, ronda 3; CTO 17-oct, R3E3B-01 y R3E3B-02).
 *
 * Sobre el montaje de produccion (montaje-v1: sim-003 y la preparatoria) con la puerta:
 *   1 READ ONLY, una sola SELECT, acaba en FIN; la base no cambia; solo catalogo (no lee ninguna de las 14 tablas)
 *   2 cada seccion: las 14 tablas, sus columnas, restricciones, indices, ninguna regla, las politicas de las 3 no
 *     protegidas, las tres funciones con su ficha, y los recuentos
 *   3 lo que tiene que ensenar: los cuatro escenarios del revisor (una regla, un valor por defecto, una tabla hija,
 *     un CHECK y un indice unico de mas) salen, cada uno en su seccion
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1 } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S16B = lee('sql/consultas/s16b-catalogo-tablas-sim004b.sql')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const m = montajeV1()
try {
  m.arranca()
  let n = 0
  const nueva = () => { const d = m.base(`sb${++n}`); const p = m.comoEjecutor(d, lee('sql/sim-004a-puerta.sql')); if (!p.ok) throw new Error('puerta: ' + p.err); return d }
  const corre = d => m.comoEjecutor(d, `begin read only;\n${S16B}\nrollback;`)
  const foto = d => m.uno(d, `select md5(string_agg(x, ',' order by x)) from (select c.relname || ':' || c.reltuples || ':' || coalesce((select count(*) from pg_attrdef a where a.adrelid = c.oid), 0) x from pg_class c where c.relnamespace = 'public'::regnamespace) s`)

  titulo('1 · solo lectura y solo catalogo')
  const d = nueva()
  const a = foto(d)
  const r = corre(d)
  const filas = r.out.split('\n').filter(l => l && !/^(BEGIN|ROLLBACK)$/.test(l))
  oraculo('S16b', 'corre en READ ONLY como el ejecutor y acaba en «FIN|s16b|consulta»; la base no cambia', r.ok && filas.at(-1) === 'FIN|s16b|consulta' && foto(d) === a, r.err.slice(0, 200))
  const sin = S16B.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''")
  oraculo('S16b', 'una sola SELECT: sin escrituras, EXECUTE ni set_config (fuera comentarios)', !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|perform|call|do|set_config)\b/i.test(sin) && (sin.match(/;/g) || []).length === 1)
  oraculo('S16b', 'solo catalogo: no lee ninguna de las 14 tablas (ningun FROM/JOIN a public.<tabla>, solo a pg_catalog)', !/\b(from|join)\s+(public\.)?(sim_|session_|user_)/i.test(sin))

  titulo('2 · las secciones')
  const de = s => filas.filter(l => l.startsWith(`${s}|`))
  oraculo('S16b', 'las 14 tablas, todas relkind=r, sin particiones, hijas ni padres', de('tabla').length === 14 && de('tabla').every(l => /relkind=r · persistencia=p · particion=false · hijas=0 · padres=- · particionada=false$/.test(l)), de('tabla').join(' / ').slice(0, 300))
  oraculo('S16b', 'columnas, restricciones e indices de las 14, ninguna regla, y las tres funciones con su ficha', de('columna').length > 60 && de('restriccion').length > 25 && de('indice').length > 10 && de('regla').length === 0
    && de('funcion').length === 3 && de('funcion').every(l => /functiondef md5=[0-9a-f]{32} · prosrc md5=[0-9a-f]{32} · probin=.* · lenguaje=\w+ · dueño=\w+ · prosecdef=(true|false) · provolatile=[ivs] · proconfig=.* · proisstrict=(true|false) · proleakproof=(true|false) · proparallel=[usr] · prokind=f · proretset=false · prorettype=\w+ · proargmodes=.* · proargnames=.* · pronargdefaults=\d+ · procost=[\d.]+ · prorows=0$/.test(l)),
    `${de('columna').length} columnas · ${de('restriccion').length} restricciones · ${de('indice').length} indices · ${de('regla').length} reglas · ${de('funcion').map(l => l.slice(0, 80)).join(' / ')}`)
  oraculo('S16b', 'los recuentos y el search_path de la sesion', /^resumen\|recuentos\|14 tablas · \d+ columnas · \d+ valores por defecto · \d+ restricciones · \d+ indices · 0 reglas · 0 herencias$/m.test(r.out) && /^resumen\|search_path\|/m.test(r.out), de('resumen').join(' / '))
  ver('control: los textos van sin el prefijo «public.»', !/\bpublic\./.test(filas.filter(l => !l.startsWith('resumen|search_path')).join('\n')), filas.filter(l => /\bpublic\./.test(l)).slice(0, 3).join(' / '))

  titulo('3 · los escenarios del revisor salen, cada uno en su seccion')
  for (const [nombre, extra, re] of [
    ['una regla do instead nothing en sim_recibos', 'create rule r_nada as on insert to public.sim_recibos do instead nothing;', /^regla\|sim_recibos\.r_nada\|CREATE RULE r_nada AS/m],
    ['un valor por defecto en sim_sessions.terminal', "alter table public.sim_sessions alter column terminal set default 'revocada';", /^columna\|sim_sessions\.terminal\|.* · defecto='revocada'::text$/m],
    ['una tabla hija de sim_recibos', 'create table public.x_hija () inherits (public.sim_recibos);', /^tabla\|sim_recibos\|.* · hijas=1 · /m],
    ['un CHECK de mas en sim_recibos (NOT VALID)', "alter table public.sim_recibos add constraint r_check check (tipo <> 'crear') not valid;", /^restriccion\|sim_recibos\.r_check\|c · CHECK .* · validada=false · /m],
    ['un indice unico de mas en sim_recibos', 'create unique index r_unico on public.sim_recibos (session_id);', /^indice\|sim_recibos\.r_unico\|CREATE UNIQUE INDEX r_unico ON sim_recibos /m],
  ]) {
    const d2 = nueva()
    const mu = m.pg.psql(extra, d2)
    const q = corre(d2)
    oraculo('S16b', `${nombre}: sale en su seccion`, mu.ok && q.ok && re.test(q.out), (mu.err || q.out.split('\n').filter(l => /r_nada|terminal|sim_recibos\||r_check|r_unico/.test(l)).join(' / ')).slice(0, 300))
  }
} finally { m.cierra() }
fin()
