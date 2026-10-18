/**
 * S16p (¿ESTA APLICADA LA PUERTA?) · ENSAYO EN POSTGRESQL 17 LOCAL (orden 1-027, D3).
 *   1 READ ONLY, una sola SELECT, acaba en FIN; no lee ninguna de las 14 tablas
 *   2 la guarda: pegada por partes, falla cerrada sin dar datos
 *   3 en el estado 1 (sin puerta): SIN APLICAR; tras sql/sim-004a-puerta.sql: APLICADA con sus 2 disparadores;
 *     con un disparador quitado, desactivado o con otro cuerpo: A MEDIAS
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1 } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S16P = lee('sql/consultas/s16p-puerta-aplicada.sql'), PUERTA = lee('sql/sim-004a-puerta.sql')
titulo('1 · solo lectura')
const sin = S16P.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''")
oraculo('S16p', 'BEGIN READ ONLY, una sola SELECT y ROLLBACK (regla del LEEME, 18-oct): sin escrituras, EXECUTE ni set_config; no lee ninguna de las 14 tablas', /^begin read only;$/m.test(S16P) && /^rollback;$/m.test(S16P) && !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|perform|call|do|set_config)\b/i.test(sin) && (sin.match(/;/g) || []).length === 3 && !/\b(from|join)\s+(public\.)?(sim_|session_|user_)/i.test(sin))
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const m = montajeV1()
try {
  m.arranca()
  const corre = d => m.comoEjecutor(d, S16P)
  const filas = r => r.out.split('\n').filter(l => l && !/^(BEGIN|ROLLBACK)$/.test(l))
  const veredicto = r => (filas(r).find(l => l.startsWith('veredicto|')) ?? '').split('|')[2] ?? ''
  const d = m.base('sp1')
  titulo('2 · la guarda: pegada por partes, falla cerrada sin dar datos')
  const partes = [S16P.replace(/^begin read only;$/m, ''), S16P.replace(/^begin read only;$/m, '').replace(/^rollback;$/m, ''), S16P.replace(/^begin read only;$/m, 'begin;')].map(t => m.comoEjecutor(d, t))
  oraculo('S16p', 'sin su BEGIN READ ONLY, solo la SELECT o con BEGIN ordinario: error «s16p: pegala ENTERA…» y ninguna fila', partes.every(r => !r.ok && /s16p: pegala ENTERA/.test(r.err) && !/FIN\|s16p/.test(r.out)), partes.map(r => r.err).join(' / ').slice(0, 200))
  titulo('3 · los tres estados')
  const r0 = corre(d), l0 = filas(r0)
  oraculo('S16p', 'estado 1 (sin puerta): «funcion|…|no existe», ningun disparador, veredicto SIN APLICAR y FIN', r0.ok && l0.includes('funcion|public.sim_escrituras_v0_puerta()|no existe') && !l0.some(l => l.startsWith('disparador|')) && veredicto(r0) === 'SIN APLICAR' && l0.at(-1) === 'FIN|s16p|consulta', (r0.err || l0.join(' / ')).slice(0, 300))
  const ap = m.comoEjecutor(d, PUERTA)
  ver('control: sql/sim-004a-puerta.sql aplica en el montaje', ap.ok && /FIN\|sim-004a-puerta aplicada/.test(ap.out), ap.err)
  const r1 = corre(d), l1 = filas(r1)
  oraculo('S16p', 'tras la puerta: su cuerpo (el de sim-004a-puerta), sus 2 disparadores activos en sim_sessions y sim_trades y veredicto APLICADA', r1.ok && l1.includes('funcion|public.sim_escrituras_v0_puerta()|existe · cuerpo sha256=fe4c7c32b146e7d525665760047af0ad49d85d2dc538e1afcf3b080a9f305883 (el de sim-004a-puerta)') && l1.includes('disparador|public.sim_sessions.sim_escrituras_v0_puerta|tgenabled=O') && l1.includes('disparador|public.sim_trades.sim_escrituras_v0_puerta|tgenabled=O') && veredicto(r1) === 'APLICADA', (r1.err || l1.join(' / ')).slice(0, 400))
  // A MEDIAS: cada desvio en una transaccion que se deshace; la s16p, despues, en READ ONLY dentro de ella
  const cuerpo = S16P.replace(/^begin read only;$/m, '').replace(/^rollback;$/m, '')
  const medias = [
    ['sin el disparador de sim_trades', 'drop trigger sim_escrituras_v0_puerta on public.sim_trades'],
    ['con el de sim_sessions desactivado', 'alter table public.sim_sessions disable trigger sim_escrituras_v0_puerta'],
    ['con otro cuerpo', "create or replace function public.sim_escrituras_v0_puerta() returns trigger language plpgsql set search_path = '' as $f$ begin return new; end $f$"],
  ].map(([que, sql]) => [que, m.comoEjecutor(d, `begin;\n${sql};\nset transaction read only;\n${cuerpo}\nrollback;`)])
  oraculo('S16p', 'A MEDIAS si falta un disparador, si esta desactivado o si el cuerpo es otro', medias.every(([, r]) => r.ok && veredicto(r) === 'A MEDIAS: PARAR (decide el CTO)'), medias.filter(([, r]) => !r.ok || veredicto(r) !== 'A MEDIAS: PARAR (decide el CTO)').map(([q, r]) => `${q}: ${r.err || veredicto(r)}`).join(' · '))
  ver('control: tras las tres, la puerta sigue APLICADA (cada desvio se deshizo)', veredicto(corre(d)) === 'APLICADA')
} finally { m.cierra() }
fin()
