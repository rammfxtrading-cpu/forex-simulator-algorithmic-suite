/**
 * CONSULTAS CALIFICADAS ENTERAS (GR1-02 y GR1-03, Astra guardas r1; orden 1-041) · TEXTO Y ENSAYO EN POSTGRESQL 17 LOCAL
 * Lo que corre con el search_path de quien lo ejecuta (sin SET: la s16 entera, y el INFORME final de sim-004b, que va
 * despues de que el DO devuelva el search_path) tiene que estar calificado ENTERO, no solo su guarda.
 *   1 en el texto, fuera de comentarios y cadenas: ningun operador sin OPERATOR(pg_catalog.x); ninguna conversion,
 *     funcion ni catalogo sin pg_catalog.; nada de IN, LIKE, IS DISTINCT FROM, NULLIF, BETWEEN ni CASE x WHEN (buscan
 *     su operador por el search_path); la colacion, pg_catalog."C". Control: el detector ve cada forma plantada
 *   2 GR1-02: con un ~(text,text) homonimo en public que esconde las filas DIFIERE del recuento, un =(text,text) que hace
 *     «coincidir» el requisito del search_path, la puerta desactivada y search_path = public, pg_catalog, extensions:
 *     la s16 dice DIFIEREN n, con n = las filas DIFIERE/DE MAS/FALTA que de verdad da, y el requisito DIFIERE
 *   2b RG-07 (dictamen formal de guardas r1; orden 1-041-bis): un to_regprocedure(text) homonimo IMMUTABLE con nextval
 *     se plegaba al PLANIFICAR, antes de que la guarda abortara (s16 pegada fuera de READ ONLY): calificada, el canario
 *     no se mueve; control: llamada sin calificar, si
 *   3 GR1-03: con public.pg_get_constraintdef(oid) VOLATILE que hace nextval en un canario y el mismo search_path,
 *     sim-004b aplica y el canario NO se mueve (el informe ya no la llama)
 * CALIFICADAS_COMMIT=<sha>: lee los SQL de ese commit (el rojo previo, contra a6bb3a5).
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, conUidDelMontaje, sinEnvoltura } from './montaje-v1.mjs'
const COMMIT = process.env.CALIFICADAS_COMMIT
const lee = p => COMMIT ? execFileSync('git', ['-C', REPO, 'show', `${COMMIT}:${p}`], { encoding: 'utf8' }) : readFileSync(path.join(REPO, p), 'utf8')
const S16 = conUidDelMontaje(lee('sql/consultas/s16-catalogo-sim004b.sql')), S4B = conUidDelMontaje(lee('sql/sim-004b-contrato-v1.sql'))
const PUERTA = readFileSync(path.join(REPO, 'sql/sim-004a-puerta.sql'), 'utf8')
const INFORME = S4B.slice(S4B.lastIndexOf('\n-- INFORME (solo lectura)'))

titulo('1 · en el texto: calificadas enteras')
// fuera de comentarios y de cadenas ('…', E'…', $x$…$x$), y sin los OPERATOR(pg_catalog.x) ya calificados
const codigo = t => t.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''").replace(/--[^\n]*/g, '').replace(/[Ee]?'(?:[^']|'')*'/g, "''")
const SINTAXIS = new Set(['coalesce', 'exists', 'any', 'all', 'array', 'values', 'select', 'from', 'where', 'and', 'or', 'not', 'as', 'on', 'join', 'union', 'then', 'else', 'when', 'over', 'filter', 'lateral', 'in', 'by', 'with', 'using'])
function sinCalificar(t) {
  const c = codigo(t), mal = []
  // fuera los ya calificados, count(*) y select *: lo que quede de [=<>!~|+-*/] es un operador por su nombre
  const sinOp = c.replace(/OPERATOR\(pg_catalog\.[^)\s]+\)/g, ' ').replace(/\(\s*\*\s*\)/g, '( )').replace(/\bselect\s+\*/gi, 'select ')
  for (const m of sinOp.matchAll(/(\|\||<>|!=|<=|>=|!~|~~|[=<>~+\-*\/])/g)) mal.push(`operador ${m[1]}`)
  for (const m of c.matchAll(/::\s*(?!pg_catalog\.)([A-Za-z_"][\w"]*)/g)) mal.push(`conversion ::${m[1]}`)
  // los nombres de las CTE y de los alias de columnas (nombre(a, b) as) no son llamadas
  const ctes = new Set([...c.matchAll(/(?:with|,)\s*([a-z_][a-z_0-9]*)\s*(?:\([^()]*\))?\s+as\s*\(/gi)].map(m => m[1].toLowerCase()).concat([...c.matchAll(/(?:\)|\bordinality|\bas)\s+([a-z_][a-z_0-9]*)\s*\(/gi)].map(m => m[1].toLowerCase())))
  for (const m of sinOp.matchAll(/(?<![\w.])([a-z_][a-z_0-9]*)\s*\(/gi)) if (!SINTAXIS.has(m[1].toLowerCase()) && !ctes.has(m[1].toLowerCase())) mal.push(`funcion ${m[1]}(`)
  for (const m of c.matchAll(/(?<![\w.])(pg_[a-z_]+)\b(?!\s*[.(])/gi)) mal.push(`catalogo ${m[1]}`)
  for (const m of c.matchAll(/\b(in\s*\(|like|ilike|similar\s+to|distinct\s+from|nullif|between|collate\s+(?!pg_catalog\.))/gi)) mal.push(m[1].replace(/\s+/g, ' '))
  for (const m of c.matchAll(/\bcase\s+(?!when\b)[^\s]+\s+when\b/gi)) mal.push('case x when')
  return mal
}
const resume = mal => Object.entries(mal.reduce((a, x) => ({ ...a, [x]: (a[x] ?? 0) + 1 }), {})).map(([k, n]) => `${k} ×${n}`).join(' · ')
const m16 = sinCalificar(sinEnvoltura(S16)), mInf = sinCalificar(INFORME.slice(INFORME.indexOf('select seccion')))
oraculo('GR1-02', 's16 entera: ni un operador, conversion, funcion, catalogo ni colacion sin pg_catalog; nada de IN, LIKE, IS DISTINCT FROM, NULLIF, BETWEEN ni CASE x WHEN', m16.length === 0, resume(m16).slice(0, 400))
oraculo('GR1-03', 'el INFORME final de sim-004b, igual', mInf.length === 0, resume(mInf).slice(0, 400))
// control: el detector ve cada forma, plantada en un texto calificado
const plantas = ["a = b", "a || b", "a ~ 'x'", "x::text", "count(*)", "from pg_class", "x in ('a')", "x like 'a'", "a is distinct from b", "nullif(a, '')", "order by a collate \"C\"", "case a when 1 then 2 end", "a + 1"]
const ciegas = plantas.filter(p => sinCalificar(`select ${p}`).length === 0)
ver(`control: el detector ve las ${plantas.length} formas plantadas`, ciegas.length === 0, ciegas.join(' · '))
ver('control: y no ve nada en lo calificado (OPERATOR(pg_catalog.=), ::pg_catalog.text, pg_catalog.count(*), pg_catalog.pg_class)', sinCalificar("select a OPERATOR(pg_catalog.=) b, x::pg_catalog.text, pg_catalog.count(*) from pg_catalog.pg_class c where c.x OPERATOR(pg_catalog.=) any (array['a'])").length === 0)

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la parte contra la base no se ha ejecutado', false); fin() }
const m = montajeV1()
try {
  m.arranca()
  const ALTERADO = 'set search_path = public, pg_catalog, extensions;\n'
  titulo('2 · GR1-02: homonimos ~ y = en public, la puerta desactivada y public delante de pg_catalog')
  const d = m.base('cal1')
  ver('control: la puerta aplica en el montaje', m.comoEjecutor(d, PUERTA).ok)
  // el ~ de Astra: el de verdad, salvo para los dos patrones con que la s16 cuenta sus filas malas
  const HOMONIMOS = `create function public.astra_re(a text, b text) returns boolean language sql immutable as $f$ select case when b in ('(DIFIERE|DE MAS|FALTA)$', 'DIFIERE \\(') then false else a OPERATOR(pg_catalog.~) b end $f$;
create operator public.~ (leftarg = text, rightarg = text, function = public.astra_re);
create function public.astra_eq(a text, b text) returns boolean language sql immutable as $f$ select case when b OPERATOR(pg_catalog.=) '{public,extensions}' then true else a OPERATOR(pg_catalog.=) b end $f$;
create operator public.= (leftarg = text, rightarg = text, function = public.astra_eq);
alter table public.sim_sessions disable trigger sim_escrituras_v0_puerta`
  const h = m.comoEjecutor(d, HOMONIMOS)
  ver('control: el ejecutor NO superusuario crea los homonimos y desactiva la puerta con DDL normal', h.ok, h.err)
  const r = m.comoEjecutor(d, `begin read only;\n${ALTERADO}${sinEnvoltura(S16)}\ncommit;`)
  const filas = r.out.split('\n').filter(l => /\|/.test(l))
  const malas = filas.filter(l => /(DIFIERE|DE MAS|FALTA)$/.test(l) || /DIFIERE \(/.test(l)).length
  const veredicto = (filas.find(l => l.startsWith('veredicto|')) ?? '').split('|')[1] ?? ''
  const req = filas.find(l => l.startsWith('requisito|search_path|')) ?? ''
  ver('control: hay filas malas de verdad (la puerta desactivada y el search_path cambiado)', malas > 0 && filas.some(l => /sim_escrituras_v0_puerta/.test(l) && /DIFIERE|DE MAS|FALTA/.test(l)), `${malas}`)
  oraculo('GR1-02', 'la s16 dice DIFIEREN n con n = las filas DIFIERE/DE MAS/FALTA que de verdad da (el ~ homonimo no las esconde), y el requisito search_path DIFIERE (el = homonimo no lo hace coincidir)',
    r.ok && veredicto === `DIFIEREN ${malas}` && req.endsWith(' · DIFIERE'), `${r.err || ''} veredicto «${veredicto}» · malas ${malas} · ${req.slice(0, 160)}`)

  titulo('2b · RG-07: to_regprocedure homonima IMMUTABLE, plegada al planificar, con la s16 fuera de READ ONLY')
  const k = m.base('cal3')
  ver('control: el ejecutor crea el canario y la to_regprocedure(text) homonima IMMUTABLE', m.comoEjecutor(k, `create sequence public.rg07_canario;
create function public.to_regprocedure(text) returns regprocedure language plpgsql immutable as $f$ begin perform pg_catalog.nextval('public.rg07_canario'); return pg_catalog.to_regprocedure($1); end $f$`).ok)
  const lee_k = () => m.comoEjecutor(k, "select last_value || '|' || is_called from public.rg07_canario").out
  m.comoEjecutor(k, `begin;\n${ALTERADO}select to_regprocedure('public.x()');\nrollback;`)
  const antesK = lee_k()
  ver('control: llamada sin calificar con ese search_path, la homonima SI corre (canario a 1|true)', antesK === '1|true', antesK)
  const fuera = m.comoEjecutor(k, `begin;\n${ALTERADO}${sinEnvoltura(S16)}\nrollback;`)
  const trasK = lee_k()
  oraculo('RG-07', 'la s16 pegada fuera de READ ONLY con la homonima: falla en «pegala ENTERA» y el canario NO se mueve (nada se pliega antes de la guarda)', !fuera.ok && /s16: pegala ENTERA/.test(fuera.err) && trasK === antesK, `${fuera.ok ? 'NO fallo' : fuera.err.slice(0, 80)} · canario ${antesK} → ${trasK}`)

  titulo('3 · GR1-03: pg_get_constraintdef homonima con efecto y public delante de pg_catalog')
  const e = m.base('cal2')
  const canario = `create sequence public.astra_canario;
create function public.pg_get_constraintdef(oid) returns text language plpgsql volatile as $f$ begin perform pg_catalog.nextval('public.astra_canario'); raise notice 'ASTRA_EFECTO'; return pg_catalog.pg_get_constraintdef($1); end $f$`
  ver('control: el ejecutor crea el canario y la funcion homonima', m.comoEjecutor(e, canario).ok)
  const lee_c = () => m.comoEjecutor(e, "select last_value || '|' || is_called from public.astra_canario").out
  // una secuencia no vuelve atras con el ROLLBACK: el control la deja en 1|true, y lo que se mide es que sim-004b no la mueva
  m.comoEjecutor(e, `begin;\n${ALTERADO}select pg_get_constraintdef(oid) from pg_catalog.pg_constraint limit 1;\nrollback;`)
  const antes = lee_c()
  ver('control: la homonima SI se ejecuta si se la llama sin calificar con ese search_path (mueve el canario a 1|true)', antes === '1|true', antes)
  const a = m.comoEjecutor(e, `${ALTERADO}${S4B}`)
  const tras = lee_c()
  oraculo('GR1-03', 'sim-004b aplica (FIN) con public delante de pg_catalog y el canario NO se mueve: ni el DO ni el informe ejecutan la homonima',
    a.ok && /FIN\|sim-004b aplicada/.test(a.out) && tras === antes && !/ASTRA_EFECTO/.test(a.err ?? ''), `${a.ok ? 'aplica' : a.err?.slice(0, 160)} · canario ${antes} → ${tras}`)
} finally { m.cierra() }
fin()
