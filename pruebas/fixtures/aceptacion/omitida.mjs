// Fixture de pruebas/recuento.mjs (H04 + omitidas): UN oraculo y UNA comprobacion omitida; minimos.json declara 2. No es una prueba del producto.
import { oraculo, omitido, fin } from '../../lib.mjs'
oraculo('H04', 'uno', true)
omitido('H04', 'dos', 'fichero ausente hasta el paso 7')
fin()
