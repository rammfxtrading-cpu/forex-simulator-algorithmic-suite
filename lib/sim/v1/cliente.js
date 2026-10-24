// EL CLIENTE DE COMANDOS DE LA PANTALLA V1 (etapa 2 del motor, pieza 1; diseño sim-004 d5/d6; diseño-persistencia
// § 4.2, § 4.4 y § 6). Sin React: la pagina lo usara a traves de un hook (pieza 2).
//
//   · ESCRITOR: toma() pide el arrendamiento (POST /api/sim/tomar); el testigo vive en sessionStorage (la pestaña),
//     nunca en localStorage. Con otra pestaña escribiendo, toma({ forzar: true }) es «Usar aqui».
//   · ESTADO CONFIRMADO: leeEstado() (GET /api/sim/estado) e instala() solo si la version es MAYOR que la conocida
//     (una respuesta vieja nunca rebaja el estado). El ACK de un comando y el snapshot van separados.
//   · COLA: cada orden lleva su command_id y la version esperada; se guarda en localStorage (usuario/sesion/epoca)
//     ANTES de enviarse y sale solo con respuesta. UNA peticion en vuelo por sesion. Un resultado incierto (red, plazo
//     vencido, 500) se queda en la cola y se reenvia con la MISMA clave antes de la siguiente orden (la RPC es
//     idempotente: devuelve el recibo si ya se confirmo).
//   · RESPUESTAS (conclusion):
//       confirmado / rechazado   2xx con recibo (rechazado: el motor lo rechazo, p. ej. margen); sale de la cola
//       conflicto                409 conflicto: sin efectos; sale de la cola y relee el estado (el alumno re-decide)
//       caducado                 409 comando_caducado: carga el estado confirmado y vacia la cola
//       usar_aqui                409 sin_arrendamiento / escritor_ocupado / otra_sesion_activa (o sin testigo)
//       solo_lectura             409 solo_lectura / no_es_v1
//       borrada / actualizar / sin_acceso / mantenimiento / invalido   410 / 426 / 403 / 503 / 4xx: fuera de la cola
//       incierto                 sin respuesta, plazo vencido o 5xx (no 503): en la cola
//     429 demasiados_avances: espera y reintenta la MISMA clave.
//
// llama(ruta, { metodo, cuerpo }) → { http, cuerpo } (o lanza si no hay respuesta): el transporte, inyectado.
import { conPlazo, VENCIDO, PLAZO } from '../plazo'

const USAR_AQUI = new Set(['sin_arrendamiento', 'escritor_ocupado', 'otra_sesion_activa'])
const SOLO_LECTURA = new Set(['solo_lectura', 'no_es_v1'])
const INTENTOS_429 = 6

const lee = (alm, k) => { try { return alm?.getItem(k) ?? null } catch { return null } }
const escribe = (alm, k, v) => { try { v == null ? alm?.removeItem(k) : alm?.setItem(k, v); return true } catch { return false } }
const duerme = ms => new Promise(r => setTimeout(r, ms))

export function creaCliente({ sessionId, usuario, epoca = 1, llama, local = null, sesion = null, nuevoId, plazoMs = null, espera429Ms = 5000 }) {
  const kCola = `sim-v1/cola/${usuario}/${sessionId}/${epoca}`
  const kTestigo = `sim-v1/testigo/${sessionId}`
  const kCliente = `sim-v1/cliente/${sessionId}`
  let clienteId = lee(sesion, kCliente)
  if (!clienteId) { clienteId = `pestana-${nuevoId()}`; escribe(sesion, kCliente, clienteId) }
  let cola = (() => { try { return JSON.parse(lee(local, kCola) ?? '[]') } catch { return [] } })()
  let estado = null, ultimo = null
  let cadena = Promise.resolve()
  const persiste = () => escribe(local, kCola, cola.length ? JSON.stringify(cola) : null)
  const quita = id => { cola = cola.filter(e => e.command_id !== id); persiste() }
  const vacia = () => { cola = []; persiste() }
  const enSerie = op => { const r = cadena.then(op); cadena = r.catch(() => {}); return r }
  const pide = async (ruta, opciones) => {
    try {
      const r = await conPlazo(llama(ruta, opciones), plazoMs ?? PLAZO.ms)
      return r === VENCIDO ? null : r
    } catch { return null }
  }

  function instala(s) {
    if (!s || !Number.isInteger(s.version)) return false
    if (estado && s.version <= estado.version) return false
    estado = { version: s.version, epoca: s.epoca, terminal: s.terminal ?? null, legado: s.legado === true, escritor: s.escritor ?? null, estado: s.estado }
    return true
  }
  async function leeEstado() {
    const r = await pide('/api/sim/estado', { metodo: 'GET', cuerpo: { session_id: sessionId } })
    if (r?.http === 200 && r.cuerpo?.ok) instala(r.cuerpo)
    return r
  }
  async function toma({ forzar = false } = {}) {
    const r = await pide('/api/sim/tomar', { cuerpo: { session_id: sessionId, command_id: nuevoId(), epoca, cliente_id: clienteId, forzar } })
    if (!r) return { ok: false, conclusion: 'incierto' }
    if (r.cuerpo?.ok && typeof r.cuerpo.testigo === 'string') escribe(sesion, kTestigo, r.cuerpo.testigo)
    return { ok: r.cuerpo?.ok === true && typeof r.cuerpo.testigo === 'string', http: r.http, motivo: r.cuerpo?.motivo ?? null, cuerpo: r.cuerpo }
  }

  // una entrada de la cola, hasta tener respuesta (429: reintento con la misma clave)
  async function enviaEntrada(e) {
    const testigo = lee(sesion, kTestigo)
    const cuerpo = { session_id: sessionId, command_id: e.command_id, tipo: e.tipo, epoca, version_esperada: e.version_esperada, cliente_id: clienteId, testigo, ...e.carga }
    let r
    for (let k = 0; ; k++) {
      r = await pide('/api/sim/comando', { cuerpo })
      if (r?.http === 429 && k < INTENTOS_429) { await duerme(espera429Ms); continue }
      break
    }
    const fin = (conclusion, extra = {}) => (ultimo = { conclusion, http: r?.http ?? null, motivo: r?.cuerpo?.motivo ?? null, command_id: e.command_id, ...extra })
    if (!r) return fin('incierto')
    const { http, cuerpo: c = {} } = r
    if (c.ok === true && http >= 200 && http < 300) {
      quita(e.command_id)
      await leeEstado()
      return fin(c.recibo?.resultado === 'rechazado' ? 'rechazado' : 'confirmado', { recibo: c.recibo ?? null, version: c.version ?? null, repetido: c.repetido === true, alcanzado: c.alcanzado ?? null, cortado: c.cortado ?? null })
    }
    const motivo = c.motivo
    if (http === 409 && motivo === 'conflicto') { quita(e.command_id); await leeEstado(); return fin('conflicto') }
    if (http === 409 && motivo === 'comando_caducado') { vacia(); await leeEstado(); return fin('caducado') }
    if (http === 409 && USAR_AQUI.has(motivo)) { quita(e.command_id); return fin('usar_aqui') }
    if (http === 409 && SOLO_LECTURA.has(motivo)) { quita(e.command_id); return fin('solo_lectura') }
    if (http === 410) { vacia(); return fin('borrada') }
    if (http === 426) { vacia(); return fin('actualizar') }
    if (http === 403) { vacia(); return fin('sin_acceso') }
    if (http === 503) { quita(e.command_id); return fin('mantenimiento') }
    if (http >= 500) return fin('incierto')
    quita(e.command_id)
    return fin('invalido')
  }
  // los inciertos de la cola, en orden; se para en el primero que siga incierto
  async function resuelvePendientes() {
    const hechas = []
    for (const e of [...cola]) {
      if (!cola.some(x => x.command_id === e.command_id)) continue
      const r = await enviaEntrada(e)
      hechas.push(r)
      if (r.conclusion === 'incierto') return { resuelto: false, hechas }
    }
    return { resuelto: true, hechas }
  }

  return {
    get estado() { return estado },
    clienteId,
    testigo: () => lee(sesion, kTestigo),
    pendientes: () => cola.map(e => ({ ...e })),
    guardado: () => cola.length === 0 && (ultimo == null || ['confirmado', 'rechazado'].includes(ultimo.conclusion)),
    instala,
    leeEstado,
    toma,
    recupera: () => enSerie(resuelvePendientes),
    // una orden: { tipo, carga } → su conclusion (ver arriba)
    envia: (tipo, carga = {}) => enSerie(async () => {
      if (!lee(sesion, kTestigo)) return (ultimo = { conclusion: 'usar_aqui', motivo: 'sin_testigo' })
      const p = await resuelvePendientes()
      if (!p.resuelto) return (ultimo = { conclusion: 'incierto', motivo: 'pendiente_sin_resolver' })
      if (!estado) await leeEstado()
      if (!estado) return (ultimo = { conclusion: 'incierto', motivo: 'sin_estado' })
      const e = { command_id: nuevoId(), tipo, carga, version_esperada: estado.version }
      cola.push(e); persiste()
      return enviaEntrada(e)
    }),
  }
}
