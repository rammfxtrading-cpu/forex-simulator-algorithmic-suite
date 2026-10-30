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
//     429 demasiados_avances: espera y reintenta la MISMA clave. 429 demasiados_pasos (sim-006): igual, esperando lo que
//     dice reintentar_en_ms (≤ 1 s).
//   · PASAR DE FASE (pieza 5): pasaFase({ hijaId }) → POST /api/sim/avanzar-fase con la version confirmada, en la
//     misma serie que los comandos (nunca a la vez que uno). La conclusion: confirmado (2xx, tambien repetido),
//     el motivo del servidor tal cual en un 4xx (fase_no_superada, posiciones_abiertas, solo_lectura, conflicto…),
//     mantenimiento (503) o incierto (sin respuesta, plazo o 5xx). Despues relee el estado. No entra en la cola
//     ni cambia guardado(): no es una orden del alumno sobre la cartera. hijaId null = la ultima
//     fase (el completado).
//   · PSIMM1-01 (Astra; orden 1-175 del CTO): todo lo confirmado por el servidor acaba visible. Tras un ACK, la version
//     confirmada (recibo.version_resultante; si no, la version del ACK) es la MINIMA que tiene que tener el estado
//     instalado. Si la relectura no la alcanza (5xx, red, 200 viejo o invalido), se reintenta (esperasRelectura); si
//     sigue sin alcanzarla, la conclusion es desincronizado (confirmado: true, resultado: confirmado/rechazado) y el
//     cliente queda DESINCRONIZADO: guardado() es false y ninguna orden, avance ni pase de fase sale hasta reconciliar
//     (antes de cada una se vuelve a leer; si no se alcanza, desincronizado sin enviar nada). Al instalar un estado con
//     esa version, alSincronizar().
//   · PSIMM1-02 (Astra; orden 1-175): un abrir con { local } (el id provisional de la pantalla) se correlaciona con el id
//     que creo, DENTRO de la serie: los ids del estado en el que se construyo la orden (version_partida) contra los del
//     estado en version_resultante; exactamente uno nuevo → alCrear(local, id) (y creado en la respuesta). Nunca dos
//     aperturas comparten la captura. Sin correlacion posible (el abrir sale de la cola sin ACK, o el estado salto mas
//     alla), alCrear(local, null).
//     R2-5 (orden 1-176): si el estado instalado ya va mas alla de version_resultante (otra pestaña escribio entre medias),
//     el id sale del contrato del motor: un abrir ACEPTADO crea p<S> o o<S>, con S = siguiente_seq del estado de su
//     version_partida (lib/motor/cartera.mjs). Si ese id ya no existe (llenada, cerrada), no hay nada vivo que enlazar.
//
// llama(ruta, { metodo, cuerpo }) → { http, cuerpo } (o lanza si no hay respuesta): el transporte, inyectado.
import { conPlazo, VENCIDO, PLAZO } from '../plazo'
import { huellaCuadra } from './huella.mjs'
import { vistaDe } from './vista'

const ESQUEMA_CARTERA = 'sim-cartera@1'

const USAR_AQUI = new Set(['sin_arrendamiento', 'escritor_ocupado', 'otra_sesion_activa'])
const SOLO_LECTURA = new Set(['solo_lectura', 'no_es_v1'])
const INTENTOS_429 = 6

const lee = (alm, k) => { try { return alm?.getItem(k) ?? null } catch { return null } }
const escribe = (alm, k, v) => { try { v == null ? alm?.removeItem(k) : alm?.setItem(k, v); return true } catch { return false } }
const duerme = ms => new Promise(r => setTimeout(r, ms))
// los ids de posiciones y pendientes de un estado (cartera o reto)
const carteraDe = s => (s?.estado?.esquema === 'reto@1' ? s.estado.motor : s?.estado)
export const idsDe = s => { const c = carteraDe(s); return new Set([...(c?.posiciones ?? []).map(p => p.id), ...(c?.ordenes ?? []).map(o => o.id)]) }
// R2-5: la siguiente seq del motor en un estado (texto, numero o {$b}); null si no la trae
const seqDe = s => { const x = carteraDe(s)?.siguiente_seq; const n = Number(x?.$b ?? x); return Number.isSafeInteger(n) ? n : null }
// PSIMM1-01: las lecturas tras un ACK hasta tener la version confirmada (la primera, ya; luego, estas esperas)
export const ESPERAS_RELECTURA = Object.freeze([0, 300, 1000])

// ORDEN 1-182 (PSIMM3-01, la 3.ª vez de la familia PSIMM1-01 → PSIMM2-01 → PSIMM3-01). POR PRINCIPIO, no por forma de
// respuesta: la pantalla solo acepta una cartera COMPLETA y VERIFICADA. Un snapshot de GET /api/sim/estado se instala solo si
//   · su sobre es el de la sesion: ok true, version entera ≥ 0, session_id el de esta sesion, motor_version 1, epoca entera,
//     terminal null o texto, legado booleano, escritor null u objeto;
//   · su cartera (la raiz sim-cartera@1, o el motor de un reto@1) tiene el contrato minimo real: esquema EXACTO, pares (no
//     vacia, de seis letras, sin repetir, los mismos que sus costes), reloj con cursor (entero o null), saldo, estado, y cada
//     posicion y orden con id unico, par de la sesion, lado y sus precios y lotes en enteros; un reto, sus importes;
//   · su HUELLA (lib/sim/v1/huella.mjs: version + nº posiciones + nº ordenes + hash de los ids, con la version dentro del
//     hash; y el hash del estado entero, añadido) cuadra con lo recibido, recalculada aqui;
//   · y la vista se puede calcular (nada lanza al pintarla).
// Cualquier otra cosa (200 vacio, parcial, sin campos, tipos cambiados, huella que no cuadra) es una RELECTURA FALLIDA: no se
// instala ni fija version, la pantalla queda desincronizada (aviso: alFallo; bloqueo de ordenes, Step, Play, Go to y pase de
// fase; reintentos) y solo sale de ahi con una lectura VERIFICADA nueva. Una version ya instalada no cambia de contenido:
// la misma version con otra huella tambien es relectura fallida (y no se instala nunca: recargar empieza de cero). La
// recuperacion con la MISMA version vuelve a leer completo: la relectura verificada con la huella instalada reconcilia.
const esObjeto = x => x != null && typeof x === 'object' && !Array.isArray(x)
const ENTERO = /^-?\d+$/
const esBig = x => Number.isSafeInteger(x) || (typeof x === 'string' && ENTERO.test(x)) || (esObjeto(x) && Object.keys(x).length === 1 && typeof x.$b === 'string' && ENTERO.test(x.$b))
const esBigONull = x => x === null || x === undefined || esBig(x)
const PAR = /^[A-Z]{6}$/
const LADOS = new Set(['BUY', 'SELL'])
const mismos = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join()
function faltaEnCartera(c) {
  if (!esObjeto(c)) return 'cartera'
  if (c.esquema !== ESQUEMA_CARTERA) return 'cartera.esquema'
  if (!Array.isArray(c.pares) || !c.pares.length || !c.pares.every(p => typeof p === 'string' && PAR.test(p)) || new Set(c.pares).size !== c.pares.length) return 'cartera.pares'
  if (!esObjeto(c.costes) || !esObjeto(c.costes.spread_ticks) || !mismos(Object.keys(c.costes.spread_ticks), c.pares)) return 'cartera.pares'
  if (!esObjeto(c.reloj) || !(c.reloj.cursor === null || Number.isSafeInteger(c.reloj.cursor))) return 'cartera.reloj'
  if (!esBig(c.saldo_µ)) return 'cartera.saldo'
  if (typeof c.estado !== 'string') return 'cartera.estado'
  if (!Array.isArray(c.posiciones) || !Array.isArray(c.ordenes)) return 'cartera.listas'
  const ids = new Set()
  for (const x of c.posiciones) {
    if (!esObjeto(x) || typeof x.id !== 'string' || !x.id || ids.has(x.id) || !c.pares.includes(x.par) || !LADOS.has(x.lado) || !esBig(x.entrada) || !esBigONull(x.sl) || !esBigONull(x.tp) || !esBig(x.lotes_c)) return 'cartera.posiciones'
    ids.add(x.id)
  }
  for (const x of c.ordenes) {
    if (!esObjeto(x) || typeof x.id !== 'string' || !x.id || ids.has(x.id) || !c.pares.includes(x.par) || !LADOS.has(x.lado) || typeof x.tipo !== 'string' || !esBig(x.precio) || !esBigONull(x.sl) || !esBigONull(x.tp) || !esBig(x.lotes_c)) return 'cartera.ordenes'
    ids.add(x.id)
  }
  return null
}
// el motivo por el que un snapshot NO es una cartera completa y verificada (null: lo es). sessionId: el de esta sesion
export function faltaEnSnapshot(s, sessionId = null) {
  if (!esObjeto(s)) return 'cuerpo'
  if (s.ok !== true) return 'ok'
  if (!Number.isSafeInteger(s.version) || s.version < 0) return 'version'
  if (sessionId != null && s.session_id !== sessionId) return 'session_id'
  if (s.motor_version !== 1) return 'motor_version'
  if (!Number.isSafeInteger(s.epoca)) return 'epoca'
  if (!(s.terminal === null || typeof s.terminal === 'string')) return 'terminal'
  if (typeof s.legado !== 'boolean') return 'legado'
  if (!(s.escritor === null || esObjeto(s.escritor))) return 'escritor'
  const e = s.estado
  if (!esObjeto(e)) return 'estado'
  if (e.esquema === 'reto@1') {
    if (typeof e.estado !== 'string' || !Number.isSafeInteger(e.fase) || !Number.isSafeInteger(e.horizonte) || !esBig(e.capital_inicial_µ) || !esBig(e.objetivo_µ) || !esBig(e.saldo_medianoche_µ) || !Array.isArray(e.dias_con_apertura)) return 'reto'
    const f = faltaEnCartera(e.motor); if (f) return 'reto.motor.' + f
  } else { const f = faltaEnCartera(e); if (f) return f }
  if (!huellaCuadra(s.huella, s.version, e)) return 'huella'
  try { vistaDe(s) } catch { return 'vista' }
  return null
}
export const snapshotValido = (s, sessionId = null) => faltaEnSnapshot(s, sessionId) == null

export function creaCliente({ sessionId, usuario, epoca = 1, llama, local = null, sesion = null, nuevoId, plazoMs = null, espera429Ms = 5000,
  esperasRelectura = ESPERAS_RELECTURA, alCrear = () => {}, alSincronizar = () => {}, alFallo = () => {} }) {
  const kCola = `sim-v1/cola/${usuario}/${sessionId}/${epoca}`
  const kTestigo = `sim-v1/testigo/${sessionId}`
  const kCliente = `sim-v1/cliente/${sessionId}`
  let clienteId = lee(sesion, kCliente)
  if (!clienteId) { clienteId = `pestana-${nuevoId()}`; escribe(sesion, kCliente, clienteId) }
  let cola = (() => { try { return JSON.parse(lee(local, kCola) ?? '[]') } catch { return [] } })()
  let estado = null, ultimo = null
  // PSIMM1-01: { minimo } mientras la pantalla no tiene la version que el servidor confirmo; 1-182: { releer: true } tras una
  // relectura fallida (solo la quita una lectura verificada nueva, tambien de la misma version); PSIMM1-02: command_id →
  // { local, antes (ids), partida, resultante } de cada abrir con id provisional, hasta correlacionarlo
  let desfase = null
  const correlaciones = new Map()
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

  // ORDEN 1-182: una relectura fallida: nada se instala; desincronizado con aviso hasta una lectura verificada nueva
  function fallida(motivo) {
    desfase = { minimo: Math.max(desfase?.minimo ?? 0, estado?.version ?? 0), releer: true }
    alFallo(motivo)
    return false
  }
  function instala(s) {
    const falta = faltaEnSnapshot(s, sessionId)
    if (falta) return fallida(falta)
    // una respuesta vieja nunca rebaja el estado (no es un fallo: la lectura llega tarde)
    if (estado && s.version < estado.version) return false
    if (estado && s.version === estado.version) {
      // la misma version solo puede traer la misma cartera; si no, relectura fallida (nunca se instala)
      if (s.huella.ids !== estado.huella.ids || s.huella.contenido !== estado.huella.contenido) return fallida('version_igual_contenido_distinto')
      if (!desfase) return false
    }
    estado = { version: s.version, epoca: s.epoca, terminal: s.terminal ?? null, legado: s.legado === true, escritor: s.escritor ?? null, estado: s.estado, valoracion: s.valoracion ?? null, huella: s.huella }
    correlaciona()
    if (desfase && estado.version >= desfase.minimo) { desfase = null; alSincronizar() }
    return true
  }
  // PSIMM1-02: cada abrir pendiente de correlacionar, contra el estado instalado
  function correlaciona() {
    for (const [cid, k] of correlaciones) {
      if (k.resultante == null) {
        if (!cola.some(x => x.command_id === cid)) { correlaciones.delete(cid); alCrear(k.local, null) }
        continue
      }
      if (!estado || estado.version < k.resultante) continue
      correlaciones.delete(cid)
      const ids = idsDe(estado)
      if (k.aceptado === false) k.creado = null
      else if (k.seq != null) k.creado = [`p${k.seq}`, `o${k.seq}`].find(i => ids.has(i)) ?? null
      else { const nuevos = estado.version === k.resultante ? [...ids].filter(i => !k.antes.has(i)) : []; k.creado = nuevos.length === 1 ? nuevos[0] : null }
      alCrear(k.local, k.creado)
    }
  }
  // PSIMM1-01: leer hasta tener al menos la version `minimo`; true si se alcanza
  async function sincroniza(minimo) {
    const meta = Math.max(minimo, desfase?.minimo ?? minimo)
    // 1-182: tras una relectura fallida, la version que ya se tiene no basta: hace falta leer de nuevo, completo
    if (estado && estado.version >= meta && !desfase?.releer) { if (desfase) { desfase = null; alSincronizar() } return true }
    desfase = { minimo: meta, releer: desfase?.releer === true }
    for (const ms of esperasRelectura) {
      if (ms) await duerme(ms)
      await leeEstado()
      if (!desfase) return true
    }
    return false
  }
  async function leeEstado() {
    const r = await pide('/api/sim/estado', { metodo: 'GET', cuerpo: { session_id: sessionId } })
    // 1-182: todo 200 pasa por la verificacion (instala); lo que no es una cartera completa y verificada es una relectura
    // fallida (invalido, con el motivo)
    if (r?.http === 200) { const falta = faltaEnSnapshot(r.cuerpo, sessionId); instala(r.cuerpo); if (falta) return { ...r, invalido: true, falta } }
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
      // 429: demasiados_avances (los 5 s del goto y el checkpoint) espera espera429Ms; demasiados_pasos (el tope de sim-006,
      // 10 pasos por segundo) trae cuanto esperar en reintentar_en_ms
      if (r?.http === 429 && k < INTENTOS_429) { const ms = r.cuerpo?.reintentar_en_ms; await duerme(Number.isInteger(ms) && ms > 0 ? ms : espera429Ms); continue }
      break
    }
    const fin = (conclusion, extra = {}) => { ultimo = { conclusion, http: r?.http ?? null, motivo: r?.cuerpo?.motivo ?? null, command_id: e.command_id, ...extra }; correlaciona(); return ultimo }
    if (!r) return fin('incierto')
    const { http, cuerpo: c = {} } = r
    if (c.ok === true && http >= 200 && http < 300) {
      // PSIMM1-01: la version que el servidor confirmo (la del recibo; un repetido trae en version la actual)
      const resultante = Number.isInteger(c.recibo?.version_resultante) ? c.recibo.version_resultante : c.repetido === true ? null : Number.isInteger(c.version) ? c.version : null
      const k = correlaciones.get(e.command_id)
      if (k) {
        if (resultante == null || (Number.isInteger(c.recibo?.version_partida) && c.recibo.version_partida !== k.partida)) { correlaciones.delete(e.command_id); alCrear(k.local, null) }
        else { k.resultante = resultante; k.aceptado = c.recibo?.resultado !== 'rechazado' }
      }
      quita(e.command_id)
      const visible = await sincroniza(resultante ?? (Number.isInteger(c.version) ? c.version : e.version_esperada))
      const resultado = c.recibo?.resultado === 'rechazado' ? 'rechazado' : 'confirmado'
      const datos = { recibo: c.recibo ?? null, version: c.version ?? null, repetido: c.repetido === true, alcanzado: c.alcanzado ?? null, cortado: c.cortado ?? null, paradas: c.paradas ?? null, creado: k?.creado ?? null }
      // confirmado por el servidor pero sin poder mostrarlo: desincronizado (la pantalla lo retiene y avisa)
      if (!visible) return fin('desincronizado', { ...datos, confirmado: true, resultado })
      return fin(resultado, datos)
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
  // PSIMM1-01: desincronizado, primero se intenta reconciliar; si no, nada mas sale
  async function resuelvePendientes() {
    const hechas = []
    if (desfase && !(await sincroniza(desfase.minimo))) return { resuelto: false, desincronizado: true, hechas }
    for (const e of [...cola]) {
      if (!cola.some(x => x.command_id === e.command_id)) continue
      const r = await enviaEntrada(e)
      hechas.push(r)
      if (r.conclusion === 'incierto') return { resuelto: false, hechas }
      if (r.conclusion === 'desincronizado') return { resuelto: false, desincronizado: true, hechas }
    }
    return { resuelto: true, hechas }
  }
  const sinResolver = p => (p.desincronizado ? { conclusion: 'desincronizado', motivo: 'sin_reconciliar' } : { conclusion: 'incierto', motivo: 'pendiente_sin_resolver' })

  async function pasaFaseYa({ hijaId = null } = {}) {
    const p = await resuelvePendientes()
    if (!p.resuelto) return sinResolver(p)
    if (!estado) await leeEstado()
    if (!estado) return { conclusion: 'incierto', motivo: 'sin_estado' }
    const command_id = nuevoId()
    const r = await pide('/api/sim/avanzar-fase', { cuerpo: { padre_id: sessionId, hija_id: hijaId, command_id, epoca, version_esperada: estado.version } })
    const fin = (conclusion, extra = {}) => ({ conclusion, http: r?.http ?? null, motivo: r?.cuerpo?.motivo ?? null, command_id, ...extra })
    if (!r) return fin('incierto')
    const { http, cuerpo: c = {} } = r
    if (c.ok === true && http >= 200 && http < 300) { await leeEstado(); return fin('confirmado', { recibo: c.recibo ?? null, repetido: c.repetido === true }) }
    if (http === 503) return fin('mantenimiento')
    if (http >= 500) return fin('incierto')
    await leeEstado()
    return fin(c.motivo ?? 'invalido')
  }

  return {
    get estado() { return estado },
    clienteId,
    testigo: () => lee(sesion, kTestigo),
    pendientes: () => cola.map(e => ({ ...e })),
    guardado: () => cola.length === 0 && !desfase && (ultimo == null || ['confirmado', 'rechazado'].includes(ultimo.conclusion) || (ultimo.conclusion === 'desincronizado' && ultimo.confirmado === true)),
    // PSIMM1-01: la pantalla no tiene aun lo que el servidor confirmo; reconcilia() lo vuelve a intentar (en la serie)
    get desincronizado() { return desfase != null },
    reconcilia: () => enSerie(async () => !desfase || sincroniza(desfase.minimo)),
    instala,
    leeEstado,
    toma,
    recupera: () => enSerie(resuelvePendientes),
    pasaFase: opciones => enSerie(() => pasaFaseYa(opciones)),
    // una orden: { tipo, carga } → su conclusion (ver arriba). { local }: el id provisional de un abrir (PSIMM1-02)
    envia: (tipo, carga = {}, { local = null } = {}) => enSerie(async () => {
      if (!lee(sesion, kTestigo)) return (ultimo = { conclusion: 'usar_aqui', motivo: 'sin_testigo' })
      const p = await resuelvePendientes()
      if (!p.resuelto) return (ultimo = sinResolver(p))
      if (!estado) await leeEstado()
      if (!estado) return (ultimo = { conclusion: 'incierto', motivo: 'sin_estado' })
      const e = { command_id: nuevoId(), tipo, carga, version_esperada: estado.version }
      // PSIMM1-02: los ids de ESTE estado (el de su version_esperada), capturados en la serie, junto a la orden
      if (tipo === 'abrir' && local != null) correlaciones.set(e.command_id, { local, antes: idsDe(estado), seq: seqDe(estado), partida: estado.version, resultante: null })
      cola.push(e); persiste()
      return enviaEntrada(e)
    }),
  }
}
