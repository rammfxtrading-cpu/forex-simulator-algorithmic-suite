// dukascopy-node FALSO: el proveedor de velas. Ninguna prueba llama al real.
// Estado en globalThis.__proveedor:
//   proveedor.responde(args) → lo que devolveria getHistoricalRates (un array de
//                             {timestamp(ms), open, high, low, close, volume}),
//                             o lanza; sin programar, lanza
//   proveedor.pausa(args)    → una promesa que retiene esa descarga (carreras)
//   proveedor.llamadas       → cada llamada: { instrumento, desde, hasta }
export const proveedor = globalThis.__proveedor ??= { responde: null, pausa: null, llamadas: [] }
export function resetProveedor() { proveedor.responde = null; proveedor.pausa = null; proveedor.vacioComoSDK = false; proveedor.llamadas.length = 0 }
export async function getHistoricalRates(args) {
  proveedor.llamadas.push({ instrumento: args.instrument, desde: args.dates?.from?.toISOString?.(), hasta: args.dates?.to?.toISOString?.() })
  await new Promise(r => setImmediate(r))
  if (proveedor.pausa) await proveedor.pausa(args)
  if (!proveedor.responde) throw new Error('proveedor-falso: ninguna respuesta programada')
  const r = await proveedor.responde(args)
  // proveedor.vacioComoSDK (OPCIONAL, lo declara la prueba): como dukascopy-node
  // 1.46.4 (dist/index.js:16643-16666), con retryOnEmpty y reintentos una
  // respuesta VACIA agota los reintentos y lanza «Unknown error». Sin
  // declararlo, el doble devuelve [] (las reproducciones historicas cuentan con eso).
  if (proveedor.vacioComoSDK && args.retryOnEmpty && (args.retryCount ?? 0) > 0 && Array.isArray(r) && r.length === 0) throw new Error('Unknown error')
  return r
}
export default { getHistoricalRates }

// Velas M1 de un dia UTC (para programar respuestas): `n` velas desde las 00:00
// de `dia` ('AAAA-MM-DD'), precio plano `px`, timestamp en ms como dukascopy-node.
export function diaM1(dia, n = 1440, px = 1.1) {
  const t0 = Date.parse(dia + 'T00:00:00Z')
  return Array.from({ length: n }, (_, i) => ({ timestamp: t0 + i * 60000, open: px, high: px, low: px, close: px, volume: 1 }))
}
