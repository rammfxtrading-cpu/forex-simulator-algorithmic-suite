// LA HUELLA DE LA CARTERA (orden 1-182 del CTO; PSIMM3-01, la 3.ª vez de la familia PSIMM1-01 → PSIMM2-01 → PSIMM3-01).
// La regla, por principio: la pantalla v1 solo acepta una cartera COMPLETA y VERIFICADA. El servidor (lib/servidor/estado.mjs)
// manda, junto al estado, su huella; el cliente (cliente.js) la recalcula sobre lo que le ha llegado y, si no cuadra, la
// lectura es FALLIDA (aviso, bloqueo y reintentos: nunca se instala ni fija version).
//   huella = { esquema: 'sim-huella@1', version, posiciones: nº, ordenes: nº, ids: sha256 hex, contenido: sha256 hex }
//   ids       = sha256 de `sim-huella@1|v=<version>|p=<id,id,…>|o=<id,id,…>` (los ids en el orden de sus listas): la version
//               va DENTRO del hash, asi una version cambiada con el contenido de otra no cuadra (el contrato de la 1-182)
//   contenido = sha256 de `sim-huella@1|v=<version>|<JSON del estado>` (JSON.stringify, el orden de claves tal como viaja).
//               AÑADIDO a la 1-182 (medido en v1c19): con solo los ids, un cursor, un horizonte o un precio cambiados en la
//               misma version pasaban la huella y la pantalla se quedaba sin el fill, sin aviso. JSON.parse + JSON.stringify
//               reproduce el mismo texto en el navegador y en el servidor (los dos son JS: mismo orden y mismos numeros)
// La cartera es la raiz (sim-cartera@1) o, en un reto, su motor (reto@1 → motor). Un modulo, el mismo en los dos lados: sin
// dependencias (ni node:crypto ni crypto.subtle, que es asincrono): un SHA-256 en JS, comprobado contra node:crypto en
// pruebas/aceptacion/v1c19-huella-generativa.mjs.
// LIMITE (declarado): la huella prueba que la respuesta esta completa y es la que el servidor calculo; no defiende de un
// servidor que mienta con una huella recalculada (eso no es una respuesta incompleta, es otro estado).
export const ESQUEMA_HUELLA = 'sim-huella@1'

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
const rotr = (x, n) => (x >>> n) | (x << (32 - n))
// SHA-256 (FIPS 180-4) de un texto en UTF-8 → hex
export function sha256Hex(texto) {
  const datos = new TextEncoder().encode(String(texto))
  const n = datos.length, bloques = Math.ceil((n + 9) / 64)
  const m = new Uint8Array(bloques * 64)
  m.set(datos); m[n] = 0x80
  const bits = n * 8
  const dv = new DataView(m.buffer)
  dv.setUint32(m.length - 8, Math.floor(bits / 0x100000000)); dv.setUint32(m.length - 4, bits >>> 0)
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  for (let b = 0; b < bloques; b++) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(b * 64 + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, bb, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0
    }
    H[0] += a; H[1] += bb; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h
  }
  return [...H].map(x => x.toString(16).padStart(8, '0')).join('')
}

// la cartera de un estado guardado (la raiz o el motor de un reto@1); null si no hay
export const carteraDeEstado = e => (e?.esquema === 'reto@1' ? e.motor ?? null : e ?? null)

// la huella de un estado en una version; null si el estado no tiene las dos listas con ids de texto
export function huellaDe(version, estado) {
  const c = carteraDeEstado(estado)
  if (!Number.isInteger(version) || !c || !Array.isArray(c.posiciones) || !Array.isArray(c.ordenes)) return null
  const p = c.posiciones.map(x => x?.id), o = c.ordenes.map(x => x?.id)
  if (![...p, ...o].every(id => typeof id === 'string' && id.length > 0 && !id.includes(','))) return null
  return { esquema: ESQUEMA_HUELLA, version, posiciones: p.length, ordenes: o.length, ids: sha256Hex(`${ESQUEMA_HUELLA}|v=${version}|p=${p.join(',')}|o=${o.join(',')}`),
    contenido: sha256Hex(`${ESQUEMA_HUELLA}|v=${version}|${JSON.stringify(estado)}`) }
}

// ¿la huella recibida es la de este estado en esta version? (todos sus campos, exactos)
export function huellaCuadra(huella, version, estado) {
  if (huella == null || typeof huella !== 'object' || Array.isArray(huella)) return false
  const h = huellaDe(version, estado)
  return h != null && Object.keys(huella).length === 6 && huella.esquema === h.esquema && huella.version === h.version && huella.posiciones === h.posiciones && huella.ordenes === h.ordenes && huella.ids === h.ids && huella.contenido === h.contenido
}
