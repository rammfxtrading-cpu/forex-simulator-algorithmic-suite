// lib/mercado/descarga-v1.mjs — la DESCARGA AUTORIZADA de los anuales de
// forex-data para el mercado v1 (etapa 2; CTO 13-oct: Ramon autoriza los 27
// anuales, SOLO LECTURA, para la lista real de huecos; regla del 5-oct: ningun
// anual sin su si). Puro salvo los puertos:
//   info(par, anio)               → { estado: 'ok', ruta, size, etag, sha256 } | { estado: 'no-existe' } | { estado: 'error', motivo }
//   bajar(ruta, { tope, sha256 }) → { estado: 'ok', crudo, identidad } | { estado, motivo, shaDistinto? }
//   escribe(nombre, bytes)        en exclusiva (nunca sobrescribe)
//   relee(nombre)                 → los bytes del disco
// Cada fichero: solo el .json.gz; el sha256 de los metadatos tiene que existir
// y ser el del cuerpo (descarga atada a info(): tope y etag, como el
// verificador del diario); se guarda el cuerpo TAL CUAL, con su .sha256
// (formato sha256sum, el que lee scripts/mercado-v1-dependencias.mjs) y se
// relee del disco. Lo que no cumpla no cuenta como guardado.
import { createHash } from 'crypto'

const sha = b => createHash('sha256').update(b).digest('hex')

export async function descargaAnuales({ pares, anios, info, bajar, escribe, relee }) {
  const lineas = [], fallos = [], guardados = []
  const falla = m => { fallos.push(m); lineas.push(`✗ ${m}`) }
  for (const par of pares) for (const anio of anios) {
    const i = await info(par, anio)
    if (i.estado === 'no-existe') { lineas.push(`${par} ${anio}: no existe`); continue }
    if (i.estado !== 'ok') { falla(`${par} ${anio}: info() no se pudo leer (${i.motivo})`); continue }
    if (!String(i.ruta).endsWith('.json.gz')) { falla(`${par} ${anio}: lo vigente es ${i.ruta}, no un .json.gz`); continue }
    if (!/^[0-9a-f]{64}$/.test(i.sha256 ?? '')) { falla(`${par} ${anio}: ${i.ruta} sin sha256 en sus metadatos: no verificable`); continue }
    const x = await bajar(i.ruta, { tope: { max: i.size, etag: i.etag, size: i.size }, sha256: i.sha256 })
    if (x.estado !== 'ok') { falla(`${par} ${anio}: ${x.shaDistinto ? 'el sha256 del cuerpo no es el de los metadatos' : `descarga fallida (${x.motivo})`}`); continue }
    if (sha(x.crudo) !== i.sha256) { falla(`${par} ${anio}: el sha256 del cuerpo no es el de los metadatos`); continue }
    const nombre = `${par}_${anio}.json.gz`
    await escribe(nombre, x.crudo)
    await escribe(nombre + '.sha256', Buffer.from(`${i.sha256}  ${nombre}\n`))
    const disco = await relee(nombre)
    if (!disco || sha(disco) !== i.sha256) { falla(`${par} ${anio}: la relectura del disco no da el sha256`); continue }
    guardados.push({ nombre, bytes: x.crudo.length, sha256: i.sha256 })
    lineas.push(`${par} ${anio}: ${i.ruta} · ${x.crudo.length} bytes · sha256 ${i.sha256} = metadatos = disco (identidad por ${x.identidad})`)
  }
  return { lineas, fallos, guardados }
}
