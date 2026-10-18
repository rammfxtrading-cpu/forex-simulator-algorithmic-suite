/**
 * ETAPA 3 · ronda 5 (parte B) · E3R4-01 y E3R4-02 (Astra r4; CTO 18-oct, orden 1-013): igual en la s16 y en sim-004b, en
 * primera aplicacion y en reejecucion. Rojo previo contra c006934 (rojos/…).
 *   · E3R4-01: el permiso efectivo minimo del dueño de las RPC en public.profiles (la unica relacion de fuera de las 14 que
 *     tocan los cuerpos): SELECT de id, plan y simulador_activo, y UPDATE en alguna columna (FOR KEY SHARE). Mutantes: sin
 *     SELECT, sin UPDATE, y SELECT por columna sin «plan». Control funcional de Astra: crear da 42501 y, devolviendo solo el
 *     permiso retirado, 201. Y el positivo: UPDATE en una sola columna basta (el requisito no pide mas de lo necesario).
 *   · E3R4-02: anon y authenticated sin pertenencia (directa o en cadena, con SET o con INHERIT) a service_role, postgres, el
 *     dueño de las RPC ni ningun rol superusuario, con BYPASSRLS o dueño de las 14 tablas. Mutantes: directo y dos saltos sin
 *     INHERIT (los de Astra), anon con INHERIT y sin SET a service_role, y authenticated con un rol nuevo con BYPASSRLS. Limpieza por el mismo
 *     otorgante y control pg_has_role = false despues. Control funcional de Astra: con la pertenencia, el alumno u9 hace SET
 *     ROLE service_role y lee el recibo de u1; limpio, SET ROLE falla y lee 0.
 *   · E3R5-01 (Astra r5): el alumno que ES el dueño directo de profiles (authenticated y anon), de auth.users o de auth.uid();
 *     control funcional: con authenticated dueño de profiles, u9 lee y cambia el perfil de u1.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, importa, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, conUidDelMontaje } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const err1 = r => (r.err.split('\n').find(l => /ERROR/.test(l)) || r.err.split('\n')[0] || '').replace(/^.*ERROR:\s+/, '')
const CA = await importa('lib/motor/cartera.mjs'), RT = await importa('lib/motor/reto.mjs'), { COSTES_1 } = await importa('lib/motor/costes.mjs')

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const S4B = conUidDelMontaje(lee('sql/sim-004b-contrato-v1.sql')), S16 = conUidDelMontaje(lee('sql/consultas/s16-catalogo-sim004b.sql'))
const m = montajeV1()
const estado = () => JSON.parse(CA.serializa(RT.creaReto({ motor: CA.crea({ pares: ['EURUSD'], costes: COSTES_1, capital: '100000' }), inicio: 1736121600, reglas: RT.SUITE_1F })))
const crea = (d, k = 2) => m.rpc(d)('sim_crear_sesion', { p_actor: u(1), p_session_id: u(k), p_command_id: u(k + 100), p_sobre: JSON.stringify({ tipo: 'crear', k }), p_epoca: 1, p_sesion: { name: 'inventada', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '1F' }, p_estado: estado(), p_mercado: { EURUSD: 'EURUSD@v1.1:' + 'a'.repeat(64) }, p_resumen: {} })
const http = r => r?.data?.http ?? (r?.error?.code || JSON.stringify(r?.error ?? r).slice(0, 60))
const QUITA = 'pgx, anon, authenticated, service_role, PUBLIC'
try {
  m.arranca()
  let n = 0
  const base = () => { const d = m.base(`e4${++n}`); const p = m.comoEjecutor(d, lee('sql/sim-004a-puerta.sql')); if (!p.ok) throw new Error('puerta: ' + p.err); return d }
  const aplica = d => m.comoEjecutor(d, S4B)
  const s16 = d => m.comoEjecutor(d, `begin read only;\n${S16}\nrollback;`)
  const veredicto = q => (q.out.split('\n').find(l => l.startsWith('veredicto|')) ?? '').split('|')[1] ?? ''
  const req = (q, o) => q.out.split('\n').find(l => l.startsWith(`requisito|${o}|`)) ?? ''
  const nueva = despues => { const d = base(); if (despues) { const r = aplica(d); if (!r.ok) throw new Error('control: sim-004b no aplica: ' + err1(r)) } m.alumno(d, u(1)); m.alumno(d, u(9)); return d }
  const caso = (fam, nombre, objeto, d, cuando) => {
    const q = s16(d), r = aplica(d)
    oraculo(fam, `${nombre} (${cuando}): s16 DIFIERE en «${objeto}» y veredicto DIFIEREN; sim-004b aborta nombrandolo`,
      q.ok && req(q, objeto).endsWith(' · DIFIERE') && /^DIFIEREN \d+$/.test(veredicto(q)) && !r.ok && err1(r).startsWith('sim-004b: roles o esquemas que cambian el acceso') && err1(r).includes(objeto),
      `${req(q, objeto).slice(0, 170)} · ${r.ok ? 'sim-004b APLICA' : err1(r).slice(0, 120)}`)
  }

  titulo('el positivo')
  for (const despues of [false, true]) {
    const d = nueva(despues), q = s16(d)
    ver(`control: limpio ${despues ? 'con sim-004b aplicada' : 'antes de sim-004b'}: «permiso en profiles» y «pertenencias del alumno» coinciden, s16 OK y sim-004b ${despues ? 'se reejecuta' : 'aplica'}`,
      req(q, 'permiso en profiles').endsWith('SELECT(id, plan, simulador_activo)=true · UPDATE en alguna columna (FOR KEY SHARE)=true · coincide') && req(q, 'pertenencias del alumno').endsWith('|ninguna · coincide') && veredicto(q) === 'OK' && aplica(d).ok,
      [req(q, 'permiso en profiles'), req(q, 'pertenencias del alumno')].join(' / '))
  }

  titulo('E3R4-01: el permiso del dueño de las RPC en profiles (DDL ordinario, como el dueño)')
  const PERFIL = [
    ['sin SELECT en profiles', `revoke select on public.profiles from ${QUITA};`, 'grant select on public.profiles to pgx;'],
    ['sin UPDATE en profiles (FOR KEY SHARE)', `revoke update on public.profiles from ${QUITA};`, 'grant update on public.profiles to pgx;'],
    ['SELECT por columna, sin «plan»', `revoke select on public.profiles from ${QUITA}; grant select (id, simulador_activo) on public.profiles to pgx;`, 'grant select (plan) on public.profiles to pgx;'],
  ]
  for (const [nombre, quita] of PERFIL) for (const despues of [false, true]) {
    const d = nueva(despues), mu = m.comoEjecutor(d, quita)
    if (!mu.ok) { oraculo('E3R4-01', `${nombre}: el mutante se aplica`, false, err1(mu)); continue }
    caso('E3R4-01', nombre, 'permiso en profiles', d, despues ? 'reejecucion' : 'primera aplicacion')
  }
  for (const [nombre, quita, devuelve] of PERFIL) {
    const d = nueva(true)
    m.comoEjecutor(d, quita)
    const c1 = await crea(d, 2)
    m.comoEjecutor(d, devuelve)
    const c2 = await crea(d, 3)
    ver(`control funcional (Astra): ${nombre} → crear da 42501; devolviendo solo ese permiso al dueño, 201`, /42501/.test(JSON.stringify(c1)) && http(c2) === 201, `${JSON.stringify(c1).slice(0, 80)} / ${http(c2)}`)
  }
  {
    const d = nueva(true)
    m.comoEjecutor(d, `revoke update on public.profiles from ${QUITA}; grant update (plan) on public.profiles to pgx;`)
    const q = s16(d), c = await crea(d, 2)
    ver('control: con UPDATE solo en una columna (plan), el requisito coincide, s16 OK y crear da 201: no pide mas de lo necesario', req(q, 'permiso en profiles').endsWith(' · coincide') && veredicto(q) === 'OK' && http(c) === 201, `${req(q, 'permiso en profiles').slice(-60)} · ${http(c)}`)
  }

  titulo('E3R4-02: las pertenencias del alumno (directa o en cadena, con SET o con INHERIT)')
  const tieneSet = d => m.uno(d, "select pg_has_role('authenticated', 'service_role', 'MEMBER') or pg_has_role('anon', 'service_role', 'MEMBER') or exists (select 1 from pg_roles where rolname in ('x_paso', 'x_salto', 'x_perfil'))")
  const PERTENENCIA = [
    // [nombre, otorga, quita, como superusuario]
    ['authenticated → service_role, directo, SET sin INHERIT (Astra)', 'grant service_role to authenticated with inherit false, set true;', 'revoke service_role from authenticated;', false],
    ['authenticated → x_paso → service_role, dos saltos sin INHERIT (Astra)', 'create role x_paso nologin; grant service_role to x_paso with inherit false, set true; grant x_paso to authenticated with inherit false, set true;', 'revoke x_paso from authenticated; revoke service_role from x_paso; drop role x_paso;', false],
    // (anon → pgx no se puede en el montaje: pgx ya es miembro de anon, y seria circular)
    ['anon → service_role, con INHERIT y sin SET', 'grant service_role to anon with inherit true, set false;', 'revoke service_role from anon;', false],
    ['authenticated → x_salto (nuevo, BYPASSRLS), SET sin INHERIT', 'create role x_salto nologin bypassrls; grant x_salto to authenticated with inherit false, set true;', 'revoke x_salto from authenticated; drop role x_salto;', true],
    // RE5-01 (revisor interno de 4c522cb): profiles con otro dueño, y authenticated miembro suyo con INHERIT (actua como dueño)
    ['RE5-01 · authenticated → x_perfil (nuevo dueño de profiles), con INHERIT', 'create role x_perfil nologin; alter table public.profiles owner to x_perfil; grant select, update on public.profiles to pgx; grant x_perfil to authenticated with inherit true, set false;', 'revoke x_perfil from authenticated; alter table public.profiles owner to pgx; drop owned by x_perfil; drop role x_perfil;', true],
  ]
  for (const [nombre, otorga, quita, su] of PERTENENCIA) for (const despues of [false, true]) {
    const d = nueva(despues)
    const ej = sql => (su ? m.pg.psql(sql, d) : m.comoEjecutor(d, sql))
    const mu = ej(otorga)
    try {
      if (!mu.ok) { oraculo('E3R4-02', `${nombre}: el mutante se aplica`, false, err1(mu)); continue }
      caso('E3R4-02', nombre, 'pertenencias del alumno', d, despues ? 'reejecucion' : 'primera aplicacion')
    } finally { ej(quita); ver(`control: tras «${nombre}», la limpieza por el mismo otorgante deja sin pertenencia`, tieneSet(d) === 'f') }
  }
  titulo('E3R5-01 (Astra r5): el alumno que ES el dueño directo de una dependencia externa')
  // el cambio de dueño, por DDL ordinario como lo prepara Astra: CREATE temporal en public al destinatario y el ALTER como el
  // ejecutor (miembro del destinatario); auth.users y auth.uid(), como superusuario (en el montaje los posee postgres)
  const DUENO = [
    ['authenticated, dueño directo de profiles', d => { m.pg.psql('grant create on schema public to authenticated;', d); const r = m.comoEjecutor(d, 'alter table public.profiles owner to authenticated;'); m.pg.psql('revoke create on schema public from authenticated;', d); return r }],
    ['anon, dueño directo de profiles', d => { m.pg.psql('grant create on schema public to anon;', d); const r = m.comoEjecutor(d, 'alter table public.profiles owner to anon;'); m.pg.psql('revoke create on schema public from anon;', d); return r }],
    ['authenticated, dueño directo de auth.users', d => m.pg.psql('alter table auth.users owner to authenticated;', d)],
    ['authenticated, dueño directo de auth.uid() (control: tambien lo ve la ficha de la funcion ajena)', d => m.pg.psql('alter function auth.uid() owner to authenticated;', d)],
  ]
  for (const [nombre, pon] of DUENO) for (const despues of [false, true]) {
    const d = nueva(despues), mu = pon(d)
    if (!mu.ok) { oraculo('E3R5-01', `${nombre}: el mutante se aplica`, false, err1(mu)); continue }
    caso('E3R5-01', nombre, 'pertenencias del alumno', d, despues ? 'reejecucion' : 'primera aplicacion')
  }
  {
    // lectura y escritura cruzadas sinteticas: u9, como authenticated, lee y cambia el perfil de u1
    const cruza = d => m.pg.psql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${u(9)}', true); select 'lee=' || count(*) from public.profiles where id = '${u(1)}'; update public.profiles set simulador_activo = true where id = '${u(1)}'; select 'cambia=' || count(*) from public.profiles where id = '${u(1)}' and simulador_activo; rollback;`, d)
    const d0 = nueva(true), d1 = nueva(true)
    DUENO[0][1](d1)
    const c0 = cruza(d0), c1 = cruza(d1)
    ver('control funcional: con authenticated dueño de profiles, u9 lee y cambia el perfil de u1; limpio, no lo ve ni lo cambia', c1.ok && c1.out.includes('lee=1') && c1.out.includes('cambia=1') && (!c0.ok || (c0.out.includes('lee=0') && !c0.out.includes('cambia=1'))), `${c1.out.replace(/\n/g, ' ').slice(-40)} / ${(c0.out + err1(c0)).replace(/\n/g, ' ').slice(-60)}`)
  }
  {
    // el control funcional de Astra: u9, como authenticated, con y sin la pertenencia
    const lee9 = d => m.pg.psql(`begin; set local session authorization authenticated; select set_config('request.jwt.claim.sub', '${u(9)}', true); select 'antes=' || count(*) from public.sim_recibos; set local role service_role; select 'despues=' || count(*) from public.sim_recibos; rollback;`, d)
    const d0 = nueva(true), d1 = nueva(true)
    await crea(d0, 2); await crea(d1, 2)
    m.comoEjecutor(d1, PERTENENCIA[0][1])
    let l1
    try { l1 = lee9(d1) } finally { m.comoEjecutor(d1, PERTENENCIA[0][2]) }
    const l0 = lee9(d0)
    ver('control funcional (Astra): con la pertenencia, u9 lee 0 y tras SET ROLE service_role, el recibo de u1; limpio, SET ROLE falla', l1.out.includes('antes=0') && l1.out.includes('despues=1') && !l0.ok && /permission denied to set role/.test(l0.err), `${l1.out.replace(/\n/g, ' ').slice(-40)} / ${err1(l0).slice(0, 60)}`)
  }
} finally { m.cierra() }
fin()
