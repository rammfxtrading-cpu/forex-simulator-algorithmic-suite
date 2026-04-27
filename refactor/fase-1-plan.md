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
| 8 | L1096 | `window.__algSuiteSeriesData=[...agg,...cr.phantom];window.__algSuiteRealDataLen=agg.length` (rama "full") | `setSeriesData([...agg, ...cr.phantom], agg.length)` |
| 9 | L1129 | mismo write (rama "vela TF nueva") | `setSeriesData(...)` |
| 10 | L1155 | mismo write (fallback dentro de "vela TF nueva") | `setSeriesData(...)` |
| 11 | L1166–1168 | `window.__algSuiteSeriesData[agg.length-1] = agg[agg.length-1]` (within-bucket, mutación in-place) | `updateSeriesAt(agg.length-1, agg[agg.length-1])` |
| 12 | L1181 | mismo write completo (fallback within-bucket) | `setSeriesData(...)` |

**Sub-fase 1c — escritura de `__algSuiteCurrentTime`:**

| # | Línea | Qué hay hoy | Qué pasa a haber |
|---|---|---|---|
| 13 | L527 | `window.__algSuiteCurrentTime = null` (en session load) | `clearCurrentTime()` |
| 14 | L811 | `if(typeof window!=='undefined') window.__algSuiteCurrentTime=engine.currentTime` (en engine.onTick) | `setCurrentTime(engine.currentTime)` |
| 15 | L1266 | mismo write (en effect de cambio de activePair) | `setCurrentTime(ps.engine.currentTime)` |

### 2.3 Lecturas que NO se tocan en fase 1 (lista explícita)

> Estas lecturas seguirán leyendo `window.__algSuite*` directo. No las consideramos deuda hasta fase 2/3.

| Archivo | Línea | Lo que lee |
|---|---|---|
| `_SessionInner.js` | 792 | `window.__algSuiteCurrentTime` (validación masterTime al cargar par) |
| `_SessionInner.js` | 854 | `window.__algSuiteSeriesData` (autoscaleInfoProvider) |
| `_SessionInner.js` | 855 | `window.__algSuiteRealDataLen` (autoscaleInfoProvider) |
| `_SessionInner.js` | 858 | `window.__chartMap` (autoscaleInfoProvider) — fuera de alcance, no es `__algSuite*` |
| `_SessionInner.js` | 1138 | `window.__algSuiteDebugLS` y `__algSuiteExportTools` — debug muerto, fase de limpieza |
| `_SessionInner.js` | 1259 | `window.__algSuiteCurrentTime` (sync engine al cambiar par) |
| `_SessionInner.js` | 567 | `window.__algSuiteCurrentTime` (refreshChallengeStatus fallback) |
| `_SessionInner.js` | 144 | `window.__chartMap = chartMap` (write — pero es ref a un ref, no a __algSuite*) |
| `lib/chartCoords.js` | 9, 11, 89, 96 | `__algSuiteSeriesData / __algSuiteRealDataLen` |

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

**Tamaño:** ~30 líneas tocadas en `_SessionInner.js` + ~30 añadidas en `lib/sessionData.js`. **Sesiones:** 1. **Riesgo:** medio.

**Por qué medio:** estas escrituras viven dentro de `updateChart`, que es la función más caliente del replay. Si invertimos accidentalmente el orden de operaciones (ej. escribir el global ANTES de `cr.series.setData`), el `autoscaleInfoProvider` puede leer datos stale en el primer frame y reescalar el eje Y.

**Archivos creados:** ninguno (se añade a `lib/sessionData.js`).

**Archivos modificados:**
- `lib/sessionData.js` — añadir:
  ```js
  export function setSeriesData(allData, realLen) {
    if (typeof window === 'undefined') return
    window.__algSuiteSeriesData = allData
    window.__algSuiteRealDataLen = realLen
  }
  export function updateSeriesAt(index, candle) {
    if (typeof window === 'undefined' || !window.__algSuiteSeriesData) return
    window.__algSuiteSeriesData[index] = candle
  }
  export function clearSeriesData() {
    if (typeof window === 'undefined') return
    window.__algSuiteSeriesData = undefined
    window.__algSuiteRealDataLen = undefined
  }
  // (getters readonly opcionales, ver §3.4)
  ```
- `components/_SessionInner.js`:
  - Sustituir L1096, L1129, L1155, L1181 → `setSeriesData([...agg, ...cr.phantom], agg.length)`
  - Sustituir L1166–1168 → `updateSeriesAt(agg.length - 1, agg[agg.length - 1])`
  - Añadir import `import { setSeriesData, updateSeriesAt } from '../lib/sessionData'`

**Archivos NO tocados:** todo lo de §2.4 + las 14 lecturas listadas en §2.3.

**Cuidado clave (orden de escritura):** en cada rama de `updateChart`, el orden actual es:
1. `cr.phantom = ...` (regenerar phantoms)
2. `cr.series.setData(...)` o `cr.series.update(...)` (LWC)
3. Escribir `window.__algSuite*`

Mantenemos ESE orden exacto. La función `setSeriesData` solo escribe los globales — no toca `cr.series`. Así garantizamos cero cambio observable.

**Pruebas manuales (Ramón):**
1. **Drawings no se mueven al cambiar de TF**: dibujar un TrendLine en M1, cambiar M1→H1→M5→H4→M1. La línea debe quedarse en el mismo timestamp/precio.
2. **Replay funciona**: play en M5 a velocidad 60×, ver que avanzan velas, no hay errores en consola.
3. **Within-bucket update visible**: en H1, sin avanzar a la siguiente hora, observar que la última vela se mueve con el precio (cola del replay). Esto es la rama L1166-1168.
4. **Cambio de par durante replay**: cambiar EUR/USD ↔ GBP/USD durante play — el sync de engines sigue funcionando.
5. **Posiciones se ven**: abrir un BUY, verificar que las líneas SL/TP se renderizan en el sitio correcto.

**Señales de rotura:**
- Drawings se descolocan inmediatamente al cambiar TF (más que antes).
- Error `Cannot read properties of undefined (reading 'minValue')` en consola — el autoscaleInfoProvider está leyendo el global antes de que esté seteado.
- Chart se queda en blanco tras un cambio de TF.
- Drawings que estaban a la derecha del precio (zona phantom) desaparecen.

**Rollback:** revert del commit. Como solo se tocan 5 líneas en `_SessionInner.js` y se añaden ~15 en `sessionData.js`, el revert es seguro.

**Validación final antes del commit:**
1. `npm run build` en local. Si falla, no propongo commit.
2. `grep -n "__algSuiteSeriesData\s*=\|__algSuiteRealDataLen\s*=" components/_SessionInner.js` → debe devolver **cero matches** (ya no hay escrituras directas).
3. Enseño `git diff` completo a Ramón.
4. Espero **OK explícito**.
5. Solo entonces ejecuto `git commit`.

**Commit message sugerido:**
```
refactor(fase-1b): centralizar escritura de __algSuiteSeriesData/RealDataLen

- lib/sessionData.js expone setSeriesData/updateSeriesAt/clearSeriesData
- updateChart en _SessionInner.js delega las 5 escrituras a la nueva API
- Las lecturas (autoscaleInfoProvider, chartCoords) siguen direct — fase 2
- Sin cambios funcionales
```

---

### 3.3 Sub-fase 1c — Centralización de `__algSuiteCurrentTime`

**Tamaño:** ~5 líneas tocadas + ~15 nuevas. **Sesiones:** 0.5. **Riesgo:** bajo-medio.

**Archivos modificados:**
- `lib/sessionData.js` — añadir `setCurrentTime(t)`, `clearCurrentTime()`, `getCurrentTime()` (este último solo si lo necesitamos para alguna lectura interna del módulo).
- `components/_SessionInner.js`:
  - L527 → `clearCurrentTime()`
  - L811 → `setCurrentTime(engine.currentTime)`
  - L1266 → `setCurrentTime(ps.engine.currentTime)`
  - Añadir imports.

**Archivos NO tocados:** todo lo de §2.4 + las lecturas L567, L792, L1259.

**Pruebas manuales (Ramón):**
1. **Cambio de par sincronizado**: cargar EUR/USD, avanzar replay 50 velas, cambiar a GBP/USD, comprobar que GBP/USD aparece en el mismo timestamp.
2. **Apertura de sesión limpia**: abrir sesión A, avanzar, navegar a otra sesión B (mismo par o distinto). B debe arrancar en su `date_from`, no en el currentTime de A.
3. **Challenge HUD día Madrid**: en una sesión challenge, avanzar replay cruzando medianoche Madrid, ver que el DD diario se resetea (esto usa `currentTimeRef.current` directamente, no el global, pero confirma el flujo).

**Señales de rotura:**
- Sesión nueva arranca en una fecha rara (currentTime stale del anterior).
- Cambio de par hace `seekToTime(masterTime)` con un valor incorrecto y el GBP/USD aparece en otro año.

**Rollback:** revert.

**Validación final antes del commit:**
1. `npm run build` en local. Si falla, no propongo commit.
2. `grep -n "__algSuiteCurrentTime\s*=" components/_SessionInner.js` → debe devolver **cero matches**.
3. Enseño `git diff` completo a Ramón.
4. Espero **OK explícito**.
5. Solo entonces ejecuto `git commit`.

**Commit message sugerido:**
```
refactor(fase-1c): centralizar escritura de __algSuiteCurrentTime

- lib/sessionData.js expone setCurrentTime/clearCurrentTime
- 3 sitios en _SessionInner.js usan la nueva API (session load, onTick, activePair effect)
- Lecturas siguen direct — fase 2
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
