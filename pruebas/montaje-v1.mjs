// EL MONTAJE DE LAS PRUEBAS DE LA ETAPA 3 CONTRA LAS RPC REALES (diseño sim-004 e.4
// y q.1). PostgreSQL 17 local desechable (pg-ensayo.mjs, solo socket): produccion
// segun s04 LITERAL (estado-s04.mjs) + sim-002 + sim-003 + la preparatoria de
// sim-004a, aplicadas por un ejecutor como el postgres de produccion segun s06 (no
// superusuario, bypassrls, dueño de public). Lo mismo que esta APLICADO hoy.
// Datos INVENTADOS. Nada toca Supabase.
//
//   const m = montajeV1(); m.arranca(); m.base('d1')       (una base nueva)
//   m.alumno('d1', id, { simulador_activo, plan })            perfil inventado
//   m.rpc('d1')(nombre, args)                                  la RPC como service_role,
//       con la forma de supabase-js: { data, error: { code, message } | null }
//   m.uno('d1', sql)                                           una lectura como superusuario
//   m.comoEjecutor('d1', texto)                                un fichero SQL como el ejecutor de s06 → { ok, out, err }
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { REPO } from './lib.mjs'
import { BIN, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'

const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S2 = lee('sql/sim-002-lectura-estable.sql'), S3 = lee('sql/sim-003-persistencia-aditiva.sql'), PREP = lee('sql/sim-004a-preparatoria.sql')
const EJECUTOR = `
do $r$ begin if not exists (select 1 from pg_roles where rolname = 'pgx') then
  create role pgx login nosuperuser bypassrls createrole inherit; end if; end $r$;
grant anon, authenticated, service_role to pgx with admin option;
grant usage, create on schema public to pgx;
grant usage on schema auth, extensions to pgx;
-- RINV3-01 (CTO 17-oct): el search_path del editor de Supabase (s04: "$user", public, extensions); sin normalizar,
-- los textos de la s16 dependen de el
alter role pgx set search_path = "$user", public, extensions;
do $$ declare r record; begin
  for r in select c.oid::regclass t from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','p','v','m') loop
    execute format('alter table %s owner to pgx', r.t); end loop;
  for r in select p.oid::regprocedure f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('alter function %s owner to pgx', r.f); end loop;
end $$;
alter default privileges for role pgx in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role pgx in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role pgx in schema public grant all on functions to anon, authenticated, service_role;`
// un literal SQL sin tipo (la funcion le da el suyo por el nombre del parametro)
export const L = v => (v == null ? 'NULL' : `'${(typeof v === 'object' ? JSON.stringify(v) : String(v)).replace(/'/g, "''")}'`)

// R3E3B-02 (CTO 17-oct): sim-004b y s16 acreditan la ficha de auth.uid() MEDIDA en produccion (s16b, 17-oct). El
// auth.uid() del montaje (pg-ensayo) no puede ser ese: su cuerpo de Supabase no se conoce y su dueño es otro. Esta es la
// UNICA adaptacion del montaje: cambia en el texto del SQL esa ficha por la del montaje (exactamente una vez; si no, falla).
// pruebas/sim-004b-inventario.mjs comprueba que la ficha del montaje es esta, en vivo, y que la de produccion es la literal
export const FICHA_UID_PRODUCCION = (() => {
  const t = readFileSync(path.join(REPO, 'sql/consultas/salidas/s16b-catalogo-tablas-sim004b-2026-10-17.csv'), 'utf8').replace(/\r/g, '')
  const l = t.split('\n').find(x => x.startsWith('funcion,auth.uid(),'))
  return l ? l.slice('funcion,auth.uid(),'.length) : null
})()
export const FICHA_UID_MONTAJE = 'functiondef md5=ac095177defffa16dd5af59ee5bbd056 · prosrc md5=766254a986338dc8e8c4a4ce3985441a · probin=- · lenguaje=sql · dueño=postgres · prosecdef=false · provolatile=s · proconfig=- · proisstrict=false · proleakproof=false · proparallel=u · prokind=f · proretset=false · prorettype=uuid · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=100 · prorows=0'
export function conUidDelMontaje(texto) {
  const de = `('auth.uid()', '${FICHA_UID_PRODUCCION}')`, a = `('auth.uid()', '${FICHA_UID_MONTAJE}')`
  if (!FICHA_UID_PRODUCCION || texto.split(de).length !== 2) throw new Error('conUidDelMontaje: la ficha de produccion de auth.uid() no esta exactamente una vez en el SQL')
  return texto.replace(de, a)
}

// La s16 lleva su propia transaccion READ ONLY (BEGIN READ ONLY … ROLLBACK, con guarda; orden 1-027, D2). Las pruebas que
// la meten en una transaccion suya (READ ONLY, o con un desvio y SET TRANSACTION READ ONLY) usan el cuerpo: la SELECT,
// sin las dos lineas de la envoltura. Si la envoltura no esta exactamente asi, revienta: nunca mide otra cosa en silencio.
export function sinEnvoltura(texto) {
  const hasta = /\nrollback;\n?$/
  if ((texto.match(/^begin read only;$/gm) || []).length !== 1 || !hasta.test(texto)) throw new Error('sinEnvoltura: la envoltura BEGIN READ ONLY … ROLLBACK no esta exactamente una vez')
  return texto.replace(/^begin read only;\n/m, '').replace(hasta, '\n')
}

export function montajeV1() {
  const pg = cluster()
  const pgx = (texto, db) => {
    const f = path.join(pg.dir, 'x.sql'); writeFileSync(f, texto)
    const r = spawnSync(path.join(BIN, 'psql'), ['-h', pg.dir, '-p', pg.puerto, '-U', 'pgx', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', f],
      { encoding: 'utf8', env: { PATH: process.env.PATH, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } })
    return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
  }
  function base(db) {
    // RINV-01 (CTO 17-oct): en produccion el ejecutor (postgres) es el dueño de las 14 tablas (s04, s16c). En el montaje
    // lo hace EJECUTOR (arriba): pasa TODAS las tablas de public a pgx (RINV2-06: un paso aparte que lo repetia, quitado)
    const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(PRODUCCION, db), pg.psql(S2, db), pg.psql(EJECUTOR, db), pgx(S3, db), pgx(PREP, db)]
    const malo = pasos.find(x => !x.ok)
    if (malo) throw new Error(`montaje ${db}: ${malo.err.split('\n').find(l => /ERROR/.test(l)) ?? malo.err}`)
    return db
  }
  const uno = (db, q) => { const r = pg.psql(q, db); if (!r.ok) throw new Error(r.err); return r.out }
  function alumno(db, id, { simulador_activo = true, plan = 'basic', rol_global = 'user' } = {}) {
    uno(db, `insert into auth.users values (${L(id)}) on conflict do nothing;
insert into public.profiles (id, email, plan, simulador_activo, rol_global) values (${L(id)}, ${L(id.slice(-12) + '@ejemplo.test')}, ${L(plan)}, ${simulador_activo}, ${L(rol_global)})
  on conflict (id) do update set plan = excluded.plan, simulador_activo = excluded.simulador_activo, rol_global = excluded.rol_global;`)
  }
  // la RPC como la llama supabase-js con service_role (notacion con nombre)
  const rpc = db => async (nombre, args = {}) => {
    const lista = Object.entries(args).map(([k, v]) => `${k} => ${L(v)}`).join(', ')
    const r = pg.psql(`\\set VERBOSITY sqlstate\nbegin; set local role service_role;\nselect public.${nombre}(${lista})::text;\ncommit;`, db)
    if (!r.ok) {
      const code = /ERROR:\s+([0-9A-Z]{5})/.exec(r.err)?.[1] ?? 'XX000'
      return { data: null, error: { code, message: `error de SQL ${code}` } }
    }
    const linea = r.out.split('\n').filter(l => l && !/^(BEGIN|SET|COMMIT)$/.test(l)).at(-1)
    return { data: JSON.parse(linea), error: null }
  }
  return { pg, base, uno, alumno, rpc, comoEjecutor: (db, texto) => pgx(texto, db), arranca: () => pg.arranca(), cierra: () => pg.cierra() }
}
