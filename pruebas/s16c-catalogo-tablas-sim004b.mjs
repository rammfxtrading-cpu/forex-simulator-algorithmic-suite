/**
 * S16c (LA S16b CON EL DUEÑO, LA RLS DE LAS 3 NO PROTEGIDAS, EL ESQUEMA DEL TIPO Y LAS SECUENCIAS IDENTITY) · ENSAYO EN
 * POSTGRESQL 17 LOCAL (etapa 3, ronda 3; CTO 17-oct; revisor interno de 679d363, RINV-01..04).
 *
 *   1 READ ONLY, una sola SELECT, acaba en FIN; la base no cambia; solo catalogo
 *   2 las secciones nuevas: dueño en cada tabla, rls/forzada en las 3 no protegidas, tipo_esquema en cada columna, una
 *     fila «identidad» por cada columna identity con su secuencia
 *   3 los casos del revisor salen, cada uno en su seccion: el dueño cambiado, un dominio public.text, una identity con
 *     MAXVALUE 2, y la RLS apagada en una no protegida
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1 } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S16C = lee('sql/consultas/s16c-catalogo-tablas-sim004b.sql')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const m = montajeV1()
try {
  m.arranca()
  let n = 0
  const nueva = () => { const d = m.base(`sc${++n}`); const p = m.comoEjecutor(d, lee('sql/sim-004a-puerta.sql')); if (!p.ok) throw new Error('puerta: ' + p.err); return d }
  const corre = d => m.comoEjecutor(d, `begin read only;\n${S16C}\nrollback;`)
  const foto = d => m.uno(d, `select md5(string_agg(x, ',' order by x)) from (select c.relname || ':' || c.relowner || ':' || c.relrowsecurity x from pg_class c where c.relnamespace = 'public'::regnamespace) s`)

  titulo('1 · solo lectura y solo catalogo')
  const d = nueva()
  const a = foto(d)
  const r = corre(d)
  const filas = r.out.split('\n').filter(l => l && !/^(BEGIN|ROLLBACK)$/.test(l))
  oraculo('S16c', 'corre en READ ONLY como el ejecutor y acaba en «FIN|s16c|consulta»; la base no cambia', r.ok && filas.at(-1) === 'FIN|s16c|consulta' && foto(d) === a, r.err.slice(0, 200))
  const sin = S16C.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''")
  oraculo('S16c', 'una sola SELECT: sin escrituras, EXECUTE ni set_config (fuera comentarios)', !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|perform|call|do|set_config)\b/i.test(sin) && (sin.match(/;/g) || []).length === 1)
  oraculo('S16c', 'solo catalogo: no lee ninguna de las 14 tablas', !/\b(from|join)\s+(public\.)?(sim_|session_|user_)/i.test(sin))

  titulo('2 · las secciones nuevas')
  const de = s => filas.filter(l => l.startsWith(`${s}|`))
  oraculo('S16c', 'cada tabla con su dueño; las 3 no protegidas, ademas, con rls y forzada', de('tabla').length === 14 && de('tabla').every(l => / · dueño=\S+/.test(l)) && de('tabla').filter(l => / · rls=(true|false) · forzada=(true|false)$/.test(l)).length === 3, de('tabla').join(' / ').slice(0, 300))
  oraculo('S16c', 'cada columna con tipo_esquema; las identity, con su fila «identidad» (tipo, inicio, incremento, minimo, maximo, cache, ciclo, dueño)', de('columna').length > 60 && de('columna').every(l => / · tipo_esquema=\w+ · notnull=/.test(l))
    && de('identidad').length === de('columna').filter(l => !/ · identity=- /.test(l)).length && de('identidad').length >= 2
    && de('identidad').every(l => /\|tipo=\w+ · inicio=-?\d+ · incremento=-?\d+ · minimo=-?\d+ · maximo=-?\d+ · cache=\d+ · ciclo=(true|false) · dueño=\S+$/.test(l)), de('identidad').join(' / '))
  oraculo('S16c', 'los recuentos y quien la corre', /^resumen\|recuentos\|14 tablas · \d+ columnas · \d+ identidades · \d+ restricciones · \d+ indices · 0 reglas$/m.test(r.out) && /^resumen\|quien\|\S+ · search_path=/m.test(r.out), de('resumen').join(' / '))

  titulo('3 · los casos del revisor salen, cada uno en su seccion')
  for (const [nombre, extra, su, re] of [
    ['el dueño de sim_sessions cambiado (RINV-01)', 'alter table public.sim_sessions owner to authenticated;', true, /^tabla\|sim_sessions\|.* · dueño=authenticated$/m],
    ['un dominio public.text en sim_sessions.name (RINV-02)', "create domain public.text as pg_catalog.text check (value <> 'inventada'); alter table public.sim_sessions alter column name type public.text;", true, /^columna\|sim_sessions\.name\|tipo=(public\.)?text · tipo_esquema=public · /m],
    ['la identity de sim_recibos.id con MAXVALUE 2 (RINV-03)', 'alter table public.sim_recibos alter column id set maxvalue 2;', false, /^identidad\|sim_recibos\.id\|.* · maximo=2 · /m],
    ['la RLS apagada en user_chart_config (RINV-04)', 'alter table public.user_chart_config disable row level security;', true, /^tabla\|user_chart_config\|.* · rls=false · forzada=false$/m],
  ]) {
    const d2 = nueva()
    const mu = su ? m.pg.psql(extra, d2) : m.comoEjecutor(d2, extra)
    const q = corre(d2)
    oraculo('S16c', `${nombre}: sale en su seccion`, mu.ok && q.ok && re.test(q.out), (mu.err || q.out.split('\n').filter(l => /sim_sessions\||sim_sessions\.name|sim_recibos\.id|user_chart_config\|/.test(l)).join(' / ')).slice(0, 300))
  }
} finally { m.cierra() }
fin()
