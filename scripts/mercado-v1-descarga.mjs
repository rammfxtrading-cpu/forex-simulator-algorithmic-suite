// MERCADO V1 · DESCARGA AUTORIZADA DE LOS ANUALES DE forex-data (etapa 2; CTO
// 13-oct: Ramon autoriza los 27 anuales, SOLO LECTURA, para la lista real de
// huecos). No escribe en Storage ni en la base: info() y descargas.
//
//   node scripts/mercado-v1-descarga.mjs --descarga-autorizada
//     → ~/copias-suite/<fecha-hora>-mercado-v1-descarga-<aleatorio>/<PAR>_<AÑO>.json.gz (+ .sha256)
//       (carpeta nueva y exclusiva; ficheros con 'wx': nunca se sobrescribe)
// Cada .json.gz: descarga atada a info() (tope y etag), sha256 del cuerpo =
// el de sus metadatos, guardado tal cual y releido. Despues:
//   node scripts/mercado-v1-publica.mjs --base <esa carpeta> --informe ...
// Codigos: 0 todo guardado y verificado · 1 algun fallo · 4 uso.
import { frontera } from '../lib/mercado/frontera-cli.mjs'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, realpathSync, writeFileSync, readFileSync } from 'fs'
import { randomBytes } from 'crypto'
import os from 'os'
import path from 'path'
import * as F from '../lib/mercado/ficheros.mjs'
import * as L from '../lib/mercado/limites.mjs'
import { descargaAnuales } from '../lib/mercado/descarga-v1.mjs'
import { PARES } from '../lib/mercado/orden-v1.mjs'
import { claves } from './mercado-v1-dependencias.mjs'

await frontera('descarga', async () => {
  if (process.argv.slice(2).join(' ') !== '--descarga-autorizada') {
    console.log('Uso: node scripts/mercado-v1-descarga.mjs --descarga-autorizada   (solo con el si del CTO o de Ramon: regla del 5-oct)')
    console.log('=== ⚠️ ATENCION: no se ha descargado nada (codigo 4) ===')
    process.exit(4)
  }
  const { url, key } = claves()
  const sb = createClient(url, key, { global: { fetch: L.fetchConTope(L.fetchConLimite((...a) => globalThis.fetch(...a), F.LIMITES.grandeMs)) } })
  const hoy = new Date()
  const base = realpathSync(path.join(os.homedir(), 'copias-suite'))
  const dir = path.join(base, `${hoy.toISOString().replace(/[:.]/g, '-')}-mercado-v1-descarga-${randomBytes(3).toString('hex')}`)
  mkdirSync(dir)                       // exclusiva: si existiera, falla
  const anios = []
  for (let a = 2024; a <= hoy.getUTCFullYear(); a++) anios.push(a)
  console.log(`=== DESCARGA AUTORIZADA (solo lectura) · ${PARES.length} pares · ${anios.join(', ')} · ${hoy.toISOString()} ===`)
  const r = await descargaAnuales({
    pares: PARES, anios,
    info: async (par, anio) => { const i = await F.infoVigente(sb, par, anio); return i.estado === 'ok' ? { ...i, sha256: i.metadata?.sha256 ?? null } : i },
    bajar: async (ruta, { tope, sha256 }) => { const x = await F.leerRuta(sb, ruta, F.LIMITES, { tope, sha256, crudo: true }); return x.estado === 'ok' ? { estado: 'ok', crudo: x.crudo, identidad: x.identidad } : x },
    escribe: async (n, b) => writeFileSync(path.join(dir, n), b, { flag: 'wx' }),
    relee: async n => readFileSync(path.join(dir, n)),
  })
  for (const l of r.lineas) console.log(l)
  writeFileSync(path.join(dir, 'resumen.txt'), r.lineas.join('\n') + '\n', { flag: 'wx' })
  console.log(`\nCopia en ${dir}`)
  if (r.fallos.length) { console.log(`=== ⚠️ ATENCION: ${r.fallos.length} fallo(s) (codigo 1) ===`); process.exitCode = 1 }
  else console.log(`=== ✓ ${r.guardados.length} fichero(s) guardados y verificados (codigo 0) ===`)
})
