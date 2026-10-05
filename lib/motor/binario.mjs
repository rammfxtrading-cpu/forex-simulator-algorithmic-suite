// lib/motor/binario.mjs — el trozo binario diario del mercado (especificacion
// v2.1, § 7.2, § 12.5; Astra V2-04). Un trozo = un par y un dia UTC, y se
// decodifica SOLO: la cabecera lleva anclas absolutas de tiempo y de precio.
// Puro. Nada en uso lo importa (el mercado v1 en trozos es un paso posterior).
//
// Cabecera (18 bytes, little-endian):
//   0  'SIMV'   4  version u8 (1)   5  digitos u8   6  reservado u16 (0)
//   8  dia u32 (segundos, 00:00 UTC)   12  ancla u32 (ticks: open de la 1.ª vela)
//   16 n u16 (≤ 1.440)
// Por vela (26 bytes):
//   0  minuto del dia u16   2  open − (cierre anterior | ancla) i32
//   6  high − open i32      10 open − low i32      14 close − open i32
//   18 volumen float64: sin perdida (el SDK lo entrega con decimales: un
//      uint32 truncaba 0,25 a 0)
// Velas de entrada/salida: { time (s), open, high, low, close (ticks BigInt), volume (number) }
import { createHash } from 'crypto'
import { instrumento } from './instrumentos.mjs'

export const VERSION = 1
const MAGIA = 'SIMV'
const CABECERA = 18, REGISTRO = 26, DIA = 86400
const I32 = x => { const n = Number(x); if (!Number.isSafeInteger(n) || n < -2147483648 || n > 2147483647) throw new RangeError(`diferencia fuera de i32: ${x}`); return n }

export function codifica(par, dia, velas) {
  const { digitos } = instrumento(par)
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
  const b = Buffer.alloc(CABECERA + REGISTRO * velas.length)
  b.write(MAGIA, 0, 'latin1')
  b.writeUInt8(VERSION, 4)
  b.writeUInt8(digitos, 5)
  b.writeUInt16LE(0, 6)
  b.writeUInt32LE(dia, 8)
  const ancla = velas.length ? velas[0].open : 0n
  if (ancla > 0xffffffffn) throw new RangeError('ancla fuera de u32')
  b.writeUInt32LE(Number(ancla), 12)
  b.writeUInt16LE(velas.length, 16)
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
  return b
}

export function decodifica(buf) {
  const b = Buffer.from(buf)
  if (b.length < CABECERA || b.subarray(0, 4).toString('latin1') !== MAGIA) throw new RangeError('no es un trozo SIMV')
  const version = b.readUInt8(4)
  if (version !== VERSION) throw new RangeError(`version de trozo desconocida: ${version}`)
  const digitos = b.readUInt8(5), dia = b.readUInt32LE(8), n = b.readUInt16LE(16)
  if (n > 1440 || b.length !== CABECERA + REGISTRO * n) throw new RangeError(`trozo truncado o de tamaño incoherente (${b.length} bytes para ${n} velas)`)
  let ref = BigInt(b.readUInt32LE(12))
  const velas = []
  for (let i = 0; i < n; i++) {
    const o = CABECERA + REGISTRO * i
    const open = ref + BigInt(b.readInt32LE(o + 2))
    const v = { time: dia + 60 * b.readUInt16LE(o), open, high: open + BigInt(b.readInt32LE(o + 6)), low: open - BigInt(b.readInt32LE(o + 10)), close: open + BigInt(b.readInt32LE(o + 14)), volume: b.readDoubleLE(o + 18) }
    velas.push(v)
    ref = v.close
  }
  return { version, digitos, dia, velas }
}

// sha256 del trozo: va en su nombre y en el manifiesto (§ 7.3)
export const huella = buf => createHash('sha256').update(Buffer.from(buf)).digest('hex')
