/**
 * S16e (EL INVENTARIO DE LAS 14 TABLAS SIN NORMALIZAR, CON LOS DOS search_path) · ENSAYO EN POSTGRESQL 17 LOCAL
 * (etapa 3, ronda 3; orden 1-008; RINV3-01).
 *
 *   1 un solo bloque DO: sin escrituras ni EXECUTE; solo cambia el search_path con set_config local; lleva dos veces,
 *     byte a byte, el bloque «inventario» de sim-004b y la s16
 *   2 en el montaje limpio, en READ ONLY: el informe (como error) con el search_path del editor y con el vacio, las
 *     8 familias y las 3 funciones ajenas de cada uno, y acaba en «FIN | s16e | consulta»; sus recuentos y md5 son
 *     los que esperan sim-004b ({}) y la s16 ({public,extensions})
 *   3 mide los textos tal cual: un literal 'public.…' en un valor por defecto cambia el md5 de «columna» con los dos
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, FICHA_UID_MONTAJE, FICHA_UID_PRODUCCION } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S16E0 = lee('sql/consultas/s16e-inventario-sin-normalizar.sql'), S4B = lee('sql/sim-004b-contrato-v1.sql'), S16 = lee('sql/consultas/s16-catalogo-sim004b.sql')
const familias = ['ajeno', 'columna', 'identidad', 'indice', 'politica', 'regla', 'restriccion', 'tabla']

titulo('1 · solo lectura y el mismo bloque')
const sin = S16E0.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''").replace(/\$s16e\$/g, '')
oraculo('S16e', 'un solo bloque DO: sin escrituras ni EXECUTE; el unico set_config es el del search_path', !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|call|copy)\b/i.test(sin) && (S16E0.match(/^do \$s16e\$$/gm) || []).length === 1 && (S16E0.match(/set_config\(/g) || []).length === 2 && (S16E0.match(/set_config\('search_path', /g) || []).length === 2)
const blk = t => { const a = t.indexOf('-- >>> inventario'), b = t.indexOf('-- <<< inventario'); return a >= 0 && b > a ? t.slice(a, b) : null }
const dos = S16E0.split('-- >>> inventario').length - 1
oraculo('S16e', 'lleva dos veces el bloque «inventario», byte a byte el de sim-004b y la s16', dos === 2 && blk(S16E0) === blk(S4B) && blk(S16E0.slice(S16E0.lastIndexOf('-- >>> inventario'))) === blk(S4B) && blk(S4B) === blk(S16))

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
// la unica adaptacion del montaje (montaje-v1.mjs, conUidDelMontaje): la ficha de auth.uid(), aqui en las dos copias del bloque
const S16E = S16E0.split(`('auth.uid()', '${FICHA_UID_PRODUCCION}')`).join(`('auth.uid()', '${FICHA_UID_MONTAJE}')`)
ver('control: la unica adaptacion del montaje (la ficha de auth.uid()) toca exactamente las dos copias del bloque', S16E0.split(`('auth.uid()', '${FICHA_UID_PRODUCCION}')`).length === 3 && !S16E.includes(FICHA_UID_PRODUCCION))
const esperado = Object.fromEntries([...S4B.matchAll(/\('(\{[a-z,]*\})', '([a-z_]+)', (\d+), '([0-9a-f]{32})'\)/g)].map(x => [`${x[1]}|${x[2]}`, `n=${x[3]} md5=${x[4]}`]))
const m = montajeV1()
try {
  m.arranca()
  let n = 0
  const nueva = () => { const d = m.base(`se${++n}`); const p = m.comoEjecutor(d, lee('sql/sim-004a-puerta.sql')); if (!p.ok) throw new Error('puerta: ' + p.err); return d }
  const corre = d => m.comoEjecutor(d, `begin read only;\n${S16E}\nrollback;`)
  const informe = r => r.err.split('\n').filter(l => /^(s16e \||FIN \|)/.test(l.replace(/^(ERROR|psql:[^ ]+ ERROR):\s+/, '').trim())).map(l => l.replace(/^.*?(s16e \||FIN \|)/, '$1'))
  const de = (ls, esq) => Object.fromEntries(ls.filter(l => l.startsWith(`s16e | ${esq} | inventario | `)).map(l => { const [, , , f, d] = l.split(' | '); return [f, d] }))

  titulo('2 · el montaje limpio')
  const d = nueva()
  const r = corre(d)
  const ls = informe(r)
  ver('control: el montaje no cambia (READ ONLY; el informe sale como error)', !r.ok && /informe s16e \(no es un fallo\)/.test(r.err), r.err.slice(0, 200))
  oraculo('S16e', 'el search_path del editor, las 8 familias y las 3 funciones ajenas con cada uno, y acaba en «FIN | s16e | consulta»', ls[0] === 's16e | search_path | "$user", public, extensions' && familias.every(f => de(ls, '{public,extensions}')[f] && de(ls, '{}')[f]) && ls.filter(l => / \| funcion_ajena \| /.test(l)).length === 6 && ls.at(-1) === 'FIN | s16e | consulta', ls.slice(0, 3).join(' / '))
  const ed = de(ls, '{public,extensions}'), va = de(ls, '{}')
  oraculo('S16e', 'sus recuentos y md5 son, uno a uno, los que esperan la s16 ({public,extensions}) y sim-004b ({})', Object.keys(esperado).length === 16 && familias.every(f => ed[f] === esperado[`{public,extensions}|${f}`] && va[f] === esperado[`{}|${f}`]), familias.map(f => `${f} ${ed[f]} / ${va[f]}`).join(' · ').slice(0, 600))
  // como en el editor: sin transaccion explicita y siguiendo tras el error del informe, en la MISMA sesion
  const tras = m.comoEjecutor(d, `\\set ON_ERROR_STOP 0\n${S16E}\nselect 'tras|' || pg_catalog.current_schemas(false)::text;`)
  oraculo('S16e', 'y no deja el search_path cambiado: despues, en la misma sesion y sin transaccion, sigue el del editor', /informe s16e/.test(tras.err) && tras.out.trim().split('\n').at(-1) === 'tras|{public,extensions}', tras.out.slice(-120))

  titulo('3 · mide los textos tal cual (RINV3-01)')
  const d2 = nueva()
  const mu = m.comoEjecutor(d2, "alter table public.sim_sessions alter column status set default 'public.active';")
  const l2 = informe(corre(d2))
  const e2 = de(l2, '{public,extensions}'), v2 = de(l2, '{}')
  oraculo('S16e', "con 'public.active' en el valor por defecto de sim_sessions.status, el md5 de «columna» cambia con los dos search_path (y lo dice)", mu.ok && /^n=135 md5=[0-9a-f]{32} \(sim-004b espera /.test(e2.columna || '') && /^n=135 md5=[0-9a-f]{32} \(sim-004b espera /.test(v2.columna || '') && e2.indice === esperado['{public,extensions}|indice'], `${e2.columna} / ${v2.columna}`.slice(0, 300))
} finally { m.cierra() }
fin()
