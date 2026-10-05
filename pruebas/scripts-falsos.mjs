/**
 * EL EJECUTOR DE SCRIPTS (pruebas/script-falso.mjs) SE COMPRUEBA A SI MISMO
 *
 * H05 (revision de Astra, 4-oct): la lectura de un .env ajeno se deniega ANTES
 * DE ABRIR, por cualquier via de fs; el .env.local sintetico de la carpeta
 * temporal si se puede leer.
 * Prueba con pruebas/fixtures/lee-env.cjs. La ruta ajena NO EXISTE: si se
 * abriera, el error seria ENOENT; denegada antes de abrir, dice DENEGADA.
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
fin()
