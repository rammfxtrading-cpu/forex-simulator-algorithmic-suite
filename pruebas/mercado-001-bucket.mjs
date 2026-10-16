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
 *   9 E2R4-01/02: s14 y los permisos efectivos del cerrojo (por defecto, acreditados, NO ACREDITADOS, reglas)
 *  10 protect_delete (CTO 14-oct, s14b de produccion): el montaje lleva los dos disparadores de Supabase en
 *     storage.objects con sus cuerpos byte a byte (pruebas/storage-supabase.mjs). La sonda pone
 *     storage.allow_delete_query solo para su DELETE y prueba la RLS: verde real; rojo con una politica que deja
 *     borrar; el mutante sin el ajuste no da verde (el 42501 de protect_delete es «no concluyente»); el ajuste no
 *     queda en true ni si la sonda falla a mitad (misma sesion); protect_objects_delete tiene que existir con su
 *     forma y habilitado. s14: inventario de storage.buckets con cuerpo, y acreditacion por definicion, habilitado
 *     y md5 completo
 *     CTO 14-oct (tras la s14c): los cinco de storage.buckets acreditados y montados byte a byte; protect_delete con
 *     el md5 completo acreditado (si cambia, «re-acreditar»); tras la sonda, la prueba FUNCIONAL: un DELETE directo
 *     de una fila inexistente tiene que fallar con el error de protect_delete (y si quien ejecuta no tiene DELETE,
 *     aborta por «otra cosa»)
 *   5 s14: una sola SELECT, en READ ONLY; antes («NO EXISTE», politicas con su
 *     veredicto y su texto, UUID enmascarados, disparadores) y despues (privado,
 *     trozos por par, puntero, cerrojo); sin nombres de objetos de otros buckets
 *   6 E2R2-01 (Astra, CTO 14-oct): el operador falso de Astra (public.= que da
 *     'mercado' = 'forex-data') con una politica INSERT: negativo COMUN a la
 *     migracion y a s14, con su search_path (public,pg_catalog) y con el de
 *     siempre; variantes de colacion, conversion, dominio, name y polimorfico;
 *     un «=» ajeno de otros tipos no molesta; el arbol solo (mutante sin
 *     contexto) tambien la rechaza
 *   7 E2R2-02: la precondicion (politicas de escritura aplicables a los roles
 *     de alumno) para antes de la sonda, con el escenario de la secuencia de
 *     Astra; la sonda ya no toca filas de otros buckets (disparador por fila);
 *     lo que no deshace el rollback (por sentencia) lo enseña s14; los limites:
 *     lock_timeout corta una espera real, y el informe dice los que vio
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync, spawn } from 'node:child_process'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'
import { PROTECT_DELETE, UPDATE_UPDATED_AT, DISPARADORES_OBJETOS, COMPRUEBA_MD5, MD5_ESPERADO, ENFORCE_BUCKET_NAME_LENGTH, PROTECT_BUCKET_CONTROL_COLUMNS, ENFORCE_BUCKET_LIFECYCLE_SERVICE_ROLE, COLUMNAS_CICLO, TIPO_Y_VERSIONADO, DISPARADORES_BUCKETS, COMPRUEBA_MD5_BUCKETS, MD5_BUCKETS_ESPERADO, DUENO_STORAGE, FICHAS_MONTAJE } from './storage-supabase.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const M1 = lee('sql/mercado-001-bucket.sql')
const S14 = lee('sql/consultas/s14-mercado-storage.sql')
const pg = cluster()
// E2R8-01 (s14e de produccion, 16-oct): la FK de objects se llama objects_bucketId_fkey, y hay otras dos FK a
// storage.buckets(id), desde storage.s3_multipart_uploads y storage.s3_multipart_uploads_parts: ocho internos RI_FKey_*
const REALES = `alter table storage.objects add column metadata jsonb, add column updated_at timestamptz default now(), add column owner uuid, add column owner_id text;
alter table storage.objects rename constraint objects_bucket_id_fkey to "objects_bucketId_fkey";
create table storage.s3_multipart_uploads (id text primary key, bucket_id text not null references storage.buckets(id));
create table storage.s3_multipart_uploads_parts (id uuid primary key default gen_random_uuid(), upload_id text not null, bucket_id text not null references storage.buckets(id));`
// CTO 14-oct (s14b, s14c): los disparadores de Supabase en storage.objects (2) y storage.buckets (5), con sus funciones
// byte a byte. mercado-001 exige protect_objects_delete; sin el, ver la seccion 10. Las columnas NOT NULL type y
// versioning_status de storage.buckets, con el enum y los valores por defecto de la s14d (15-oct)
const STORAGE_SUPABASE = `${PROTECT_DELETE}\n${UPDATE_UPDATED_AT}\n${DISPARADORES_OBJETOS}\n${TIPO_Y_VERSIONADO}\n${COLUMNAS_CICLO}\n${ENFORCE_BUCKET_NAME_LENGTH}\n${PROTECT_BUCKET_CONTROL_COLUMNS}\n${ENFORCE_BUCKET_LIFECYCLE_SERVICE_ROLE}\n${DISPARADORES_BUCKETS}\n${DUENO_STORAGE}`
// los grants de Supabase sobre storage a anon y authenticated (condicion del escenario)
const SUPA = `grant usage on schema storage to anon, authenticated; grant all on storage.objects, storage.buckets to anon, authenticated;`
// el postgres de produccion segun s06: no superusuario, bypassrls, miembro de anon y authenticated
const PGX = `do $r$ begin if not exists (select 1 from pg_roles where rolname = 'pgx') then create role pgx login nosuperuser bypassrls createrole inherit; end if; end $r$;
grant anon, authenticated, service_role to pgx with admin option;
grant usage on schema storage, auth to pgx; grant all on storage.objects, storage.buckets to pgx;`
let n = 0
const monta = (extra = '', { sinStorage = false } = {}) => {
  const db = `m${++n}`
  const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(PRODUCCION, db), pg.psql(REALES, db), ...(sinStorage ? [] : [pg.psql(STORAGE_SUPABASE, db)]), ...(extra ? [pg.psql(extra, db)] : [])]
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
// CTO 15-oct: mercado-001 aborta tambien por un disparador que no esta en la lista acreditada. Las pruebas de la
// defensa PROPIA de la sonda frente a esos disparadores (E2-01, E2R2-02, E2R3-02/03, PD-04) usan este mutante, que
// abre la lista (solo abortan los de la lista que difieren); el real los para antes (seccion 13)
const M1listaAbierta = M1.replace('   where not v.acreditado\n', '   where v.en_lista and not v.acreditado\n')

try {
  pg.arranca()
  ver('el mutante sin capa 1 cambia exactamente el raise de la lista blanca', M1sinCapa1 !== M1 && M1sinCapa1.length < M1.length && !/NO RECONOCIDAS \(podrian/.test(M1sinCapa1))
  ver('el mutante de lista abierta cambia exactamente una linea del SQL', M1listaAbierta !== M1 && M1listaAbierta.split('\n').filter((l, k) => l !== M1.split('\n')[k]).length === 1)

  titulo('1 · limpio: crea el bucket privado; segunda ejecucion, nada')
  const d1 = monta(SUPA)
  const antes = estado(d1)
  const r1 = pg.psql(M1, d1)
  const despues = estado(d1)
  oraculo('M001', 'aplica: el informe dice el bucket privado de 5 MB, la RLS, la sonda y acaba en FIN', r1.ok && /bucket\|mercado · public=false · file_size_limit=5242880 · allowed_mime_types=-/.test(r1.out) && /rls\|storage.objects · rls=true/.test(r1.out) && /sonda\|anon y authenticated no alcanzan/.test(r1.out) && /objetos en mercado\|0/.test(r1.out) && /FIN\|mercado-001 aplicada$/.test(r1.out), r1.err || r1.out)
  oraculo('M001', 'storage.buckets: forex-data igual y mercado privado, 5 MB, sin tipos MIME; ni politicas ni grants nuevos; ningun objeto (el centinela no queda)', despues.split('\n')[0] === 'forex-data:true:-:-,mercado:false:5242880:-' && despues.split('\n').slice(1).join('|') === antes.split('\n').slice(1).join('|'), `${antes} → ${despues}`)
  // s14d (15-oct): el montaje tiene type y versioning_status como en produccion, y el bucket que crea mercado-001 (sin fijarlos) sale con sus valores por defecto
  const S14D_PROD = lee('sql/consultas/salidas/s14d-columnas-buckets-2026-10-15.csv').split('\n').filter(l => /^(columna,storage\.buckets\.(type|versioning_status|lifecycle_configuration|lifecycle_configuration_generation),|enum,)/.test(l)).map(l => l.replace(/,"?/g, '|').replace(/"$/, ''))
  const s14dMontaje = pg.psql(`begin read only;\n${lee('sql/consultas/s14d-columnas-buckets.sql')}\nrollback;`, d1).out.split('\n').filter(l => /^(columna\|storage\.buckets\.(type|versioning_status|lifecycle_configuration|lifecycle_configuration_generation)\||enum\|)/.test(l))
  ver('control: la s14d del montaje da, para type, versioning_status, ciclo de vida y el enum, las filas literales de produccion', S14D_PROD.length === 8 && s14dMontaje.join('\n') === S14D_PROD.join('\n'), `${s14dMontaje.join(' / ')} ≠ ${S14D_PROD.join(' / ')}`)
  const tipo = pg.psql(`select type || ':' || versioning_status from storage.buckets where id = 'mercado'`, d1).out
  oraculo('M001', 's14d: el bucket mercado sale con type STANDARD y versioning_status DISABLED (los valores por defecto medidos)', tipo === 'STANDARD:DISABLED', tipo)
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
  // reconocidas por la lista blanca, pero de ESCRITURA y para alumnos: la precondicion de la sonda (E2R2-02) aborta
  const ESCRITURAS = [
    ['cambios', `for update to authenticated using (bucket_id = 'avatares') with check (bucket_id = 'avatares' and owner = auth.uid())`, 'avatares'],
    ['todo', `for all to authenticated using (bucket_id = 'avatares')`, 'avatares'],
    ['borrados', `for delete to authenticated using (bucket_id = 'avatares' and owner = auth.uid())`, 'avatares'],
    ['borrados-public', `for delete to public using (bucket_id = 'avatares')`, 'avatares'],
    ['por-pertenencia', `for update to alumnos using (bucket_id = 'avatares')`, 'avatares'],
  ]
  for (const [nombre, def, bucket] of ESCRITURAS) {
    const d = monta(SUPA + `do $r$ begin if not exists (select 1 from pg_roles where rolname = 'alumnos') then create role alumnos nologin; end if; end $r$; grant alumnos to authenticated;` + `create policy "${nombre}" on storage.objects ${def};`)
    const a = estado(d)
    const r = pg.psql(M1, d)
    const q = s14(d)
    oraculo('E2R2-02', `escritura ${nombre}: s14 la reconoce (solo ${bucket}) y la lista en «escritura»; mercado-001 aborta con la precondicion, nombrandola, y nada cambia`,
      !r.ok && /mercado-001: politicas de ESCRITURA en storage.objects aplicables/.test(r.err) && r.err.includes(nombre) && estado(d) === a
      && q.ok && q.out.split('\n').some(l => l.startsWith(`politica|${nombre}|`) && l.endsWith(`reconocida: solo ${bucket}`)) && q.out.includes(`escritura|${nombre}|`),
      `${err1(r)} · s14: ${q.out.split('\n').filter(l => l.includes(nombre)).join(' / ') || q.err}`)
  }
  const dSel = monta(SUPA + `create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data'); create policy "solo servicio" on storage.objects for all to service_role using (bucket_id = 'avatares');`)
  const rSel = pg.psql(M1, dSel), qSel = s14(dSel)
  oraculo('E2R2-02', 'una politica de escritura solo para service_role no es de alumnos: aplica; s14 «escritura | (ninguna)»', rSel.ok && /FIN\|mercado-001 aplicada$/.test(rSel.out) && qSel.ok && /escritura\|\(ninguna\)\|ninguna politica UPDATE\/DELETE\/ALL/.test(qSel.out), err1(rSel) || qSel.out)
  const bloque = t => { const a = t.indexOf('-- >>> clasificador'), b = t.indexOf('-- <<< clasificador'); return a >= 0 && b > a ? t.slice(a, b) : null }
  oraculo('E2-01', 'el bloque clasificador es identico, byte a byte, en mercado-001 y en s14', bloque(M1) !== null && bloque(M1) === bloque(S14))

  titulo('4 · capa 2, la sonda (con la capa 1 anulada por un mutante de prueba)')
  const ABIERTAS = [
    ['astra-is-false', `for select to public using ((bucket_id = 'forex-data') is false)`, /anon SELECT; authenticated SELECT;/],
    ['astra-case', `for select to public using (case when bucket_id = 'forex-data' then true else true end)`, /anon SELECT; authenticated SELECT;/],
    ['del-dueño', `for select to authenticated using (owner = auth.uid())`, /authenticated SELECT;/],
    ['del-dueño-texto', `for select to authenticated using (owner_id = (auth.uid())::text)`, /authenticated SELECT;/],
  ]
  for (const [nombre, def, quien] of ABIERTAS) {
    const d = monta(SUPA + `create policy "${nombre}" on storage.objects ${def};`)
    const a = estado(d)
    const r = pg.psql(M1sinCapa1, d)
    oraculo('E2-01', `sonda: ${nombre} → aborta «la sonda ALCANZA» con el rol y la orden; nada cambia (ni el centinela)`, !r.ok && /la sonda ALCANZA el bucket mercado/.test(r.err) && quien.test(r.err) && estado(d) === a, err1(r))
  }
  for (const [nombre, def] of [['update-abierto', `for update to anon using (true)`], ['delete-abierto', `for delete to authenticated using (true)`]]) {
    const d = monta(SUPA + `create policy "${nombre}" on storage.objects ${def};`)
    const a = estado(d)
    const r = pg.psql(M1sinCapa1, d)
    oraculo('E2R2-02', `sin capa 1: ${nombre} lo para la precondicion ANTES de la sonda (no se ejecuta nada sobre filas); nada cambia`, !r.ok && /politicas de ESCRITURA/.test(r.err) && r.err.includes(nombre) && estado(d) === a, err1(r))
  }
  const dTrig = monta(SUPA + `create function storage.protege() returns trigger language plpgsql as $f$ begin raise exception using errcode = '42501', message = 'Direct deletion from storage tables is not allowed'; end $f$;
create trigger protege_borrado before delete on storage.objects for each statement execute function storage.protege();
create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data');`)
  const aT = estado(dTrig), rT = pg.psql(M1listaAbierta, dTrig)
  oraculo('E2-01', 'un disparador POR SENTENCIA en DELETE que no lee el ajuste (42501 con el mensaje de protect_delete): «sonda no concluyente», nada cambia', !rT.ok && /sonda no concluyente/.test(rT.err) && /DELETE: 42501 con el mensaje de protect_delete \(Direct deletion/.test(rT.err) && estado(dTrig) === aT, err1(rT))
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

  titulo('6 · E2R2-01: la identidad del operador (negativo comun a la migracion y a s14)')
  // el operador de Astra (sql-adversario.mjs) tal cual
  const OP_ASTRA = `create function public.igual(text,text) returns boolean language sql immutable as $$ select ($1 operator(pg_catalog.=) $2) or ($1 operator(pg_catalog.=) 'mercado' and $2 operator(pg_catalog.=) 'forex-data') $$; create operator public.= (leftarg=text,rightarg=text,function=public.igual);`
  const POL_ASTRA = `set search_path=public,pg_catalog; create policy escrita on storage.objects for insert to authenticated with check(bucket_id = 'forex-data'); reset search_path;`
  for (const [contexto, prefijo] of [['con su search_path (public,pg_catalog)', 'set search_path=public,pg_catalog;\n'], ['con el search_path de siempre', '']]) {
    const d = monta(SUPA + OP_ASTRA + POL_ASTRA)
    const a = estado(d)
    const r = pg.psql(prefijo + M1, d)
    const q = pg.psql(`begin read only;\n${prefijo}${S14}\nrollback;`, d)
    const entra = pg.psql(`set search_path=public,pg_catalog; set role authenticated; insert into storage.objects(bucket_id,name) values('mercado','v1/falso');`, d)
    oraculo('E2R2-01', `operador propio INSERT debe ser rechazado (${contexto}): mercado-001 aborta «no se puede acreditar», nombra el operador, y no crea el bucket`,
      !r.ok && /no se puede acreditar la lista blanca/.test(r.err) && /operador = fuera de pg_catalog que acepta texto: public\.=\(text,text\)/.test(r.err) && estado(d) === a && !entra.ok,
      JSON.stringify({ aplica: r.ok, error: err1(r), insertAuthenticated: entra.ok }))
    oraculo('E2R2-01', `s14 (${contexto}): «contexto | NO ACREDITADO» y la politica NO RECONOCIDA`,
      q.ok && /contexto\|lista blanca\|NO ACREDITADO: .*public\.=\(text,text\)/.test(q.out) && /politica\|escrita\|INSERT · PERMISSIVE · \{authenticated\} · NO RECONOCIDA/.test(q.out) && !/politica\|escrita\|.*reconocida: solo/.test(q.out),
      q.out.split('\n').filter(l => /contexto|escrita/.test(l)).join(' / ') || q.err)
  }
  const VARIANTES = [
    // [nombre, montaje, que tiene que decir el error]
    ['operador-sin-politicas', OP_ASTRA, /operador = fuera de pg_catalog/],
    ['dominio', `create domain public.dt as text; create function public.dteq(public.dt, public.dt) returns boolean language sql immutable as $$ select true $$; create operator public.= (leftarg=public.dt, rightarg=public.dt, function=public.dteq); create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data');`, /operador = fuera de pg_catalog que acepta texto: public\.=\((public\.)?dt,(public\.)?dt\)/],
    ['name', `create function public.neq(name, name) returns boolean language sql immutable as $$ select true $$; create operator public.= (leftarg=name, rightarg=name, function=public.neq);`, /public\.=\(name,name\)/],
    ['varchar-text', `create function public.vteq(varchar, text) returns boolean language sql immutable as $$ select true $$; create operator public.= (leftarg=varchar, rightarg=text, function=public.vteq);`, /public\.=\(character varying,text\)/],
    ['polimorfico', `create function public.peq(anyelement, anyelement) returns boolean language sql immutable as $$ select true $$; create operator public.= (leftarg=anyelement, rightarg=anyelement, function=public.peq);`, /public\.=\(anyelement,anyelement\)/],
    ['otro-esquema', `create schema raro; create function raro.igual(text,text) returns boolean language sql immutable as $$ select true $$; create operator raro.= (leftarg=text, rightarg=text, function=raro.igual);`, /raro\.=\(text,text\)/],
    ['colacion-C', `alter table storage.objects alter column bucket_id type text collate "C"; create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data');`, /bucket_id no es text con la colacion por defecto/],
    ['colacion-no-determinista', `create collation public.ci (provider = icu, locale = 'und-u-ks-level2', deterministic = false); alter table storage.objects alter column bucket_id type text collate public.ci; create policy "mayusculas" on storage.objects for select to public using (bucket_id = 'MERCADO');`, /bucket_id no es text con la colacion por defecto/],
  ]
  for (const [nombre, montaje, dice] of VARIANTES) {
    const d = monta(SUPA + montaje)
    const a = estado(d)
    const r = pg.psql(M1, d)
    const q = s14(d)
    oraculo('E2R2-01', `variante ${nombre}: mercado-001 aborta sin acreditar y nada cambia; s14 «NO ACREDITADO»`, !r.ok && /no se puede acreditar/.test(r.err) && dice.test(r.err) && estado(d) === a && q.ok && /contexto\|lista blanca\|NO ACREDITADO/.test(q.out), `${err1(r)} · s14: ${q.out.split('\n').filter(l => l.startsWith('contexto')).join(' / ') || q.err}`)
  }
  const CONV = [
    ['conversion-varchar', `for select to public using (bucket_id = ('forex-data'::varchar)::text)`],
    ['conversion-columna', `for select to public using (bucket_id::varchar = 'forex-data')`],
    ['operador-calificado-ajeno', `for select to public using (bucket_id operator(pg_catalog.~~) 'forex-data')`],
  ]
  for (const [nombre, def] of CONV) {
    const d = monta(`create policy "${nombre}" on storage.objects ${def};`)
    const r = pg.psql(M1, d), q = s14(d)
    oraculo('E2R2-01', `conversion ${nombre}: NO RECONOCIDA en los dos`, !r.ok && /NO RECONOCIDAS/.test(r.err) && r.err.includes(nombre) && q.ok && new RegExp(`politica\\|${nombre}\\|.*NO RECONOCIDA`).test(q.out), err1(r))
  }
  const dCal = monta(SUPA + `create policy "calificada" on storage.objects for select to public using (bucket_id operator(pg_catalog.=) 'forex-data');`)
  const rCal = pg.psql(M1, dCal), qCal = s14(dCal)
  oraculo('E2R2-01', 'positivo: la igualdad escrita como OPERATOR(pg_catalog.=) es la de siempre: aplica y s14 la reconoce', rCal.ok && /FIN\|mercado-001 aplicada$/.test(rCal.out) && qCal.ok && /politica\|calificada\|.*reconocida: solo forex-data$/m.test(qCal.out), err1(rCal) || qCal.out)
  const dPunto = monta(SUPA + `create function public.ptigual(point, point) returns boolean language sql immutable as $$ select $1 ~= $2 $$; create operator public.= (leftarg=point, rightarg=point, function=public.ptigual); create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data');`)
  const rPunto = pg.psql(M1, dPunto)
  oraculo('E2R2-01', 'control: un «=» ajeno de otros tipos (point) no impide aplicar', rPunto.ok && /FIN\|mercado-001 aplicada$/.test(rPunto.out), err1(rPunto))
  const dHostil = monta(SUPA + `create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data');`)
  const qHostil = pg.psql(`begin read only;\nset local search_path = public, pg_catalog;\n${S14}\nrollback;`, dHostil)
  oraculo('E2R2-01', 's14 corrida con un search_path que no empieza por pg_catalog: «NO ACREDITADO» (no se fia de su propio texto)', qHostil.ok && /contexto\|lista blanca\|NO ACREDITADO: el search_path \(public,pg_catalog\) no empieza por pg_catalog/.test(qHostil.out) && /politica\|lectura forex\|.*NO RECONOCIDA \(contexto no acreditado\)/.test(qHostil.out), qHostil.out || qHostil.err)
  const rHostil = pg.psql('set search_path = public, pg_catalog;\n' + M1, dHostil)
  oraculo('E2R2-01', 'mercado-001 con ese search_path: fija el suyo y aplica', rHostil.ok && /FIN\|mercado-001 aplicada$/.test(rHostil.out), err1(rHostil))
  // el arbol solo: mutante sin el search_path fijo y sin la lista de operadores ajenos
  const M1soloArbol = M1.replace("perform pg_catalog.set_config('search_path', 'pg_catalog, pg_temp', true);", "perform pg_catalog.set_config('search_path', 'public, pg_catalog', true);")
    .replace(/\n    \(select 'operador = fuera de pg_catalog que acepta texto: '[\s\S]*?having count\(\*\) > 0\),/, '')
    .replace(/case when \(select s\.n from pg_catalog\.unnest[\s\S]*?no empieza por pg_catalog[^']*' end,/, "null,")
  ver('el mutante «solo arbol» quita exactamente el contexto fijo, la lista de operadores y la comprobacion del search_path', M1soloArbol !== M1 && !/operador = fuera de pg_catalog/.test(M1soloArbol) && !/no empieza por pg_catalog/.test(M1soloArbol) && M1soloArbol.includes("'public, pg_catalog', true"))
  const dArbol = monta(SUPA + OP_ASTRA + POL_ASTRA)
  const rArbol = pg.psql(M1soloArbol, dArbol)
  oraculo('E2R2-01', 'con el contexto y la lista anulados (mutante), el arbol sigue rechazando la politica de Astra (su :opno no es de pg_catalog)', !rArbol.ok && /NO RECONOCIDAS/.test(rArbol.err) && rArbol.err.includes('escrita'), err1(rArbol))

  titulo('7 · E2R2-02: la sonda no toca otros buckets; limites')
  // el escenario de Astra: politica ALL reconocida de forex-data y un disparador por fila con una secuencia
  const SECUENCIA = `create sequence public.efectos; create function public.efecto() returns trigger language plpgsql security definer as $$ begin perform nextval('public.efectos'); return case when TG_OP='DELETE' then OLD else NEW end; end $$;`
  const dSeq = monta(SUPA + SECUENCIA + `create trigger efecto before update or delete on storage.objects for each row execute function public.efecto(); create policy otros on storage.objects for all to public using (bucket_id = 'forex-data') with check(bucket_id='forex-data'); insert into storage.objects(bucket_id,name,metadata) values('forex-data','sintetico','{"original":true}');`)
  const seq = d => pg.psql('select last_value || \'|\' || is_called from public.efectos;', d).out
  const antesSeq = seq(dSeq), rSeq = pg.psql(M1, dSeq), despuesSeq = seq(dSeq)
  oraculo('E2R2-02', 'sonda no debe producir efectos no revertidos en otro bucket (escenario de Astra): la precondicion aborta antes y la secuencia no se mueve', !rSeq.ok && /politicas de ESCRITURA/.test(rSeq.err) && antesSeq === despuesSeq, JSON.stringify({ aplica: rSeq.ok, error: err1(rSeq), antes: antesSeq, despues: despuesSeq }))
  const dFila = monta(SUPA + SECUENCIA + `create trigger efecto before update or delete on storage.objects for each row execute function public.efecto(); create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data'); insert into storage.objects(bucket_id,name,metadata) values('forex-data','sintetico','{"original":true}');`)
  const antesFila = seq(dFila), rFila = pg.psql(M1listaAbierta, dFila), despuesFila = seq(dFila)
  oraculo('E2R2-02', 'con una lectura de forex-data y un disparador POR FILA: aplica y la secuencia no se mueve (UPDATE y DELETE solo del centinela, que no ven)', rFila.ok && /FIN\|mercado-001 aplicada$/.test(rFila.out) && antesFila === despuesFila && pg.psql(`select metadata::text from storage.objects where name = 'sintetico'`, dFila).out === '{"original": true}', JSON.stringify({ error: err1(rFila), antes: antesFila, despues: despuesFila }))
  const dSent = monta(SUPA + SECUENCIA + `create trigger efecto_sentencia before update on storage.objects for each statement execute function public.efecto(); create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data');`)
  const qSent = s14(dSent)
  oraculo('E2R2-02', 's14 enseña el disparador POR SENTENCIA con funcion ajena (lo que el rollback no deshace: el runbook para)', qSent.ok && /disparador\|efecto_sentencia\|BEFORE UPDATE · POR SENTENCIA · public\.efecto · FUNCION AJENA/.test(qSent.out), qSent.out || qSent.err)
  const antesSent = seq(dSent), rSent = pg.psql(M1listaAbierta, dSent), despuesSent = seq(dSent)
  oraculo('E2R2-02', 'y si aun asi se aplica, ese efecto queda (documentado en p.12.7.1 corregido: no «nada persiste»)', rSent.ok && antesSent !== despuesSent, `${antesSent} → ${despuesSent} · ${err1(rSent)}`)
  // limites: el informe los dice; en una sola transaccion (como el editor) valen los SET LOCAL
  const dLim = monta(SUPA)
  const rLim = pg.psql(`begin;\n${M1}\ncommit;`, dLim)
  oraculo('E2R2-02', 'en una sola transaccion (como el editor): el informe dice lock_timeout=5s · statement_timeout=30s', rLim.ok && /limites\|lock_timeout=5s · statement_timeout=30s/.test(rLim.out), err1(rLim) || rLim.out)
  // lock_timeout de verdad: otra sesion tiene storage.buckets bloqueada 20 s; mercado-001 corta a los 5
  const dEsp = monta(SUPA)
  const bloqueo = spawn(path.join(BIN, 'psql'), ['-h', pg.dir, '-p', pg.puerto, '-U', 'postgres', '-X', '-q', '-d', dEsp, '-c', 'begin; lock table storage.buckets in access exclusive mode; select pg_sleep(20); commit;'], { env: { PATH: process.env.PATH } })
  await new Promise(r => setTimeout(r, 1500))
  const t0 = Date.now(), rEsp = pg.psql(M1, dEsp), dt = Date.now() - t0
  bloqueo.kill()
  oraculo('E2R2-02', `con storage.buckets bloqueada por otra sesion: aborta por lock_timeout en ~5 s, no espera los 20 (${Math.round(dt / 1000)} s)`, !rEsp.ok && /lock timeout/.test(rEsp.err) && dt < 12000, err1(rEsp))

  titulo('8 · E2R3-02 y E2R3-03 (Astra): sombreado de catalogos e INSERT por sentencia')
  // el escenario de Astra (sql-adversario.mjs, ronda 3) tal cual
  const dS = monta(`create sequence public.efecto_insert; create function storage.efecto_insert() returns trigger language plpgsql as $$ begin perform nextval('public.efecto_insert'); return null; end $$; create trigger efecto_insert after insert on storage.objects for each statement execute function storage.efecto_insert();`)
  const visible = pg.psql('begin read only;\nset local search_path=pg_catalog,public;\n' + S14 + '\nrollback;', dS)
  const oculto = pg.psql('create temp table pg_trigger as select * from pg_catalog.pg_trigger where false; set search_path=pg_temp,pg_catalog,public;\nbegin read only;\n' + S14 + '\nrollback;', dS)
  ver('control: sin sombreado, s14 enseña el disparador', visible.ok && visible.out.includes('efecto_insert'), visible.err)
  oraculo('E2R3-02', 's14 no oculta disparador por pg_temp (los catalogos van calificados con pg_catalog)', oculto.ok && oculto.out.includes('disparador|efecto_insert|'), oculto.out.split('\n').filter(x => /disparador|contexto/.test(x)).join(' / ') || oculto.err)
  oraculo('E2R3-02', 'y con un esquema temporal delante de pg_catalog, el contexto NO queda acreditado', oculto.ok && /contexto\|lista blanca\|NO ACREDITADO: el search_path \(pg_temp_\d+,pg_catalog,public\) no empieza por pg_catalog/.test(oculto.out), oculto.out.split('\n').filter(x => /contexto/.test(x)).join(' / '))
  const rTemp = pg.psql('create temp table pg_trigger as select * from pg_catalog.pg_trigger where false; set search_path=pg_temp,pg_catalog,public;\n' + M1listaAbierta, dS)
  oraculo('E2R3-02', 'mercado-001 en esa misma sesion fija su contexto (pg_catalog, pg_temp) y no se deja engañar: aplica igual que sin la tabla temporal', rTemp.ok && /FIN\|mercado-001 aplicada$/.test(rTemp.out), err1(rTemp))
  oraculo('E2R3-03', 's14: el AFTER INSERT por sentencia sale como POR SENTENCIA, con su lenguaje y el md5 de su cuerpo, y el resumen manda PARAR hasta que el CTO lo acredite', /disparador\|efecto_insert\|AFTER INSERT · POR SENTENCIA · storage\.efecto_insert · funcion de storage · plpgsql · SECURITY INVOKER · dueño=postgres · proconfig=- · volatilidad=v · md5 del cuerpo [0-9a-f]{12}/.test(visible.out) && /disparador\|efecto_insert\|.* · NO ACREDITADO \(difiere: no esta en la lista acreditada\)$/m.test(visible.out) && /disparador\|\(resumen\)\|storage\.objects: 3 \(2 por sentencia\) · storage\.buckets: 5 · sin acreditar: 1: .*PARAR hasta que el CTO acredite/.test(visible.out), visible.out.split('\n').filter(x => /disparador/.test(x)).join(' / '))
  const dS2 = monta(`create sequence public.efecto_insert; create function storage.efecto_insert() returns trigger language plpgsql as $$ begin perform nextval('public.efecto_insert'); return null; end $$; create trigger efecto_insert after insert on storage.objects for each statement execute function storage.efecto_insert();`)
  const efecto = pg.psql('begin;\n' + M1listaAbierta + '\ncommit;\nselect last_value || \'|\' || is_called from public.efecto_insert;', dS2)
  oraculo('E2R3-03', 'lo que documenta p.13.2: el INSERT del centinela dispara el INSERT por sentencia, y su efecto no transaccional queda tras el rollback', efecto.ok && efecto.out.split('\n').at(-1) === '1|true', efecto.out.split('\n').at(-1) || efecto.err)
  const dNo = monta('', { sinStorage: true })
  const qNo = s14(dNo)
  // presencia exacta (CTO 15-oct, ronda 9): sin ninguno, los siete FALTAN y se para (antes decia «ninguno»)
  oraculo('E2R3-03', 'sin disparadores: los siete «FALTA» y el resumen manda PARAR (presencia exacta, ronda 9)', qNo.ok && /^disparador\|\(resumen\)\|storage\.objects: 0 \(0 por sentencia\) · storage\.buckets: 0 · sin acreditar: 7: .*PARAR/m.test(qNo.out) && (qNo.out.match(/^disparador\|[^|]+\|FALTA: /mg) || []).length === 7, qNo.out.split('\n').filter(x => /disparador/.test(x)).join(' / '))
  const qSupa = s14(monta())
  oraculo('S14-CTO', 'con los siete de Supabase (cuerpos de la s14b y la s14c): cada uno «acreditado (CTO 14-oct)», ningun cuerpo, y el resumen no pide parar', qSupa.ok && (qSupa.out.match(/^disparador\|buckets\.[a-z_]+\|.* · acreditado \(CTO 14-oct\)$/mg) || []).length === 5 && !/^cuerpo\|/m.test(qSupa.out) && !/NO ACREDITADO/.test(qSupa.out) && /^disparador\|protect_objects_delete\|BEFORE DELETE · POR SENTENCIA · storage\.protect_delete · funcion de storage · plpgsql · SECURITY INVOKER · dueño=supabase_storage_admin · proconfig=- · volatilidad=v · md5 del cuerpo 998d324ea2b1 · acreditado \(CTO 14-oct\)$/m.test(qSupa.out) && /^disparador\|update_objects_updated_at\|BEFORE UPDATE · por fila · storage\.update_updated_at_column · funcion de storage · plpgsql · SECURITY INVOKER · dueño=supabase_storage_admin · proconfig=- · volatilidad=v · md5 del cuerpo 7596e66a7698 · acreditado \(CTO 14-oct\)$/m.test(qSupa.out) && /^disparador\|\(resumen\)\|storage\.objects: 2 \(1 por sentencia\) · storage\.buckets: 5 · sin acreditar: 0: todos acreditados por el CTO \(s14b y s14c, 14-oct\)$/m.test(qSupa.out), qSupa.out.split('\n').filter(x => /disparador/.test(x)).join(' / ') || qSupa.err)

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
  oraculo('S14', 'despues: mercado privado; EURUSD 2 trozos, 17.000 bytes y 1 manifiesto; GBPUSD 1 trozo; puntero con su hora; el cerrojo (E2R3-01) en la base, sin aplicar y con el nombre libre; 1 constancia de liberacion', r3.ok && q1.ok && /bucket\|mercado\|public=false · file_size_limit=5242880/.test(q1.out) && /mercado\|EURUSD\|trozos=2 · bytes=17000 · manifiestos=1/.test(q1.out) && /mercado\|GBPUSD\|trozos=1 · bytes=7000 · manifiestos=0/.test(q1.out) && /mercado\|puntero\|v1\/actual.json · actualizado/.test(q1.out) && /cerrojo\|public.mercado_cerrojo\|NO EXISTE \(mercado-000 sin aplicar\); el nombre esta libre/.test(q1.out) && !/protocolo anterior/.test(q1.out) && /mercado\|liberaciones\|1 constancia/.test(q1.out), q1.err || q1.out)
  oraculo('S14', 'sin nombres de objetos de otros buckets (ni EURUSD/M1/…)', q1.ok && !/M1\/2026/.test(q1.out))

  titulo('9 · E2R4-01: s14 y los permisos efectivos del cerrojo')
  {
    const M0 = lee('sql/mercado-000-cerrojo.sql')
    // las pertenencias son del cluster: la de la seccion 3 (alumnos, E2R2-02) sigue viva; se quita para empezar limpio
    pg.psql(`create role heredado; do $r$ begin if exists (select 1 from pg_roles where rolname = 'alumnos') then revoke alumnos from authenticated; end if; end $r$;`, 'postgres')
    // E2R5-01 completo: authenticator como en un Supabase estandar (miembro de los tres roles, no del dueño)
    const rAu = pg.psql(`create role authenticator noinherit login; grant anon, authenticated, service_role to authenticator;`, 'postgres')
    if (!rAu.ok) throw new Error(`authenticator: ${rAu.err}`)
    const ROLES_LIMPIO = 'anon: - · authenticated: - · service_role: BYPASSRLS (el de Supabase: se informa) · authenticator: no puede actuar como el dueño'
    const limpia = () => { const r = pg.psql(`revoke heredado from authenticated; revoke service_role from anon;`, 'postgres'); if (!r.ok) throw new Error(r.err) }
    const linea = (q, obj) => q.out.split('\n').filter(l => l.startsWith(`cerrojo|${obj}|`)).join(' / ')
    const dA = monta(`alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;`)
    const qA = s14(dA)
    oraculo('E2R4-01', 's14 antes de mercado-000: «por defecto» enseña los privilegios por defecto del creador en public (los de s06) y no pide parar', qA.ok && /^cerrojo\|por defecto\|postgres: en public: anon=.*TRUNCATE.*; authenticated=.*; service_role=.* · global: -$/m.test(qA.out), linea(qA, 'por defecto') || qA.err)
    oraculo('E2R5-01', 's14 antes, Supabase estandar: «roles» dice el dueño que sera (quien ejecuta), los atributos y que authenticator no puede actuar como el; sin PARAR', qA.ok && new RegExp(`^cerrojo\\|roles\\|dueño que sera \\(quien ejecuta\\)=postgres · ${ROLES_LIMPIO.replace(/[()]/g, '\\$&')}$`, 'm').test(qA.out), linea(qA, 'roles') || qA.err)
    for (const [que, sql, deshace, dice] of [
      ['authenticator miembro de quien ejecuta (el dueño que sera)', `grant postgres to authenticator;`, `revoke postgres from authenticator;`, /authenticator: PUEDE ACTUAR COMO EL DUEÑO · PARAR: authenticator puede actuar como el dueño \(postgres\)/],
      ['authenticated con BYPASSRLS', `alter role authenticated bypassrls;`, `alter role authenticated nobypassrls;`, /authenticated: BYPASSRLS .*· PARAR: authenticated tiene BYPASSRLS/],
      ['anon con CREATEROLE', `alter role anon createrole;`, `alter role anon nocreaterole;`, /anon: CREATEROLE .*· PARAR: anon tiene CREATEROLE/],
    ]) {
      pg.psql(sql, 'postgres'); const q = s14(dA); const v = pg.psql(deshace, 'postgres')
      if (!v.ok) throw new Error(`deshacer: ${v.err}`)
      oraculo('E2R5-01', `s14 antes, con ${que}: «roles» dice PARAR y el motivo`, q.ok && dice.test(linea(q, 'roles')), linea(q, 'roles') || q.err)
    }
    oraculo('E2R4-01', 's14 antes: «pertenencias» dice que anon, authenticated y service_role no son miembros de nadie', qA.ok && /^cerrojo\|pertenencias\|anon: - · authenticated: - · service_role: -$/m.test(qA.out), linea(qA, 'pertenencias') || qA.err)
    const dB = monta(`grant heredado to authenticated; alter default privileges for role postgres in schema public grant truncate on tables to heredado;`)
    const qB = s14(dB)
    oraculo('E2R4-01', 's14 antes, con el montaje de Astra (TRUNCATE por defecto a heredado): «OTROS ROLES (heredado) … PARAR»', qB.ok && /^cerrojo\|por defecto\|.*heredado=TRUNCATE.* · OTROS ROLES \(heredado\): mercado-000 abortaria .*PARAR/m.test(qB.out), linea(qB, 'por defecto') || qB.err)
    oraculo('E2R4-01', 's14 antes, con el montaje de Astra: «pertenencias» dice authenticated: heredado', /^cerrojo\|pertenencias\|anon: - · authenticated: heredado · service_role: -$/m.test(qB.out), linea(qB, 'pertenencias'))
    limpia()
    const dC = monta(); const rC = pg.psql(M0, dC); const qC = s14(dC)
    oraculo('E2R4-01', 's14 despues de mercado-000: reglas=0, solo service_role, efectivos nada salvo service_role DELETE,INSERT,SELECT: «permisos acreditados»', rC.ok && qC.ok && /^cerrojo\|public\.mercado_cerrojo\|rls=true · politicas=0 · disparadores=0 · reglas=0 · permisos=service_role:DELETE,service_role:INSERT,service_role:SELECT · efectivos: PUBLIC=- anon=- authenticated=- service_role=DELETE,INSERT,SELECT · dueño=postgres · permisos acreditados$/m.test(qC.out), linea(qC, 'public.mercado_cerrojo') || rC.err || qC.err)
    oraculo('E2R5-01', 's14 despues, Supabase estandar: «roles» dice dueño=postgres y nada que parar', qC.ok && linea(qC, 'roles') === `cerrojo|roles|dueño=postgres · ${ROLES_LIMPIO}`, linea(qC, 'roles'))
    pg.psql(`grant heredado to authenticated; grant truncate on public.mercado_cerrojo to heredado;`, dC)
    const qD = s14(dC)
    oraculo('E2R4-01', 's14 con TRUNCATE a un rol que authenticated hereda: lo enseña y «PERMISOS NO ACREDITADOS (ajenos: heredado) … PARAR»', qD.ok && /authenticated=TRUNCATE .*PERMISOS NO ACREDITADOS \(ajenos: heredado\): mercado-000 abortaria; PARAR/.test(linea(qD, 'public.mercado_cerrojo')), linea(qD, 'public.mercado_cerrojo') || qD.err)
    limpia(); pg.psql(`revoke truncate on public.mercado_cerrojo from heredado; grant service_role to anon with inherit false;`, dC)
    const qE = s14(dC)
    oraculo('E2R4-01', 's14 con anon miembro de service_role solo por SET ROLE (ningun grant ajeno): anon=DELETE,INSERT,SELECT y «PERMISOS NO ACREDITADOS»', qE.ok && /anon=DELETE,INSERT,SELECT .*PERMISOS NO ACREDITADOS: mercado-000 abortaria/.test(linea(qE, 'public.mercado_cerrojo')), linea(qE, 'public.mercado_cerrojo') || qE.err)
    limpia()
    // E2R5-01: el dueño con su ACL revocado y authenticated que puede tomar su rol: NO ACREDITADOS
    pg.psql(`do $r$ begin if not exists (select 1 from pg_roles where rolname = 'dueno_ficticio') then create role dueno_ficticio nosuperuser noinherit; end if; end $r$; grant dueno_ficticio to authenticated with inherit false, set true;`, 'postgres')
    pg.psql(`alter table public.mercado_cerrojo owner to dueno_ficticio; revoke all on public.mercado_cerrojo from dueno_ficticio;`, dC)
    const qG = s14(dC)
    oraculo('E2R5-01', 's14 con el dueño sin ACL y authenticated que puede tomar su rol: efectivos vacios, pero «dueño=dueno_ficticio · PERMISOS NO ACREDITADOS»: authenticated, y authenticator a traves de authenticated (como en Supabase), pueden actuar como el dueño', qG.ok && /authenticated=- service_role=DELETE,INSERT,SELECT · dueño=dueno_ficticio · PERMISOS NO ACREDITADOS \(pueden actuar como el dueño: authenticated,authenticator\) \(roles: el dueño es dueno_ficticio y no quien ejecuta \(postgres\); authenticated puede actuar como el dueño \(dueno_ficticio\); authenticator puede actuar como el dueño \(dueno_ficticio\)\): mercado-000 abortaria/.test(linea(qG, 'public.mercado_cerrojo')) && /· PARAR: el dueño es dueno_ficticio y no quien ejecuta/.test(linea(qG, 'roles')), linea(qG, 'public.mercado_cerrojo') || qG.err)
    // el dueño cambiado a otro rol CON su ACL y sin pertenencias: tambien NO ACREDITADO (el dueño no es quien ejecuta)
    pg.psql(`revoke dueno_ficticio from authenticated;`, 'postgres'); pg.psql(`grant all on public.mercado_cerrojo to dueno_ficticio;`, dC)
    const qH = s14(dC)
    oraculo('E2R5-01', 's14 con el dueño cambiado a otro rol con su ACL (sin pertenencias): NO ACREDITADOS por roles y «roles» dice PARAR', qH.ok && /PERMISOS NO ACREDITADOS \(roles: el dueño es dueno_ficticio y no quien ejecuta \(postgres\)\)/.test(linea(qH, 'public.mercado_cerrojo')) && /· PARAR: el dueño es dueno_ficticio/.test(linea(qH, 'roles')), `${linea(qH, 'public.mercado_cerrojo')} / ${linea(qH, 'roles')}`)
    const vuelta = [pg.psql(`revoke dueno_ficticio from authenticated;`, 'postgres'), pg.psql(`alter table public.mercado_cerrojo owner to postgres; revoke all on public.mercado_cerrojo from dueno_ficticio;`, dC)]
    if (!vuelta.every(x => x.ok)) throw new Error(`deshacer E2R5-01: ${vuelta.map(x => x.err).join(' ')}`)
    const rF = pg.psql(`create rule no_insert as on insert to public.mercado_cerrojo do instead nothing;`, dC), qF = s14(dC)
    oraculo('E2R4-02', 's14 enseña una regla de reescritura en el cerrojo (reglas=1)', rF.ok && /· reglas=1 ·/.test(linea(qF, 'public.mercado_cerrojo')), linea(qF, 'public.mercado_cerrojo') || rF.err)
  }

  titulo('10 · protect_delete (CTO 14-oct, s14b): la sonda prueba la RLS y no el disparador')
  {
    // los mutantes de prueba: sin el ajuste (el DELETE vuelve a chocar con protect_delete) y sin la precondicion de escritura
    const AJ_PON = "            perform pg_catalog.set_config('storage.allow_delete_query', 'true', true);\n"
    const AJ_REPON = "            perform pg_catalog.set_config('storage.allow_delete_query', coalesce(ajuste_previo, ''), true);\n"
    const M1sinAjuste = M1.replace(AJ_PON, '').replace(AJ_REPON, '')
    const RAISE_ESCRITURA = /raise exception 'mercado-001: politicas de ESCRITURA[^']*', de_escritura;/
    const abierta = m => m.replace(RAISE_CAPA1, 'null;').replace(RAISE_ESCRITURA, 'null;')
    ver('el mutante «sin ajuste» quita exactamente las dos lineas del ajuste', M1.includes(AJ_PON) && M1.includes(AJ_REPON) && M1sinAjuste.length === M1.length - AJ_PON.length - AJ_REPON.length && !/set_config\('storage\.allow_delete_query', 'true'/.test(M1sinAjuste))
    ver('el mutante «sin precondicion» quita exactamente el raise de las politicas de escritura', abierta(M1) !== M1sinCapa1 && !/politicas de ESCRITURA en storage\.objects aplicables/.test(abierta(M1)))
    // con los grants de Supabase sobre storage (s14b: anon y authenticated SELECT, INSERT, UPDATE y DELETE): sin ellos el
    // DELETE de la sonda se queda en «permission denied» y nunca llega a protect_delete
    const d0 = monta(SUPA)
    ver('control: el montaje tiene los cuerpos medidos en produccion byte a byte (md5 de la s14b)', pg.psql(COMPRUEBA_MD5, d0).out === MD5_ESPERADO, pg.psql(COMPRUEBA_MD5, d0).out)
    ver('control: en el montaje, protect_delete de verdad bloquea un DELETE directo (42501, antes de la RLS)', (() => { const x = pg.psql(`begin; set local role anon; delete from storage.objects where false; rollback;`, d0); return !x.ok && /Direct deletion from storage tables is not allowed/.test(x.err) })())

    // 1 verde real: con protect_delete presente y la RLS que bloquea, aplica; el informe dice el ajuste al terminar
    const a0 = estado(d0)
    const r0 = pg.psql(`begin;\n${M1}\ncommit;`, d0)
    oraculo('PD-01', 'con protect_delete (cuerpo de produccion) y la RLS bloqueando: aplica, el centinela no queda', r0.ok && /FIN\|mercado-001 aplicada$/.test(r0.out) && /objetos en mercado\|0/.test(r0.out) && estado(d0).split('\n')[0].includes('mercado:false:5242880'), err1(r0) || r0.out)
    oraculo('PD-01', 'el informe dice la prueba funcional (CTO 3a): tras la sonda, un DELETE directo de prueba lo paro protect_delete; y el md5 acreditado', /^protect_delete\|tras la sonda, un DELETE directo de prueba \(fila inexistente\) fallo con el error de protect_delete: vuelve a proteger · md5 acreditado 998d324ea2b1abc49351e8c2367b5796$/m.test(r0.out) && !/^ajuste\|/m.test(r0.out), (r0.out.split('\n').find(l => l.startsWith('protect_delete')) || r0.err))
    ver('control: antes no habia bucket mercado', !a0.split('\n')[0].includes('mercado:'))

    // 2 rojo: el mutante sin el ajuste. El DELETE choca con protect_delete y la sonda NO lo cuenta como «la RLS bloquea»
    const d1 = monta(SUPA), a1 = estado(d1)
    const r1 = pg.psql(M1sinAjuste, d1)
    oraculo('PD-02', 'sin el set_config (mutante): «sonda no concluyente» por el 42501 de protect_delete, nunca verde; nada cambia', !r1.ok && /sonda no concluyente: anon DELETE: 42501 con el mensaje de protect_delete \(Direct deletion from storage tables is not allowed[^)]*\): no prueba la RLS; authenticated DELETE: 42501 con el mensaje de protect_delete/.test(r1.err) && estado(d1) === a1, err1(r1))

    // 3 rojo: una politica que deja borrar a anon o a authenticated (con el disparador presente): la sonda la ALCANZA
    for (const rol of ['anon', 'authenticated']) {
      const d = monta(SUPA + `create policy "borra-${rol}" on storage.objects for delete to ${rol} using (bucket_id = 'mercado');
create policy "ve-${rol}" on storage.objects for select to ${rol} using (bucket_id = 'mercado');`)
      const a = estado(d)
      const r = pg.psql(abierta(M1), d)
      oraculo('PD-03', `una politica DELETE para ${rol} (sin capa 1 ni precondicion, mutante): la sonda llega a la RLS con protect_delete presente y ALCANZA «${rol} DELETE»; nada cambia`, !r.ok && new RegExp(`la sonda ALCANZA el bucket mercado: .*${rol} DELETE;`).test(r.err) && estado(d) === a, err1(r))
      const rS = pg.psql(abierta(M1sinAjuste), d)
      ver(`control (el falso verde de antes): sin el ajuste, el mismo caso NO ve el DELETE de ${rol} (protect_delete lo tapa)`, !rS.ok && /ALCANZA/.test(rS.err) && !new RegExp(`${rol} DELETE;`).test(rS.err), err1(rS))
      const rP = pg.psql(M1, d)
      oraculo('PD-03', `y con mercado-001 tal cual, esa politica la paran las guardas (lista blanca o precondicion) antes de la sonda`, !rP.ok && /NO RECONOCIDAS|politicas de ESCRITURA/.test(rP.err) && estado(d) === a, err1(rP))
    }

    // 4 el ajuste no se queda en true: ni al acabar bien, ni si la sonda falla a mitad, ni en la misma sesion despues
    const SIN_PARAR = '\\set ON_ERROR_STOP 0\n'
    const sesion = (texto, db) => {
      const f = path.join(pg.dir, 'ses.sql'); writeFileSync(f, SIN_PARAR + texto)
      const r = spawnSync(path.join(BIN, 'psql'), ['-h', pg.dir, '-p', pg.puerto, '-U', 'postgres', '-X', '-q', '-tA', '-d', db, '-f', f], { encoding: 'utf8', env: { PATH: process.env.PATH, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } })
      return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
    }
    // despues, en la misma sesion y como postgres: el ajuste y un DELETE directo (que protect_delete tiene que parar)
    const DESPUES = `\nrollback;\nselect 'ajuste=' || coalesce('«' || current_setting('storage.allow_delete_query', true) || '»', 'NULL');\nbegin; delete from storage.objects where false; rollback;\n`
    // a) la sonda falla a mitad: un segundo disparador por sentencia que revienta DESPUES de protect_delete (con el ajuste puesto)
    const dF = monta(SUPA + `create function storage.zz_revienta() returns trigger language plpgsql as $f$ begin raise exception 'revienta a mitad del DELETE'; end $f$;
create trigger zz_revienta before delete on storage.objects for each statement execute function storage.zz_revienta();`)
    const sF = sesion(`begin;\n${M1listaAbierta}` + DESPUES, dF)
    oraculo('PD-04', 'si el DELETE de la sonda revienta a mitad (con el ajuste puesto): mercado-001 aborta «no concluyente», y en la MISMA sesion el ajuste no es true y protect_delete vuelve a bloquear', /sonda no concluyente: anon DELETE: P0001 revienta a mitad del DELETE/.test(sF.err) && /^ajuste=«»$/m.test(sF.out) && /Direct deletion from storage tables is not allowed/.test(sF.err.split('revienta a mitad').at(-1)), JSON.stringify(sF))
    // b) la sonda aborta porque alcanza (politica abierta): igual
    const dA = monta(SUPA + `create policy "borra-anon" on storage.objects for delete to anon using (bucket_id = 'mercado'); create policy "ve-anon" on storage.objects for select to anon using (bucket_id = 'mercado');`)
    const sA = sesion(`begin;\n${abierta(M1)}` + DESPUES, dA)
    oraculo('PD-04', 'si la sonda aborta porque ALCANZA: en la misma sesion el ajuste no es true y protect_delete bloquea', /la sonda ALCANZA/.test(sA.err) && /^ajuste=«»$/m.test(sA.out) && /Direct deletion from storage tables is not allowed/.test(sA.err.split('ALCANZA').at(-1)), JSON.stringify(sA))
    // c) al acabar bien, en la misma sesion
    const sB = sesion(`begin;\n${M1}\ncommit;\nselect 'ajuste=' || coalesce('«' || current_setting('storage.allow_delete_query', true) || '»', 'NULL');\nbegin; delete from storage.objects where false; rollback;\n`, monta(SUPA))
    oraculo('PD-04', 'al acabar bien: en la misma sesion el ajuste no es true y protect_delete bloquea', /FIN\|mercado-001 aplicada/.test(sB.out) && /^ajuste=«»$/m.test(sB.out) && /Direct deletion from storage tables is not allowed/.test(sB.err), JSON.stringify(sB))
    // d) la guarda final: si el ajuste quedara en true, aborta (mutante que lo deja puesto justo antes de la guarda)
    const GUARDA = "  if pg_catalog.current_setting('storage.allow_delete_query', true) = 'true' then\n    raise exception 'mercado-001: tras la sonda storage.allow_delete_query vale true"
    const M1deja = M1.replace(GUARDA, "  perform pg_catalog.set_config('storage.allow_delete_query', 'true', true);\n" + GUARDA)
    ver('el mutante «deja el ajuste» añade exactamente una linea delante de la guarda', M1.includes(GUARDA) && M1deja.length > M1.length)
    const dD = monta(SUPA), aD = estado(dD)
    const rD = pg.psql(M1deja, dD)
    oraculo('PD-04', 'si el ajuste quedara en true tras la sonda (mutante): aborta y nada cambia', !rD.ok && /tras la sonda storage\.allow_delete_query vale true/.test(rD.err) && estado(dD) === aD, err1(rD))
    // d2) la prueba funcional (CTO 3a): sin la guarda del valor y con el ajuste dejado en true, el DELETE directo de
    // prueba ya no falla y mercado-001 aborta por eso
    const GUARDA_VALOR = /  if pg_catalog\.current_setting\('storage\.allow_delete_query', true\) = 'true' then\n    raise exception 'mercado-001: tras la sonda storage\.allow_delete_query vale true; no se crea nada';\n  end if;\n/
    const M1sinGuardaDeja = M1.replace(GUARDA_VALOR, "  perform pg_catalog.set_config('storage.allow_delete_query', 'true', true);\n")
    ver('el mutante «sin la guarda del valor y dejando el ajuste» cambia exactamente esa guarda', M1sinGuardaDeja !== M1 && !/tras la sonda storage\.allow_delete_query vale true/.test(M1sinGuardaDeja))
    const dG = monta(SUPA), aG = estado(dG), rG = pg.psql(M1sinGuardaDeja, dG)
    oraculo('PD-06', 'prueba funcional: si tras la sonda protect_delete no protegiera (ajuste en true, sin la guarda del valor), el DELETE directo de prueba lo detecta y aborta; nada cambia', !rG.ok && /tras la sonda, un DELETE directo de prueba NO lo para protect_delete/.test(rG.err) && estado(dG) === aG, err1(rG))
    // si quien ejecuta no tuviera DELETE en storage.objects, el DELETE de prueba fallaria por permisos y no por
    // protect_delete: falla cerrado (pgx, el postgres no superusuario, sin DELETE)
    // (pgx hereda de anon y authenticated: se les quita a los tres; la sonda de esos roles queda en «permission denied»)
    const dO = monta(SUPA + PGX + `revoke delete on storage.objects from pgx, anon, authenticated;`)
    ver('control: pgx no tiene DELETE en storage.objects', pg.psql(`select has_table_privilege('pgx', 'storage.objects', 'DELETE')`, dO).out === 'f')
    const aO = estado(dO), rO = comoPgx(M1, dO)
    oraculo('PD-06', 'si quien ejecuta no tiene DELETE en storage.objects: el DELETE de prueba falla por permisos, no por protect_delete → aborta y nada cambia', !rO.ok && /el DELETE directo de prueba fallo por otra cosa \(42501: permission denied for table objects\)/.test(rO.err) && estado(dO) === aO, err1(rO))
    // 3b: el md5 completo de protect_delete
    const dM = monta(SUPA + `create or replace function storage.protect_delete() returns trigger language plpgsql as $f$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END; 
$f$;`)
    ver('control: el cuerpo alterado tiene un caracter mas que el medido y su md5 ya no es el acreditado', pg.psql(`select (md5(prosrc) <> '998d324ea2b1abc49351e8c2367b5796')::text || ',' || length(prosrc) from pg_proc where proname = 'protect_delete'`, dM).out === `true,${pg.psql(`select length(prosrc) + 1 from pg_proc where proname = 'protect_delete'`, d0).out}`)
    const aM = estado(dM), rM = pg.psql(M1, dM)
    oraculo('PD-07', 'protect_delete con el cuerpo alterado (un espacio): aborta «protect_delete ha cambiado: re-acreditar» y nada cambia', !rM.ok && /protect_delete ha cambiado: re-acreditar/.test(rM.err) && estado(dM) === aM, err1(rM))
    // e) el ajuste ya true al empezar (fijado por base): aborta
    const dT = monta(SUPA); pg.psql(`alter database ${dT} set storage.allow_delete_query = 'true'`, 'postgres')
    const aT2 = estado(dT), rT2 = pg.psql(M1, dT)
    oraculo('PD-04', 'con storage.allow_delete_query ya true al empezar: aborta (protect_delete apagado para todos) y nada cambia', !rT2.ok && /ya vale true al empezar/.test(rT2.err) && estado(dT) === aT2, err1(rT2))

    // 5 protect_objects_delete tiene que existir, con su forma y habilitado
    const CASOS = [
      ['no existe', '', { sinStorage: true }],
      ['desactivado', `alter table storage.objects disable trigger protect_objects_delete;`],
      ['solo en replica', `alter table storage.objects enable replica trigger protect_objects_delete;`],
      ['por fila', `drop trigger protect_objects_delete on storage.objects; create trigger protect_objects_delete before delete on storage.objects for each row execute function storage.protect_delete();`],
      ['AFTER', `drop trigger protect_objects_delete on storage.objects; create trigger protect_objects_delete after delete on storage.objects for each statement execute function storage.protect_delete();`],
      ['otra funcion', `drop trigger protect_objects_delete on storage.objects; create trigger protect_objects_delete before delete on storage.objects for each statement execute function storage.update_updated_at_column();`],
    ]
    for (const [nombre, extra, op] of CASOS) {
      const d = monta(SUPA + extra, op || {})
      const a = estado(d)
      const r = pg.psql(M1, d)
      oraculo('PD-05', `protect_objects_delete ${nombre}: aborta «falta el disparador protect_objects_delete» y nada cambia`, !r.ok && /falta el disparador protect_objects_delete de Supabase/.test(r.err) && estado(d) === a, err1(r))
    }
    // 6 s14: el inventario cubre storage.buckets, con cuerpo y PARAR; la acreditacion exige definicion, habilitado y md5 completo
    ver('control: el montaje tiene los cuerpos de buckets medidos en produccion byte a byte (md5 de la s14c)', pg.psql(COMPRUEBA_MD5_BUCKETS, d0).out === MD5_BUCKETS_ESPERADO, pg.psql(COMPRUEBA_MD5_BUCKETS, d0).out)
    // un cuerpo de buckets cambiado (una linea): NO ACREDITADO, su cuerpo linea a linea y PARAR
    const dB = monta(`create or replace function storage.enforce_bucket_name_length() returns trigger language plpgsql as $f$
begin
    if length(new.name) > 63 then raise exception 'bucket name too long'; end if;
    return new;
end;
$f$;`)
    const qB = s14(dB)
    oraculo('S14-CTO', 's14: una funcion de buckets con el cuerpo cambiado → su disparador NO ACREDITADO, los demas acreditados, y el resumen manda PARAR', qB.ok && /^disparador\|buckets\.enforce_bucket_name_length_trigger\|BEFORE INSERT\/UPDATE · por fila · storage\.enforce_bucket_name_length · funcion de storage · plpgsql · SECURITY INVOKER · dueño=supabase_storage_admin · proconfig=- · volatilidad=v · md5 del cuerpo [0-9a-f]{12} · NO ACREDITADO \(difiere: md5, atributos\)$/m.test(qB.out) && (qB.out.match(/^disparador\|buckets\.[a-z_]+\|.* · acreditado \(CTO 14-oct\)$/mg) || []).length === 4 && /^disparador\|\(resumen\)\|storage\.objects: 2 \(1 por sentencia\) · storage\.buckets: 5 · sin acreditar: 1: la sonda y el INSERT del bucket de mercado-001 los disparan; PARAR hasta que el CTO acredite/m.test(qB.out), qB.out.split('\n').filter(x => /disparador/.test(x)).join(' / ') || qB.err)
    const cuerpo = qB.out.split('\n').filter(x => x.startsWith('cuerpo|storage.enforce_bucket_name_length ')).map(x => x.split('|').slice(2).join('|'))
    const md5B = pg.psql(`select md5(prosrc) from pg_proc where proname = 'enforce_bucket_name_length'`, dB).out
    oraculo('S14-CTO', 's14: el cuerpo de la funcion no acreditada, linea a linea, reconstruye prosrc byte a byte; las acreditadas no sacan cuerpo', cuerpo.length > 2 && createHash('md5').update(cuerpo.join('\n')).digest('hex') === md5B && qB.out.split('\n').filter(x => x.startsWith('cuerpo|')).every(x => x.startsWith('cuerpo|storage.enforce_bucket_name_length ')), `${cuerpo.length} lineas · ${md5B}`)
    const qB2 = s14(monta(`drop trigger protect_bucket_control_insert on storage.buckets; create trigger protect_bucket_control_insert before insert on storage.buckets for each row execute function storage.protect_bucket_control_columns('otro_rol');`))
    oraculo('S14-CTO', 's14: el mismo cuerpo con otro argumento (protect_bucket_control_columns(\'otro_rol\')) → NO ACREDITADO (la definicion cuenta)', qB2.ok && /^disparador\|buckets\.protect_bucket_control_insert\|.* · NO ACREDITADO \(difiere: definicion\)$/m.test(qB2.out) && /sin acreditar: 1: .*PARAR/.test(qB2.out), qB2.out.split('\n').filter(x => /disparador/.test(x)).join(' / ') || qB2.err)
    for (const [nombre, extra, cuantos] of [
      ['el cuerpo de protect_delete cambiado (lo usan objects y buckets: 2 sin acreditar)', `create or replace function storage.protect_delete() returns trigger language plpgsql as $f$ begin return null; end; $f$;`, 2],
      ['habilitado SIEMPRE (A, no el medido)', `alter table storage.objects enable always trigger protect_objects_delete;`],
      ['desactivado', `alter table storage.objects disable trigger update_objects_updated_at;`],
      ['otra definicion (BEFORE UPDATE OF name)', `drop trigger update_objects_updated_at on storage.objects; create trigger update_objects_updated_at before update of name on storage.objects for each row execute function storage.update_updated_at_column();`],
    ]) {
      const q = s14(monta(extra))
      oraculo('S14-CTO', `s14: ${nombre} → NO ACREDITADO y PARAR`, q.ok && /^disparador\|(protect_objects_delete|update_objects_updated_at)\|.* · NO ACREDITADO \(difiere: (md5, atributos|habilitado|definicion)\)$/m.test(q.out) && new RegExp(`^disparador\\|\\(resumen\\)\\|.*sin acreditar: ${cuantos ?? 1}: .*PARAR`, 'm').test(q.out), q.out.split('\n').filter(x => /disparador/.test(x)).join(' / ') || q.err)
    }
    const dAl = monta(SUPA + `alter table storage.objects enable always trigger protect_objects_delete;`)
    const aAl = estado(dAl)
    const rAl = pg.psql(M1, dAl)
    oraculo('PD-05', 'habilitado SIEMPRE (tgenabled=A), distinto del acreditado (O): E2R7-01, aborta «NO ACREDITADOS … (difiere: habilitado)» y nada cambia', !rAl.ok && /disparadores de storage NO ACREDITADOS: protect_objects_delete \(difiere: habilitado\)/.test(rAl.err) && estado(dAl) === aAl, err1(rAl))
  }

  titulo('11 · E2R7-01 (Astra r7): la acreditacion compara tambien el contexto de cada funcion')
  {
    // la ficha medida en produccion, literal de las salidas de la s14b y la s14c
    const fichasProd = ['s14b-disparadores-storage-2026-10-14.csv', 's14c-disparadores-buckets-2026-10-14.csv']
      .flatMap(f => lee(`sql/consultas/salidas/${f}`).split('\n').filter(l => l.startsWith('funcion,storage.')))
      .map(l => { const m = l.match(/^funcion,storage\.([a-z_]+)(?:\(\))?,"?existe · (plpgsql · SECURITY (?:INVOKER|DEFINER) · dueño=[^ ]+ · proconfig=[^ ]+) · (?:devuelve=[a-z]+ · )?(volatilidad=[ivs])/); return m && `${m[1]}: ${m[2]} · ${m[3]}` })
    const prod = [...new Set(fichasProd)].sort().join('\n')
    const d0 = monta(SUPA)
    const montaje = pg.psql(FICHAS_MONTAJE, d0).out
    ver('control: en el montaje, la ficha de cada una de las cinco funciones (lenguaje, SECURITY, dueño, proconfig, volatilidad) es la literal de la s14b/s14c de produccion', !fichasProd.includes(null) && prod.split('\n').length === 5 && montaje === prod, `${montaje} ≠ ${prod}`)
    const q0 = s14(d0)
    oraculo('E2R7-01', 'con las fichas de produccion: los siete acreditados y el resumen no pide parar', q0.ok && (q0.out.match(/^disparador\|.* · acreditado \(CTO 14-oct\)$/mg) || []).length === 7 && /sin acreditar: 0: todos acreditados/.test(q0.out), q0.out.split('\n').filter(x => /disparador/.test(x)).join(' / ') || q0.err)
    const bloque = t => { const a = t.indexOf('-- >>> acreditados'), b = t.indexOf('-- <<< acreditados'); return a >= 0 && b > a ? t.slice(a, b) : null }
    oraculo('E2R7-01', 'la lista acreditada y su comparacion son el mismo bloque, byte a byte, en s14 y en mercado-001', bloque(M1) !== null && bloque(M1) === bloque(S14))
    const EFECTO = `create sequence public.astra_efecto;
create function public.length(text) returns integer language plpgsql as $x$ begin perform nextval('public.astra_efecto'); return 7; end $x$;`
    const CASOS = [
      ['Astra: SET search_path = public, pg_catalog en enforce_bucket_name_length, con un public.length sintetico', `${EFECTO}\nalter function storage.enforce_bucket_name_length() set search_path = public, pg_catalog;`, ['buckets.enforce_bucket_name_length_trigger'], 'proconfig, atributos'],
      ['Astra: SECURITY DEFINER en protect_bucket_control_columns', `alter function storage.protect_bucket_control_columns() security definer;`, ['buckets.protect_bucket_control_insert', 'buckets.protect_bucket_control_update'], 'seguridad, atributos'],
      ['otro dueño de update_updated_at_column', `alter function storage.update_updated_at_column() owner to postgres;`, ['update_objects_updated_at'], 'dueño'],
      ['un proconfig añadido sin cambiar el cuerpo (enforce_bucket_lifecycle_service_role, lock_timeout)', `alter function storage.enforce_bucket_lifecycle_service_role() set lock_timeout = '1s';`, ['buckets.protect_bucket_control_update_role'], 'proconfig, atributos'],
      ['un proconfig añadido a una que no tenia (protect_delete, search_path), el cuerpo igual', `alter function storage.protect_delete() set search_path = public, pg_catalog;`, ['protect_objects_delete', 'buckets.protect_buckets_delete'], 'proconfig, atributos'],
      ['otra volatilidad (enforce_bucket_name_length STABLE)', `alter function storage.enforce_bucket_name_length() stable;`, ['buckets.enforce_bucket_name_length_trigger'], 'volatilidad, atributos'],
      ['SECURITY DEFINER en protect_delete (el md5 igual)', `alter function storage.protect_delete() security definer;`, ['protect_objects_delete', 'buckets.protect_buckets_delete'], 'seguridad, atributos'],
    ]
    for (const [nombre, extra, cuales, campo] of CASOS) {
      const d = monta(SUPA + extra)
      const q = s14(d)
      const lineas = q.out.split('\n').filter(x => x.startsWith('disparador|'))
      const malos = cuales.every(c => lineas.some(l => l.startsWith(`disparador|${c}|`) && l.endsWith(` · NO ACREDITADO (difiere: ${campo})`)))
      const buenos = lineas.filter(l => / · acreditado \(CTO 14-oct\)$/.test(l)).length === 7 - cuales.length
      oraculo('E2R7-01', `s14: ${nombre} → ${cuales.join(', ')} NO ACREDITADO (difiere: ${campo}), los demas acreditados, PARAR`, q.ok && malos && buenos && new RegExp(`^disparador\\|\\(resumen\\)\\|.*sin acreditar: ${cuales.length}: .*PARAR`, 'm').test(q.out), lineas.join(' / ') || q.err)
      const a = estado(d)
      const r = pg.psql(M1, d)
      oraculo('E2R7-01', `mercado-001: ${nombre} → aborta «disparadores de storage NO ACREDITADOS» nombrandolos, y nada cambia`, !r.ok && /mercado-001: disparadores de storage NO ACREDITADOS/.test(r.err) && cuales.every(c => r.err.includes(c)) && estado(d) === a, err1(r))
      if (extra.startsWith(EFECTO)) {
        const e = pg.psql(`select last_value || ':' || is_called from public.astra_efecto`, d).out
        oraculo('E2R7-01', 'mercado-001 aborta ANTES del INSERT del bucket: la funcion sintetica no llega a ejecutarse (la secuencia, que no se deshace, sigue sin usar)', e === '1:false', e)
      }
    }
  }

  titulo('12 · type y versioning_status (CTO 15-oct, con la s14d): postcondicion en mercado-001 y acreditacion en s14')
  {
    const d0 = monta(SUPA)
    const q0 = s14(d0)
    const fila = (q, o) => q.out.split('\n').find(l => l.startsWith(`columnas-bucket|${o}|`))
    oraculo('TYPE', 's14 con los valores de la s14d: type, versioning_status y el enum «acreditado (s14d, 15-oct)»', q0.ok
      && fila(q0, 'type') === "columnas-bucket|type|por defecto 'STANDARD'::storage.buckettype · acreditado (s14d, 15-oct)"
      && fila(q0, 'versioning_status') === "columnas-bucket|versioning_status|por defecto 'DISABLED'::text · acreditado (s14d, 15-oct)"
      && fila(q0, 'storage.buckettype') === 'columnas-bucket|storage.buckettype|{STANDARD,ANALYTICS,VECTOR} · acreditado (s14d, 15-oct)', q0.out.split('\n').filter(l => l.startsWith('columnas-bucket|')).join(' / ') || q0.err)
    oraculo('TYPE', 'mercado-001 no fija type ni versioning_status (tienen el valor por defecto medido): el INSERT no los nombra', /insert into storage\.buckets \(id, name, public, file_size_limit, allowed_mime_types\) values/.test(M1) && !/insert into storage\.buckets \([^)]*\b(type|versioning_status)\b/.test(M1))
    const r0 = pg.psql(M1, d0)
    oraculo('TYPE', 'mercado-001 aplica y el informe dice la postcondicion (type, versioning_status, ciclo de vida)', r0.ok && /^postcondicion\|bucket mercado · type=STANDARD · versioning_status=DISABLED · lifecycle_configuration=NULL · lifecycle_configuration_generation=NULL$/m.test(r0.out), r0.err || r0.out)
    const CASOS = [
      ['el valor por defecto de type cambiado (ANALYTICS)', `alter table storage.buckets alter column type set default 'ANALYTICS';`, ['type'], /type=ANALYTICS/],
      ['otro valor por defecto de versioning_status (ENABLED)', `alter table storage.buckets alter column versioning_status set default 'ENABLED';`, ['versioning_status'], /versioning_status=ENABLED/],
      ['el enum sin STANDARD (y type por defecto ANALYTICS)', `alter table storage.buckets drop column type; drop type storage.buckettype; create type storage.buckettype as enum ('ANALYTICS', 'VECTOR');
alter table storage.buckets add column type storage.buckettype not null default 'ANALYTICS';`, ['type', 'storage.buckettype'], /type=ANALYTICS/, /mercado-001: el enum storage\.buckettype no es el acreditado: \{ANALYTICS,VECTOR\}/],
      ['una columna de ciclo de vida con valor por defecto', `alter table storage.buckets alter column lifecycle_configuration set default '{}'::jsonb;`, [], /lifecycle_configuration=\{\}/],
    ]
    // E2R8-02 (ronda 9): con el enum cambiado, mercado-001 aborta antes del INSERT por el enum, no por la postcondicion
    for (const [nombre, extra, malos, dice, porEnum] of CASOS) {
      const d = monta(SUPA + extra)
      if (malos.length) {
        const q = s14(d)
        oraculo('TYPE', `s14: ${nombre} → ${malos.join(', ')} «NO ACREDITADO … PARAR»`, q.ok && malos.every(o => / · NO ACREDITADO \(s14d: .*\): PARAR$/.test(fila(q, o) || '')) && ['type', 'versioning_status', 'storage.buckettype'].filter(o => !malos.includes(o)).every(o => / · acreditado \(s14d, 15-oct\)$/.test(fila(q, o) || '')), q.out.split('\n').filter(l => l.startsWith('columnas-bucket|')).join(' / ') || q.err)
      }
      const a = estado(d)
      const r = pg.psql(M1, d)
      oraculo('TYPE', `mercado-001: ${nombre} → aborta por ${porEnum ? 'el enum (E2R8-02)' : 'la postcondicion'}, dice lo que encontro, y nada cambia`, !r.ok && (porEnum ? porEnum.test(r.err) : /mercado-001: el bucket mercado no es el esperado/.test(r.err) && dice.test(r.err)) && estado(d) === a, err1(r))
    }
  }

  titulo('13 · CTO 15-oct: disparadores fuera de la lista abortan; la postcondicion tambien en la reejecucion')
  {
    // 2) un disparador que no esta en la lista: mercado-001 aborta ANTES del INSERT, como s14 manda PARAR
    const EFECTO = `create sequence public.efecto_ajeno;
create function storage.ajena() returns trigger language plpgsql as $x$ begin perform nextval('public.efecto_ajeno'); return new; end $x$;`
    for (const [nombre, extra, cual] of [
      ['un BEFORE INSERT nuevo en storage.buckets', `${EFECTO}\ncreate trigger ajeno_buckets before insert on storage.buckets for each row execute function storage.ajena();`, 'buckets.ajeno_buckets'],
      ['un BEFORE INSERT nuevo en storage.objects', `${EFECTO}\ncreate trigger ajeno_objects before insert on storage.objects for each row execute function storage.ajena();`, 'ajeno_objects'],
      ['uno nuevo desactivado en storage.buckets', `${EFECTO}\ncreate trigger ajeno_buckets before insert on storage.buckets for each row execute function storage.ajena(); alter table storage.buckets disable trigger ajeno_buckets;`, 'buckets.ajeno_buckets'],
    ]) {
      const d = monta(SUPA + extra)
      const a = estado(d)
      const r = pg.psql(M1, d)
      const e = pg.psql(`select last_value || ':' || is_called from public.efecto_ajeno`, d).out
      oraculo('FUERA-LISTA', `${nombre}: mercado-001 aborta «NO ACREDITADOS: ${cual} (difiere: no esta en la lista acreditada)», antes del INSERT (su funcion no corre) y nada cambia`, !r.ok && r.err.includes(`disparadores de storage NO ACREDITADOS: ${cual} (difiere: no esta en la lista acreditada)`) && e === '1:false' && estado(d) === a, `${err1(r)} · ${e}`)
    }
    // 3) la postcondicion tambien cuando el bucket ya existia (reejecucion)
    for (const [nombre, cambio, dice] of [
      ['type cambiado a ANALYTICS', `update storage.buckets set type = 'ANALYTICS' where id = 'mercado';`, /type=ANALYTICS/],
      ['versioning_status ENABLED', `update storage.buckets set versioning_status = 'ENABLED' where id = 'mercado';`, /versioning_status=ENABLED/],
      ['ciclo de vida puesto', `set session_replication_role = replica; update storage.buckets set lifecycle_configuration = '{"reglas":[]}'::jsonb, lifecycle_configuration_generation = gen_random_uuid() where id = 'mercado'; reset session_replication_role;`, /lifecycle_configuration=\{"reglas": \[\]\}/],
    ]) {
      const d = monta(SUPA)
      const r1 = pg.psql(M1, d)
      const c = pg.psql(cambio, d)
      const a = estado(d)
      const r2 = pg.psql(M1, d)
      oraculo('POST-REEJ', `reejecucion con el bucket mercado ya creado y ${nombre}: aborta «el bucket … no es el esperado» con lo que encontro, y nada cambia`, r1.ok && c.ok && !r2.ok && /mercado-001: el bucket mercado no es el esperado/.test(r2.err) && dice.test(r2.err) && estado(d) === a, `${c.err} · ${err1(r2)}`)
    }
    const dOk = monta(SUPA)
    pg.psql(M1, dOk)
    const rOk = pg.psql(M1, dOk)
    oraculo('POST-REEJ', 'reejecucion con el bucket intacto: termina bien («ya existe con esta forma») y la fila postcondicion dice STANDARD/DISABLED/NULL', rOk.ok && /ya existe con esta forma/.test(rOk.err) && /^postcondicion\|bucket mercado · type=STANDARD · versioning_status=DISABLED · lifecycle_configuration=NULL · lifecycle_configuration_generation=NULL$/m.test(rOk.out), rOk.err || rOk.out)
  }

  titulo('14 · ronda 9 (Astra r8, CTO 15-oct): presencia exacta de los siete y el enum por su array exacto')
  {
    // ── presencia exacta: ni uno menos. Familia: cada uno de los siete borrado (generada de la lista), pares borrados
    // elegidos con semilla fija (SEMILLA_PRESENCIA) y uno renombrado (falta el suyo y sobra otro)
    // R9-02 (revisor interno): «antes del INSERT» se mide, no se supone. Una columna testigo en storage.buckets con
    // valor por defecto nextval(): cualquier INSERT del bucket la consume, y la secuencia no se deshace con el aborto
    // (no es un disparador: no toca la lista acreditada). El ADD COLUMN ya la consume con las filas que hay (forex-data):
    // se compara con el valor tras el montaje, que se lee antes de ejecutar mercado-001
    const TESTIGO = `\ncreate sequence public.testigo_insert; alter table storage.buckets add column testigo bigint default nextval('public.testigo_insert');`
    const testigo = d => pg.psql(`select last_value || ':' || is_called from public.testigo_insert`, d).out
    const marcas = new Map()
    const montaT = extra => { const d = monta(SUPA + TESTIGO + extra); marcas.set(d, testigo(d)); return d }
    const sinInsert = d => /^\d+:(true|false)$/.test(marcas.get(d) || '') && testigo(d) === marcas.get(d)
    {
      const d = montaT('')
      ver('control: el testigo se consume con el INSERT de mercado-001 (aplica en el montaje limpio)', pg.psql(M1, d).ok && !sinInsert(d))
    }
    const SIETE = [['objects', 'protect_objects_delete'], ['objects', 'update_objects_updated_at'], ['buckets', 'enforce_bucket_name_length_trigger'],
      ['buckets', 'protect_bucket_control_insert'], ['buckets', 'protect_bucket_control_update'], ['buckets', 'protect_bucket_control_update_role'], ['buckets', 'protect_buckets_delete']]
    const cual = ([t, n]) => (t === 'objects' ? n : `buckets.${n}`)
    const SEMILLA_PRESENCIA = 20261015
    let sp = SEMILLA_PRESENCIA
    const azarP = () => { sp = (sp * 1103515245 + 12345) % 2147483648; return sp / 2147483648 }
    const pares = []
    while (pares.length < 4) { const a = Math.floor(azarP() * 7), b = Math.floor(azarP() * 7); if (a < b && !pares.some(([x, y]) => x === a && y === b)) pares.push([a, b]) }
    const familia = [
      ...SIETE.map(x => [`${x[1]} borrado${x[1] === 'enforce_bucket_name_length_trigger' ? ' (el caso de Astra r8)' : ''}`, [x], `drop trigger ${x[1]} on storage.${x[0]};`, []]),
      ...pares.map(([a, b]) => [`${SIETE[a][1]} y ${SIETE[b][1]} borrados (semilla ${SEMILLA_PRESENCIA})`, [SIETE[a], SIETE[b]], `drop trigger ${SIETE[a][1]} on storage.${SIETE[a][0]}; drop trigger ${SIETE[b][1]} on storage.${SIETE[b][0]};`, []]),
      ['update_objects_updated_at renombrado (falta el suyo, sobra otro)', [SIETE[1]], `alter trigger update_objects_updated_at on storage.objects rename to update_objects_updated_at2;`, ['update_objects_updated_at2 (difiere: no esta en la lista acreditada)']],
    ]
    ver(`control: la familia de presencia tiene los siete sueltos, ${pares.length} pares distintos y el renombrado`, familia.length === 7 + 4 + 1)
    for (const [nombre, quitados, extra, sobran] of familia) {
      const d = montaT(extra)
      const q = s14(d)
      const lineas = q.out.split('\n').filter(x => x.startsWith('disparador|'))
      const filasFalta = quitados.every(x => lineas.includes(`disparador|${cual(x)}|FALTA: no esta en storage.${x[0]} · NO ACREDITADO (difiere: falta)`))
      const k = quitados.length + sobran.length
      const resumen = new RegExp(`^disparador\\|\\(resumen\\)\\|storage\\.objects: ${2 - quitados.filter(x => x[0] === 'objects').length + sobran.length} .* · storage\\.buckets: ${5 - quitados.filter(x => x[0] === 'buckets').length} · sin acreditar: ${k}: .*PARAR`, 'm')
      oraculo('PRESENCIA', `s14: ${nombre} → fila «FALTA … NO ACREDITADO (difiere: falta)», el resumen cuenta ${k} sin acreditar y manda PARAR`, q.ok && filasFalta && resumen.test(q.out), lineas.join(' / ') || q.err)
      const a = estado(d)
      const r = pg.psql(M1, d)
      const conProtect = quitados.some(x => x[1] === 'protect_objects_delete')
      const dice = conProtect ? /mercado-001: falta el disparador protect_objects_delete/.test(r.err)
        : /mercado-001: disparadores de storage NO ACREDITADOS/.test(r.err) && quitados.every(x => r.err.includes(`${cual(x)} (difiere: falta)`)) && sobran.every(x => r.err.includes(x))
      oraculo('PRESENCIA', `mercado-001: ${nombre} → aborta antes del INSERT (el testigo sin consumir) ${conProtect ? '(la guarda de protect_objects_delete, que va antes)' : 'nombrandolo «(difiere: falta)»'} y nada cambia`, !r.ok && dice && sinInsert(d) && estado(d) === a, err1(r))
    }
    {
      // el escenario literal de Astra r8: en ed96d3e s14 decia «storage.buckets: 4 · sin acreditar: 0» y mercado-001 aplicaba
      const d = monta(SUPA + `drop trigger enforce_bucket_name_length_trigger on storage.buckets;`)
      const q = s14(d)
      oraculo('PRESENCIA', 'Astra r8: con enforce_bucket_name_length_trigger borrado, el resumen ya no dice «sin acreditar: 0»: «storage.buckets: 4 · sin acreditar: 1 … PARAR»', q.ok && /^disparador\|\(resumen\)\|storage\.objects: 2 \(1 por sentencia\) · storage\.buckets: 4 · sin acreditar: 1: .*PARAR/m.test(q.out) && !/sin acreditar: 0/.test(q.out), q.out.split('\n').filter(x => x.startsWith('disparador|(resumen)')).join(' / '))
      const rM = pg.psql(M1listaAbierta, monta(SUPA + `drop trigger enforce_bucket_name_length_trigger on storage.buckets;`))
      ver('control: el mutante de lista abierta sigue abortando por un disparador que falta, con «(difiere: falta)» (la presencia no depende de en_lista; R9-03)', !rM.ok && rM.err.includes('buckets.enforce_bucket_name_length_trigger (difiere: falta)'), err1(rM))
    }

    // ── E2R8-02: el enum por su array exacto. Familia: el caso de Astra, reordenadas, una añadida, una quitada, una
    // renombrada, el orden numerico cambiado (enumsortorder), no enum, y un generador con semilla fija (SEMILLA_ENUM)
    const q = x => `'${x.replace(/'/g, "''")}'`
    const enumCon = (etiquetas, porDefecto = etiquetas.includes('STANDARD') ? 'STANDARD' : etiquetas[0]) => `alter table storage.buckets drop column type; drop type storage.buckettype;
create type storage.buckettype as enum (${etiquetas.map(q).join(', ')});
alter table storage.buckets add column type storage.buckettype not null default ${q(porDefecto)};`
    const FIJOS = [
      ['Astra r8: dos etiquetas, STANDARD y «ANALYTICS,VECTOR»', enumCon(['STANDARD', 'ANALYTICS,VECTOR']), '{STANDARD,"ANALYTICS,VECTOR"}'],
      ['reordenadas (ANALYTICS, STANDARD, VECTOR)', enumCon(['ANALYTICS', 'STANDARD', 'VECTOR']), '{ANALYTICS,STANDARD,VECTOR}'],
      ['una añadida (ADD VALUE OTRO)', `alter type storage.buckettype add value 'OTRO';`, '{STANDARD,ANALYTICS,VECTOR,OTRO}'],
      ['una quitada (sin VECTOR)', enumCon(['STANDARD', 'ANALYTICS']), '{STANDARD,ANALYTICS}'],
      ['una renombrada (VECTOR → VECTORES)', `alter type storage.buckettype rename value 'VECTOR' to 'VECTORES';`, '{STANDARD,ANALYTICS,VECTORES}'],
      ['el orden numerico cambiado (enumsortorder de VECTOR a 0.5: las mismas etiquetas en otro orden)', `update pg_catalog.pg_enum set enumsortorder = 0.5 where enumtypid = 'storage.buckettype'::regtype and enumlabel = 'VECTOR';`, '{VECTOR,STANDARD,ANALYTICS}'],
      ['no es un enum (un dominio de text)', `alter table storage.buckets drop column type; drop type storage.buckettype; create domain storage.buckettype as text;
alter table storage.buckets add column type storage.buckettype not null default 'STANDARD';`, '(no es un enum o no existe)'],
    ]
    const SEMILLA_ENUM = 20261016
    let se = SEMILLA_ENUM
    const azarE = () => { se = (se * 1103515245 + 12345) % 2147483648; return se / 2147483648 }
    const POZO = ['STANDARD', 'ANALYTICS', 'VECTOR', 'standard', 'STANDARD ', 'ANALYTICS,VECTOR', 'STANDARD,ANALYTICS', 'VECTOR"', '{VECTOR}', 'NULL', 'OTRO']
    const generados = []
    while (generados.length < 16) {
      const n = 1 + Math.floor(azarE() * 5), et = []
      while (et.length < n) { const x = POZO[Math.floor(azarE() * POZO.length)]; if (!et.includes(x)) et.push(x) }
      if (et.join('\u0000') !== 'STANDARD\u0000ANALYTICS\u0000VECTOR' && !generados.some(g => g.join('\u0000') === et.join('\u0000'))) generados.push(et)
    }
    ver(`control: el generador (semilla ${SEMILLA_ENUM}) da 16 variantes distintas del acreditado, y alguna con etiquetas que se concatenan como las tres`, generados.length === 16 && generados.some(g => g.join(',') === 'STANDARD,ANALYTICS,VECTOR' || g.some(x => x.includes(','))))
    const casosEnum = [...FIJOS.map(([nombre, extra, visto]) => [nombre, extra, visto]), ...generados.map(et => [`generado ${JSON.stringify(et)}`, enumCon(et), null])]
    for (const [nombre, extra, visto] of casosEnum) {
      const d = montaT(extra)
      const qq = s14(d)
      const f = qq.out.split('\n').find(l => l.startsWith('columnas-bucket|storage.buckettype|')) || ''
      oraculo('E2R8-02', `s14: ${nombre} → «NO ACREDITADO (s14d: {STANDARD,ANALYTICS,VECTOR}): PARAR»${visto ? ` enseñando ${visto}` : ''}`, qq.ok && f.endsWith(' · NO ACREDITADO (s14d: {STANDARD,ANALYTICS,VECTOR}): PARAR') && (!visto || f === `columnas-bucket|storage.buckettype|${visto} · NO ACREDITADO (s14d: {STANDARD,ANALYTICS,VECTOR}): PARAR`), f || qq.err)
      const a = estado(d)
      const r = pg.psql(M1, d)
      oraculo('E2R8-02', `mercado-001: ${nombre} → aborta antes del INSERT (el testigo sin consumir) «el enum storage.buckettype no es el acreditado» y nada cambia`, !r.ok && /mercado-001: el enum storage\.buckettype no es el acreditado: /.test(r.err) && (!visto || r.err.includes(`no es el acreditado: ${visto};`)) && sinInsert(d) && estado(d) === a, err1(r))
    }
    {
      // R9-02: el mutante del revisor, la guarda del enum movida a DESPUES del INSERT, aborta con el mismo mensaje y deja
      // el mismo estado final; solo el testigo lo distingue
      const ini = M1.indexOf('  -- E2R8-02 (Astra r8, CTO 15-oct): el enum storage.buckettype tiene que ser EXACTAMENTE')
      const fin_ = M1.indexOf('  end if;\n', ini) + '  end if;\n'.length
      const guarda = M1.slice(ini, fin_)
      const sinGuarda = M1.slice(0, ini) + M1.slice(fin_)
      const ancla = "    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('mercado', 'mercado', false, 5242880, null);\n"
      const M1enumTrasInsert = sinGuarda.replace(ancla, ancla + guarda)
      const d = montaT(enumCon(['STANDARD', 'ANALYTICS,VECTOR']))
      const rM = pg.psql(M1enumTrasInsert, d)
      ver('control: el mutante «guarda del enum tras el INSERT» se construye (una guarda movida) y aborta igual, pero el testigo SI se consume: el oraculo lo caza', ini > 0 && M1enumTrasInsert !== M1 && M1enumTrasInsert.length === M1.length && !rM.ok && /no es el acreditado/.test(rM.err) && !sinInsert(d), err1(rM))
    }
    // R9-01 (revisor interno): la columna type tiene que ser DE storage.buckettype. Familia: text con el mismo valor por
    // defecto (H1), varchar, un dominio sobre el enum con CHECK (H1b) y sin el, otro enum en public (H1c) y otro en storage
    const colTipo = (decl, antes = '') => `${antes}\nalter table storage.buckets drop column type; alter table storage.buckets add column type ${decl};`
    const TIPOS = [
      ['text con el valor por defecto \'STANDARD\'::storage.buckettype (H1)', colTipo(`text not null default 'STANDARD'::storage.buckettype`), 'text'],
      ['varchar', colTipo(`varchar(20) not null default 'STANDARD'`), 'character varying(20)'],
      ['un dominio sobre el enum con CHECK (H1b)', colTipo(`storage.bt_dom not null default 'STANDARD'`, `create domain storage.bt_dom as storage.buckettype check (value <> 'VECTOR');`), 'storage.bt_dom'],
      ['un dominio sobre el enum sin CHECK', colTipo(`storage.bt_dom not null default 'STANDARD'`, `create domain storage.bt_dom as storage.buckettype;`), 'storage.bt_dom'],
      ['otro enum en public (H1c)', colTipo(`public.buckettype not null default 'STANDARD'`, `create type public.buckettype as enum ('STANDARD', 'PUBLICO');`), 'buckettype', 'public.buckettype'],
      ['otro enum en storage con las mismas etiquetas', colTipo(`storage.otro_tipo not null default 'STANDARD'`, `create type storage.otro_tipo as enum ('STANDARD', 'ANALYTICS', 'VECTOR');`), 'storage.otro_tipo'],
    ]
    // s14 corre con el search_path del editor (public sin calificar); mercado-001 con pg_catalog, pg_temp (calificado)
    for (const [nombre, extra, visto, vistoM = visto] of TIPOS) {
      const d = montaT(extra)
      const qq = s14(d)
      const f = qq.out.split('\n').find(l => l.startsWith('columnas-bucket|type (su tipo)|')) || ''
      oraculo('R9-01', `s14: la columna type es ${nombre} → «type (su tipo) | ${visto} · NO ACREDITADO (s14d: storage.buckettype): PARAR»`, qq.ok && f === `columnas-bucket|type (su tipo)|${visto} · NO ACREDITADO (s14d: storage.buckettype): PARAR`, f || qq.err)
      const a = estado(d)
      const r = pg.psql(M1, d)
      oraculo('R9-01', `mercado-001: la columna type es ${nombre} → aborta antes del INSERT (el testigo sin consumir) «la columna type … no es del tipo storage.buckettype» y nada cambia`, !r.ok && r.err.includes(`mercado-001: la columna type de storage.buckets no es del tipo storage.buckettype (es ${vistoM})`) && sinInsert(d) && estado(d) === a, err1(r))
    }
    {
      const qq = s14(monta(SUPA))
      oraculo('R9-01', 'con la columna medida: «type (su tipo) | storage.buckettype · acreditado (s14d, 15-oct)»', /^columnas-bucket\|type \(su tipo\)\|storage\.buckettype · acreditado \(s14d, 15-oct\)$/m.test(qq.out), qq.out.split('\n').filter(l => l.startsWith('columnas-bucket|')).join(' / ') || qq.err)
    }
    {
      // un operador «=» ajeno para text[] (siempre verdadero) en public: la comparacion usa el de pg_catalog
      const d = monta(SUPA + enumCon(['STANDARD', 'ANALYTICS,VECTOR']) + `
create function public.siempre(text[], text[]) returns boolean language sql immutable as $x$ select true $x$;
create operator public.= (leftarg = text[], rightarg = text[], function = public.siempre);`)
      const qq = s14(d)
      const r = pg.psql(M1, d)
      oraculo('E2R8-02', 'con un «=» ajeno de text[] en public que siempre dice verdadero: s14 sigue en PARAR y mercado-001 aborta por el enum', qq.ok && /^columnas-bucket\|storage\.buckettype\|.* · NO ACREDITADO .*: PARAR$/m.test(qq.out) && !r.ok && /no es el acreditado/.test(r.err), (qq.out.split('\n').find(l => l.startsWith('columnas-bucket|storage.buckettype')) || qq.err) + ' · ' + err1(r))
    }
    {
      // LIMITE declarado (pregunta al CTO): las mismas etiquetas en el MISMO orden con otros numeros de enumsortorder dan
      // el mismo array: se acredita. Lo que se compara es el array en el orden de enumsortorder (decision del CTO)
      const d = monta(SUPA + `update pg_catalog.pg_enum set enumsortorder = enumsortorder * 10 where enumtypid = 'storage.buckettype'::regtype;`)
      const qq = s14(d)
      oraculo('E2R8-02', 'limite: el mismo orden con otros enumsortorder (10, 20, 30) da el mismo array y se acredita; mercado-001 aplica', qq.ok && /^columnas-bucket\|storage\.buckettype\|\{STANDARD,ANALYTICS,VECTOR\} · acreditado \(s14d, 15-oct\)$/m.test(qq.out) && pg.psql(M1, d).ok, qq.out.split('\n').find(l => l.startsWith('columnas-bucket|storage.buckettype')) || qq.err)
    }
    const expr = t => (t.match(/coalesce\(\(select pg_catalog\.array_agg\(v\.enumlabel::pg_catalog\.text order by v\.enumsortorder\)[^\n]*?operator\(pg_catalog\.=\) array\['STANDARD', 'ANALYTICS', 'VECTOR'\]::pg_catalog\.text\[\], false\)/g) || [])
    oraculo('E2R8-02', 'la comparacion del enum es el mismo texto en s14 y en mercado-001 (una vez en cada uno)', expr(S14).length === 1 && expr(M1).length === 1 && expr(S14)[0] === expr(M1)[0])
    const exprT = t => (t.match(/coalesce\(\(select a\.atttypid from pg_catalog\.pg_attribute a where a\.attrelid = pg_catalog\.to_regclass\('storage\.buckets'\) and a\.attname = 'type' and not a\.attisdropped\) operator\(pg_catalog\.=\) pg_catalog\.to_regtype\('storage\.buckettype'\), false\)/g) || [])
    oraculo('R9-01', 'la comprobacion del tipo de la columna es el mismo texto en s14 y en mercado-001 (una vez en cada uno)', exprT(S14).length === 1 && exprT(M1).length === 1)

    titulo('15 · reglas (CTO 16-oct): pg_rewrite en storage.objects y storage.buckets entra en la presencia exacta; lo acreditado es ninguna')
    // Familia generada, exhaustiva: las dos tablas × INSERT/UPDATE/DELETE × (ALSO con efecto, INSTEAD NOTHING); una
    // desactivada en cada tabla; una con el nombre de un disparador acreditado. El efecto de las ALSO es una secuencia
    // (no se deshace): si mercado-001 llegara a escribir, se veria
    {
      const EFECTO = `\ncreate sequence public.efecto_regla;`
      const efecto = d => pg.psql(`select last_value || ':' || is_called from public.efecto_regla`, d).out
      const familia = []
      for (const t of ['objects', 'buckets'])
        for (const ev of ['INSERT', 'UPDATE', 'DELETE'])
          for (const [forma, accion] of [['ALSO', `do also select nextval('public.efecto_regla')`], ['INSTEAD', 'do instead nothing']]) {
            const n = `r_${t}_${ev.toLowerCase()}_${forma.toLowerCase()}`
            familia.push([`${forma} ${ev} en storage.${t}`, t, n, `create rule ${n} as on ${ev.toLowerCase()} to storage.${t} ${accion};`, `regla ${ev}${forma === 'INSTEAD' ? ' INSTEAD' : ''} · habilitada=O`])
          }
      for (const t of ['objects', 'buckets'])
        familia.push([`desactivada (DISABLE RULE) en storage.${t}`, t, `r_${t}_desactivada`, `create rule r_${t}_desactivada as on insert to storage.${t} do also select nextval('public.efecto_regla'); alter table storage.${t} disable rule r_${t}_desactivada;`, 'regla INSERT · habilitada=D'])
      familia.push(['con el nombre de un disparador acreditado (protect_buckets_delete)', 'buckets', 'protect_buckets_delete', `create rule protect_buckets_delete as on delete to storage.buckets do instead nothing;`, 'regla DELETE INSTEAD · habilitada=O'])
      ver('control: la familia de reglas tiene 2 × 3 × 2 + 2 + 1 = 15 casos', familia.length === 15)
      for (const [nombre, t, n, extra, detalle] of familia) {
        const d = montaT(EFECTO + '\n' + extra)
        const e0 = efecto(d)
        const qq = s14(d)
        const quien = t === 'objects' ? `regla ${n}` : `buckets.regla ${n}`
        const fila = `disparador|${quien}|storage.${t} · NO ACREDITADO (difiere: ${detalle}: no se acredita ninguna)`
        const lineas = qq.out.split('\n').filter(x => x.startsWith('disparador|'))
        oraculo('REGLAS', `s14: ${nombre} → su fila NO ACREDITADO, «(reglas)» 1 y el resumen cuenta 1 sin acreditar: PARAR`, qq.ok && lineas.includes(fila) && lineas.includes('disparador|(reglas)|1 reglas (pg_rewrite) en storage.objects y storage.buckets: NO ACREDITADAS (lo acreditado es ninguna); PARAR') && /^disparador\|\(resumen\)\|storage\.objects: 2 \(1 por sentencia\) · storage\.buckets: 5 · sin acreditar: 1: .*PARAR/m.test(qq.out), lineas.join(' / ') || qq.err)
        const a = estado(d)
        const r = pg.psql(M1, d)
        oraculo('REGLAS', `mercado-001: ${nombre} → aborta antes del INSERT (testigo y efecto sin consumir) nombrando la regla, y nada cambia`, !r.ok && r.err.includes(`mercado-001: disparadores de storage NO ACREDITADOS: ${quien} (difiere: ${detalle}: no se acredita ninguna)`) && sinInsert(d) && efecto(d) === e0 && estado(d) === a, err1(r))
      }
      {
        const qq = s14(monta(SUPA))
        oraculo('REGLAS', 'positivo: sin reglas, «(reglas)» dice 0 y ninguna, y los siete siguen acreditados', qq.ok && /^disparador\|\(reglas\)\|0 reglas \(pg_rewrite\) en storage\.objects y storage\.buckets: ninguna, como lo acreditado \(CTO 16-oct\)$/m.test(qq.out) && /sin acreditar: 0: todos acreditados/.test(qq.out), qq.out.split('\n').filter(x => x.startsWith('disparador|(')).join(' / ') || qq.err)
        const d = monta(SUPA + EFECTO + `\ncreate table public.otra (x int); create rule r_otra as on insert to public.otra do also select nextval('public.efecto_regla');`)
        const q2 = s14(d)
        ver('control: una regla en otra tabla (public.otra) no cuenta: «(reglas)» 0 y mercado-001 aplica', q2.ok && /^disparador\|\(reglas\)\|0 reglas /m.test(q2.out) && pg.psql(M1, d).ok, q2.out.split('\n').filter(x => x.startsWith('disparador|(')).join(' / ') || q2.err)
      }
      const exprR = t => (t.match(/from pg_catalog\.pg_rewrite w join pg_catalog\.pg_class r on r\.oid = w\.ev_class\n   where w\.ev_class in \(pg_catalog\.to_regclass\('storage\.objects'\), pg_catalog\.to_regclass\('storage\.buckets'\)\)/g) || [])
      oraculo('REGLAS', 'la lectura de las reglas esta dentro del bloque compartido (una vez en cada fichero)', exprR(S14).length === 1 && exprR(M1).length === 1)
    }

    titulo('16 · E2R8-01 (Astra r8; CTO 16-oct, s14e): los disparadores internos, por lista exacta en las dos direcciones')
    {
      // control: el montaje tiene los internos de produccion. La s14e (la misma consulta que corrio Ramon) sobre el
      // montaje da, quitando el nombre (lleva un oid), las mismas filas «interno» y «fk» que la salida literal del 16-oct
      const S14E = lee('sql/consultas/s14e-internos-storage.sql')
      const sinOid = l => l.replace(/ · nombre=RI_ConstraintTrigger_[ac]_\d+$/, '')
      const literal = lee('sql/consultas/salidas/s14e-internos-storage-2026-10-16.csv').split('\n').filter(l => /^(interno|fk|regla|externos|tabla),/.test(l))
        .map(l => { const m = /^([^,]+),([^,]+),(.*)$/.exec(l); return sinOid(`${m[1]}|${m[2]}|${m[3].replace(/^"|"$/g, '')}`) }).sort()
      const enMontaje = pg.psql(`begin read only;\n${S14E}\nrollback;`, monta(SUPA)).out.split('\n').filter(l => /^(interno|fk|regla|externos|tabla)\|/.test(l)).map(sinOid).sort()
      ver(`control: el montaje reproduce la s14e de produccion (${literal.length} filas: tablas, recuentos, 8 internos, 3 FK y 0 reglas), sin el oid del nombre`, literal.length === 16 && JSON.stringify(enMontaje) === JSON.stringify(literal), enMontaje.filter(x => !literal.includes(x)).concat(literal.filter(x => !enMontaje.includes(x)).map(x => 'falta: ' + x)).join(' / '))
      {
        const qq = s14(monta(SUPA))
        const acr = qq.out.split('\n').filter(l => /^disparador\|(buckets\.)?interno pg_catalog\.RI_FKey_\w+ · \w+\|.* · acreditado \(s14e, 16-oct\)$/.test(l))
        oraculo('INTERNOS', 'positivo: los ocho internos «acreditado (s14e, 16-oct)», «(internos)» 2 + 6, 8 de 8, y el resumen sin acreditar 0', qq.ok && acr.length === 8 && /^disparador\|\(internos\)\|storage\.objects: 2 · storage\.buckets: 6 · acreditados: 8 de 8: la lista exacta de la s14e \(CTO 16-oct\)$/m.test(qq.out) && /sin acreditar: 0: todos acreditados/.test(qq.out), qq.out.split('\n').filter(l => /interno|\(internos\)|\(resumen\)/.test(l)).join(' / ') || qq.err)
      }
      // la familia: cada FK quitada (uno de menos), una FK de mas, otra accion, la FK renombrada, un interno
      // desactivado, y los dos escenarios de Astra r8 (un disparador propio marcado interno; un acreditado marcado
      // interno). El efecto de un disparador propio es una secuencia (no se deshace)
      const desactiva = (t, fn) => `do $d$ begin execute pg_catalog.format('alter table storage.${t} disable trigger %I', (select tgname from pg_catalog.pg_trigger where tgrelid = 'storage.${t}'::regclass and tgisinternal and tgfoid = 'pg_catalog."${fn}"'::regproc order by tgname limit 1)); end $d$;`
      const EXTRA = `
create function storage.extra_interna() returns trigger language plpgsql as $f$ begin perform nextval('public.astra_efecto'); return new; end $f$;
create trigger extra_interna before insert on storage.buckets for each row execute function storage.extra_interna();
update pg_catalog.pg_trigger set tgisinternal = true where tgname = 'extra_interna';`
      const familia = [
        // [nombre, extra, cuantos sin acreditar (internos + otros), lo que tiene que nombrar mercado-001]
        ['objects_bucketId_fkey quitada (4 de menos)', `alter table storage.objects drop constraint "objects_bucketId_fkey";`, 4, ['interno pg_catalog.RI_FKey_check_ins · objects_bucketId_fkey (difiere: falta', 'buckets.interno pg_catalog.RI_FKey_noaction_del · objects_bucketId_fkey (difiere: falta']],
        ['s3_multipart_uploads_bucket_id_fkey quitada (2 de menos)', `alter table storage.s3_multipart_uploads drop constraint s3_multipart_uploads_bucket_id_fkey;`, 2, ['buckets.interno pg_catalog.RI_FKey_noaction_upd · s3_multipart_uploads_bucket_id_fkey (difiere: falta']],
        ['s3_multipart_uploads_parts_bucket_id_fkey quitada (2 de menos)', `alter table storage.s3_multipart_uploads_parts drop constraint s3_multipart_uploads_parts_bucket_id_fkey;`, 2, ['buckets.interno pg_catalog.RI_FKey_noaction_del · s3_multipart_uploads_parts_bucket_id_fkey (difiere: falta']],
        ['una FK de mas a storage.buckets (public.ajena, ON DELETE CASCADE: 2 de mas)', `create table public.ajena (id serial primary key, b text references storage.buckets(id) on delete cascade);`, 2, ['buckets.interno pg_catalog.RI_FKey_cascade_del · ajena_b_fkey (difiere: interno AFTER DELETE · por fila · relacionada=public.ajena']],
        ['objects_bucketId_fkey con ON DELETE CASCADE (otra funcion y otra definicion de la FK: 4 de mas y 4 de menos)', `alter table storage.objects drop constraint "objects_bucketId_fkey", add constraint "objects_bucketId_fkey" foreign key (bucket_id) references storage.buckets(id) on delete cascade;`, 8, ['buckets.interno pg_catalog.RI_FKey_cascade_del · objects_bucketId_fkey (difiere: interno', 'buckets.interno pg_catalog.RI_FKey_noaction_del · objects_bucketId_fkey (difiere: falta']],
        ['objects_bucketId_fkey renombrada (4 de mas y 4 de menos)', `alter table storage.objects rename constraint "objects_bucketId_fkey" to objects_bucket_id_fkey;`, 8, ['interno pg_catalog.RI_FKey_check_ins · objects_bucket_id_fkey (difiere: interno', 'interno pg_catalog.RI_FKey_check_ins · objects_bucketId_fkey (difiere: falta']],
        ['un interno de buckets desactivado (habilitado=D: 1 de mas y 1 de menos)', desactiva('buckets', 'RI_FKey_noaction_upd'), 2, ['habilitado=D']],
        ['Astra r8: un BEFORE INSERT propio con efecto, marcado interno', EXTRA, 1, ['buckets.interno storage.extra_interna · - (difiere: interno BEFORE INSERT · por fila · relacionada=- · habilitado=O · lenguaje=plpgsql']],
        ['Astra r8 (variante): enforce_bucket_name_length_trigger marcado interno', `update pg_catalog.pg_trigger set tgisinternal = true where tgname = 'enforce_bucket_name_length_trigger';`, 2, ['buckets.enforce_bucket_name_length_trigger (difiere: falta)', 'buckets.interno storage.enforce_bucket_name_length · - (difiere: interno']],
        // CTO 16-oct: la FK tal como la midio la s14e (no diferible); antes era un limite declarado
        ['objects_bucketId_fkey diferible (definicion de la FK: 4 de mas y 4 de menos)', `alter table storage.objects alter constraint "objects_bucketId_fkey" deferrable initially deferred;`, 8, ['interno pg_catalog.RI_FKey_check_ins · objects_bucketId_fkey (difiere: interno AFTER INSERT · por fila · relacionada=storage.buckets · habilitado=O · lenguaje=internal · forma: definicion de la FK']],
        // R9I-02 (revisor interno): un «||» ajeno (text, name) en public que disfrazaria cascade de noaction en el texto
        ['R9I-02: CASCADE con un «||» (text, name) ajeno en public que lo disfraza', `alter table storage.objects drop constraint "objects_bucketId_fkey", add constraint "objects_bucketId_fkey" foreign key (bucket_id) references storage.buckets(id) on delete cascade;
create function public.cat_tn(text, name) returns text language sql immutable as $x$ select replace($1 || $2::text, 'cascade', 'noaction') $x$;
create operator public.|| (leftarg = text, rightarg = name, function = public.cat_tn);`, 8, ['buckets.interno pg_catalog.RI_FKey_cascade_del · objects_bucketId_fkey (difiere: interno']],
      ]
      // R9I-01 (revisor interno): GEMELOS. Un RI_FKey_check_* creado a mano como constraint trigger, marcado interno y
      // colgado de objects_bucketId_fkey (como el de Astra r8, tocando el catalogo). Familia generada: exacto (repetido),
      // con WHEN de usuario con efecto, con argumentos, con columnas, con otra tabla relacionada y diferible; y el
      // sustituto (el real borrado del catalogo y el gemelo con WHEN en su sitio)
      const CUANDO = `create function public.cuando() returns boolean language plpgsql as $f$ begin perform nextval('public.astra_efecto'); return true; end $f$;`
      const gemelo = ({ momento = 'after insert', desde = 'storage.buckets', cuando = '', fn = 'RI_FKey_check_ins', args = '', dif = '', borra = false } = {}) => `${CUANDO}
create constraint trigger gemelo ${momento} on storage.objects from ${desde} ${dif} for each row ${cuando} execute function pg_catalog."${fn}"(${args});
update pg_catalog.pg_trigger set tgisinternal = true, tgconstraint = (select oid from pg_catalog.pg_constraint where conname = 'objects_bucketId_fkey'),
  tgconstrindid = (select conindid from pg_catalog.pg_constraint where conname = 'objects_bucketId_fkey') where tgname = 'gemelo';
delete from pg_catalog.pg_constraint where conname = 'gemelo';${borra ? `
delete from pg_catalog.pg_trigger where tgisinternal and tgrelid = 'storage.objects'::regclass and tgfoid = 'pg_catalog."RI_FKey_check_ins"'::regproc and tgname <> 'gemelo';` : ''}`
      const CI = 'interno pg_catalog.RI_FKey_check_ins · objects_bucketId_fkey (difiere: '
      const gemelos = [
        ['R9I-01: gemelo exacto de RI_FKey_check_ins (repetido)', gemelo(), 1, [`${CI}repetido (2 internos AFTER INSERT · por fila`]],
        ['R9I-01: gemelo con WHEN de usuario con efecto', gemelo({ cuando: 'when (public.cuando())' }), 1, [`${CI}interno AFTER INSERT · por fila · relacionada=storage.buckets · habilitado=O · lenguaje=internal · forma: WHEN`]],
        ['R9I-01: gemelo con argumentos', gemelo({ args: `'x'` }), 1, [`${CI}interno AFTER INSERT · por fila · relacionada=storage.buckets · habilitado=O · lenguaje=internal · forma: argumentos`]],
        ['R9I-01: gemelo de RI_FKey_check_upd con columnas (UPDATE OF bucket_id)', gemelo({ momento: 'after update of bucket_id', fn: 'RI_FKey_check_upd' }), 1, ['interno pg_catalog.RI_FKey_check_upd · objects_bucketId_fkey (difiere: interno AFTER UPDATE · por fila · relacionada=storage.buckets · habilitado=O · lenguaje=internal · forma: columnas']],
        ['R9I-01: gemelo con otra tabla relacionada (FROM storage.s3_multipart_uploads)', gemelo({ desde: 'storage.s3_multipart_uploads' }), 1, [`${CI}interno AFTER INSERT · por fila · relacionada=storage.s3_multipart_uploads · habilitado=O · lenguaje=internal · forma: tablas de la FK`]],
        ['R9I-01: gemelo diferible', gemelo({ dif: 'deferrable initially deferred' }), 1, [`${CI}interno AFTER INSERT · por fila · relacionada=storage.buckets · habilitado=O · lenguaje=internal · forma: diferible`]],
        ['R9I-01: sustituto (el real borrado del catalogo, el gemelo con WHEN en su sitio)', gemelo({ cuando: 'when (public.cuando())', borra: true }), 2, [`${CI}interno AFTER INSERT · por fila · relacionada=storage.buckets · habilitado=O · lenguaje=internal · forma: WHEN`, `${CI}falta (interno AFTER INSERT · por fila`]],
      ]
      familia.push(...gemelos)
      // R9J (revisor interno de 78023ca..3913df6): los operadores de la FK, el indice y su definicion
      const EQ = `create function public.eq_efecto(text, text) returns boolean language plpgsql security definer as $f$ begin perform pg_catalog.nextval('public.astra_efecto'); return $1 operator(pg_catalog.=) $2; end $f$;
create operator public.=== (leftarg = text, rightarg = text, function = public.eq_efecto);`
      const FKDEF = 'interno pg_catalog.RI_FKey_check_ins · objects_bucketId_fkey (difiere: interno AFTER INSERT · por fila · relacionada=storage.buckets · habilitado=O · lenguaje=internal · forma: definicion de la FK'
      familia.push(
        ['R9J-01: el operador de igualdad de la FK (conpfeqop) apuntando a un «=» ajeno con efecto (catalogo)', `${EQ}\nupdate pg_catalog.pg_constraint set conpfeqop = array['public.===(text,text)'::pg_catalog.regoperator::oid] where conname = 'objects_bucketId_fkey';`, 8, [FKDEF]],
        ['R9J-02: sustituto con OTRO indice (el real borrado; un gemelo sin WHEN con el indice de otro unico de buckets)', `create unique index otro_id on storage.buckets (id);
create constraint trigger gemelo after insert on storage.objects from storage.buckets for each row execute function pg_catalog."RI_FKey_check_ins"();
update pg_catalog.pg_trigger set tgisinternal = true, tgconstraint = (select oid from pg_catalog.pg_constraint where conname = 'objects_bucketId_fkey'), tgconstrindid = 'storage.otro_id'::regclass where tgname = 'gemelo';
delete from pg_catalog.pg_constraint where conname = 'gemelo';
delete from pg_catalog.pg_trigger where tgisinternal and tgrelid = 'storage.objects'::regclass and tgfoid = 'pg_catalog."RI_FKey_check_ins"'::regproc and tgname <> 'gemelo';`, 2, [`${CI}interno AFTER INSERT · por fila · relacionada=storage.buckets · habilitado=O · lenguaje=internal · forma: indice`, `${CI}falta`]],
        ['R9J-02: objects_bucketId_fkey NOT VALID', `alter table storage.objects drop constraint "objects_bucketId_fkey", add constraint "objects_bucketId_fkey" foreign key (bucket_id) references storage.buckets(id) not valid;`, 8, [FKDEF]],
        ['R9J-02: objects_bucketId_fkey sobre otra columna (otra → buckets.id), con el mismo nombre', `alter table storage.objects add column otra text;
alter table storage.objects drop constraint "objects_bucketId_fkey", add constraint "objects_bucketId_fkey" foreign key (otra) references storage.buckets(id);`, 8, [FKDEF]],
      )
      ver('control: la familia de internos tiene 3 FK quitadas, una de mas, otra accion, la renombrada, un interno desactivado, los dos de Astra r8, la diferible, el «||» ajeno, 7 gemelos y los 4 de R9J', familia.length === 9 + 2 + 7 + 4)
      const efecto = d => pg.psql(`select last_value || ':' || is_called from public.astra_efecto`, d).out
      for (const [nombre, extra, k, dice] of familia) {
        const d = montaT(`create sequence public.astra_efecto;\n${extra}`)
        const e0 = efecto(d)
        const qq = s14(d)
        const lineas = qq.out.split('\n').filter(x => x.startsWith('disparador|'))
        const noAcr = lineas.filter(l => / · NO ACREDITADO \(difiere: /.test(l))
        oraculo('INTERNOS', `s14: ${nombre} → ${k} sin acreditar, «(internos)» PARAR y el resumen PARAR`, qq.ok && noAcr.length === k && new RegExp(`^disparador\\|\\(resumen\\)\\|.* · sin acreditar: ${k}: .*PARAR`, 'm').test(qq.out) && /^disparador\|\(internos\)\|.*: NO ACREDITADOS \(lista exacta de la s14e\); PARAR$/m.test(qq.out), noAcr.concat(lineas.filter(l => /\((internos|resumen)\)/.test(l))).join(' / ') || qq.err)
        const a = estado(d)
        const r = pg.psql(M1, d)
        oraculo('INTERNOS', `mercado-001: ${nombre} → aborta antes del INSERT (testigo y efecto sin consumir) nombrandolo, y nada cambia`, !r.ok && /mercado-001: disparadores de storage NO ACREDITADOS: /.test(r.err) && dice.every(x => r.err.includes(x)) && sinInsert(d) && efecto(d) === e0 && estado(d) === a, err1(r))
      }
      const exprI = t => (t.match(/internos_acreditados \(tabla, funcion, restriccion, relacionada, disparo\) as \(values/g) || [])
      oraculo('INTERNOS', 'la lista de internos esta dentro del bloque compartido (una vez en cada fichero)', exprI(S14).length === 1 && exprI(M1).length === 1)
    }

    titulo('17 · CTO 16-oct (la familia de E3R2-01): todos los atributos de pg_proc de las funciones acreditadas y el md5 de pg_get_functiondef')
    {
      // Sobre storage.enforce_bucket_name_length (la dispara el INSERT del bucket de mercado-001). Los que una funcion
      // de disparador no admite por DDL (no tiene argumentos declarados, no devuelve un conjunto) se ponen tocando el
      // catalogo, como los de Astra r8: se tienen que ver igual. Cada uno: s14 NO ACREDITADO (difiere: atributos) y
      // PARAR; mercado-001 aborta antes del INSERT (testigo sin consumir) y nada cambia
      const F = 'storage.enforce_bucket_name_length()'
      const cat = set => `update pg_catalog.pg_proc set ${set} where oid = '${F}'::regprocedure;`
      const ATRIB = [
        ['proisstrict · STRICT', `alter function ${F} strict;`],
        ['proleakproof · LEAKPROOF', `alter function ${F} leakproof;`],
        ['proparallel · PARALLEL SAFE', `alter function ${F} parallel safe;`],
        ['prokind · procedimiento (catalogo)', cat("prokind = 'p'")],
        ['proretset · devuelve un conjunto (catalogo)', cat('proretset = true')],
        ['prorettype · devuelve otra cosa (catalogo)', cat("prorettype = 'event_trigger'::regtype")],
        ['proargtypes · un argumento declarado (catalogo)', cat("pronargs = 1, proargtypes = '25'::oidvector")],
        ['proargmodes · modos (catalogo)', cat("proargmodes = '{o}', proallargtypes = '{25}'")],
        ['proargnames · nombres (catalogo, con un argumento declarado para que sea coherente)', cat("pronargs = 1, proargtypes = '25'::oidvector, proargnames = '{x}'")],
        ['proargdefaults · un valor por defecto (catalogo)', cat("pronargs = 1, proargtypes = '25'::oidvector, pronargdefaults = 1, proargdefaults = (select proargdefaults from pg_catalog.pg_proc where proargdefaults is not null limit 1)")],
        ['pronargdefaults · el recuento solo (catalogo)', cat('pronargdefaults = 1')],
        ['provolatile · STABLE', `alter function ${F} stable;`],
        ['prosecdef · SECURITY DEFINER', `alter function ${F} security definer;`],
        ['proconfig · SET work_mem', `alter function ${F} set work_mem = '64kB';`],
        ['procost · COST 7', `alter function ${F} cost 7;`],
        ['prorows · ROWS 5 (catalogo; ALTER no lo admite sin conjunto)', cat('prorows = 5')],
        ['solo pg_get_functiondef · SUPPORT (prosupport, catalogo)', cat("prosupport = 'pg_catalog.textlike_support'::regproc")],
      ]
      ver('control: la familia de atributos tiene los 16 pedidos y el de solo pg_get_functiondef', ATRIB.length === 17)
      {
        // control: el montaje tiene las funciones de produccion con TODOS sus atributos. La s14f (la que corrio Ramon el
        // 16-oct) sobre el montaje da, fila a fila, la salida literal de produccion
        const S14F = lee('sql/consultas/s14f-atributos-funciones-storage.sql')
        const literal = lee('sql/consultas/salidas/s14f-atributos-funciones-storage-2026-10-16.csv').split('\n').filter(l => /^(funcion|resumen),/.test(l))
          .map(l => { const k = /^([^,]+),([^,]+),(.*)$/.exec(l); return `${k[1]}|${k[2]}|${k[3]}` }).sort()
        const enMontaje = pg.psql(`begin read only;\n${S14F}\nrollback;`, monta(SUPA)).out.split('\n').filter(l => /^(funcion|resumen)\|/.test(l)).sort()
        ver(`control: el montaje reproduce la s14f de produccion (${literal.length} filas: las siete funciones con todos sus atributos y el md5 de pg_get_functiondef)`, literal.length === 8 && JSON.stringify(enMontaje) === JSON.stringify(literal), enMontaje.filter(x => !literal.includes(x)).concat(literal.filter(x => !enMontaje.includes(x)).map(x => 'falta: ' + x)).join(' / ').slice(0, 400))
      }
      {
        const qq = s14(monta(SUPA))
        ver('control: con las funciones medidas, los siete acreditados (atributos incluidos) y el resumen sin acreditar 0', qq.ok && /sin acreditar: 0: todos acreditados/.test(qq.out) && !/difiere: [^)]*atributos/.test(qq.out), qq.out.split('\n').filter(l => /\(resumen\)/.test(l)).join(' / ') || qq.err)
      }
      for (const [nombre, mutante] of ATRIB) {
        const d = montaT(mutante)
        const qq = s14(d)
        const fila = qq.out.split('\n').find(l => l.startsWith('disparador|buckets.enforce_bucket_name_length_trigger|')) || ''
        oraculo('ATRIB', `s14: ${nombre} → enforce_bucket_name_length_trigger NO ACREDITADO (difiere: … atributos) y PARAR`, qq.ok && /NO ACREDITADO \(difiere: [^)]*atributos\)$/.test(fila) && /^disparador\|\(resumen\)\|.* · sin acreditar: [1-9]\d*: .*PARAR/m.test(qq.out), fila.slice(-160) || qq.err.slice(0, 200))
        const a = estado(d)
        const r = pg.psql(M1, d)
        oraculo('ATRIB', `mercado-001: ${nombre} → aborta antes del INSERT (testigo sin consumir) nombrando «atributos», y nada cambia`, !r.ok && /buckets\.enforce_bucket_name_length_trigger \(difiere: [^)]*atributos\)/.test(r.err) && sinInsert(d) && estado(d) === a, err1(r))
      }
      const exprA = t => (t.match(/pg_catalog\.concat\('def=', pg_catalog\.md5\(pg_catalog\.pg_get_functiondef\(f\.oid\)\)\)\) atributos/g) || [])
      oraculo('ATRIB', 'la expresion de los atributos esta dentro del bloque compartido (una vez en cada fichero)', exprA(S14).length === 1 && exprA(M1).length === 1)
    }
  }

  oraculo('S14', 'una sola SELECT: sin escrituras ni EXECUTE (fuera comentarios)', (() => { const sin = S14.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''"); return !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|perform|call|do)\b/i.test(sin) && (sin.match(/;/g) || []).length === 1 })())
} finally { pg.cierra() }
fin()
