# Pruebas del simulador

Sin red (cortada por el sistema y en JS; ver `aislar.sh`, `sin-red.cjs`), sin secretos (`env -i`), con Supabase, proveedor de velas y React **dobles** (ver «Límites de los dobles»). Cero escrituras en la base.

| Carpeta / guion | Qué es | Qué se espera |
|---|---|---|
| `pruebas/*.mjs` · `tanda.sh` | arnés y ensayos de SQL (PostgreSQL local desechable) | verde |
| `pruebas/aceptacion/` · `tanda.sh` | **contratos** de lo ya arreglado: oráculos del comportamiento correcto, controles que no dependen del código viejo | verde (la tanda falla si no) |
| `pruebas/fase1/` · `fase1.sh` | reproducciones de lo que **sigue roto** en HEAD | rojo (código 1) hasta su arreglo |
| `pruebas/historicas/` · `historicas.sh` | reproducciones **originales** (commit `467f7c8`) de hallazgos ya arreglados o cuyas pruebas se endurecieron; sus controles describen el código de entonces | rojo contra `c470c8f` |

`historicas.sh` corre también `aceptacion/` contra el código auditado: ahí **tienen que salir en rojo**. Una prueba de aceptación que sale verde contra el código viejo aprueba en vacío.

**Cuando se arregla un hallazgo:** la prueba de `fase1/` se convierte en contrato (o se escribe uno nuevo) en `aceptacion/`; la original, si sus controles fijaban el comportamiento viejo, se copia tal cual a `historicas/`. Nunca se convierte a verde un control que describe el código defectuoso: el contrato se escribe aparte.

Códigos de salida de cada prueba: `1` algún oráculo en rojo · `0` todos en verde · `2` control roto · `3` excepción (fallo de la prueba). Un `2` o un `3` nunca cuentan como reproducción.

## Límites de los dobles (H07, revisión de Astra del 4-oct-2026)

Ningún doble fabrica los núcleos de los 23 hallazgos (Astra lo comprobó), pero **ninguno certifica** lo que no modela. Para eso: SQL real aislado (los ensayos de `pg-ensayo.mjs`) o navegador real.

| Doble | Qué NO modela | Consecuencia |
|---|---|---|
| `supabase-falso.mjs` | RLS, grants, FK, cascadas, triggers, CHECK, aislamiento SQL; `upsert` = `insert` (con clave repetida da 23505 en vez de actualizar); `order` compara como texto (una columna numérica saldría en orden lexicográfico; hoy solo se ordena por fechas ISO e ids) | No vale para certificar permisos, RPC, upsert ni cascadas: eso se prueba en PostgreSQL (`sim-001*.mjs`). `db.cascadas` (bloque D, 5-oct) EMULA las FK `ON DELETE CASCADE` que una prueba declara (d06: las que el CTO leyó en producción y la de sim-001b); no prueba que existan. Desde el bloque D tiene también `gt/gte/lt/lte` y `or()` con la sintaxis de PostgREST (compara como texto). |
| `react-falso.mjs` | concurrencia, StrictMode, Suspense, DOM y layout, refs de callback, eventos con burbuja; un `<button>` de envío dispara el `onSubmit` de su `<form>` **aunque el `onClick` haya llamado a `preventDefault`** | No vale para certificar interacción real: la página de sesión se monta sin gráfico. |
| `entorno.mjs` | `requestAnimationFrame` nunca llama (el bucle de reproducción no corre solo: las pruebas avanzan velas a mano); `ResizeObserver` no observa; `window` y `document` mínimos | El rendimiento y el tiempo real no se miden aquí. |
| `proveedor-falso.mjs` | latencia, límites y opciones de dukascopy-node (`retryOnEmpty`, `pauseBetweenRetriesMs`…) | Solo modela qué velas devuelve. |
| `script-falso.mjs` | un `process.exit` real (una `SalidaDeScript` puede quedar atrapada en un `catch` del propio script); solo fija `Date.now()` y `new Date()` sin argumentos; `setTimeout` inmediato, `setInterval` no | Los scripts corren en el mismo proceso, con su `require` interceptado. |
| `next-falso.mjs` | navegación (`push` solo se apunta); `dynamic` carga el módulo de verdad | — |
| `banco-motor.mjs` | copia dos fragmentos de `_SessionInner` (alta de mercado y reset del Go to), verificados por `copiasVigentes()` | Si `_SessionInner` cambia esas líneas, el banco lo dice. |
| `pg-ensayo.mjs` / `estado-s04.mjs` | el esquema es **inventado** con los hechos de la s04; no es el baseline real | Acredita los objetos del stub, no la base viva. |

## Límites de precisión de algunas pruebas (H08)

| Prueba | Qué no prueba | Lo cubrirá |
|---|---|---|
| `fase1/d01-recargar` | No avanza el reloj antes de salir: no prueba que se guarde un cursor movido ni la reanudación exacta. | aceptación de la cartera durable (A15, A16, A22 de la revisión de diseño) |
| `fase1/m06-breach-intravela` | El banco va sin usuario (el cierre forzado no se persiste) y el contraste con el evaluador se hace en memoria. | aceptación del reto contra cierres persistidos (A06, A13, A14) |
| `fase1/p01-tick-incremental` | El gráfico es un doble con una sola regla de lightweight-charts: ni la librería, ni FPS, ni latencia. | aceptación del render con la librería real en navegador |
