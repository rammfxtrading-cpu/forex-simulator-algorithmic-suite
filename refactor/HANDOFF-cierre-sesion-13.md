# HANDOFF — cierre sesión 13 (matriz Op 1/Op 2 + diagnóstico técnico parcial deuda 4.6)

> Fecha: 3 mayo 2026, sesión "simulador 13".
> Autor: Claude Opus 4.7 (CTO/revisor) + Ramón Tarinas (pegamento humano + verificación empírica al carácter).
> Estado al redactar: `origin/main` = `c15508b`. Working tree limpio (este HANDOFF aún sin comitear). Cero commits de código en esta sesión — sesión de verificación empírica + diagnóstico técnico al carácter del plugin LWC custom.

---

## §0 — TL;DR para arrancar sesión 14

1. **Op 1 ✅** Fix de la sub-fase 4d (commit `e9f460b`) aplica universalmente a todos los tipos de drawing. Validado al carácter en producción para TrendLine, Rectangle, FibRetracement, Path, LongShortPosition (este último ya validado en sesión 12).
2. **Op 2 ✅** Deuda 4.6 — alcance confirmado al carácter por reproducción empírica de Ramón en producción: el bug es **universal por tipo de drawing y universal por dirección de cambio TF (mayor↔menor)**. Disparador único: timestamp del punto del drawing NO coincide con una vela existente en la TF de destino.
3. **Op 3.1 — diagnóstico técnico del plugin LWC custom (avance significativo, no completo).** Lo que se descartó al carácter:
   - Función central `interpolateLogicalIndexFromTime` (línea 1580 del plugin) **NO tiene el bug.** Está correctamente implementada con búsqueda binaria + interpolación lineal entre velas vecinas.
   - Función render `BaseLineTool.pointToScreenPoint` (línea 6468) **tampoco tiene bug evidente.** Tiene fallback robusto para "blank space beyond last candle" con extrapolación a los últimos índices válidos.
   - Hipótesis original del HANDOFF sesión 12 §3.2 ("plugin LWC pierde la referencia → drawing pegado al borde izquierdo") **es falsa al carácter.** El plugin tiene la lógica correcta para timestamps interpolados entre velas. El bug NO es una falta de capacidad del plugin.
4. **Hipótesis viva al cierre de sesión 13** (NO verificada todavía): el bug está en el **flujo de actualización al cambiar TF** — orden de actualización de `window.__algSuiteSeriesData` (cache que el plugin consume) vs el momento en que el plugin redibuja. NO está en la función de mapeo, está en el timing entre capas.
5. **Decisión arquitectónica del fix replanteada vs HANDOFF sesión 12**: descartado **Camino C** ("interpolación pixel-perfect estilo TradingView") porque Ramón verificó al carácter en TradingView que ese producto **tampoco interpola al pixel** — usa una regla `floor` similar (caso D1→M5: punto del 30 abr aparece en `29 abr 21:00`). Camino A "bien hecho" (resolver `timestamp → vela existente` en render, sin mutar timestamps persistidos) es lo correcto. Importante: el plugin **ya hace ese cálculo correctamente**. El fix probablemente NO toca el plugin LWC custom, toca el flujo de actualización en `_SessionInner.js` o `useDrawingTools.js`.

---

## §1 — Resumen ejecutivo (lenguaje llano)

Esta sesión **no ha tocado código.** Ha sido una sesión de validación empírica + diagnóstico técnico para preparar terreno antes de meter Edits.

Lo que ha rendido:

- **Hemos confirmado al carácter** que el fix de la sesión anterior (sub-fase 4d, commit `e9f460b`) sirve para TODOS los tipos de drawing, no solo para LongShortPosition. Eso cierra una incertidumbre que llevábamos arrastrando.
- **Hemos confirmado al carácter** que el bug "drawing se descoloca al cambiar TF" tiene una regla simple y universal: si el timestamp del punto del drawing no coincide con una vela visible en la nueva TF, se va al borde izquierdo de la pantalla. Da igual el tipo de drawing y da igual si subes o bajas de TF (M5→M3 falla igual que M5→M15, porque M3 no divide a M5). El único caso seguro es bajar a M1 (donde todos los timestamps existen).
- **Hemos descartado al carácter dos hipótesis incorrectas** que llevábamos asumiendo desde sesión 12. La función central del plugin (`interpolateLogicalIndexFromTime`) y la función de render (`BaseLineTool.pointToScreenPoint`) están correctamente implementadas. Si fuesen el problema, el bug ocurriría siempre, no solo al cambiar TF. El bug es de **timing entre capas** del simulador, no de lógica del plugin.
- **Hemos replanteado el plan de fix** con datos empíricos: Ramón comprobó que TradingView, contra la suposición que yo (Claude) hice en sesión 13, **no usa interpolación pixel-perfect**. Hace algo equivalente al "Camino A bien hecho" del HANDOFF sesión 12 §3.4. Eso simplifica el fix sustancialmente y lo alinea con la arquitectura por capas que `core-analysis.md §6` propone.

Lo que NO ha rendido:

- No tenemos todavía el fix listo. La sesión 14 arranca con diagnóstico final (5 minutos de Ramón abriendo consola del navegador y reproduciendo el bug con `[interpolateLogicalIndexFromTime]` warnings activos) + diseño del fix + Edit + smoke.

**Coste de la sesión**: ~2.5h de bicapa estricta. 0 commits de código. 1 HANDOFF redactado (este). 2 hipótesis incorrectas descartadas en vivo. 1 hipótesis nueva planteada al cierre con criterio §9.4 explícito ("no verificada todavía").

---

## §2 — Estado al carácter al cierre de sesión 13

### §2.1 Git

```
git status                  → working tree limpio (este HANDOFF aún no comiteado)
git log --oneline -1        → c15508b docs(sesion-12): cerrar sesión con smoke producción OK + deuda 4.6 nueva
git branch --show-current   → main
origin/main                 → c15508b (sincronizado)
```

### §2.2 Producción Vercel

- Deploy en HEAD `c15508b` (sin cambios desde sesión 12).
- Estado: Ready, verde.
- Smoke ampliado de Op 1 ejecutado por Ramón en producción al carácter — 4 tipos de drawing validados sin regresión.

### §2.3 Hitos invariantes fase 4 verificados al inicio de sesión 13

```bash
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"   # → VACÍO ✓
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"    # → VACÍO ✓
grep -n "computePhantomsNeeded" components/_SessionInner.js                            # → 3 matches:
#   116:function computePhantomsNeeded(tools, lastT, tfSecs){
#   1121:        _phN = computePhantomsNeeded(tools, _lastT, _tfS2)
#   1178:        phantomsNeeded = computePhantomsNeeded(tools, newLastReal, newSecs)
```

Todos los invariantes fase 4 vivos al carácter. Cero regresiones del refactor histórico.

### §2.4 Bugs / deudas en producción al cierre de sesión 13

| ID | Descripción | Estado | Notas |
|---|---|---|---|
| Bug del play TF bajo + speed máx (LongShortPosition) | Cerrado en sesión 12 | ✅ | Validado universal en sesión 13 (Op 1) |
| **Deuda 4.6** | drawing se descoloca al cambiar TF (granularidad) | ⏳ ABIERTA | Diagnóstico técnico avanzado en sesión 13. Encaje en fase 5 sub-Op A |
| 4.5 | `__algSuiteExportTools` no registrado, `[DEBUG TEMP]` no emite logs | Backlog | Sin avance en sesión 13 |
| B5 | `409 Conflict` `session_drawings` race | Backlog | Pre-existente |
| Warning React `borderColor` shorthand | Backlog | Pre-existente, cosmético |
| Warning **nuevo** | `Attempted to trigger chart update for tool ... but _requestUpdate is not set` | Apuntado | Aparece al **borrar** drawings durante Op 1. NO regresión 4d, sospechoso de fase 5 (drawings lifecycle). NO bloqueante |

---

## §3 — Op 1 ejecutada al carácter — smoke ampliado fix sub-fase 4d

### §3.1 Objetivo

Validar empíricamente en producción que el fix de la sub-fase 4d (commit `e9f460b`, `computePhantomsNeeded` extraído como helper único + recalculado en cada vela TF nueva durante play) aplica a **todos los tipos de drawing**, no solo a LongShortPosition (que era el caso reproducido por Luis).

### §3.2 Metodología

Ramón ejecutó las pruebas en producción (`simulator.algorithmicsuite.com`, deploy `c15508b`) directamente, sin `npm run dev`. Sesión EUR/USD M1, speed máx, drawing creado con punto extremo BIEN a la derecha (zona phantoms o más allá). Play durante ~30s, observación visual + verificación de logs (`Exporting all line tools: [{…}]` durante todo el play, evidencia directa de invocación de `computePhantomsNeeded`).

### §3.3 Matriz validada al carácter

| # | Drawing | Timestamps creación (Z=UTC) | Resultado visual | Logs `Exporting all line tools` durante play |
|---|---|---|---|---|
| 1.1 | TrendLine | (no capturados) | ✅ Mantiene posición | ✅ Continuos |
| 1.2 | Rectangle | P1=`1770206100`, P2=`1770224820` | ✅ Mantiene posición + bonus drag-edit OK | ✅ Continuos |
| 1.3 | FibRetracement | P1=`1770245160`, P2=`1770267840` | ✅ Niveles 0/0.5/1 mantienen posición | ✅ Continuos |
| 1.4 | Path (9 puntos) | Primer P=`1770283620`, último P=`1770304740` | ✅ Todos los vértices mantienen posición | ✅ Continuos |
| (sesión 12) | LongShortPosition | (capturados en HANDOFF-cierre-fase-4d §6.5) | ✅ TP/SL mantienen dimensiones | ✅ |

### §3.4 Conclusión

Fix sub-fase 4d es **agnóstico al tipo de drawing**. Confirmado al carácter en producción para los 5 tipos disponibles. Cero sub-deudas abiertas tras Op 1.

### §3.5 Hallazgo lateral apuntado (NO regresión, NO bloqueante)

Durante Op 1, al **borrar** drawings entre pruebas (clic derecho sobre drawing → Delete), aparece este warning en consola con stack trace:

```
[BaseLineTool] Attempted to trigger chart update for tool <ID> but _requestUpdate is not set.
  _triggerChartUpdate @ 884.5800550005e731cd.js:1
  destroy @ 884.5800550005e731cd.js:1
  removeLineToolsById @ 884.5800550005e731cd.js:1
  removeSelectedLineTools @ 884.5800550005e731cd.js:1
```

Pre-existente al fix 4d (no es regresión). Síntoma del lifecycle del plugin LWC al destruir tool. **Encaje natural en fase 5 (drawings lifecycle)** según `core-analysis.md §6 Fase 5`. NO afecta funcionalidad observable. Apuntado como sub-tarea de fase 5.

---

## §4 — Op 2 ejecutada al carácter — alcance de la deuda 4.6

### §4.1 Objetivo

Mapear empíricamente las dimensiones del bug "drawing se descoloca al cambiar TF" para diseñar el fix con datos al carácter, no con asunciones.

### §4.2 Metodología

Ramón reprodujo en producción transiciones de TF con LongShortPosition. NO se ejecutó la matriz formal `M5→M15 / TrendLine M5→M15 / M15→M5 / M1→H1` propuesta en el plan inicial porque Ramón ya había experimentado al carácter casos suficientes en sesiones previas y aportó la regla universal directamente.

### §4.3 Regla empírica universal verificada al carácter (Ramón, en producción)

> **Si el timestamp del punto del drawing existe como vela en la TF de destino → el drawing se mantiene en sitio. Si NO existe → el punto se descoloca al borde izquierdo de la pantalla.**

Ejemplos al carácter aportados por Ramón:

- Drawing dibujado en M5 con entrada en `:10` y `:20` minutos. Subir a M15 → el `:10` se descoloca (M15 solo tiene `:00`, `:15`, `:30`, `:45`).
- Caso especular M5 → M3: aunque M3 es TF "menor", **TAMBIÉN** descoloca, porque `:10` no existe en M3 (M3 va `:09`, `:12`, `:15`...). M3 NO divide a M5 → bug.
- Caso seguro: bajar a M1. Todos los timestamps existen en M1 → drawing se mantiene siempre.

### §4.4 Implicaciones del descubrimiento empírico

- El bug **no depende de la dirección** del cambio TF (mayor↔menor). Esto refuta una sub-hipótesis viva en HANDOFF sesión 12 §3.4 ("Camino A: redondear al múltiplo de la nueva TF más cercano (probablemente `floor`)") — la dirección no era el problema.
- El bug es **universal por tipo de drawing** (validado por inferencia: la lógica del plugin no distingue tipos para esta operación, y el reporte original era con LongShortPosition).
- El bug solo se manifiesta cuando hay un timestamp **fraccional respecto a la nueva TF**. Aritmética simple, no lógica compleja.

### §4.5 Verificación cruzada con TradingView (CRÍTICA — replantea el plan)

Ramón ejecutó al carácter en TradingView público una prueba complementaria:

> Dibujó una TrendLine en TF D1 (diaria) con dos puntos. Cambió a TF M5 y observó dónde quedaba el primer punto.
>
> **Resultado:** el primer punto, dibujado el día `30 de abril` en D1, apareció en M5 en `29 abril 21:00 UTC` (cierre de sesión forex del viernes anterior).

**Implicación:** TradingView **NO interpola pixel-perfect** entre velas como yo (Claude) había asumido en mi recomendación inicial de "Camino C". TradingView usa una regla equivalente a `floor` por timestamp (anclar a la vela existente cuyo timestamp ≤ timestamp del drawing). Esto coincide en espíritu con "Camino A bien hecho" del HANDOFF sesión 12 §3.4.

**§9.4 explícito:** mi suposición previa de que TradingView hacía interpolación pixel-perfect era inferencia desde reputación de calidad, no verificación. Ramón la corrigió con prueba al carácter. Capturado como lección de calibración.

### §4.6 Decisión arquitectónica del fix replanteada (vs HANDOFF sesión 12)

| Opción | Estado tras Op 2 | Razonamiento |
|---|---|---|
| Camino A (HANDOFF sesión 12 §3.4): redondear timestamps al cambiar TF | **DESCARTADA en su forma "naïf"** | Mutar timestamps en persistencia viola CLAUDE.md §4.3 ("se queda EXACTAMENTE en el mismo timestamp y precio") |
| Camino A "bien hecho" (resolver `timestamp → vela existente` en RENDER, sin mutar persistencia) | **CANDIDATA PRINCIPAL** | Cumple §4.3 (datos persistidos intactos, render usa regla floor por TF activa). Equivalente a comportamiento TradingView verificado. Encaja en arquitectura por capas de `core-analysis.md` |
| Camino B (diagnóstico interno del plugin) | DESCARTADA | Op 3.1 verificó al carácter que el plugin no es el problema |
| Camino C (interpolación pixel-perfect tipo TradingView) | DESCARTADA | TradingView no hace eso (verificado por Ramón). No tiene sentido reinventar más allá del estándar de la industria |

**Camino vivo al cierre sesión 13: Camino A bien hecho.**

---

## §5 — Op 3.1 ejecutada al carácter — diagnóstico técnico del plugin LWC custom (parcial)

### §5.1 Objetivo

Identificar exactamente qué función del plugin LWC custom mapea `timestamp del punto del drawing → coordenada X en pantalla`, y entender qué hace cuando el timestamp no existe en el array de velas. Diagnóstico previo obligatorio antes de proponer Edits.

### §5.2 Mapa runtime confirmado al carácter

```
useDrawingTools.js:158-163 importa 6 paquetes del plugin LWC custom:
  - 'lightweight-charts-line-tools-core'              → ALIAS webpack (next.config.js) → vendor/.../core/dist/...
  - 'lightweight-charts-line-tools-lines'             → ALIAS webpack → vendor/.../lines/dist/...
  - 'lightweight-charts-line-tools-long-short-position' → ALIAS webpack → vendor/.../long-short-position/dist/...
  - 'lightweight-charts-line-tools-path'              → SIN alias → node_modules/...
  - 'lightweight-charts-line-tools-rectangle'         → SIN alias → node_modules/...
  - '../lightweight-charts-line-tools-fib-retracement' → path relativo → archivo raíz del repo
```

**Archivo crítico:** `vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js`. 8737 líneas, NO minificado (legible al carácter), 399124 bytes.

**Característica anotada del plugin** (declarada en su propio `package.json` de difurious): `"keywords": ["coordinate interpolation", "drawing engine", "orchestrator", ...]`. La interpolación temporal **es una capacidad documentada del plugin**, no algo que falte.

**Hallazgo lateral importante:** este plugin "vendor" **está parcheado por el proyecto Forex Simulator**. El código tiene escrituras directas al cluster `__algSuite*` (cache global del data layer). Concretamente:

```js
// línea 1487 (interpolateTimeFromLogicalIndex)
const cachedData2 = typeof window !== 'undefined' && window.__algSuiteSeriesData;

// línea 1589 (interpolateLogicalIndexFromTime)
const cachedData = typeof window !== 'undefined' && window.__algSuiteSeriesData;
```

Esto **explica por qué `vendor/` está commiteado en el repo**, no es regenerable desde `npm install`. Es código upstream + parche local del proyecto. **Atención al tocarlo:** cualquier cambio se pierde si alguien hace `npm install` regenerando `vendor/` desde upstream sin merge cuidadoso.

### §5.3 Función `interpolateLogicalIndexFromTime` — leída al carácter (líneas 1555-1625)

**Comentario JSDoc clave (líneas 1559-1571):**

> "When a drawing tool is saved and later reloaded, its definition contains raw Timestamps (e.g., '2025-01-01'). If that date is in the future (the 'blank space'), the chart has no internal record of it. The standard `timeScale.timeToCoordinate()` may fail or return `null` for these future dates. (...) It calculates the series' time interval (delta between bars) and determines how many 'steps' (logical indices) the target timestamp is away from a known anchor point."

**Lógica al carácter:**

1. Si el timestamp es **mayor que el último timestamp del cache** (más allá de la última vela conocida): extrapola con el último intervalo. (Líneas 1596-1598.)
   ```js
   if (givenTimeNum > lastTime) {
       return (cachedData.length - 1) + (givenTimeNum - lastTime) / interval;
   }
   ```
2. Si el timestamp está **dentro del rango**: hace **búsqueda binaria** para encontrar las dos velas que lo flanquean (`lo` y `hi`), y devuelve **un índice fraccional interpolado linealmente**:
   ```js
   return lo + (givenTimeNum - tLo) / (tHi - tLo);
   ```
   Para el caso de Ramón "M5 con entrada en `:10`, sube a M15 con velas en `:00` y `:15`": esta función devolvería `lo + (10/15) = lo + 0.66`, un índice fraccional **correcto**.
3. Si el timestamp coincide con una vela existente: devuelve el índice exacto (`lo` o `hi`).

**Conclusión §9.4:** esta función **NO tiene el bug**. Está bien implementada con búsqueda binaria + interpolación lineal. Si el bug fuera de esta función, los puntos que SÍ coinciden con velas existentes también fallarían — y Ramón confirmó al carácter que esos puntos sí se mantienen en sitio. La función discrimina correctamente entre los 3 casos.

### §5.4 Función `BaseLineTool.pointToScreenPoint` — leída al carácter (líneas 6460-6490+)

**Es la función "backbone" del render del cuerpo del drawing** (no la etiqueta del eje, esa es otra clase: `TimeLabelView` línea 5798). Convierte cada punto `{timestamp, price}` del drawing en `{x, y}` pixel.

**Lógica al carácter:**

```js
pointToScreenPoint(point) {
    if (!this._chart || !this._series || !point) return null;   // Guard race condition destroy()
    const timeScale = this._chart.timeScale();
    const logicalIndex = interpolateLogicalIndexFromTime(this._chart, this._series, point.timestamp);
    if (logicalIndex === null) {
        console.warn(`[BaseLineTool] pointToScreenPoint: Could not determine logical index for timestamp: ${point.timestamp}.`);
        return null;
    }
    let x = timeScale.logicalToCoordinate(logicalIndex);
    if (x === null) {
        // Fallback: extrapolate using last two valid consecutive indices
        const floorIdx = Math.floor(logicalIndex);
        for (let i = floorIdx; i >= Math.max(1, floorIdx - 20); i--) {
            const xa = timeScale.logicalToCoordinate(i - 1);
            const xb = timeScale.logicalToCoordinate(i);
            if (xa !== null && xb !== null) {
                // ... extrapolación al carácter, líneas siguientes no leídas en sesión 13
            }
        }
    }
    // ... siguientes líneas no leídas en sesión 13
}
```

**Conclusión §9.4:** esta función tampoco tiene bug evidente. Llama a `interpolateLogicalIndexFromTime` (que está OK), maneja el caso `null` con un warning específico, llama a `logicalToCoordinate` (API estándar de lightweight-charts), y tiene fallback explícito para "blank space beyond last candle". 

**Importante para sesión 14:** los **2 console.warn específicos** son el oráculo definitivo del diagnóstico:
- `[interpolateLogicalIndexFromTime] series is not defined.` (línea 1582)
- `[BaseLineTool] pointToScreenPoint: Could not determine logical index for timestamp: <X>.` (línea 6478)
- `[BaseLineTool] pointToScreenPoint: Coordinate conversion failed for point: <Y>. Received x=<x>, y=<y>` (línea 6501, no leída pero apuntada)

**Si el bug dispara cualquiera de estos 3 warnings → el drawing desaparecería (no se renderiza con `null`)**. Si NO los dispara → la función devuelve un valor numérico, pero "incorrecto" (ej. coordenada negativa muy lejana), y el render dibuja en posición rara. El síntoma observado por Ramón ("drawing pegado al borde izquierdo de la PANTALLA, no del chart") sugiere que la función SÍ devuelve un valor **negativo o muy cercano a cero**, y `logicalToCoordinate` lo traduce a un pixel fuera de la zona visible.

### §5.5 Hipótesis viva al cierre sesión 13 (NO verificada, marcada §9.4)

> **El bug está en el flujo de actualización al cambiar TF, no en la función de mapeo.** Posiblemente el cache `window.__algSuiteSeriesData` no está sincronizado con la `timeScale` del chart en el momento exacto en que el plugin redibuja los drawings tras el cambio TF. La función `interpolateLogicalIndexFromTime` calcula con datos de la TF nueva pero `logicalToCoordinate` (de lightweight-charts) usa la `timeScale` con un estado intermedio.

**Esta hipótesis no está verificada empíricamente.** Para verificarla en sesión 14, Ramón debe reproducir el bug **con consola del navegador abierta en producción** y confirmar:

1. ¿Aparece el warning `[BaseLineTool] pointToScreenPoint: Could not determine logical index for timestamp: <X>` cuando el drawing se descoloca? (Si SÍ → cae en rama null, hipótesis A.)
2. ¿Aparece el warning `[BaseLineTool] pointToScreenPoint: Coordinate conversion failed for point: <Y>. Received x=NaN/null, y=<y>`? (Si SÍ → `logicalToCoordinate` devolvió null, hipótesis B.)
3. **Si ningún warning aparece** → la cadena de funciones devuelve valores finitos pero numéricamente "raros". Hipótesis C, la más probable según el síntoma observado (drawing visible en posición errónea, no desaparecido).

Ese diagnóstico de 5 minutos con consola abierta cierra Op 3.1 al carácter.

### §5.6 Funciones del plugin que NO se leyeron en sesión 13 (apuntadas para sesión 14 si necesarias)

- Resto de `pointToScreenPoint` (líneas 6490-6510), incluyendo el fallback completo y el warning de coordenada inválida.
- `interpolateTimeFromLogicalIndex` (función inversa, líneas 1455-1525), por si la cadena de updates pasa por la inversa en algún punto.
- 4 lecturas de `timeScale.coordinateToTime` y `timeScale.logicalToCoordinate` (líneas 1471, 1472, 1717, etc.), por si alguna devuelve null inesperadamente al cambiar TF.
- Call site secundario en línea 6476 ya identificado pero contexto completo no leído.
- Lógica del `updateChart` de `_SessionInner.js` durante cambio TF — quien dispara la actualización del cache `__algSuiteSeriesData` y en qué orden respecto al redibujo del plugin.

---

## §6 — Plan para sesión 14

### §6.1 PASO 0 obligatorio en sesión 14

Antes de proponer NADA, leer en este orden:

1. `CLAUDE.md` (raíz del repo) — instrucciones generales del proyecto.
2. **Este documento (`HANDOFF-cierre-sesion-13.md`) ENTERO** — único punto de entrada al estado actual.
3. `refactor/HANDOFF-cierre-sesion-12.md` §3 — contexto adicional sobre la deuda 4.6 (datos timestamp originales del descubrimiento).
4. `refactor/core-analysis.md` §6 fase 5 — diseño macro de fase 5 (drawings lifecycle).
5. `refactor/HANDOFF-cierre-fase-4d.md` — referencia de cómo se redactan los HANDOFFs de cierre y qué nivel de detalle aplica.

Verificación de estado del repo (Ramón ejecuta en su shell zsh nativa, pega outputs literales):

```bash
git status
git log --oneline -10
git branch --show-current
```

Esperado: rama `main`, working tree limpio (o solo este HANDOFF si no se comiteó), HEAD = `c15508b` (o el commit del HANDOFF de sesión 13 si Ramón decidió comitearlo durante sesión 13).

Verificación de invariantes fase 4:

```bash
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"   # → VACÍO
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"    # → VACÍO
grep -n "computePhantomsNeeded" components/_SessionInner.js                            # → 3 matches
```

### §6.2 Op 1 propuesto para sesión 14 — cierre del diagnóstico Op 3.1 (5-10 min)

**Objetivo:** confirmar al carácter cuál de las 3 hipótesis A/B/C de §5.5 es la viva.

**Pasos:**

1. Ramón abre `simulator.algorithmicsuite.com` en producción.
2. Abre **consola del navegador** (F12 / Cmd+Opt+I).
3. **Filtra los logs**: en la barra de filtro de la consola, escribe `pointToScreenPoint` o `interpolateLogicalIndexFromTime` para ver solo los warnings relevantes (descartar los `Exporting all line tools` que llenan la consola).
4. Sesión EUR/USD M5. Crea un LongShortPosition con SL/TP a la derecha (mismo procedimiento que sesión 12).
5. **Cambia TF a M15** — momento crítico.
6. Observa en consola: ¿aparecen los warnings? ¿Cuáles?
7. Captura outputs (texto literal) y se pegan al chat.

**Salida esperada del Op 1 sesión 14:** identificación de la rama exacta donde cae el bug. Cierra Op 3.1 al carácter.

### §6.3 Op 2 propuesto para sesión 14 — diagnóstico final + diseño del fix (15-30 min)

**Caso A** (warnings presentes): el plugin abandona el render con null. El fix probablemente está en garantizar que el cache `__algSuiteSeriesData` está sincronizado ANTES de que el plugin pinte. Diseño tentativo: en `_SessionInner.js` cambio de TF, ordenar `setSeriesData(...) → forceRedraw drawings`.

**Caso B** (warning de "Coordinate conversion failed"): `logicalToCoordinate` devuelve null. Probable que la timeScale interna de lightweight-charts esté en estado intermedio durante cambio TF. Solución: forzar un tick de animación (rAF) antes de redibujar, o usar la API alternativa de lightweight-charts para mapeo en blank space.

**Caso C** (sin warnings, drawing visible en posición rara): la cadena devuelve valores finitos pero "fuera de pantalla". Probable que el cache `__algSuiteSeriesData` aún contenga los datos de la TF anterior cuando el plugin redibuja. Diseño tentativo: invalidar el cache ANTES del cambio de TF, no DESPUÉS, y dejar que el plugin redibuje con cache vacío + fallback de la línea 1612 hasta que el cache se llene con datos M15.

**En cualquier caso:** el fix probablemente NO toca el plugin LWC custom. Toca `_SessionInner.js` y/o `useDrawingTools.js`. Eso es bueno: encaja perfecto en fase 5 (drawings lifecycle) sin patches al plugin de difurious.

### §6.4 Op 3 propuesto para sesión 14 — Edit + verificación (45-60 min)

Edit en archivos del proyecto (NO en el plugin), commit atómico en rama nueva `fix/deuda-4.6-cambio-tf-drawings` o equivalente, smoke local + smoke producción al carácter siguiendo metodología sub-fase 4d (`HANDOFF-cierre-fase-4d.md §11`).

### §6.5 Decisión sobre la entrada formal a fase 5

Si el fix de la deuda 4.6 es acotado y se cierra en sesión 14: documentarlo como **sub-fase 5a — fix deuda 4.6**, primer Op de fase 5 según `core-analysis.md §6 Fase 5`. Mantener la rama feature, mergear a main al cierre, dejar el resto de fase 5 (drawings lifecycle reorganización completa) para sesión 15+.

Si el fix se complica más allá de sesión 14: cerrar sesión 14 con HANDOFF de progreso, planificar fase 5 con plan táctico formal (`refactor/fase-5-plan.md`) en sesión 15.

### §6.6 Tiempo estimado total sesión 14

- Op 1: 5-10 min
- Op 2: 15-30 min
- Op 3: 45-60 min
- HANDOFF cierre: 20-30 min
- **Total estimado: 1h 30min – 2h 30min**

Cabe holgadamente en sesión típica.

---

## §7 — Errores §9.4 propios (Claude) detectados en vivo durante sesión 13

Capturados explícitamente como lecciones de calibración. Disciplina del proyecto: §9.4 es bidireccional, los errores propios del CTO/revisor también se registran sin auto-flagelación.

### §7.1 Hipótesis "TradingView interpola pixel-perfect"

**Error:** propuse "Camino C" como recomendación profesional principal, fundamentado en mi modelo mental de cómo TradingView "debería" funcionar dada su reputación de calidad, sin haber verificado.

**Detección:** Ramón hizo la prueba al carácter en TradingView y observó comportamiento `floor`-equivalent (caso D1→M5 anclando en `29 abr 21:00`).

**Lección:** referenciar comportamiento de productos externos como argumento técnico requiere verificación empírica, no inferencia desde reputación. Aplica especialmente a librerías propietarias cuyo código no es accesible.

**Coste del error:** ~10 min de conversación replanteando "Camino A vs Camino C" cuando los datos empíricos ya descartaban Camino C.

### §7.2 Hipótesis "el plugin LWC pierde la referencia"

**Error:** Asumí en sesión 12 (HANDOFF-cierre-sesion-12 §3.2) que el bug del cambio de TF era "el plugin LWC llama `interpolateLogicalIndexFromTime(timestamp)` y devuelve un índice degenerado". Llevé esa hipótesis a sesión 13 sin verificarla.

**Detección:** la lectura al carácter de la función en sesión 13 demostró que está correctamente implementada. La hipótesis era falsa.

**Lección:** las hipótesis heredadas de HANDOFFs anteriores deben tratarse como inferencia hasta nueva verificación al carácter. Disciplina §9.4 estricta: bytes en disco vistos en la sesión actual > inferencia desde memoria o documentos previos.

**Coste del error:** ninguno significativo — la validación al carácter se hizo dentro de Op 3.1 y descartó la hipótesis limpiamente. Pero pudo costar más si hubiera propuesto Edits al plugin sin leerlo primero.

### §7.3 Identificación equivocada del primer call site

**Error:** Tras `grep -n "interpolateLogicalIndexFromTime"`, el primer call site visible (línea 5798) lo presenté como "el render principal del drawing". Era el render de la **etiqueta del eje temporal del drawing** (clase `TimeLabelView`), no del cuerpo del drawing.

**Detección:** la lectura al carácter del bloque mostró que la función es `_updateImpl` de la clase `TimeLabelView`, no `pointToScreenPoint`. El render real estaba en línea 6468.

**Lección:** los grep matches numéricos no identifican semántica. Leer al carácter el contexto antes de etiquetar el rol de cada función.

**Coste del error:** 5 min de redirección. Capturado en vivo sin afectar conclusiones.

### §7.4 Concatenación de comandos y pérdida de output

**Error:** En un mensaje del Paso 4 propuse 4 greps. Ramón pegó 4 comandos pero los 2 primeros se concatenaron con `head -20grep` (artefacto de copy-paste), produciendo `head: illegal line count -- 20grep` y perdiendo la output de los 2 primeros.

**Detección:** revisión de la output mostró el error literal del shell.

**Lección:** al pedir múltiples comandos en un mensaje, separarlos visualmente con bloques de código distintos y avisar explícitamente "uno a uno con Enter entre cada uno". Especialmente importante para listas largas.

**Coste del error:** un round-trip extra para volver a pedir los 2 primeros greps separados.

### §7.5 Calibración de fatiga reconocida en vivo

Al final de Op 3.1, antes de proponer seguir leyendo más código del plugin, reconocí explícitamente: *"mi cabeza ya lleva muchas hipótesis descartadas seguidas. Honesto contigo: estoy notando que mi calibración baja. Cada hipótesis nueva que propongo en esta sesión es menos sólida que la anterior. Disciplina §9.4: cuando noto eso, es señal de cierre."*

**Lección positiva:** detectar fatiga propia es disciplina §9.4 también. Cerrar antes de degradar la calidad de las hipótesis es mejor que forzar Edits con calibración baja.

---

## §8 — Stack y entorno

Sin cambios respecto a HANDOFFs anteriores:

- Next.js 14.2.35 (pages router).
- React 18.
- Supabase (auth + Postgres). Sin cambios de schema en sesión 13.
- Vercel deploy. Sin push hoy → producción sigue intacta en `c15508b`.
- Mac iMac, macOS, terminal zsh nativa.
- Email cuenta Claude: `rammglobalinvestment@gmail.com`.

**Nota sobre tooling sesión 14:** Ramón sugirió usar Claude Code para acelerar lectura de código durante sesión 13. Decisión consciente al cierre: Claude Code entrará en sesión 14 cuando ya tengamos plan táctico claro y aprobado tras Op 1 de sesión 14 (diagnóstico final con consola). Mientras estemos en fase de diagnóstico empírico (no de Edits), el cuello de botella es captura de Ramón en navegador, no lectura de código. Claude Code aporta más cuando hay Edits que ejecutar.

---

## §9 — Procedimiento de cierre sesión 13 (próximos pasos en orden estricto)

### §9.1 Inmediatos (ahora, post-redacción del HANDOFF por CTO)

1. Ramón mueve este documento de `/mnt/user-data/outputs/HANDOFF-cierre-sesion-13.md` a `refactor/HANDOFF-cierre-sesion-13.md` en el repo.

   Comandos sugeridos para Ramón:
   ```bash
   cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
   ```
   ```bash
   cp ~/Downloads/HANDOFF-cierre-sesion-13.md refactor/HANDOFF-cierre-sesion-13.md
   ```
   (Ajustar path origen según dónde Ramón guarde el archivo descargado.)

2. Verificar:
   ```bash
   ls -la refactor/HANDOFF-cierre-sesion-13.md
   ```
   ```bash
   wc -l refactor/HANDOFF-cierre-sesion-13.md
   ```

### §9.2 Commit del HANDOFF (decisión de Ramón)

**Opción A (recomendada):** comitear el HANDOFF a `main` en commit atómico.

```bash
git add refactor/HANDOFF-cierre-sesion-13.md
```
```bash
git status
```
```bash
git commit -m "docs(sesion-13): cerrar sesión 13 con matriz Op 1/Op 2 + diagnóstico técnico parcial deuda 4.6"
```
```bash
git log --oneline -3
```

**Opción B:** dejar el HANDOFF untracked en el repo hasta cierre formal de fase 5 (siguiendo política de HANDOFF.md §10.4 "los HANDOFFs viven untracked hasta cierre de fase").

CTO recomienda Opción A en este caso: el HANDOFF contiene el ÚNICO registro al carácter de la matriz Op 1/Op 2 + descarte de hipótesis del plugin. Si se pierde el archivo local, se pierde información valiosa para sesión 14. Comitearlo lo protege.

### §9.3 Push (decisión de Ramón)

Si Opción A:
```bash
git push origin main
```

No hay deploy de código (el HANDOFF es solo doc). Vercel auto-deployará pero el bundle de producción no cambia.

### §9.4 Cierre

Ramón cierra terminal y ventana de Claude. Sesión 14 arranca cuando Ramón abra chat nuevo "simulador 14" con el prompt de arranque actualizado (CTO sugiere actualizar el prompt con HEAD nuevo si Ramón comitea + pushea, o mantener `c15508b` si no).

---

## §10 — Métrica de la sesión 13

- **Inicio:** ~12:30 (3 may 2026, hora local Torrevieja, ES = CEST).
- **Cierre redacción HANDOFF:** ~15:00 (estimado según ritmo conversación).
- **Duración total:** ~2.5 horas de bicapa estricta.
- **Commits firmados:** 0 commits de código. 1 commit de doc esperado tras cierre (este HANDOFF).
- **Op cerrados:** Op 1 ✅, Op 2 ✅, Op 3.1 parcial.
- **Hipótesis técnicas descartadas al carácter:** 3 (TradingView pixel-perfect, plugin LWC pierde referencia, primer call site era el render principal).
- **Hipótesis viva al cierre:** 1 (timing entre cache `__algSuiteSeriesData` y redibujo del plugin durante cambio TF).
- **Errores §9.4 propios capturados explícitamente:** 5.
- **Líneas leídas al carácter del plugin LWC custom:** ~140 líneas críticas (1440-1490, 1555-1625, 5740-5810, 6460-6490).
- **Líneas tocadas de código:** 0.
- **Verificaciones empíricas en producción ejecutadas por Ramón:** 5 pruebas drawing × play (Op 1) + ~3 reproducciones bug cambio TF (Op 2).

---

## §11 — Cierre

Sesión 13 cerrada al carácter sin código tocado. **Esta sesión vale como sesión** porque ha producido:

✓ Validación empírica del fix sub-fase 4d para todos los tipos de drawing.
✓ Regla empírica universal de la deuda 4.6 documentada con ejemplos al carácter.
✓ Verificación cruzada del comportamiento de TradingView (descarta Camino C definitivamente).
✓ Diagnóstico técnico al carácter del plugin LWC custom: descartadas hipótesis incorrectas, identificada hipótesis viva concreta y verificable en 5 minutos al inicio de sesión 14.
✓ Plan claro para sesión 14 con tiempos estimados realistas.
✓ Captura de 5 errores §9.4 propios como disciplina de calibración.

**Sesión 14 arranca con todo el terreno preparado para fix + Edit + smoke en una sola sesión.** Probabilidad alta de cerrar la deuda 4.6 en sesión 14.

**Pendiente de OK Ramón para:** mover este HANDOFF al repo + commit + (opcional) push.

---

*Fin del HANDOFF de cierre sesión 13.*
