// Se carga con --import: registra el cargador y monta el entorno (navegador
// falso, fetch que reparte a los handlers y a Gemini falso) antes que nada.
import { register } from 'node:module'
register('./cargador.mjs', import.meta.url)
await import('./entorno.mjs')
