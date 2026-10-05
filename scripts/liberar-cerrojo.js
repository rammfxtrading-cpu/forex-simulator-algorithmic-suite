// LIBERAR A MANO un cerrojo de publicacion del bucket forex-data (bloque E,
// punto 1; CTO 5-oct-2026). Los cerrojos (_cerrojos/{PAR}_{AÑO}.json, de
// lib/mercado/ficheros.mjs) NO caducan ni se recuperan solos: si un proceso
// muere con uno puesto, todo lo de ese par y año falla, visible, hasta que una
// persona compruebe que ese proceso ya no existe y lo libere con esto.
// ⛔ Ningun workflow llama a este script. Liberar un cerrojo cuyo dueño sigue
//    vivo le deja publicar encima de otro: comprobarlo antes.
//
//   node scripts/liberar-cerrojo.js EURUSD_2026              -> enseña quien lo tiene y desde cuando; NO borra
//   node scripts/liberar-cerrojo.js EURUSD_2026 --confirmo   -> lo borra
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs'), path = require('path')

function getEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return { url: process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), key: process.env.SUPABASE_SERVICE_ROLE_KEY.trim() }
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .reduce((a, l) => { const eq = l.indexOf('='); if (eq > 0) a[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, ''); return a }, {})
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
}

async function main() {
  const clave = process.argv[2]
  const confirmo = process.argv.includes('--confirmo')
  const m = /^([A-Z]{6})_(\d{4})$/.exec(clave || '')
  if (!m) { console.log('Uso: node scripts/liberar-cerrojo.js PAR_AÑO [--confirmo]   (p. ej. EURUSD_2026)'); console.log('\n=== ⚠️ ATENCION: no se ha liberado nada ==='); process.exitCode = 1; return }
  const [, par, anio] = m
  const F = await import('../lib/mercado/ficheros.mjs')
  const { url, key } = getEnv()
  const sb = createClient(url, key)
  const c = await F.leeCerrojo(sb, par, Number(anio))
  if (c.estado === 'no-existe') { console.log(`No hay cerrojo para ${par} ${anio}.`); console.log('\n=== ✓ TODO OK — nada que liberar ==='); return }
  if (c.estado === 'error') { console.log(`No se pudo leer el cerrojo de ${par} ${anio}: ${c.motivo}`); console.log('\n=== ⚠️ ATENCION: no se ha liberado nada ==='); process.exitCode = 1; return }
  console.log(`Cerrojo ${F.rutaCerrojo(par, anio)}: lo tiene ${c.ficha.dueno ?? '(sin dueño)'} desde ${c.ficha.desde ?? '(sin fecha)'}.`)
  if (!confirmo) {
    console.log('Comprueba que ese proceso ya no existe (Actions, restore manual) y repite con --confirmo para liberarlo.')
    console.log('\n=== ⚠️ ATENCION: no se ha liberado nada (falta --confirmo) ===')
    process.exitCode = 1
    return
  }
  const r = await F.liberaCerrojo(sb, par, Number(anio))
  if (!r.ok) { console.log(`No se pudo borrar: ${r.motivo}`); console.log('\n=== ⚠️ ATENCION: no se ha liberado ==='); process.exitCode = 1; return }
  console.log('\n=== ✓ TODO OK — cerrojo liberado ===')
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
