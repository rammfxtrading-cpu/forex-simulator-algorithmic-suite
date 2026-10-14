// MERCADO V1 · EL CICLO DE PRUEBA DEL CERROJO CONTRA POSTGREST (public.mercado_cerrojo).
// Etapa 2; CTO 14-oct (ronda 5): tras mercado-001 y s14, antes de publicar
// nada (runbook, paso 3-bis). Con el puerto real: INSERT,
// INSERT duplicado (23505), SELECT, DELETE condicional con otro UUID (0 filas),
// DELETE con el propio (1 fila). Simulacro por defecto. Si algo no cuadra, se
// para y dice que queda; no libera nada.
// ⛔ Ningun workflow llama a este script, y no hace nada con CI o GITHUB_ACTIONS definidos.
//
//   node scripts/mercado-v1-prueba-cerrojo.mjs              → SIMULACRO: dice el ciclo; no llama a nada
//   node scripts/mercado-v1-prueba-cerrojo.mjs --ejecuta    → hace el ciclo
// Codigos: 0 ciclo correcto · 1 no ejecutado · 2 no cuadra (PARAR) · 3 error (PARAR) · 4 uso.
// La logica: lib/mercado/prueba-cerrojo-v1.mjs.
import { randomUUID } from 'crypto'
import { frontera } from '../lib/mercado/frontera-cli.mjs'
import { ordenPruebaCerrojo } from '../lib/mercado/prueba-cerrojo-v1.mjs'
import { dependencias } from './mercado-v1-dependencias.mjs'

await frontera('ciclo de prueba del cerrojo', async () => {
  const d = dependencias()   // el cliente de Supabase se construye (y lee sus claves) en la primera llamada, no aqui
  const r = await ordenPruebaCerrojo(process.argv.slice(2), { cerrojo: d.cerrojo, uuid: randomUUID, entorno: process.env })
  for (const l of r.lineas) console.log(l)
  process.exitCode = r.codigo
})
