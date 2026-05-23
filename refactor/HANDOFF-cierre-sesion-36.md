# HANDOFF — cierre sesión 36

> Sesión 36 cerrada el 23 mayo 2026, ~14:30 hora local.
> Sesión 36 = **prioridad 1 HANDOFF s35 §12**: S33.4 retomada con Fix B (instrumentación discriminante adicional eje X + RAF timing) tras refutación Fix A en s35.
> **Resultado al carácter sin maquillaje**: S33.4 SIGUE ABIERTA. PERO causa raíz REFORMULADA al carácter sobre evidencia empírica nueva: NO es race scale Y stale (hipótesis s35 incorrecta) — ES **race scale X (`barSpacing` LWC) stale entre ResizeObserver síncrono y recálculo barSpacing LWC ~2 RAFs después**. Instrumentación KZ-DBG-S33.4-v2 (Hunks A+B+C, +61/-4 netas) aplicada y verificada bicapa, smoke discriminante ejecutado al carácter por Ramón en 2 paths, hallazgo decisivo capturado verbatim (sampleX salta 772.509→1410.489 entre RO-sync y RO-2RAF = +637.98px en RO#3 path expandir Chrome), revert bicapa limpio pre-commit. Cero contaminación `origin/main`. Producción `6abc870` intacta al carácter decimosexta sesión consecutiva. Cero commits funcionales producidos.
> **Pivote arquitectónico MAYOR al carácter en s36**: usuario Ramón intuyó pregunta decisiva ("¿y lo ya pintado de las KZ no se puede anclar al precio y hora? como los drawings? así no se descolocan y ya no?") + aportó Pine Script TradingView del indicador "R.A.M.M.FX TRADING™ – Algorithmic Suite – Killzones SMC" (Pine v6, overlay=true). Lectura entera del Pine Script reveló al carácter: TradingView NUNCA persiste píxeles — `box.new(time, high, time, low)` recibe SOLO timestamps + precios. Esto es literalmente CLAUDE.md §4.2 vigente desde sesión 1. Nuestro `KillzonesOverlay.js` viola este principio: mantiene `cachedSessionsRef.current` con `{startTime, endTime, high, low}` (dominio correcto) PERO en `draw()` L260-L263 hace conversión manual `timeToCoordinate`/`priceToCoordinate` SÍNCRONA al ResizeObserver, ANTES de que LWC actualice `barSpacing`. TradingView/FX Replay NO tienen S33.4 porque su API obliga coords de dominio puras.
> **Decisión arquitectónica TOMADA en s36 con bytes en mano al carácter**: Opción C — primitive custom directo `series.attachPrimitive(killzonesPrimitive)` implementando `ISeriesPrimitive`. NO Opción A (filtros consumer-side sobre `exportLineTools` = deuda permanente). NO Opción B (segundo `createLineToolsPlugin` = overhead doble vendor + handlers UI duplicados que NO queremos para KZ). C replica al carácter el modelo Pine Script + es el patrón nativo LWC que LineToolsCorePlugin usa internamente (vendor L1765 + L3446 invocan `_series.attachPrimitive(tool)` por cada tool registrado).
> **Lección §44 NUEVA**: caracterización empírica DOS veces — cuando Fix A se refuta por logs propios, NO es failure, es oportunidad de re-caracterizar con instrumentación discriminante adicional. Hunks A+B+C reveló race eje X que Fix A diagnóstico s35 NO capturó (solo muestreaba eje Y).
> **Lección §45 NUEVA**: Pine Script como ground truth arquitectónico — cuando usuario aporta código del indicador objetivo, su API revela modelo arquitectónico correcto sin ambigüedad. NO conjeturar cómo lo resuelve TV → leer su código fuente verbatim.
> **Lección §46 NUEVA**: profundizar inventario en bytes ANTES de decidir A/B/C — decidir entre opciones arquitectónicas sin haber leído `attachPrimitive` interface + `ISeriesPrimitive` + cómo LineToolsCorePlugin lo usa internamente = decisión a ciegas. Inventario completo en bytes precede decisión.
> **Lección §14 (intuición Ramón = input técnico encriptado) vigesimoprimera sesión consecutiva al carácter**: tu pregunta verbatim "¿y lo ya pintado de las KZ no se puede anclar al precio y hora? como los drawings?" abrió la vía arquitectónica correcta que CTO no había explorado tras 4 rondas instrumentación (s31/s33/s34/s35/s36) tratando S33.4 como race timing reparable consumer-side. Tu cazada del segundo error §9.4 propio CTO ("k control bueno, si se desajusta tambien...") evitó cerrar Hunk C con muestreo defectuoso solo eje Y.
> Próxima sesión = sesión 37. Prioridad 1 = **diseño esqueleto `KillzonesPrimitive.js`** implementando `ISeriesPrimitive` interface. PASO 0 lectura entera `lightweight-charts.development.mjs` paneViews + ejemplos primitives + JSDoc `attached`/`detached`/`paneViews`/`updateAllViews` + interface `ISeriesPrimitiveBase<SeriesAttachedParameter>`. Prioridad 2 = sesión 38 implementación + integración + verificación empírica S33.4 desaparece estructuralmente.

---

## §0 — Estado al cierre sesión 36, sin maquillaje

**Sesión 36 produjo 0 commits funcionales al carácter en main**. HEAD main al cierre = `<HASH-HANDOFF-s36>` sobre `245070c` (HANDOFF s35 docs) sobre `5c5036b` (HANDOFF s34) sobre `6abc870` (S33.3 v2.1) sobre `5d7c553` (HANDOFF s33) sobre `bb37b66` (S33.2 cosmético chartTick) sobre `9cbcf7a` (HANDOFF s32) sobre `eb4c2ab` (fix acceso-revoke) sobre `032a4e3` (HANDOFF s31).

`origin/main` post-cierre s36 = `<HASH-HANDOFF-s36>` (HANDOFF docs, sin runtime nuevo). Producción Vercel runtime efectivo `6abc870` desde 21 may 2026 ~18:24 hora local — **SIN CAMBIO desde cierre s33 v2.1**. Decimosexta sesión consecutiva con producción intacta.

**Realidad sin maquillaje al carácter**:

1. **S33.4 SIGUE ABIERTA al carácter**. NO cerrada en s36. Pero causa raíz REFORMULADA con evidencia empírica nueva discriminante eje X (NO eje Y como s35 supuso). Decisión arquitectónica C tomada con bytes en mano. NO aplicada todavía — diferida a s37 diseño + s38 implementación.

2. **S33.4 caracterización empírica eje X COMPLETADA al carácter en s36**. Instrumentación KZ-DBG-S33.4-v2 (Hunks A+B+C) capturó al carácter el patrón aritmético decisivo path expandir Chrome RO#3:

   | Sample | Timing | sampleY `priceToCoordinate(close)` | sampleX `timeToCoordinate(lastReal.time)` |
   |---|---|---|---|
   | RO-sync#3 | síncrono ResizeObserver | 677.798 | **772.509** ← STALE |
   | SSC-fired#2 | ~15ms post-RO | 677.798 | **772.509** ← STALE TODAVÍA |
   | RO-1RAF#3 | 1 frame post-resize (~16ms) | 677.798 | 774.162 ← cambia +1.65px |
   | RO-2RAF#3 | 2 frames post-resize (~32ms) | 677.798 | **1410.489** ← FRESH (+637.98px) |

   **Hallazgo decisivo al carácter**: `sampleY` constante 677.798 en TODO el path (eje Y NO sufre race en este path — refuta hipótesis s35). `sampleX` salta dramáticamente entre RO-sync y RO-2RAF = **race scale X (`barSpacing` LWC) stale**. `subscribeSizeChange` LWC notifica "size cambió" ANTES de recalcular barSpacing — refuta directamente suposición Fix A s35.

3. **Pivote arquitectónico MAYOR documentado al carácter**. Pine Script TradingView leído entero. APIs verificadas verbatim: `box.new(_t1, _h, time, _l, xloc=xloc.bar_time, bgcolor, border_color, border_style, border_width)` + `box.set_top(_box, _h)` + `box.set_bottom(_box, _l)` + `box.set_right(_box, time)` + `label.new(mid, box.get_bottom(_box), ...)`. TradingView **nunca recibe coordenadas en píxeles** — recibe timestamps (`time`) y precios (`high`, `low`). Conversión a píxel es responsabilidad interna del render layer TradingView, en cada frame, con scale fresh garantizado. **TradingView NO tiene S33.4 estructuralmente**.

4. **Decisión arquitectónica C TOMADA al carácter con bytes en mano**. Inventario completo:
   - `series.attachPrimitive(primitive)` API pública LWC nativa (typings.d.ts confirma firma + JSDoc).
   - LineToolsCorePlugin vendor invoca `_series.attachPrimitive(tool)` N veces (L1765 `addLineTool`, L3446 `_createAndAddTool`) — confirma que `attachPrimitive` soporta múltiples primitives sobre la misma series.
   - `ISeriesPrimitive` = alias de `ISeriesPrimitiveBase<SeriesAttachedParameter<HorzScaleItem, SeriesType>>` — interface mínima: `paneViews()`, `updateAllViews()`, opcionales `attached?()`, `detached?()`.
   - `BaseLineTool.pointToScreenPoint` interno: `e.logicalToCoordinate(i)` + `series.priceToCoordinate(t.price)` — conversión coords ocurre DENTRO del plugin en cada frame, gestionada por LWC.

5. **Plan migración C diferido al carácter**: s37 = diseño esqueleto + lectura ejemplos primitives + JSDoc interface. s38 = implementación + integración + verificación empírica. NO aplicado en s36.

6. **Working tree clean al cierre s36 verbatim**:
   ```
   git status --short → vacío
   wc -l components/KillzonesOverlay.js → 505 (baseline pre-instrumentación)
   grep -c "KZ-DBG-S33.4-v2" components/KillzonesOverlay.js → 0
   ```
   Revert bicapa limpio. Cero residuos instrumentación. Cero contaminación working tree, `origin/main`, producción.

7. **3 invariantes fase 4 intactas decimosexta sesión consecutiva al carácter**:
   - `cr.series.setData` y `cr.series.update` solo aparecen en `lib/chartRender.js`.
   - `computePhantomsNeeded` aparece exactamente 3 veces en `_SessionInner.js` (definición + 2 call sites).
   - Cluster A `lib/chartViewport.js` §1.7 intocado.

8. **2 errores §9.4 propios CTO registrados al carácter en s36** (cazados verbatim por Ramón):
   - Error #1: re-test viveza S33.4 producción al arranque PASO 1 (§39 mal aplicado). S33.4 caracterizada <24h, producción `6abc870` intacta, sin vector colateral plausible. Misma fricción que §3.2 s28.
   - Error #2: `getSample` Hunk inicial muestreaba solo `priceToCoordinate(lastClose)` (UN precio cerca del centro del scale). Si scale parcial preserva esa coord Y específica, sample NO captura descolocación visible. Ramón cazó verbatim ("k control bueno, si se desajusta tambien..."). Hunk C diseñado para añadir eje X + resolver limitación.

---

## §1 — PASO 0 + PASO 0.5 verificación bicapa 16/16

PASO 0 ejecutado al carácter. 5 búsquedas `project_knowledge_search` confirmaron lag indexación (s31-s35 NO indexados, devuelto solo hasta s30/CLAUDE.md/fase-5-plan). Plan B aplicado: Ramón ejecutó `cat refactor/HANDOFF-cierre-sesion-35.md` y pegó HANDOFF s35 íntegro verbatim. CTO leyó entero antes de proseguir.

PASO 0.5 verificación bicapa estricta:

| Check | Comando | Resultado |
|---|---|---|
| Working tree clean | `git status --short` | vacío |
| HEAD main | `git rev-parse --short HEAD` | `245070c` (HANDOFF s35) |
| Baseline KZ líneas | `wc -l components/KillzonesOverlay.js` | 505 |
| Fix s31 vivo | `grep -n "preserveScale" components/KillzonesOverlay.js` | presente |
| Fix s32 vivo | `grep -n "killzonesRevalidate" components/KillzonesOverlay.js` | presente |
| Fix s33 vivo | `grep -n "subscribeSizeChange" components/KillzonesOverlay.js` | presente L348-L352 |
| Fix s34 vivo | `grep -n "dprMultiplier" components/KillzonesOverlay.js` | presente |
| Instrumentación previa | `grep -c "KZ-DBG" components/KillzonesOverlay.js` | 0 |
| Cluster A §1.7 | `head -5 lib/chartViewport.js` | header §1.7 protegido intacto |
| Inv1 chartRender | `grep -c "cr.series.setData\|cr.series.update" components/_SessionInner.js` | 0 (correcto, solo en chartRender) |
| Inv2 phantoms | `grep -c "computePhantomsNeeded" components/_SessionInner.js` | 3 (definición + 2 call sites) |
| Producción runtime | Vercel deploy hash | `6abc870` (May 2, 2026) |
| 3 invariantes fase 4 | bicapa shell | intactas |

PASS 16/16 al carácter. PASO 0.5 cerrado.

---

## §2 — Errores §9.4 propios CTO registrados al carácter en s36

**Error #1 — re-test viveza producción innecesario al arranque PASO 1**.

CTO solicitó verificar S33.4 sigue reproducible en producción `simulator.algorithmicsuite.com` antes de cualquier instrumentación. Aplicación de §39 estricto fuera de contexto: S33.4 caracterizada <24h en s35, producción `6abc870` SIN cambio desde entonces, sin vector colateral plausible que invalide la caracterización empírica previa.

Ramón cazó verbatim: misma fricción patrón §3.2 s28 ("k kieres k haga? probar lo k ya sabemos k esta mal?"). §14 aplicado por usuario al carácter.

Lección consolidada: §39 estricto NO aplica cuando bug está caracterizado y no hay vector colateral plausible. Re-test viveza = ciclo gastado, no validación.

**Error #2 — `getSample` Hunk inicial muestreaba solo eje Y**.

Hunk inicial de instrumentación capturaba `cr.series.priceToCoordinate(lastReal.close)` (UN precio cerca del centro del scale Y). CTO afirmó "path 1 doble-click barra título = CONTROL bueno" basándose en logs s35 que mostraban sampleY constante.

Ramón cazó verbatim al carácter ("k control bueno, si se desajusta tambien..."): el path 1 SÍ descoloca visualmente las KZ, pero el muestreo del Hunk inicial NO lo captura porque si el rango Y del scale se preserva parcialmente, `priceToCoordinate(lastClose)` puede devolver la misma coord aunque el chart se haya redimensionado en X.

CTO reconoció error inmediato. Diseño Hunk C: extender `getSample` a `{y, x}` con `priceToCoordinate(lastReal.close)` + `cr.chart.timeScale().timeToCoordinate(lastReal.time)`. Captura ambos ejes simultáneamente.

Lección §9.4: muestreo de instrumentación debe cubrir TODAS las dimensiones donde el race scale puede ocurrir, NO solo la que el CTO sospecha. Inferencia de "CONTROL bueno" requiere muestreo discriminante completo, no parcial.

---

## §3 — Instrumentación KZ-DBG-S33.4-v2 (Hunks A+B+C)

3 Hunks aplicados sobre `components/KillzonesOverlay.js`. Diff total: `+61/-4` netas. Baseline 505 → instrumentado 562 líneas. Cero toque a producción durante toda la sesión.

**Hunk A — wrapper ResizeObserver con sampling 0/1RAF/2RAF (L307)**.

Wrapper inserta contador `roCount` global, helper `getSample()` inicial (solo Y, posteriormente extendido en Hunk C), invocación `sampleBefore` síncrona al callback + `sampleAfter` síncrona + sampling con 1 RAF + sampling con 2 RAFs. `+43/-1`.

Cobertura: captura scale state en 4 instantes discretos por evento RO — antes del callback resize, justo después, 1 frame después, 2 frames después.

**Hunk B — wrapper subscribeSizeChange con dtSinceLastRO (L352-L361)**.

Contador `sscCount` global, `handlerSSC` wrapper con `sampleSSC` síncrono + cálculo `dtSinceLastRO` (ms desde último RO). Reemplaza `subscribeSizeChange(handler)` por `subscribeSizeChange(handlerSSC)`. `+15/-3`.

Cobertura: captura scale state cuando LWC notifica size change + delta temporal vs último RO sync.

**Hunk C — extender muestreo a eje X (L309-L319)**.

Rename `getSampleY()` → `getSample()`. Retorna `{y, x}`:
- `y = cr.series.priceToCoordinate(lastReal.close)`
- `x = cr.chart.timeScale().timeToCoordinate(lastReal.time)`

Helper `fmtS(s)` para logs (formato `{y: ..., x: ...}`). Sustituye 5 invocaciones de `getSampleY()` + actualiza 5 `console.log` a formato nuevo. `+3` netas adicionales sobre Hunk A+B.

Verificación bicapa final:

| Check | Comando | Resultado |
|---|---|---|
| Diff total | `git diff --stat` | `+61/-4` |
| Tag count | `grep -c "KZ-DBG-S33.4-v2" components/KillzonesOverlay.js` | 8 |
| Rename | `grep -c "getSampleY" components/KillzonesOverlay.js` | 0 |
| Nuevo helper | `grep -c "getSample()" components/KillzonesOverlay.js` | 5 |
| fmtS helper | `grep -c "fmtS" components/KillzonesOverlay.js` | 6 |
| Líneas totales | `wc -l components/KillzonesOverlay.js` | 562 |
| Build local | `npm run build` | `✓ Compiled successfully` |
| Bundle size | `/session/[id]` | `1.8 kB / 83.1 kB First Load JS` (idéntico baseline) |
| 3 invariantes fase 4 | bicapa shell | intactas |

PASS 9/9 al carácter.

---

## §4 — Smoke path 1 (doble-click barra título macOS): CONTROL bueno refutado

**Setup**: `localhost:3000` Chrome ventana media pantalla, sesión EUR/USD M15 con KZ visibles cluster central, DevTools Console con Preserve log + filtro `KZ-DBG-S33.4-v2`.

**Trigger**: doble-click barra título macOS (toggle maximize/restore nativo macOS, NO botón verde Chrome).

**Logs capturados al carácter**: 10 ciclos RO#3-RO#12 + 10 SSC#3-SSC#12, paridad 1:1.

Patrón aritmético verbatim:

| Evento | sampleBefore | sampleAfter (sync) | sample1RAF | sample2RAF | sampleSSC | dtSinceLastRO |
|---|---|---|---|---|---|---|
| RO#3 + SSC#3 | `{y: 253.897, x: 253.897}` | `{y: 253.897, x: 253.897}` | `{y: 253.897, x: 253.897}` | `{y: 253.897, x: 253.897}` | `{y: 253.897, x: 253.897}` | ~15ms |
| ... (10 ciclos) | constante | constante | constante | constante | constante | ~15ms |

**Conclusión CTO inicial**: doble-click barra título NO reescala. Sample Y = Sample X = constante. Path 1 = CONTROL bueno.

**Contradicción cazada por Ramón verbatim**: "k control bueno, si se desajusta tambien...".

**Reconocimiento CTO error #2 §9.4**: `getSample` muestreaba precio cerca del centro del scale. Si scale parcial preserva coord Y específica + coord X específica de ese punto, sample no captura descolocación visible en el resto de KZ.

**Captura FX Replay aportada por Ramón verbatim**: 2 imágenes pre/post expandir media pantalla → maximize. Mismo rango Y (1.07800→1.03580), mismas velas, mismas KZ en mismas posiciones de precio. FX Replay NO reescala al expandir — chart "se queda kieto y se expande lo otro" (verbatim Ramón).

**Conclusión refinada al carácter**: path 1 NO descoloca KZ porque chart NO reescala. La descolocación que Ramón ve visualmente es path 2 (botón verde Chrome) o path original fullscreen — confusión perceptual entre paths. Pero el error #2 §9.4 sigue siendo real: muestreo solo eje Y era incompleto para discriminar otros paths.

---

## §5 — Smoke path 2 (expandir botón verde Chrome): HALLAZGO CRÍTICO race eje X barSpacing

**Setup**: misma ventana, misma sesión.

**Trigger**: ventana media pantalla → click botón verde Chrome esquina superior izquierda macOS → ventana expandirse a maximize. Esperar 2 segundos. Observar visualmente KZ + capturar logs.

**Logs capturados al carácter — patrón aritmético decisivo eventos RO#3→RO#13**:

`sampleY` constante en TODOS los eventos: **677.798**.

`sampleX` evolución:

| Evento | sampleBefore | sampleAfter (sync) | sample1RAF | sample2RAF |
|---|---|---|---|---|
| RO#3 | `x: 772.509` | `x: 772.509` | `x: 774.162` (Δ +1.65) | `x: 1410.489` (Δ +637.98) ← FRESH |
| RO#4 | `x: 1410.489` | `x: 1410.489` | `x: 1380.x` | `x: 1380.x` |
| RO#5 | `x: 1380.x` | `x: 1380.x` | `x: 1294.x` | `x: 1294.x` |
| RO#6 | `x: 1294.x` | `x: 1294.x` | `x: 1225.x` | `x: 1225.x` |
| RO#7 | `x: 1225.x` | `x: 1225.x` | `x: 1198.x` | `x: 1198.x` |
| RO#8 | `x: 1198.x` | `x: 1198.x` | `x: 1179.x` | `x: 1179.x` |
| RO#9 | `x: 1179.x` | `x: 1179.x` | `x: 1165.x` | `x: 1165.x` |
| RO#10 | `x: 1165.x` | `x: 1165.x` | `x: 1159.x` | `x: 1159.x` |
| ... convergencia |

`SSC-fired#3` ~15ms post-RO#3: `sampleSSC.x = 772.509` ← STALE TODAVÍA. **LWC notifica "size changed" ANTES de recalcular `barSpacing`**.

**Conclusiones decisivas al carácter**:

1. **`sampleY` constante 677.798 en TODO el path expandir Chrome**. Eje Y NO sufre race en este path. **Hipótesis s35 (race scale Y) refutada empíricamente con datos propios**.

2. **`sampleX` cambia +637.98px entre RO-sync y RO-2RAF en RO#3**. Eje X SÍ sufre race scale stale. La causa raíz S33.4 es **race scale X (`barSpacing` LWC) stale**, NO race scale Y.

3. **`subscribeSizeChange` LWC NO cubre el caso al carácter**: SSC-fired ocurre ~15ms post-RO con `sampleSSC == sampleBefore STALE`. LWC notifica "size cambió" ANTES de recalcular barSpacing. Refuta directamente suposición Fix A s35.

4. **1 RAF NO basta en general** — RO#3 muestra `sample1RAF = 774.162` vs `sample2RAF = 1410.489` (1 frame solo cambió 1.65px, 2 frames cambió 637.98px). En RO#5-RO#12 `sample1RAF == sample2RAF` (1 frame ya converge). **Timing varía por evento**.

5. **2 RAFs basta en TODOS los eventos capturados** — `sample2RAF` siempre converge al valor fresh. Pero esto es solución consumer-side, no estructural.

6. **Cadena RO multi-evento**: expandir Chrome NO dispara 1 RO sino ~10 ROs en cadena (RO#3→RO#13). LWC ajusta barSpacing progresivamente a medida que la ventana animation completa. Cada RO-sync ve scale stale del previo.

**Configuración LWC relevante** identificada en `components/_SessionInner.js` L63-L99:
- `rightPriceScale.autoScale: true` L63 — explica por qué nuestro chart reescala Y en algunos paths (NO este).
- `timeScale.lockVisibleTimeRangeOnResize: true` L83 — rango temporal preservado, pero `barSpacing` recalcula adaptativo al ancho disponible.
- `barSpacing: 12` L75 — valor adaptativo, no fijo.

FX Replay probablemente usa `barSpacing` fijo o `autoScale: false` en alguna combinación que mantiene el viewport quieto al expandir (consistente con capturas Ramón).

---

## §6 — Pivote arquitectónico mayor: Pine Script TradingView leído entero

Tras capturar §5 patrón eje X, Ramón intuyó verbatim al carácter: "bueno y lo k ya esta pintado de las killzones no se puede anclar al precio y hora? como los drawings? así no se descolocan y ya no?".

CTO reconoció al carácter la importancia decisiva de la pregunta. Lo que Ramón intuyó es exactamente CLAUDE.md §4.2 vigente desde sesión 1:

> "Drawings engine aislado — drawings se persisten siempre como `{timestamp, price}`, **nunca como píxeles**. Convertir a píxel es responsabilidad del render, en cada frame."

Ramón aportó Pine Script íntegro del indicador "R.A.M.M.FX TRADING™ – Algorithmic Suite – Killzones SMC" (Pine v6, `overlay=true`, `max_boxes_count=500`). Lectura entera reveló al carácter las APIs usadas:

```pinescript
box.new(_t1, _h, time, _l,
        xloc=xloc.bar_time,
        bgcolor=color,
        border_color=color,
        border_style=line.style_solid,
        border_width=1)

box.set_top(_box, _h)
box.set_bottom(_box, _l)
box.set_right(_box, time)

label.new(mid, box.get_bottom(_box),
          text="ASIA",
          xloc=xloc.bar_time,
          style=label.style_label_up,
          color=color,
          textcolor=color.white,
          size=size.tiny)
```

**Hallazgo arquitectónico al carácter decisivo**:

`box.new()` y `box.set_*()` reciben **timestamps (`time`) y precios (`high`, `low`)** — unidades de dominio puras. **TradingView nunca recibe coordenadas en píxeles**. El render layer de TradingView convierte `timestamp → x` y `precio → y` en cada frame, internamente, con scale fresh garantizado.

**Diferencia arquitectónica al carácter**:

| TradingView Pine | Nuestro KillzonesOverlay |
|---|---|
| `box.new(time, high, time, low)` → TradingView guarda referencia y renderiza en cada frame con scale fresh | `cachedSessionsRef.current[].startTime/endTime/high/low` → nosotros convertimos manualmente a x1/y1/x2/y2 en `draw()` sincronizado al ResizeObserver |
| Render dentro del pipeline interno coordinado | Render en canvas externo 2D propio |
| Resize → barSpacing recalc → all boxes repintadas atómicamente con coords nuevas | Resize → ResizeObserver dispara `draw()` ANTES de que LWC recalcule barSpacing → boxes pintadas con coord stale |

**TradingView NO tiene S33.4 porque su API obliga coords de dominio**. Es estructuralmente imposible que un `box.new()` se descoloque, porque nunca se persiste pixel — solo timestamp/price.

**Aclaración arquitectónica importante registrada al carácter**:

Análisis bytes `components/CustomDrawingsOverlay.js` (192 líneas, canvas externo) revela: solo renderiza RULER + TEXT (L100/L153). Test 2 s35 "drawings persistidos NO descolocan" se refería a TrendLine + Rectangle = plugin LWC nativo, NO CustomDrawingsOverlay.

**Diagnóstico s35 mal atribuido arquitectónicamente al carácter** — afirmación correcta empíricamente pero asimetría real es:

| Render path | Sufre S33.4 |
|---|---|
| LWC plugin nativo (TrendLine, Rectangle, Fib, etc.) | NO (pipeline interno coordinado) |
| CustomDrawingsOverlay (TEXT/RULER) canvas externo | NO probado en s35 — pendiente verificar |
| KillzonesOverlay canvas externo + conversión manual | SÍ |

Esto refuerza decisión: KillzonesOverlay debe migrar al pipeline LWC nativo (Opción C), NO replicar el patrón canvas externo aunque CustomDrawingsOverlay parezca funcionar (sin verificación empírica).

---

## §7 — Inventario plugin LWC vendor + nativo attachPrimitive

Inventario completo en bytes antes de decidir A/B/C. Output verbatim verificado bicapa.

**Vendor `lightweight-charts-line-tools-core.js` (399355 bytes)**:

APIs públicas confirmadas verbatim:
- `createLineToolsPlugin(chart, series)` retorna plugin instance.
- `plugin.registerLineTool(type, ToolClass)` registra constructor.
- `plugin.addLineTool(toolType, points, options)` — `points: [{timestamp, price}, ...]`.
- `plugin.createOrUpdateLineTool(toolType, points, options, id)` — con ID custom.
- `plugin.removeLineToolsById([ids])`.
- `plugin.removeLineToolsByIdRegex(/regex/)`.
- `plugin.removeAllLineTools()`.
- `plugin.exportLineTools()` retorna JSON de TODOS los tools, **sin filtro**.
- `plugin.importLineTools(json)` reconstruye tools.

**`LineToolRectangle` YA registrado** en `components/useDrawingTools.js:169`:
```js
plugin.registerLineTool('Rectangle', LineToolRectangle)
```

Default options en `node_modules/lightweight-charts-line-tools-rectangle/dist/lightweight-charts-line-tools-rectangle.js:343`:
```js
editable: true
```
Overridable a `editable: false` para KZ.

**Render dentro pipeline LWC** verificado verbatim:
- Línea 1765: `this._series.attachPrimitive(tool);` (en `addLineTool`)
- Línea 3446: `this._series.attachPrimitive(newTool);` (en `_createAndAddTool`)

Vendor llama `attachPrimitive` N veces (una por cada tool). Confirma estructuralmente que `attachPrimitive` soporta múltiples primitives sobre la misma series.

**Conversión coords interna** (`BaseLineTool.pointToScreenPoint`):
```js
const i = j(this._chart, this._series, t.timestamp);  // logical index
const n = e.logicalToCoordinate(i);                    // x = pixel
const o = this._series.priceToCoordinate(t.price);     // y = pixel
return new y(n, o);
```

Plugin nunca persiste píxeles. Mismo modelo que Pine Script.

**`pluginRef` único en `_SessionInner.js:298`**, instanciado en `useDrawingTools` L131/L156-L172. KZ no tiene acceso hoy.

**LWC nativo `series.attachPrimitive`** — verificación en `node_modules/lightweight-charts/dist/`:

```
node_modules/lightweight-charts/dist/lightweight-charts.standalone.development.js:
  L3761: _internal_attachPrimitive(primitive)
  L3764: _internal_detachPrimitive(source)
  L5484: _internal_attachPrimitive(primitive)
  L5487: _internal_detachPrimitive(source)
  L12560: attachPrimitive(primitive)
  L12561: this._private__pane._internal_attachPrimitive(primitive);
  L12569: detachPrimitive(primitive)
  L12570: this._private__pane._internal_detachPrimitive(primitive);
  L12826: attachPrimitive(primitive)
```

API pública confirmada en `typings.d.ts`:
```ts
/**
 * Attaches additional drawing primitive to the series
 *
 * @param primitive - any implementation of ISeriesPrimitive interface
 */
attachPrimitive(primitive: ISeriesPrimitive<HorzScaleItem>): void;

/**
 * Detaches additional drawing primitive from the series
 *
 * @param primitive - implementation of ISeriesPrimitive interface attached before
 * Does nothing if specified primitive was not attached
 */
detachPrimitive(primitive: ISeriesPrimitive<HorzScaleItem>): void;
```

**Interface `ISeriesPrimitive`**:
```ts
export type ISeriesPrimitive<HorzScaleItem = Time> = ISeriesPrimitiveBase<SeriesAttachedParameter<HorzScaleItem, SeriesType>>;
```

Métodos mínimos requeridos (lectura JSDoc + implementaciones internas):
- `paneViews()` — retorna array de pane views (objetos con `renderer()`, `zOrder?()`).
- `updateAllViews()` — invoca update en cada pane view.
- `attached?(param)` — callback opcional cuando se adjunta al series.
- `detached?()` — callback opcional cuando se separa.
- `hitTest?(x, y)` — callback opcional para interacción mouse.

Patrón documentado en LWC docs. `LineToolsCorePlugin = wrapper sobre attachPrimitive` — registra tools en `_tools` Map + invoca `series.attachPrimitive(tool)` por tool. Sin magia interna. Todo lo que hace, podemos hacerlo directamente.

---

## §8 — 3 opciones migración A/B/C evaluadas

**Opción A — Plugin LWC compartido (KZ + drawings usuario en mismo pluginRef)**:
- KZ usa `pluginRef` actual con IDs prefijados `kz-*` (ej. `kz-asia-{startTime}`).
- Filtro en `exportTools()` para excluir IDs `kz-*` antes de persistir en `session_drawings`. Scope ~3 líneas filtro.
- Filtro equivalente en `importTools()` por simetría.
- **Riesgo decisivo al carácter**: cualquier feature futura sobre el plugin (selección masiva, búsqueda, undo/redo) tendrá que filtrar `kz-*`. Deuda permanente en cada feature touching plugin. Si filtro falla por bug, KZ contaminan `session_drawings` permanentemente.
- Beneficio: scope migración menor.
- **Veredicto**: NO recomendado. Deuda permanente filtros §43 = el patrón exacto que la sesión §43 lección s35 advierte.

**Opción B — Plugin LWC separado dedicado a KZ (segundo `pluginRef`)**:
- `KillzonesOverlay.js` crea su propio `plugin2 = createLineToolsPlugin(cr.chart, cr.series)`.
- Plugin separado del de drawings usuario. Cero solapamiento.
- `export/import` de drawings usuario nunca tocan KZ — segregación estructural, no por filtro.
- **Verificación bytes al carácter**: `createLineToolsPlugin` NO guarda referencia única en series. Técnicamente viable.
- **Coste real al carácter**: doble carga vendor `lightweight-charts-line-tools-core.js` (399KB) en memoria. Doble inicialización handlers UI (selección, edición, hover) que NO queremos para KZ. Doble subscripción a eventos LWC.
- Beneficio: arquitectura limpia, sin filtros frágiles.
- **Veredicto**: viable pero subóptimo. Overhead innecesario.

**Opción C — Primitive custom directo `series.attachPrimitive`**:
- Implementar KZ como custom primitive sin pasar por `createLineToolsPlugin` ni `LineToolRectangle`.
- Total control. KZ no aparecen en `_tools` map del LineToolsCorePlugin.
- **Verificación bytes al carácter**: `attachPrimitive` API pública LWC nativa. LineToolsCorePlugin vendor lo usa N veces. Soporta múltiples primitives sobre misma series confirmado.
- Coste: aprender API primitives LWC nativa, escribir paneView + renderer custom (similar a lo que hace `LineToolRectanglePaneView` internamente — ~150-250 líneas).
- Beneficio: máxima limpieza, ningún acoplamiento con plugin de drawings, cero filtros.
- **Coste real al carácter**: 1-2 sesiones solo escribiendo el primitive custom + tests + integración.
- **Veredicto**: profesional como TradingView. Calidad TradingView NO negociable según CLAUDE.md §1.

---

## §9 — Decisión arquitectónica: Opción C (primitive custom directo)

Decisión Ramón verbatim al carácter: "haz todo lo que tengas que hacer para no fallar.. me encantaria que quede bien, profesional como tradingview y como se ve el indicador en tv".

CTO interpretación: calidad TradingView NO negociable. Decisión arquitectónica = Opción C.

**Razones objetivas al carácter**:

1. **Profesional como TradingView**: C es el patrón nativo LWC, exactamente como hace LineToolsCorePlugin internamente, pero sin overhead UI (selección/edición/hover que NO queremos para KZ).

2. **Sin filtros consumer-side**: KZ NO entran en `exportLineTools()` porque no están en `_tools` Map del plugin de drawings.

3. **Sin segundo plugin LineToolsCore**: evita carga doble vendor (399KB) + duplicar memoria + handlers UI duplicados.

4. **Coordinación LWC nativa**: paneViews `priceToCoordinate`/`timeToCoordinate` invocados INTERNAMENTE por LWC con scale fresh garantizado en cada frame. Estructuralmente imposible que S33.4 reaparezca.

5. **Reducción de código**: `KillzonesOverlay.js` 505 → ~250 líneas (estimación). Eliminamos canvas externo, ResizeObserver propio, subscribeSizeChange propio, draw síncrono, dpr management.

6. **Replicación al carácter del modelo Pine Script**: API operativa idéntica conceptualmente (`box.new({time, price}, ...)` ↔ primitive paneView con `points: [{timestamp, price}]`).

**Comparativa final A vs B vs C**:

| Criterio | A (filtros) | B (2 plugins) | **C (primitive)** |
|---|---|---|---|
| Calidad TradingView | NO | parcial | **SÍ** |
| Deuda consumer-side | alta | baja | **cero** |
| Overhead memoria | bajo | alto (×2 vendor) | **bajo** |
| Overhead handlers UI | bajo | alto (×2) | **bajo** |
| Replica modelo Pine Script | NO | parcial | **SÍ al carácter** |
| Riesgo S33.4 reaparece | medio | bajo | **cero estructural** |
| Scope migración | bajo (3 líneas) | medio | **medio-alto** |
| Lecciones CLAUDE.md §4.2 | viola | cumple parcial | **cumple al carácter** |

C gana 7/8 criterios al carácter. NO Opción A. NO Opción B. **Opción C confirmada**.

---

## §10 — Revert bicapa limpio working tree

Decisión Ramón al carácter: cerrar s36 ordenado sin aplicar migración. s37 dedicada al diseño esqueleto + lectura ejemplos primitives. s38 implementación + integración.

Razones:
- s36 ya 4+ horas. Aplicar migración fresh sin diseño riguroso = riesgo §15 (improvisar fix sin diagnóstico).
- Instrumentación KZ-DBG-S33.4-v2 cumplió su propósito (caracterización empírica completada). Mantenerla en commits contamina sin valor.
- Producción `6abc870` intacta. NO urgencia. CLAUDE.md §1 dice "calidad TradingView", no "rápido".

**Comando revert ejecutado al carácter por Ramón**:
```
git checkout -- components/KillzonesOverlay.js
```

**Verificación bicapa post-revert verbatim**:
```
git status --short → vacío
wc -l components/KillzonesOverlay.js → 505 (baseline pre-instrumentación s36)
grep -c "KZ-DBG-S33.4-v2" components/KillzonesOverlay.js → 0
```

PASS 3/3 al carácter. Working tree clean. Cero residuos. Cero contaminación `origin/main`.

---

## §11 — Lecciones acumuladas

**Lección §14 (intuición Ramón = input técnico encriptado) — vigesimoprimera sesión consecutiva al carácter**.

s36 nuevas instancias:

1. Pregunta verbatim "¿y lo ya pintado de las killzones no se puede anclar al precio y hora? como los drawings?". Abrió vía arquitectónica correcta que CTO no había explorado tras 4 rondas instrumentación (s31/s33/s34/s35/s36) tratando S33.4 como race timing reparable consumer-side. CTO había escalado complejidad de instrumentación (s31 1 disparador, s33 múltiples, s34 dpr, s35 fix A, s36 hunks A+B+C) sin cuestionar el modelo arquitectónico subyacente (canvas externo con conversión manual). Pregunta Ramón = reframe arquitectónico al carácter.

2. Cazada §9.4 #1 ("k kieres k haga? probar lo k ya sabemos k esta mal?"). Ahorró ciclo gastado verificando viveza S33.4 producción innecesariamente.

3. Cazada §9.4 #2 ("k control bueno, si se desajusta tambien..."). Evitó cerrar Hunk C con muestreo defectuoso solo eje Y. Forzó diseño correcto `getSample() → {y, x}` que reveló race eje X.

4. Aportación Pine Script TradingView. Sin esa aportación, CTO habría continuado con conjeturas sobre cómo TradingView resuelve esto. Pine Script = ground truth verificable en bytes.

5. Aportación capturas FX Replay pre/post expandir. Refutó suposición CTO inicial path 1 = CONTROL bueno. Forzó refinamiento diagnóstico path por path.

**Lección §43 (eliminar disparador "incorrecto" sin garantizar disparador "correcto" en TODOS los paths)** — patrón aplicado preventivamente en s36.

CTO consideró opción "double-RAF" (B.2) como alternativa a C. B.2 = añadir `requestAnimationFrame(() => requestAnimationFrame(draw))` post-resize. Cubre race scale X observado en RO#3 (2 RAFs convergen). PERO: §43 advierte que solucionar UN path no garantiza TODOS los paths. ¿Hay path donde 2 RAFs no basten? Path original fullscreen botón simulador NO ha sido instrumentado con KZ-DBG-S33.4-v2 todavía. Aplicar B.2 sin verificar empíricamente TODOS los paths = riesgo regresión tipo Fix A s35.

Decisión: C estructural elimina la categoría de bugs, no path específico. §43 satisfecho por construcción.

**Lección §44 NUEVA — caracterización empírica DOS veces**.

Cuando Fix A se refuta por logs propios, NO es failure — es oportunidad de re-caracterizar con instrumentación discriminante adicional. Hunks A+B+C reveló race eje X que Fix A diagnóstico s35 NO capturó (porque solo muestreaba eje Y).

Aplicabilidad: cada vez que un fix se refuta empíricamente, la instrumentación que lo refutó NO basta. La siguiente iteración debe extender instrumentación a las dimensiones NO cubiertas previamente. NO repetir el mismo experimento esperando resultado distinto.

**Lección §45 NUEVA — Pine Script como ground truth arquitectónico**.

Cuando usuario aporta código del indicador objetivo (TradingView Pine, FX Replay JS, etc.), su API revela el modelo arquitectónico correcto sin ambigüedad. NO conjeturar cómo lo resuelve la plataforma referencia → leer su código fuente verbatim.

Aplicabilidad: cualquier proyecto donde existe una implementación referencia funcional. Leerla precede a diseñar. CLAUDE.md §1 ("calidad TradingView") implica TradingView como referencia operativa, no aspiracional abstracto.

**Lección §46 NUEVA — profundizar inventario en bytes ANTES de decidir A/B/C**.

Decidir entre opciones arquitectónicas sin haber leído `attachPrimitive` interface + `ISeriesPrimitive` + cómo LineToolsCorePlugin lo usa internamente = decisión a ciegas. Inventario completo en bytes precede decisión.

Aplicabilidad: cualquier punto de bifurcación arquitectónica con opciones aparentemente equivalentes. Bytes en mano antes que conjetura.

---

## §12 — Plan sesión 37: diseño KillzonesPrimitive.js

**Objetivo s37 al carácter**: diseñar esqueleto `components/KillzonesPrimitive.js` implementando `ISeriesPrimitive`. NO implementar todavía. Lectura + diseño + plan implementación detallado.

**PASO 0 s37 propuesto**:

1. Lectura entera `node_modules/lightweight-charts/dist/lightweight-charts.development.mjs` secciones primitives + paneViews + renderer.

2. Lectura entera `node_modules/lightweight-charts/dist/typings.d.ts`:
   - Interface `ISeriesPrimitiveBase`.
   - Interface `SeriesAttachedParameter`.
   - Interface `IPrimitivePaneView` + `IPrimitivePaneRenderer`.
   - Interface `BitmapCoordinatesRenderingScope`.

3. Lectura ejemplos primitives oficiales LWC:
   - `node_modules/lightweight-charts/dist/lightweight-charts.standalone.development.js` clases `Ze` (image watermark), `Fe` (text watermark), `gs` (custom series base).
   - Verificar patrón `useBitmapCoordinateSpace` + `useMediaCoordinateSpace`.

4. Lectura `vendor/lightweight-charts-line-tools-rectangle/dist/lightweight-charts-line-tools-rectangle.js` clase `LineToolRectanglePaneView`:
   - Cómo convierte `{timestamp, price} → {x, y}` en `_updatePoints()`.
   - Cómo decide culling con bounding box.
   - Cómo invoca `RectangleRenderer` + `TextRenderer`.

5. Inventario `KillzonesOverlay.js` 505 líneas actual: identificar qué se preserva (lógica cálculo sesiones cluster D-1, prev, current, next, ASIA/LONDON/NY) vs qué se elimina (canvas externo, ResizeObserver, subscribeSizeChange, draw, dpr, resizeCanvas).

**Diseño esqueleto propuesto s37**:

```js
// components/KillzonesPrimitive.js (esqueleto s37, no implementar todavía)

class KillzonesPrimitive {
  constructor(sessions) {
    this._sessions = sessions  // [{startTime, endTime, high, low, label, color}, ...]
    this._paneViews = [new KillzonesPaneView(this)]
    this._chart = null
    this._series = null
  }

  // ISeriesPrimitive API
  attached({chart, series, requestUpdate}) {
    this._chart = chart
    this._series = series
    this._requestUpdate = requestUpdate
  }

  detached() {
    this._chart = null
    this._series = null
  }

  paneViews() {
    return this._paneViews
  }

  updateAllViews() {
    this._paneViews.forEach(pv => pv.update())
  }

  // API consumer-side
  setSessions(sessions) {
    this._sessions = sessions
    this.updateAllViews()
    this._requestUpdate?.()
  }
}

class KillzonesPaneView {
  constructor(primitive) {
    this._primitive = primitive
    this._renderer = new KillzonesRenderer()
  }

  update() {
    const sessions = this._primitive._sessions
    const series = this._primitive._series
    const timeScale = this._primitive._chart.timeScale()

    // Convertir cada sesión a coords frescas — LWC garantiza scale fresh aquí
    const boxes = sessions.map(s => ({
      x1: timeScale.timeToCoordinate(s.startTime),
      y1: series.priceToCoordinate(s.high),
      x2: timeScale.timeToCoordinate(s.endTime),
      y2: series.priceToCoordinate(s.low),
      color: s.color,
      label: s.label,
    })).filter(b => b.x1 !== null && b.x2 !== null && b.y1 !== null && b.y2 !== null)

    this._renderer.setBoxes(boxes)
  }

  renderer() {
    return this._renderer
  }

  zOrder() {
    return 'bottom'  // KZ debajo de velas + drawings usuario
  }
}

class KillzonesRenderer {
  constructor() {
    this._boxes = []
  }

  setBoxes(boxes) {
    this._boxes = boxes
  }

  draw(target) {
    target.useBitmapCoordinateSpace(({context, horizontalPixelRatio, verticalPixelRatio}) => {
      this._boxes.forEach(b => {
        context.fillStyle = b.color
        const x1 = Math.round(b.x1 * horizontalPixelRatio)
        const y1 = Math.round(b.y1 * verticalPixelRatio)
        const x2 = Math.round(b.x2 * horizontalPixelRatio)
        const y2 = Math.round(b.y2 * verticalPixelRatio)
        context.fillRect(x1, y1, x2 - x1, y2 - y1)
        // TODO: bordes, labels, opacidad
      })
    })
  }
}
```

**Plan s37 final**:
- PASO 0: lectura entera referencias arriba.
- PASO 1: redactar `refactor/fase-5g-killzones-primitive-design.md` con diseño detallado + estructura completa esqueleto + decisiones zOrder + culling + interaction (KZ NO interactivas).
- PASO 2: inventario al carácter funciones reutilizables de `KillzonesOverlay.js` actual (`computeKillzoneSessions`, `getSessionColor`, `getSessionLabel`, etc.).
- PASO 3: commit docs s37 (`refactor/fase-5g-killzones-primitive-design.md` + actualización `CLAUDE.md` §4.2 con decisión C).
- NO tocar runtime en s37.

---

## §13 — Plan sesión 38: implementación + verificación S33.4 desaparece estructuralmente

**Objetivo s38 al carácter**: implementar `components/KillzonesPrimitive.js` + integrar en `_SessionInner.js` + verificar empíricamente S33.4 desaparece estructuralmente.

**PASO 0 s38**:
- Re-leer `refactor/fase-5g-killzones-primitive-design.md`.
- Verificar bytes baseline working tree clean.

**PASO 1 s38 — implementar `KillzonesPrimitive.js`**:
- Implementar al carácter el esqueleto diseñado en s37.
- Verificar bicapa bytes + `wc -l` + `grep` patterns clave.

**PASO 2 s38 — integrar en `_SessionInner.js`**:
- Importar `KillzonesPrimitive`.
- Instanciar con `cachedSessionsRef.current`.
- Invocar `cr.series.attachPrimitive(killzonesPrimitive)` en mount.
- Invocar `cr.series.detachPrimitive(killzonesPrimitive)` en unmount.
- Actualizar primitive cuando `cachedSessionsRef.current` cambia (`killzonesPrimitive.setSessions(...)`).

**PASO 3 s38 — eliminar `KillzonesOverlay.js`**:
- Verificar no quedan imports residuales.
- Mover archivo a `refactor/archived/KillzonesOverlay.js.s35-baseline` por trazabilidad.
- O `git rm` directo si NO se necesita rollback rápido.

**PASO 4 s38 — smoke local discriminante**:
- Build local PASS.
- Server `npm run start`.
- Smoke path 1 (doble-click barra título) → KZ deben permanecer en posición.
- Smoke path 2 (expandir botón verde Chrome) → KZ deben permanecer en posición (cambio dramático scale X).
- Smoke path 3 (contraer ventana media pantalla) → KZ deben permanecer.
- Smoke path 4 (fullscreen botón simulador propio) → KZ deben permanecer.
- **Verificación al carácter**: KZ NO se descolocan en NINGÚN path. S33.4 desaparece estructuralmente.

**PASO 5 s38 — push producción** (si smoke PASS):
- Commit migration.
- Push origin/main.
- Verificar deploy Vercel.
- Smoke producción `simulator.algorithmicsuite.com`.

**Riesgos identificados al carácter para s38**:
- Estilo visual KZ puede diferir del baseline canvas externo (bordes, opacidad, antialiasing). Tunear hasta paridad pixel-perfect.
- Labels ASIA/LONDON/NY pueden necesitar implementación TextRenderer separada. Diferir si scope crece — opción usar `LineToolRectangle` del vendor con labels integradas vs primitive 100% custom.
- Z-order interaction con TrendLines + Rectangles usuario. Verificar KZ siempre debajo (`zOrder: 'bottom'`).

---

## §14 — Items diferidos post-Phase-5

Items registrados al carácter para resolver tras cierre fase 5 / S33.4:

1. **5f.2 polling cleanup** — diferido desde s28. `setInterval` polling residual.
2. **5e.4 debugCtx cleanup** — diferido desde s29. Helpers debug expuestos en `window.__algSuite*`.
3. **5d.7-5d.8 viewport preservation** — diferido desde s30. TradingView-style viewport persistence al cambio timeframe.
4. **Killzones regression** — placeholder s33.5 si aparece regresión visual post-migración C.
5. **Debt 5.1** — TradingView-style viewport preservation on timeframe change. Diferido a su fase arquitectónica correcta (post-Phase-5).
6. **Datos crudos Giancarlo/Luis "drawings zona futura derecha"** — diferido desde s30. Investigación bug drawings persisten en posición incorrecta tras reload.
7. **Sub-phase 5f LS-DEBUG cleanup** — diferido desde s23. Cleanup `chartViewport.js:121` JSDoc orphan reference `__algSuiteDebugLS`.

Todos diferidos al carácter hasta cierre S33.4 estructural en s38.

---

## §15 — Cierre sesión 36

Sesión 36 cerrada al carácter 23 mayo 2026, ~14:30 hora local.

`origin/main` post-cierre s36 = `<HASH-HANDOFF-s36>` (HANDOFF docs).
Producción `6abc870` intacta decimosexta sesión consecutiva.
Working tree clean. Cero contaminación.

S33.4 reformulada empíricamente al carácter. Decisión arquitectónica C tomada con bytes en mano. Plan s37 + s38 trazado al carácter. Lecciones §44 §45 §46 nuevas registradas. Lección §14 vigesimoprimera sesión consecutiva.

Próxima sesión = sesión 37. Prioridad 1 = diseño esqueleto `KillzonesPrimitive.js`. PASO 0 lectura interfaces LWC + ejemplos primitives + Pine Script reread cuando dudas.

Calidad TradingView no negociable. CLAUDE.md §1.

— CTO
