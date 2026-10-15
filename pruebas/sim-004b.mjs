/**
 * sim-004b (el contrato v1: «completado» de j.8 y hueco_aceptado de S4-04) · ENSAYO EN
 * POSTGRESQL 17 LOCAL. Escrito ANTES que el SQL definitivo; NADA se aplica en Supabase.
 *
 * Montaje: produccion segun s04 LITERAL + sim-002 + sim-003 + sim-004a-preparatoria,
 * aplicadas por el ejecutor de s06 (pruebas/montaje-v1.mjs). Datos INVENTADOS.
 *
 *   1 aplicar (informe «FIN | sim-004b aplicada»); segunda ejecucion: mismo informe y
 *     catalogo identico; a medias (una restriccion vuelta atras, un cuerpo cambiado):
 *     aborta con «sim-004b: …» y el catalogo no cambia; sin la preparatoria: no aplica
 *   2 la matriz de sucesion (k.1 c; j.9): sim-003 despues ABORTA con su error prefijado y
 *     el catalogo identico (control: un sim-003 sin esa comprobacion terminaria con
 *     exito y el oraculo lo ve); la preparatoria despues, idempotente
 *   3 hueco_aceptado (S4-04): sim-003 lo rechaza; sim-004b lo acepta con clase economico
 *     (no ultimo_avance: el recibo no se sobrescribe)
 *   4 j.8: 2F (1→2 hija; 2 → superado), 3F (1→2, 2→3, 3 → superado), 1F (1 → superado),
 *     repetido, otra clave → solo_lectura, comando y tomar sobre superado → solo_lectura,
 *     CAS, hija en la ultima fase → 422, acceso revocado → 403, fase_no_superada, y
 *     borrar: superado → lapida y la cadena entera desde la raiz
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
import { titulo, ver, oraculo, fin, importa, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, L } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S3 = lee('sql/sim-003-persistencia-aditiva.sql'), PREP = lee('sql/sim-004a-preparatoria.sql')
let S4B = null
try { S4B = lee('sql/sim-004b-contrato-v1.sql') } catch { S4B = null }
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const SO = await importa('lib/servidor/sobre.mjs'), CR = await importa('lib/servidor/crear.mjs'), CO = await importa('lib/servidor/comando.mjs')
const { manifiestosVigentes } = await importa('lib/servidor/mercado.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const tx = x => JSON.stringify(x)
const err1 = r => (r.err.split('\n').find(l => /ERROR/.test(l)) || r.err.split('\n')[0] || '').replace(/^.*ERROR:\s+/, '')

// el catalogo como multiconjunto (la foto de pruebas/astra-r2-cas-pg.mjs)
const FOTO = `select md5(string_agg(x, E'\\n' order by x collate "C")) from (
  select 'rel '||n.nspname||'.'||c.relname||' '||c.relkind::text||' '||coalesce(c.relacl::text,'-')||' '||c.relrowsecurity||' '||pg_get_userbyid(c.relowner) x
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'auth')
  union all select 'att '||a.attrelid::regclass||'.'||a.attname||' '||format_type(a.atttypid, a.atttypmod)||' '||a.attnotnull||' '||a.attnum
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
  union all select 'con '||k.conrelid::regclass||'.'||k.conname||' '||pg_get_constraintdef(k.oid)||' '||k.convalidated
    from pg_constraint k join pg_namespace n on n.oid = k.connamespace where n.nspname = 'public'
  union all select 'idx '||pg_get_indexdef(i.indexrelid) from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
  union all select 'trg '||t.tgrelid::regclass||' '||case when t.tgisinternal then coalesce(k.conname, '?')||' '||t.tgfoid::regproc::text else pg_get_triggerdef(t.oid) end||' '||t.tgenabled::text
    from pg_trigger t left join pg_constraint k on k.oid = t.tgconstraint join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
  union all select 'fun '||p.oid::regprocedure||' '||md5(p.prosrc)||' '||p.prosecdef||' '||coalesce(p.proconfig::text,'-')||' '||coalesce(p.proacl::text,'-')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  union all select 'pol '||schemaname||'.'||tablename||'.'||policyname||' '||cmd||' '||roles::text||' '||coalesce(qual,'-')||' '||coalesce(with_check,'-') from pg_policies) s`

// el mercado minimo para crear sesiones con lib/servidor
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velas(par) { const o = []; for (let t = Date.parse('2025-01-06T00:00:00Z') / 1000; t < Date.parse('2025-01-08T00:00:00Z') / 1000; t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: PX[par], high: PX[par], low: PX[par], close: PX[par], volume: 1 }); return o }
function almacen() { const o = new Map(); return { async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velas(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const { fijados } = await manifiestosVigentes(mercado, SO.PARES)

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
ver('el fichero sql/sim-004b-contrato-v1.sql existe', S4B != null)
const m = montajeV1()
try {
  m.arranca()
  const foto = d => m.uno(d, FOTO)
  const aplica = (d, texto = S4B) => m.comoEjecutor(d, texto ?? 'select 1/0')
  const informe = r => r.out.split('\n').filter(Boolean)

  titulo('1 · aplicar, reejecutar y lo que lo para')
  const d1 = m.base('b1')
  const f0 = foto(d1)
  const r1 = aplica(d1)
  oraculo('S4B', 'se aplica y el informe acaba en «FIN|sim-004b aplicada»', r1.ok && informe(r1).at(-1) === 'FIN|sim-004b aplicada', r1.ok ? informe(r1).at(-1) : err1(r1))
  const f1 = foto(d1)
  oraculo('S4B', 'el catalogo cambio (dos restricciones y tres cuerpos)', f1 !== f0)
  const r2 = aplica(d1)
  oraculo('S4B', 'segunda ejecucion: el mismo informe y el catalogo identico', r2.ok && tx(informe(r2)) === tx(informe(r1)) && foto(d1) === f1, r2.ok ? '' : err1(r2))
  const d2 = m.base('b2')
  aplica(d2)
  m.uno(d2, `alter table public.sim_eventos drop constraint sim_eventos_tipo_check, add constraint sim_eventos_tipo_check check (tipo in ('orden_creada', 'orden_modificada', 'orden_cancelada', 'fill', 'cierre', 'reset_diario', 'breach', 'fase_superada', 'fin_de_datos', 'posicion_modificada', 'no_valorable'))`)
  const fm = foto(d2), rm = aplica(d2)
  oraculo('S4B', 'a medias (sim_eventos_tipo_check vuelto atras): aborta con «sim-004b: A MEDIAS» y el catalogo no cambia', !rm.ok && /sim-004b: A MEDIAS/.test(err1(rm)) && foto(d2) === fm, err1(rm))
  const d3 = m.base('b3')
  aplica(d3)
  m.uno(d3, `create or replace function public.sim_tomar_escritor(p_actor uuid, p_session_id uuid, p_command_id uuid, p_sobre text, p_epoca integer, p_cliente_id text, p_forzar boolean) returns jsonb language plpgsql volatile security definer set search_path = '' as $f$ begin return null; end $f$`)
  const fc = foto(d3), rc = aplica(d3)
  oraculo('S4B', 'un cuerpo cambiado: aborta con «sim-004b: A MEDIAS» y el catalogo no cambia', !rc.ok && /sim-004b: A MEDIAS/.test(err1(rc)) && foto(d3) === fc, err1(rc))
  const d4 = m.base('b4')
  m.uno(d4, `alter function public.sim_cierre_v0(uuid,numeric,bigint,jsonb) rename to sim_cierre_v0_x`)
  const fp = foto(d4), rp = aplica(d4)
  oraculo('S4B', 'sin la preparatoria (falta sim_cierre_v0): aborta con «sim-004b: la preparatoria no esta aplicada» y nada cambia', !rp.ok && /sim-004b: la preparatoria no esta aplicada/.test(err1(rp)) && foto(d4) === fp, err1(rp))

  titulo('2 · la matriz de sucesion (k.1 c, j.9)')
  const f2 = foto(d1)
  const s3 = m.comoEjecutor(d1, S3)
  const abortaBien = r => !r.ok && /^sim-003: /.test(err1(r))
  oraculo('S4B', 'sim-003 despues de sim-004b: ABORTA con su error prefijado («sim-003: …») y el catalogo identico', abortaBien(s3) && foto(d1) === f2, err1(s3))
  const S3sin = S3.split('\n').filter(l => !/^\s+\('sim_(eventos|sessions)', 'sim_(eventos_tipo_check|sessions_terminal_valida)'/.test(l)).join('\n')
  const s3m = m.comoEjecutor(d1, S3sin)
  ver('control: un sim-003 sin la comparacion de esas dos definiciones termina CON EXITO, y el oraculo lo daria por malo', s3m.ok && !abortaBien(s3m), s3m.ok ? 'exito' : err1(s3m))
  const pr = m.comoEjecutor(d1, PREP)
  oraculo('S4B', 'la preparatoria despues de sim-004b: idempotente (sin error) y el catalogo identico', pr.ok && foto(d1) === f2, pr.ok ? '' : err1(pr))

  // ── las sesiones de las pruebas funcionales ──
  const AL = u(1)
  const prepara = d => { m.alumno(d, AL); return { rpc: m.rpc(d), almacen: mercado, ahora: () => Date.parse('2026-10-14T10:00:00Z') } }
  const reto = (fase, estado = 'en_curso') => { const i = SO.validaCrear({ session_id: u(9), command_id: u(9), epoca: 1, name: 'R', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '2F' }, { ahora: Date.parse('2026-10-14T10:00:00Z') }).intencion; const e = JSON.parse(CA.serializa(CR.estadoInicial(i, fijados).estado)); return { ...e, fase, estado } }
  // una sesion reto v1 por la RPC real, de cualquier producto (sim_crear_sesion no mira el tipo)
  const creaReto = async (pu, id, tipo) => (await pu.rpc('sim_crear_sesion', { p_actor: AL, p_session_id: id, p_command_id: u(70000 + Math.floor(Math.random() * 1e6)), p_sobre: tx({ tipo: 'crear', payload: { id } }), p_epoca: 1, p_sesion: { name: tipo, pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: tipo }, p_estado: reto(1), p_mercado: fijados, p_resumen: {} })).data
  const supera = (d, id, fase) => m.uno(d, `update public.sim_sessions set estado = ${L(reto(fase, 'superada'))}::jsonb where id = ${L(id)}`)
  const fila = (d, id) => { const t = m.uno(d, `select row_to_json(s)::text from (select terminal, status, version, challenge_phase, challenge_parent_id, estado->>'fase' as fase from public.sim_sessions where id = ${L(id)}) s`); return t ? JSON.parse(t) : null }
  const pasa = (pu, padre, hija, version, o = {}) => pu.rpc('sim_avanzar_fase', { p_actor: AL, p_padre_id: padre, p_hija_id: hija, p_command_id: o.cmd ?? u(80000 + Math.floor(Math.random() * 1e6)), p_sobre: tx({ tipo: 'avanzar_fase', payload: { padre, hija } }), p_epoca: 1, p_version_esperada: version, p_sesion: hija ? {} : null, p_estado: o.estado !== undefined ? o.estado : hija ? reto(o.fase ?? 2) : null, p_mercado: hija ? fijados : null, p_resumen: {} }).then(r => r.data ?? r)
  const recibos = (d, id) => m.uno(d, `select count(*) from public.sim_recibos where session_id = ${L(id)} and tipo = 'avanzar_fase'`)
  const sesiones = d => m.uno(d, 'select count(*) from public.sim_sessions')

  titulo('3 · hueco_aceptado')
  const evento = { ordinal: 0, tipo: 'hueco_aceptado', t_mercado: 1736121600, datos: { par: 'EURUSD', inicio: '2025-01-06T00:00Z', minutos: 20, motivo: 'festivo' } }
  async function conHueco(d, clase) {
    const pu = prepara(d)
    const id = u(500 + Math.floor(Math.random() * 400))
    await CR.ordenCrear({ actor: AL, cuerpo: { session_id: id, command_id: u(600 + Math.floor(Math.random() * 300)), epoca: 1, name: 'H', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null }, puertos: pu })
    const t = (await pu.rpc('sim_tomar_escritor', { p_actor: AL, p_session_id: id, p_command_id: u(990), p_sobre: tx({ tipo: 'tomar_escritor' }), p_epoca: 1, p_cliente_id: 'p', p_forzar: true })).data
    const e = JSON.parse(m.uno(d, `select estado::text from public.sim_sessions where id = ${L(id)}`)); e.reloj.cursor = 1736122800
    const r = (await pu.rpc('sim_comando', { p_actor: AL, p_session_id: id, p_command_id: u(991), p_tipo: 'avanzar', p_sobre: tx({ tipo: 'avanzar', payload: { hasta: 1736122800 } }), p_epoca: 1, p_version_esperada: 0, p_cliente_id: 'p', p_testigo: t?.testigo, p_resultado: { resultado: 'aceptado', clase, estado: e, eventos: [evento], trades: [], proyeccion: {} } })).data
    return { r, id }
  }
  const sin = m.base('h0')
  const h0 = await conHueco(sin, 'economico')
  oraculo('S4B', 'sin sim-004b (sim-003 aplicada hoy): un avance con hueco_aceptado → 422 resultado_invalido (en eventos)', h0.r?.http === 422 && h0.r.motivo === 'resultado_invalido', tx(h0.r))
  const con = m.base('h1'); aplica(con)
  const h1 = await conHueco(con, 'economico')
  oraculo('S4B', 'con sim-004b: 200, recibo de clase economico y el evento guardado', h1.r?.http === 200 && h1.r.recibo?.clase === 'economico' && m.uno(con, `select count(*) from public.sim_eventos where tipo = 'hueco_aceptado' and session_id = ${L(h1.id)}`) === '1', tx(h1.r).slice(0, 300))
  const con2 = m.base('h2'); aplica(con2)
  const h2 = await conHueco(con2, 'ultimo_avance')
  oraculo('S4B', 'declarado ultimo_avance: 422 clase_incoherente (la clase de un avance con hueco_aceptado es economico)', h2.r?.http === 422 && h2.r.motivo === 'clase_incoherente' && h2.r.clase === 'economico', tx(h2.r))
  oraculo('S4B', 'y el adaptador del servidor da la misma clase', CO.claseDe('avanzar', [{ tipo: 'hueco_aceptado' }]) === 'economico' && CO.claseDe('avanzar', [{ tipo: 'fin_de_datos' }]) === 'ultimo_avance')

  titulo('4 · j.8: el completado y las transiciones')
  const dj = m.base('j1'); aplica(dj)
  const pu = prepara(dj)
  // 2F
  const R2 = u(2001), H2 = u(2002)
  ver('control: un 2F v1', (await creaReto(pu, R2, '2F'))?.http === 201)
  const nf = await pasa(pu, R2, H2, 0)
  oraculo('S4B', '2F en curso: 409 fase_no_superada', nf?.http === 409 && nf.motivo === 'fase_no_superada', tx(nf))
  supera(dj, R2, 1)
  const c12 = await pasa(pu, R2, H2, 0)
  oraculo('S4B', '2F fase 1 superada → la hija fase 2 (201, recibo en la hija; padre passed_phase, sin terminal)', c12?.http === 201 && fila(dj, H2)?.challenge_phase === 2 && fila(dj, R2)?.status === 'passed_phase' && fila(dj, R2)?.terminal === null && recibos(dj, H2) === '1', tx({ c12, h: fila(dj, H2), p: fila(dj, R2) }))
  supera(dj, H2, 2)
  const antes = sesiones(dj)
  const ultH = await pasa(pu, H2, u(2003), 0)
  oraculo('S4B', '2F fase 2 con una hija: 422 carga_invalida y nada (no hay fase 3)', ultH?.http === 422 && sesiones(dj) === antes && fila(dj, H2)?.terminal === null, tx(ultH))
  const vieja = await pasa(pu, H2, null, 7)
  oraculo('S4B', 'CAS: version vieja → 409 conflicto', vieja?.http === 409 && vieja.motivo === 'conflicto', tx(vieja))
  m.uno(dj, `update public.profiles set simulador_activo = false where id = ${L(AL)}`)
  const sinA = await pasa(pu, H2, null, 0)
  m.uno(dj, `update public.profiles set simulador_activo = true where id = ${L(AL)}`)
  oraculo('S4B', 'acceso revocado: 403 sin_acceso y nada', sinA?.http === 403 && fila(dj, H2)?.terminal === null, tx(sinA))
  const CMD = u(2999)
  const fin2 = await pasa(pu, H2, null, 0, { cmd: CMD })
  const fh = fila(dj, H2)
  oraculo('S4B', '2F fase 2 superada → superado: 200, sin hija nueva, terminal superado, passed_all, version 0 → 1, recibo avanzar_fase en la sesion (0 → 1)', fin2?.http === 200 && fin2.version === 1 && fh?.terminal === 'superado' && fh.status === 'passed_all' && fh.version === 1 && sesiones(dj) === antes && fin2.recibo?.session_id === H2 && fin2.recibo.version_partida === 0 && fin2.recibo.version_resultante === 1 && fin2.recibo.clase === 'economico', tx({ fin2, fh }))
  const rep = await pasa(pu, H2, null, 0, { cmd: CMD })
  oraculo('S4B', 'el mismo comando otra vez (respuesta perdida): 200 repetido, el mismo recibo, sin version nueva', rep?.http === 200 && rep.repetido === true && rep.recibo?.id === fin2?.recibo?.id && fila(dj, H2)?.version === 1, tx(rep))
  const otra = await pasa(pu, H2, null, 1)
  oraculo('S4B', 'otra clave sobre superado: 409 solo_lectura y nada', otra?.http === 409 && otra.motivo === 'solo_lectura' && recibos(dj, H2) === '2', tx(otra))
  const cm = (await pu.rpc('sim_comando', { p_actor: AL, p_session_id: H2, p_command_id: u(2998), p_tipo: 'cancelar', p_sobre: tx({ tipo: 'cancelar' }), p_epoca: 1, p_version_esperada: 1, p_cliente_id: 'p', p_testigo: 'x', p_resultado: { resultado: 'rechazado', motivo: 'x', clase: 'economico', estado: {}, eventos: [], trades: [], proyeccion: {} } })).data
  const tm = (await pu.rpc('sim_tomar_escritor', { p_actor: AL, p_session_id: H2, p_command_id: u(2997), p_sobre: tx({ tipo: 'tomar_escritor' }), p_epoca: 1, p_cliente_id: 'p', p_forzar: true })).data
  oraculo('S4B', 'sobre superado, sim_comando y sim_tomar_escritor: 409 solo_lectura', cm?.http === 409 && cm.motivo === 'solo_lectura' && tm?.http === 409 && tm.motivo === 'solo_lectura', tx({ cm, tm }))
  // 1F
  const R1 = u(1001)
  ver('control: un 1F v1', (await creaReto(pu, R1, '1F'))?.http === 201)
  supera(dj, R1, 1)
  const n1 = sesiones(dj)
  const f1F = await pasa(pu, R1, null, 0)
  oraculo('S4B', '1F fase 1 superada → superado sin hija (la ultima es la 1)', f1F?.http === 200 && fila(dj, R1)?.terminal === 'superado' && sesiones(dj) === n1, tx(f1F))
  const R1b = u(1002)
  await creaReto(pu, R1b, '1F'); supera(dj, R1b, 1)
  const n1b = sesiones(dj)
  const h1F = await pasa(pu, R1b, u(1003), 0)
  oraculo('S4B', '1F con una hija «fase 2»: 422 y ninguna sesion nueva', h1F?.http === 422 && sesiones(dj) === n1b, tx(h1F))
  // 3F
  const R3 = u(3001), H3 = u(3002), N3 = u(3003)
  await creaReto(pu, R3, '3F'); supera(dj, R3, 1)
  const t12 = await pasa(pu, R3, H3, 0, { fase: 2 })
  supera(dj, H3, 2)
  const t23 = await pasa(pu, H3, N3, 0, { fase: 3 })
  oraculo('S4B', '3F: 1→2 y 2→3 crean hija (la fase 2 NO queda superado), con challenge_phase 2 y 3', t12?.http === 201 && t23?.http === 201 && fila(dj, H3)?.terminal === null && fila(dj, H3)?.status === 'passed_phase' && fila(dj, N3)?.challenge_phase === 3, tx({ t12, t23 }))
  const t3x = await pasa(pu, H3, u(3009), 0, { fase: 3 })
  oraculo('S4B', '3F: la fase 2 ya tiene hija: 409 transicion_hecha', t3x?.http === 409 && t3x.motivo === 'transicion_hecha', tx(t3x))
  supera(dj, N3, 3)
  const t3 = await pasa(pu, N3, null, 0)
  oraculo('S4B', '3F fase 3 superada → superado, sin fase 4', t3?.http === 200 && fila(dj, N3)?.terminal === 'superado' && fila(dj, N3)?.status === 'passed_all', tx(t3))
  // borrar
  const eraSuperado = fila(dj, R1)?.terminal === 'superado'
  const bh = (await pu.rpc('sim_borrar_sesion', { p_actor: AL, p_session_id: R1 })).data
  oraculo('S4B', 'sim_borrar_sesion sobre un superado: lapida', eraSuperado && bh?.ok === true && fila(dj, R1)?.terminal === 'borrada', tx(bh))
  const br = (await pu.rpc('sim_borrar_sesion', { p_actor: AL, p_session_id: R3 })).data
  oraculo('S4B', 'la cadena 3F desde la raiz: las tres lapidas (tambien la superado)', br?.ok === true && [R3, H3, N3].every(x => fila(dj, x)?.terminal === 'borrada'), tx({ br, f: [R3, H3, N3].map(x => fila(dj, x)?.terminal) }))

  // ── 5 · E3-03 (Astra 15-oct; CTO): sim-004b ACREDITA el catalogo del que depende, en la primera
  // aplicacion y en la reejecucion: RLS activa en las tablas protegidas, las politicas exactas, las
  // ACL, y las funciones que conserva y los disparadores de los que depende por cuerpo (sha256) y
  // atributos (lenguaje, SECURITY, volatilidad, dueño, proconfig, EXECUTE). Un desvio aborta con
  // «sim-004b: …» y el catalogo no cambia (diseño q.16).
  titulo('5 · E3-03: la acreditacion del catalogo (primera aplicacion y reejecucion)')
  const S4B_ = /^sim-004b: /
  let nb = 0
  // altera(d): el desvio plantado; antes: en la primera aplicacion (true) o tras aplicar (false)
  function desvio(que, altera, { antes, patron = S4B_ } = {}) {
    const d = m.base(`e3${++nb}`)
    if (!antes) { const r0 = aplica(d); if (!r0.ok) return { que, ok: false, msg: 'control: la primera aplicacion fallo: ' + err1(r0) } }
    altera(d)
    const f0 = foto(d), r = aplica(d)
    return { que, aborta: !r.ok && patron.test(err1(r)), intacto: foto(d) === f0, msg: r.ok ? 'APLICA (no aborta)' : err1(r) }
  }
  const SIN_RLS = d => m.uno(d, 'alter table public.sim_eventos disable row level security')
  const AJENO = d => m.uno(d, "create or replace function public.sim_borrar_alumno(p_user_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin return jsonb_build_object('ok',true,'http',200,'inventado','cuerpo-no-es-sim003'); end $$")
  const POLITICA = d => m.uno(d, 'drop policy sim_eventos_select_propios on public.sim_eventos; create policy sim_eventos_select_propios on public.sim_eventos for select to authenticated using (true)')
  const casos = [
    ['Astra: RLS apagada en sim_eventos, primera aplicacion', SIN_RLS, true],
    ['Astra: RLS apagada en sim_eventos, reejecucion', SIN_RLS, false],
    ['Astra: cuerpo ajeno en sim_borrar_alumno (misma firma, definer, search_path y ACL), reejecucion', AJENO, false],
    ['cuerpo ajeno en sim_borrar_alumno, primera aplicacion', AJENO, true],
    ['una politica alterada (sim_eventos_select_propios USING true), primera aplicacion', POLITICA, true],
    ['una politica alterada (sim_eventos_select_propios USING true), reejecucion', POLITICA, false],
    ['una RESTRICTIVE de sim_trades con otros roles, reejecucion', d => m.uno(d, `drop policy sim_trades_sesion_propia_insert on public.sim_trades; create policy sim_trades_sesion_propia_insert on public.sim_trades as restrictive for insert to public with check (exists (select 1 from public.sim_sessions s where s.id = sim_trades.session_id and s.user_id = (select auth.uid())))`), false],
    ['una politica de mas en sim_recibos (anon lee todo), reejecucion', d => m.uno(d, 'create policy sim_recibos_todo on public.sim_recibos for select to anon using (true)'), false],
    ['RLS apagada en sim_sessions, reejecucion', d => m.uno(d, 'alter table public.sim_sessions disable row level security'), false],
    ['una ACL de mas: SELECT de sim_alumnos para authenticated, reejecucion', d => m.uno(d, 'grant select on public.sim_alumnos to authenticated'), false],
    ['una ACL de mas en sim_sessions: TRUNCATE para authenticated, reejecucion', d => m.uno(d, 'grant truncate on public.sim_sessions to authenticated'), false],
    ['una ACL de columna en sim_trades (UPDATE (pnl) para anon), reejecucion', d => m.uno(d, 'grant update (pnl) on public.sim_trades to anon'), false],
    ['un disparador de la preparatoria desactivado (sim_sessions_rev_saldo), reejecucion', d => m.uno(d, 'alter table public.sim_sessions disable trigger sim_sessions_rev_saldo'), false],
    ['un disparador de mas en sim_eventos, reejecucion', d => m.uno(d, 'create trigger x_de_mas before insert on public.sim_eventos for each row execute function public.sim_escrituras_v0_solo_disparador()'), false],
    ['el cuerpo de enforce_sim_session_limit (el cupo de produccion, s04) cambiado, reejecucion', d => m.uno(d, 'create or replace function public.enforce_sim_session_limit() returns trigger language plpgsql security definer set search_path = public as $$ begin return new; end $$'), false],
    ['un atributo: sim_crear_sesion con search_path = public (mismo cuerpo), reejecucion', d => m.uno(d, 'alter function public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb) set search_path = public'), false],
    ['un atributo: sim_cierre_v0 SECURITY DEFINER (mismo cuerpo), reejecucion', d => m.uno(d, 'alter function public.sim_cierre_v0(uuid,numeric,bigint,jsonb) security definer'), false],
    ['un atributo: sim_error de otro dueño (mismo cuerpo), reejecucion', d => m.uno(d, 'alter function public.sim_error(integer,text,jsonb) owner to service_role'), false],
    ['EXECUTE de mas: sim_bloquea_alumno para service_role, reejecucion', d => m.uno(d, 'grant execute on function public.sim_bloquea_alumno(uuid) to service_role'), false],
  ]
  for (const [que, altera, antes] of casos) {
    const r = desvio(que, altera, { antes })
    oraculo('E3-03', `${que}: aborta con «sim-004b: …» y el catalogo no cambia`, r.aborta === true && r.intacto === true, r.msg)
  }
  // controles: la puerta (estado 2 de la preparatoria) es un estado valido; la de otro cuerpo, no
  const PUERTA = lee('sql/sim-004a-puerta.sql')
  {
    const d = m.base('e3p1')
    const p = m.comoEjecutor(d, PUERTA)
    const r = aplica(d)
    oraculo('E3-03', 'con la puerta aplicada (estado 2 de la preparatoria): sim-004b aplica y la reejecucion tambien', p.ok && r.ok && aplica(d).ok, p.ok ? (r.ok ? '' : err1(r)) : 'control: la puerta no se aplico: ' + err1(p))
    const d2 = m.base('e3p2')
    m.comoEjecutor(d2, PUERTA)
    m.uno(d2, 'create or replace function public.sim_escrituras_v0_puerta() returns trigger language plpgsql volatile security invoker set search_path = \'\' as $$ begin return coalesce(new, old); end $$')
    const f0 = foto(d2), r2 = aplica(d2)
    oraculo('E3-03', 'con una puerta de otro cuerpo: aborta con «sim-004b: …» y el catalogo no cambia', !r2.ok && S4B_.test(err1(r2)) && foto(d2) === f0, r2.ok ? 'APLICA' : err1(r2))
  }
  // la constante de enforce_sim_session_limit sale de la definicion MEDIDA en produccion (s04 del 10-oct)
  {
    const csv = lee('sql/consultas/salidas/s04-esquema-simulador-2026-10-10.csv')
    const i = csv.indexOf('CREATE OR REPLACE FUNCTION public.enforce_sim_session_limit()')
    const a = csv.indexOf('AS $function$', i) + 'AS $function$'.length, b = csv.indexOf('$function$', a)
    const { createHash } = await import('node:crypto')
    const sha = createHash('sha256').update(csv.slice(a, b), 'utf8').digest('hex')
    ver('control: el cuerpo de enforce_sim_session_limit medido en s04 esta en el fichero', i > 0 && b > a, sha)
    oraculo('E3-03', 'sim-004b acredita enforce_sim_session_limit con el sha256 de su cuerpo MEDIDO en s04 (no inventado)', S4B.includes(sha), sha)
  }
} finally { m.cierra() }
fin()
