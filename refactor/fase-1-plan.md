# Plan táctico — Fase 1 (data layer)

> Documento operativo. Ramón debe leer §1, §3 y §6 mínimo.
> Trabajamos en la rama `refactor/fase-1-data-layer`. NO se mergea a `main` hasta que Ramón lo confirme explícitamente.
> Cada sub-fase = un commit aislado, mergeable sola dentro de la rama.

---

## 1. Objetivo de la fase 1 (afilado)

> **Convertir la "data layer" en un módulo aislado y verificable**: hoy el fetch, el filtrado de fines de semana y la escritura de los globales `window.__algSuiteSeriesData / __algSuiteRealDataLen / __algSuiteCurrentTime` están dispersos en `_SessionInner.js`. Después de la fase 1, todo eso vivirá en `lib/sessionData.js` y será el **único punto del código que escribe esos globales**.

**Importante (decisión de Ramón en §7 del análisis):** los globales se MANTIENEN. No los eliminamos en esta fase. Solo aseguramos higiene: una sola fuente de escritura y una sola función de limpieza.

**Lo que NO es el objetivo:**
- No reescribir las lecturas (siguen leyendo `window.__algSuite*` directamente — eso es fase 2/3).
- No tocar el engine de replay.
- No tocar los drawings.
- No tocar updateChart en su lógica — solo sustituir las 5 escrituras de globales por llamadas a la nueva API.

---

## 2. Inventario exhaustivo de puntos a tocar

### 2.1 Archivos NUEVOS

| # | Archivo | Función |
|---|---|---|
| 1 | `lib/sessionData.js` | Módulo único con fetch+filter+writes de globales |

### 2.2 Modificaciones en `components/_SessionInner.js`

**Sub-fase 1a — extracción del fetch/filter:**

| # | Línea(s) | Qué hay hoy | Qué pasa a haber |
|---|---|---|---|
| 1 | L740–745 | `replayTs/toTs/ctxTs/ctxYear/toYear/years[]` (cálculo de rango) | desaparece (se mueve dentro de `fetchSessionCandles`) |
| 2 | L747–757 | bucle `for (yr of years)` con `fetch /api/candles` y concat | desaparece |
| 3 | L758–759 | dedupe por `seen.add(c.time)` y sort | desaparece |
| 4 | L760 | `if (!all.length) return` | desaparece (lo gestiona el módulo) |
| 5 | L762–785 | filter weekend + asignaciones legacy `ordinalToReal=null/realToOrdinal=null/ordinalCandles` | desaparece (filter va al módulo; `ordinalToReal/realToOrdinal` se borran del todo, ver §3.0.2) |
| 6 | L815 | shorthand `...,ordinalToReal,realToOrdinal,...` dentro del objeto `ps` | se eliminan ambos campos del literal (verificado: 0 lecturas) |
| 7 | (sustitución de #1–#5) | — | una llamada `await fetchSessionCandles({pair, dateFrom, dateTo})` que devuelve `{ candles }` |

**Sub-fase 1b — escritura de `__algSuiteSeriesData` / `__algSuiteRealDataLen`:**

| # | Línea | Qué hay hoy | Qué pasa a haber |
|---|---|---|---|
| 8 | L1057 | `window.__algSuiteSeriesData=[...agg,...cr.phantom];window.__algSuiteRealDataLen=agg.length` (rama "full") | `setSeriesData([...agg, ...cr.phantom], agg.length)` |
| 9 | L1090 | mismo write (rama "vela TF nueva") | `setSeriesData(...)` |
| 10 | L1116 | mismo write (fallback dentro de "vela TF nueva") | `setSeriesData(...)` |
| 11 | L1127–1128 | `window.__algSuiteSeriesData[agg.length-1] = agg[agg.length-1]` (within-bucket, mutación in-place) | `updateSeriesAt(agg.length-1, agg[agg.length-1])` |
| 12 | L1142 | mismo write completo (fallback within-bucket) | `setSeriesData(...)` |

**Sub-fase 1c — escritura de `__algSuiteCurrentTime`:**

| # | Línea | Qué hay hoy | Qué pasa a haber |
|---|---|---|---|
| 13 | L528 | `window.__algSuiteCurrentTime = null` (en session load) | `clearCurrentTime()` |
| 14 | L772 | `if(typeof window!=='undefined') window.__algSuiteCurrentTime=engine.currentTime` (en engine.onTick) | `setCurrentTime(engine.currentTime)` |
| 15 | L1225 | mismo write (en effect de cambio de activePair) | `setCurrentTime(ps.engine.currentTime)` |

### 2.3 Lecturas que NO se tocan en fase 1 (lista explícita)

> Estas lecturas seguirán leyendo `window.__algSuite*` directo. No las consideramos deuda hasta fase 2/3.

| Archivo | Línea | Lo que lee |
|---|---|---|
| `_SessionInner.js` | 753 | `window.__algSuiteCurrentTime` (validación masterTime al cargar par) |
| `_SessionInner.js` | 815 | `window.__algSuiteSeriesData` (autoscaleInfoProvider) |
| `_SessionInner.js` | 816 | `window.__algSuiteRealDataLen` (autoscaleInfoProvider) |
| `_SessionInner.js` | 858 | `window.__chartMap` (autoscaleInfoProvider) — fuera de alcance, no es `__algSuite*` |
| `_SessionInner.js` | 1138 | `window.__algSuiteDebugLS` y `__algSuiteExportTools` — debug muerto, fase de limpieza |
| `_SessionInner.js` | 1218 | `window.__algSuiteCurrentTime` (sync engine al cambiar par) |
| `_SessionInner.js` | 568 | `window.__algSuiteCurrentTime` (refreshChallengeStatus fallback) |
| `_SessionInner.js` | 144 | `window.__chartMap = chartMap` (write — pero es ref a un ref, no a __algSuite*) |
| `lib/chartCoords.js` | 9, 11, 89, 96 | `__algSuiteSeriesData / __algSuiteRealDataLen` |
| `components/RulerOverlay.js` | 28, 30 | `__algSuiteSeriesData / __algSuiteRealDataLen` |

### 2.4 Archivos que NO se tocan en TODA la fase 1

```
lib/replayEngine.js                  ← intocable (está bien)
lib/chartCoords.js                   ← solo lecturas, fase 2
components/useDrawingTools.js        ← fase 4
components/useCustomDrawings.js      ← fase 4
components/CustomDrawingsOverlay.jsx ← fase 4
components/RulerOverlay.jsx          ← fase 4
components/KillzonesOverlay.jsx      ← fase 4
components/ChartConfigPanel.js       ← no relacionado
components/DrawingToolbarV2.jsx      ← no relacionado
pages/api/candles.js                 ← API server, fuera de scope
Esquema Supabase                     ← regla absoluta CLAUDE.md §3.1
package.json                         ← no se añaden deps (regla §3.4)
```

---

## 3. Plan paso a paso

> **Nota sobre desarrollo en local (HMR):** durante la fase 1, cada vez que edite `_SessionInner.js` y Next.js dispare un Hot Module Reload, veremos errores en consola tipo `Object is disposed` o `Series not attached to tool ...`. **NO son regresiones de la fase 1**: son los bugs #5 y #6 del CLAUDE.md §9, preexistentes, que se exponen porque el HMR no destruye el plugin viejo. Para validar de forma limpia, Ramón hará **Cmd+R (hard reload)** entre cambios y comprobará la consola desde cero. Cualquier error que persista TRAS un Cmd+R sí cuenta como señal de rotura.

### 3.0 Verificaciones previas (hechas antes de aprobar el plan, 2026-04-27)

#### 3.0.1 Cálculo del rango temporal actual (`_SessionInner.js:740–745`)

Lectura literal del código actual:

```js
const replayTs = sess.date_from
  ? Math.floor(new Date(sess.date_from).getTime()/1000)
  : Math.floor(new Date('2023-01-01').getTime()/1000)
const toTs = sess.date_to
  ? Math.floor(new Date(sess.date_to+'T23:59:59').getTime()/1000)
  : Math.floor(new Date('2023-12-31T23:59:59').getTime()/1000)
const ctxTs = replayTs - 6*30*24*60*60          // ← 180 días, no 6 meses calendario
const ctxYear = new Date(ctxTs*1000).getFullYear()
const toYear = new Date(toTs*1000).getFullYear()
```

Y el bucle por años (L747–757):

```js
for (let y = ctxYear; y <= toYear; y++) years.push(y)
for (const yr of years) {
  const yStart = Math.max(ctxTs, Math.floor(new Date(`${yr}-01-01`).getTime()/1000))
  const yEnd   = yr === toYear
    ? toTs
    : Math.floor(new Date(`${yr}-12-31T23:59:59`).getTime()/1000)
  const r = await fetch(`/api/candles?pair=${clean}&timeframe=M1&from=${yStart}&to=${yEnd}&year=${yr}`)
  ...
}
```

**Hechos confirmados (NO son "buffer de 6 meses calendario"):**
- `replayTs` = `sess.date_from` parseado en UTC (constructor `new Date('YYYY-MM-DD')` interpreta la fecha como medianoche UTC). Si `date_from` está vacío, default `2023-01-01 UTC`.
- `toTs` = `sess.date_to` + sufijo `'T23:59:59'`. **Sin offset de zona explícito** → `new Date('YYYY-MM-DDTHH:MM:SS')` se interpreta como hora **local** del navegador, no UTC. Esto significa que un mismo `date_to = '2024-12-31'` produce un `toTs` ligeramente distinto según el TZ del cliente (Madrid CET/CEST vs UTC ≈ 1 o 2 h de diferencia). **Lo mantenemos idéntico, no lo "arreglamos" en fase 1.**
- `ctxTs` = `replayTs − (6 × 30 × 24 × 60 × 60)` = `replayTs − 15.552.000 s` = **180 días exactos** atrás. No es "6 meses calendario" (que serían 181–184 días según meses) — es una aproximación fija de 180 días.
- El primer año del bucle empieza en `max(ctxTs, Jan 1 del año)`. Si `ctxTs` cae en el año anterior al primer año del bucle, **se descartan los días de Enero anteriores a `ctxTs`** (porque `Math.max` los recorta).
- El último año termina en `toTs` (no en Dic 31 23:59:59 del año).
- Años intermedios completos: `Jan 1 00:00 UTC` a `Dec 31 23:59:59 hora local`.

**Compromiso:** la nueva implementación en `lib/sessionData.js` **replica este cálculo línea a línea, sin "limpiarlo"**. Cualquier mejora (UTC consistente, 6 meses reales en vez de 180 días, etc.) queda fuera de fase 1 y se decide en otra sesión.

#### 3.0.2 Verificación de `ordinalToReal` / `realToOrdinal`

Ejecutado:
```bash
grep -rn "ordinalToReal\|realToOrdinal" components/ pages/ lib/
grep -rn "\.ordinalToReal\|\.realToOrdinal\|\['ordinalToReal'\]\|\['realToOrdinal'\]" components/ pages/ lib/
```

Resultado: **3 matches, todos en `_SessionInner.js`. Cero lecturas.**

| Línea | Match | Tipo |
|---|---|---|
| 783 | `const ordinalToReal = null` | declaración local, asignación nominal |
| 784 | `const realToOrdinal = null` | declaración local, asignación nominal |
| 815 | `const ps={engine,...,ordinalToReal,realToOrdinal,...}` | shorthand property al objeto `pairState[pair]` |

**Decisión:** son **código muerto verificado**. En sub-fase 1a se borran las 3 ocurrencias (no se preservan como `null` por compat fantasma).

---

### 3.1 Sub-fase 1a — Extracción del fetch + filter a `lib/sessionData.js`

**Tamaño:** ~150 líneas movidas + ~120 nuevas en módulo. **Sesiones:** 1. **Riesgo:** **medio** (revisado tras AJUSTE 1 de Ramón).

**Por qué medio (no bajo):**
- El bloque que se mueve mezcla 4 cosas que tienen sutilezas: parseo de fechas con TZ implícito (ver §3.0.1), aritmética entre unix timestamps y años calendario, bucle por años con clamp al primer/último, filter weekend con boundaries DST. Cualquier descuido al portar mueve el dataset un día arriba o abajo.
- 150 líneas movidas con timezones es zona de bugs silenciosos: el código sigue corriendo, el chart se pinta, pero faltan unas horas de velas o sobran de un domingo y el fallo solo se detecta cuando el alumno pone una drawing exactamente en ese intervalo.
- No tenemos tests automáticos. La validación es manual y la única protección real son las pruebas de Ramón en §3.1 (ver más casos límite abajo).

**Archivos creados:** `lib/sessionData.js` con:
```js
// Pseudocódigo orientativo, no es la implementación final
export async function fetchSessionCandles({ pair, dateFrom, dateTo }) {
  // 1. Replica EXACTA del cálculo de §3.0.1 (sin "limpieza")
  //    - replayTs / toTs con el mismo parseo (toTs usa hora local por T23:59:59)
  //    - ctxTs = replayTs - 6*30*24*60*60   (= 180 días, NO 6 meses calendario)
  //    - ctxYear .. toYear, primer año clamped a max(ctxTs, Jan1), último a toTs
  // 2. Bucle por años → fetch /api/candles?pair=&timeframe=M1&from=&to=&year=
  // 3. Dedupe por c.time (Set) + sort ascendente
  // 4. filterWeekends() con la regla actual (sábado entero, viernes>=21UTC, domingo<21UTC)
  // 5. return { candles }
}
function filterWeekends(candles) { /* puro, testeable */ }
```

**Archivos modificados:** solo `components/_SessionInner.js`:
- Sustituir L740–785 por:
  ```js
  const { candles: ordinalCandles } = await fetchSessionCandles({
    pair, dateFrom: sess.date_from, dateTo: sess.date_to
  })
  if (!ordinalCandles.length) return
  ```
- En L815, **eliminar** `ordinalToReal` y `realToOrdinal` del objeto `ps` (verificado en §3.0.2 que son código muerto).
- Añadir `import { fetchSessionCandles } from '../lib/sessionData'` arriba.

**Archivos NO tocados en esta sub-fase:**
- Todo lo listado en §2.4
- `_SessionInner.js` aparte de las líneas indicadas (engine creation, onTick, updateChart, mountPair, todo lo demás se queda igual)

**Pruebas manuales (Ramón):**

> Cada prueba: `npm run dev` + Cmd+R para consola limpia (ver nota HMR §3 intro). Anotar nº de velas total al inicio del replay y compararlo con el valor de la rama `main` (paso 0).

0. **Baseline (antes de empezar 1a)**: en `main`, abrir 3 sesiones ejemplo y anotar el número de velas que reporta `pairState.current[pair].engine.candles.length` desde la consola del navegador. Estos son los números de referencia.

1. **Sesión típica (1 año dentro)**: cargar una sesión H1 normal, verificar que pinta velas como antes y que el conteo coincide con el baseline.
2. **Sesión multi-año**: cargar una sesión cuyo `date_from` esté en un año distinto a `date_to` (p. ej. `date_from = 2023-09-01`, `date_to = 2024-03-15`). Esto valida el bucle por años + concat. **Verificar:**
   - El chart cubre correctamente el cambio de año (no hay hueco visible en Dec 31 → Jan 1).
   - Conteo de velas idéntico al baseline.
3. **Sesión que termina viernes a las 23:00 UTC**: crear/usar una sesión con `date_to` de un viernes y avanzar el replay hasta la última vela disponible. **Verificar:**
   - La última vela visible es ≤ viernes 20:59 UTC (la regla del filter es `viernes && hour >= 21 → drop`).
   - No aparecen velas de viernes 21:00–23:59.
4. **Sesión que arranca un domingo entre 21:00 y 23:59 UTC**: con `date_from` de un domingo. **Verificar:**
   - La primera vela es ≥ domingo 21:00 UTC (el filter solo dropea `domingo && hour < 21`).
   - No aparecen velas de domingo 00:00–20:59.
5. **Sesión muy reciente (último mes)**: `date_to` dentro de los últimos 30 días. Valida que el endpoint `/api/candles` devuelve datos frescos y que el ctxTs (180 días atrás) cubre bien.
6. **Sesión de 1 día (`date_from === date_to`)**: caso límite degenerado. **Verificar:** el chart carga, hay velas, no hay crash. Es probable que la mayoría de velas vengan del contexto de 180 días previo, no del día `date_to` en sí.
7. **Par exótico (NZD/USD o AUD/CAD)**: confirmar que el fetch funciona con un par menos común — la URL `/api/candles?pair=NZDUSD&...` debe devolver datos.
8. **Par JPY (USD/JPY o EUR/JPY)**: confirma que no hay regresión en formatos de precio (5 dec → 3 dec). El fetch en sí no varía, pero el render sí.
9. **Cambio de par durante replay**: cargar EUR/USD, avanzar 50 velas, cambiar a GBP/USD. El nuevo par debe cargar y posicionarse en el masterTime correcto (esto **lee** `window.__algSuiteCurrentTime`, que NO se toca en 1a; pero es buena prueba de no-regresión).
10. **Sesión con default (sin date_from / date_to)**: si una sesión tiene esos campos vacíos en BD, el fallback es `2023-01-01` → `2023-12-31`. Confirmar que sigue funcionando (mejor con una sesión vieja que ya tenga ese caso, no creo que tengas que crear una nueva).
11. **Cambio de TF (M1→H1→M5→H4)**: validar que en cualquier TF las velas son consistentes (mismo dataset M1 agregado distinto). Compara los timestamps de la primera y última vela visible — deben coincidir entre TFs.
12. **Reload de la página** durante un replay pausado: cerrar pestaña, reabrir la sesión, comprobar que el `last_timestamp` se restaura y que las velas previas siguen ahí.

**Casos límite NO probables (bajo riesgo, anotados para no olvidar):**
- Cambio DST Madrid/UTC en mitad de la sesión: el filter usa `getUTCDay()` y `getUTCHours()`, así que es DST-resistente. No requiere prueba específica.
- Año bisiesto (29 feb): el endpoint debería devolverlo si existe, no afecta a la lógica del módulo.

**Señales de que algo se rompió:**
- Chart vacío al cargar sesión.
- Error en consola tipo `fetchSessionCandles is not a function` o `Cannot read properties of undefined (reading 'candles')`.
- Velas duplicadas en el chart (gaps de fin de semana visibles que antes no estaban) → el filter weekend no se está aplicando.
- Muchas más velas o muchas menos que el baseline → cambió el rango temporal o el dedupe falla.
- Primera/última vela en timestamp distinto al baseline → el clamp de primer/último año del bucle se rompió.
- Hueco visible en Dec 31 → Jan 1 en sesión multi-año → bucle por años roto.

**Rollback:** `git revert <hash-de-1a>` o, si aún no se ha mergeado nada más sobre, `git reset --hard refactor/fase-1-data-layer~1`. Como `_SessionInner.js` es el único modificado, el rollback es un revert limpio.

**Validación final antes del commit:**
1. Yo ejecuto `npm run build` en local. Si falla, no propongo commit.
2. Yo ejecuto `git diff` y se lo enseño a Ramón al completo.
3. Espero **OK explícito** de Ramón.
4. Solo entonces ejecuto `git commit`.

**Commit message sugerido:**
```
refactor(fase-1a): extraer fetch+filter a lib/sessionData.js

- Crea lib/sessionData.js con fetchSessionCandles({pair, dateFrom, dateTo})
- _SessionInner.js:loadPair delega el bloque de fetch a la nueva función
- Filter weekend pasa a ser una función pura
- Borra ordinalToReal/realToOrdinal (código muerto verificado, ver fase-1-plan.md §3.0.2)
- Sin cambios funcionales: dataset idéntico al anterior (validado por baseline)
```

---

### 3.2 Sub-fase 1b — Centralización de `__algSuiteSeriesData` y `__algSuiteRealDataLen`

**Tamaño:** ~10 líneas tocadas en `_SessionInner.js` (-2 neto) + ~12 añadidas en `lib/sessionData.js`. **Total +10 líneas.** **Sesiones:** 1. **Riesgo:** medio.

**Por qué medio:**
- Las 5 escrituras viven dentro de `updateChart`, función más caliente del replay. Cualquier excepción en una de sus ramas mata el render del chart.
- Si invertimos accidentalmente el orden de operaciones (ej. escribir el global ANTES de `cr.series.setData`), el `autoscaleInfoProvider` puede leer datos stale en el primer frame y reescalar el eje Y.
- El plan §2.2 enumera 5 sustituciones; un olvido (escritura "a pelo" residual) crea inconsistencia silenciosa difícil de detectar sin grep automático.

#### Decisión: extender `lib/sessionData.js`, NO crear archivo nuevo

Considerada la opción de crear `lib/seriesData.js` separado, descartada. Justificación:

- El plan §2.1 declara "1 archivo nuevo: `lib/sessionData.js`". Crear un módulo aparte introduce divergencia injustificada respecto al contrato aprobado.
- Las 2 funciones nuevas suman ~12 líneas. Crear módulo aparte por 12 líneas es premature factoring (YAGNI).
- "Data layer" como concepto unificado: fetch + filter (1a) + state global derivado (1b) + currentTime (1c). Mismo módulo para todo.
- Si fase 2 (eliminar globales) lo requiere, separamos entonces. Mover funciones es trivial; deshacer una separación prematura es más caro.

#### API expuesta (2 funciones, NO 3)

`clearSeriesData` queda **descartada** en 1b: ninguna de las 5 escrituras a sustituir requiere "limpiar" los globales. El plan §3.2 anterior la proponía por simetría con `clearCurrentTime` (1c), pero introducirla sin uso real es API muerta. Si 1c o fase de limpieza la pide, se añade entonces.

```js
/**
 * Escribe los globals __algSuiteSeriesData y __algSuiteRealDataLen.
 * Único punto de "rebuild completo" de ambos globals.
 * Guard interno SSR (typeof window check).
 *
 * @param {Object[]} allData - Array de candles (real + phantom). Asignación por referencia,
 *                             el caller NO debe mutar el array tras pasarlo.
 * @param {number}   realLen - Longitud de la parte real (sin phantoms).
 *                             Invariante: realLen <= allData.length.
 */
export function setSeriesData(allData, realLen) {
  if (typeof window === 'undefined') return
  window.__algSuiteSeriesData = allData
  window.__algSuiteRealDataLen = realLen
}

/**
 * Mutación in-place de un candle dentro de __algSuiteSeriesData.
 * NO modifica __algSuiteRealDataLen (asimetría intencional, replica L1128 pre-1b).
 * Guards internos: window undefined (SSR) o array no inicializado → no-op silencioso.
 *
 * @param {number} index   - Índice dentro de __algSuiteSeriesData.
 * @param {Object} candle  - Nuevo candle a colocar en esa posición.
 */
export function updateSeriesAt(index, candle) {
  if (typeof window === 'undefined') return
  if (!window.__algSuiteSeriesData) return
  window.__algSuiteSeriesData[index] = candle
}
```

#### Las 5 escrituras a sustituir (líneas reales post-1a verificadas con grep PASO 2)

> ⚠️ Antes de cualquier `str_replace` sobre L1127–L1128 (sustitución #4), Claude Code debe ejecutar `Read` de `_SessionInner.js` con rango L1124–L1132 y pegar output literal a Ramón. Quiero ver el patrón completo (apertura `if(...){` + asignación + cierre `}`) antes de aprobar ese `str_replace` concreto.

| # | Línea(s) real | Contenido actual exacto | Sustitución propuesta |
|---|---|---|---|
| 1 | L1057 | `if(typeof window!=='undefined'){window.__algSuiteSeriesData=[...agg,...cr.phantom];window.__algSuiteRealDataLen=agg.length}` | `setSeriesData([...agg, ...cr.phantom], agg.length)` |
| 2 | L1090 | idem #1 | idem #1 |
| 3 | L1116 | idem #1 | idem #1 |
| 4 | L1127–L1128 (3 líneas) | apertura `if(typeof window!=='undefined'&&window.__algSuiteSeriesData){`, asignación `window.__algSuiteSeriesData[agg.length-1]=agg[agg.length-1]`, cierre `}` | `updateSeriesAt(agg.length - 1, agg[agg.length - 1])` (guard SSR + null-check internos en `updateSeriesAt`) |
| 5 | L1142 | idem #1 | idem #1 |

**Cambio neto en `_SessionInner.js`:** -2 líneas (4 sustituciones uno-a-uno + 1 sustitución de 3 líneas a 1).

#### Lecturas NO se tocan en 1b — justificación

Las 14 lecturas inventoriadas en §2.3 (en 3 archivos: `_SessionInner.js`, `lib/chartCoords.js`, `components/RulerOverlay.js`) **se quedan tal cual leyendo `window.__algSuite*`** directamente.

- **Alcance del plan:** §1 dice literalmente *"No reescribir las lecturas (siguen leyendo `window.__algSuite*` directamente — eso es fase 2/3)"*.
- **Es seguro:** `setSeriesData()` escribe el global con valores idénticos a la versión pre-1b. Los consumers ven exactamente lo mismo. Cero cambio observable.
- **Es peligroso tocarlas ahora:** implica modificar 4 archivos, diseñar getter síncrono, verificar que ningún consumer queda con valor stale. Eso es alcance de fase 2 (`fase-1-plan.md §6.2`).
- **Mezclar 1b + 2 rompe** el principio "sub-fase mergeable sola" del §3.2.

**Archivos creados:** ninguno (se añade a `lib/sessionData.js`).

**Archivos modificados:**
- `lib/sessionData.js` — añadir las 2 funciones de arriba (`setSeriesData`, `updateSeriesAt`).
- `components/_SessionInner.js`:
  - Añadir al import existente: `import { fetchSessionCandles, setSeriesData, updateSeriesAt } from '../lib/sessionData'`.
  - 5 sustituciones según tabla anterior.

**Archivos NO tocados en esta sub-fase:** todo lo de §2.4 + las 14 lecturas inventoriadas en §2.3.

**Cuidado clave (orden de escritura):** en cada rama de `updateChart`, el orden actual es:
1. `cr.phantom = ...` (regenerar phantoms)
2. `cr.series.setData(...)` o `cr.series.update(...)` (LWC)
3. Escribir `window.__algSuite*` (a sustituir por `setSeriesData(...)`)

Mantenemos ESE orden exacto. La función `setSeriesData` solo escribe los globales — no toca `cr.series`. Así garantizamos cero cambio observable.

#### Baseline pre-1b (Ramón captura ANTES de empezar 1b)

**Protocolo:**

1. **Cmd+R completo** en la sesión "test code" para asegurar estado fresco.
   > **Importante:** NO haberle dado play a la sesión entre ahora y la captura. Si la sesión ha avanzado, `last_timestamp` será distinto y el baseline no será comparable al carácter.
2. Esperar a que el chart cargue completamente, **sin tocar play**, en TF M1.
3. Abrir DevTools → Console y ejecutar:

```js
({
  seriesDataLen: window.__algSuiteSeriesData?.length,
  realDataLen:   window.__algSuiteRealDataLen,
  phantomCount:  (window.__algSuiteSeriesData?.length ?? 0) - (window.__algSuiteRealDataLen ?? 0),
  firstTime:     window.__algSuiteSeriesData?.[0]?.time,
  lastRealTime:  window.__algSuiteSeriesData?.[window.__algSuiteRealDataLen - 1]?.time,
  lastTotalTime: window.__algSuiteSeriesData?.[window.__algSuiteSeriesData.length - 1]?.time
})
```

4. Anotar los 6 valores. Tras aplicar 1b, repetir en idéntica situación (misma sesión, mismo TF, **Cmd+R fresco**, sin haber tocado play). Si los 6 valores cuadran al carácter, replicación perfecta.

**Ventaja:** cero edit efímero. Los globales son accesibles directamente desde consola. Cero contaminación de la rama.

#### Protocolo build/dev (regla §8.1)

```bash
# 1. Identificar PID del dev (si está corriendo)
ps aux | grep "next dev" | grep -v grep

# 2. Matar dev
kill <PID>

# 3. (Opcional) limpiar .next/
rm -rf .next/

# 4. Build prod
npm run build
# Esperado: exit 0, cero warnings, hashes de chunks idénticos al post-1a
```

#### Verificaciones automáticas pre-commit

```bash
grep -nE "window\.__algSuiteSeriesData\s*=" components/_SessionInner.js
grep -nE "window\.__algSuiteRealDataLen\s*=" components/_SessionInner.js
grep -nE "window\.__algSuiteSeriesData\[" components/_SessionInner.js
```

**Esperado:** cero matches en los 3. Si aparece alguno, hay una escritura olvidada o una mutación residual.

#### Pruebas manuales mini-comprobación (Ramón, post-edits y post-build)

Tras `npm run build` exit 0, relanzar dev (`nohup npm run dev > /tmp/forex-dev.log 2>&1 &; disown`) + Cmd+R en navegador:

1. **Sesión "test code" carga**, chart visible.
2. **Baseline post-1b cuadra**: ejecutar el snippet del baseline (con Cmd+R fresco, sin play). Comparar contra baseline pre-1b. **Los 6 valores deben cuadrar al carácter.**
3. **Cambio TF M1→H1**: chart se redibuja sin huecos.
4. **Cambio TF H1→M1**: vuelve a M1 sin descolocar nada.
5. **Drawings (si hay alguno previo en BD)**: se ven y no se mueven al cambio TF.

**Criterio de paso:** los 5 puntos OK + baseline cuadra → 1b validada.
**Criterio de fallo:** chart vacío, error en consola tipo `Cannot read properties of undefined`, baseline NO cuadra, drawings descolocados → revert.

**Señales de rotura:**
- Chart queda en blanco tras cargar la sesión.
- Error `Cannot read properties of undefined (reading 'minValue')` en consola — el autoscaleInfoProvider está leyendo el global antes de que esté seteado.
- Drawings se descolocan inmediatamente al cambiar TF (más que antes).
- Drawings que estaban a la derecha del precio (zona phantom) desaparecen.
- Baseline post-1b NO cuadra con baseline pre-1b.

**Rollback:** revert del commit. Toca solo `lib/sessionData.js` (+12 líneas) y `_SessionInner.js` (-2 líneas neto). `git revert <hash>` deja exactamente el estado post-1a. Cero coordinación con otros archivos.

#### Riesgos identificados (específicos de 1b)

> Adapto la estructura del §4. Ordenados por gravedad descendente.

**R1 — Romper `updateChart()` invalida el chart entero. (CRÍTICO)**
- Síntoma: chart en blanco, drawings desaparecen, autoscale falla con `Cannot read properties of undefined (reading 'minValue')`.
- Mitigaciones (capa por capa):
  1. `setSeriesData / updateSeriesAt` son funciones puras de asignación. Sin async, sin I/O, sin React refs. Categoría imposible de race conditions.
  2. Cuerpo trivial verificable (3-4 líneas cada una).
  3. Mantener orden EXACTO de operaciones en cada rama de updateChart: phantoms → setData/update → `setSeriesData(...)`. Solo se sustituye el paso 3.
  4. Verificación pre-commit: `git diff` visual rama-por-rama + `grep` automático de cero residuos + `npm run build` exit 0.
  5. Mini-comprobación manual de Ramón (chart se ve + drawings no se mueven).
  6. Rollback atómico: `git revert <hash>` deja post-1a limpio.

**R2 — Asimetría de L1128: `updateSeriesAt` NO debe escribir RealDataLen.**
- Síntoma: si `updateSeriesAt` actualizase `__algSuiteRealDataLen`, el `autoscaleInfoProvider` y `chartCoords.timeToLogical` calcularían rangos con length erróneo. Drawings podrían desplazarse 1 vela.
- Mitigaciones: JSDoc documenta explícitamente "NO modifica __algSuiteRealDataLen". Verificación visual del cuerpo de `updateSeriesAt` antes del commit.

**R3 — Olvido de alguna de las 5 escrituras.**
- Síntoma: una rama de `updateChart` sigue escribiendo el global "a pelo" mientras las otras 4 lo hacen vía `setSeriesData`. Inconsistencia silenciosa.
- Mitigación: el `grep -nE "window\.__algSuite(SeriesData|RealDataLen)\s*=" components/_SessionInner.js` debe devolver 0 matches. Red de seguridad principal.

**R4 — Imports circulares / break del bundle.**
- Síntoma: `Cannot access 'X' before initialization` en runtime, o build falla con error de resolución.
- Análisis: `lib/sessionData.js` ya importa `./supabase`. Las 2 nuevas funciones no requieren imports adicionales. `_SessionInner.js` ya importa `fetchSessionCandles` desde `lib/sessionData.js`.
- Mitigación: `npm run build` lo detecta antes del commit.

**R5 — Pérdida del guard de L1127.**
- Síntoma: si `updateSeriesAt` se llama antes de que `setSeriesData` haya sido invocada al menos una vez, `window.__algSuiteSeriesData[index] = candle` lanzaría `TypeError`.
- Análisis: `updateSeriesAt` incluye los 2 guards internos (`typeof window` + `!window.__algSuiteSeriesData`). Equivalente funcional al guard original L1127.
- Mitigación: documentado en JSDoc + verificación visual del cuerpo de `updateSeriesAt`.

**R6 — Bug #1 / #2 / #5 / #6 vuelve más visible o se enmascara.**
- Síntoma: drawings al cambiar TF se ven mejor o peor. Freeze en M1 a velocidad máxima cambia. Errores `Series not attached to tool` aparecen con frecuencia distinta.
- Mitigación: durante mini-comprobación, anotar cualquier cambio observable. Apuntar en `core-analysis.md §5` para fase 3/4. NO arreglar nada en 1b.

**R7 — HMR durante desarrollo (preexistente, NO regresión).**
- Documentado en cabecera §3. Cmd+R como protocolo. NO cuenta como rotura de 1b.

**Validación final antes del commit:**
1. `npm run build` en local. Si falla, no propongo commit.
2. Greps automáticos de cero residuos (sección "Verificaciones automáticas pre-commit").
3. Enseño `git diff` completo a Ramón.
4. Mini-comprobación manual de Ramón en navegador con baseline post-1b.
5. Espero **OK explícito**.
6. Solo entonces ejecuto `git commit`.

**Commit message sugerido:**
```
refactor(fase-1b): centralizar escritura de __algSuiteSeriesData/RealDataLen

- lib/sessionData.js expone setSeriesData(allData, realLen) y
  updateSeriesAt(index, candle) — ambos con guard SSR interno
- _SessionInner.js:updateChart delega las 5 escrituras a la nueva API:
  · L1057, L1090, L1116, L1142 → setSeriesData([...agg, ...cr.phantom], agg.length)
  · L1127–L1128 (guard + mutación in-place) → updateSeriesAt(agg.length - 1, agg[agg.length - 1])
- Lecturas siguen direct (chartCoords L9/L11/L89/L96, RulerOverlay L28/L30,
  _SessionInner L815/L816) — fase 2
- updateSeriesAt NO modifica __algSuiteRealDataLen (asimetría intencional,
  replica comportamiento pre-1b de L1128)
- Sin cambios funcionales: globals escritos con valores idénticos al
  pre-refactor (validado por baseline al carácter en sesión "test code")
```

---

### 3.3 Sub-fase 1c — Centralización de `__algSuiteCurrentTime`

**Tamaño:** ~3 líneas tocadas en `_SessionInner.js` (0 neto, 3 sustituciones 1:1 con guard externo absorbido en la API) + ~25 añadidas en `lib/sessionData.js`. **Total +25 líneas.** **Sesiones:** 0.5. **Riesgo:** bajo-medio.

**Por qué bajo-medio:**
- Las 3 escrituras viven en lugares heterogéneos: `useEffect` de session load (L528), callback `engine.onTick` (L772, en cada tick del replay), `useEffect` de cambio activePair (L1225). Una excepción en cualquiera de ellos puede afectar al sync entre engines de pares distintos.
- L1225 es **línea compuesta** con 3 sentencias separadas por `;` (`setCurrentPrice(...);setDataReady(true);if(...) window.__algSuiteCurrentTime=...`). El `str_replace` debe tocar SOLO la 3ª sentencia, preservando las 2 primeras intactas.
- Alcance del cluster: las 3 lecturas que NO se tocan (L568, L753, L1218) son justo las que dependen de que el global esté actualizado para que `seekToTime(masterTime)` sincronice el engine del par nuevo. Si por error `setCurrentTime` no escribe el global, esas lecturas leen `undefined` y el sync entre pares se rompe (par nuevo arranca en su `date_from` en lugar del masterTime).

#### Decisión: extender `lib/sessionData.js`, NO crear archivo nuevo

Mismo razonamiento que sub-fase 1b. Justificación:

- Plan §2.1 declara "1 archivo nuevo: `lib/sessionData.js`". Crear un módulo aparte introduce divergencia injustificada respecto al contrato aprobado.
- Las 2 funciones nuevas suman ~25 líneas (con JSDoc completo). Crear módulo aparte por 25 líneas es premature factoring (YAGNI).
- "Data layer" como concepto unificado: fetch + filter (1a) + state global derivado (1b/1c).
- Si fase 2 (eliminar globales) lo requiere, separamos entonces.

#### API expuesta (2 funciones, NO 3)

`getCurrentTime()` queda **descartada** en 1c: las 3 lecturas (L568, L753, L1218) seguirán leyendo `window.__algSuiteCurrentTime` directamente como acordado en §1 del plan. Exportar un getter sin uso desde el módulo es API muerta. Si fase 2 lo requiere, se añade entonces.

```js
/**
 * Escribe el global __algSuiteCurrentTime con el timestamp actual del replay.
 * Usado por engine.onTick y por el effect de cambio de activePair.
 * Guard interno SSR (typeof window check).
 *
 * @param {number} t - Timestamp UNIX en segundos del momento actual del replay.
 *                     Equivale a engine.currentTime de ReplayEngine.
 */
export function setCurrentTime(t) {
  if (typeof window === 'undefined') return
  window.__algSuiteCurrentTime = t
}

/**
 * Resetea el global __algSuiteCurrentTime a null.
 * Usado en session load (efecto inicial del componente) para asegurar
 * que el global no persiste entre navegaciones SPA con valor stale.
 * Guard interno SSR (typeof window check).
 */
export function clearCurrentTime() {
  if (typeof window === 'undefined') return
  window.__algSuiteCurrentTime = null
}
```

#### Las 3 escrituras a sustituir (líneas reales post-1b verificadas con grep PASO A)

> ⚠️ Antes del `str_replace` sobre L1225 (sustitución #3), Claude Code debe ejecutar `Read` de `_SessionInner.js` con rango L1224-L1226 y pegar output literal a Ramón. Quiero ver la línea compuesta completa para verificar que el `old_string` aísla SOLO la 3ª sentencia (`if(typeof window!=='undefined') window.__algSuiteCurrentTime=ps.engine.currentTime`) y deja `setCurrentPrice(...)` y `setDataReady(true)` intactos.

| # | Línea | Indentación | Contenido actual exacto | Sustitución propuesta |
|---|---|---|---|---|
| 1 | L528 | 4 esp | `if(typeof window!=='undefined') window.__algSuiteCurrentTime = null` (en session load) | `clearCurrentTime()` |
| 2 | L772 | 10 esp | `if(typeof window!=='undefined') window.__algSuiteCurrentTime=engine.currentTime` (en engine.onTick) | `setCurrentTime(engine.currentTime)` |
| 3 | L1225 | 6 esp | línea compuesta `setCurrentPrice(...);setDataReady(true);if(typeof window!=='undefined') window.__algSuiteCurrentTime=ps.engine.currentTime` (effect activePair) — sustituir SOLO la 3ª sentencia | `setCurrentPrice(...);setDataReady(true);setCurrentTime(ps.engine.currentTime)` |

**Cambio neto en `_SessionInner.js`:** 0 líneas (3 sustituciones 1:1 + 1 modificación de import). Solo 1 línea compuesta donde solo la 3ª sentencia cambia.

#### Lecturas NO se tocan en 1c — justificación

Las 3 lecturas inventoriadas en §2.3 (L568, L753, L1218) **se quedan tal cual leyendo `window.__algSuiteCurrentTime`** directamente.

- **Alcance del plan:** §1 dice literalmente *"No reescribir las lecturas (siguen leyendo `window.__algSuite*` directamente — eso es fase 2/3)"*.
- **Es seguro:** `setCurrentTime()` y `clearCurrentTime()` escriben/limpian el global con valores idénticos a la versión pre-1c. Los consumers ven exactamente lo mismo. Cero cambio observable.
- **Es peligroso tocarlas ahora:** implica diseñar getter síncrono en `lib/sessionData.js`, modificar 3 sitios en `_SessionInner.js`, y verificar que el sync entre pares (que depende críticamente de que la lectura sea actual) no se descoloca. Eso es alcance de fase 2.
- **Mezclar 1c + 2 rompe** el principio "sub-fase mergeable sola" del §3.2.

**Archivos creados:** ninguno (se añade a `lib/sessionData.js`).

**Archivos modificados:**
- `lib/sessionData.js` — añadir las 2 funciones de arriba (`setCurrentTime`, `clearCurrentTime`).
- `components/_SessionInner.js`:
  - Añadir al import existente: `import { fetchSessionCandles, setSeriesData, updateSeriesAt, setCurrentTime, clearCurrentTime } from '../lib/sessionData'`.
  - 3 sustituciones según tabla anterior.

**Archivos NO tocados en esta sub-fase:** todo lo de §2.4 + las 14 lecturas inventoriadas en §2.3 (incluyendo las 3 lecturas de `__algSuiteCurrentTime` en L568, L753, L1218).

**Cuidado clave (orden de operaciones):** a diferencia de 1b, las 3 escrituras de 1c NO viven en `updateChart` ni interactúan con la series LWC. Se ejecutan en lugares aislados (session load effect, engine.onTick, activePair effect). Por tanto, NO hay un orden estricto que mantener — la única invariante es que el global siga apuntando al mismo valor que antes en cada uno de esos 3 momentos.

#### Baseline pre-1c (Ramón captura ANTES de empezar 1c)

**Protocolo:**

1. **Cmd+R completo** en la sesión "test code" para asegurar estado fresco.
   > **Importante:** NO haberle dado play a la sesión entre ahora y la captura. Si la sesión ha avanzado, `last_timestamp` será distinto y el baseline no será comparable al carácter.
2. Esperar a que el chart cargue completamente, **sin tocar play**, en TF M1.
3. Abrir DevTools → Console y ejecutar (snippet de **7 valores**: 6 del cluster `__algSuiteSeriesData/RealDataLen` + 1 nuevo `__algSuiteCurrentTime`):

```js
({
  seriesDataLen: window.__algSuiteSeriesData?.length,
  realDataLen:   window.__algSuiteRealDataLen,
  phantomCount:  (window.__algSuiteSeriesData?.length ?? 0) - (window.__algSuiteRealDataLen ?? 0),
  firstTime:     window.__algSuiteSeriesData?.[0]?.time,
  lastRealTime:  window.__algSuiteSeriesData?.[window.__algSuiteRealDataLen - 1]?.time,
  lastTotalTime: window.__algSuiteSeriesData?.[window.__algSuiteSeriesData.length - 1]?.time,
  currentTime:   window.__algSuiteCurrentTime
})
```

4. Anotar los 7 valores. Tras aplicar 1c, repetir en idéntica situación (misma sesión, mismo TF, **Cmd+R fresco**, sin haber tocado play). Si los 7 valores cuadran al carácter, replicación perfecta.

**Justificación de los 7 valores:**
- Los 6 primeros validan **no-regresión** de 1b (el cluster `__algSuiteSeriesData/RealDataLen` debe seguir intacto).
- El 7º (`currentTime`) valida que **el refactor de 1c es transparente** — `setCurrentTime` y `clearCurrentTime` escriben/limpian el global con valores idénticos al pre-1c.

**Ventaja:** cero edit efímero. Los globales son accesibles directamente desde consola.

#### Protocolo build/dev (regla §8.1)

```bash
# 1. Identificar PID del dev (si está corriendo)
ps aux | grep "next dev" | grep -v grep

# 2. Matar dev
kill <PID>

# 3. (Opcional) limpiar .next/
rm -rf .next/

# 4. Build prod
npm run build
# Esperado: exit 0, cero warnings, hashes de chunks idénticos al post-1b
```

#### Verificaciones automáticas pre-commit (1 grep)

```bash
grep -nE "window\.__algSuiteCurrentTime\s*=" components/_SessionInner.js
```

**Esperado:** cero matches. Si aparece alguno, hay una escritura olvidada.

> Diferencia con 1b: solo 1 grep, no 3. Razón: `__algSuiteCurrentTime` es un primitivo (number/null), no admite mutación in-place ni acceso indexed.

#### Pruebas manuales mini-comprobación (Ramón, post-edits y post-build)

Tras `npm run build` exit 0, relanzar dev (`nohup npm run dev > /tmp/forex-dev.log 2>&1 &; disown`) + Cmd+R en navegador:

1. **Sesión "test code" carga**, chart visible.
2. **Baseline post-1c cuadra**: ejecutar el snippet de **7 valores** (con Cmd+R fresco, sin play). Comparar contra baseline pre-1c. **Los 7 valores deben cuadrar al carácter.**
3. **Cambio TF M1→H1**: chart se redibuja sin huecos.
4. **Cambio TF H1→M1**: vuelve a M1 sin descolocar nada.
5. **Cambio de par durante sesión** (ESPECÍFICO DE 1c): cargar la sesión, cambiar entre EUR/USD ↔ GBP/USD (si están ambos disponibles, o entre dos pares cualesquiera). Verificar:
   - El segundo par carga sin saltar de fecha (ej. si EUR/USD está en 2024-08-23 y cambias a GBP/USD, GBP/USD aparece también en 2024-08-23, no en su `date_from`).
   - `seekToTime(masterTime)` debe disparar correctamente — esto valida que la lectura `L1218 const masterTime = window.__algSuiteCurrentTime` sigue leyendo el valor correcto que `setCurrentTime` escribe.

**Criterio de paso:** los 5 puntos OK + baseline cuadra → 1c validada.
**Criterio de fallo:** chart vacío, error en consola tipo `Cannot read properties of undefined`, baseline NO cuadra, par nuevo aparece en fecha incorrecta tras cambio → revert.

**Señales de rotura específicas de 1c:**
- Sesión nueva arranca en una fecha rara (currentTime stale del anterior — `clearCurrentTime` no se llamó al cargar la sesión).
- Cambio de par hace `seekToTime(masterTime)` con un valor incorrecto y el par nuevo aparece en otra fecha.
- Error `Cannot read properties of undefined` al cambiar de par (el global está stale y la lectura L1218 lee `undefined`).
- Baseline post-1c NO cuadra con baseline pre-1c en el 7º valor (`currentTime`).

**Rollback:** revert del commit. Toca solo `lib/sessionData.js` (+25 líneas) y `_SessionInner.js` (cambios mínimos en 4 líneas: 1 import + 3 sustituciones). `git revert <hash>` deja exactamente el estado post-1b. Cero coordinación con otros archivos.

#### Riesgos identificados (específicos de 1c)

> Adapto la estructura del §4. Ordenados por gravedad descendente.

**R1 — Romper el sync entre engines de pares distintos. (CRÍTICO)**
- Síntoma: cambio de par hace que `seekToTime(masterTime)` salte a una fecha incorrecta. El par nuevo aparece en su `date_from` en lugar del momento actual del replay.
- Análisis: la lectura L1218 (`const masterTime = window.__algSuiteCurrentTime`) depende de que `setCurrentTime` haya escrito el global correctamente desde `engine.onTick` (L772). Si `setCurrentTime` falla silenciosamente (guard mal puesto, asignación a propiedad equivocada), `masterTime` queda stale o `undefined`.
- Mitigaciones:
  1. `setCurrentTime` es función pura de asignación. Sin async, sin I/O.
  2. Cuerpo trivial verificable (3 líneas).
  3. Mini-comprobación punto 5 valida explícitamente cambio EUR/USD ↔ GBP/USD.
  4. Si falla, rollback atómico (`git revert <hash>`).

**R2 — L1225 es línea compuesta — riesgo de pisar otras sentencias.**
- Síntoma: si el `str_replace` toca por error las sentencias `setCurrentPrice(...)` o `setDataReady(true)`, el flujo de cambio de par se rompe (el precio actual no se actualiza, o el flag `dataReady` no se setea, lo que afecta a otros effects que dependen de él).
- Mitigaciones:
  1. Read previo de L1224-L1226 obligatorio antes del str_replace #3 (aviso ⚠️ en la tabla).
  2. El `old_string` debe aislar SOLO `if(typeof window!=='undefined') window.__algSuiteCurrentTime=ps.engine.currentTime` (sin `;` antes ni después).
  3. Verificación del diff visual antes del commit.

**R3 — Olvido de alguna de las 3 escrituras.**
- Síntoma: una de las 3 ramas (L528, L772, L1225) sigue escribiendo el global "a pelo" mientras las otras 2 lo hacen vía la nueva API. Inconsistencia silenciosa.
- Mitigación: el `grep -nE "window\.__algSuiteCurrentTime\s*=" components/_SessionInner.js` debe devolver 0 matches.

**R4 — Imports circulares / break del bundle.**
- Síntoma: `Cannot access 'X' before initialization` en runtime, o build falla con error de resolución.
- Análisis: `lib/sessionData.js` ya importa `./supabase` y NO importa nada de `components/`. Las 2 nuevas funciones no requieren imports adicionales. `_SessionInner.js` ya importa `setSeriesData/updateSeriesAt`; añadir 2 imports más al mismo `import` es trivial.
- Mitigación: `npm run build` lo detecta antes del commit.

**R5 — `clearCurrentTime` no se llama al cargar la sesión.**
- Síntoma: el global persiste entre navegaciones SPA. Si Ramón abre sesión A, avanza, navega a sesión B (sin reload completo), B podría arrancar con `currentTime` stale de A.
- Análisis: el guard de L568 (`refreshChallengeStatus` fallback) y el guard de L753 (`rawMaster` al cargar par) ambos comprueban truthy del global. Si el global es null, ambos caen al fallback siguiente. La lectura L1218 (`masterTime` al cambiar par) NO tiene guard — si el global es null, `masterTime = null`, lo que redirecta el flujo a `seekToTime(null)` que maneja el caso (en `replayEngine.js`).
- Mitigación: la sustitución #1 (L528 → `clearCurrentTime()`) es justamente lo que evita este problema. La verificación es validar mini-comprobación punto 5.

**R6 — Bug #6 ("Object is disposed") puede manifestarse al hacer pruebas rápidas de cambio de sesión.**
- Síntoma: error en consola al navegar rápido entre sesiones.
- Análisis: bug preexistente del CLAUDE.md §9, no causado por 1c. Si Ramón observa este error durante mini-comprobación, anotarlo en `core-analysis.md §5` para fase 3/4 — NO arreglar en 1c.
- Mitigación: documentado como pre-existente, NO cuenta como rotura de 1c.

**Validación final antes del commit:**
1. `npm run build` en local. Si falla, no propongo commit.
2. Grep automático de cero residuos (`grep -nE "window\.__algSuiteCurrentTime\s*=" components/_SessionInner.js` → 0 matches).
3. Enseño `git diff` completo a Ramón.
4. Mini-comprobación manual de Ramón en navegador con baseline post-1c (7 valores cuadran al carácter).
5. Espero **OK explícito**.
6. Solo entonces ejecuto `git commit`.

**Commit message sugerido:**
```
refactor(fase-1c): centralizar escritura de __algSuiteCurrentTime

- lib/sessionData.js expone setCurrentTime(t) y clearCurrentTime() —
  ambos con guard SSR interno
- _SessionInner.js delega las 3 escrituras a la nueva API:
  · L528 → clearCurrentTime() (session load)
  · L772 → setCurrentTime(engine.currentTime) (engine.onTick)
  · L1225 (3ª sentencia de línea compuesta) → setCurrentTime(ps.engine.currentTime) (activePair effect)
- Lecturas siguen direct (L568 fallback challenge, L753 rawMaster, L1218 masterTime sync engine) — fase 2
- Sin cambios funcionales: global escrito con valores idénticos al
  pre-refactor (validado por baseline al carácter en sesión 'test code',
  7 valores incluyendo currentTime)
```

---

## 4. Riesgos identificados y mitigaciones

> Ordenados por gravedad descendente.

### Riesgo 1 — Romper el orden de escrituras dentro de `updateChart` (sub-fase 1b)

**Síntoma:** drawings descolocados de forma persistente, o crash del autoscale (`Cannot read properties of undefined (reading 'minValue')`).
**Mitigación:** mantengo el orden EXACTO actual: phantoms → setData → setSeriesData. La función `setSeriesData` no hace I/O ni async, es asignación pura. Antes de comitear sub-fase 1b, hago un diff visual para verificar que el orden de cada rama es idéntico al original.
**Señal a Ramón:** errores nuevos en consola al cambiar TF.

### Riesgo 2 — `fetchSessionCandles` async se ejecuta en orden distinto al actual (sub-fase 1a)

**Síntoma:** dataset vacío al primer render, o race condition con cambio de sesión rápido.
**Mitigación:** la firma de `loadPair` no cambia (sigue siendo async). El `await` se mantiene en el mismo punto del flujo. Solo cambia el origen de los datos.
**Señal:** chart vacío o error tipo `Cannot read properties of undefined (reading 'length')`.

### Riesgo 3 — Olvidarse de cubrir alguna rama de `updateChart` (sub-fase 1b)

`updateChart` tiene 4 ramas con escrituras de globales. Si me dejo una, esa rama escribe el global "a pelo" y el resto via `setSeriesData`. Inconsistencia silenciosa.
**Mitigación:** después de la edición, ejecutar:
```bash
grep -n "__algSuiteSeriesData\|__algSuiteRealDataLen" components/_SessionInner.js
```
Solo deben quedar las **lecturas** listadas en §2.3 (L854–855, L1138). Cualquier otra coincidencia = escritura olvidada.

### Riesgo 4 — Imports circulares

**Síntoma:** `Cannot access 'X' before initialization` en runtime.
**Mitigación:** `lib/sessionData.js` NO importa nada de `components/`. Solo de otras `lib/` si hace falta (probable que no haga falta nada).

### Riesgo 5 — Romper Vercel build

**Síntoma:** `npm run build` falla.
**Mitigación:** antes del commit final de cada sub-fase, corro `npm run build` localmente. Si falla, no comiteo.
**Señal a Ramón:** Vercel emails de build failure si por error pusheas la rama (no debería pasar — no hay push en la fase).

### Riesgo 6 — Tocar el bug #1 sin querer (resolver o agravar)

Si las hipótesis 1, 4 o 5 del bug #1 (§5 del análisis) son ciertas, la centralización podría hacer el bug más visible o, al revés, enmascararlo accidentalmente.
**Mitigación:** durante las pruebas de cada sub-fase, Ramón verifica explícitamente "drawings al cambiar TF" como criterio. Si se ve mejor o peor, lo apuntamos en `core-analysis.md` para fase 3/4.

---

## 5. Criterio de "fase 1 terminada"

La fase 1 está completa cuando se cumplen TODAS estas condiciones:

1. ✅ Sub-fases 1a, 1b y 1c comiteadas en `refactor/fase-1-data-layer`.
2. ✅ `lib/sessionData.js` existe y es el único módulo que escribe `__algSuiteSeriesData`, `__algSuiteRealDataLen`, `__algSuiteCurrentTime`.
3. ✅ `grep -rn "window\.__algSuiteSeriesData\s*=" components/ pages/ lib/` devuelve **solo** matches dentro de `lib/sessionData.js`.
4. ✅ Lo mismo con `__algSuiteRealDataLen` y `__algSuiteCurrentTime`.
5. ✅ `npm run build` pasa.
6. ✅ Ramón ha probado manualmente las 3 sub-fases y reporta cero regresiones nuevas.
7. ✅ Los 6 bugs del CLAUDE.md §9 siguen exactamente como estaban (ni mejor ni peor — la fase 1 NO los pretende arreglar).

---

## 6. Lista de NO HACER en la fase 1

> Cosas que es tentador tocar pero rompen el alcance. Si me veo haciéndolas, paro y aviso.

1. **NO** eliminar los globales `window.__algSuite*`. Decisión Ramón §7 punto 3.
2. **NO** reescribir las lecturas (chartCoords, autoscaleInfoProvider, los 3 sitios en `_SessionInner.js`). Eso es fase 2/3.
3. **NO** tocar `lib/replayEngine.js`. Está bien.
4. **NO** tocar drawings (`useDrawingTools.js`, `useCustomDrawings.js`, plugin). Fase 4.
5. **NO** tocar el lifecycle del plugin LWC ni el polling 300 ms de `getSelected()`. Fase 4.
6. **NO** borrar el debug muerto `window.__algSuiteExportTools` ni el `RULER` no usado ni el drag SL/TP duplicado. Fase de limpieza.
7. **NO** añadir tests automáticos. Decisión Ramón en CLAUDE.md §5.4 — depende del momento, no es ahora.
8. **NO** introducir TypeScript ni cambiar a `app/` router.
9. **NO** instalar dependencias nuevas. Regla absoluta CLAUDE.md §3.4.
10. **NO** hacer migraciones de Supabase. Regla absoluta CLAUDE.md §3.1.
11. **NO** mergear nada a `main` durante la fase. Solo commits en `refactor/fase-1-data-layer`.
12. **NO** hacer push a GitHub. Regla absoluta CLAUDE.md §3.2.
13. **NO** refactorizar `updateChart` más allá de sustituir las 5 escrituras. Su lógica de phantoms y ramas se queda intacta — eso es fase 3 (render layer).
14. **NO** refactorizar `loadPair` más allá de delegar el bloque de fetch. La creación del engine, el `engine.onTick`, el `updateChart` inicial — todo eso se queda igual.
15. **NO** documentar/comentar código que ya funciona "porque ya estoy aquí". Solo cambios funcionales necesarios.

---

## 7. Resumen ejecutivo (para que Ramón decida en 30 s)

- **3 sub-fases**, ~2.5 sesiones de trabajo, mergeables sueltas dentro de la rama.
- **1 archivo nuevo**: `lib/sessionData.js`.
- **1 archivo modificado**: `components/_SessionInner.js` (15 puntos puntuales en §2.2, sin tocar lógica).
- **0 archivos del resto del repo modificados**.
- **0 cambios funcionales esperados**: el sistema debe verse y comportarse exactamente igual.
- **Validación**: Ramón prueba manualmente cada sub-fase antes de pasar a la siguiente. **Antes de cada commit, le enseño el `git diff` completo y espero OK explícito** (ver §3.1, §3.2, §3.3 → "Validación final").
- **Rama**: `refactor/fase-1-data-layer`. Ya creada. Sin push.

---

## 8. Lecciones operativas (sesión 27/4 noche, sub-fase 1a aplicada)

> Surgieron al ejecutar la sub-fase 1a. Se documentan aquí para que las sub-fases 1b, 1c y las fases siguientes no vuelvan a tropezar.

### 8.1 NUNCA `npm run build` con `npm run dev` corriendo sobre el mismo `.next/`

**Qué pasó (27/4):** durante la validación pre-commit de sub-fase 1a, se intentó `npm run build` con el dev server activo en paralelo. El build de producción sobrescribió chunks dentro de `.next/server/...` con la versión de prod (hashes nuevos), pero el dev server seguía sirviendo los nombres de chunk cacheados de la versión de desarrollo. Resultado: 404 en el navegador para `main.js`, `react-refresh.js`, `_app.js`, `_error.js`. El chart no cargó.

**Causa raíz:** dev y build comparten `.next/`. El build prod no es idempotente con el dev: machaca chunks con hashes distintos. El dev no recompila al vuelo si los archivos en disco ya están "actualizados" pero apuntan al artefacto equivocado.

**Recovery aplicado el 27/4:** matar PIDs de node, `rm -rf .next/`, relanzar dev como daemon (`nohup npm run dev > /tmp/forex-dev.log 2>&1 &; disown`).

**Protocolo correcto para validación pre-commit en sub-fases siguientes:**

```bash
# 1. Identificar PID del dev server
ps aux | grep "next dev" | grep -v grep

# 2. Matar dev
kill <PID>

# 3. (Opcional) limpiar .next/ para empezar de cero
rm -rf .next/

# 4. Build prod
npm run build
# verificar: exit 0 + cero warnings

# 5. Si OK, relanzar dev en background
nohup npm run dev > /tmp/forex-dev.log 2>&1 &
disown

# 6. Verificar arranque
tail -20 /tmp/forex-dev.log
```

**Alternativa futura (no urgente):** `git worktree` con dos copias del repo, una solo para dev, otra solo para builds ad-hoc. No se aplica en fase 1.

### 8.2 Inventario de variables huérfanas ANTES de mover bloques entre módulos

**Qué pasó (27/4):** la sub-fase 1a movió `replayTs / toTs / ctxTs / ctxYear / toYear / years / all / seen / filtered / ordinalCandles` desde `_SessionInner.js:740–786` a `lib/sessionData.js`. Tras aplicar los 4 edits, al recargar el navegador apareció en consola:

```
loadPair EUR/USD ReferenceError: replayTs is not defined
    at eval (_SessionInner.js:759:101)
```

**Causa raíz:** el plan §2.2 listó las líneas a borrar pero **no buscó referencias hacia atrás desde el resto del archivo** a las variables que vivían dentro de ese bloque. `replayTs` y `toTs` se usaban en L755 (validación `masterTime`) y L759 (fallback `resumeReal`), fuera del bloque borrado. Al moverlos al nuevo módulo, esas referencias quedaron huérfanas.

**Fix aplicado:** Opción A — `fetchSessionCandles` devuelve `{candles, replayTs, toTs}` en vez de solo `{candles}`, y el caller hace destructuring. Las referencias en L755/L759 quedan resueltas en scope sin tocar nada más.

**Protocolo preventivo para sub-fases 1b, 1c y fases 2–6:**

ANTES de aprobar cualquier `str_replace` que mueva bloques de código a otro archivo:

1. Listar todas las variables/constantes declaradas en el bloque a mover.
2. Para cada una, ejecutar:
```bash
   grep -nE "\b<varname>\b" components/_SessionInner.js
```
   (extender al resto de archivos del repo si hay sospecha de uso cruzado).
3. Filtrar matches:
   - Dentro del bloque borrado → irrelevantes.
   - Fuera del bloque → críticos. Decidir: (a) exportar desde el nuevo módulo, (b) descartar como falso positivo, o (c) replicar localmente.
4. Documentar las decisiones en el plan ANTES de ejecutar el `str_replace`.

### 8.2.1 Aplicación a sub-fase 1b (próxima)

Sub-fase 1b va a centralizar `__algSuiteSeriesData` y `__algSuiteRealDataLen`. ANTES de cualquier edit, ejecutar:

```bash
grep -nE "__algSuiteSeriesData" components/_SessionInner.js
grep -nE "__algSuiteSeriesData" lib/chartCoords.js
grep -nE "__algSuiteSeriesData" components/CustomDrawingsOverlay.js
grep -nE "__algSuiteSeriesData" components/RulerOverlay.js

grep -nE "__algSuiteRealDataLen" components/_SessionInner.js
grep -nE "__algSuiteRealDataLen" lib/chartCoords.js
grep -nE "__algSuiteRealDataLen" components/CustomDrawingsOverlay.js
grep -nE "__algSuiteRealDataLen" components/RulerOverlay.js
```

Inventariar tanto escrituras como lecturas. Plasmar el output en el plan §3.2 antes de ejecutar el primer `str_replace`.

### 8.3 macOS no tiene `timeout` por defecto

**Lección menor:** los scripts bash que usen `timeout 60 bash -c '...'` fallan en macOS con `command not found: timeout`. Alternativas:

- `brew install coreutils` y usar `gtimeout`.
- Workaround bash puro: `(sleep 60 && kill -9 $$) & ; <comando>`.
- Confiar en heurística (sleep + check).

No es crítico, solo se apunta para evitar reintento en futuras sub-fases.

### 8.4 Comandos git como operaciones SEPARADAS, no encadenadas con `&&`

**Qué pasó (27/4):** en el commit del plan táctico (`0180b6f`) se metieron `git add + git commit + echo --- + git log --oneline -4` en una sola Bash encadenada con `&&`. Eso significa un único permiso para 4 operaciones distintas, lo cual rompe la regla de granularidad de control de Ramón (CLAUDE.md §5.3).

**Protocolo:** en sub-fases siguientes, pedir y ejecutar cada operación git como Bash separada. `git add` aparte. `git commit` aparte. `git log` aparte. Cada una con su permiso individual. Ya se respetó en el commit `6f7d829` de sub-fase 1a — mantener para 1b, 1c y fases 2–6.
