/**
 * MERCADO-001 (EL BUCKET PRIVADO «mercado») Y S14 · ENSAYO EN POSTGRESQL 17 LOCAL
 * (etapa 2; diseño sim-004 p.7–p.8; CTO 13-oct: sin politicas ni grants de Storage)
 *
 * Montaje: produccion segun s04 LITERAL (storage.buckets con forex-data publico,
 * storage.objects con RLS y SIN politicas), con las columnas reales de
 * storage.objects que lee s14 (metadata, updated_at). Datos inventados.
 *   1 limpio: crea el bucket privado (5 MB, sin tipos MIME), el informe acaba en
 *     FIN; segunda ejecucion: no toca nada; ni politicas ni grants nuevos
 *   2 guardas, cada una en rojo y SIN crear nada: bucket mercado publico, con
 *     otro limite, con nombre mercado y otro id; RLS de storage.objects apagada;
 *     una politica sin bucket (la «subidas propias» del stub), una con OR, una
 *     que nombra mercado; una restringida a forex-data NO aborta
 *   3 s14: una sola SELECT, en READ ONLY; antes («NO EXISTE», politicas con su
 *     veredicto) y despues (privado, trozos por par, puntero, cerrojo); sin
 *     nombres de objetos de otros buckets
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const M1 = lee('sql/mercado-001-bucket.sql')
const S14 = lee('sql/consultas/s14-mercado-storage.sql')
const pg = cluster()
const REALES = `alter table storage.objects add column metadata jsonb, add column updated_at timestamptz default now();`
let n = 0
const monta = (extra = '') => {
  const db = `m${++n}`
  const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(PRODUCCION, db), pg.psql(REALES, db), ...(extra ? [pg.psql(extra, db)] : [])]
  if (!pasos.every(x => x.ok)) throw new Error(`montaje ${db}: ${pasos.map(x => x.err).join(' ')}`)
  return db
}
const estado = db => pg.psql(`select coalesce(string_agg(id || ':' || public || ':' || coalesce(file_size_limit::text, '-') || ':' || coalesce(allowed_mime_types::text, '-'), ',' order by id), '') from storage.buckets;
select count(*) from pg_policies where schemaname = 'storage';
select coalesce(string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type), '') from information_schema.role_table_grants where table_schema = 'storage';`, db).out
const s14 = db => pg.psql(`begin read only;\n${S14}\nrollback;`, db)

try {
  pg.arranca()
  titulo('1 · limpio: crea el bucket privado; segunda ejecucion, nada')
  const d1 = monta()
  const antes = estado(d1)
  const r1 = pg.psql(M1, d1)
  const despues = estado(d1)
  oraculo('M001', 'aplica: el informe dice el bucket privado de 5 MB, la RLS y acaba en FIN', r1.ok && /bucket\|mercado · public=false · file_size_limit=5242880 · allowed_mime_types=-/.test(r1.out) && /rls\|storage.objects · rls=true/.test(r1.out) && /FIN\|mercado-001 aplicada$/.test(r1.out), r1.err || r1.out)
  oraculo('M001', 'storage.buckets: forex-data igual y mercado privado, 5 MB, sin tipos MIME; ni politicas ni grants nuevos', despues.split('\n')[0] === 'forex-data:true:-:-,mercado:false:5242880:-' && despues.split('\n').slice(1).join('|') === antes.split('\n').slice(1).join('|'), `${antes} → ${despues}`)
  const r1b = pg.psql(M1, d1)
  oraculo('M001', 'segunda ejecucion: termina bien, dice que ya estaba y no cambia nada', r1b.ok && /ya existe con esta forma/.test(r1b.err) && estado(d1) === despues, r1b.err)

  titulo('2 · guardas: abortan sin crear nada')
  const guardas = [
    ['un bucket mercado PUBLICO', `insert into storage.buckets (id, name, public) values ('mercado', 'mercado', true);`, /otra forma/],
    ['un bucket mercado con otro limite', `insert into storage.buckets (id, name, public, file_size_limit) values ('mercado', 'mercado', false, 1000);`, /otra forma/],
    ['un bucket con nombre mercado y otro id', `insert into storage.buckets (id, name, public, file_size_limit) values ('mercado2', 'mercado', false, 5242880);`, /otra forma/],
    ['la RLS de storage.objects apagada', `alter table storage.objects disable row level security;`, /RLS de storage.objects esta apagada/],
    ['una politica sin bucket (subidas de cualquiera con owner)', `create policy "subidas propias" on storage.objects for insert to authenticated with check (owner = auth.uid());`, /subidas propias/, 'alter table storage.objects add column owner uuid;'],
    ['una politica con OR', `create policy "dos" on storage.objects for select to public using (bucket_id = 'forex-data' or bucket_id = 'otro');`, /dos \(SELECT\)/],
    ['una politica que ya nombra mercado', `create policy "abre" on storage.objects for select to authenticated using (bucket_id = 'mercado');`, /abre \(SELECT\)/],
    ['una politica sin expresion de bucket (todo a authenticated)', `create policy "todo" on storage.objects for select to authenticated using (true);`, /todo \(SELECT\)/],
  ]
  for (const [que, sql, error, previo] of guardas) {
    const d = monta((previo ?? '') + sql)
    const a = estado(d)
    const r = pg.psql(M1, d)
    oraculo('M001', `aborta con ${que}: mensaje «mercado-001:» y nada cambia`, !r.ok && /mercado-001:/.test(r.err) && error.test(r.err) && estado(d) === a, r.err.split('\n')[0])
  }
  const dOk = monta(`create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data');`)
  oraculo('M001', 'una politica restringida a forex-data (la de lectura publica) no aborta', pg.psql(M1, dOk).ok && /mercado:false:5242880/.test(estado(dOk)))

  titulo('3 · s14 (solo lectura)')
  const d3 = monta(`create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data');
create policy "rara" on storage.objects for select to authenticated using (name like 'x%');
insert into storage.objects (bucket_id, name, metadata) values ('forex-data', 'EURUSD/M1/2026.json.gz', '{"size": 4000000}');`)
  const q0 = s14(d3)
  oraculo('S14', 'antes: mercado NO EXISTE, forex-data publico con 1 objeto y sus bytes, y cada politica con su veredicto', q0.ok && /bucket\|mercado\|NO EXISTE/.test(q0.out) && /bucket\|forex-data\|public=true .* objetos=1 · bytes=4000000/.test(q0.out) && /politica\|lectura forex\|SELECT · \{public\} · solo forex-data/.test(q0.out) && /politica\|rara\|.*A REVISAR/.test(q0.out) && /FIN\|s14\|consulta$/.test(q0.out), q0.err || q0.out)
  pg.psql(`drop policy "rara" on storage.objects;`, d3)
  const r3 = pg.psql(M1, d3)
  pg.psql(`insert into storage.objects (bucket_id, name, metadata) values
    ('mercado', 'v1/EURUSD/2026/03/02.${'a'.repeat(64)}.bin.br', '{"size": 9000}'), ('mercado', 'v1/EURUSD/2026/03/03.${'b'.repeat(64)}.bin.br', '{"size": 8000}'),
    ('mercado', 'v1/EURUSD/manifiestos/v1.1.${'c'.repeat(64)}.json', '{"size": 500}'), ('mercado', 'v1/GBPUSD/2026/03/02.${'d'.repeat(64)}.bin.br', '{"size": 7000}'),
    ('mercado', 'v1/actual.json', '{"size": 300}');`, d3)
  const q1 = s14(d3)
  oraculo('S14', 'despues: mercado privado; EURUSD 2 trozos, 17.000 bytes y 1 manifiesto; GBPUSD 1 trozo; puntero con su hora; sin cerrojo', r3.ok && q1.ok && /bucket\|mercado\|public=false · file_size_limit=5242880/.test(q1.out) && /mercado\|EURUSD\|trozos=2 · bytes=17000 · manifiestos=1/.test(q1.out) && /mercado\|GBPUSD\|trozos=1 · bytes=7000 · manifiestos=0/.test(q1.out) && /mercado\|puntero\|v1\/actual.json · actualizado/.test(q1.out) && /mercado\|cerrojo\|no hay/.test(q1.out), q1.err || q1.out)
  oraculo('S14', 'sin nombres de objetos de otros buckets (ni EURUSD/M1/…)', q1.ok && !/M1\/2026/.test(q1.out))
  oraculo('S14', 'una sola SELECT: sin escrituras ni EXECUTE (fuera comentarios)', (() => { const sin = S14.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''"); return !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|perform|call|do)\b/i.test(sin) && (sin.match(/;/g) || []).length === 1 })())
} finally { pg.cierra() }
fin()
