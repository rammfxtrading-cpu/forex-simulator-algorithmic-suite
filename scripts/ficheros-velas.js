// Formato de los ficheros del bucket forex-data (compresion aprobada por el CTO,
// 5-oct-2026). Un año de un par puede estar como:
//   {PAR}/M1/{AÑO}.json.gz   gzip del JSON de siempre (el formato nuevo)
//   {PAR}/M1/{AÑO}.json      el JSON sin comprimir (el de siempre)
// LECTURA: el .json.gz si existe; si no existe (404 real), el .json. Un error que
//   no es 404 al leer el .json.gz es «no se pudo leer»: NO se cae al .json, que
//   puede ser una version vieja.
// ESCRITURA: solo .json.gz. El .json NUNCA se borra aqui: borrarlo es un paso de
//   la migracion (copia local verificada, subir, comprobar hash, borrar), aparte.
// Se descomprime por los dos bytes magicos de gzip (1f 8b), no por la extension:
// si el servidor ya lo entrega descomprimido, se lee igual.
// Lo usan los scripts CommonJS (Node 20 en Actions); pages/api/candles.js lleva
// la misma regla.
const zlib = require('zlib')

const rutasAnio = (pair, year) => {
  const json = `${String(pair).toUpperCase()}/M1/${year}.json`
  return { gz: json + '.gz', json }
}
const esGzip = b => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b
const noExiste = e => String(e?.statusCode) === '404' || e?.status === 404

// → { estado: 'ok', velas, ruta } | { estado: 'no-existe' } | { estado: 'error', ruta, motivo }
async function leerVelas(sb, bucket, pair, year) {
  const r = rutasAnio(pair, year)
  for (const ruta of [r.gz, r.json]) {
    const { data, error } = await sb.storage.from(bucket).download(ruta)
    if (error) {
      if (noExiste(error)) continue
      return { estado: 'error', ruta, motivo: error.message || String(error) }
    }
    try {
      let b = Buffer.from(await data.arrayBuffer())
      if (esGzip(b)) b = zlib.gunzipSync(b)
      const velas = JSON.parse(b.toString('utf8'))
      return Array.isArray(velas) ? { estado: 'ok', velas, ruta } : { estado: 'error', ruta, motivo: 'no es una lista' }
    } catch (e) {
      return { estado: 'error', ruta, motivo: 'ilegible: ' + e.message }
    }
  }
  return { estado: 'no-existe' }
}

const empaqueta = velas => zlib.gzipSync(Buffer.from(JSON.stringify(velas), 'utf8'))

// Sube el año como .json.gz (upsert). → { ruta, bytes, error }
async function subirVelas(sb, bucket, pair, year, velas) {
  const ruta = rutasAnio(pair, year).gz
  const cuerpo = empaqueta(velas)
  const { error } = await sb.storage.from(bucket).upload(ruta, cuerpo, { contentType: 'application/gzip', upsert: true })
  return { ruta, bytes: cuerpo.length, error: error || null }
}

module.exports = { rutasAnio, esGzip, noExiste, leerVelas, empaqueta, subirVelas }
