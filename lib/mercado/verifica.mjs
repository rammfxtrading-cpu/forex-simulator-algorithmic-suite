// lib/mercado/verifica.mjs — la VERIFICACION DEL DIARIO, de solo lectura (CTO
// 11-oct-2026; sustituye a la orden 5 del despliegue, que vivia fuera del
// repo y se perdio). La usa scripts/verifica-diario.js.
//
// Por par, del año de DESDE (el año lo dice el argumento, nunca el reloj):
//   · cerrojo: ninguno (_cerrojos/{PAR}_{AÑO}.json);
//   · ningun {PAR}/M1/{AÑO}.json (el formato es solo .json.gz);
//   · el .json.gz: info() y UNA descarga atada por el camino del diario
//     (leerRuta con tope = tamaño y etag de info()); el sha256 del cuerpo
//     tiene que ser el de sus metadatos (sin sha256 en los metadatos no es
//     verificable: hallazgo) y las velas, las de los metadatos;
//   · la ultima vela, y cada dia desde DESDE hasta el de la ultima vela con su
//     estado (C.estadoDia con los dias cortos aceptados del par): todos
//     completos o sin mercado. El ultimo dia a medias tambien es hallazgo: el
//     diario puede publicarlo asi, pero la verificacion lo dice.
// Del bucket: objetos y bytes (suma de metadata.size, recorriendo carpetas y
// paginas de list) y cualquier ficha bajo _cerrojos/.
// → { codigo, lineas }: 0 todo bien · 1 algun hallazgo · 3 algo no se pudo
//   comprobar (y ningun hallazgo). Errores ajenos: solo clase y codigo
//   (errores.mjs), nunca su mensaje: ni URL ni clave.
import { BUCKET, rutasAnio, rutaCerrojo, infoVigente, leerRuta, leeCerrojo, noExiste } from './ficheros.mjs'
import { estadoDia, fechaCorta } from './calidad.mjs'
import { aceptadosDe } from './aceptados.mjs'
import { hastaSenal } from './limites.mjs'
import { texto } from './errores.mjs'

export const PARES = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'AUDCAD', 'GBPJPY']
const DIA = 86400
const ymd = t => new Date(t * 1000).toISOString().slice(0, 10)
const miles = n => n.toLocaleString('es-ES')
const conPlazo = (lim, ms, que, f) => { const s = lim.plazo(ms); return hastaSenal(f(s), s, que, ms) }

// 'AAAA-MM-DD' valida (y que sea esa fecha de verdad) o null
export function fechaValida(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s ?? '')) return null
  const t = Date.parse(s + 'T00:00:00Z')
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : null
}

// ¿Existe la ruta? (info, sin descargar) → 'si' | 'no' | { error }
async function existe(sb, ruta, lim) {
  try {
    const { error } = await conPlazo(lim, lim.pequenaMs, `info de ${ruta}`, () => sb.storage.from(BUCKET).info(ruta))
    if (!error) return 'si'
    return noExiste(error) ? 'no' : { error: texto(error) }
  } catch (e) { return { error: texto(e) } }
}

// Todo el bucket, carpeta a carpeta y pagina a pagina.
// → { objetos, bytes, cerrojos: [rutas] } | { error }
export async function recorreBucket(sb, lim, pagina = 1000) {
  let objetos = 0, bytes = 0
  const cerrojos = [], pendientes = ['']
  while (pendientes.length) {
    const prefijo = pendientes.shift()
    for (let offset = 0; ; offset += pagina) {
      let r
      try { r = await conPlazo(lim, lim.pequenaMs, `list de ${prefijo || '(raiz)'}`, () => sb.storage.from(BUCKET).list(prefijo, { limit: pagina, offset, sortBy: { column: 'name', order: 'asc' } })) }
      catch (e) { return { error: `list de ${prefijo || '(raiz)'}: ${texto(e)}` } }
      if (r.error) return { error: `list de ${prefijo || '(raiz)'}: ${texto(r.error)}` }
      const filas = r.data ?? []
      for (const f of filas) {
        const ruta = prefijo ? `${prefijo}/${f.name}` : f.name
        if (f.id == null) { pendientes.push(ruta); continue }
        const size = f.metadata?.size
        if (!Number.isFinite(size) || size < 0) return { error: `list sin tamaño para ${ruta}: los bytes no se pueden sumar` }
        objetos++; bytes += size
        if (ruta.startsWith('_cerrojos/')) cerrojos.push(ruta)
      }
      if (filas.length < pagina) break
    }
  }
  return { objetos, bytes, cerrojos }
}

// Un par. → { hallazgos: [..], sinComprobar: [..], lineas: [..] }
async function verificaPar(sb, par, desde, lim) {
  const anio = Number(desde.slice(0, 4))
  const hallazgos = [], sinComprobar = [], lineas = []
  const mal = t => { hallazgos.push(t); lineas.push(`  ✗ ${par} ${t}`) }
  const duda = t => { sinComprobar.push(t); lineas.push(`  ⚠️ ${par} ${t}`) }
  const bien = t => lineas.push(`  ✓ ${par} ${t}`)

  const c = await leeCerrojo(sb, par, anio, lim)
  if (c.estado === 'no-existe') bien('sin cerrojo')
  else if (c.estado === 'ok') mal(`cerrojo ${rutaCerrojo(par, anio)} puesto: lo tiene ${c.ficha?.dueno ?? '(sin dueño)'} desde ${c.ficha?.desde ?? '(sin fecha)'}`)
  else duda(`cerrojo: no se pudo leer (${c.motivo})`)

  const { gz, json } = rutasAnio(par, anio)
  const j = await existe(sb, json, lim)
  if (j === 'no') bien(`sin .json de ${anio}`)
  else if (j === 'si') mal(`hay .json de ${anio} (${json}): el formato es solo .json.gz`)
  else duda(`.json de ${anio}: no se pudo comprobar (${j.error})`)

  const i = await infoVigente(sb, par, anio, lim)
  if (i.estado === 'no-existe' || (i.estado === 'ok' && i.ruta !== gz)) { mal(`no hay ${gz}`); return { hallazgos, sinComprobar, lineas } }
  if (i.estado === 'error') { duda(`info de ${gz}: no se pudo leer (${i.motivo})`); return { hallazgos, sinComprobar, lineas } }
  const shaMeta = i.metadata?.sha256 ?? null
  if (i.size == null) { duda(`info de ${gz} sin tamaño: no se descarga`); return { hallazgos, sinComprobar, lineas } }
  const x = await leerRuta(sb, gz, lim, { tope: { max: i.size, etag: i.etag, size: i.size }, sha256: shaMeta })
  if (x.estado !== 'ok') {
    if (x.shaDistinto) mal(`sha256 del cuerpo de ${gz} distinto del de sus metadatos`)
    else duda(`${gz}: no se pudo leer (${x.motivo ?? x.estado})`)
    return { hallazgos, sinComprobar, lineas }
  }
  const velas = x.velas
  const vm = i.metadata?.velas
  if (!shaMeta) mal(`${gz} sin sha256 en sus metadatos: no verificable`)
  else bien(`sha256 del .gz = metadatos ✓ (${miles(x.bytes)} B, identidad por ${x.identidad})`)
  if (vm == null) mal(`${gz} sin velas en sus metadatos`)
  else if (Number(vm) !== velas.length) mal(`velas: metadatos ${vm} · cuerpo ${velas.length}`)
  else bien(`velas: ${miles(velas.length)} = metadatos`)

  if (!velas.length) { mal('el año no tiene velas'); return { hallazgos, sinComprobar, lineas } }
  const ultima = velas[velas.length - 1].time
  lineas.push(`    ${par} ultima vela: ${fechaCorta(ultima)}`)
  const ultimoDia = ymd(ultima)
  if (ultimoDia < desde) { mal(`ninguna vela desde ${desde}: la ultima es anterior`); return { hallazgos, sinComprobar, lineas } }
  const porDia = new Map()
  for (const v of velas) if (v.time >= Date.parse(desde + 'T00:00:00Z') / 1000) { const d = ymd(v.time); porDia.set(d, [...(porDia.get(d) ?? []), v]) }
  const aceptados = aceptadosDe(par)
  for (let t = Date.parse(desde + 'T00:00:00Z') / 1000; ymd(t) <= ultimoDia; t += DIA) {
    const d = ymd(t), vd = porDia.get(d) ?? [], e = estadoDia(d, vd, aceptados.get(d) ?? null)
    if (e === 'completo') bien(`${d} completo (${vd.length})`)
    else if (e === 'sin-mercado') bien(`${d} sin mercado (${vd.length})`)
    else mal(`${d} ${d === ultimoDia ? 'a medias (ultimo dia)' : 'incompleto'} (${vd.length})`)
  }
  return { hallazgos, sinComprobar, lineas }
}

// opciones: { desde: 'AAAA-MM-DD', pares, lim, pagina }
export async function verificaDiario(sb, { desde, pares = PARES, lim, pagina = 1000 }) {
  const lineas = [], resumen = []
  let hallazgos = 0, sinComprobar = 0
  for (const par of pares) {
    const r = await verificaPar(sb, par, desde, lim)
    lineas.push(...r.lineas, '')
    hallazgos += r.hallazgos.length; sinComprobar += r.sinComprobar.length
    const ult = r.lineas.find(l => /ultima vela:/.test(l))?.split('ultima vela: ')[1] ?? '—'
    resumen.push(`  ${par}  ${r.hallazgos.length ? '✗' : r.sinComprobar.length ? '⚠️' : '✓'} ultima vela ${ult}${r.hallazgos.length ? ` · ${r.hallazgos.length} hallazgo(s)` : ''}${r.sinComprobar.length ? ` · ${r.sinComprobar.length} sin comprobar` : ''}`)
  }
  const b = await recorreBucket(sb, lim, pagina)
  lineas.push('=== POR PAR ===', ...resumen, '', '=== BUCKET forex-data ===')
  if (b.error) { sinComprobar++; lineas.push(`  ⚠️ ${b.error}`) }
  else {
    lineas.push(`  ${b.objetos} objetos · ${miles(b.bytes)} bytes`)
    if (b.cerrojos.length) { hallazgos++; lineas.push(`  ✗ fichas en _cerrojos/: ${b.cerrojos.join(', ')}`) }
    else lineas.push('  ✓ _cerrojos/: ninguna ficha')
  }
  return { codigo: hallazgos ? 1 : sinComprobar ? 3 : 0, lineas }
}
