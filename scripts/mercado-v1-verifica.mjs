// MERCADO V1 · VERIFICADOR (etapa 2; diseño sim-004 p.9). SOLO LECTURA.
//
//   node scripts/mercado-v1-verifica.mjs [--base DIR | --descarga-autorizada] [--pares EURUSD]
// Por par: cadena de manifiestos, cada trozo (sha, brotli, decodifica), cobertura,
// huecos aceptados, ancla de aceptaciones, los datos dia a dia y los tamaños.
// Sin datos con que comparar: «no comprobado» (codigo 3).
// Codigos: 0 todo bien · 1 problemas · 3 sin comprobar · 4 uso. La logica: lib/mercado/orden-v1.mjs.
import { frontera } from '../lib/mercado/frontera-cli.mjs'
import { ordenVerifica } from '../lib/mercado/orden-v1.mjs'
import { dependencias } from './mercado-v1-dependencias.mjs'

await frontera('verificador', async () => {
  const r = await ordenVerifica(process.argv.slice(2), dependencias())
  for (const l of r.lineas) console.log(l)
  process.exitCode = r.codigo
})
