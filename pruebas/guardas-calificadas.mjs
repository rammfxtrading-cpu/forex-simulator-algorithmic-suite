/**
 * GUARDAS CALIFICADAS (S10RO-01, Astra 18-oct; LEEME «Guardas de las consultas: calificadas»; orden 1-032) · ENSAYO EN
 * POSTGRESQL 17 LOCAL, sobre las cuatro consultas para Ramón que llevan guarda: s10, s16, s16h y s16p.
 *   1 en el texto: la guarda usa OPERATOR(pg_catalog.=), OPERATOR(pg_catalog.||) y ::pg_catalog.bool; s10, s16h y s16p
 *     fijan «set local search_path = pg_catalog, pg_temp» justo tras su BEGIN READ ONLY (la s16 no: exige el search_path
 *     del editor, RINV3-01)
 *   2 positivo limpio: cada una ENTERA da sus filas y acaba en su FIN
 *   3 la familia de Astra: un operador homonimo en public (= que da true con off/on, o || que devuelve 'true') y el
 *     search_path alterado (public delante de pg_catalog), con el cuerpo fuera de READ ONLY (BEGIN ordinario): la guarda
 *     falla cerrada, con su mensaje y sin filas; y lo mismo sin la linea del SET LOCAL (la guarda sola tiene que bastar)
 *   4 el efecto indirecto (s10): con sim_escrituras_v0_parejas llamando a una funcion VOLATILE que inserta en un canario y
 *     avisa «EFECTO_EJECUTADO», bajo los homonimos y sin READ ONLY, NO se ejecuta; control: sin la guarda, si
 *   5 S038R5-01 (Astra, en la 038; LEEME, ampliacion; orden 1-034): en el DO sin aplicar de B (sim-004b; mercado-000 y
 *     mercado-001, en su rama sobre main) los tipos y las funciones del DECLARE de primer nivel, calificados con pg_catalog, y la primera
 *     sentencia del cuerpo fija el search_path de pg_catalog. En sim-004b, ademas: un dominio text o uuid homonimo con
 *     CHECK que hace nextval (el caso de Astra) y el search_path alterado no se ejecuta; y un = homonimo con row_security = off no hace pasar su
 *     seccion 0 (aborta en «ajustes»)
 * GUARDAS_COMMIT=<sha>: lee las consultas de ese commit (el rojo previo, contra aa6d397, dca27c4 o 167cb1c).
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, conUidDelMontaje } from './montaje-v1.mjs'
const COMMIT = process.env.GUARDAS_COMMIT
const lee = p => COMMIT ? execFileSync('git', ['-C', REPO, 'show', `${COMMIT}:${p}`], { encoding: 'utf8' }) : readFileSync(path.join(REPO, p), 'utf8')
const Q = {
  s10: lee('sql/consultas/s10-conciliacion.sql'),
  s16: conUidDelMontaje(lee('sql/consultas/s16-catalogo-sim004b.sql')),
  s16h: lee('sql/consultas/s16h-pertenencias-y-profiles.sql'),
  s16p: lee('sql/consultas/s16p-puerta-aplicada.sql'),
}
// mercado-000 y mercado-001: su arreglo va en su rama, sobre las versiones de main (etapa 2 r9); aqui solo sim-004b
const DO_SQL = { 'sim-004b': lee('sql/sim-004b-contrato-v1.sql') }
const SET_LOCAL = 'set local search_path = pg_catalog, pg_temp;'
const cuerpo = t => t.replace(/^begin read only;\n/m, '').replace(/\nrollback;\n?$/, '\n')
const sinSet = t => t.split('\n').filter(l => l !== SET_LOCAL).join('\n')
titulo('1 · en el texto')
const guarda = t => (/guarda as \(select [\s\S]*?end ok\),/.exec(t) ?? [''])[0]
oraculo('GUARDA', 'las cuatro: la guarda compara con OPERATOR(pg_catalog.=), concatena con OPERATOR(pg_catalog.||) y convierte con ::pg_catalog.bool; ningun «=», «||» ni «::boolean» sin calificar dentro de ella',
  Object.values(Q).every(t => {
    const g = guarda(t).replace(/--.*$/gm, '').replace(/'[^']*'/g, "''")
    // RG-05: quitados los OPERATOR(pg_catalog.…), las funciones pg_catalog.x( y la conversion ::pg_catalog.bool, no
    // puede quedar ningun =, ||, :: ni ningun identificador seguido de «(» (una funcion sin calificar)
    const resto = g.replace(/OPERATOR\(pg_catalog\.(=|\|\|)\)/g, ' ').replace(/pg_catalog\.[a-z_]+\(/g, '(').replace(/::pg_catalog\.bool\b/g, ' ')
    return g && /OPERATOR\(pg_catalog\.=\)/.test(g) && (g.match(/OPERATOR\(pg_catalog\.\|\|\)/g) || []).length === 2 && /::pg_catalog\.bool\b/.test(g)
      && !/=|\|\||::/.test(resto) && !/\b(?!(as|else|when|then|select|case|end)\b)[a-z_][a-z_0-9.]*\s*\(/i.test(resto)
  }),
  Object.entries(Q).filter(([, t]) => !/OPERATOR\(pg_catalog\.=\)/.test(guarda(t))).map(([k]) => k).join(', '))
oraculo('GUARDA', `s10, s16h y s16p: «${SET_LOCAL}» justo tras su BEGIN READ ONLY; la s16 no lo lleva (exige el search_path del editor, RINV3-01)`,
  ['s10', 's16h', 's16p'].every(k => Q[k].includes(`begin read only;\n-- S10RO-01: lo primero, el search_path de pg_catalog (LEEME): nada de la consulta resuelve en otro esquema por su nombre\n${SET_LOCAL}\nwith\n`)) && !Q.s16.includes(SET_LOCAL))
// el DECLARE de primer nivel de un DO (sin los cuerpos $c$…$c$ ni las cadenas) y su primera sentencia ejecutable
const declare = t => { const L = t.split('\n'); const i = L.findIndex(l => /^do \$/i.test(l)); const j = L.findIndex((l, k) => k > i && /^begin$/i.test(l)); return { dec: L.slice(i + 2, j).join('\n'), cuerpo: L.slice(j + 1).filter(l => l.trim() && !/^\s*--/.test(l)).slice(0, 2).join('\n') } }
const limpio = x => x.replace(/\$c\$[\s\S]*?\$c\$/g, "''").replace(/E?'(?:[^']|'')*'/g, "''").replace(/--.*$/gm, '')
const malDeclare = Object.entries(DO_SQL).flatMap(([k, t]) => {
  const { dec, cuerpo } = declare(t), d = limpio(dec), fallos = []
  for (const m of d.matchAll(/^\s+[a-z_0-9]+\s+(?:constant\s+)?([a-z_.]+)/gm)) if (!m[1].startsWith('pg_catalog.')) fallos.push(`${k}: tipo ${m[1]}`)
  for (const m of d.matchAll(/(?<![.\w])([a-z_][a-z_0-9]*)\s*\(/g)) if (!['array', 'current_user'].includes(m[1].toLowerCase())) fallos.push(`${k}: funcion ${m[1]}( sin calificar`)
  if (!/pg_catalog\.set_config\('search_path', 'pg_catalog, pg_temp', true\)/.test(cuerpo)) fallos.push(`${k}: la primera sentencia no fija el search_path de pg_catalog`)
  return fallos
})
oraculo('DECLARE', 'S038R5-01: en sim-004b, todo tipo y toda funcion del DECLARE de primer nivel, calificados con pg_catalog; y lo primero del cuerpo, el search_path de pg_catalog', malDeclare.length === 0, malDeclare.slice(0, 12).join(' · '))
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const m = montajeV1()
try {
  m.arranca()
  const d = m.base('gc1')
  const FIN = { s10: 'FIN|s10|consulta', s16: 'FIN|s16|consulta', s16h: 'FIN|s16h|consulta', s16p: 'FIN|s16p|consulta' }
  const ultima = r => r.out.split('\n').filter(l => l && !/^(BEGIN|ROLLBACK|SET)$/.test(l)).at(-1)
  titulo('2 · positivo limpio: cada una ENTERA')
  const lim = Object.entries(Q).map(([k, t]) => [k, m.comoEjecutor(d, t)])
  oraculo('GUARDA', 'las cuatro, ENTERAS: sin error y acaban en su FIN', lim.every(([k, r]) => r.ok && ultima(r) === FIN[k]), lim.filter(([k, r]) => !(r.ok && ultima(r) === FIN[k])).map(([k, r]) => `${k}: ${(r.err || ultima(r) || '').slice(0, 120)}`).join(' · '))
  titulo('3 · la familia de Astra: operador homonimo y search_path alterado, sin READ ONLY')
  const HOMONIMOS = {
    '= homonimo (true con off/on)': `create function public.h_eq(text, text) returns boolean language sql immutable set search_path = pg_catalog as $f$ select case when ($1 operator(pg_catalog.=) 'off' or $1 operator(pg_catalog.=) 'on') and ($2 operator(pg_catalog.=) 'off' or $2 operator(pg_catalog.=) 'on') then true else $1 operator(pg_catalog.=) $2 end $f$;
create operator public.= (leftarg = text, rightarg = text, function = public.h_eq)`,
    '|| homonimo (devuelve true)': `create function public.h_cat(text, text) returns text language sql immutable set search_path = pg_catalog as $f$ select 'true'::text $f$;
create operator public.|| (leftarg = text, rightarg = text, function = public.h_cat)`,
  }
  const ALTERADO = 'set local search_path = public, pg_catalog, extensions;'
  const mal = []
  for (const [k, t] of Object.entries(Q)) {
    for (const [hq, ddl] of Object.entries(HOMONIMOS)) {
      for (const [vq, c] of [['tal cual', cuerpo(t)], ['sin su SET LOCAL', sinSet(cuerpo(t))]]) {
        if (vq === 'sin su SET LOCAL' && !t.includes(SET_LOCAL)) continue
        const r = m.comoEjecutor(d, `begin;\n${ddl};\n${ALTERADO}\n${c}\nrollback;`)
        if (!(!r.ok && r.err.includes(`${k}: pegala ENTERA`) && !r.out.includes(FIN[k]))) mal.push(`${k} · ${hq} · ${vq}: ${r.ok ? 'PASA (' + (ultima(r) ?? '') + ')' : r.err.split('\n').find(l => /ERROR/.test(l))?.slice(0, 100)}`)
      }
    }
  }
  oraculo('GUARDA', 'S10RO-01: con = o || homonimos en public y el search_path alterado, fuera de READ ONLY: cada una falla cerrada («pegala ENTERA», sin su FIN), tal cual y sin su SET LOCAL', mal.length === 0, mal.join(' · '))
  ver('control: tras la familia, los operadores homonimos no quedan (cada caso se deshizo)', m.uno('gc1', "select count(*) from pg_operator o join pg_namespace n on n.oid = o.oprnamespace where n.nspname = 'public' and o.oprname in ('=', '||')") === '0')
  titulo('4 · el efecto indirecto (s10): con los homonimos y sin READ ONLY, la funcion que escribe NO se ejecuta')
  // una escritura «sin firma de alumno» (authenticated sin x-sim-cliente; sin la puerta) para que la s10 llame a las parejas
  const uid = 'aaaaaaaa-0000-4000-8000-000000000002', sid = 'bbbbbbbb-0000-4000-8000-000000000002'
  m.alumno('gc1', uid, {})
  m.uno('gc1', `insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance) values ('${sid}', '${uid}', 'sintetica', 'EUR/USD', 'M1', '2026-01-01', '2026-01-31', 100000, 100000)`)
  const w = m.comoEjecutor(d, `begin; set local role authenticated; set local request.jwt.claim.sub = '${uid}'; set local request.jwt.claims = '{"role":"authenticated"}'; set local request.headers = '{}'; update public.sim_sessions set timeframe = 'M5' where id = '${sid}'; commit;`)
  ver('control: hay una escritura sin firma de alumno (la s10 llamara a las parejas de esa sesion)', w.ok && m.uno('gc1', `select count(*) from public.sim_escrituras_v0 where cliente = 'sin-firma' and session_id = '${sid}'`) !== '0', w.err)
  const EFECTO = `create table public.h_canario (x integer);
create function public.h_efecto() returns integer language plpgsql volatile as $f$ begin insert into public.h_canario values (1); raise notice 'EFECTO_EJECUTADO'; return 1; end $f$;
create or replace function public.sim_escrituras_v0_parejas(p_session_id uuid) returns table (orden integer, escritura_update bigint, escritura_insert bigint)
  language plpgsql stable set search_path = '' as $f$ begin perform public.h_efecto(); return; end $f$`
  const efecto = []
  // RG-04 (revisor interno): tambien sin su SET LOCAL, que es el caso real si se pega sin el BEGIN (fuera de una
  // transaccion el SET LOCAL solo avisa): asi los homonimos y el search_path alterado si alcanzan a la guarda
  for (const [hq, ddl] of Object.entries(HOMONIMOS)) for (const [vq, c] of [['tal cual', cuerpo(Q.s10)], ['sin su SET LOCAL', sinSet(cuerpo(Q.s10))]]) {
    if (vq === 'sin su SET LOCAL' && !Q.s10.includes(SET_LOCAL)) continue
    const r = m.comoEjecutor(d, `begin;\n${ddl};\n${EFECTO};\n${ALTERADO}\n${c}\nrollback;`)
    if (r.ok || /EFECTO_EJECUTADO/.test(r.err + r.out) || !r.err.includes('s10: pegala ENTERA')) efecto.push(`${hq} · ${vq}: ${r.ok ? 'PASA' : ''}${/EFECTO_EJECUTADO/.test(r.err + r.out) ? ' EFECTO EJECUTADO' : ''}`)
  }
  oraculo('GUARDA', 'S10RO-01: con = o || homonimos, sin READ ONLY y las parejas llamando a una funcion que escribe: la s10 falla en la guarda ANTES del efecto (sin «EFECTO_EJECUTADO»)', efecto.length === 0, efecto.join(' · '))
  // control positivo del doble: el mismo cuerpo SIN el filtro de la guarda ejecuta el efecto (el doble funciona)
  const sinFiltro = cuerpo(Q.s10).replace(/ where \(select g\.ok from guarda g\)/, '')
  const c = m.comoEjecutor(d, `begin;\n${EFECTO};\n${sinFiltro}\nrollback;`)
  ver('control: el mismo cuerpo SIN el filtro de la guarda, en READ WRITE, SI ejecuta el efecto (el doble escribe de verdad)', /EFECTO_EJECUTADO/.test(c.err + c.out), (c.err || '').slice(0, 200))
  titulo('5 · S038R5-01 y la seccion 0 de sim-004b, en una base aparte')
  const S4B = conUidDelMontaje(DO_SQL['sim-004b'])
  const e = m.base('gc2')
  // el mecanismo exacto de Astra: un dominio homonimo con CHECK (una funcion VOLATILE que hace nextval); el CHECK se evalua
  // al inicializar la variable del DECLARE, aunque sea a NULL, y nextval no se deshace con el error posterior
  m.uno('gc2', "create sequence public.h_seq; create function public.h_marca() returns boolean language plpgsql volatile set search_path = pg_catalog as $f$ begin perform pg_catalog.nextval('public.h_seq'); return true; end $f$")
  const consumidas = []
  for (const tipo of ['text', 'uuid']) {
    const antes = m.uno('gc2', "select last_value || '|' || is_called from public.h_seq")
    const rd = m.comoEjecutor(e, `begin;\ncreate domain public.${tipo} as pg_catalog.${tipo} check (public.h_marca());\n${ALTERADO}\n${S4B}\nrollback;`)
    const despues = m.uno('gc2', "select last_value || '|' || is_called from public.h_seq")
    if (despues !== antes) consumidas.push(`dominio ${tipo}: secuencia ${antes} → ${despues} (sim-004b ${rd.ok ? 'aplica' : rd.err.split('\n').find(l => /ERROR/.test(l))?.slice(0, 80)})`)
  }
  oraculo('DECLARE', 'S038R5-01 (el caso de Astra): con un dominio text o uuid homonimo en public, con CHECK que hace nextval, y el search_path alterado, sim-004b NO ejecuta el CHECK (la secuencia no se mueve)', consumidas.length === 0, consumidas.join(' · '))
  // control positivo del doble: una variable de ese dominio, en un DO cualquiera, SI lo ejecuta
  const antesC = m.uno('gc2', "select last_value || '|' || is_called from public.h_seq")
  m.comoEjecutor(e, `begin;\ncreate domain public.text as pg_catalog.text check (public.h_marca());\n${ALTERADO}\ndo $x$ declare v text; begin null; end $x$;\nrollback;`)
  ver('control: el doble funciona (un DECLARE con «text» sin calificar, bajo el search_path alterado, SI mueve la secuencia)', m.uno('gc2', "select last_value || '|' || is_called from public.h_seq") !== antesC)
  const ra = m.comoEjecutor(e, `begin;\n${HOMONIMOS['= homonimo (true con off/on)']};\nset local row_security = off;\n${ALTERADO}\n${S4B}\nrollback;`)
  oraculo('DECLARE', 'S10RO-01 en la seccion 0 de sim-004b: con un = homonimo (off = on) y row_security = off, sim-004b aborta en «ajustes que cambian la semantica» y no aplica', !ra.ok && /sim-004b: ajustes que cambian la semantica/.test(ra.err), ra.ok ? 'APLICA con row_security = off' : ra.err.split('\n').find(l => /ERROR/.test(l))?.slice(0, 160))
  const rb = m.comoEjecutor(e, `begin;\nset local row_security = off;\n${S4B}\nrollback;`)
  ver('control: sin el homonimo, row_security = off hace abortar sim-004b en «ajustes» (la guarda existe)', !rb.ok && /sim-004b: ajustes que cambian la semantica/.test(rb.err), rb.err.slice(0, 160))
  const rl = m.comoEjecutor(e, `begin;\n${S4B}\nrollback;`)
  ver('control: en limpio, sim-004b aplica y acaba en «FIN|sim-004b aplicada»', rl.ok && /FIN\|sim-004b aplicada/.test(rl.out), rl.err.slice(0, 160))
} finally { m.cierra() }
fin()
