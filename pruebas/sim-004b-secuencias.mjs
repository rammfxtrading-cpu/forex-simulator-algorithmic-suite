/**
 * ETAPA 3 · RINV2-03 (CTO 17-oct, orden 1-006): el estado de las secuencias identity no es catalogo (cambia con el
 * uso normal). La s16 sigue siendo SOLO catalogo y lo declara como limite; sim-004b, al aplicarse, comprueba ANTES de
 * cualquier cambio que el siguiente valor de cada secuencia identity de las 14 tablas queda por encima de max(id).
 * Solo el agregado (max): ninguna fila ni columna de alumnos. Escrita ANTES que el codigo (contra 2208470: en rojo).
 *
 * Contra PostgreSQL 17 local (montaje-v1, con la puerta), en primera aplicacion y en reejecucion:
 *   · el positivo: el estado normal (y un setval al max, is_called = true) pasa;
 *   · mutantes: secuencia reiniciada por debajo de max(id), igual a max(id) (RESTART WITH max, y setval a max - 1)
 *     → sim-004b aborta con «sim-004b: la secuencia …» y nada cambia; la s16 sigue dando OK (limite declarado);
 *   · tabla vacia: reiniciada a 1, pasa.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, importa, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, conUidDelMontaje } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S4B0 = lee('sql/sim-004b-contrato-v1.sql'), S160 = lee('sql/consultas/s16-catalogo-sim004b.sql')
const CA = await importa('lib/motor/cartera.mjs'), RT = await importa('lib/motor/reto.mjs'), { COSTES_1 } = await importa('lib/motor/costes.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const err1 = r => (r.err.split('\n').find(l => /ERROR/.test(l)) || r.err.split('\n')[0] || '').replace(/^.*ERROR:\s+/, '')

titulo('el texto: la guarda va en la seccion 0 (antes de cualquier cambio), solo con agregados; la s16 declara el limite')
const i0 = S4B0.indexOf('-- RINV2-03 (CTO 17-oct, orden 1-006)'), i1 = S4B0.indexOf('-- ── ¿sin aplicar, aplicada o a medias?'), i2 = S4B0.indexOf('ALTER TABLE public.sim_sessions DROP CONSTRAINT')
const guarda = i0 >= 0 && i1 > i0 ? S4B0.slice(i0, i1) : ''
oraculo('SEQ', 'sim-004b: la guarda de las secuencias esta en la seccion 0, antes del primer cambio', i0 > 0 && i1 > i0 && i2 > i1)
const ejecuta = guarda.match(/EXECUTE format\('[^']*'/g) || []
oraculo('SEQ', 'sim-004b: la guarda solo lee el estado de la secuencia y max(columna) (dos EXECUTE, ningun otro)', ejecuta.length === 2 && ejecuta[0] === "EXECUTE format('SELECT last_value, is_called FROM %s'" && ejecuta[1] === "EXECUTE format('SELECT max(%s) FROM %s'", ejecuta.join(' / '))
oraculo('SEQ', 's16: declara el limite (el estado de las secuencias no es catalogo; lo comprueba sim-004b)', /LIMITE DECLARADO \(RINV2-03, CTO 17-oct\): solo catalogo/.test(S160) && /esta\s*\n?--\s*consulta NO lo mide/.test(S160))

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const m = montajeV1()
const estado = () => JSON.parse(CA.serializa(RT.creaReto({ motor: CA.crea({ pares: ['EURUSD'], costes: COSTES_1, capital: '100000' }), inicio: 1736121600, reglas: RT.SUITE_1F })))
const crea = (d, s, c) => m.rpc(d)('sim_crear_sesion', { p_actor: u(1), p_session_id: s, p_command_id: c, p_sobre: JSON.stringify({ tipo: 'crear' }), p_epoca: 1, p_sesion: { name: 'inventada', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '1F' }, p_estado: estado(), p_mercado: { EURUSD: 'EURUSD@v1.1:' + 'a'.repeat(64) }, p_resumen: {} })
try {
  m.arranca()
  let n = 0
  const S4B = conUidDelMontaje(S4B0), S16 = conUidDelMontaje(S160)
  const aplica = d => m.comoEjecutor(d, S4B)
  const s16 = d => m.comoEjecutor(d, `begin read only;\n${S16}\nrollback;`)
  const foto = d => m.uno(d, `select md5(string_agg(x, ',' order by x)) from (select c.relname || ':' || coalesce((select string_agg(conname || pg_get_constraintdef(oid), ',' order by conname) from pg_constraint where conrelid = c.oid), '') || ':' || coalesce((select string_agg(p.proname || md5(p.prosrc), ',' order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace), '') x from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r') s`)
  const sigue = d => m.uno(d, "select (select pg_get_constraintdef(oid) from pg_constraint where conname = 'sim_sessions_terminal_valida') like '%superado%'")
  // una base con dos sesiones creadas: sim_recibos tiene filas (max(id) >= 2)
  const nueva = async despues => {
    const d = m.base(`sq${++n}`)
    const p = m.comoEjecutor(d, lee('sql/sim-004a-puerta.sql')); if (!p.ok) throw new Error('puerta: ' + p.err)
    if (despues) { const r = aplica(d); if (!r.ok) throw new Error('control: sim-004b no aplica: ' + err1(r)) }
    m.alumno(d, u(1))
    for (const k of [2, 4]) { const c = await crea(d, u(k), u(k + 1)); if (c.data?.http !== 201) throw new Error('control: crear: ' + JSON.stringify(c.data ?? c.error)) }
    return d
  }
  const ident = d => m.uno(d, "select string_agg(c.relname || '.' || a.attname || '=' || coalesce((xpath('/row/m/text()', query_to_xml(format('select max(%I) m from public.%I', a.attname, c.relname), false, true, '')))[1]::text, '-'), ' ' order by 1) from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attidentity <> '' where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'").trim()

  titulo('el positivo')
  for (const despues of [false, true]) {
    const d = await nueva(despues)
    const mx = Number(m.uno(d, 'select max(id) from public.sim_recibos').trim())
    ver(`control: ${despues ? 'reejecucion' : 'primera aplicacion'}: sim_recibos tiene filas (max(id) = ${mx} >= 2), y las 4 identity son ${ident(d)}`, mx >= 2 && ident(d).split(' ').length === 4)
    ver(`control: ${despues ? 'reejecucion' : 'primera aplicacion'}: en el estado normal, sim-004b aplica`, aplica(d).ok)
  }
  for (const despues of [false, true]) {
    const d = await nueva(despues)
    m.comoEjecutor(d, "select setval(pg_get_serial_sequence('public.sim_recibos', 'id'), (select max(id) from public.sim_recibos), true);")
    ver(`control: ${despues ? 'reejecucion' : 'primera aplicacion'}: setval al max(id) con is_called = true (el siguiente, max + 1): aplica`, aplica(d).ok)
  }

  titulo('mutantes: sim-004b aborta antes de cambiar nada; la s16 sigue OK (limite declarado)')
  const MUT = [
    ['reiniciada por debajo de max(id): RESTART WITH 1', 'alter table public.sim_recibos alter column id restart with 1;'],
    ['igual a max(id): RESTART WITH max (is_called = false, el siguiente seria max)', "do $$ begin execute format('alter table public.sim_recibos alter column id restart with %s', (select max(id) from public.sim_recibos)); end $$;"],
    ['igual a max(id): setval a max - 1 con is_called = true (el siguiente seria max)', "select setval(pg_get_serial_sequence('public.sim_recibos', 'id'), (select max(id) - 1 from public.sim_recibos), true);"],
  ]
  for (const [nombre, mutante] of MUT) for (const despues of [false, true]) {
    const d = await nueva(despues)
    const mu = m.comoEjecutor(d, mutante)
    if (!mu.ok) { oraculo('SEQ', `${nombre}: el mutante se aplica`, false, err1(mu)); continue }
    const q = s16(d)
    const a = foto(d), s0 = sigue(d)
    const r = aplica(d)
    oraculo('SEQ', `${nombre} (${despues ? 'reejecucion' : 'primera aplicacion'}): sim-004b aborta con «sim-004b: la secuencia …sim_recibos.id…» y nada cambia; la s16 da OK`,
      !r.ok && err1(r).startsWith('sim-004b: la secuencia ') && err1(r).includes('public.sim_recibos.id') && foto(d) === a && sigue(d) === s0 && s0.trim() === (despues ? 't' : 'f') && q.ok && /^veredicto\|OK\|/m.test(q.out),
      `${err1(r).slice(0, 200)} · ${(q.out.match(/^veredicto\|.*$/m) || [''])[0].slice(0, 80)}`)
  }
  ver('control: los 3 mutantes del CTO (por debajo, igual por RESTART e igual por setval), en primera aplicacion y en reejecucion', MUT.length === 3)

  titulo('tabla vacia: pasa')
  for (const despues of [false, true]) {
    const d = await nueva(despues)
    const vacias = ident(d).split(' ').filter(x => x.endsWith('=-')).map(x => x.replace(/=-$/, ''))
    const [t, c] = (vacias[0] || '.').split('.')
    const mu = vacias.length ? m.comoEjecutor(d, `alter table public.${t} alter column ${c} restart with 1;`) : { ok: false, err: 'no hay ninguna identity vacia' }
    oraculo('SEQ', `tabla vacia (${vacias[0] || '-'}) con la secuencia reiniciada a 1 (${despues ? 'reejecucion' : 'primera aplicacion'}): sim-004b aplica`, mu.ok && aplica(d).ok, mu.ok ? '' : err1(mu))
  }
} finally { m.cierra() }
fin()
