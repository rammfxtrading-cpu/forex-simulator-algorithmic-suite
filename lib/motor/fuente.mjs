// lib/motor/fuente.mjs — la fuente de mercado de UN instrumento (especificacion
// v2.1, § 1.7, § 3.8, § 12.2, § 12.10; A15, A16, A26). Pura salvo el lector de
// trozos que se le pasa; nada en uso la importa.
//
// Une el manifiesto y los trozos diarios (piezas 3 y 4) con el motor (pieza 2):
//   · A26: solo acepta el manifiesto que la sesion tiene fijado (PAR@version:huella).
//   · C6-03: y avanza solo un estado que fija ESE mercado (par y huella).
//   · tramo(cursor, hasta): las velas en (cursor, hasta] recorriendo los dias
//     por calendario:
//       - sin mercado (horario de Nueva York, sabado) o CERRADO en el
//         manifiesto: se salta;
//       - despues del ultimo dia del manifiesto: fin de datos (tramo abierto),
//         no un fallo;
//       - con mercado y sin trozo, o corto (umbral de calidad.mjs) y no
//         aceptado en el manifiesto (cortos_aceptados), o con el trozo alterado
//         o no disponible: DETENCION; nada de ese dia ni de despues (§ 12.2:
//         no_valorable, cursor sin consumir).
//   · P7-01 (CTO 10-oct; v2.4): dentro de los dias admitidos, un minuto ausente
//     es un minuto sin negociacion (el motor lo valora con el cierre anterior);
//     un HUECO INTERIOR de mas de 15 minutos seguidos (con el mercado abierto en
//     todo el, tambien a traves de la medianoche) es no valorable: DETENCION
//     con frontera = su primer minuto; las velas del tramo, solo las anteriores.
//     Salvo que este aceptado en el TROZO del dia de su primer minuto (etapa 2,
//     diseño p.1; S4-03: nada aparte del manifiesto y sus trozos), con el mismo
//     inicio y los mismos minutos: entonces se valora plano y el tramo lo
//     devuelve en «huecos» para la marca. Toda detencion lleva su frontera (la
//     de un dia, su 00:00).
//   · avanza(estado, hasta, fuente, { desde }): el comando «avanzar» del motor
//     con esas velas. Si el tramo no es el final de los datos, se añade un
//     centinela despues de «hasta» para que el motor no emita fin_de_datos
//     (el motor lo emite cuando el cursor llega a la ultima vela que recibe).
import * as MF from './manifiesto.mjs'
import { tocaCierre, HUECO_MAXIMO } from './manifiesto.mjs'
import { aplica } from './motor.mjs'
import { diaConMercado } from '../mercado/calidad.mjs'

const DIA = 86400
const ymd = s => new Date(s * 1000).toISOString().slice(0, 10)
const CENTINELA = Object.freeze({ time: Infinity })

// S4-03: los dias cortos aceptados y los huecos aceptados salen del manifiesto y de sus trozos
export function creaFuente({ manifiesto, fijado, leeTrozo, ...resto }) {
  if ('aceptados' in resto) throw new RangeError('aceptados: los dias cortos aceptados vienen del manifiesto (S4-03, diseño p.2)')
  MF.validaManifiesto(manifiesto)
  if (!MF.coincide(fijado, manifiesto)) throw new RangeError(`version_distinta: la sesion tiene fijado ${fijado}, no ${MF.fija(manifiesto)}`)
  const cerrados = new Set(manifiesto.cerrados)
  const porDia = new Map(manifiesto.dias.map(d => [d.dia, d]))
  const primero = manifiesto.dias[0]?.dia ?? null, ultimo = manifiesto.dias.at(-1)?.dia ?? null
  const ultimaVela = ultimo ? porDia.get(ultimo).ultima : null
  const cache = new Map()            // dia → velas ya comprobadas contra el manifiesto
  const aceptadosH = new Map()       // inicio (s) → hueco aceptado, de los trozos ya leidos

  // → { velas } | { detencion: { motivo, dia, detalle } }
  function velasDelDia(d) {
    if (cache.has(d)) return { velas: cache.get(d) }
    const e = porDia.get(d)
    if (!e) return { detencion: { motivo: 'no_valorable', dia: d, detalle: 'sin trozo' } }
    const falta = MF.cobertura(manifiesto, d, d)
    if (falta.length) return { detencion: { motivo: 'no_valorable', dia: d, detalle: falta[0] } }
    const buffer = leeTrozo(d)
    if (buffer == null) return { detencion: { motivo: 'trozo_no_disponible', dia: d } }
    let t
    try { t = MF.leeTrozo(manifiesto, d, buffer) } catch (err) { return { detencion: { motivo: 'trozo_alterado', dia: d, detalle: err.message } } }
    cache.set(d, t.velas)
    for (const h of t.huecos) aceptadosH.set(Date.parse(h.inicio) / 1000, h)
    return { velas: t.velas }
  }
  // el hueco aceptado que empieza en «ini», del trozo de su dia (se lee si hace falta)
  function aceptadoEn(ini) {
    const d = ymd(ini)
    if (!cache.has(d) && porDia.has(d)) velasDelDia(d)
    return aceptadosH.get(ini)
  }

  // la ultima vela anterior a «t» (mirando hacia atras dia a dia mientras el
  // mercado este abierto), o null: si antes hay un cierre, el hueco no es interior
  function anteriorA(t) {
    for (let k = 0, d = ymd(t - 60); k < 7 && (!primero || d >= primero); k++, d = ymd(Date.parse(d + 'T00:00:00Z') / 1000 - DIA)) {
      if (!diaConMercado(d, cerrados)) return null
      const r = velasDelDia(d)
      if (r.detencion) return null
      for (let i = r.velas.length - 1; i >= 0; i--) if (r.velas[i].time < t) return r.velas[i].time
    }
    return null
  }
  // la primera vela posterior a «t» (hacia delante), o null (fin de datos, cierre o dia que no se puede leer)
  function siguienteA(t) {
    for (let k = 0, d = ymd(t + 60); k < 7 && ultimo && d <= ultimo; k++, d = ymd(Date.parse(d + 'T00:00:00Z') / 1000 + DIA)) {
      if (!diaConMercado(d, cerrados)) return null
      const r = velasDelDia(d)
      if (r.detencion) return null
      const v = r.velas.find(x => x.time > t)
      if (v) return v.time
    }
    return null
  }

  // velas en (cursor, hasta]; cursor null = desde el principio (o desde «desde»)
  // → { velas, detencion: { motivo, dia, frontera, ... } | null, finDeDatos, huecos: [aceptados que empiezan en el tramo] }
  function tramo(cursor, hasta, { desde = null } = {}) {
    const inicio = cursor != null ? cursor + 60 : (desde ?? (primero ? Date.parse(primero + 'T00:00:00Z') / 1000 : hasta + 60))
    let velas = []
    let detencion = null
    for (let t = Math.floor(inicio / DIA) * DIA; t <= hasta && ultimo && ymd(t) <= ultimo; t += DIA) {
      const d = ymd(t)
      if (!diaConMercado(d, cerrados)) continue
      const r = velasDelDia(d)
      if (r.detencion) { detencion = { ...r.detencion, frontera: Math.max(inicio, Date.parse(d + 'T00:00:00Z') / 1000) }; break }
      for (const v of r.velas) if (v.time >= inicio && v.time <= hasta) velas.push(v)
    }
    // P7-01: huecos interiores en (cursor, hasta], con la vela de antes y la de despues
    const huecos = []
    if (ultimo) {
      const antes = anteriorA(inicio)
      const limite = detencion ? detencion.frontera - 60 : hasta
      const despues = detencion ? null : siguienteA(hasta)
      const tiempos = [...(antes != null ? [antes] : []), ...velas.map(v => v.time), ...(despues != null ? [despues] : [])]
      for (let k = 1; k < tiempos.length; k++) {
        const a = tiempos[k - 1], b = tiempos[k], n = (b - a) / 60 - 1, ini = a + 60
        if (n <= 0) continue
        if (Math.max(ini, inicio) > limite) break
        if (tocaCierre(ini, b - 60, cerrados)) continue
        const ac = aceptadoEn(ini)
        if (ac && ac.minutos === n) { if (ini >= inicio) huecos.push({ par: manifiesto.par, inicio: ac.inicio, minutos: n, motivo: ac.motivo, en: ini }); continue }
        if (n <= HUECO_MAXIMO) continue
        const frontera = Math.max(ini, inicio)
        detencion = { motivo: 'no_valorable', dia: ymd(frontera), frontera, detalle: `hueco interior de ${n} min desde ${new Date(ini * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`, minutos: n }
        velas = velas.filter(v => v.time < frontera)
        break
      }
    }
    // ¿llega este tramo al final de los datos? (sin detencion y pasada la ultima vela)
    const finDeDatos = !detencion && ultimaVela != null && hasta >= ultimaVela
    return { velas, detencion, finDeDatos, huecos: huecos.filter(h => !detencion || h.en < detencion.frontera) }
  }

  return { manifiesto: MF.fija(manifiesto), par: manifiesto.par, tramo }
}

// S4-03 (etapa 2, diseño p.3): versiones.mercado[par] es la RAIZ fijada al
// crear; versiones.mercado_efectivo[par], si existe, la version EFECTIVA
// registrada. Vale solo la registrada: la efectiva, o la raiz si no la hay.
export const mercadoEfectivo = (versiones, par) => versiones?.mercado_efectivo?.[par] ?? versiones?.mercado?.[par]

// Registrar una continuacion: raiz = el manifiesto fijado al crear; actual = el
// de la version efectiva registrada (la raiz si no hay); nuevo = el que se quiere
// usar. → { versiones } (copia, con mercado_efectivo[par] = nuevo) | { incidente }.
// Quien la llama y cuando (dentro del sobre del comando, con el recibo) es de
// la etapa 3. ⚠️ (E2-05) continuaVersiones NO acredita por si sola el fichero
// de aceptaciones ni sustituye la validacion de su cadena: de un ancla que
// crece solo ve que crece; que su prefijo sea el publicado lo comprueban el
// publicador (compruebaAncla) y el verificador contra el fichero.
export function continuaVersiones(versiones, par, { raiz, actual, nuevo }) {
  const fijado = versiones?.mercado?.[par]
  if (fijado == null) return { incidente: `la sesion no fija mercado para ${par}` }
  if (!MF.coincide(fijado, raiz)) return { incidente: `la raiz ${MF.fija(raiz)} no es la fijada (${fijado})` }
  if (!MF.coincide(mercadoEfectivo(versiones, par), actual)) return { incidente: `el actual ${MF.fija(actual)} no es la version registrada (${mercadoEfectivo(versiones, par)})` }
  for (const [a, b] of [[raiz, nuevo], [actual, nuevo]]) {
    const inc = MF.esContinuacion(a, b)
    if (inc) return { incidente: `${MF.fija(b)} no continua ${MF.fija(a)}: ${inc}` }
  }
  return { versiones: { ...versiones, mercado_efectivo: { ...(versiones.mercado_efectivo ?? {}), [par]: MF.fija(nuevo) } } }
}

// C6-03 (Astra, cierres-6): la fuente tiene que ser la fijada en el estado
// (versiones.mercado[par], § 3.1; S4-03: la efectiva registrada): mismo par y
// misma huella. Si no, detencion con motivo propio y el estado sin tocar.
// → null | detencion
export function fuenteDelEstado(estado, fuente) {
  if (fuente.par !== estado.par) return { motivo: 'fuente_de_otro_par', detalle: `la sesion es de ${estado.par} y la fuente de ${fuente.par}` }
  const fijado = mercadoEfectivo(estado.versiones, estado.par)
  if (fijado == null) return { motivo: 'mercado_no_fijado', detalle: `la sesion no fija mercado para ${estado.par}` }
  if (fijado !== fuente.manifiesto) return { motivo: 'fuente_de_otra_version', detalle: `la sesion fija ${fijado} y la fuente es ${fuente.manifiesto}` }
  return null
}

// La marca de los huecos aceptados que el motor ya ha cruzado (P7-01): en el
// estado (huecos_aceptados: [{ par, inicio, minutos, motivo }], sin repetir) y
// un evento «hueco_aceptado» la primera vez. huecos: los de tramo().huecos.
// P7C-01 (Astra, pieza 7 cierres): «hasta» es el horizonte que el avance
// confirmo, no el cursor de la ultima vela: un hueco sin velas en ningun par
// queda marcado en cuanto se confirma, sin esperar a que vuelva una vela. Con
// la sesion terminada (breach u objetivo), hasta su instante terminal: ver
// confirmadoHasta.
// → { estado, eventos }
export function marcaHuecos(estado, huecos, hasta) {
  // (las claves de cada marca en orden alfabetico: el estado deserializado es igual al de memoria)
  const ya = new Set((estado.huecos_aceptados ?? []).map(h => `${h.par}|${h.inicio}`))
  const nuevos = huecos.filter(h => h.en <= hasta && !ya.has(`${h.par}|${h.inicio}`)).sort((a, b) => a.en - b.en || (a.par < b.par ? -1 : 1))
  if (!nuevos.length) return { estado, eventos: [] }
  const e = structuredClone(estado)
  e.huecos_aceptados = [...(e.huecos_aceptados ?? []), ...nuevos.map(({ par, inicio, minutos, motivo }) => ({ inicio, minutos, motivo, par }))]
  return { estado: e, eventos: nuevos.map(({ par, inicio, minutos, motivo, en }) => ({ tipo: 'hueco_aceptado', par, inicio, minutos, motivo, en: { t: en } })) }
}

// hasta donde marcar tras un avance que confirmo «confirmado»: eso mismo con la
// sesion activa; terminada, su minuto terminal (el cursor), nunca despues
export const confirmadoHasta = (estado, confirmado) => (estado.estado === 'activo' ? confirmado : (estado.reloj.cursor ?? -Infinity))

// → { estado, eventos, detencion | null }
export function avanza(estado, hasta, fuente, { desde = null } = {}) {
  const ajena = fuenteDelEstado(estado, fuente)
  if (ajena) return { estado, eventos: [], detencion: ajena }
  const { velas, detencion, finDeDatos, huecos } = fuente.tramo(estado.reloj.cursor, hasta, { desde })
  // con detencion, nada desde su frontera (P7-01: tambien la de un hueco interior).
  // Se confirma hasta el ultimo segundo ANTES de la frontera: un avance a mitad
  // de minuto ya pudo confirmar ese tramo sin vela (paso = salto)
  const confirmado = detencion ? Math.min(hasta, detencion.frontera - 1) : hasta
  const r = aplica(estado, { tipo: 'avanzar', hasta: confirmado }, finDeDatos ? velas : [...velas, CENTINELA])
  const m = marcaHuecos(r.estado, huecos, confirmadoHasta(r.estado, confirmado))
  return { estado: m.estado, eventos: [...m.eventos, ...r.eventos], detencion }
}
