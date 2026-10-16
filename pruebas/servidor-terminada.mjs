/**
 * ETAPA 3 · E3R2-02 (Astra r2; CTO 16-oct): UNA SESION TERMINADA SE RESUELVE DESDE EL ESTADO GUARDADO, SIN MERCADO.
 * Escrita ANTES que el codigo (contra f252152: en rojo).
 *
 * Contra sim_comando y sim_avanzar_fase REALES (montaje-v1). Cuatro estados terminales guardados: reto breach, reto
 * superada (la ultima fase de un 1F), cartera breach y cartera objetivo. El almacen del mercado se cambia, despues de
 * crear y tomar, por uno que FALLA en cualquier lectura y las cuenta. La familia: cada comando (avanzar, abrir,
 * modificar, cancelar, cerrar, checkpoint) y avanzar-fase × los cuatro estados.
 *   · cero lecturas de mercado en todos;
 *   · avanzar: 200, recibo aceptado con resumen.detencion { motivo: sesion_terminada } y resumen.causa (la del estado
 *     guardado), sin eventos ni version nueva; los demas comandos economicos: 200, recibo rechazado sesion_terminada
 *     con su causa; checkpoint: aceptado, sin causa (q.18.2); avanzar-fase: reto breach 409 fase_no_superada, reto
 *     superada (ultima fase) 200 completado, cartera (no es un reto) la RPC decide, sin leer mercado;
 *   · la repeticion del mismo comando devuelve el recibo guardado, con la misma causa, sin leer mercado.
 * Lo que NO entra: el paso a una fase hija SI lee el mercado (la hija nace con su mercado fijado), y es correcto.
 */
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, importa, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, L } from './montaje-v1.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs'), CO = await importa('lib/servidor/comando.mjs'), FA = await importa('lib/servidor/fase.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const M0 = U('2025-01-06T00:00:00Z'), m = k => M0 + 60 * k
const AHORA = Date.parse('2026-10-14T10:00:00Z')
const ordena_ = v => (Array.isArray(v) ? v.map(ordena_) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordena_(v[k])])) : v)
const tx = x => JSON.stringify(ordena_(x))
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velas(par) { const o = []; for (let t = M0; t < U('2025-01-09T00:00:00Z'); t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: PX[par], high: PX[par], low: PX[par], close: PX[par], volume: 1 }); return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velas(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
// el almacen que falla en CUALQUIER lectura de mercado, y las cuenta
let lecturas = 0
const caido = new Proxy({}, { get: () => async () => { lecturas++; throw Object.assign(new Error('almacen caido (prueba)'), { propio: true, codigo: 'almacen_caido' }) } })

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const pg = montajeV1()
try {
  pg.arranca()
  // con sim-004b aplicada (sim_avanzar_fase generalizada: la ultima fase sin hija), como servidor-fase
  const d = pg.base('ter1'), AL = u(1)
  const a4b = pg.comoEjecutor(d, readFileSync(path.join(REPO, 'sql/sim-004b-contrato-v1.sql'), 'utf8'))
  ver('control: sim-004b aplicada en el montaje', a4b.ok, a4b.err.slice(0, 200))
  pg.alumno(d, AL)
  const leeSesion = async id => { const t = pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const pu = { almacen: mercado, rpc: pg.rpc(d), leeSesion, ahora: () => AHORA }
  const sinTasa = () => pg.uno(d, 'update public.sim_alumnos set siguiente_avance_desde = null')
  const version = id => Number(pg.uno(d, `select version from public.sim_sessions where id = ${L(id)}`))
  const estadoDe = id => JSON.parse(pg.uno(d, `select estado::text from public.sim_sessions where id = ${L(id)}`))
  const pon = (id, x) => pg.uno(d, `update public.sim_sessions set estado = ${L(CA.serializa(x))}::jsonb where id = ${L(id)}`)
  const ESTADOS = [
    ['reto breach', 1001, '1F', r => ({ ...r, estado: 'breach' }), 'breach'],
    ['reto superada (ultima fase de un 1F)', 1002, '1F', r => ({ ...r, estado: 'superada', superada: { saldo_µ: r.motor.saldo_µ, dias: 4, en: { t: m(10) } } }), 'fase_superada'],
    ['cartera breach', 1003, null, e => ({ ...e, estado: 'breach' }), 'breach'],
    ['cartera objetivo', 1004, null, e => ({ ...e, estado: 'objetivo' }), 'objetivo_alcanzado'],
  ]
  let n = 5000
  const testigos = {}
  for (const [nombre, k, reto, terminal] of ESTADOS) {
    pu.almacen = mercado
    const c = await CR.ordenCrear({ actor: AL, cuerpo: { session_id: u(k), command_id: u(2000 + k), epoca: 1, name: nombre, pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: reto }, puertos: pu })
    testigos[k] = (await TO.ordenTomar({ actor: AL, cuerpo: { session_id: u(k), command_id: u(3000 + k), epoca: 1, cliente_id: 'p', forzar: true }, puertos: pu })).cuerpo?.testigo
    sinTasa()
    const a = await CO.ordenComando({ actor: AL, cuerpo: { session_id: u(k), command_id: u(++n), epoca: 1, cliente_id: 'p', tipo: 'avanzar', version_esperada: version(u(k)), testigo: testigos[k], hasta: m(10), motivo: 'paso' }, puertos: pu })
    pon(u(k), terminal(CA.deserializa(JSON.stringify(estadoDe(u(k))))))
    ver(`control: ${nombre}: creada, tomada, avanzada con mercado y puesta en su estado terminal guardado`, c.http === 201 && !!testigos[k] && a.http === 200 && ['breach', 'superada', 'objetivo'].includes(estadoDe(u(k)).estado), tx({ c: c.http, a: a.http, e: estadoDe(u(k)).estado }))
  }
  pu.almacen = caido
  const recibo = (id, cid) => JSON.parse(pg.uno(d, `select json_build_object('resultado', resultado, 'motivo', motivo, 'resumen', resumen)::text from public.sim_recibos where session_id = ${L(id)} and command_id = ${L(cid)}`) || 'null')
  const CARGAS = {
    avanzar: () => ({ hasta: m(60), motivo: 'play' }),
    abrir: () => ({ par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: m(10) }),
    modificar: () => ({ id: 'p1', sl: '1.00000' }),
    cancelar: () => ({ id: 'o1' }),
    cerrar: () => ({ id: 'p1' }),
    checkpoint: () => ({}),
  }
  for (const [nombre, k, , , causa] of ESTADOS) {
    titulo(`${nombre}: cada comando, con el mercado caido`)
    const id = u(k)
    // el arrendamiento de escritor es uno por alumno: se toma esta sesion antes de sus comandos (tomar no lee mercado)
    const lt = lecturas
    testigos[k] = (await TO.ordenTomar({ actor: AL, cuerpo: { session_id: id, command_id: u(++n), epoca: 1, cliente_id: 'p', forzar: true }, puertos: pu })).cuerpo?.testigo
    ver(`control: ${nombre}: tomada otra vez, sin leer mercado`, !!testigos[k] && lecturas === lt, String(lecturas - lt))
    for (const tipo of Object.keys(CARGAS)) {
      sinTasa()
      const v0 = version(id), l0 = lecturas
      const cuerpo = { session_id: id, command_id: u(++n), epoca: 1, cliente_id: 'p', tipo, version_esperada: v0, testigo: testigos[k], ...CARGAS[tipo]() }
      const r = await CO.ordenComando({ actor: AL, cuerpo, puertos: pu })
      const g = recibo(id, cuerpo.command_id)
      const espera = tipo === 'avanzar' ? { resultado: 'aceptado', motivo: null, det: { motivo: 'sesion_terminada' }, causa }
        : tipo === 'checkpoint' ? { resultado: 'aceptado', motivo: null, det: null, causa: undefined }
          : { resultado: 'rechazado', motivo: 'sesion_terminada', det: null, causa }
      const ok = r.http === 200 && lecturas === l0 && g?.resultado === espera.resultado && g?.motivo === espera.motivo && tx(g?.resumen?.detencion ?? null) === tx(espera.det) && g?.resumen?.causa === espera.causa
        && (tipo !== 'avanzar' || (g?.resumen?.eventos === 0 && version(id) === v0))
      oraculo('TERM', `${nombre} · ${tipo}: 200, cero lecturas de mercado, recibo ${espera.resultado}${espera.motivo ? ' ' + espera.motivo : ''}${espera.det ? ' con detencion sesion_terminada' : ''}${espera.causa ? ' y causa ' + espera.causa : ', sin causa'}`, ok, tx({ http: r.http, motivo: r.cuerpo?.motivo, lecturas: lecturas - l0, g }))
      sinTasa()
      const l1 = lecturas
      const rep = await CO.ordenComando({ actor: AL, cuerpo, puertos: pu })
      oraculo('TERM', `${nombre} · ${tipo}: la repeticion devuelve el recibo guardado (repetido), con la misma causa, sin leer mercado`, rep.http === 200 && rep.cuerpo?.repetido === true && lecturas === l1 && rep.cuerpo?.recibo?.resumen?.causa === espera.causa, tx({ http: rep.http, rep: rep.cuerpo?.repetido, c: rep.cuerpo?.recibo?.resumen?.causa, lecturas: lecturas - l1 }))
    }
    const l0 = lecturas
    const f = await FA.ordenFase({ actor: AL, cuerpo: { padre_id: id, hija_id: null, command_id: u(++n), epoca: 1, version_esperada: version(id) }, puertos: pu })
    const esperaFase = k === 1001 ? f.http === 409 && f.cuerpo?.motivo === 'fase_no_superada' : k === 1002 ? f.http === 200 && f.cuerpo?.recibo?.resumen?.completado === true : f.http >= 400
    oraculo('TERM', `${nombre} · avanzar-fase (sin hija): ${k === 1001 ? '409 fase_no_superada' : k === 1002 ? '200 completado (la ultima fase)' : 'no es un reto: la RPC lo rechaza'}, cero lecturas de mercado`, esperaFase && lecturas === l0, tx({ http: f.http, motivo: f.cuerpo?.motivo, lecturas: lecturas - l0 }))
  }
  ver(`control: el almacen caido falla de verdad si se lee (lecturas contadas: ${lecturas})`, await caido.lee('v1/actual.json').then(() => false, e => /caido/.test(e.message)))
} finally { pg.cierra() }
fin()
