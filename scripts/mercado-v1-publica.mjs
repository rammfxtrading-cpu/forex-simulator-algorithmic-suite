// MERCADO V1 · PUBLICADOR (etapa 2; diseño sim-004 p.4–p.9; CTO 13-oct).
// SIMULACRO POR DEFECTO: sin --publica no escribe nada en Storage.
//
//   node scripts/mercado-v1-publica.mjs --base ~/copias-suite/2026-10-05-mercado --informe /ruta/informe.md
//     simulacro con la copia local; sin leer Storage
//   ... --vigente                  simulacro desde el puntero publicado (solo lectura; claves)
//   ... --descarga-autorizada      los anuales de forex-data en vez de la copia (CTO 5-oct:
//                                  hasta el 2-nov, solo con su si)
//   ... --publica [--anota]        PUBLICA en el bucket privado «mercado» (claves); --anota
//                                  añade las publicaciones al fichero de aceptaciones (commit)
// Codigos: 0 bien · 1 incidente · 3 sin terminar · 4 uso. La logica: lib/mercado/orden-v1.mjs.
import { frontera } from '../lib/mercado/frontera-cli.mjs'
import { ordenPublica } from '../lib/mercado/orden-v1.mjs'
import { dependencias } from './mercado-v1-dependencias.mjs'

await frontera('publicador', async () => {
  const r = await ordenPublica(process.argv.slice(2), dependencias())
  for (const l of r.lineas) console.log(l)
  process.exitCode = r.codigo
})
