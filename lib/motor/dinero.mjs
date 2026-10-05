// lib/motor/dinero.mjs — dinero en µUSD enteros (especificacion v2.1, § 3.7,
// § 12.5, § 12.10). Puro.
//   · redondeo al µ: al mas cercano; mitades exactas AL PAR (CTO, 5-oct-2026)
//   · P&L racional redondeado al µ con RESIDUO POR POSICION: cada cierre
//     parcial lleva round(exacto acumulado) − lo ya redondeado, asi que los
//     parciales suman exactamente lo mismo que el cierre completo
//   · comision: entera al abrir (lotes × comision_lote_µ); cada cierre
//     ASIGNA su parte (hacia abajo al µ) y el ultimo cierre, el remanente
import { R, por, suma, compara } from './racional.mjs'

const MILLON = R(1_000_000n)

// racional → entero mas cercano; mitades exactas al par
export function redondeaAlPar(q) {
  const { n, d } = q
  let ent = n / d                      // trunca hacia 0
  let resto = n - ent * d              // mismo signo que n
  if (resto === 0n) return ent
  const s = n < 0n ? -1n : 1n
  const dos = 2n * (resto < 0n ? -resto : resto)
  if (dos > d || (dos === d && (ent % 2n !== 0n))) ent += s
  return ent
}

// USD (racional) → µUSD (BigInt)
export const usdAMicro = usd => redondeaAlPar(por(usd, MILLON))

// comision cobrada al abrir: lotesC en centesimas
export const comisionApertura = (costes, lotesC) => (costes.comision_lote_µ * lotesC) / 100n

// la parte de comision que asigna un cierre; el ultimo (deja 0 lotes) lleva
// el remanente, de modo que lo asignado suma exactamente lo cobrado
export function asignaComision({ devengada_µ, asignada_µ, lotesIniciales, cerradosAntes, lotesCierre }) {
  if (cerradosAntes + lotesCierre > lotesIniciales) throw new RangeError('se cierran mas lotes de los abiertos')
  if (cerradosAntes + lotesCierre === lotesIniciales) return devengada_µ - asignada_µ
  return (devengada_µ * lotesCierre) / lotesIniciales     // hacia abajo (positivos)
}

// un cierre con residuo por posicion. exactoPrevio: P&L exacto (USD) de lo ya
// cerrado; redondeadoPrevio_µ: lo ya asignado en µ; exactoCierre: el de este
// cierre. → { pnl_µ, exactoTotal, redondeadoTotal_µ }
export function cierreConResiduo({ exactoPrevio, redondeadoPrevio_µ, exactoCierre }) {
  const exactoTotal = suma(exactoPrevio, exactoCierre)
  const redondeadoTotal_µ = usdAMicro(exactoTotal)
  return { pnl_µ: redondeadoTotal_µ - redondeadoPrevio_µ, exactoTotal, redondeadoTotal_µ }
}

export const menorQue = (a, b) => compara(a, b) < 0
