/**
 * MOTOR · PIEZA 3: EL TROZO BINARIO DIARIO DEL MERCADO (especificacion v2.1,
 * § 7.2, § 12.5; Astra V2-04). Escrito ANTES que el codigo.
 *
 * Un trozo = un par y un dia UTC, que se decodifica SOLO (sin el dia anterior):
 *   cabecera 18 bytes: 'SIMV' · version u8 (1) · digitos u8 · 0 u16 ·
 *                      dia u32 (segundos, 00:00 UTC) · ancla u32 (ticks: open
 *                      de la primera vela) · n u16 (≤ 1.440)
 *   por vela 26 bytes: minuto u16 · open−(cierre anterior | ancla) i32 ·
 *                      high−open i32 · open−low i32 · close−open i32 ·
 *                      volumen float64 (sin perdida: el SDK lo da con
 *                      decimales; un uint32 truncaba 0,25 a 0)
 * ORACULOS: ida y vuelta identica (precios en ticks y volumen exacto, 0,25
 * incluido); el trozo no depende del dia anterior; tamaño 18 + 26·n; JPY con 3
 * digitos; dia vacio; y se rechazan: vela fuera del dia, desordenada o
 * repetida, OHLC incoherente, mas de 1.440, magia o version ajenas, trozo
 * truncado.
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
const B = await importa('lib/motor/binario.mjs')
const M = await importa('lib/motor/motor.mjs')
const lanza = f => { try { f(); return false } catch { return true } }
const DIA = Date.parse('2026-03-03T00:00:00Z') / 1000
const fila = (min, o, h, l, c, vol) => ({ time: DIA + 60 * min, open: o, high: h, low: l, close: c, volume: vol })
const eur = M.velas('EURUSD', [fila(0, '1.08000', '1.08010', '1.07990', '1.08005', 0), fila(1, '1.08005', '1.08020', '1.08000', '1.08015', 0.25), fila(5, '1.08100', '1.08100', '1.08050', '1.08060', 1234.5678)])
  .map((v, i) => ({ ...v, volume: [0, 0.25, 1234.5678][i] }))
const igual = (a, b) => a.length === b.length && a.every((v, i) => v.time === b[i].time && v.open === b[i].open && v.high === b[i].high && v.low === b[i].low && v.close === b[i].close && Object.is(v.volume, b[i].volume))

titulo('1 · ida y vuelta')
const buf = B.codifica('EURUSD', DIA, eur)
const dec = B.decodifica(buf)
oraculo('BIN', 'EURUSD: velas identicas al volver (ticks y volumen 0, 0,25 y 1.234,5678 exactos)', igual(dec.velas, eur) && dec.dia === DIA && dec.digitos === 5, JSON.stringify(dec.velas.map(v => v.volume)))
oraculo('BIN', 'tamaño = 18 + 26 · n (3 velas → 96 bytes)', buf.length === 18 + 26 * 3, buf.length)
oraculo('BIN', 'cabecera: SIMV, version 1, ancla = open de la primera vela (108.000 ticks)', buf.subarray(0, 4).toString('latin1') === 'SIMV' && buf[4] === 1 && buf.readUInt32LE(12) === 108000)
const jpy = M.velas('USDJPY', [fila(0, '150.000', '150.050', '149.980', '150.020', 2), fila(1, '150.020', '150.020', '149.900', '149.950', 3.5)]).map((v, i) => ({ ...v, volume: [2, 3.5][i] }))
oraculo('BIN', 'USDJPY (3 digitos) ida y vuelta', igual(B.decodifica(B.codifica('USDJPY', DIA, jpy)).velas, jpy) && B.decodifica(B.codifica('USDJPY', DIA, jpy)).digitos === 3)
const vacio = B.decodifica(B.codifica('EURUSD', DIA, []))
oraculo('BIN', 'un dia sin velas: 18 bytes, se decodifica a 0 velas', B.codifica('EURUSD', DIA, []).length === 18 && vacio.velas.length === 0 && vacio.dia === DIA)

titulo('2 · el trozo se decodifica solo')
const otroDia = M.velas('EURUSD', [fila(1440, '1.20000', '1.20000', '1.20000', '1.20000', 1)]).map(v => ({ ...v, volume: 1 }))
const solo = B.decodifica(B.codifica('EURUSD', DIA + 86400, otroDia))
oraculo('BIN', 'un trozo con un ancla muy lejana del dia anterior se lee sin el (anclas absolutas)', igual(solo.velas, otroDia))

titulo('3 · lo que se rechaza')
const malas = {
  'vela fuera del dia': [fila(1440, '1.08', '1.08', '1.08', '1.08', 0)],
  'desordenada': [fila(2, '1.08', '1.08', '1.08', '1.08', 0), fila(1, '1.08', '1.08', '1.08', '1.08', 0)],
  'repetida': [fila(1, '1.08', '1.08', '1.08', '1.08', 0), fila(1, '1.08', '1.08', '1.08', '1.08', 0)],
}
for (const [desc, filas] of Object.entries(malas)) oraculo('BIN', `codificar rechaza: ${desc}`, lanza(() => B.codifica('EURUSD', DIA, filas.map(f => ({ time: f.time, open: 108000n, high: 108000n, low: 108000n, close: 108000n, volume: 0 })))))
oraculo('BIN', 'codificar rechaza OHLC incoherente (high < open)', lanza(() => B.codifica('EURUSD', DIA, [{ time: DIA, open: 108000n, high: 107000n, low: 107000n, close: 107500n, volume: 0 }])))
oraculo('BIN', 'codificar rechaza un volumen no finito o negativo', lanza(() => B.codifica('EURUSD', DIA, [{ ...eur[0], volume: NaN }])) && lanza(() => B.codifica('EURUSD', DIA, [{ ...eur[0], volume: -1 }])))
const roto = Buffer.from(buf); roto.write('XXXX', 0, 'latin1')
const vers = Buffer.from(buf); vers[4] = 2
oraculo('BIN', 'decodificar rechaza magia ajena, version desconocida y trozo truncado', lanza(() => B.decodifica(roto)) && lanza(() => B.decodifica(vers)) && lanza(() => B.decodifica(buf.subarray(0, buf.length - 1))))
oraculo('BIN', 'la huella (sha256) del trozo identifica su contenido', B.huella(buf) === B.huella(Buffer.from(buf)) && B.huella(buf) !== B.huella(B.codifica('EURUSD', DIA, eur.slice(0, 2))) && /^[0-9a-f]{64}$/.test(B.huella(buf)))
fin()
