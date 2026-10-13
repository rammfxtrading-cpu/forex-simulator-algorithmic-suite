/**
 * MERCADO V1 · DESCARGA AUTORIZADA DE LOS ANUALES (etapa 2; CTO 13-oct:
 * Ramon autoriza los 27 anuales de forex-data, SOLO LECTURA, para la lista
 * real de huecos). Escrito ANTES que el codigo.
 *
 * descargaAnuales({ pares, anios, info, bajar, escribe, relee }) — puertos:
 *   info(par, anio)          → { estado: 'ok', ruta, size, etag, sha256 } | { estado: 'no-existe' } | { estado: 'error', motivo }
 *   bajar(ruta, { tope, sha256 }) → { estado: 'ok', crudo, identidad } | { estado: 'error'|'tope', motivo, shaDistinto? }
 *   escribe(nombre, bytes)   crea el fichero en exclusiva (nunca sobrescribe)
 *   relee(nombre)            → los bytes del disco
 * Por cada fichero: solo el .json.gz; el sha256 de los METADATOS tiene que
 * existir y coincidir con el del cuerpo; se guarda el cuerpo TAL CUAL con su
 * .sha256 y se relee del disco. Lo que no cumpla, no se guarda y se dice.
 */
import { createHash } from 'crypto'
import { gzipSync } from 'zlib'
import { titulo, oraculo, fin, importa } from './lib.mjs'
const D = await importa('lib/mercado/descarga-v1.mjs')
const sha = b => createHash('sha256').update(b).digest('hex')
const cuerpo = (par, anio) => gzipSync(Buffer.from(JSON.stringify([{ time: Date.UTC(anio, 0, 2) / 1000, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }])))
function mundo(cambia = {}) {
  const disco = new Map(), pedidos = []
  const ficheros = { 'EURUSD|2025': cuerpo('EURUSD', 2025), 'EURUSD|2026': cuerpo('EURUSD', 2026) }
  return {
    disco, pedidos,
    info: async (par, anio) => {
      const b = ficheros[`${par}|${anio}`]
      if (!b) return { estado: 'no-existe' }
      const c = cambia[`${par}|${anio}`] ?? {}
      return { estado: 'ok', ruta: c.ruta ?? `${par}/M1/${anio}.json.gz`, size: b.length, etag: 'e', sha256: 'sha256' in c ? c.sha256 : sha(b) }
    },
    bajar: async (ruta, { tope, sha256 }) => {
      pedidos.push({ ruta, tope, sha256 })
      const [par, , f] = ruta.split('/'), b = ficheros[`${par}|${f.slice(0, 4)}`]
      const c = cambia[`${par}|${f.slice(0, 4)}`] ?? {}
      const enviado = c.cuerpo ?? b
      if (sha256 && sha(enviado) !== sha256) return { estado: 'error', shaDistinto: true, motivo: 'sha distinto' }
      return { estado: 'ok', crudo: enviado, identidad: 'sha256' }
    },
    escribe: async (n, b) => { if (disco.has(n)) throw new Error('existe'); disco.set(n, Buffer.from(b)) },
    relee: async n => (cambia.disco?.[n] ? Buffer.from('roto') : disco.get(n)),
  }
}

titulo('1 · lo normal: cuerpo tal cual, sha de los metadatos, .sha256 y relectura')
const m1 = mundo()
const r1 = await D.descargaAnuales({ pares: ['EURUSD'], anios: [2024, 2025, 2026], ...m1 })
oraculo('DES', '2025 y 2026 guardados; 2024 no existe (se dice); sin fallos', r1.fallos.length === 0 && r1.guardados.map(g => g.nombre).join() === 'EURUSD_2025.json.gz,EURUSD_2026.json.gz' && r1.lineas.some(l => /EURUSD 2024: no existe/.test(l)), JSON.stringify(r1.lineas))
oraculo('DES', 'el cuerpo se guarda TAL CUAL y el .sha256 es el suyo (formato sha256sum)', m1.disco.get('EURUSD_2025.json.gz').equals(cuerpo('EURUSD', 2025)) && m1.disco.get('EURUSD_2025.json.gz.sha256').toString() === `${sha(cuerpo('EURUSD', 2025))}  EURUSD_2025.json.gz\n`)
oraculo('DES', 'la descarga va atada a info(): tope = tamaño y etag, y el sha256 de los metadatos', m1.pedidos.every(p => p.tope?.max === p.tope?.size && p.tope?.etag === 'e' && /^[0-9a-f]{64}$/.test(p.sha256)))

titulo('2 · lo que no se guarda')
const casos = [
  ['sin sha256 en los metadatos', { 'EURUSD|2025': { sha256: null } }, /sin sha256/],
  ['el cuerpo no es el de los metadatos', { 'EURUSD|2025': { cuerpo: cuerpo('EURUSD', 2024) } }, /sha/],
  ['un .json viejo en vez de .json.gz', { 'EURUSD|2025': { ruta: 'EURUSD/M1/2025.json' } }, /json\.gz/],
  ['la relectura del disco no coincide', { disco: { 'EURUSD_2025.json.gz': true } }, /relectura/],
]
for (const [que, cambia, msg] of casos) {
  const m = mundo(cambia)
  const r = await D.descargaAnuales({ pares: ['EURUSD'], anios: [2025], ...m })
  oraculo('DES', `${que}: fallo con su motivo y no cuenta como guardado`, r.fallos.length === 1 && msg.test(r.fallos[0]) && r.guardados.length === 0, JSON.stringify(r.fallos))
}
const mE = mundo(); mE.info = async () => ({ estado: 'error', motivo: 'Error HTTP 500' })
const rE = await D.descargaAnuales({ pares: ['EURUSD'], anios: [2025], ...mE })
oraculo('DES', 'info() falla: fallo, sin descargar', rE.fallos.length === 1 && mE.pedidos.length === 0)
fin()
