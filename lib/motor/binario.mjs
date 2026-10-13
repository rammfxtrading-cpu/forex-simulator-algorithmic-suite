// lib/motor/binario.mjs — el trozo binario diario del mercado (especificacion
// v2.1, § 7.2, § 12.5; Astra V2-04). Un trozo = un par y un dia UTC, y se
// decodifica SOLO: la cabecera lleva anclas absolutas de tiempo y de precio.
// Puro. Nada en uso lo importa (el mercado v1 en trozos es un paso posterior).
// Version 2 (etapa 2; diseño sim-004 h.2, S4-03, S4-11, p.1): los huecos
// aceptados del dia van DENTRO del trozo, ligados por su sha; la version 1 no
// se publico nunca y ya no se lee.
//
// Cabecera (20 bytes, little-endian):
//   0  'SIMV'   4  version u8 (2)   5  digitos u8   6  reservado u16 (0)
//   8  dia u32 (segundos, 00:00 UTC)   12  ancla u32 (ticks: open de la 1.ª vela)
//   16 n u16 (≤ 1.440)   18 h u8 (huecos, ≤ 64)   19 reservado u8 (0)
// Por vela (26 bytes):
//   0  minuto del dia u16   2  open − (cierre anterior | ancla) i32
//   6  high − open i32      10 open − low i32      14 close − open i32
//   18 volumen float64: sin perdida (el SDK lo entrega con decimales: un
//      uint32 truncaba 0,25 a 0)
// Por hueco aceptado (6 bytes, despues de las velas):
//   0  minuto del dia u16 (su primer minuto ausente)   2  minutos u16 (16..2.879)
//   4  motivo u8 (0 festivo, 1 cambio_de_sesion, 2 corte_del_proveedor)   5  0 u8
//   Ordenados, sin solaparse, ninguna vela del trozo dentro, y sin pasar de la
//   ultima vela posible del dia siguiente (minuto + minutos ≤ 2.879).
// Velas de entrada/salida: { time (s), open, high, low, close (ticks BigInt), volume (number) }
// Huecos de entrada/salida: { inicio: 'AAAA-MM-DDTHH:MMZ', minutos, motivo }
import { createHash } from 'crypto'
import { instrumento, INSTRUMENTOS } from './instrumentos.mjs'

export const VERSION = 2
const MAGIA = 'SIMV'
const CABECERA = 20, REGISTRO = 26, REG_HUECO = 6, DIA = 86400
export const MAX_HUECOS = 64
const MOTIVOS = ['festivo', 'cambio_de_sesion', 'corte_del_proveedor']   // = MOTIVOS_HUECO del manifiesto, por su indice
const HUECO_MIN = 16, HUECO_MAX = 2879
const hhmmZ = s => new Date(s * 1000).toISOString().slice(0, 16) + 'Z'
const I32 = x => { const n = Number(x); if (!Number.isSafeInteger(n) || n < -2147483648 || n > 2147483647) throw new RangeError(`diferencia fuera de i32: ${x}`); return n }

// C6-06 (Astra, cierres-6): las MISMAS invariantes al codificar y al
// decodificar: un hash correcto no certifica un mercado valido.
// digitos: los de los instrumentos (lib/motor/instrumentos.mjs)
const DIGITOS_VALIDOS = new Set(Object.values(INSTRUMENTOS).map(i => i.digitos))
function validaDia(dia, velas) {
  if (!Number.isInteger(dia) || dia % DIA !== 0) throw new RangeError('dia: segundos de las 00:00 UTC')
  if (velas.length > 1440) throw new RangeError('mas de 1.440 velas en un dia')
  let previoMin = -1
  for (const v of velas) {
    const min = (v.time - dia) / 60
    if (!Number.isInteger(min) || min < 0 || min >= 1440) throw new RangeError(`vela fuera del dia: ${v.time}`)
    if (min <= previoMin) throw new RangeError(`vela desordenada o repetida: ${v.time}`)
    previoMin = min
    if (![v.open, v.high, v.low, v.close].every(x => typeof x === 'bigint' && x > 0n)) throw new RangeError(`precios en ticks positivos: ${v.time}`)
    const max = v.open > v.close ? v.open : v.close, minp = v.open < v.close ? v.open : v.close
    if (v.high < max || v.low > minp) throw new RangeError(`OHLC incoherente: ${v.time}`)
    if (typeof v.volume !== 'number' || !Number.isFinite(v.volume) || v.volume < 0) throw new RangeError(`volumen no valido: ${v.time}`)
  }
}
// los huecos ya como { min, minutos, m (indice del motivo) }
function validaHuecos(dia, velas, hs) {
  if (hs.length > MAX_HUECOS) throw new RangeError(`mas de ${MAX_HUECOS} huecos en un dia`)
  const minutosVela = velas.map(v => (v.time - dia) / 60)
  let finPrevio = -1
  for (const h of hs) {
    if (!Number.isInteger(h.min) || h.min < 0 || h.min >= 1440) throw new RangeError(`hueco fuera del dia: minuto ${h.min}`)
    if (!Number.isInteger(h.minutos) || h.minutos < HUECO_MIN || h.minutos > HUECO_MAX || h.min + h.minutos > HUECO_MAX) throw new RangeError(`hueco ${hhmmZ(dia + 60 * h.min)}: minutos fuera de ${HUECO_MIN}..${HUECO_MAX} (${h.minutos})`)
    if (!(h.m >= 0 && h.m < MOTIVOS.length)) throw new RangeError(`hueco ${hhmmZ(dia + 60 * h.min)}: motivo no valido`)
    if (h.min < finPrevio) throw new RangeError(`hueco ${hhmmZ(dia + 60 * h.min)}: desordenado o solapado`)
    finPrevio = h.min + h.minutos
    if (minutosVela.some(m => m >= h.min && m < h.min + h.minutos)) throw new RangeError(`hueco ${hhmmZ(dia + 60 * h.min)}: tapa una vela del trozo`)
  }
}

export function codifica(par, dia, velas, huecos = []) {
  const { digitos } = instrumento(par)
  validaDia(dia, velas)
  if (!Array.isArray(huecos)) throw new RangeError('huecos: una lista')
  const hs = huecos.map(h => {
    const t = Date.parse(h?.inicio ?? '') / 1000
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(h?.inicio ?? '') || hhmmZ(t) !== h.inicio) throw new RangeError(`hueco: inicio no es AAAA-MM-DDTHH:MMZ (${h?.inicio})`)
    if (t < dia || t >= dia + DIA) throw new RangeError(`hueco ${h.inicio}: no empieza en este dia`)
    if (!MOTIVOS.includes(h.motivo)) throw new RangeError(`hueco ${h.inicio}: motivo no valido (${h.motivo})`)
    return { min: (t - dia) / 60, minutos: h.minutos, m: MOTIVOS.indexOf(h.motivo) }
  })
  validaHuecos(dia, velas, hs)
  const b = Buffer.alloc(CABECERA + REGISTRO * velas.length + REG_HUECO * hs.length)
  b.write(MAGIA, 0, 'latin1')
  b.writeUInt8(VERSION, 4)
  b.writeUInt8(digitos, 5)
  b.writeUInt16LE(0, 6)
  b.writeUInt32LE(dia, 8)
  const ancla = velas.length ? velas[0].open : 0n
  if (ancla > 0xffffffffn) throw new RangeError('ancla fuera de u32')
  b.writeUInt32LE(Number(ancla), 12)
  b.writeUInt16LE(velas.length, 16)
  b.writeUInt8(hs.length, 18)
  b.writeUInt8(0, 19)
  let ref = ancla
  velas.forEach((v, i) => {
    const o = CABECERA + REGISTRO * i
    b.writeUInt16LE((v.time - dia) / 60, o)
    b.writeInt32LE(I32(v.open - ref), o + 2)
    b.writeInt32LE(I32(v.high - v.open), o + 6)
    b.writeInt32LE(I32(v.open - v.low), o + 10)
    b.writeInt32LE(I32(v.close - v.open), o + 14)
    b.writeDoubleLE(v.volume, o + 18)
    ref = v.close
  })
  hs.forEach((h, i) => {
    const o = CABECERA + REGISTRO * velas.length + REG_HUECO * i
    b.writeUInt16LE(h.min, o)
    b.writeUInt16LE(h.minutos, o + 2)
    b.writeUInt8(h.m, o + 4)
    b.writeUInt8(0, o + 5)
  })
  return b
}

export function decodifica(buf) {
  const b = Buffer.from(buf)
  if (b.length < CABECERA || b.subarray(0, 4).toString('latin1') !== MAGIA) throw new RangeError('no es un trozo SIMV')
  const version = b.readUInt8(4)
  if (version !== VERSION) throw new RangeError(`version de trozo desconocida: ${version}`)
  const digitos = b.readUInt8(5), dia = b.readUInt32LE(8), n = b.readUInt16LE(16), nh = b.readUInt8(18)
  if (n > 1440 || nh > MAX_HUECOS || b.length !== CABECERA + REGISTRO * n + REG_HUECO * nh) throw new RangeError(`trozo truncado o de tamaño incoherente (${b.length} bytes para ${n} velas y ${nh} huecos)`)
  if (!DIGITOS_VALIDOS.has(digitos)) throw new RangeError(`escala no valida: ${digitos} digitos`)
  if (b.readUInt16LE(6) !== 0 || b.readUInt8(19) !== 0) throw new RangeError('cabecera: reservado distinto de 0')
  let ref = BigInt(b.readUInt32LE(12))
  const velas = []
  for (let i = 0; i < n; i++) {
    const o = CABECERA + REGISTRO * i
    const open = ref + BigInt(b.readInt32LE(o + 2))
    const v = { time: dia + 60 * b.readUInt16LE(o), open, high: open + BigInt(b.readInt32LE(o + 6)), low: open - BigInt(b.readInt32LE(o + 10)), close: open + BigInt(b.readInt32LE(o + 14)), volume: b.readDoubleLE(o + 18) }
    velas.push(v)
    ref = v.close
  }
  validaDia(dia, velas)
  const hs = []
  for (let i = 0; i < nh; i++) {
    const o = CABECERA + REGISTRO * n + REG_HUECO * i
    if (b.readUInt8(o + 5) !== 0) throw new RangeError('hueco: reservado distinto de 0')
    hs.push({ min: b.readUInt16LE(o), minutos: b.readUInt16LE(o + 2), m: b.readUInt8(o + 4) })
  }
  validaHuecos(dia, velas, hs)
  const huecos = hs.map(h => ({ inicio: hhmmZ(dia + 60 * h.min), minutos: h.minutos, motivo: MOTIVOS[h.m] }))
  return { version, digitos, dia, velas, huecos }
}

// sha256 del trozo: va en su nombre y en el manifiesto (§ 7.3)
export const huella = buf => createHash('sha256').update(Buffer.from(buf)).digest('hex')
