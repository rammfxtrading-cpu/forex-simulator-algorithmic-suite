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
 * GUARDAS_COMMIT=<sha>: lee las consultas de ese commit (el rojo previo, contra aa6d397 o dca27c4).
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
const SET_LOCAL = 'set local search_path = pg_catalog, pg_temp;'
const cuerpo = t => t.replace(/^begin read only;\n/m, '').replace(/\nrollback;\n?$/, '\n')
const sinSet = t => t.split('\n').filter(l => l !== SET_LOCAL).join('\n')
titulo('1 · en el texto')
const guarda = t => (/guarda as \(select [\s\S]*?end ok\),/.exec(t) ?? [''])[0]
oraculo('GUARDA', 'las cuatro: la guarda compara con OPERATOR(pg_catalog.=), concatena con OPERATOR(pg_catalog.||) y convierte con ::pg_catalog.bool; ningun «=», «||» ni «::boolean» sin calificar dentro de ella',
  Object.values(Q).every(t => { const g = guarda(t).replace(/--.*$/gm, '').replace(/'[^']*'/g, "''"); return g && /OPERATOR\(pg_catalog\.=\)/.test(g) && (g.match(/OPERATOR\(pg_catalog\.\|\|\)/g) || []).length === 2 && /::pg_catalog\.bool\b/.test(g) && !/(^|[^)])\s=\s/.test(g) && !/(^|[^)])\s\|\|\s/.test(g) && !/::boolean/.test(g) }),
  Object.entries(Q).filter(([, t]) => !/OPERATOR\(pg_catalog\.=\)/.test(guarda(t))).map(([k]) => k).join(', '))
oraculo('GUARDA', `s10, s16h y s16p: «${SET_LOCAL}» justo tras su BEGIN READ ONLY; la s16 no lo lleva (exige el search_path del editor, RINV3-01)`,
  ['s10', 's16h', 's16p'].every(k => Q[k].includes(`begin read only;\n-- S10RO-01: lo primero, el search_path de pg_catalog (LEEME): nada de la consulta resuelve en otro esquema por su nombre\n${SET_LOCAL}\nwith\n`)) && !Q.s16.includes(SET_LOCAL))
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
  for (const [hq, ddl] of Object.entries(HOMONIMOS)) {
    const r = m.comoEjecutor(d, `begin;\n${ddl};\n${EFECTO};\n${ALTERADO}\n${cuerpo(Q.s10)}\nrollback;`)
    if (r.ok || /EFECTO_EJECUTADO/.test(r.err + r.out) || !r.err.includes('s10: pegala ENTERA')) efecto.push(`${hq}: ${r.ok ? 'PASA' : ''}${/EFECTO_EJECUTADO/.test(r.err + r.out) ? ' EFECTO EJECUTADO' : ''}`)
  }
  oraculo('GUARDA', 'S10RO-01: con = o || homonimos, sin READ ONLY y las parejas llamando a una funcion que escribe: la s10 falla en la guarda ANTES del efecto (sin «EFECTO_EJECUTADO»)', efecto.length === 0, efecto.join(' · '))
  // control positivo del doble: el mismo cuerpo SIN el filtro de la guarda ejecuta el efecto (el doble funciona)
  const sinFiltro = cuerpo(Q.s10).replace(/ where \(select g\.ok from guarda g\)/, '')
  const c = m.comoEjecutor(d, `begin;\n${EFECTO};\n${sinFiltro}\nrollback;`)
  ver('control: el mismo cuerpo SIN el filtro de la guarda, en READ WRITE, SI ejecuta el efecto (el doble escribe de verdad)', /EFECTO_EJECUTADO/.test(c.err + c.out), (c.err || '').slice(0, 200))
} finally { m.cierra() }
fin()
