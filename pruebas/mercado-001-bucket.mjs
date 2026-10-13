/**
 * MERCADO-001 (EL BUCKET PRIVADO «mercado») Y S14 · ENSAYO EN POSTGRESQL 17 LOCAL
 * (etapa 2; diseño sim-004 p.7–p.8; CTO 13-oct: sin politicas ni grants de Storage;
 * Astra E2-01 y CTO 14-oct: lista blanca que falla cerrada + sonda empirica)
 *
 * Montaje: produccion segun s04 LITERAL (storage.buckets con forex-data publico,
 * storage.objects con RLS y SIN politicas), con las columnas reales de
 * storage.objects que leen s14 y la sonda (metadata, updated_at, owner, owner_id).
 * En las casillas de la sonda, ademas, los grants de Supabase a anon y
 * authenticated sobre storage (condicion del escenario, como en la prueba de
 * Astra). Datos inventados.
 *   1 limpio: crea el bucket privado (5 MB, sin tipos MIME), el informe acaba en
 *     FIN; segunda ejecucion: no toca nada; ni politicas ni grants nuevos
 *   2 guardas, cada una en rojo y SIN crear nada: bucket mercado con otra forma,
 *     RLS apagada
 *   3 CAPA 1, lista blanca: NEGATIVOS permanentes (los dos de Astra —IS FALSE y
 *     CASE—, sus variantes en WITH CHECK, OR, NOT y otras formas no
 *     reconocidas) abortan y s14 los marca NO RECONOCIDA; POSITIVOS (las formas
 *     admitidas) aplican y s14 dice «reconocida: solo <bucket>»; el clasificador
 *     es identico en los dos ficheros
 *   4 CAPA 2, sonda: con la capa 1 anulada (mutante de prueba), cada politica
 *     abierta (IS FALSE, CASE, UPDATE, DELETE, la del dueño) aborta por la sonda;
 *     un disparador por sentencia en DELETE la deja «no concluyente»; sin grants
 *     no alcanza; el centinela no queda y el rol vuelve; como el postgres no
 *     superusuario de s06 tambien aplica
 *   5 s14: una sola SELECT, en READ ONLY; antes («NO EXISTE», politicas con su
 *     veredicto y su texto, UUID enmascarados, disparadores) y despues (privado,
 *     trozos por par, puntero, cerrojo); sin nombres de objetos de otros buckets
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const M1 = lee('sql/mercado-001-bucket.sql')
const S14 = lee('sql/consultas/s14-mercado-storage.sql')
const pg = cluster()
const REALES = `alter table storage.objects add column metadata jsonb, add column updated_at timestamptz default now(), add column owner uuid, add column owner_id text;`
// los grants de Supabase sobre storage a anon y authenticated (condicion del escenario)
const SUPA = `grant usage on schema storage to anon, authenticated; grant all on storage.objects, storage.buckets to anon, authenticated;`
// el postgres de produccion segun s06: no superusuario, bypassrls, miembro de anon y authenticated
const PGX = `do $r$ begin if not exists (select 1 from pg_roles where rolname = 'pgx') then create role pgx login nosuperuser bypassrls createrole inherit; end if; end $r$;
grant anon, authenticated, service_role to pgx with admin option;
grant usage on schema storage, auth to pgx; grant all on storage.objects, storage.buckets to pgx;`
let n = 0
const monta = (extra = '') => {
  const db = `m${++n}`
  const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(PRODUCCION, db), pg.psql(REALES, db), ...(extra ? [pg.psql(extra, db)] : [])]
  if (!pasos.every(x => x.ok)) throw new Error(`montaje ${db}: ${pasos.map(x => x.err).join(' ')}`)
  return db
}
const comoPgx = (texto, db) => {
  const f = path.join(pg.dir, 'x.sql'); writeFileSync(f, texto)
  const r = spawnSync(path.join(BIN, 'psql'), ['-h', pg.dir, '-p', pg.puerto, '-U', 'pgx', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', f],
    { encoding: 'utf8', env: { PATH: process.env.PATH, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } })
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}
const estado = db => pg.psql(`select coalesce(string_agg(id || ':' || public || ':' || coalesce(file_size_limit::text, '-') || ':' || coalesce(allowed_mime_types::text, '-'), ',' order by id), '') from storage.buckets;
select count(*) || ':' || coalesce(string_agg(policyname, ',' order by policyname), '') from pg_policies where schemaname = 'storage';
select coalesce(string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type), '') from information_schema.role_table_grants where table_schema = 'storage';
select count(*) from storage.objects;`, db).out
const s14 = db => pg.psql(`begin read only;\n${S14}\nrollback;`, db)
const err1 = r => (r.err.split('\n').find(l => /ERROR/.test(l)) || r.err.split('\n')[0] || '').replace(/^.*ERROR:\s+/, '')

// la capa 1 anulada: el mutante de prueba que deja ver la capa 2 sola
const RAISE_CAPA1 = /raise exception 'mercado-001: politicas de storage\.objects NO RECONOCIDAS[^']*', malas;/
const M1sinCapa1 = M1.replace(RAISE_CAPA1, 'null;')

try {
  pg.arranca()
  ver('el mutante sin capa 1 cambia exactamente el raise de la lista blanca', M1sinCapa1 !== M1 && M1sinCapa1.length < M1.length && !/NO RECONOCIDAS \(podrian/.test(M1sinCapa1))

  titulo('1 · limpio: crea el bucket privado; segunda ejecucion, nada')
  const d1 = monta(SUPA)
  const antes = estado(d1)
  const r1 = pg.psql(M1, d1)
  const despues = estado(d1)
  oraculo('M001', 'aplica: el informe dice el bucket privado de 5 MB, la RLS, la sonda y acaba en FIN', r1.ok && /bucket\|mercado · public=false · file_size_limit=5242880 · allowed_mime_types=-/.test(r1.out) && /rls\|storage.objects · rls=true/.test(r1.out) && /sonda\|anon y authenticated no alcanzan/.test(r1.out) && /objetos en mercado\|0/.test(r1.out) && /FIN\|mercado-001 aplicada$/.test(r1.out), r1.err || r1.out)
  oraculo('M001', 'storage.buckets: forex-data igual y mercado privado, 5 MB, sin tipos MIME; ni politicas ni grants nuevos; ningun objeto (el centinela no queda)', despues.split('\n')[0] === 'forex-data:true:-:-,mercado:false:5242880:-' && despues.split('\n').slice(1).join('|') === antes.split('\n').slice(1).join('|'), `${antes} → ${despues}`)
  const r1b = pg.psql(M1, d1)
  oraculo('M001', 'segunda ejecucion: termina bien, dice que ya estaba y no cambia nada', r1b.ok && /ya existe con esta forma/.test(r1b.err) && estado(d1) === despues, r1b.err)
  oraculo('M001', 'el SQL no crea ni cambia politicas ni grants (fuera comentarios)', !/\b(create|alter|drop)\s+policy\b|\bgrant\b|\brevoke\b/i.test(M1.replace(/--.*$/gm, '')))

  titulo('2 · guardas de forma y de RLS: abortan sin crear nada')
  const guardas = [
    ['un bucket mercado PUBLICO', `insert into storage.buckets (id, name, public) values ('mercado', 'mercado', true);`, /otra forma/],
    ['un bucket mercado con otro limite', `insert into storage.buckets (id, name, public, file_size_limit) values ('mercado', 'mercado', false, 1000);`, /otra forma/],
    ['un bucket con nombre mercado y otro id', `insert into storage.buckets (id, name, public, file_size_limit) values ('mercado2', 'mercado', false, 5242880);`, /otra forma/],
    ['la RLS de storage.objects apagada', `alter table storage.objects disable row level security;`, /RLS de storage.objects esta apagada/],
  ]
  for (const [que, sql, error] of guardas) {
    const d = monta(sql)
    const a = estado(d)
    const r = pg.psql(M1, d)
    oraculo('M001', `aborta con ${que}: mensaje «mercado-001:» y nada cambia`, !r.ok && /mercado-001:/.test(r.err) && error.test(r.err) && estado(d) === a, err1(r))
  }

  titulo('3 · capa 1, lista blanca: negativos (abortan; s14 NO RECONOCIDA) y positivos')
  // [nombre, politica]; los dos primeros, los de Astra (sql-adversario.mjs) tal cual
  const NEGATIVOS = [
    ['astra-is-false', `for select to public using ((bucket_id = 'forex-data') is false)`],
    ['astra-case', `for select to public using (case when bucket_id = 'forex-data' then true else true end)`],
    ['wc-is-false', `for insert to public with check ((bucket_id = 'forex-data') is false)`],
    ['wc-case', `for insert to public with check (case when bucket_id = 'forex-data' then true else true end)`],
    ['wc-or-en-update', `for update to public using (bucket_id = 'forex-data') with check (bucket_id = 'forex-data' or true)`],
    ['wc-not-en-all', `for all to public using (bucket_id = 'forex-data') with check (not (bucket_id <> 'forex-data'))`],
    ['or', `for select to public using (bucket_id = 'forex-data' or bucket_id = 'otro')`],
    ['or-con-and', `for select to public using (bucket_id = 'forex-data' and owner = auth.uid() or true)`],
    ['not', `for select to public using (not (bucket_id <> 'forex-data'))`],
    ['is-not-true', `for select to public using ((bucket_id = 'forex-data') is not true)`],
    ['coalesce', `for select to public using (coalesce(bucket_id = 'forex-data', true))`],
    ['funcion', `for select to public using (lower(bucket_id) = 'forex-data')`],
    ['subconsulta', `for select to public using (bucket_id = (select 'forex-data'))`],
    ['al-reves', `for select to public using ('forex-data' = bucket_id)`],
    ['any', `for select to public using (bucket_id = any (array['forex-data', 'otro']))`],
    ['collate', `for select to public using (bucket_id = 'forex-data' collate "C")`],
    ['and-anidado', `for select to public using (owner = auth.uid() and (name like 'a%' and bucket_id = 'forex-data'))`],
    ['true', `for select to authenticated using (true)`],
    ['sin-bucket', `for insert to authenticated with check (owner = auth.uid())`],
    ['nombra-mercado', `for select to authenticated using (bucket_id = 'mercado')`],
    ['mercado-en-otro-termino', `for select to public using (bucket_id = 'forex-data' and name <> 'mercado')`],
    ['sin-using', `for select to public`],
    ['restrictiva', `as restrictive for select to public using (auth.uid() is not null)`],
    ['comillas-en-el-literal', `for select to public using (bucket_id = 'it''s')`],
  ]
  for (const [nombre, def] of NEGATIVOS) {
    const d = monta(`create policy "${nombre}" on storage.objects ${def};`)
    const a = estado(d)
    const r = pg.psql(M1, d)
    const q = s14(d)
    oraculo('E2-01', `negativo ${nombre}: mercado-001 aborta nombrandola y nada cambia; s14 la marca NO RECONOCIDA`,
      !r.ok && /mercado-001: politicas de storage.objects NO RECONOCIDAS/.test(r.err) && r.err.includes(nombre) && estado(d) === a
      && q.ok && new RegExp(`politica\\|${nombre}\\|.*NO RECONOCIDA`).test(q.out) && !new RegExp(`politica\\|${nombre}\\|.*reconocida: solo`).test(q.out),
      `${err1(r)} · s14: ${q.out.split('\n').filter(l => l.includes(nombre)).join(' / ') || q.err}`)
  }
  const POSITIVOS = [
    ['lectura forex', `for select to public using (bucket_id = 'forex-data')`, 'forex-data'],
    ['propios', `for select to authenticated using (bucket_id = 'avatares' and owner = auth.uid())`, 'avatares'],
    ['tres terminos', `for select to authenticated using (owner = auth.uid() and bucket_id = 'avatares' and name like 'a%')`, 'avatares'],
    ['subidas', `for insert to authenticated with check (bucket_id = 'avatares' and owner = auth.uid())`, 'avatares'],
    ['cambios', `for update to authenticated using (bucket_id = 'avatares') with check (bucket_id = 'avatares' and owner = auth.uid())`, 'avatares'],
    ['todo', `for all to authenticated using (bucket_id = 'avatares')`, 'avatares'],
    ['borrados', `for delete to authenticated using (bucket_id = 'avatares' and owner = auth.uid())`, 'avatares'],
    ['literal raro', `for select to public using (bucket_id = 'a) AND (b')`, 'a) AND (b'],
    ['restrictiva con bucket', `as restrictive for select to public using (bucket_id = 'avatares')`, 'avatares'],
  ]
  for (const [nombre, def, bucket] of POSITIVOS) {
    const d = monta(SUPA + `create policy "${nombre}" on storage.objects ${def};`)
    const r = pg.psql(M1, d)
    const q = s14(d)
    oraculo('E2-01', `positivo ${nombre}: mercado-001 aplica y s14 dice «reconocida: solo ${bucket}»`,
      r.ok && /FIN\|mercado-001 aplicada$/.test(r.out) && q.ok && q.out.includes(`politica|${nombre}|`) && q.out.split('\n').some(l => l.startsWith(`politica|${nombre}|`) && l.endsWith(`reconocida: solo ${bucket}`)),
      `${err1(r)} · s14: ${q.out.split('\n').filter(l => l.includes(nombre)).join(' / ') || q.err}`)
  }
  const bloque = t => { const a = t.indexOf('-- >>> clasificador'), b = t.indexOf('-- <<< clasificador'); return a >= 0 && b > a ? t.slice(a, b) : null }
  oraculo('E2-01', 'el bloque clasificador es identico, byte a byte, en mercado-001 y en s14', bloque(M1) !== null && bloque(M1) === bloque(S14))

  titulo('4 · capa 2, la sonda (con la capa 1 anulada por un mutante de prueba)')
  const ABIERTAS = [
    ['astra-is-false', `for select to public using ((bucket_id = 'forex-data') is false)`, /anon SELECT; authenticated SELECT;/],
    ['astra-case', `for select to public using (case when bucket_id = 'forex-data' then true else true end)`, /anon SELECT; authenticated SELECT;/],
    ['update-abierto', `for update to anon using (true)`, /anon UPDATE;/],
    ['delete-abierto', `for delete to authenticated using (true)`, /authenticated DELETE;/],
    ['del-dueño', `for select to authenticated using (owner = auth.uid())`, /authenticated SELECT;/],
    ['del-dueño-texto', `for select to authenticated using (owner_id = (auth.uid())::text)`, /authenticated SELECT;/],
  ]
  for (const [nombre, def, quien] of ABIERTAS) {
    const d = monta(SUPA + `create policy "${nombre}" on storage.objects ${def};`)
    const a = estado(d)
    const r = pg.psql(M1sinCapa1, d)
    oraculo('E2-01', `sonda: ${nombre} → aborta «la sonda ALCANZA» con el rol y la orden; nada cambia (ni el centinela)`, !r.ok && /la sonda ALCANZA el bucket mercado/.test(r.err) && quien.test(r.err) && estado(d) === a, err1(r))
  }
  const dTrig = monta(SUPA + `create function storage.protege() returns trigger language plpgsql as $f$ begin raise exception using errcode = '42501', message = 'Direct deletion from storage tables is not allowed'; end $f$;
create trigger protege_borrado before delete on storage.objects for each statement execute function storage.protege();
create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data');`)
  const aT = estado(dTrig), rT = pg.psql(M1, dTrig)
  oraculo('E2-01', 'un disparador POR SENTENCIA en DELETE (42501 que no es de permisos): «sonda no concluyente», nada cambia', !rT.ok && /sonda no concluyente/.test(rT.err) && /DELETE: 42501 Direct deletion/.test(rT.err) && estado(dTrig) === aT, err1(rT))
  const qT = s14(dTrig)
  oraculo('S14', 's14 lista ese disparador como BEFORE DELETE · POR SENTENCIA', qT.ok && /disparador\|protege_borrado\|BEFORE DELETE · POR SENTENCIA · storage.protege/.test(qT.out), qT.out || qT.err)
  const dSin = monta(`create policy "astra-is-false" on storage.objects for select to public using ((bucket_id = 'forex-data') is false);`)
  const rSin = pg.psql(M1sinCapa1, dSin)
  oraculo('E2-01', 'sin grants a anon/authenticated sobre storage, la sonda no alcanza (permission denied) y aplica', rSin.ok && /FIN\|mercado-001 aplicada$/.test(rSin.out), err1(rSin))
  const dPgx = monta(SUPA + PGX + `create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data');`)
  ver('pgx: no superusuario, bypassrls', pg.psql(`select rolsuper || ',' || rolbypassrls from pg_roles where rolname = 'pgx'`, dPgx).out === 'false,true')
  const aPgx = estado(dPgx), rPgx = comoPgx(M1, dPgx)
  oraculo('M001', 'como el postgres no superusuario de s06: aplica, la sonda pasa y el centinela no queda', rPgx.ok && /FIN\|mercado-001 aplicada$/.test(rPgx.out) && /objetos en mercado\|0/.test(rPgx.out) && estado(dPgx).split('\n')[0].includes('mercado:false:5242880') && estado(dPgx).split('\n').slice(1).join('|') === aPgx.split('\n').slice(1).join('|'), err1(rPgx) || rPgx.out)
  const dPgx2 = monta(SUPA + PGX + `create policy "astra-case" on storage.objects for select to public using (case when bucket_id = 'forex-data' then true else true end);`)
  const rPgx2 = comoPgx(M1sinCapa1, dPgx2)
  oraculo('E2-01', 'como pgx y sin capa 1: la sonda alcanza y aborta (SET LOCAL ROLE funciona sin superusuario)', !rPgx2.ok && /la sonda ALCANZA/.test(rPgx2.err), err1(rPgx2))

  titulo('5 · s14 (solo lectura)')
  const d3 = monta(`create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data');
create policy "rara" on storage.objects for select to authenticated using (name like 'x%' or owner = '0f0e0d0c-0b0a-4908-8706-050403020100'::uuid);
insert into storage.objects (bucket_id, name, metadata) values ('forex-data', 'EURUSD/M1/2026.json.gz', '{"size": 4000000}');`)
  const q0 = s14(d3)
  oraculo('S14', 'antes: mercado NO EXISTE, forex-data publico con 1 objeto y sus bytes, y cada politica con su veredicto', q0.ok && /bucket\|mercado\|NO EXISTE/.test(q0.out) && /bucket\|forex-data\|public=true .* objetos=1 · bytes=4000000/.test(q0.out) && /politica\|lectura forex\|SELECT · PERMISSIVE · \{public\} · reconocida: solo forex-data/.test(q0.out) && /politica\|rara\|SELECT · PERMISSIVE · \{authenticated\} · NO RECONOCIDA/.test(q0.out) && /FIN\|s14\|consulta$/.test(q0.out), q0.err || q0.out)
  oraculo('S14', 'el texto de cada politica (USING, y WITH CHECK si lo hay), con los UUID como <uuid>', q0.ok && q0.out.includes(`politica|lectura forex|USING: (bucket_id = 'forex-data'::text)`) && /politica\|rara\|USING: \(\(name ~~ 'x%'::text\) OR \(owner = '<uuid>'::uuid\)\)/.test(q0.out) && !q0.out.includes('0f0e0d0c-0b0a'), q0.out)
  oraculo('S14', 'el orden: la fila del veredicto antes que sus textos', (() => { const l = q0.out.split('\n'); const i = l.findIndex(x => x.startsWith('politica|rara|SELECT')), j = l.findIndex(x => x.startsWith('politica|rara|USING')); return i >= 0 && j === i + 1 })(), q0.out)
  pg.psql(`drop policy "rara" on storage.objects;`, d3)
  const r3 = pg.psql(M1, d3)
  pg.psql(`insert into storage.objects (bucket_id, name, metadata) values
    ('mercado', 'v1/EURUSD/2026/03/02.${'a'.repeat(64)}.bin.br', '{"size": 9000}'), ('mercado', 'v1/EURUSD/2026/03/03.${'b'.repeat(64)}.bin.br', '{"size": 8000}'),
    ('mercado', 'v1/EURUSD/manifiestos/v1.1.${'c'.repeat(64)}.json', '{"size": 500}'), ('mercado', 'v1/GBPUSD/2026/03/02.${'d'.repeat(64)}.bin.br', '{"size": 7000}'),
    ('mercado', 'v1/actual.json', '{"size": 300}'), ('mercado', 'v1/_liberados/20261014T100500Z.${'e'.repeat(16)}.json', '{"size": 200}');`, d3)
  const q1 = s14(d3)
  oraculo('S14', 'despues: mercado privado; EURUSD 2 trozos, 17.000 bytes y 1 manifiesto; GBPUSD 1 trozo; puntero con su hora; sin cerrojo; 1 constancia de liberacion', r3.ok && q1.ok && /bucket\|mercado\|public=false · file_size_limit=5242880/.test(q1.out) && /mercado\|EURUSD\|trozos=2 · bytes=17000 · manifiestos=1/.test(q1.out) && /mercado\|GBPUSD\|trozos=1 · bytes=7000 · manifiestos=0/.test(q1.out) && /mercado\|puntero\|v1\/actual.json · actualizado/.test(q1.out) && /mercado\|cerrojo\|no hay/.test(q1.out) && /mercado\|liberaciones\|1 constancia/.test(q1.out), q1.err || q1.out)
  oraculo('S14', 'sin nombres de objetos de otros buckets (ni EURUSD/M1/…)', q1.ok && !/M1\/2026/.test(q1.out))
  oraculo('S14', 'una sola SELECT: sin escrituras ni EXECUTE (fuera comentarios)', (() => { const sin = S14.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''"); return !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|perform|call|do)\b/i.test(sin) && (sin.match(/;/g) || []).length === 1 })())
} finally { pg.cierra() }
fin()
