/**
 * EL EJECUTOR DE SCRIPTS (pruebas/script-falso.mjs) SE COMPRUEBA A SI MISMO
 *
 * H05 (revision de Astra, 4-oct): la lectura de un .env ajeno se deniega ANTES
 * DE ABRIR, por cualquier via de fs; el .env.local sintetico de la carpeta
 * temporal si se puede leer.
 * Prueba con pruebas/fixtures/lee-env.cjs. La ruta ajena NO EXISTE: si se
 * abriera, el error seria ENOENT; denegada antes de abrir, dice DENEGADA.
 * H06: se devuelve como termino el script (final / exit con su codigo /
 * timeout), y un process.exit corta lo que viene detras (pruebas/fixtures/salidas.cjs).
 */
import { titulo, ver, fin, escenario } from './lib.mjs'
import { correScript } from './script-falso.mjs'
escenario()
const AJENA = '/ruta/que/no/existe/.env.local'

titulo('H05 · .env ajeno: denegado antes de abrir, por cada via')
for (const via of ['readFileSync', 'openSync', 'promises.readFile', 'createReadStream']) {
  const r = await correScript('pruebas/fixtures/lee-env.cjs', { ahora: '2026-10-05T10:00:00Z', env: { RUTA_A_LEER: AJENA, VIA_DE_LECTURA: via } })
  const linea = r.salida.find(l => /^(LEIDO|ERROR)/.test(l)) ?? ''
  ver(`${via}: DENEGADA (no ENOENT: no llego a abrir) y apuntada`, /LECTURA DE \.env DENEGADA/.test(linea) && !/ENOENT/.test(linea) && r.envLeidos.includes(AJENA), linea)
}

titulo('H05 · control: el .env.local sintetico de la carpeta temporal si se lee')
const r = await correScript('pruebas/fixtures/lee-env.cjs', { ahora: '2026-10-05T10:00:00Z', env: { RUTA_A_LEER: '.env.local' } })
ver('se lee (el falso, con claves falsas) y no se apunta como ajeno', r.salida.some(l => /^LEIDO: \d+ bytes/.test(l)) && r.envLeidos.length === 0 && r.envTodos.length === 1, r.salida.find(l => /^(LEIDO|ERROR)/.test(l)))

titulo('H05 · bloque D, punto 8: solo el fixture exacto, por su ruta canonica')
// Astra (cierres, 5-oct): el guard usaba path.resolve y un prefijo del
// directorio temporal, sin resolver enlaces: «temporal/enlace-a-ajena/.env.local»
// pasaba. El destino del enlace es un .env FALSO creado aqui (no un secreto).
const fsx = await import('node:fs'), osx = await import('node:os'), px = await import('node:path')
const fuera = fsx.mkdtempSync(px.join(osx.tmpdir(), 'ajena-'))
fsx.writeFileSync(px.join(fuera, '.env.local'), 'AJENA_FALSA=1\n')
const en = await correScript('pruebas/fixtures/lee-env.cjs', { ahora: '2026-10-05T10:00:00Z', env: { ENLACE_A: fuera, ENLACE_EN: 'enlace-a-ajena', RUTA_A_LEER: 'enlace-a-ajena/.env.local' } })
const lineaEn = en.salida.find(l => /^(LEIDO|ERROR)/.test(l)) ?? ''
ver('un enlace DENTRO de la carpeta temporal que apunta a un .env ajeno: DENEGADO', /DENEGADA/.test(lineaEn), lineaEn)
const otro = await correScript('pruebas/fixtures/lee-env.cjs', { ahora: '2026-10-05T10:00:00Z', env: { CREA_OTRO: 'sub/.env.local', RUTA_A_LEER: 'sub/.env.local' } })
const lineaOtro = otro.salida.find(l => /^(LEIDO|ERROR)/.test(l)) ?? ''
ver('otro .env dentro de la carpeta temporal (no es EL fixture): DENEGADO', /DENEGADA/.test(lineaOtro), lineaOtro)
const rodeo = await correScript('pruebas/fixtures/lee-env.cjs', { ahora: '2026-10-05T10:00:00Z', env: { CREA_OTRO: 'sub/x', RUTA_A_LEER: 'sub/../.env.local' } })
ver('control: el fixture por una ruta no canonica (sub/../.env.local) se lee: es el mismo fichero', rodeo.salida.some(l => /^LEIDO: \d+ bytes/.test(l)), rodeo.salida.find(l => /^(LEIDO|ERROR)/.test(l)))
const disf = await correScript('pruebas/fixtures/lee-env.cjs', { ahora: '2026-10-05T10:00:00Z', env: { ENLACE_A: px.join(fuera, '.env.local'), ENLACE_EN: 'datos.txt', RUTA_A_LEER: 'datos.txt' } })
const lineaDisf = disf.salida.find(l => /^(LEIDO|ERROR)/.test(l)) ?? ''
ver('un enlace con nombre inocente (datos.txt) que apunta a un .env ajeno: DENEGADO', /DENEGADA/.test(lineaDisf), lineaDisf)
titulo('H05 · bloque E, punto 5: URLs codificadas (Astra BD-06)')
// La guarda usaba URL.pathname sin decodificar: «%2eenv.local» no parecia un
// .env y se leia. Ahora: fileURLToPath antes de resolver; si no se puede
// comprobar (host remoto, URL no file:), se deniega.
fsx.mkdirSync(px.join(fuera, 'con espacio'), { recursive: true })
fsx.writeFileSync(px.join(fuera, 'con espacio', '.env.local'), 'AJENA_FALSA=1\n')
const porUrl = async (url, extra = {}) => {
  const r = await correScript('pruebas/fixtures/lee-env.cjs', { ahora: '2026-10-05T10:00:00Z', env: { RUTA_URL: '1', RUTA_A_LEER: url, ...extra } })
  return r.salida.find(l => /^(LEIDO|ERROR)/.test(l)) ?? ''
}
const base = 'file://' + fsx.realpathSync(fuera)
for (const [desc, url] of [['%2eenv.local', base + '/%2eenv.local'], ['%2E%65nv%2Elocal (todo codificado)', base + '/%2E%65nv%2Elocal'], ['con%20espacio/%2eenv.local (espacio codificado)', base + '/con%20espacio/%2eenv.local']]) {
  const l = await porUrl(url)
  ver(`URL ${desc} a un .env ajeno: DENEGADA`, /DENEGADA/.test(l), l)
}
const remota = await porUrl('file://remoto/ruta/.env.local')
ver('URL file: con host remoto (no se puede comprobar): DENEGADA', /DENEGADA/.test(remota), remota)
const propia = await porUrl('%2eenv.local')
ver('control: el fixture por una URL relativa codificada (%2eenv.local) se lee', /^LEIDO: \d+ bytes/.test(propia), propia)
fsx.rmSync(fuera, { recursive: true, force: true })

titulo('H06 · como termina un script')
const corre = (modo, extra = {}) => correScript('pruebas/fixtures/salidas.cjs', { ahora: '2026-10-05T10:00:00Z', env: { MODO: modo }, ...extra })
const ex = await corre('exit')
ver('process.exit(5): terminoPor exit, codigo 5, y no corre lo de detras', ex.terminoPor === 'exit' && ex.codigo === 5 && !ex.salida.some(l => /DESPUES/.test(l)), JSON.stringify({ t: ex.terminoPor, c: ex.codigo, s: ex.salida }))
const exa = await corre('exit-async')
ver('process.exit(4) dentro de un callback: exit, codigo 4, nada despues', exa.terminoPor === 'exit' && exa.codigo === 4 && !exa.salida.some(l => /DESPUES/.test(l)), JSON.stringify({ t: exa.terminoPor, c: exa.codigo }))
const fi = await corre('final')
ver('veredicto final con process.exitCode = 1: final, codigo 1', fi.terminoPor === 'final' && fi.codigo === 1, JSON.stringify({ t: fi.terminoPor, c: fi.codigo }))
const to = await corre('sin-final', { limiteMs: 300 })
ver('sin veredicto final: timeout, codigo null', to.terminoPor === 'timeout' && to.codigo === null, JSON.stringify({ t: to.terminoPor, c: to.codigo }))
fin()
