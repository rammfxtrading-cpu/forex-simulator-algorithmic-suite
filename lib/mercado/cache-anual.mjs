// lib/mercado/cache-anual.mjs — copia local de los ficheros anuales para el
// actualizador diario (CTO 9-oct-2026, mercado diario, punto 1). En Actions la
// carpeta la guarda y la restaura actions/cache; fuera de Actions no se usa
// (sin MERCADO_CACHE el actualizador lee como siempre).
//
// Por cada par y año, dos ficheros en la carpeta:
//   {PAR}_{AÑO}.datos        los bytes tal como estan en Storage (.json o .json.gz)
//   {PAR}_{AÑO}.firma.json   { ruta, firma, sha256 }: la ruta y la firma de
//                            info() (version|etag|tamaño) del objeto del que
//                            salieron, y el sha256 de esos bytes
// La copia VALE solo si, con la info() de ahora (sin descargar):
//   · la ruta y la firma son las mismas,
//   · el sha256 de los bytes guardados es el apuntado (la copia no se estropeo),
//   · y, si info() trae metadata.sha256 (lo sube publicarAnio), coincide tambien.
// Si no vale, el actualizador descarga y la reescribe. Se escribe en un fichero
// temporal y se renombra: una copia a medias nunca tiene firma.
import fs from 'fs'
import path from 'path'
import { sha256 } from './ficheros.mjs'

const base = (pair, year) => `${String(pair).toUpperCase().replace('/', '')}_${year}`

export function creaCache(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const datos = (pair, year) => path.join(dir, `${base(pair, year)}.datos`)
  const firma = (pair, year) => path.join(dir, `${base(pair, year)}.firma.json`)
  return {
    dir,
    // info: la de infoVigente (estado 'ok'). → { crudo } | { motivo } (por que no vale)
    lee(pair, year, info) {
      let f, crudo
      try { f = JSON.parse(fs.readFileSync(firma(pair, year), 'utf8')) } catch { return { motivo: 'sin copia' } }
      if (f.ruta !== info.ruta || !info.firma || f.firma !== info.firma) return { motivo: 'huella distinta' }
      if (info.metadata?.sha256 && info.metadata.sha256 !== f.sha256) return { motivo: 'huella distinta' }
      try { crudo = fs.readFileSync(datos(pair, year)) } catch { return { motivo: 'sin copia' } }
      if (sha256(crudo) !== f.sha256) return { motivo: 'copia estropeada' }
      return { crudo }
    },
    // shaRemoto: el metadata.sha256 de info(), si lo hay; si no cuadra con los
    // bytes, no se guarda (el objeto cambio entre info() y la descarga).
    // → true si quedo guardada
    guarda(pair, year, { ruta, firma: fi, crudo, shaRemoto = null }) {
      const sha = sha256(crudo)
      if (!fi || (shaRemoto && shaRemoto !== sha)) { this.olvida(pair, year); return false }
      this.olvida(pair, year)
      const tmp = datos(pair, year) + '.tmp'
      fs.writeFileSync(tmp, crudo); fs.renameSync(tmp, datos(pair, year))
      fs.writeFileSync(firma(pair, year) + '.tmp', JSON.stringify({ ruta, firma: fi, sha256: sha })); fs.renameSync(firma(pair, year) + '.tmp', firma(pair, year))
      return true
    },
    olvida(pair, year) { fs.rmSync(firma(pair, year), { force: true }); fs.rmSync(datos(pair, year), { force: true }) },
  }
}
