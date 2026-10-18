/**
 * S16d (DE QUE DEPENDEN, FUERA DE pg_catalog, LOS VALORES POR DEFECTO, RESTRICCIONES E INDICES DE LAS 14 TABLAS, Y SUS
 * COLACIONES) · ENSAYO EN POSTGRESQL 17 LOCAL (etapa 3, ronda 3; orden 1-004; RINV2-01, RINV2-02, RINV2-04).
 *
 *   1 READ ONLY, una sola SELECT, acaba en FIN; la base no cambia; solo catalogo
 *   2 en el montaje limpio: ninguna dependencia fuera de pg_catalog; todas las colaciones, la predeterminada
 *   3 los casos del revisor salen: public.now() en un valor por defecto, public.length() en un CHECK, una colacion
 *     public."por defecto" (no determinista) y un indice de expresion con una funcion de public
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1 } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S16D = lee('sql/consultas/s16d-dependencias-tablas-sim004b.sql')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const m = montajeV1()
try {
  m.arranca()
  let n = 0
  const nueva = () => { const d = m.base(`sd${++n}`); const p = m.comoEjecutor(d, lee('sql/sim-004a-puerta.sql')); if (!p.ok) throw new Error('puerta: ' + p.err); return d }
  const corre = d => m.comoEjecutor(d, `begin read only;\n${S16D}\nrollback;`)

  titulo('1 · solo lectura y solo catalogo')
  const d = nueva()
  const r = corre(d)
  const filas = r.out.split('\n').filter(l => l && !/^(BEGIN|ROLLBACK)$/.test(l))
  oraculo('S16d', 'corre en READ ONLY como el ejecutor y acaba en «FIN|s16d|consulta»', r.ok && filas.at(-1) === 'FIN|s16d|consulta', r.err.slice(0, 200))
  const sin = S16D.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''")
  oraculo('S16d', 'una sola SELECT: sin escrituras, EXECUTE ni set_config; no lee ninguna de las 14 tablas', !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|perform|call|do|set_config)\b/i.test(sin) && (sin.match(/;/g) || []).length === 1 && !/\b(from|join)\s+(public\.)?(sim_|session_|user_)/i.test(sin))

  titulo('2 · el montaje limpio')
  const de = s => filas.filter(l => l.startsWith(`${s}|`))
  oraculo('S16d', 'ninguna dependencia fuera de pg_catalog; todas las columnas con colacion, con la predeterminada', de('ajeno').length === 0 && de('colacion').length > 30 && de('colacion').every(l => l.endsWith('|predeterminada (oid 100)'))
    && /^resumen\|recuentos\|\d+ objetos mirados · 0 dependencias fuera de pg_catalog · \d+ columnas con colacion · 0 no predeterminadas$/m.test(r.out), de('resumen').join(' / ') + ' · ' + de('ajeno').join(' / '))

  titulo('3 · los casos del revisor salen')
  for (const [nombre, extra, re] of [
    ['RINV2-01: public.now() en el valor por defecto de sim_recibos.creado', 'create function public.now() returns timestamptz language sql stable as $$ select null::timestamptz $$; alter table public.sim_recibos alter column creado set default public.now();', /^ajeno\|sim_recibos\.creado \(defecto\)\|function (public\.)?now\(\)$/m],
    ['RINV2-04: public.length() en el CHECK de sim_arrendamientos', "create function public.length(text) returns integer language sql immutable as $$ select 0 $$; alter table public.sim_arrendamientos drop constraint sim_arrendamientos_cliente_id_check, add constraint sim_arrendamientos_cliente_id_check check (public.length(cliente_id) >= 1 and public.length(cliente_id) <= 100) not valid;", /^ajeno\|sim_arrendamientos\.sim_arrendamientos_cliente_id_check \(restriccion\)\|function (public\.)?length\(text\)$/m],
    ['RINV2-02: una colacion public."por defecto" no determinista en sim_recibos.digest', `create collation public."por defecto" (provider = icu, locale = 'und-u-ks-level2', deterministic = false); alter table public.sim_recibos drop constraint sim_recibos_digest_check; alter table public.sim_recibos alter column digest type text collate public."por defecto";`, /^colacion\|sim_recibos\.digest\|public\.por defecto · proveedor=i · determinista=false · locale=/m],
    ['un indice de expresion con una funcion de public', "create function public.f_x(text) returns text language sql immutable as $$ select $1 $$; create index x_expr on public.sim_recibos (public.f_x(tipo));", /^ajeno\|sim_recibos\.x_expr \(indice\)\|function (public\.)?f_x\(text\)$/m],
  ]) {
    const d2 = nueva()
    const mu = m.comoEjecutor(d2, extra)
    const q = corre(d2)
    oraculo('S16d', `${nombre}: sale`, mu.ok && q.ok && re.test(q.out), (mu.err || q.out.split('\n').filter(l => /^(ajeno|resumen)\||sim_recibos\.digest/.test(l)).join(' / ')).slice(0, 300))
  }
} finally { m.cierra() }
fin()
