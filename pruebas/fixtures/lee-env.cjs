// Fixture de pruebas/scripts-falsos.mjs: intenta leer el fichero de RUTA_A_LEER
// por la via de VIA_DE_LECTURA y dice que paso. No es un script del producto.
const fs = require('fs')
const ruta = process.env.RUTA_A_LEER
const via = process.env.VIA_DE_LECTURA || 'readFileSync'
const intenta = async () => {
  if (via === 'readFileSync') return fs.readFileSync(ruta, 'utf8')
  if (via === 'openSync') return String(fs.openSync(ruta, 'r'))
  if (via === 'promises.readFile') return await fs.promises.readFile(ruta, 'utf8')
  if (via === 'createReadStream') return await new Promise((ok, ko) => fs.createReadStream(ruta).on('data', d => ok(String(d))).on('error', ko))
}
intenta().then(c => console.log('LEIDO: ' + c.length + ' bytes')).catch(e => console.log('ERROR: ' + e.message)).finally(() => console.log('Done.'))
