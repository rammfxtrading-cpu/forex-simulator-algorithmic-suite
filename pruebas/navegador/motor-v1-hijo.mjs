// EL HIJO DE motor-v1-real.mjs (orden 1-175): lib/servidor REAL + PostgreSQL desechable, en un proceso con sin-red.mjs y
// registro.mjs delante (como la tanda: el arnes de nodo no arranca sin ellos, y asi el servidor de la prueba no tiene red).
// Habla con el padre por IPC: { id, op: 'prepara'|'api'|'fila'|'cierra', ... } → { id, ok, valor | error }.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
const REPO = path.resolve(import.meta.dirname, '..', '..')
const USUARIO = 'aaaaaaaa-1111-4111-8111-111111111111', SESION = '5e5e5e5e-0000-4000-8000-000000000001'
const importa = p => import(pathToFileURL(path.join(REPO, p)).href)
// las velas de la pagina (sesion-comun.mjs velasDosSemanas, sin importar el arnes de Chrome)
function velasDosSemanas() {
  const fx = JSON.parse(fs.readFileSync(path.join(REPO, 'pruebas/fixtures/velas/eurusd-2026-03-02-semana.json'), 'utf8'))
  const s1 = fx.velas.map(([time, open, high, low, close]) => ({ time, open, high, low, close, volume: 1 }))
  return [...s1, ...s1.map(v => ({ ...v, time: v.time + 7 * 86400 }))]
}
const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const SO = await importa('lib/servidor/sobre.mjs'), CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const fuente = p => fs.readFileSync(path.join(REPO, p), 'utf8')
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (navegador ps01/ps02)';") }

// el mercado: EUR/USD con las velas de la pagina; el resto constante en los mismos minutos (sin los cerrados)
const eur = velasDosSemanas()
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
const velasDe = par => (par === 'EURUSD' ? eur.filter(v => !minutoCerrado(v.time)) : eur.filter(v => !minutoCerrado(v.time)).map(v => ({ time: v.time, open: PX[par], high: PX[par], low: PX[par], close: PX[par], volume: 1 })))
const o = new Map()
const almacen = { async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } }
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })

const pg = montajeV1()
pg.arranca()
const d = 'navegador'
pg.base(d)
const a4 = pg.comoEjecutor(d, conUidDelMontaje(fuente('sql/sim-004b-contrato-v1.sql'))), a6 = pg.comoEjecutor(d, deEnsayo(fuente('sql/sim-006-tope-de-pasos.sql')))
if (!a4.ok || !a6.ok) { pg.cierra(); throw new Error('sim-004b/sim-006 no se aplicaron: ' + (a4.err + a6.err).slice(0, 300)) }
pg.alumno(d, USUARIO)
const uno = q => pg.uno(d, q)
const fila = async (id = SESION) => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
const puertos = { almacen, rpc: pg.rpc(d), parDeId: pg.parDeId(d), leeSesion: fila, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
const orden = { '/api/sim/tomar': TO.ordenTomar, '/api/sim/estado': ES.ordenEstado, '/api/sim/comando': CO.ordenComando }
let n = 600000
const nuevoId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

async function prepara({ hasta }) {
  const c = await CR.ordenCrear({ actor: USUARIO, cuerpo: { session_id: SESION, command_id: nuevoId(), epoca: 1, name: 'Practica', pair: 'EUR/USD', timeframe: 'M15', date_from: '2026-03-02', date_to: '2026-09-30', capital: '10000', challenge_type: null }, puertos })
  if (c.http !== 201) throw new Error('crear: ' + JSON.stringify(c).slice(0, 400))
  const t = await TO.ordenTomar({ actor: USUARIO, cuerpo: { session_id: SESION, command_id: nuevoId(), epoca: 1, cliente_id: 'preparacion', forzar: true }, puertos })
  for (let k = 0; k < 6; k++) {
    uno('update public.sim_alumnos set siguiente_avance_desde = null')
    const f = await fila()
    const cur = f.estado.reloj?.cursor ?? null
    if (cur != null && cur >= hasta) break
    const r = await CO.ordenComando({ actor: USUARIO, cuerpo: { session_id: SESION, command_id: nuevoId(), epoca: 1, cliente_id: 'preparacion', testigo: t.cuerpo.testigo, version_esperada: Number(f.version), tipo: 'avanzar', hasta, motivo: 'goto' }, puertos })
    if (r.http !== 200) throw new Error('avanzar: ' + JSON.stringify(r).slice(0, 400))
  }
  uno('update public.sim_alumnos set siguiente_avance_desde = null')
  // el escritor de la preparacion caduca: la pagina toma el suyo
  uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
  return fila()
}

// el gancho de app.mjs: /api/sim/* al servidor real; el resto, null (lo de siempre)
async function api({ ruta, cuerpo }) {
  const r = await orden[ruta]({ actor: USUARIO, cuerpo, puertos })
  if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') uno('update public.sim_alumnos set siguiente_avance_desde = null')
  return { http: r.http, cuerpo: r.cuerpo }
}
const ops = { prepara, api, fila: () => fila(), cierra: () => { pg.cierra(); return true } }
process.on('message', async ({ id, op, arg }) => {
  try { const valor = await ops[op](arg); process.send({ id, ok: true, valor }); if (op === 'cierra') process.exit(0) }
  catch (e) { process.send({ id, ok: false, error: String(e?.stack ?? e) }) }
})
process.on('disconnect', () => { try { pg.cierra() } catch {} ; process.exit(0) })
process.send({ id: 0, ok: true, valor: 'listo' })

