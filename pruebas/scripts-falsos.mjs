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
