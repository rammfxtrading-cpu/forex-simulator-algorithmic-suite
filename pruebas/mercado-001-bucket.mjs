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
const REALES = `alter table storage.objects add column metadata jsonb, add column updated_at timestamptz default now(), add column owner uuid, add column owner_id text;`
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
  const aT = estado(dTrig), rT = pg.psql(M1, dTrig)
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
  const antesFila = seq(dFila), rFila = pg.psql(M1, dFila), despuesFila = seq(dFila)
  oraculo('E2R2-02', 'con una lectura de forex-data y un disparador POR FILA: aplica y la secuencia no se mueve (UPDATE y DELETE solo del centinela, que no ven)', rFila.ok && /FIN\|mercado-001 aplicada$/.test(rFila.out) && antesFila === despuesFila && pg.psql(`select metadata::text from storage.objects where name = 'sintetico'`, dFila).out === '{"original": true}', JSON.stringify({ error: err1(rFila), antes: antesFila, despues: despuesFila }))
  const dSent = monta(SUPA + SECUENCIA + `create trigger efecto_sentencia before update on storage.objects for each statement execute function public.efecto(); create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data');`)
  const qSent = s14(dSent)
  oraculo('E2R2-02', 's14 enseña el disparador POR SENTENCIA con funcion ajena (lo que el rollback no deshace: el runbook para)', qSent.ok && /disparador\|efecto_sentencia\|BEFORE UPDATE · POR SENTENCIA · public\.efecto · FUNCION AJENA/.test(qSent.out), qSent.out || qSent.err)
  const antesSent = seq(dSent), rSent = pg.psql(M1, dSent), despuesSent = seq(dSent)
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
  const rTemp = pg.psql('create temp table pg_trigger as select * from pg_catalog.pg_trigger where false; set search_path=pg_temp,pg_catalog,public;\n' + M1, dS)
  oraculo('E2R3-02', 'mercado-001 en esa misma sesion fija su contexto (pg_catalog, pg_temp) y no se deja engañar: aplica igual que sin la tabla temporal', rTemp.ok && /FIN\|mercado-001 aplicada$/.test(rTemp.out), err1(rTemp))
  oraculo('E2R3-03', 's14: el AFTER INSERT por sentencia sale como POR SENTENCIA, con su lenguaje y el md5 de su cuerpo, y el resumen manda PARAR hasta que el CTO lo acredite', /disparador\|efecto_insert\|AFTER INSERT · POR SENTENCIA · storage\.efecto_insert · funcion de storage · plpgsql · SECURITY INVOKER · dueño=postgres · proconfig=- · volatilidad=v · md5 del cuerpo [0-9a-f]{12}/.test(visible.out) && /disparador\|efecto_insert\|.* · NO ACREDITADO \(difiere: no esta en la lista acreditada\)$/m.test(visible.out) && /disparador\|\(resumen\)\|storage\.objects: 3 \(2 por sentencia\) · storage\.buckets: 5 · sin acreditar: 1: .*PARAR hasta que el CTO acredite/.test(visible.out), visible.out.split('\n').filter(x => /disparador/.test(x)).join(' / '))
  const dS2 = monta(`create sequence public.efecto_insert; create function storage.efecto_insert() returns trigger language plpgsql as $$ begin perform nextval('public.efecto_insert'); return null; end $$; create trigger efecto_insert after insert on storage.objects for each statement execute function storage.efecto_insert();`)
  const efecto = pg.psql('begin;\n' + M1 + '\ncommit;\nselect last_value || \'|\' || is_called from public.efecto_insert;', dS2)
  oraculo('E2R3-03', 'lo que documenta p.13.2: el INSERT del centinela dispara el INSERT por sentencia, y su efecto no transaccional queda tras el rollback', efecto.ok && efecto.out.split('\n').at(-1) === '1|true', efecto.out.split('\n').at(-1) || efecto.err)
  const dNo = monta('', { sinStorage: true })
  const qNo = s14(dNo)
  oraculo('E2R3-03', 'sin disparadores: el resumen dice «ninguno»', qNo.ok && /disparador\|\(resumen\)\|ninguno en storage\.objects ni en storage\.buckets$/m.test(qNo.out), qNo.out.split('\n').filter(x => /disparador/.test(x)).join(' / '))
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
    const sF = sesion(`begin;\n${M1}` + DESPUES, dF)
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
    oraculo('S14-CTO', 's14: una funcion de buckets con el cuerpo cambiado → su disparador NO ACREDITADO, los demas acreditados, y el resumen manda PARAR', qB.ok && /^disparador\|buckets\.enforce_bucket_name_length_trigger\|BEFORE INSERT\/UPDATE · por fila · storage\.enforce_bucket_name_length · funcion de storage · plpgsql · SECURITY INVOKER · dueño=supabase_storage_admin · proconfig=- · volatilidad=v · md5 del cuerpo [0-9a-f]{12} · NO ACREDITADO \(difiere: md5\)$/m.test(qB.out) && (qB.out.match(/^disparador\|buckets\.[a-z_]+\|.* · acreditado \(CTO 14-oct\)$/mg) || []).length === 4 && /^disparador\|\(resumen\)\|storage\.objects: 2 \(1 por sentencia\) · storage\.buckets: 5 · sin acreditar: 1: la sonda y el INSERT del bucket de mercado-001 los disparan; PARAR hasta que el CTO acredite/m.test(qB.out), qB.out.split('\n').filter(x => /disparador/.test(x)).join(' / ') || qB.err)
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
      oraculo('S14-CTO', `s14: ${nombre} → NO ACREDITADO y PARAR`, q.ok && /^disparador\|(protect_objects_delete|update_objects_updated_at)\|.* · NO ACREDITADO \(difiere: (md5|habilitado|definicion)\)$/m.test(q.out) && new RegExp(`^disparador\\|\\(resumen\\)\\|.*sin acreditar: ${cuantos ?? 1}: .*PARAR`, 'm').test(q.out), q.out.split('\n').filter(x => /disparador/.test(x)).join(' / ') || q.err)
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
      ['Astra: SET search_path = public, pg_catalog en enforce_bucket_name_length, con un public.length sintetico', `${EFECTO}\nalter function storage.enforce_bucket_name_length() set search_path = public, pg_catalog;`, ['buckets.enforce_bucket_name_length_trigger'], 'proconfig'],
      ['Astra: SECURITY DEFINER en protect_bucket_control_columns', `alter function storage.protect_bucket_control_columns() security definer;`, ['buckets.protect_bucket_control_insert', 'buckets.protect_bucket_control_update'], 'seguridad'],
      ['otro dueño de update_updated_at_column', `alter function storage.update_updated_at_column() owner to postgres;`, ['update_objects_updated_at'], 'dueño'],
      ['un proconfig añadido sin cambiar el cuerpo (enforce_bucket_lifecycle_service_role, lock_timeout)', `alter function storage.enforce_bucket_lifecycle_service_role() set lock_timeout = '1s';`, ['buckets.protect_bucket_control_update_role'], 'proconfig'],
      ['un proconfig añadido a una que no tenia (protect_delete, search_path), el cuerpo igual', `alter function storage.protect_delete() set search_path = public, pg_catalog;`, ['protect_objects_delete', 'buckets.protect_buckets_delete'], 'proconfig'],
      ['otra volatilidad (enforce_bucket_name_length STABLE)', `alter function storage.enforce_bucket_name_length() stable;`, ['buckets.enforce_bucket_name_length_trigger'], 'volatilidad'],
      ['SECURITY DEFINER en protect_delete (el md5 igual)', `alter function storage.protect_delete() security definer;`, ['protect_objects_delete', 'buckets.protect_buckets_delete'], 'seguridad'],
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

  oraculo('S14', 'una sola SELECT: sin escrituras ni EXECUTE (fuera comentarios)', (() => { const sin = S14.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''"); return !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|perform|call|do)\b/i.test(sin) && (sin.match(/;/g) || []).length === 1 })())
} finally { pg.cierra() }
fin()
