// Corta toda salida de red del proceso. Se carga con --import antes que nada,
// tambien en el hilo del cargador (cargador.mjs la importa) y en los hijos node
// (los guiones la ponen en NODE_OPTIONS). El corte vive en sin-red.cjs, que
// tambien precarga cada worker (el --import no se aplica en los workers).
// ⛔ Las pruebas del simulador no hablan con nadie: ni Supabase, ni Dukascopy, ni
//    nada. `pruebas/arnes.mjs` comprueba el corte en cada capa.
// ⚠️ Capa JS. La barrera de verdad para TODO (subprocesos que no son node,
//    binarios nativos, descargas de herramientas) es la del sistema: los
//    guiones corren cada prueba dentro de sandbox-exec / unshare (aislar.sh).
import { createRequire } from 'node:module'
createRequire(import.meta.url)('./sin-red.cjs')
