// Fixture de pruebas/scripts-falsos.mjs: intenta leer el fichero de RUTA_A_LEER
// por la via de VIA_DE_LECTURA y dice que paso. No es un script del producto.
const fs = require('fs')
// RUTA_URL=1 (BD-06): la ruta se pasa como objeto URL file: (relativa a la carpeta actual)
const { pathToFileURL } = require('url')
const ruta = process.env.RUTA_URL ? new URL(process.env.RUTA_A_LEER, pathToFileURL(process.cwd() + '/')) : process.env.RUTA_A_LEER
const via = process.env.VIA_DE_LECTURA || 'readFileSync'
// H05 (bloque D, punto 8): ENLACE_A = crea en la carpeta actual el enlace
// simbolico ENLACE_EN → ENLACE_A antes de leer (un enlace dentro de la carpeta
// admitida que apunta fuera); CREA_OTRO = escribe un .env falso en esa ruta
// relativa (dentro de la carpeta temporal, pero no es EL fixture)
const path = require('path')
if (process.env.ENLACE_A) { fs.mkdirSync(path.dirname(process.env.ENLACE_EN), { recursive: true }); fs.symlinkSync(process.env.ENLACE_A, process.env.ENLACE_EN) }
if (process.env.CREA_OTRO) { fs.mkdirSync(path.dirname(process.env.CREA_OTRO), { recursive: true }); fs.writeFileSync(process.env.CREA_OTRO, 'FALSO=1\n') }
const intenta = async () => {
  if (via === 'readFileSync') return fs.readFileSync(ruta, 'utf8')
  if (via === 'openSync') return String(fs.openSync(ruta, 'r'))
  if (via === 'promises.readFile') return await fs.promises.readFile(ruta, 'utf8')
  if (via === 'createReadStream') return await new Promise((ok, ko) => fs.createReadStream(ruta).on('data', d => ok(String(d))).on('error', ko))
}
intenta().then(c => console.log('LEIDO: ' + c.length + ' bytes')).catch(e => console.log('ERROR: ' + e.message)).finally(() => console.log('Done.'))
