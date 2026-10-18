/**
 * ETAPA 3 · ronda 4 · RE3-01 (revisor interno de c4d46e3; CTO 17-oct, orden 1-010, opcion (a) ampliada): los ajustes que
 * cambian la semantica sin tocar el catalogo. session_replication_role = replica apaga los disparadores (tambien los de las
 * FK: el borrado deja recibos) y row_security = off cambia la RLS. La s16 los exige como requisito y sim-004b aborta:
 * efectivos origin y on, y ninguno fijado en pg_db_role_setting para la base o para los roles que ejecutan (postgres,
 * authenticator, authenticated, anon, service_role y el ejecutor). Solo por NOMBRE: ningun valor se lee ni se imprime.
 * Rojo previo contra cf443e6.
 *
 * Contra PostgreSQL 17 local (montaje-v1, con la puerta), en primera aplicacion y en reejecucion:
 *   · ALTER DATABASE … SET de cada uno;
 *   · ALTER ROLE … SET de cada uno para cada rol que ejecuta (y el ejecutor del montaje, pgx, que en produccion es postgres);
 *   · SET en la sesion del ejecutor (session_replication_role con GRANT SET ON PARAMETER, como lo tendria un no superusuario);
 *   · el control funcional: con session_replication_role = replica en la base, borrar el alumno da 200 y deja recibos;
 *     limpio, 0 recibos.
 *   · RE4-01 (revisor interno de d2910e6): anon y authenticated sin BYPASSRLS ni superusuario, y el USAGE de los esquemas;
 *     control funcional: con authenticated BYPASSRLS, un alumno ve lo de otro.
 * Los ALTER ROLE son de todo el cluster del montaje: cada caso los deshace al acabar.
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
const crea = d => m.rpc(d)('sim_crear_sesion', { p_actor: u(1), p_session_id: u(2), p_command_id: u(3), p_sobre: '{"tipo":"crear"}', p_epoca: 1, p_sesion: { name: 'inventada', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '1F' }, p_estado: estado(), p_mercado: { EURUSD: 'EURUSD@v1.1:' + 'a'.repeat(64) }, p_resumen: {} })
const http = r => r?.data?.http ?? (r?.error?.code || JSON.stringify(r?.error ?? r).slice(0, 60))
try {
  m.arranca()
  m.pg.psql("do $r$ begin if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit login; end if; end $r$;", 'postgres')
  let n = 0
  const base = () => { const d = m.base(`aj${++n}`); const p = m.comoEjecutor(d, lee('sql/sim-004a-puerta.sql')); if (!p.ok) throw new Error('puerta: ' + p.err); return d }
  const aplica = (d, pre = '') => m.comoEjecutor(d, pre + S4B)
  const s16 = (d, pre = '') => m.comoEjecutor(d, `begin read only;\n${pre}${S16}\nrollback;`)
  const veredicto = q => (q.out.split('\n').find(l => l.startsWith('veredicto|')) ?? '').split('|')[1] ?? ''
  const requisitos = q => q.out.split('\n').filter(l => /^requisito\|(session_replication_role|row_security)\|/.test(l))
  const nueva = despues => { const d = base(); if (despues) { const r = aplica(d); if (!r.ok) throw new Error('control: sim-004b no aplica: ' + err1(r)) } m.alumno(d, u(1)); return d }

  titulo('el positivo')
  for (const despues of [false, true]) {
    const d = nueva(despues)
    const q = s16(d), rq = requisitos(q)
    ver(`control: limpio ${despues ? 'con sim-004b aplicada' : 'antes de sim-004b'}: los dos requisitos coinciden («fijado en: ninguno»), s16 OK y sim-004b ${despues ? 'se reejecuta' : 'aplica'}`,
      rq.length === 2 && rq.every(l => l.endsWith('fijado en pg_db_role_setting: ninguno · coincide')) && veredicto(q) === 'OK' && aplica(d).ok, rq.join(' / '))
  }
  ver('control: ningun valor de pg_db_role_setting en la s16 ni en sim-004b (solo el nombre: split_part(…, \'=\', 1))',
    [S16, S4B].every(t => (t.match(/pg_db_role_setting s /g) || []).length === 1 && /split_part\(c\.x, '=', 1\) in \('session_replication_role', 'row_security'\)/.test(t) && !/split_part\(c\.x, '=', 2\)/.test(t)))

  titulo('cada mutante: s16 DIFIEREN (en su requisito) y sim-004b aborta nombrandolo')
  const ROLES = ['postgres', 'authenticator', 'authenticated', 'anon', 'service_role', 'pgx']
  const VALOR = { session_replication_role: 'replica', row_security: 'off' }
  const CASOS = []
  for (const g of Object.keys(VALOR)) {
    CASOS.push([`ALTER DATABASE … SET ${g} = ${VALOR[g]}`, g, d => `alter database ${d} set ${g} = ${VALOR[g]};`, d => `alter database ${d} reset ${g};`])
    for (const r of ROLES) CASOS.push([`ALTER ROLE ${r} SET ${g} = ${VALOR[g]}`, g, () => `alter role ${r} set ${g} = ${VALOR[g]};`, () => `alter role ${r} reset ${g};`])
  }
  ver('control: 2 ajustes × (la base y 6 roles) = 14 casos', CASOS.length === 14)
  for (const [nombre, g, pon, quita] of CASOS) {
    for (const despues of [false, true]) {
      const d = nueva(despues)
      const cuando = despues ? 'reejecucion' : 'primera aplicacion'
      const mu = m.pg.psql(pon(d), 'postgres')
      try {
        if (!mu.ok) { oraculo('AJ', `${nombre} (${cuando}): el mutante se aplica`, false, err1(mu)); continue }
        const q = s16(d), rq = requisitos(q).find(l => l.startsWith(`requisito|${g}|`)) ?? ''
        const r = aplica(d)
        oraculo('AJ', `${nombre} (${cuando}): s16 DIFIERE en «${g}» y veredicto DIFIEREN; sim-004b aborta nombrandolo`,
          q.ok && rq.endsWith(' · DIFIERE') && /^DIFIEREN \d+$/.test(veredicto(q)) && !r.ok && err1(r).startsWith('sim-004b: ajustes que cambian la semantica (RE3-01)') && err1(r).includes(g),
          `${rq.slice(0, 140)} · ${r.ok ? 'sim-004b APLICA' : err1(r).slice(0, 140)}`)
      } finally { m.pg.psql(quita(d), 'postgres') }
    }
  }

  titulo('orden 1-011: ninguna clave pgrst.* fijada (s16g: hoy ninguna en produccion), y los roles miembros de authenticator')
  // un rol nuevo del que authenticator es miembro (al que PostgREST puede pasar) y otro miembro de authenticator
  m.pg.psql('create role sim_x nologin; grant sim_x to authenticator; create role sim_y nologin; grant authenticator to sim_y;', 'postgres')
  const C1011 = [
    ['ALTER ROLE authenticator SET pgrst.db_pre_request', 'pgrst.*', () => "alter role authenticator set pgrst.db_pre_request = 'public.x';", () => 'alter role authenticator reset pgrst.db_pre_request;'],
    ['ALTER DATABASE … SET pgrst.db_schemas', 'pgrst.*', d => `alter database ${d} set pgrst.db_schemas = 'public';`, d => `alter database ${d} reset pgrst.db_schemas;`],
    ['ALTER ROLE sim_x (authenticator es miembro) SET pgrst.db_pre_request', 'pgrst.*', () => "alter role sim_x set pgrst.db_pre_request = 'public.x';", () => 'alter role sim_x reset pgrst.db_pre_request;'],
    ['ALTER ROLE sim_x (authenticator es miembro) SET session_replication_role', 'session_replication_role', () => 'alter role sim_x set session_replication_role = replica;', () => 'alter role sim_x reset session_replication_role;'],
    ['ALTER ROLE sim_y (miembro de authenticator) SET row_security', 'row_security', () => 'alter role sim_y set row_security = off;', () => 'alter role sim_y reset row_security;'],
  ]
  for (const [nombre, g, pon, quita] of C1011) {
    for (const despues of [false, true]) {
      const d = nueva(despues)
      const cuando = despues ? 'reejecucion' : 'primera aplicacion'
      const mu = m.pg.psql(pon(d), 'postgres')
      try {
        if (!mu.ok) { oraculo('AJ', `${nombre} (${cuando}): el mutante se aplica`, false, err1(mu)); continue }
        const q = s16(d), rq = q.out.split('\n').find(l => l.startsWith(`requisito|${g}|`)) ?? ''
        const r = aplica(d)
        oraculo('AJ', `1-011 · ${nombre} (${cuando}): s16 DIFIERE en «${g}» y veredicto DIFIEREN; sim-004b aborta nombrandolo`,
          q.ok && rq.endsWith(' · DIFIERE') && /^DIFIEREN \d+$/.test(veredicto(q)) && !r.ok && err1(r).startsWith('sim-004b: ajustes que cambian la semantica (RE3-01)') && err1(r).includes(g) && !/public\.x|'public'/.test(q.out + r.err),
          `${rq.slice(0, 160)} · ${r.ok ? 'sim-004b APLICA' : err1(r).slice(0, 140)}`)
      } finally { m.pg.psql(quita(d), 'postgres') }
    }
  }
  {
    const d = nueva(true), q = s16(d)
    ver('control: con los roles nuevos sin ajustes, el requisito pgrst.* coincide («ninguno») y s16 OK', (q.out.split('\n').find(l => l.startsWith('requisito|pgrst.*|')) ?? '').endsWith('fijado en pg_db_role_setting: ninguno · coincide') && veredicto(q) === 'OK')
  }
  m.pg.psql('revoke sim_x from authenticator; revoke authenticator from sim_y; drop role sim_x; drop role sim_y;', 'postgres')

  titulo('el SET en la sesion del ejecutor')
  for (const [g, pre, prep, deshace] of [
    ['session_replication_role', 'set session_replication_role = replica;\n', 'grant set on parameter session_replication_role to pgx;', 'revoke set on parameter session_replication_role from pgx;'],
    ['row_security', 'set row_security = off;\n', 'select 1;', 'select 1;'],
  ]) {
    for (const despues of [false, true]) {
      const d = nueva(despues)
      const cuando = despues ? 'reejecucion' : 'primera aplicacion'
      m.pg.psql(prep, 'postgres')
      try {
        const q = s16(d, pre), rq = requisitos(q).find(l => l.startsWith(`requisito|${g}|`)) ?? ''
        const r = aplica(d, pre)
        oraculo('AJ', `SET ${g} en la sesion del ejecutor (${cuando}): s16 DIFIERE (efectivo) y sim-004b aborta`,
          q.ok && rq.includes('=false · fijado en pg_db_role_setting: ninguno · DIFIERE') && /^DIFIEREN \d+$/.test(veredicto(q)) && !r.ok && err1(r).startsWith('sim-004b: ajustes que cambian la semantica (RE3-01)') && err1(r).includes(g),
          `${rq.slice(0, 140)} · ${r.ok ? 'sim-004b APLICA' : err1(r).slice(0, 140)}`)
      } finally { m.pg.psql(deshace, 'postgres') }
    }
  }

  titulo('RE4-01 (revisor interno de d2910e6): los roles del alumno y el uso de los esquemas')
  const req = (q, o) => q.out.split('\n').find(l => l.startsWith(`requisito|${o}|`)) ?? ''
  {
    const d = nueva(true), q = s16(d)
    ver('control: limpio: «roles del alumno» (sin BYPASSRLS ni superusuario) y «uso de esquemas» coinciden', req(q, 'roles del alumno').endsWith('anon: superusuario=false bypassrls=false · authenticated: superusuario=false bypassrls=false · coincide') && req(q, 'uso de esquemas').endsWith(' · coincide') && !/=false/.test(req(q, 'uso de esquemas')), req(q, 'uso de esquemas'))
  }
  for (const [nombre, objeto, pon, quita] of [
    ['ALTER ROLE authenticated BYPASSRLS', 'roles del alumno', 'alter role authenticated bypassrls;', 'alter role authenticated nobypassrls;'],
    ['ALTER ROLE anon BYPASSRLS', 'roles del alumno', 'alter role anon bypassrls;', 'alter role anon nobypassrls;'],
    ['ALTER ROLE authenticated SUPERUSER', 'roles del alumno', 'alter role authenticated superuser;', 'alter role authenticated nosuperuser;'],
    ['REVOKE USAGE ON SCHEMA auth de authenticated (y de PUBLIC)', 'uso de esquemas', 'revoke usage on schema auth from authenticated, public;', 'grant usage on schema auth to authenticated;'],
  ]) {
    for (const despues of [false, true]) {
      const d = nueva(despues)
      const cuando = despues ? 'reejecucion' : 'primera aplicacion'
      const mu = m.pg.psql(pon, d)
      try {
        if (!mu.ok) { oraculo('AJ', `${nombre} (${cuando}): el mutante se aplica`, false, err1(mu)); continue }
        const q = s16(d), r = aplica(d)
        oraculo('AJ', `RE4-01 · ${nombre} (${cuando}): s16 DIFIERE en «${objeto}» y veredicto DIFIEREN; sim-004b aborta nombrandolo`,
          q.ok && req(q, objeto).endsWith(' · DIFIERE') && /^DIFIEREN \d+$/.test(veredicto(q)) && !r.ok && err1(r).startsWith('sim-004b: roles o esquemas que cambian el acceso (RE4-01') && err1(r).includes(objeto),
          `${req(q, objeto).slice(0, 150)} · ${r.ok ? 'sim-004b APLICA' : err1(r).slice(0, 120)}`)
      } finally { m.pg.psql(quita, d) }
    }
  }
  {
    // el caso del revisor: con BYPASSRLS, otro alumno (u9) lee la sesion y el recibo de u1
    const d = nueva(true)
    m.alumno(d, u(9)); await crea(d)
    const ve = () => m.pg.psql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${u(9)}', true); select 'sesiones=' || (select count(*) from public.sim_sessions) || ' recibos=' || (select count(*) from public.sim_recibos); rollback;`, d)
    const limpio = ve()
    m.pg.psql('alter role authenticated bypassrls;', d)
    let mutado
    try { mutado = ve() } finally { m.pg.psql('alter role authenticated nobypassrls;', d) }
    ver('control: con authenticated BYPASSRLS, el alumno u9 ve la sesion y el recibo de u1; limpio, nada', limpio.out.includes('sesiones=0 recibos=0') && mutado.out.includes('sesiones=1 recibos=1'), `${limpio.out.slice(-25)} / ${mutado.out.slice(-25)}`)
  }

  titulo('control funcional: session_replication_role = replica en la base y el borrado')
  {
    const d0 = nueva(true), d1 = nueva(true)
    m.pg.psql(`alter database ${d1} set session_replication_role = replica;`, 'postgres')
    try {
      const resto = async d => { await crea(d); const r = await m.rpc(d)('sim_borrar_alumno', { p_user_id: u(1) }); return [http(r), m.uno(d, 'select count(*) from public.sim_sessions'), m.uno(d, 'select count(*) from public.sim_recibos')].join(' ') }
      const r0 = await resto(d0), r1 = await resto(d1)
      ver('control: con replica en la base, borrar el alumno da 200 y deja recibos; limpio, 200 y 0 recibos', r0 === '200 0 0' && /^200 0 [1-9]/.test(r1), `${r0} / ${r1}`)
    } finally { m.pg.psql(`alter database ${d1} reset session_replication_role;`, 'postgres') }
  }
} finally { m.cierra() }
fin()
