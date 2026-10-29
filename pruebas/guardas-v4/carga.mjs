// La canonica con la que se escribio la sim-005 (orden 1-090, 22-oct): la v4 de revisiones-suite/guardas, CONGELADA aqui.
// Orden 1-166: las pruebas cargaban revisiones-suite/guardas/contexto.mjs, que es la canonica VIVA (hoy la v15, sin
// mide.grafo); cada prueba carga la version con la que se escribio. Copias byte a byte, comprobadas por sha256:
//   contexto-v4.mjs   = revisiones-suite/guardas/contexto-v4-retirada.mjs (= contexto-v4.mjs; LEEME de guardas, «v4»)
//   produccion-v4.mjs = revisiones-suite/guardas/produccion.mjs (la de la v4: HUECO y salida s-contexto v4; sin cambios desde el 22-oct)
// Si alguien las toca, esto PARA antes de generar o probar nada.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const SHA256 = {
  'contexto-v4.mjs': '49180255954ff302fe53aba8a60d961d84968ad60f5cfd1602c5b71ad1159a3a',
  'produccion-v4.mjs': 'e6d1123feda251189b91eeff706a14313dbf2927098aa538ddae29d36fef9cc4',
}
for (const [f, esperado] of Object.entries(SHA256)) {
  const real = createHash('sha256').update(readFileSync(new URL(`./${f}`, import.meta.url))).digest('hex')
  if (real !== esperado) throw new Error(`pruebas/guardas-v4/${f}: sha256 ${real}, se esperaba ${esperado} (la copia congelada de la v4 ha cambiado)`)
}
export const CC = await import(new URL('./contexto-v4.mjs', import.meta.url).href)
export const P = await import(new URL('./produccion-v4.mjs', import.meta.url).href)
if (CC.VERSION !== 'v4' || P.HUECO !== '⟦HUECO s-contexto v4⟧') throw new Error(`pruebas/guardas-v4: no es la v4 (${CC.VERSION}, ${P.HUECO})`)
