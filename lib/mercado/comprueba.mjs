// lib/mercado/comprueba.mjs — el CONTRATO DE LA DESCARGA LIMITADA en una
// lectura acotada (paso 6 del despliegue de mercado diario; CTO 10-oct-2026).
// SOLO LECTURA: una consulta de informacion (infoVigente) y UNA descarga del
// año por el mismo camino que el diario (leerRuta atada: fetchConTope en el
// cliente, tope = tamaño de info(), etag de info(), sha256 de los metadatos).
// Sin publicar, sin cerrojos, sin proveedor, sin reintento.
// → { codigo, lineas }
//   0  identidad comprobada («identidad verificada por etag | sha256 | etag y
//      sha256»: la etag recibida igual a la de info(), o el sha256 del cuerpo
//      igual al de los metadatos), tamaño bien y las velas de los metadatos,
//      si las hay, iguales a las del cuerpo
//   3  sin identidad comprobada (ni etag contrastable ni sha256), etag
//      distinta, sin objeto, sin tamaño, velas distintas, descarga cortada o
//      fallida: el diario saldria con 3 (o no daria por buena la copia)
//   1  el sha256 del cuerpo no es el de los metadatos (el diario: «no verificado»)
import { infoVigente, leerRuta } from './ficheros.mjs'

const forma = e => (e == null ? 'ausente' : `${/^W\//.test(e) ? 'debil (W/), ' : ''}${/"/.test(e) ? 'con comillas' : 'sin comillas'}: ${e}`)

export async function compruebaDescarga(sb, par, anio, lim) {
  const lineas = []
  const P = `${String(par).toUpperCase()} ${anio}`
  const i = await infoVigente(sb, par, anio, lim)
  if (i.estado === 'no-existe') return { codigo: 3, lineas: [`${P}: info(): no hay .json.gz ni .json; nada que comprobar`] }
  if (i.estado === 'error') return { codigo: 3, lineas: [`${P}: info() fallo: ${i.motivo}`] }
  const claves = Object.keys(i.metadata ?? {}).sort()
  lineas.push(`${P}: info() de ${i.ruta}: etag ${forma(i.etag)} · tamaño ${i.size ?? 'AUSENTE'} · metadatos: ${claves.length ? claves.join(', ') : 'ninguno'}`)
  if (i.size == null) return { codigo: 3, lineas: [...lineas, `${P}: ✗ info() sin tamaño: el diario no descargaria (codigo 3); no se hace el GET`] }
  const shaMeta = i.metadata?.sha256 ?? null
  if (!shaMeta) lineas.push(`${P}: ⚠️ los metadatos no traen sha256: el diario certificaria solo por etag y tamaño`)
  const observa = {}
  const x = await leerRuta(sb, i.ruta, lim, { tope: { max: i.size, etag: i.etag, size: i.size }, sha256: shaMeta, observa })
  const f = observa.ficha
  const etagGet = f?.vista ? (f.etagRecibida == null ? `sin etag${i.etag ? ' (info() si traia)' : ''}` : `etag ${forma(f.etagRecibida)}${i.etag ? (String(f.etagRecibida).replace(/^W\//, '').replace(/"/g, '') === String(i.etag).replace(/^W\//, '').replace(/"/g, '') ? ' · coincide con la de info()' : ' · NO coincide con la de info()') : ''}`) : 'sin respuesta observada'
  lineas.push(`${P}: GET de ${i.ruta}: HTTP ${f?.estadoHttp ?? '?'} · ${etagGet} · recibidos ${f?.vista ? f.recibidos : x.bytes ?? '?'} bytes de ${i.size}`)
  if (x.estado === 'ok') {
    if (f?.vista && f.etagRecibida == null && i.etag) lineas.push(`${P}: ⚠️ el GET no trae etag: el diario lo acepta solo porque el sha256 de los metadatos certifica el cuerpo`)
    lineas.push(`${P}: ✓ sha256 del cuerpo ${shaMeta ? 'coincide con el de los metadatos' : 'sin comprobar (no hay en los metadatos)'}`)
    // MDC2-02: velas de los metadatos frente a velas del cuerpo
    const vm = i.metadata?.velas, vc = Array.isArray(x.velas) ? x.velas.length : null
    lineas.push(`${P}: velas: metadatos ${vm ?? '(no hay)'} · cuerpo ${vc ?? '?'}`)
    if (vm != null && Number(vm) !== vc) return { codigo: 3, lineas: [...lineas, `${P}: ✗ las velas de los metadatos (${vm}) no son las del cuerpo (${vc})`] }
    // MDC2-02: solo con identidad comprobada (leerRuta ya rechaza sin ninguna); se dice cual la certifico
    lineas.push(`${P}: ✓ identidad verificada por ${x.identidad}`)
    return { codigo: 0, lineas }
  }
  if (x.shaDistinto) return { codigo: 1, lineas: [...lineas, `${P}: ✗ ${x.motivo}`] }
  return { codigo: 3, lineas: [...lineas, `${P}: ✗ ${x.motivo ?? x.estado}`] }
}
