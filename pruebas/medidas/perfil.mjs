// El resumen de un perfil de CPU de node (--cpu-prof): tiempo PROPIO por funcion y fichero,
// las 25 primeras. Para la medida S4-08 (diseño q.11).
//   node pruebas/medidas/perfil.mjs <fichero.cpuprofile>
import { readFileSync } from 'node:fs'
const p = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const porId = new Map(p.nodes.map(n => [n.id, n]))
const propio = new Map()
const dt = p.timeDeltas
for (let i = 0; i < p.samples.length; i++) {
  const n = porId.get(p.samples[i]); const f = n.callFrame
  const k = `${f.functionName || '(anonima)'} · ${(f.url || '').split('/').slice(-2).join('/')}:${f.lineNumber + 1}`
  propio.set(k, (propio.get(k) ?? 0) + (dt[i] ?? 0))
}
const total = [...propio.values()].reduce((a, b) => a + b, 0)
for (const [k, v] of [...propio].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${(100 * v / total).toFixed(1).padStart(5)} %  ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`)
