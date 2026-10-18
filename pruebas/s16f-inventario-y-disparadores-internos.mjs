/**
 * S16f (EL INVENTARIO DE LAS 14 TABLAS DE LA RONDA 4 Y LOS DISPARADORES INTERNOS DE SUS FK) · ENSAYO EN POSTGRESQL 17 LOCAL
 * (etapa 3, ronda 4; orden 1-009; Astra E3R3-01..04). Como la s16e, y ademas las filas de los disparadores internos.
 *
 *   1 un solo bloque DO: sin escrituras ni EXECUTE; solo cambia el search_path con set_config local; lleva dos veces,
 *     byte a byte, el bloque «inventario» de sim-004b y la s16
 *   2 en el montaje limpio, en READ ONLY: el informe (como error) con el search_path del editor y con el vacio, las
 *     10 familias y las 3 funciones ajenas de cada uno, y acaba en «FIN | s16f | consulta»; sus recuentos y md5 son
 *     los que esperan sim-004b ({}) y la s16 ({public,extensions}); y las filas de los disparadores internos son, una a
 *     una, las que espera sim-004b (4.5), tambien las de profiles y auth.users
 *   3 mide los textos tal cual: un literal 'public.…' en un valor por defecto cambia el md5 de «columna» con los dos
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, FICHA_UID_MONTAJE, FICHA_UID_PRODUCCION } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S16F0 = lee('sql/consultas/s16f-inventario-y-disparadores-internos.sql'), S4B = lee('sql/sim-004b-contrato-v1.sql'), S16 = lee('sql/consultas/s16-catalogo-sim004b.sql')
const familias = ['ajeno', 'columna', 'identidad', 'indice', 'permiso', 'politica', 'regla', 'restriccion', 'sobrecarga', 'tabla']

titulo('1 · solo lectura y el mismo bloque')
const sin = S16F0.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''").replace(/\$s16f\$/g, '')
oraculo('S16f', 'un solo bloque DO: sin escrituras ni EXECUTE; el unico set_config es el del search_path', !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|call|copy)\b/i.test(sin) && (S16F0.match(/^do \$s16f\$$/gm) || []).length === 1 && (S16F0.match(/set_config\(/g) || []).length === 3 && (S16F0.match(/set_config\('search_path', /g) || []).length === 3)
const blk = t => { const a = t.indexOf('-- >>> inventario'), b = t.indexOf('-- <<< inventario'); return a >= 0 && b > a ? t.slice(a, b) : null }
const dos = S16F0.split('-- >>> inventario').length - 1
oraculo('S16f', 'lleva dos veces el bloque «inventario», byte a byte el de sim-004b y la s16', dos === 2 && blk(S16F0) === blk(S4B) && blk(S16F0.slice(S16F0.lastIndexOf('-- >>> inventario'))) === blk(S4B) && blk(S4B) === blk(S16))

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
// la unica adaptacion del montaje (montaje-v1.mjs, conUidDelMontaje): la ficha de auth.uid(), aqui en las dos copias del bloque
const S16F = S16F0.split(`('auth.uid()', '${FICHA_UID_PRODUCCION}')`).join(`('auth.uid()', '${FICHA_UID_MONTAJE}')`)
ver('control: la unica adaptacion del montaje (la ficha de auth.uid()) toca exactamente las dos copias del bloque', S16F0.split(`('auth.uid()', '${FICHA_UID_PRODUCCION}')`).length === 3 && !S16F.includes(FICHA_UID_PRODUCCION))
const esperado = Object.fromEntries([...S4B.matchAll(/\('(\{[a-z,]*\})', '([a-z_]+)', (\d+), '([0-9a-f]{32})'\)/g)].map(x => [`${x[1]}|${x[2]}`, `n=${x[3]} md5=${x[4]}`]))
const m = montajeV1()
try {
  m.arranca()
  let n = 0
  const nueva = () => { const d = m.base(`se${++n}`); const p = m.comoEjecutor(d, lee('sql/sim-004a-puerta.sql')); if (!p.ok) throw new Error('puerta: ' + p.err); return d }
  const corre = d => m.comoEjecutor(d, `begin read only;\n${S16F}\nrollback;`)
  const informe = r => r.err.split('\n').filter(l => /^(s16f \||FIN \|)/.test(l.replace(/^(ERROR|psql:[^ ]+ ERROR):\s+/, '').trim())).map(l => l.replace(/^.*?(s16f \||FIN \|)/, '$1'))
  const de = (ls, esq) => Object.fromEntries(ls.filter(l => l.startsWith(`s16f | ${esq} | inventario | `)).map(l => { const [, , , f, d] = l.split(' | '); return [f, d] }))

  titulo('2 · el montaje limpio')
  const d = nueva()
  const r = corre(d)
  const ls = informe(r)
  ver('control: el montaje no cambia (READ ONLY; el informe sale como error)', !r.ok && /informe s16f \(no es un fallo\)/.test(r.err), r.err.slice(0, 200))
  oraculo('S16f', 'el search_path del editor, las 10 familias y las 3 funciones ajenas con cada uno, y acaba en «FIN | s16f | consulta»', ls[0] === 's16f | search_path | "$user", public, extensions' && familias.every(f => de(ls, '{public,extensions}')[f] && de(ls, '{}')[f]) && ls.filter(l => / \| funcion_ajena \| /.test(l)).length === 6 && ls.at(-1) === 'FIN | s16f | consulta', ls.slice(0, 3).join(' / '))
  const ed = de(ls, '{public,extensions}'), va = de(ls, '{}')
  // RE3-01: los dos ajustes, efectivos y sin fijar, solo por nombre
  const aj = ls.filter(l => l.startsWith('s16f | ajuste | '))
  oraculo('S16f', 'los ajustes de RE3-01: session_replication_role y row_security, efectivos y fijados en ninguna parte (solo por nombre)', aj.length === 2 && aj.every(l => /: efectivo (origin|on)=true · fijado en pg_db_role_setting: ninguno$/.test(l)), aj.join(' / '))
  const trgEsperados = [...S4B.matchAll(/^    '([^']*\|fk:[^']*)',?\)?;?$/gm)].map(x => x[1]).sort()
  const trgMedidos = ls.filter(l => l.startsWith('s16f | disparador | ')).map(l => l.slice('s16f | disparador | '.length)).sort()
  oraculo('S16f', 'las filas de los disparadores internos son, una a una, las que espera sim-004b (68: 50 en las 14 tablas y 18 en profiles y auth.users)', trgEsperados.length === 68 && trgMedidos.length === 68 && trgEsperados.every((x, i) => x === trgMedidos[i]), `${trgEsperados.length} esperadas · ${trgMedidos.length} medidas · ${trgMedidos.filter(x => !trgEsperados.includes(x)).slice(0, 2).join(' / ')}`)
  oraculo('S16f', 'sus recuentos y md5 son, uno a uno, los que esperan la s16 ({public,extensions}) y sim-004b ({})', Object.keys(esperado).length === 20 && familias.every(f => ed[f] === esperado[`{public,extensions}|${f}`] && va[f] === esperado[`{}|${f}`]), familias.map(f => `${f} ${ed[f]} / ${va[f]}`).join(' · ').slice(0, 600))
  // como en el editor: sin transaccion explicita y siguiendo tras el error del informe, en la MISMA sesion
  const tras = m.comoEjecutor(d, `\\set ON_ERROR_STOP 0\n${S16F}\nselect 'tras|' || pg_catalog.current_schemas(false)::text;`)
  oraculo('S16f', 'y no deja el search_path cambiado: despues, en la misma sesion y sin transaccion, sigue el del editor', /informe s16f/.test(tras.err) && tras.out.trim().split('\n').at(-1) === 'tras|{public,extensions}', tras.out.slice(-120))

  // RINV4-02: con otro search_path de partida, mide igual los dos y dice el de partida
  const r0 = m.comoEjecutor(d, `begin read only;\nset local search_path = '';\n${S16F}\nrollback;`), l0 = informe(r0)
  oraculo('S16f', 'con el search_path vacio de partida: dice el de partida y mide igual los dos (los mismos md5)', l0[0] === 's16f | search_path | ""' && familias.every(f => de(l0, '{public,extensions}')[f] === ed[f] && de(l0, '{}')[f] === va[f]), l0.slice(0, 2).join(' / '))

  titulo('3 · mide los textos tal cual (RINV3-01)')
  const d2 = nueva()
  const mu = m.comoEjecutor(d2, "alter table public.sim_sessions alter column status set default 'public.active';")
  const l2 = informe(corre(d2))
  const e2 = de(l2, '{public,extensions}'), v2 = de(l2, '{}')
  oraculo('S16f', "con 'public.active' en el valor por defecto de sim_sessions.status, el md5 de «columna» cambia con los dos search_path (y lo dice)", mu.ok && /^n=135 md5=[0-9a-f]{32} \(sim-004b espera /.test(e2.columna || '') && /^n=135 md5=[0-9a-f]{32} \(sim-004b espera /.test(v2.columna || '') && e2.indice === esperado['{public,extensions}|indice'], `${e2.columna} / ${v2.columna}`.slice(0, 300))
} finally { m.cierra() }
fin()
