# HANDOFF — cierre sesión 14 (deuda 4.6 cerrada en producción)

> Fecha: 3 mayo 2026, sesión "simulador 14".
> Autor: Claude Opus 4.7 (CTO/revisor en chat web) + Claude Code (driver técnico en terminal) + Ramón Tarinas (pegamento humano).
> Estado al redactar: `origin/main` = `2851ef7`. Fix de la deuda 4.6 desplegado en producción Vercel y smoke producción OK al carácter. Sesión 14 cierra la deuda 4.6 en una única sesión.

---

## §1 — Resumen ejecutivo (en lenguaje llano)

**Bug arreglado al carácter en producción:** los drawings (LongShortPosition, TrendLine, Rectangle, FibRetracement, Path) ya NO se descolocan al borde izquierdo de la pantalla cuando el alumno cambia de TF a una granularidad mayor (M5→M15, M5→H1, etc.). Ahora se anclan a la vela cerrada anterior (equivalente al `floor` que hace TradingView).

**Cómo se arregló:** parche de **1 línea** en el plugin LWC custom (`vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js`). En lugar de devolver un índice fraccionario que la API estándar de lightweight-charts no sabe interpolar (devuelve coordenada `0` = borde izquierdo del canvas), el plugin ahora devuelve el índice entero del bucket anterior. Cambio mínimo, riesgo mínimo, simétrico con las otras 2 ramas de la misma función que ya devolvían enteros.

**Tiempo total sesión:** ~3h. Diagnóstico denso al carácter con instrumentación temporal del plugin (descartada al cierre), fix de 1 línea aplicado en rama feature, build verde, smoke local 3/3 OK, merge a main, push, smoke producción 3/3 OK.

**Estado producción al cierre:** `simulator.algorithmicsuite.com` deployada en `2851ef7`. Verificada al carácter por Ramón. Bug "drawing al borde izquierdo tras cambio TF" cerrado.

**Decisión arquitectónica:** Camino A "bien hecho" según resolución de sesión 13 — snap a vela existente en RENDER, sin mutar timestamps persistidos. Compatible con CLAUDE.md §4.3 (datos persistidos intactos). Equivalente al comportamiento de TradingView verificado por Ramón al carácter en sesión 13 (D1→M5: punto del 30 abr aparece en 29 abr 21:00 UTC = `floor` por timestamp).

**Sub-fase 4d (commit `e9f460b`) preservada al carácter:** drawings sobre phantoms (a la derecha de la última vela real) siguen funcionando durante el play. La rama de extrapolación a la derecha del plugin NO se ha tocado. Asimetría intencional, justificada y validada con smoke en M1.

**Decisión de Ramón contra recomendación CTO:** Ramón eligió push a producción hoy contra la recomendación CTO de "smoke local hoy + push mañana en frío". Decisión documentada al carácter, riesgo aceptado, smoke producción OK. No hubo regresiones detectadas.

---

## §2 — Estado al carácter al cierre de sesión 14

### §2.1 Git

```
HEAD local main:    2851ef7 fix(deuda-4.6): snap timestamp al floor en interpolateLogicalIndexFromTime para que logicalToCoordinate devuelva pixel valido
HEAD origin/main:   2851ef7 (sincronizado)
Working tree:       limpio
Rama feature:       fix/deuda-4.6-cambio-tf-drawings (mergeada por fast-forward, conservada localmente, puede borrarse en próxima sesión)
```

Historia post-merge en `main`:

```
2851ef7 fix(deuda-4.6): snap timestamp al floor en interpolateLogicalIndexFromTime para que logicalToCoordinate devuelva pixel valido
d90b2f1 docs(sesion-13): cerrar sesión 13 con matriz Op 1/Op 2 + diagnóstico técnico parcial deuda 4.6
c15508b docs(sesion-12): cerrar sesión con smoke producción OK + deuda 4.6 nueva
8d99188 docs(fase-4d): cerrar sub-fase 4d con HANDOFF
e9f460b fix(fase-4d): recalcular phantoms necesarias en cada vela TF nueva durante play (deuda 4.4)
```

### §2.2 Producción Vercel

- Deploy en HEAD `2851ef7`.
- URL: `https://simulator.algorithmicsuite.com`.
- Estado: Ready, verde.
- Smoke al carácter por Ramón: 3/3 OK (caso original M5→M15, no-regresión sub-fase 4d play en M1, especular M15→M5).

### §2.3 Hitos invariantes fase 4 vivos

Verificados al carácter al INICIO de la sesión 14 desde shell zsh nativa de Ramón:

```
$ grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"
(vacío) ✓

$ grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"
(vacío) ✓

$ grep -n "computePhantomsNeeded" components/_SessionInner.js
116:function computePhantomsNeeded(tools, lastT, tfSecs){
1121:        _phN = computePhantomsNeeded(tools, _lastT, _tfS2)
1178:        phantomsNeeded = computePhantomsNeeded(tools, newLastReal, newSecs)
✓ 3 matches en líneas exactas predichas
```

Render layer 100% aislado en `lib/chartRender.js`. Helper `computePhantomsNeeded` con sus 2 consumidores. Cambios de la sesión 14 NO afectan al data layer ni al render layer — solo al plugin `vendor/`.

### §2.4 Bugs en producción

| Bug | Estado | Notas |
|---|---|---|
| **Deuda 4.6** — drawing se descoloca al cambiar TF (granularidad) | ✅ **CERRADO** | Fix `2851ef7` desplegado y verificado al carácter |
| Bug del play TF bajo + speed máx (LongShortPosition) | ✅ Cerrado desde sesión 12 | Sub-fase 4d, fix `e9f460b` |
| Deuda 4.5 — `__algSuiteExportTools` no registrado | ⏳ Backlog | Apuntada en `HANDOFF-cierre-fase-4d.md` §7.4 |
| Warning lifecycle plugin LWC al borrar drawings (`_requestUpdate is not set`) | ⏳ Backlog | Probable fase 5 (drawings lifecycle), no bloqueante |
| B5 — `409 Conflict` `session_drawings` race | ⏳ Backlog | Pre-existente, no es regresión |
| Warning React `borderColor` shorthand | ⏳ Backlog | Pre-existente, cosmético |

---

## §3 — Op 1 — Verificación consola navegador (5 min)

### §3.1 Setup

Ramón ejecutó al carácter:
1. Recarga `https://simulator.algorithmicsuite.com` (producción pre-fix en HEAD `d90b2f1`).
2. Sesión EUR/USD M5 (sesión `0b28c175-05f1-463a-96e7-dcf8517d7b6a`).
3. Borrado de drawing pre-existente (LongShortPosition `DOETlAVCIXUh`).
4. Creado LongShortPosition NUEVO `yHJLK0gJRRjC` con 2 puntos.

### §3.2 Datos al carácter del drawing creado

```
P1: timestamp 1770306600 = 05 feb 2026 15:50 UTC
P2: timestamp 1770333600 = 05 feb 2026 23:20 UTC
```

§9.4 — error CTO: en su primer análisis CTO convirtió mal los timestamps a `11:30` y `19:00` (UTC). Ramón lo corrigió señalando el eje X de la captura. Conversión correcta: `15:50` y `23:20`. Apuntado.

Ambos timestamps son **no múltiplos de 15min** → caen entre dos buckets en M15 (`15:45-16:00` y `23:15-23:30` respectivamente). Setup ideal para reproducir el bug.

### §3.3 Click en M15 — observación al carácter

Ramón hizo click en M15. Capturó:

**Visual:** drawing **descolocado al borde izquierdo de la pantalla**. Las 2 esquinas mal mapeadas, ambas a la izquierda. Confirmación visual del bug.

**Consola del navegador:**
```
[InteractionManager] Mouse Down: ...yHJLK0gJRRjC
[InteractionManager] Mouse Up: ...yHJLK0gJRRjC. Attempting selection.
Exporting all line tools: ▶ [{...}]
```

**CERO warnings** del tipo `[BaseLineTool] pointToScreenPoint: Could not determine logical index` ni `Coordinate conversion failed`. → **Escenario C** literal del prompt de arranque.

### §3.4 Implicación

Refutados al carácter:
- **Escenario A** (función central devuelve `null`): no se da. La cadena resuelve valores finitos.
- **Escenario B** (`logicalToCoordinate` devuelve `null` con índice válido): tampoco. El fallback de extrapolación habría disparado warning B si fuera el caso.

Confirmado al carácter:
- **Escenario C**: la cadena devuelve valores finitos pero "fuera de pantalla" (drawing al borde izquierdo sin warning).
- Hipótesis del HANDOFF sesión 13 ("cache stale") **falsa** — verificado más tarde con instrumentación.
- El bug está en el flujo plugin → `logicalToCoordinate` de LWC core, NO en `interpolateLogicalIndexFromTime` ni en el cache.

**Op 1 cerrado al carácter.**

---

## §4 — Op 2 — Diagnóstico final con instrumentación (45 min)

### §4.1 Verificación al carácter del flujo de cambio TF

Antes de proponer Edits, CTO pidió a Ramón leer al carácter el flujo de cambio TF en `_SessionInner.js`:

```bash
$ grep -n "setSeriesData\|pluginRef\|exportTools\|importLineTools" components/_SessionInner.js | head -50
13:import { fetchSessionCandles, setSeriesData, ... } from '../lib/sessionData'
274:  const { pluginRef, ... exportTools, importTools, ... } = useDrawingTools({...})
1126:      setSeriesData([...agg, ...cr.phantom], agg.length)
1192:  },[pairTf,activePair,updateChart,deselectAll,exportTools])
...
```

```bash
$ sed -n '1140,1200p' components/_SessionInner.js
[...código del useEffect de cambio TF...]
```

Confirmado al carácter el orden del flujo:
1. `deselectAll()` — UX limpia.
2. `computePhantomsNeeded(tools, newLastReal, newSecs)`.
3. `cr._phantomsNeeded = phantomsNeeded`.
4. `updateChart(activePair, ps.engine, true)` ← internamente llama a `setSeriesData([...agg, ...cr.phantom], agg.length)` que actualiza el cache `window.__algSuiteSeriesData`.
5. `setTfKey(k => k+1)`.
6. `scrollToTail(cr, 8, ...)`.

**Implicación:** el cache `__algSuiteSeriesData` SE ACTUALIZA con datos M15 dentro del paso 4, antes de que el plugin redibuje los drawings.

§9.4 — refutada al carácter la hipótesis del HANDOFF sesión 13 que decía "cache stale durante el render del plugin". El cache está sincronizado al momento del render del drawing. Hipótesis muerta.

### §4.2 Lectura al carácter de las funciones del plugin parcheado

```bash
$ grep -rn "window.__algSuiteSeriesData" components/ pages/ lib/ vendor/
lib/sessionData.js:102:  window.__algSuiteSeriesData = allData
lib/sessionData.js:117:  window.__algSuiteSeriesData[index] = candle
lib/sessionData.js:170:  return window.__algSuiteSeriesData ?? null
vendor/.../lightweight-charts-line-tools-core.js:1485: const cachedData2 = ... && window.__algSuiteSeriesData;
vendor/.../lightweight-charts-line-tools-core.js:1589: const cachedData = ... && window.__algSuiteSeriesData;
```

§9.4 — corrección al HANDOFF sesión 13: decía "escrituras directas a `window.__algSuiteSeriesData` (líneas 1487 y 1589)". Es **incorrecto al carácter**. Las 2 zonas son **lecturas** (`const cachedData = ... && window.__algSuiteSeriesData`). El plugin lee el cache, no escribe.

```bash
$ sed -n '1580,1610p' vendor/.../lightweight-charts-line-tools-core.js
function interpolateLogicalIndexFromTime(chart, series, timestamp) {
    [...]
    const cachedData = typeof window !== 'undefined' && window.__algSuiteSeriesData;
    if (cachedData && cachedData.length >= 2) {
        const lastTime = Number(cachedData[cachedData.length - 1].time);
        const prevTime = Number(cachedData[cachedData.length - 2].time);
        const interval = lastTime - prevTime;
        if (givenTimeNum > lastTime) {
            return (cachedData.length - 1) + (givenTimeNum - lastTime) / interval;
        }
        let lo = 0, hi = cachedData.length - 1;
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1;
            if (Number(cachedData[mid].time) <= givenTimeNum) lo = mid;
            else hi = mid;
        }
        const tLo = Number(cachedData[lo].time);
        const tHi = Number(cachedData[hi].time);
        if (tHi === tLo || givenTimeNum <= tLo) return lo;
        if (givenTimeNum >= tHi) return hi;
        return lo + (givenTimeNum - tLo) / (tHi - tLo);
    }
    [...]
}
```

**Análisis al carácter:** la función tiene 4 ramas de retorno:
1. `if (givenTimeNum > lastTime)` → extrapolación a la derecha (drawings sobre phantoms futuras). Devuelve float. **Funciona OK** (sub-fase 4d).
2. `if (tHi === tLo || givenTimeNum <= tLo) return lo` → antes del primer dato. Devuelve entero. OK.
3. `if (givenTimeNum >= tHi) return hi` → exactamente sobre vela existente. Devuelve entero. OK.
4. **`return lo + (givenTimeNum - tLo) / (tHi - tLo)`** ← rama fractional. Devuelve float. **Sospechosa.**

### §4.3 Instrumentación 1 — `interpolateLogicalIndexFromTime` (rama crítica)

CTO propuso instrumentación temporal en rama nueva `debug/deuda-4.6-instrumentacion`.

**Edit aplicado al carácter** (rama feature debug, NO main):
- `wc -l` previo: `8737`.
- Predicción CTO: +8 líneas → `8745`.
- Resultado real: `8745` ✓.
- 3 logs gateados por `window.__algSuiteDebugDeuda46`, uno antes de cada return de la rama búsqueda binaria.
- Build verde, bundle `/session/[id]` sin variación (1.8 kB / 83.1 kB).

§9.4 — error CTO: predijo formato exacto de `git diff --stat` ("8 insertions, 1 deletion"). Real: "11 insertions, 3 deletions" (porque git cuenta cada línea modificada como 1 deletion + 1 insertion). El **net delta +8** sí coincidió con la predicción. Driver técnico Claude Code cazó la discrepancia y la documentó. Lección aplicada en instrumentaciones posteriores: NO predecir formato exacto de `git diff --stat`, solo predecir net delta y `wc -l`.

**Reproducción del bug con instrumentación activa.** Logs literales (extracto):

```
[deuda-4.6] interpolateLogical: BRANCH=fractional {givenTimeNum: 1770306900, lo: 11963, hi: 11964, tLo: 1770306300, tHi: 1770307200, returning: 11963.666666666666, cacheLen: ~11993, cacheLast: ...}
[deuda-4.6] interpolateLogical: BRANCH=fractional {givenTimeNum: 1770315600, lo: 11973, hi: 11974, tLo: 1770315300, tHi: 1770316200, ...}
[deuda-4.6] interpolateLogical: BRANCH=fractional {givenTimeNum: 1770333900, lo: 11993, hi: 11994, tLo: 1770333300, tHi: 1770334200, ...}
```

**Conclusiones al carácter:**
- Rama disparada en TODAS las consultas: **fractional** (rama 4 sospechosa).
- Cache **SÍ está en M15** al momento del render del drawing (intervalo `tHi - tLo = 900s = 15min`). Hipótesis "cache stale" definitivamente refutada.
- Búsqueda binaria correcta: para `15:50` → `lo=11963` (que es `15:45`), `hi=11964` (que es `16:00`). Devuelve `11963.666` (= `lo + 0.666`).
- El plugin devuelve un `logicalIndex` matemáticamente válido. **No es bug del plugin.**

§9.4 — apunte sobre Op 2: en la captura aparece un timestamp inesperado `1770315600` que no es ninguno de los 2 puntos del drawing (P1 ni P2). Análisis: `LongShortPosition` internamente tiene 3 puntos lógicos (entry + SL/TP + un tercer punto entry-line o midpoint). No es bug, es la naturaleza del tool.

§9.4 — apunte adicional: en la captura del primer Op 1, P1 era `1770306600` (15:50). En la captura del Op 3.2 con instrumentación, fue `1770306900` (15:55). Ramón creó drawing nuevo entre Ops, ligeramente distinto. No afecta al diagnóstico (ambos son no-múltiplos de 15min, ambos disparan rama fractional).

### §4.4 Instrumentación 2 — `pointToScreenPoint`

Tras descartar que el plugin devolviera `null` o degenerado en `interpolateLogicalIndexFromTime`, CTO añadió segunda instrumentación dentro de `pointToScreenPoint` (línea 6476 post-instrumentación 1) para capturar qué hace `timeScale.logicalToCoordinate` con el `logicalIndex` recibido.

**Edit aplicado al carácter:**
- `wc -l` previo: `8745`.
- Predicción CTO: +5 líneas → `8750`.
- Resultado real: `8750` ✓.
- 4 logs gateados: `AFTER_logicalToCoordinate`, `ENTERING_fallback`, `FALLBACK_extrapolated`, `FALLBACK_failed`, `FINAL`.
- Build verde, bundle sin variación.

**Reproducción del bug con AMBAS instrumentaciones activas.** Logs literales (extracto):

```
[deuda-4.6] interpolateLogical: BRANCH=fractional {givenTimeNum: 1770306900, ..., returning: 11963.666666666666}
[deuda-4.6] pointToScreen: AFTER_logicalToCoordinate {timestamp: 1770306900, logicalIndex: 11963.666666666666, x_directo: 0}
[deuda-4.6] pointToScreen: FINAL {timestamp: 1770306900, logicalIndex: 11963.666666666666, x_final: 0, y_final: 660.98, price: 1.1776}
```

**🎯 Causa raíz al carácter:**

`timeScale.logicalToCoordinate(11963.666)` devuelve **`0`** (no `null`). 

Como devuelve `0` (no `null`), el fallback de extrapolación dentro de `pointToScreenPoint` (rama `if (x === null)`) NO se dispara. El plugin termina devolviendo `Point(0, y_correcto)`. La `y` está bien (porque `priceToCoordinate` no depende del logicalIndex), pero `x = 0` = **borde izquierdo del canvas**. 

Eso explica al carácter por qué:
- ✓ Sin warning `[BaseLineTool]`.
- ✓ Drawing pegado al borde izquierdo de la pantalla.
- ✓ Altura del drawing correcta (porque `y` está bien calculada).
- ✓ Drawing aparece "comprimido en x=0" (las 2 esquinas en pixel 0, distintas en y).

### §4.5 Verificación adicional desde consola — comportamiento de `logicalToCoordinate`

Para confirmar al carácter el comportamiento de la API LWC core (no parcheable, viene de la librería estándar), CTO pidió a Ramón ejecutar desde la consola del navegador, con dev server corriendo en M15:

```javascript
const cr = window.__chartMap?.current?.['EUR/USD']
const ts = cr.chart.timeScale()
console.log('  entero 11963:', ts.logicalToCoordinate(11963))         // 769.8864...
console.log('  entero 11993:', ts.logicalToCoordinate(11993))         // 859.8864...
console.log('  fraccional 11963.666:', ts.logicalToCoordinate(11963.666))  // 0
console.log('  fraccional 11993.666:', ts.logicalToCoordinate(11993.666))  // 0
```

Output literal:
```
entero 11963:           769.8864410607421
entero 11993:           859.8864410607421
fraccional 11963.666:   0
fraccional 11993.666:   0
```

**Confirmado al carácter:**
- Índice **entero** → pixel real correcto.
- Índice **fraccional** → `0` (borde izquierdo).

Eso valida **al carácter** que el fix `return lo` (entero) funcionará: si en `interpolateLogicalIndexFromTime` devolvemos `11963` en lugar de `11963.666`, `logicalToCoordinate` devolverá `769.88` (pixel real) en lugar de `0` (borde izquierdo).

### §4.6 Decisión arquitectónica del fix

3 caminos tácticos considerados:

- **A1 — Snap en `lib/sessionData.js`** (exponer función `getNearestCandleTime`): requiere tocar el plugin para que la consuma → rompe boundary `vendor/`. Descartado.
- **A2 — Snap en el plugin LWC `vendor/`**: 1 línea modificada en `interpolateLogicalIndexFromTime`. Coherente con que el plugin ya está parcheado por el proyecto (zonas en líneas 1485 y 1589 son parches del proyecto). **Adoptado.**
- **A3 — Snap en `useDrawingTools.js` antes de pasar al plugin**: complicado porque el plugin internaliza los puntos en su estado al `importLineTools`. Cambiarlos cada cambio TF requeriría re-importar todos los drawings. Coste alto. Descartado.

**Estrategia de snap:** `floor` (devolver `lo` puro) en lugar de `nearest`. Razón: TradingView verificado por Ramón en sesión 13 hace `floor` por timestamp (D1→M5: punto del 30 abr aparece en 29 abr 21:00 UTC = cierre sesión forex). Adoptamos comportamiento equivalente.

**Asimetría intencional:**
- Rama 1 (extrapolación a la derecha, `if (givenTimeNum > lastTime)`): NO se toca. Sigue devolviendo float. Cubre drawings sobre phantoms futuras (sub-fase 4d, fix `e9f460b`).
- Rama 2 (`if (tHi === tLo || givenTimeNum <= tLo) return lo`): NO se toca. Ya devuelve entero.
- Rama 3 (`if (givenTimeNum >= tHi) return hi`): NO se toca. Ya devuelve entero.
- **Rama 4 (fractional, `return lo + (givenTimeNum - tLo) / (tHi - tLo)`): cambia a `return lo`.**

Las 3 ramas no fractionales ya devolvían enteros y funcionaban. Unificamos la rama 4 con la rama 2 (devolver `lo`). Cambio mínimo, cero efectos colaterales sobre los otros casos.

**Op 2 cerrado al carácter.**

---

## §5 — Op 3 — Fix `2851ef7`, smoke local, push, smoke producción (1h 30min)

### §5.1 Limpieza pre-fix — descartar instrumentación

Antes del fix, descartar al carácter las 2 instrumentaciones de la rama `debug/deuda-4.6-instrumentacion`. Comandos ejecutados desde shell zsh nativa de Ramón:

```bash
# Recuperar archivo a baseline pre-instrumentación
git checkout -- vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js

# Verificar
git status                # working tree clean
wc -l vendor/.../lightweight-charts-line-tools-core.js  # 8737 (baseline original)

# Saltar a main
git checkout main         # Switched to branch 'main'

# Borrar rama debug
git branch -D debug/deuda-4.6-instrumentacion
# Deleted branch debug/deuda-4.6-instrumentacion (was d90b2f1).
```

§9.4 — apunte: `git branch -D` (mayúscula) en lugar de `-d` (minúscula) porque `-d` se queja de "rama tiene cambios sin merge" (tenía la instrumentación). Como ya se descartaron los cambios al carácter, `-D` no perdió nada.

### §5.2 Crear rama del fix

```bash
git checkout -b fix/deuda-4.6-cambio-tf-drawings
# Switched to a new branch 'fix/deuda-4.6-cambio-tf-drawings'

git branch --show-current
# fix/deuda-4.6-cambio-tf-drawings
```

### §5.3 Edit del fix — al carácter

**Verificación PRE-edit** desde shell zsh nativa de Ramón:

```bash
$ wc -l vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js
8737

$ sed -n '1602,1612p' vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js
            else hi = mid;
        }
        const tLo = Number(cachedData[lo].time);
        const tHi = Number(cachedData[hi].time);
        if (tHi === tLo || givenTimeNum <= tLo) return lo;
        if (givenTimeNum >= tHi) return hi;
        return lo + (givenTimeNum - tLo) / (tHi - tLo);
    }
    // Fallback: linear interpolation with first two data points
    const dataAtIndex0 = series.dataByIndex(0, 0);
    const dataAtIndex1 = series.dataByIndex(1, 0);
```

Confirmada al carácter la zona del bug.

**Edit aplicado por Claude Code con `str_replace`:**

OLD STRING:
```javascript
        if (tHi === tLo || givenTimeNum <= tLo) return lo;
        if (givenTimeNum >= tHi) return hi;
        return lo + (givenTimeNum - tLo) / (tHi - tLo);
```

NEW STRING:
```javascript
        if (tHi === tLo || givenTimeNum <= tLo) return lo;
        if (givenTimeNum >= tHi) return hi;
        // Deuda 4.6: snap al floor (lo) cuando timestamp cae entre dos velas existentes.
        // Devolver fractIdx hace que logicalToCoordinate de LWC core devuelva 0
        // (borde izquierdo) en vez de interpolar. Equivale al floor de TradingView.
        return lo;
```

**Verificación POST-edit:**
- `wc -l = 8740` ✓ (predicción CTO `+3` neto exacta).
- `sed -n '1606,1612p'`: rama fractional reemplazada correctamente.
- `git diff --stat`: 4 insertions, 1 deletion (net +3) ✓.

### §5.4 Build local

`npm run build` ejecutado por Claude Code:
- ✓ Compiled successfully.
- ✓ 0 errores TypeScript.
- ✓ 6/6 páginas estáticas generadas.
- ✓ Bundle `/session/[id]`: 1.8 kB / 83.1 kB — idéntico al baseline (build verde, sin variación de bundle, plugin parcheado compila limpiamente).

### §5.5 Smoke local — 3 pruebas

`npm run dev` arrancado por Claude Code en background. URL local: `http://localhost:3000`. Ramón ejecutó al carácter en navegador (Cmd+Shift+R para invalidar cache):

#### §5.5.1 Prueba 1 — caso original M5 → M15

Setup:
- Sesión EUR/USD M5.
- LongShortPosition `kDgU4eamwa6U` con SL/TP a la derecha.
- P1: timestamp `1770302400` (= 14:40 UTC) → no múltiplo de 15.
- P2: timestamp `1770316800` (= 18:40 UTC) → no múltiplo de 15.

Acción: click en M15.

**Resultado al carácter:** drawing visible y anclado a velas reales (probablemente `floor` de cada timestamp en M15: vela `14:30` y `18:30`). NO al borde izquierdo. Sin warnings de `BaseLineTool`. ✅

Reacción de Ramón al carácter: "se quedan!!!!!!!!!!!!!!!" (literal del chat).

#### §5.5.2 Prueba 2 — no-regresión sub-fase 4d (play en M1 sobre phantoms)

Setup:
- Cambio a M1.
- LongShortPosition `DVsZK74wvVfT` con SL/TP a la derecha (sobre phantoms).
- P1: timestamp `1770314400` (= 18:00 UTC).
- P2: timestamp `1770324960` (= 20:56 UTC).

Acción: play a velocidad media durante 30-60 segundos.

**Resultado al carácter:** drawing mantiene dimensiones durante todo el play. Ráfaga continua de `Exporting all line tools: (3)` durante varios minutos (cada vela TF nueva). Sin warnings `[BaseLineTool]`. Sin descolocaciones, sin extrapolaciones. ✅

Reacción de Ramón: "se queda en el lugar durante el replay, bien".

#### §5.5.3 Prueba 3 — caso especular M15 → M5

Setup:
- TF M15.
- LongShortPosition `GpBdmIpiLjs5`.
- P1: timestamp `1770327900` (= 22:25 UTC).
- P2: timestamp `1770364800` (= 08:40 UTC siguiente día).

Acción: cambio a M5.

**Resultado al carácter:** drawing visible y anclado en sitio. M5 contiene los timestamps de M15 (la búsqueda binaria los encuentra exactos en velas reales) → no entra en rama fractional. Sin movimiento. ✅

Reacción de Ramón: "muy bien!".

**Smoke local 3/3 OK al carácter. Sub-fase 4d preservada. Caso original cerrado. Caso especular sin movimiento.**

### §5.6 Commit en rama feature

Comandos ejecutados por Claude Code con aprobación opción 1 manual:

```bash
git add vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js
git status   # Changes to be committed
git commit -m "fix(deuda-4.6): snap timestamp al floor en interpolateLogicalIndexFromTime ..."
# [fix/deuda-4.6-cambio-tf-drawings 2851ef7] fix(deuda-4.6): ...
#  1 file changed, 4 insertions(+), 1 deletion(-)

git log --oneline -3
# 2851ef7 fix(deuda-4.6): ...
# d90b2f1 docs(sesion-13): ...
# c15508b docs(sesion-12): ...
```

§9.4 — apunte: el mensaje del commit usa caracteres ASCII puros (sin tildes ni `ñ`) por convención de seguridad CLI/macOS. Contenido en español de España, solo destildado por compatibilidad. CTO documentó esta decisión técnica al carácter.

### §5.7 Decisión de Ramón contra recomendación CTO — push hoy

CTO recomendó al carácter: "smoke local hoy + push mañana en frío" siguiendo lección de sesión 12 ("push importante en frío reduce coste esperado de errores"). 

Ramón decidió contra esa recomendación: "push hoy.. procede de la manera correcta".

CTO documentó al carácter:
- Recomendación profesional era push mañana.
- Ramón eligió hoy.
- Decisión documentada, riesgo aceptado, avanzado.
- Riesgo manejable porque: (a) fix de 1 línea, (b) smoke local 3/3 OK, (c) último tramo es mecánico.

### §5.8 Merge a main

```bash
git checkout main
# Switched to branch 'main'
# Your branch is up to date with 'origin/main'.

git log --oneline -1
# d90b2f1 docs(sesion-13): ...

git merge fix/deuda-4.6-cambio-tf-drawings
# Updating d90b2f1..2851ef7
# Fast-forward
#  1 file changed, 4 insertions(+), 1 deletion(-)

git log --oneline -3
# 2851ef7 fix(deuda-4.6): ...
# d90b2f1 docs(sesion-13): ...
# c15508b docs(sesion-12): ...
```

Fast-forward limpio, sin merge commit, sin conflictos.

### §5.9 Push y deploy Vercel

```bash
git push origin main
# To https://github.com/rammfxtrading-cpu/forex-simulator-algorithmic-suite.git
#    d90b2f1..2851ef7  main -> main

git status
# On branch main
# Your branch is up to date with 'origin/main'.
# nothing to commit, working tree clean
```

Push limpio. Vercel detectó el commit y arrancó deploy automático.

### §5.10 Smoke producción

Tras ~2-3 min de espera, Vercel deploy Ready en HEAD `2851ef7`.

Ramón ejecutó al carácter las 3 mismas pruebas en `https://simulator.algorithmicsuite.com` (con Cmd+Shift+R para invalidar cache del bundle anterior):

1. **Prueba 1** (M5 → M15 con timestamps no múltiplos): ✅
2. **Prueba 2** (play M1 sobre phantoms): ✅
3. **Prueba 3** (M15 → M5 caso especular): ✅

Reacción de Ramón al cierre del smoke producción: "está bien".

**Smoke producción 3/3 OK al carácter. Deuda 4.6 cerrada en producción.**

**Op 3 cerrado al carácter. Deuda 4.6 oficialmente cerrada.**

---

## §6 — Errores §9.4 capturados durante la sesión

Disciplina §9.4 estricta: distinguir lo VERIFICADO (bytes en disco vistos en esta sesión) de lo INFERIDO (memoria, intuición, project_knowledge_search). Errores propios detectados, asumidos, corregidos en vivo.

### §6.1 Conversión Unix timestamp → UTC chapucera (CTO)

En el primer análisis del Op 1, CTO convirtió mal `1770306600` y `1770333600` a `11:30` y `19:00` UTC. Conversión correcta: `15:50` y `23:20`. Ramón lo detectó al señalar el eje X de la captura. CTO corrigió inmediatamente.

**Lección:** validar conversiones Unix timestamp con herramienta antes de afirmar. Especialmente cuando se construye argumentación sobre esa conversión.

### §6.2 Predicción del formato `git diff --stat` incorrecta (CTO)

CTO predijo "8 insertions, 1 deletion" en la primera instrumentación. Real: "11 insertions, 3 deletions" (porque git cuenta cada línea modificada como 1 deletion + 1 insertion). El **net delta +8** sí coincidió. Driver técnico Claude Code cazó la discrepancia y la documentó.

**Lección:** NO predecir formato exacto de `git diff --stat`. Solo predecir net delta y `wc -l`. Aplicada en instrumentaciones posteriores y en el commit final del fix.

### §6.3 Hipótesis "cache stale" — refutada por instrumentación (CTO)

El HANDOFF de sesión 13 apuntaba como hipótesis viva: "cache `__algSuiteSeriesData` no sincronizado con `timeScale` durante el render del plugin". CTO intentó construir diagnóstico sobre esa hipótesis al inicio de Op 2, hasta que la instrumentación demostró al carácter que el cache está sincronizado en M15 cuando el plugin renderiza.

**Lección:** las hipótesis heredadas de HANDOFFs son inferencias documentadas, NO verificaciones. El prompt de arranque ya lo apuntaba al carácter: "trátalas como punto de partida, no como verdad. Verificación al carácter en Op 1 es obligatoria antes de proponer Edit." Lección aplicada — la verificación al carácter refutó la hipótesis y nos llevó al diagnóstico correcto.

### §6.4 Documento HANDOFF-cierre-sesion-13.md no indexado al inicio de la sesión (CTO)

Al ejecutar PASO 0 documental con `project_knowledge_search`, CTO detectó al carácter que el HANDOFF-cierre-sesion-13.md (commit `d90b2f1`) NO estaba indexado en project_knowledge. CTO documentó esto explícitamente al inicio de la sesión y trabajó con el contenido del prompt de arranque (síntesis del HANDOFF redactada al cierre de sesión 13). Fue inferencia documentada, no verificación al carácter del archivo en disco.

**Lección:** Anthropic project_knowledge_search puede tener latencia indexando commits muy recientes. Cuando un HANDOFF crítico no aparece en search, el prompt de arranque sirve como síntesis suficiente para arrancar.

### §6.5 Corrección al HANDOFF sesión 13 — escrituras vs lecturas en `vendor/` (CTO)

HANDOFF sesión 13 decía: "el `vendor/...` está parcheado por el proyecto — tiene **escrituras** directas a `window.__algSuiteSeriesData` (líneas 1487 y 1589)". Verificado al carácter en sesión 14: las 2 zonas son **lecturas**, no escrituras. CTO documenta esta corrección para que sesiones futuras no construyan razonamiento sobre el dato erróneo.

### §6.6 Disciplina positiva aplicada (driver técnico Claude Code)

Claude Code cazó al carácter:
- La discrepancia de la predicción `git diff --stat` de CTO en la primera instrumentación.
- La discrepancia entre la línea predicha por CTO para `pointToScreenPoint` (sesión 13 dijo línea 6468; tras Edit de instrumentación 1, real 6476). Verificó cruzadamente: `8745 - 8737 = 8` líneas desplazadas. Coherente.

Disciplina §9.4 aplicada en su forma más estricta: ningún análisis cuenta como verificado si los bytes no han pasado por el shell de la sesión actual.

---

## §7 — Decisión arquitectónica del fix (referencia para sesiones futuras)

### §7.1 Camino A "bien hecho" — confirmado

Resolver `timestamp → vela existente` en RENDER, sin mutar timestamps persistidos. Compatible con CLAUDE.md §4.3 (datos persistidos intactos). Equivalente al comportamiento de TradingView.

### §7.2 Caminos descartados al carácter

- **Camino A "naïf"** (mutar timestamps en persistencia): viola CLAUDE.md §4.3. Descartado en sesión 13.
- **Camino B** (diagnóstico/parche interno del plugin LWC en `interpolateLogicalIndexFromTime`): el plugin tiene la lógica correcta de búsqueda binaria (verificado al carácter en sesión 14). Lo que falla es `logicalToCoordinate` de LWC core con índice fraccionario. **NO es bug del plugin pero el fix vive en el plugin** porque ahí podemos snappear el índice antes de pasarlo a la API LWC core (que no es parcheable directamente). Camino B **adoptado parcialmente**.
- **Camino C** (interpolación pixel-perfect tipo TradingView): TradingView NO interpola pixel-perfect — verificado por Ramón al carácter en sesión 13. Descartado.

### §7.3 Estrategia adoptada — `floor` por timestamp

Devolver `lo` (entero) en la rama fractional. Equivale al comportamiento que TradingView verificó Ramón al carácter en sesión 13 (D1→M5: punto del 30 abr aparece en 29 abr 21:00 UTC = cierre sesión forex = `floor` por timestamp).

### §7.4 Asimetría intencional preservada

Solo se toca la rama fractional (rama 4). Las otras 3 ramas de `interpolateLogicalIndexFromTime` NO se tocan:
- Rama 1 (extrapolación a la derecha): preserva sub-fase 4d.
- Rama 2 (antes del primer dato): ya devolvía entero.
- Rama 3 (después del último): ya devolvía entero.

### §7.5 Coste de performance

Eliminar el cálculo `(givenTimeNum - tLo) / (tHi - tLo)` y devolver `lo` puro reduce micro-coste. No es relevante (la función se llama O(N) veces durante render, pero la división era O(1) por llamada). Cambio neutro o ligeramente más rápido.

---

## §8 — Backlog actualizado al cierre de sesión 14

### §8.1 Deudas cerradas en sesión 14

| Deuda | Fix | Estado |
|---|---|---|
| **4.6** — Drawing se descoloca al cambiar TF cuando timestamp del punto no existe en TF de destino | Commit `2851ef7` (snap al floor en plugin LWC) | ✅ CERRADO en producción |

### §8.2 Deudas activas al cierre de sesión 14

| Deuda | Descripción | Prioridad | Encaje próxima sesión |
|---|---|---|---|
| 4.5 | `__algSuiteExportTools` no registrado, `[DEBUG TEMP]` no emite logs | Media | Backlog (post-fase-5) |
| Warning lifecycle plugin LWC al borrar drawings (`_requestUpdate is not set`) | Aparece al destruir tool | Media | Probable fase 5 |
| B5 | `POST /session_drawings 409 Conflict` race | Baja | Backlog |
| Warning React `borderColor` shorthand | Cosmético | Baja | Limpieza final |
| **Limpieza ramas locales acumuladas** (8 ramas viejas: `refactor/fase-1-...`, `fix/limit-desaparece-al-play`, etc.) | Higiene git | Baja | Sesión de limpieza puntual |

### §8.3 Plan de fase 5 (drawings lifecycle) — pendiente

CLAUDE.md §4.3 criterio "está hecho":
> Dibujo una línea, cambio de TF 70 veces seguidas, la línea se queda EXACTAMENTE en el mismo timestamp y precio.

**Interpretación operativa post-sesión 14:** "EXACTAMENTE en el mismo timestamp y precio" se entiende como "anclada a la vela existente" (TradingView equivalent), NO como pixel-perfect literal. Verificado por Ramón al carácter en sesión 13 que TradingView mismo no es pixel-perfect.

Plan de fase 5 (drawings lifecycle reorganización mayor) sigue pendiente para sesión 15+. La deuda 4.6 era el primer Op (sub-fase 5a) — ya cerrada. Resto de fase 5 abarca:
- Plugin LWC `destroy()`/`dispose()` correcto.
- `useDrawingTools` recibe `chart`/`series` por parámetro y gestiona lifecycle.
- Eliminar polling 300ms de `getSelected()`.
- ~150 líneas de refactor + posible patch al plugin del fork.
- Bugs candidatos: B2 (drawings descolocadas Review), B5 (409 race), B6 (plugin reinicializado).

---

## §9 — Procedimiento de cierre (próximos pasos en orden estricto)

### §9.1 Inmediato (esta sesión, post-redacción del HANDOFF)

1. Mover `HANDOFF-cierre-sesion-14.md` desde `~/Downloads/` (o donde Ramón lo guarde) a `refactor/HANDOFF-cierre-sesion-14.md` en el repo.
2. `git add refactor/HANDOFF-cierre-sesion-14.md` (comando separado).
3. `git commit -m "docs(sesion-14): cerrar sesión 14 con deuda 4.6 cerrada en producción"` (comando separado).
4. `git push origin main` (comando separado). Vercel re-deploya (cambio docs sin impacto funcional).
5. Sesión 14 cerrada al carácter.

Comandos exactos en §11 abajo.

### §9.2 Próxima sesión

Probables candidatos en orden de prioridad:

- **Pausa o sesión corta de validación pasiva**: validar que el fix `2851ef7` no genera issues durante 2-3 días de uso real. Si Ramón detecta algún edge case del fix, sesión dedicada a investigarlo.
- **Fase 5 plan completo** (drawings lifecycle): redactar plan táctico siguiendo plantilla `fase-3-plan.md` / `fase-4-plan.md`. Probable atacar B2/B5/B6 + warning lifecycle del backlog.
- **Limpieza ramas locales** (higiene git): borrar las 8 ramas locales acumuladas. Sesión corta.

Decisión la toma Ramón al arrancar siguiente sesión.

### §9.3 Backlog post-fase-5 (sin orden estricto)

- Fase 6 — trading domain.
- Fase 7 — reducir `_SessionInner.js`.
- Deuda 4.5 — `__algSuiteExportTools` no registrado.
- Limpieza globales auxiliares (`__chartMap`, `__algSuiteDebugLS`, `__algSuiteExportTools`).
- Saneamiento histórico B4 (decisión separada).

---

## §10 — Métricas de la sesión 14

- **Inicio:** ~17:00 (3 may 2026) — sesión "simulador 14" arranca con PASO 0 documental.
- **PASO 0 documental:** lectura al carácter de CLAUDE.md, HANDOFF-cierre-sesion-12.md §3, HANDOFF-cierre-fase-4d.md, plugin LWC parcheado. HANDOFF-cierre-sesion-13.md no indexado (documentado §6.4).
- **PASO 0 técnico:** verificación de invariantes fase 4 (3 greps) + estado git (`git status`, `git log`, `git branch`). Todo cuadra.
- **Op 1 — verificación consola navegador:** ~20 min. Escenario C confirmado (sin warnings, drawing al borde izquierdo).
- **Op 2 — diagnóstico final con instrumentación:** ~45 min. 2 instrumentaciones temporales + verificación API LWC core. Causa raíz identificada al carácter: `logicalToCoordinate` devuelve `0` para fractional.
- **Op 3 — fix + smoke + push + smoke producción:** ~1h 30min.
  - Limpieza pre-fix (descartar instrumentación, borrar rama debug).
  - Crear rama feature, Edit de 1 línea (+3 net), build verde.
  - Smoke local 3/3 OK.
  - Commit `2851ef7`.
  - Decisión "push hoy" de Ramón contra recomendación CTO, documentada.
  - Merge fast-forward, push, deploy Vercel, smoke producción 3/3 OK.
- **HANDOFF redactado:** post-smoke producción.
- **Total sesión:** ~3h de bicapa estricta + redacción de HANDOFF.

### §10.1 Commits firmados en sesión 14

| Commit | Tipo | Mensaje (corto) |
|---|---|---|
| `2851ef7` | fix | snap timestamp al floor en interpolateLogicalIndexFromTime para que logicalToCoordinate devuelva pixel valido |
| `<HASH-HANDOFF>` (este) | docs | cerrar sesión 14 con deuda 4.6 cerrada en producción |

### §10.2 Deudas cerradas

- 4.6 (drawing se descoloca al cambiar TF cuando timestamp no existe en TF destino).

### §10.3 Errores §9.4 detectados y corregidos en vivo

5 errores (detalle en §6).

### §10.4 Reglas de la disciplina bicapa respetadas al carácter

- §2 (validación shell zsh nativo de Ramón, NO output Claude Code) ✓
- §6 (comandos git separados, NO encadenados con `&&`) ✓
- §7 (commits atómicos por Op) ✓
- §8.2 (`wc -l` previo OBLIGATORIO antes de predicciones de delta) ✓
- §9.4 (verificación literal vs inferencia, capturada al carácter) ✓
- §11 (no push sin OK explícito de Ramón) ✓ — Ramón aprobó push hoy de forma explícita

---

## §11 — Comandos exactos para Ramón (post-redacción HANDOFF)

> ⚠️ **Aviso del bug del cliente con `.md`:** el cliente del chat web autoformatea `nombre.md` a hipervínculo. Si copias/pegas estos comandos y notas que los `.md` salen como links rotos al pegar, **escribe a mano la parte con `.md`** o usa wildcard. Los comandos abajo están preparados para minimizar el problema usando wildcards donde es posible.

### §11.1 Mover HANDOFF al repo

Asumiendo que Ramón descarga `HANDOFF-cierre-sesion-14.md` a `~/Downloads/`:

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
mv ~/Downloads/HANDOFF-cierre-sesion-14*  refactor/
```

Verifica que está en sitio:

```
ls -la refactor/HANDOFF-cierre-sesion-14*
```

### §11.2 git add (comando separado)

```
git add refactor/HANDOFF-cierre-sesion-14*
```

Verifica:

```
git status
```

Esperado: `Changes to be committed: refactor/HANDOFF-cierre-sesion-14.md (new file)`.

### §11.3 git commit (comando separado)

```
git commit -m "docs(sesion-14): cerrar sesion 14 con deuda 4.6 cerrada en produccion"
```

Esperado: commit creado en `main` con hash nuevo.

### §11.4 git push (comando separado)

```
git push origin main
```

Vercel re-deployará (cambio docs sin impacto funcional). Producción seguirá funcional con el fix del plugin desde `2851ef7` — el HANDOFF no toca nada del plugin.

### §11.5 Verificación final

```
git log --oneline -3
```

Esperado: HEAD nuevo (commit del HANDOFF) sobre `2851ef7` sobre `d90b2f1`.

### §11.6 Sesión 14 cerrada al carácter

Tras los pasos §11.1-§11.5, la sesión 14 queda cerrada con:
- Fix `2851ef7` en producción ✓
- HANDOFF documentado en repo ✓
- Working tree limpio ✓
- Producción Vercel verde ✓
- Deuda 4.6 cerrada al carácter ✓

---

## §12 — Cierre

Sub-fase 5a (deuda 4.6) cerrada al carácter en una única sesión. Cumple los criterios de cierre:

✓ **Deuda 4.6 fijada al carácter en producción** con verificación visual de Ramón en `simulator.algorithmicsuite.com`.
✓ **Build verde** + invariantes fase 4 vivos + sub-fase 4d preservada.
✓ **Cero regresiones funcionales** detectadas durante smoke local + smoke producción (6 pruebas en total).
✓ **Diagnóstico al carácter** con dato duro de la instrumentación temporal: `logicalToCoordinate(11963.666) → 0` vs `logicalToCoordinate(11963) → 769.88`.
✓ **Fix mínimo** (1 línea + 3 de comentario) en zona ya parcheada del proyecto. Asimetría intencional justificada al carácter.

**Próximas decisiones de Ramón:**

1. Validación pasiva del fix durante 2-3 días de uso real.
2. Decidir si arranca fase 5 completa (drawings lifecycle) o sesión de limpieza puntual.
3. Limpieza opcional de ramas locales acumuladas.

**Mensaje del CTO al cierre:** sesión densa pero con resultado limpio. Disciplina §9.4 aplicada al carácter en cada paso, instrumentación temporal validó la causa raíz antes del Edit, fix mínimo, smoke 6/6 OK. Push hoy contra recomendación CTO salió bien — el riesgo era manejable y se gestionó con disciplina. Deuda 4.6 era el bloqueante mental más grande del proyecto desde sesión 12. Ya no lo es.

---

*Fin del HANDOFF de cierre sesión 14.*
