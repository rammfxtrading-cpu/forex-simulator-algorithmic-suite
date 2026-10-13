// MERCADO V1 · LIBERAR A MANO EL CERROJO DEL BUCKET «mercado» (v1/_cerrojo.json).
// Etapa 2; CTO 13-oct (decision 3) y 14-oct: SIN caducidad; solo con
// confirmacion explicita, despues de enseñar dueño (UUID), fecha y antigüedad, y
// dejando constancia en v1/_liberados/. Simulacro por defecto.
// ⛔ Ningun workflow llama a este script, y no hace nada con CI o GITHUB_ACTIONS
//    definidos (BE-01). Liberar un cerrojo cuyo dueño sigue vivo le deja
//    publicar encima de otro: comprobarlo antes. Si la publicacion quedo
//    INCIERTA, reconciliar antes el puntero (node scripts/mercado-v1-verifica.mjs).
//
//   node scripts/mercado-v1-liberar-cerrojo.mjs                     → enseña el cerrojo; NO borra
//   node scripts/mercado-v1-liberar-cerrojo.mjs --confirmo <clave>   → lo libera
// Codigos: 0 no habia o liberado · 1 no liberado · 3 error · 4 uso. La logica: lib/mercado/liberar-v1.mjs.
import { ordenLibera } from '../lib/mercado/liberar-v1.mjs'
import { dependencias } from './mercado-v1-dependencias.mjs'

const d = dependencias()
const r = await ordenLibera(process.argv.slice(2), { almacen: d.almacen, ahora: () => new Date().toISOString(), entorno: process.env })
for (const l of r.lineas) console.log(l)
process.exitCode = r.codigo
