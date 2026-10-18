/**
 * S16h (LAS PERTENENCIAS DE anon Y authenticated, Y LOS PRIVILEGIOS DEL DUEÑO DE LAS RPC EN profiles) · ENSAYO EN
 * POSTGRESQL 17 LOCAL (etapa 3, ronda 5; orden 1-013; Astra E3R4-01/02).
 *   1 READ ONLY, una sola SELECT, acaba en FIN; no lee ninguna de las 14 tablas
 *   2 en el montaje limpio: ninguna pertenencia a un rol privilegiado; el dueño con SELECT de las 3 columnas y UPDATE
 *   3 con authenticated → x_paso → service_role (dos saltos, SET sin INHERIT) y sin SELECT en profiles: salen la concesion
 *     directa con sus opciones, el rol privilegiado alcanzado y el permiso que falta
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1 } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S16H = lee('sql/consultas/s16h-pertenencias-y-profiles.sql')
titulo('1 · solo lectura')
const sin = S16H.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''")
oraculo('S16h', 'una sola SELECT: sin escrituras, EXECUTE ni set_config; no lee ninguna de las 14 tablas', !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|perform|call|do|set_config)\b/i.test(sin) && (sin.match(/;/g) || []).length === 1 && !/\b(from|join)\s+(public\.)?(sim_|session_|user_)/i.test(sin))
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const m = montajeV1()
try {
  m.arranca()
  const d = m.base('sh1'); m.comoEjecutor(d, lee('sql/sim-004a-puerta.sql'))
  const corre = () => m.comoEjecutor(d, `begin read only;\n${S16H}\nrollback;`)
  const filas = r => r.out.split('\n').filter(l => l && !/^(BEGIN|ROLLBACK)$/.test(l))
  titulo('2 · el montaje limpio')
  const l0 = filas(corre())
  oraculo('S16h', 'acaba en «FIN|s16h|consulta»; ninguna pertenencia del alumno a un rol privilegiado; el dueño (pgx) con SELECT de las 3 columnas y UPDATE', l0.at(-1) === 'FIN|s16h|consulta' && !l0.some(l => l.startsWith('alcanza|')) && l0.some(l => /^profiles\|dueño de las RPC \(pgx\)\|SELECT id=true plan=true simulador_activo=true · UPDATE en alguna columna=true/.test(l)), l0.join(' / ').slice(0, 400))
  titulo('3 · los casos de Astra salen')
  const prep = m.comoEjecutor(d, 'create role x_paso nologin; grant service_role to x_paso with inherit false, set true; grant x_paso to authenticated with inherit false, set true; revoke select on public.profiles from pgx, anon, authenticated, service_role, public;')
  try {
    const l1 = filas(corre())
    oraculo('S16h', 'la concesion directa authenticated → x_paso con sus opciones, service_role alcanzado (dos saltos) y el SELECT que falta en profiles', prep.ok && l1.some(l => /^miembro\|authenticated → x_paso\|admin=false · inherit=false · set=true · concedido_por=pgx$/.test(l)) && l1.some(l => l === 'alcanza|authenticated → service_role|MEMBER (directa o en cadena, con SET o con INHERIT)') && l1.some(l => /^profiles\|.*SELECT id=false plan=false simulador_activo=false/.test(l)), (prep.err || l1.join(' / ')).slice(0, 400))
  } finally { m.comoEjecutor(d, 'revoke x_paso from authenticated; revoke service_role from x_paso; drop role x_paso; grant select on public.profiles to pgx;') }
} finally { m.cierra() }
fin()
