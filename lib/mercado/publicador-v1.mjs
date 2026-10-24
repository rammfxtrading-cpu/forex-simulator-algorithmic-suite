// lib/mercado/publicador-v1.mjs — el NUCLEO PURO del publicador del mercado v1
// (etapa 2; diseño sim-004 p.2–p.5; CTO 13-oct: Q1 = un dia con un hueco de
// mas de 15 minutos sin aceptar se retiene). Sin red, sin reloj, sin ficheros:
// las velas, el texto del fichero de aceptaciones y el manifiesto anterior se
// pasan. La subida a Storage es otra pieza (lib/mercado/publica-v1.mjs).
//
// planificaPar({ par, velas, texto, anterior, diasAceptados }):
//   velas          las del .json.gz del par (todos los años), en numeros
//   texto          lib/mercado/huecos-aceptados.jsonl
//   anterior       el manifiesto vigente del par (el del puntero) o null
//   diasAceptados  Map('AAAA-MM-DD' → { velas, motivo }): los dias cortos
//                  aceptados del par (lib/mercado/dias-aceptados.mjs)
// Recorre los dias por calendario desde el siguiente a la frontera (o el
// primero de datos) y PARA en el primer dia con mercado que no se puede
// publicar (p.4). Antes, regenera lo ya publicado y exige el mismo sha, y que
// el fichero de aceptaciones empiece por el ancla publicada: si no, INCIDENTE
// (h, nota 3) y nada que publicar.
// → { par, estado: 'publica' | 'sin_cambios' | 'incidente', manifiesto | null,
//     todos, nuevos: [{ dia, buffer }], retenido: { dia, motivo, detalle } | null,
//     incidente | null, huecos (el informe: TODOS los de mas de 15 min),
//     publicacion (el registro a anotar si hay trozos nuevos con huecos), avisos }
import { codifica, huella } from '../motor/binario.mjs'
import { aTicksExacto as aTicks } from '../motor/instrumentos.mjs'
import * as MF from '../motor/manifiesto.mjs'
import { huecosInteriores, HUECO_MAXIMO } from '../motor/manifiesto.mjs'
import { estadoDia, diaConMercado, CIERRES_CONFIRMADOS, FESTIVOS_MMDD, UMBRAL_LABORABLE } from './calidad.mjs'
import { validaAceptaciones, aceptacionesDe, cortosDe, ancla, compruebaAncla } from './aceptaciones.mjs'
import { errorPropio } from './errores.mjs'

const DIA = 86400
const ymd = s => new Date(s * 1000).toISOString().slice(0, 10)
const hhmmZ = s => new Date(s * 1000).toISOString().slice(0, 16) + 'Z'
const S = d => Date.parse(d + 'T00:00:00Z') / 1000
const sig = d => ymd(S(d) + DIA)
const HUECO_FORMATO = 2879          // lo que admite el trozo v2 (p.1)
// Festivos (25-dic, 1-ene; FESTIVOS_MMDD): CTO 14-oct, decision 2: un festivo
// CORTO (menos velas que el umbral de su dia de la semana) solo se publica si
// tiene su linea «corto» en el fichero de aceptaciones, con al menos esas
// velas; si no, se retiene «festivo_sin_aceptar». Al manifiesto va con las
// velas y el motivo de la linea.

function versionSiguiente(anterior) {
  if (!anterior) return 'v1.1'
  const m = /^v1\.([1-9]\d*)$/.exec(anterior.version)
  if (!m) throw errorPropio(`version anterior inesperada: ${anterior.version}`)
  return `v1.${Number(m[1]) + 1}`
}

export function planificaPar({ par, velas, texto = '', anterior = null, diasAceptados = new Map() }) {
  const base = { par, estado: 'incidente', manifiesto: null, todos: [], nuevos: [], retenido: null, incidente: null, huecos: [], publicacion: null, avisos: [] }
  let v
  try { v = validaAceptaciones(texto) } catch (e) { return { ...base, incidente: e.message } }
  const acept = aceptacionesDe(v, par), cortos = cortosDe(v, par)
  const cerrados = new Set(CIERRES_CONFIRMADOS)
  const vs = [...velas].sort((a, b) => a.time - b.time)
  const porDia = new Map()
  vs.forEach((x, i) => { const d = ymd(x.time); if (!porDia.has(d)) porDia.set(d, { desde: i, velas: [] }); porDia.get(d).velas.push(x) })
  const tiempos = vs.map(x => x.time)
  const idx = new Map(tiempos.map((t, i) => [t, i]))

  // el informe: todos los huecos interiores de mas de 15 minutos
  const huecos = huecosInteriores(tiempos, cerrados).filter(h => h.minutos > HUECO_MAXIMO).map(h => {
    const inicio = hhmmZ(h.ini), a = acept.get(inicio)
    const antes = vs[idx.get(h.ini - 60)], despues = vs[idx.get(h.ini + 60 * h.minutos)]
    return {
      par, inicio, dia: ymd(h.ini), ini: h.ini, minutos: h.minutos,
      estado: !a ? 'pendiente' : a.minutos === h.minutos ? 'aceptado' : 'no_coincide',
      aceptacion: a ?? null,
      antes: antes ? { time: antes.time, precio: String(antes.close) } : null,
      despues: despues ? { time: despues.time, precio: String(despues.open) } : null,
    }
  })
  const huecosDe = new Map()
  for (const h of huecos) { if (!huecosDe.has(h.dia)) huecosDe.set(h.dia, []); huecosDe.get(h.dia).push(h) }
  const reales = new Set(huecos.map(h => h.inicio))
  const avisos = [...acept.values()].filter(a => !reales.has(a.inicio)).map(a => `aceptacion sin hueco real: ${par} ${a.inicio} (${a.minutos} min, renglon ${a.linea})`)
  const minimo = d => diasAceptados.get(d)?.velas ?? null
  const completo = d => estadoDia(d, porDia.get(d)?.velas ?? [], minimo(d)) === 'completo'

  // ¿se puede publicar el dia d? → { ok, sinTrozo?, trozo?, motivo, detalle }
  function evalua(d) {
    const delDia = porDia.get(d)?.velas ?? []
    if (cerrados.has(d) || !diaConMercado(d, cerrados)) return delDia.length ? { ok: false, motivo: 'velas_sin_mercado', detalle: `${delDia.length} velas` } : { ok: true, sinTrozo: true }
    if (!completo(d)) return { ok: false, motivo: 'incompleto', detalle: `${delDia.length} velas` }
    const umbralLab = UMBRAL_LABORABLE[new Date(S(d) * 1000).getUTCDay()]
    if (FESTIVOS_MMDD.has(d.slice(5)) && umbralLab && delDia.length < umbralLab) {
      const c = cortos.get(d)
      if (!c || delDia.length < c.velas) return { ok: false, motivo: 'festivo_sin_aceptar', detalle: c ? `${delDia.length} velas, menos que las ${c.velas} de su linea «corto» (renglon ${c.linea})` : `${delDia.length}/${umbralLab} velas: falta su linea «corto» en lib/mercado/huecos-aceptados.jsonl` }
    }
    const ultima = delDia.at(-1)
    const siguiente = vs[idx.get(ultima.time) + 1]
    if (!siguiente) return { ok: false, motivo: 'sin_vela_siguiente', detalle: 'su ultimo hueco aun no es definitivo' }
    const dn = ymd(siguiente.time)
    if (!diaConMercado(dn, cerrados)) return { ok: false, motivo: 'velas_sin_mercado', detalle: `la vela siguiente cae en ${dn}, sin mercado` }
    if (!completo(dn)) return { ok: false, motivo: 'siguiente_incompleto', detalle: `la vela siguiente cae en ${dn}, incompleto` }
    const usados = []
    for (const h of huecosDe.get(d) ?? []) {
      if (h.minutos > HUECO_FORMATO) return { ok: false, motivo: 'hueco_fuera_de_formato', detalle: `${h.inicio}: ${h.minutos} min > ${HUECO_FORMATO}` }
      if (h.estado === 'pendiente') return { ok: false, motivo: 'hueco_pendiente', detalle: `${h.inicio}: ${h.minutos} min sin aceptar` }
      if (h.estado === 'no_coincide') return { ok: false, motivo: 'aceptacion_no_coincide', detalle: `${h.inicio}: aceptado de ${h.aceptacion.minutos} min, real de ${h.minutos}` }
      usados.push({ inicio: h.inicio, minutos: h.minutos, motivo: h.aceptacion.motivo })
    }
    try {
      const ticks = delDia.map(x => ({ time: x.time, open: aTicks(par, String(x.open)), high: aTicks(par, String(x.high)), low: aTicks(par, String(x.low)), close: aTicks(par, String(x.close)), volume: x.volume }))
      return { ok: true, trozo: { dia: d, buffer: codifica(par, S(d), ticks, usados) }, usados }
    } catch (e) { return { ok: false, motivo: 'no_codificable', detalle: e.message } }
  }
  const out = { ...base, huecos, avisos }
  if (!vs.length && !anterior) return { ...out, estado: 'sin_cambios' }

  // lo ya publicado: identico
  const todos = []
  let desde
  if (anterior) {
    try { compruebaAncla(texto, anterior.aceptaciones) } catch (e) { return { ...out, incidente: e.message } }
    const publicados = new Map(anterior.dias.map(x => [x.dia, x]))
    const f = MF.frontera(anterior)
    for (let d = anterior.dias[0].dia; d <= f; d = sig(d)) {
      const r = evalua(d)
      if (!r.ok) return { ...out, incidente: `el dia publicado ${d} ya no se puede publicar (${r.motivo}: ${r.detalle})` }
      if (r.sinTrozo) { if (publicados.has(d)) return { ...out, incidente: `el dia publicado ${d} tenia trozo y ahora no tiene mercado` }; continue }
      if (!publicados.has(d)) return { ...out, incidente: `el dia ${d} no estaba publicado y es anterior a la frontera ${f}` }
      if (huella(r.trozo.buffer) !== publicados.get(d).sha256) return { ...out, incidente: `el dia publicado ${d} cambia en los datos (otro sha)` }
      todos.push(r.trozo)
    }
    // E2R2-05: los cortos aceptados efectivos hasta la frontera son los publicados,
    // tambien cuando no hay dias nuevos (antes de cualquier «sin_cambios»)
    let efectivos
    try { efectivos = cortosDe_(todos) } catch (e) { return { ...out, incidente: e.message } }
    const publicadosC = new Map((anterior.cortos_aceptados ?? []).filter(c => c.dia <= f).map(c => [c.dia, c]))
    for (const c of efectivos) {
      const pc = publicadosC.get(c.dia)
      if (!pc || pc.velas !== c.velas || pc.motivo !== c.motivo) return { ...out, incidente: `los cortos aceptados hasta la frontera ${f} cambian: ${c.dia} publicado ${pc ? `con ${pc.velas} velas («${pc.motivo}»)` : 'sin corto'}, ahora ${c.velas} («${c.motivo}»)` }
      publicadosC.delete(c.dia)
    }
    if (publicadosC.size) return { ...out, incidente: `los cortos aceptados hasta la frontera ${f} cambian: ${[...publicadosC.keys()].join(', ')} publicado(s) como corto(s) y ahora no` }
    desde = sig(f)
  } else desde = ymd(vs[0].time)

  // los dias nuevos, hasta el primer retenido
  const nuevos = [], usadosNuevos = []
  let retenido = null
  const ultimoDato = vs.length ? ymd(vs.at(-1).time) : null
  for (let d = desde; ultimoDato && d <= ultimoDato; d = sig(d)) {
    const r = evalua(d)
    if (!r.ok) { retenido = { dia: d, motivo: r.motivo, detalle: r.detalle }; break }
    if (r.sinTrozo) continue
    nuevos.push(r.trozo); todos.push(r.trozo)
    for (const u of r.usados) usadosNuevos.push({ inicio: u.inicio, dia: d, sha256: huella(r.trozo.buffer) })
  }
  if (!nuevos.length) return { ...out, estado: 'sin_cambios', retenido, todos, manifiesto: null }

  const dias = todos.map(t => t.dia)
  const primero = dias[0], frontera = dias.at(-1)
  let cortosAceptados
  try { cortosAceptados = cortosDe_(todos) } catch (e) { return { ...out, incidente: e.message } }
  let manifiesto
  try {
    manifiesto = MF.creaManifiesto({
      par, version: versionSiguiente(anterior), trozos: todos,
      cerrados: [...cerrados].filter(d => d >= primero && d <= frontera),
      cortosAceptados, aceptaciones: { lineas: v.lineas, sha256: ancla(texto, v.lineas) }, anterior,
    })
  } catch (e) { return { ...out, incidente: `no se puede crear el manifiesto: ${e.message}` } }
  const publicacion = usadosNuevos.length ? { tipo: 'publicacion', par, manifiesto: MF.fija(manifiesto), lineas: v.lineas, prefijo: ancla(texto, v.lineas), trozos: usadosNuevos } : null
  return { ...out, estado: 'publica', manifiesto, todos, nuevos, retenido, publicacion }

  // los cortos aceptados de unos trozos: los festivos, con su linea «corto»; los demas, de la lista de dias cortos
  function cortosDe_(trozos) {
    return trozos.map(t => {
      const n = porDia.get(t.dia).velas.length, umbral = UMBRAL_LABORABLE[new Date(S(t.dia) * 1000).getUTCDay()]
      if (!umbral || n >= umbral) return null
      if (FESTIVOS_MMDD.has(t.dia.slice(5))) {
        const c = cortos.get(t.dia)
        if (c && n >= c.velas) return { dia: t.dia, velas: c.velas, motivo: c.motivo }
        throw errorPropio(`${par} ${t.dia}: festivo corto (${n}/${umbral}) sin su linea y publicable: no deberia pasar`)
      }
      const a = diasAceptados.get(t.dia)
      if (a && n >= a.velas) return { dia: t.dia, velas: a.velas, motivo: a.motivo }
      throw errorPropio(`${par} ${t.dia}: corto (${n}/${umbral}) sin aceptar y publicable: no deberia pasar`)
    }).filter(Boolean)
  }
}

// una linea para los mensajes de las pruebas y del script
export const resumen = p => `${p.par} ${p.estado}${p.manifiesto ? ` ${p.manifiesto.version} hasta ${MF.frontera(p.manifiesto)} (${p.nuevos.length} nuevos)` : ''}${p.retenido ? ` · retenido ${p.retenido.dia} ${p.retenido.motivo} (${p.retenido.detalle})` : ''}${p.incidente ? ` · INCIDENTE: ${p.incidente}` : ''}`

// ── el informe de huecos (Q1; diseño p.5): legible, sin datos de alumnos ─────
const NY = new Intl.DateTimeFormat('es-ES', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const hora = s => new Date(s * 1000).toISOString().slice(11, 16)
export function informe(planes, { generado = '' } = {}) {
  const todos = planes.flatMap(p => p.huecos)
  const solapes = h => todos.filter(o => o.par !== h.par && o.ini < h.ini + 60 * h.minutos && h.ini < o.ini + 60 * o.minutos).map(o => `${o.par} (${o.inicio}, ${o.minutos} min)`)
  const l = []
  l.push('# Mercado v1 · informe del publicador', '', `Generado: ${generado}. Solo velas: ni alumnos ni sesiones.`, '')
  l.push('## Por par', '', '| Par | Estado | Version | Frontera | Dias nuevos | Primer retenido | Huecos > 15 min (pendientes) |', '|---|---|---|---|---|---|---|')
  for (const p of planes) {
    const pend = p.huecos.filter(h => h.estado !== 'aceptado').length
    l.push(`| ${p.par} | ${p.estado}${p.incidente ? `: ${p.incidente}` : ''} | ${p.manifiesto?.version ?? '-'} | frontera ${p.manifiesto ? MF.frontera(p.manifiesto) : '-'} | ${p.nuevos.length} | ${p.retenido ? `${p.retenido.dia} · ${p.retenido.motivo} (${p.retenido.detalle})` : '-'} | ${p.huecos.length} (${pend}) |`)
  }
  const avisos = planes.flatMap(p => p.avisos)
  if (avisos.length) l.push('', '## Avisos', '', ...avisos.map(a => `- ${a}`))
  l.push('', '## Huecos interiores de mas de 15 minutos', '', 'El motivo lo decide el CTO; el informe no lo adivina. Solape: otros pares con un hueco que se cruza con este.', '')
  l.push('| Par | Dia | Inicio (UTC) | Nueva York | Duracion | Estado | Vela anterior | Vela siguiente | Solapes |', '|---|---|---|---|---|---|---|---|---|')
  for (const h of [...todos].sort((a, b) => a.ini - b.ini || (a.par < b.par ? -1 : 1))) {
    const est = h.estado === 'aceptado' ? `aceptado (${h.aceptacion.motivo}, renglon ${h.aceptacion.linea})` : h.estado === 'no_coincide' ? `no coincide: aceptado de ${h.aceptacion.minutos} min (renglon ${h.aceptacion.linea})` : 'pendiente'
    const s = solapes(h)
    l.push(`| ${h.par} | ${h.dia} (${SEMANA[new Date(h.ini * 1000).getUTCDay()]}) | ${h.inicio} | ${NY.format(new Date(h.ini * 1000))} Nueva York | ${h.minutos} min | ${est} | ${h.antes ? `${hora(h.antes.time)} · ${h.antes.precio}` : '-'} | ${h.despues ? `${ymd(h.despues.time)} ${hora(h.despues.time)} · ${h.despues.precio}` : '-'} | ${s.length ? s.join(', ') : 'ninguno'} |`)
  }
  return l.join('\n') + '\n'
}
