/**
 * MERCADO V1 · CONFIRMAR LA COPIA DEL 5-OCT DE 2024–2025 SIN DESCARGARLA (etapa 2;
 * CTO 14-oct, decision 1, opcion a). Escrito ANTES que el codigo.
 *
 * lib/mercado/copia-v1.mjs confirmaCopia({ pares, anios, info, listado, copia, dia }):
 * por cada anual, una consulta info() de SOLO LECTURA (inyectada) y:
 *   · lo vigente es el .json del listado del 4-oct (no hay .json.gz encima);
 *   · su tamaño es el del listado y el de la copia local;
 *   · alguna fecha de info() cae en el dia del listado (el 20-jul); si no trae
 *     ninguna fecha, NO se da por comprobado;
 *   · la copia local cuadra con su .sha256.
 * Cualquier discrepancia es un fallo (codigo 1: «para y avisa»); se enseñan las
 * fechas de info() tal cual (no son secretos) y si coinciden al milisegundo.
 */
import { titulo, oraculo, fin, importa } from './lib.mjs'
const C = await importa('lib/mercado/copia-v1.mjs')
const listado = [
  { ruta: 'EURUSD/M1/2024.json', bytes: 100, actualizado: '2026-07-20T21:48:31.576Z' },
  { ruta: 'EURUSD/M1/2025.json', bytes: 200, actualizado: '2026-07-20T21:48:34.519Z' },
]
const infoBien = { 'EURUSD/M1/2024.json': { size: 100, lastModified: '2026-07-20T21:48:31.576Z' }, 'EURUSD/M1/2025.json': { size: 200, lastModified: '2026-07-20T21:48:35.001Z', createdAt: '2025-01-01T00:00:00.000Z' } }
const info = (tabla, vigentes = {}) => async (par, anio) => {
  const r = vigentes[`${par}|${anio}`] ?? `${par}/M1/${anio}.json`
  const d = tabla[r]; return d ? { estado: 'ok', ruta: r, size: d.size, fechas: Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'size')) } : { estado: 'no-existe' }
}
const copiaBien = { 'EURUSD_2024.json': { bytes: 100, shaOk: true }, 'EURUSD_2025.json': { bytes: 200, shaOk: true } }
const corre = (o = {}) => C.confirmaCopia({ pares: ['EURUSD'], anios: [2024, 2025], info: info(infoBien), listado, copia: async n => copiaBien[n] ?? null, dia: '2026-07-20', ...o })
const t = r => r.lineas.join('\n')

titulo('1 · todo cuadra')
const r1 = await corre()
oraculo('COP', 'los dos anuales: sin fallos; dice tamaño, fecha (identica al ms en 2024, mismo dia en 2025) y sha de la copia', r1.fallos.length === 0 && r1.confirmados.length === 2 && /EURUSD 2024: .*100 bytes.*identica/.test(t(r1)) && /EURUSD 2025: .*200 bytes.*mismo dia/.test(t(r1)) && /sha256 de la copia: ok/.test(t(r1)), t(r1))
oraculo('COP', 'enseña las fechas de info() tal cual (campo = valor)', /lastModified=2026-07-20T21:48:35.001Z/.test(t(r1)) && /createdAt=2025-01-01/.test(t(r1)), t(r1))

titulo('2 · lo que para')
const casos = [
  ['otro tamaño en info()', { info: info({ ...infoBien, 'EURUSD/M1/2024.json': { size: 101, lastModified: '2026-07-20T21:48:31.576Z' } }) }, /2024.*tamaño/],
  ['otra fecha (actualizado despues)', { info: info({ ...infoBien, 'EURUSD/M1/2025.json': { size: 200, lastModified: '2026-10-12T03:00:00.000Z' } }) }, /2025.*fecha/],
  ['info() sin ninguna fecha', { info: info({ ...infoBien, 'EURUSD/M1/2025.json': { size: 200 } }) }, /2025.*sin fecha/],
  ['lo vigente es otro (un .json.gz encima)', { info: info({ ...infoBien, 'EURUSD/M1/2024.json.gz': { size: 50, lastModified: '2026-10-13T00:00:00Z' } }, { 'EURUSD|2024': 'EURUSD/M1/2024.json.gz' }) }, /2024.*vigente/],
  ['no existe', { info: info({ 'EURUSD/M1/2025.json': infoBien['EURUSD/M1/2025.json'] }) }, /2024.*no existe/],
  ['info() con error', { info: async () => ({ estado: 'error', motivo: 'Error otro' }) }, /info\(\) no se pudo leer/],
  ['la copia local no esta', { copia: async n => (n === 'EURUSD_2025.json' ? null : copiaBien[n]) }, /2025.*copia/],
  ['la copia local no cuadra con su .sha256', { copia: async n => (n === 'EURUSD_2024.json' ? { bytes: 100, shaOk: false } : copiaBien[n]) }, /2024.*sha256/],
  ['la copia local mide otra cosa', { copia: async n => (n === 'EURUSD_2024.json' ? { bytes: 99, shaOk: true } : copiaBien[n]) }, /2024.*copia/],
  ['un anual que no esta en el listado del 4-oct', { anios: [2024, 2025, 2023] }, /2023.*listado/],
]
for (const [que, o, re] of casos) {
  const r = await corre(o)
  oraculo('COP', `${que}: fallo que lo dice`, r.fallos.length >= 1 && re.test(r.fallos.join('\n')), r.fallos.join(' / ') || t(r))
}
fin()
