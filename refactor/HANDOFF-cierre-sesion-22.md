# HANDOFF — cierre sesión 22

> Fecha: 7 mayo 2026, sesión "simulador 22".
> Autor: Claude Opus 4.7 (CTO/revisor) + Claude Code (driver técnico) + Ramón Tarinas (pegamento humano).
> Estado al redactar: rama `refactor/fase-5-drawings-lifecycle` con 3 commits funcionales nuevos sobre `590abe2` previo. Cadena al carácter: `5b233b4` (5d.7) → `590abe2` (5d.6) → `96eb2e8` (5d.5) → `d7ee4a8` (5d.3) → `4f943a4` (5d.2) → `aa1498a` (5d.1) → `84a3342` (5c) → `1897eba` (plan v3) → `f2c7476` (plan v2) → `195d02b` (plan v1) → `e5ae43e` (HANDOFF 21 en main). Working tree limpio. Sin push de feature (patrón).

---

## §0 — Sin maquillaje al carácter

Sesión 22 cerró **con éxito al carácter**. **3 commits funcionales nuevos** en rama feature (5d.5, 5d.6, 5d.7) — ratio idéntico a sesión 21 sobre el mismo cluster B. Plan v3 vivo por **tercera sesión consecutiva**.

**Hito mayor de la sesión**: la deuda 5.1 viewport (bug que Ramón observó al carácter desde sesión 20) **queda cerrada empíricamente al carácter** en el commit `5b233b4`. Verificación visual al carácter por Ramón al cambiar TF en zona pasada con drawings extendidos: el viewport se ancla al último real + 8 barras, ignorando el endpoint del drawing. Comportamiento estilo TradingView, alineado con CLAUDE.md §1 principio rector.

**Contrato `chartTick` formalmente cerrado al carácter**: tras sub-fases 5d.5 (CustomDrawingsOverlay) y 5d.6 (PositionOverlay), los **4 overlays** del cluster B declaran consumo del contrato. El hallazgo crítico documentado en HANDOFF 17 §2.3 ("ninguno de los 4 overlays consume `chartTick` directamente") **queda invertido al carácter**.

**Patrón sostenido**: sesiones 20+21+22 mantienen plan v3 produciendo código semana tras semana. Tras 4 sesiones secas previas (16-19), la decisión arquitectónica de aplazar cluster A a fase 5.A y atacar cluster B con plan táctico atomizable demuestra valor empírico al carácter por tercera vez.

**Sub-fase 5d.8 cerrada al carácter sin commit nuevo** — patrón decidido durante sesión: atomización 5d.5/5d.6/5d.7 = 1 commit por sub-fase, smoke combinado §5.8 = verificación final, sin código nuevo.

**Decisión Opt+R al carácter**: aplazado a sub-fase 5f. Razón: cabía técnicamente pero cansancio acumulado tras 3 commits + hallazgo nuevo en smoke (bug resize KillzonesOverlay) hizo que CTO recomendara cierre limpio sobre meter 4º commit con riesgo §9.4. Aprobación de Ramón al carácter.

**5 errores §9.4 capturados al carácter durante la sesión** — frecuencia mayor que sesión 21 (3 errores), explicada por el cambio de signo en 5d.7 que generó cadena de pequeños desliz adicionales. Ver §7 al carácter.

**1 deuda nueva descubierta al carácter durante smoke combinado**: bug resize KillzonesOverlay en cambio a pantalla completa. Bug pre-existente, NO regresión de sesión 22, registrado en §9.

**Sin push** — patrón cluster B al carácter: feature no se pushea hasta cierre completo (sesión 25 según plan v3 §7 punto 8). HANDOFF 22 sí push a main como patrón histórico.

---

## §1 — Resumen ejecutivo (lenguaje llano)

Hoy cerramos al carácter las 4 sub-fases planificadas para sesión 22:

1. **5d.5** — CustomDrawingsOverlay ahora declara `chartTick` como dep en su useEffect de redraw. Trabajo principalmente arquitectónico (CTO honesto al carácter durante §4.9): el componente ya funcionaba sin él porque tenía 2 mecanismos redundantes de invalidación (subscribe LWC + tfKey), pero el contrato formal exigía el conector. Edit microscópico de 5+/5- en 2 archivos.

2. **5d.6** — PositionOverlay refactorizado al carácter con extracción de `update` a `useCallback` estable. Polling 150ms preservado como defensa contra zoom Y. Nuevo useEffect dedicado que dispara `update()` inmediato cuando bumpea `chartTick`. Reducción de latencia de ~150ms (peor caso polling) a ~16ms (próximo paint) en cambio TF. Primer overlay donde `chartTick` aporta valor funcional, no solo arquitectónico.

3. **5d.7** — Deuda 5.1 viewport cerrada empíricamente al carácter. Fórmula final tras error §9.4 mayor capturado por Ramón en smoke (signo invertido inicial): `offset = 8 - (phantomsNeeded || 0)` en `scrollToTailAndNotify`. Compensa el array que incluye phantoms para drawings, anclando el viewport al último real + 8. Sin tocar `lib/chartViewport.js` — la firma de `scrollToTail` quedó intacta.

4. **5d.8** — Smoke combinado §5.8 ejecutado al carácter por Ramón. 4 tests OK + 1 sin testear no-bloqueante + 1 hallazgo nuevo (bug resize KillzonesOverlay en pantalla completa, pre-existente). Sin commit nuevo (verificación, no código).

**Coste de la sesión**: ~5h efectivas en chat. 3 commits atómicos en feature. 5 errores §9.4 detectados y corregidos en vivo (CTO + dueño). 1 deuda nueva descubierta empíricamente.

**Verificación bicapa al carácter durante toda la sesión**: outputs de shell zsh nativa pegados al chat tras cada Edit antes de comitear. Patrón §7.4 sesión 21 (verificación bicapa estricta también para Claude Code) aplicado al carácter en cada commit.

---

## §2 — Estado al carácter (verificable desde shell)

### §2.1 Git

- **Rama activa al cierre**: `refactor/fase-5-drawings-lifecycle`.
- **HEAD feature al cierre**: `5b233b4` (5d.7).
- **Cadena feature**: `5b233b4` → `590abe2` (5d.6) → `96eb2e8` (5d.5) → `d7ee4a8` (5d.3) → `4f943a4` (5d.2) → `aa1498a` (5d.1) → `84a3342` (5c) → `1897eba` (plan v3) → `f2c7476` (plan v2) → `195d02b` (plan v1).
- **`origin/main`** al arranque sesión 22 = `e5ae43e` (HANDOFF 21).
- **`main` local al cierre redacción** = `e5ae43e`. Pendiente §6 cierre.
- **Working tree** limpio en feature al carácter.
- **Sin push** de feature (patrón cluster B).

### §2.2 Producción Vercel

- Deploy actual: `d76ed4b` (sesión 19, intacto).
- Runtime efectivo: idéntico a sesión 19. **Cero cambios funcionales al runtime de producción desde 2 may 2026** (commit `89e36ee`, fase 4d).
- Hoy = ~5+ días sin código nuevo en producción. **Continuará creciendo hasta sesión 25** (merge feature → main según plan v3 §7 punto 8). Es **intencional** al carácter, no señal de alarma.

### §2.3 Tamaños actuales al carácter

| Archivo | Líneas pre-22 | Líneas post-22 | Delta |
|---|---|---|---|
| `lib/chartViewport.js` | 202 | 202 | 0 |
| `components/_SessionInner.js` | 3031 (no 3032 como anoté en HANDOFF 21 §3.3 — error mío §7.2 abajo) | 3052 | **+21** |
| `components/useDrawingTools.js` | 243 | 243 | 0 |
| `components/useCustomDrawings.js` | 62 | 62 | 0 |
| `components/KillzonesOverlay.js` | 455 | 455 | 0 |
| `components/RulerOverlay.js` | 256 | 256 | 0 |
| `components/CustomDrawingsOverlay.js` | 192 | 192 | 0 |

**Cambio neto en líneas tocadas al carácter**: ~30 modificadas, +21 netas (commits 5d.5/5d.6/5d.7 combinados). Por sub-fase:
- 5d.5: 5+/5- en 2 archivos.
- 5d.6: 42+/32- en 1 archivo (refactor de extracción `update` a useCallback).
- 5d.7: 12+/3- en 1 archivo (`scrollToTailAndNotify` + comentario explicativo de 7 líneas).

**Plan v3 §5 estimaba ~100-200 líneas para 5d.5-5d.8.** Real al carácter ~30 modificadas + 21 netas. **Patrón calibrado al carácter**: sobreestimación 3-5× similar a sesión 21 (§8.4 HANDOFF 21). Plan v3 sobreestima sub-fases atómicas de cluster B en ese factor.

### §2.4 Invariantes fase 4 al cierre — verificadas al carácter

```
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"
→ vacío ✓

grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"
→ vacío ✓

grep -n "computePhantomsNeeded" components/_SessionInner.js
→ 3 matches en L116, L1145, L1224 ✓
```

Las 3 invariantes fase 4 mantenidas al carácter por tercera sesión consecutiva (heredadas de sesión 12). Sub-fase 5c (sesión 20) + 5d.1-5d.3 (sesión 21) + 5d.5-5d.7 (sesión 22) **cero violaciones** acumuladas.

### §2.5 Contrato `chartTick` al cierre — los 4 overlays consumen formalmente

```
grep -rn "chartTick" components/_SessionInner.js components/KillzonesOverlay.js \
  components/RulerOverlay.js components/CustomDrawingsOverlay.js
```

Resumen al carácter de los matches:
- **`_SessionInner.js`**:
  - L238 JSDoc cabecera contrato.
  - L261 declaración `useState`.
  - L1189 comentario helper R6.
  - L1243 comentario cabecera helper.
  - L1254 (NUEVO 5d.7) comentario fix viewport.
  - L1934 prop JSX KillzonesOverlay.
  - L1935 prop JSX RulerOverlay.
  - L1936 (NUEVO 5d.5) prop JSX CustomDrawingsOverlay.
  - L1945 (NUEVO 5d.6) prop JSX PositionOverlay.
  - L2865 (NUEVO 5d.6) firma componente PositionOverlay.
  - L2926 (NUEVO 5d.6) useEffect dedicado al chartTick.
- **`KillzonesOverlay.js`**: L117 firma + L192 dep array (heredado 5d.2).
- **`RulerOverlay.js`**: L16 firma + L190 cabecera + L192 línea + L198 dep array (heredado 5d.3).
- **`CustomDrawingsOverlay.js`** (NUEVO 5d.5): L83 firma + L121 comentario + L122 dep array.

**Los 4 overlays del cluster B declaran formalmente consumo de `chartTick`.** El hallazgo crítico HANDOFF 17 §2.3 invertido al carácter por la unión de sesiones 21 + 22.

### §2.6 6 helpers post-5c al carácter — siguen vivos como entidades separadas

```
grep -n "resolveCtx\|deselectActiveDrawings\|computeTfPhantomsCount\|applyForcedSetData\|bumpTfKey\|scrollToTailAndNotify" components/_SessionInner.js
```

Output al carácter al cierre — 6 declaraciones + 6 referencias en orquestador. Mapa:

```
1. resolveCtx               → L1198    (sin cambios desde 5c)
2. deselectActiveDrawings   → L1208    (sin cambios desde 5c)
3. computeTfPhantomsCount   → L1215    (sin cambios desde 5c)
4. applyForcedSetData       → L1233    (sin cambios desde 5c)
5. bumpTfKey                → L1240    (sin cambios desde 5c)
6. scrollToTailAndNotify    → L1252    (MODIFICADO 5d.7 — recibe phantomsNeeded
                                        + offset = 8 - (phantomsNeeded || 0) +
                                        comentario explicativo de 7 líneas)
```

Los 6 helpers siguen siendo entidades separadas al carácter. La separación 5c es base operativa de 5d completa — sin ella, atacar `scrollToTailAndNotify` aisladamente en 5d.7 habría requerido un Edit mucho más grande.

### §2.7 Bugs y deudas al cierre

| ID | Descripción | Estado al cierre 22 |
|---|---|---|
| Quota Supabase | Plan Free excedido — gracia hasta 24 may 2026 | ⏳ Abierta — decisión arquitectónica pendiente |
| Verificación pares 2026 | 6 pares × 2026 desde Dukascopy | ✅ Cerrada en sesión 16 |
| **Deuda 5.1 — UX viewport** | Mantener vista al cambiar TF + atajo Opt+R/Alt+R | **✅ CERRADA EMPÍRICAMENTE AL CARÁCTER en `5b233b4` (sub-fase 5d.7)** |
| Regresión Killzones (descubierta sesión 16) | Killzones se descolocan al cambiar TF si viewport restaurado post-setData | ✅ Cerrada en sesión 21 (sub-fase 5d.2) |
| Deuda pares secundarios + drawings persistencia | `activePairs` añadidos in-session no se guardan en BD | ⏳ Abierta — cluster A territory, sub-fase 5.A futura |
| Deuda mayor — `session_drawings` no separa drawings por par | 1 fila por sesión, blob `data` único con todos los drawings de todos los pares mezclados | ⏳ Abierta — cluster A territory, sub-fase 5.A futura |
| 4.5 | `__algSuiteExportTools` no registrado | ⏳ Backlog (sub-fase 5e si cabe) |
| Warning lifecycle plugin LWC | `_requestUpdate is not set` al destruir tool | ⏳ Backlog cluster A |
| B5 | `409 Conflict` race `session_drawings` | ⏳ Backlog cluster A |
| Limpieza ramas locales (~10 viejas) | Higiene git | ⏳ Backlog |
| **Atajo Opt+R — restablecer vista del gráfico** | Atajo de teclado para `resetViewportToDefault(cr, tf, aggLength)` (ya existe el helper en `lib/chartViewport.js` desde fase 3, falta el handler de keydown) | ⏳ APLAZADO a sub-fase 5f tras decisión sesión 22 |
| **Bug resize KillzonesOverlay en pantalla completa** (NUEVO) | Al cambiar a pantalla completa con killzones a la izquierda, hay una "línea imaginaria" más a la derecha donde las que están más allá no se pintan. Mover el chart un píxel las restaura. Bug pre-existente descubierto al carácter durante smoke combinado §5.8 sesión 22, NO regresión de cluster B | ⏳ NUEVA — sub-fase de overlays-resize a calendarizar (5f o sesión específica) |
| **Warning API 4MB candles 2026** (NUEVO) | `API response for /api/candles?pair=EURUSD&timeframe=M1&from=...&year=2026 exceeds 4MB. API Routes are meant to respond quickly.` Aparece en consola del servidor `npm run dev`. Probablemente pre-existente, descubierto durante smoke sesión 22 | ⏳ NUEVA — backlog, no bloqueante |

---

## §3 — Lo que se hizo (técnico)

### §3.1 Sub-fase 5d.5 — CustomDrawingsOverlay

**Commit**: `96eb2e8` — "refactor(fase-5/5d.5): conectar CustomDrawingsOverlay al contrato chartTick + arreglar typo 5d.5/5d.6 en JSDoc"

**Hallazgo arquitectónico al carácter durante PASO 0 §4.6**: la hipótesis del prompt §2.6 ("CustomDrawingsOverlay tiene cache derivado del dataset → política recalcular") se **refuta parcialmente al carácter** tras leer bytes. Lo que veo en `components/CustomDrawingsOverlay.js` L88-122:

- Función `render()` L90-104 recalcula coordenadas en cada llamada (`drawing.points.map(p => toScreenCoords(...))`). NO hay memoización, NO hay cache.
- 2 mecanismos de invalidación ya activos:
  - Vía 1: `subscribeVisibleLogicalRangeChange` L107-116 → render en zoom/pan/scroll.
  - Vía 2: dep `tfKey` L122 useEffect → render en cambio TF tras `bumpTfKey()`.

**Implicación CTO al carácter**: el componente **funcionaba empíricamente sin `chartTick`** porque tenía 2 canales redundantes. Conectarlo es trabajo principalmente **arquitectónico** (cierre formal del contrato HANDOFF 17 §2.3), NO funcional. CTO honesto al carácter con Ramón durante §4.9 sin maquillaje. Ramón aprobó el trabajo arquitectónico explícitamente.

**Edits aplicados al carácter en 2 archivos**:

1. `components/CustomDrawingsOverlay.js`:
   - L83: añadir `chartTick` a la firma del componente.
   - L121-122: añadir comentario + `chartTick` al dep array del useEffect L122.

2. `components/_SessionInner.js`:
   - L254: arreglar typo en JSDoc del contrato — `PositionOverlay` decía `(sub-fase 5d.5, sesión 22)`, corregido a `(sub-fase 5d.6, sesión 22)`. Typo redactado en commit `aa1498a` (5d.1) que pasó la review.
   - L1936: pasar `chartTick={chartTick}` al JSX de `<CustomDrawingsOverlay>`.

**Verificación bicapa estricta al carácter**: `git diff` mostró exactamente los 4 cambios planificados, sin código fuera de scope. Cluster A intacto. JSX de Killzones+Ruler adyacentes (L1934-1935) intactos.

**Smoke §5.4 al carácter por Ramón**: drawing custom (RULER en su caso) ancorado al `{time, price}` en cadena M5↔M15↔H1↔M5. Sin saltos visuales raros. PASS al carácter.

**Observación crítica capturada durante smoke 5d.5 al carácter por Ramón** (sin maquillaje): durante el smoke, Ramón notó al carácter que el viewport se centraba en el endpoint del drawing en lugar de la última vela real al bajar TF. CTO inmediatamente diagnosticó al carácter: NO es regresión de 5d.5 (que solo conecta un dep adicional al useEffect existente), es la **deuda 5.1 viviente** que vive desde sesión 20. Calendarizada para 5d.7. Esta confirmación empírica refuerza la hipótesis bytes ya verificada en PASO 0 bloque 3 §H4.

**Edit estimado al carácter pre-Edit**: ~3-5 líneas. **Real**: 5+/5-. Calibrado.

### §3.2 Sub-fase 5d.6 — PositionOverlay

**Commit**: `590abe2` — "refactor(fase-5/5d.6): conectar PositionOverlay al contrato chartTick (useCallback estable + useEffect inmediato, polling 150ms preservado)"

**Hallazgo arquitectónico al carácter durante PASO 0 §4.7**: PositionOverlay vive como **helper local en `_SessionInner.js`** desde L2865 (drift +69 líneas vs L2796 reportado en HANDOFF 17 §2.3 — confirmado al carácter). Inventario al carácter L2865-3031:

- 3 useEffects + drag handlers globales.
- **useEffect crítico** L2878-2911: `setInterval(update, 150)` que recalcula `priceToCoordinate(...)` para todas las posiciones+orders cada 150ms. **Mecanismo activo (timer-based), NO reactivo.**
- Cubre cambio de precio en vivo, zoom Y, cambio TF, drag de líneas. Pero con latencia ~150ms.

**Política decidida al carácter durante §4.9**: Opción B — añadir `chartTick` como prop + useEffect separado que llame `update()` inmediato, polling 150ms intacto.

Razón técnica al carácter:
- Polling 150ms cubre eventos sin contrato formal (especialmente zoom Y del usuario, que LWC no expone como evento). NO eliminarlo.
- `chartTick` es señal precisa de cambio de dataset. Llamar `update()` inmediato reduce latencia visible de ~150ms a ~16ms (próximo paint).
- **Primer overlay donde `chartTick` aporta valor funcional, no solo arquitectónico.** Cambio TF con SL/TP visibles dejará de tener jitter de ~150ms al reposicionar las líneas.

**Edits aplicados al carácter en 1 archivo (`_SessionInner.js`)**:

1. L2865: añadir `,chartTick` al final de la destructure de la firma del componente.
2. L2880-2925: refactor — extraer función `update` del useEffect a `useCallback` estable con deps `[positions, pendingOrders, chartMap, activePair, dataReady]`. El polling useEffect ahora solo arranca el setInterval con la callback estable. Nuevo useEffect dedicado: `useEffect(() => { update() }, [chartTick, update])`.
3. L1945: pasar `chartTick={chartTick}` al JSX de `<PositionOverlay>` (multilínea).

**Refinamiento técnico al carácter**: el guard `if(!dataReady) return` ahora vive **dentro** de `update` (en vez de fuera, antes vivía en el useEffect). Cubre TODOS los call sites incluyendo el chartTick. Comportamiento equivalente al pre-edit en el caso polling.

**Verificación bicapa estricta al carácter**: `git diff` mostró net +42/-32 = +10 líneas. Solo zona PositionOverlay tocada. Cluster A intacto. JSDoc contrato intacto.

**Verificación adicional al carácter**: `useCallback` ya importado en L9 desde sesiones previas (`import { useEffect, useRef, useState, useCallback } from 'react'`). NO requirió Edit adicional al import.

**Smoke §5.5 al carácter por Ramón**: BUY o SELL de mercado con SL/TP visibles. Cadena M5↔M15. Las 3 líneas (entry/SL/TP) siguen alineadas al precio correcto en cada cambio TF. PASS al carácter.

**Edit estimado al carácter pre-Edit**: ~10-15 líneas. **Real**: 42+/32- (refactor de extracción es más extenso que añadir dep, pero +10 netas). Calibrado dentro de margen.

### §3.3 Sub-fase 5d.7 — Deuda 5.1 viewport (HITO MAYOR)

**Commit**: `5b233b4` — "refactor(fase-5/5d.7): cerrar deuda 5.1 viewport — anclar scroll al ultimo real compensando phantoms para drawings extendidos (estilo TradingView)"

**Causa raíz confirmada al carácter en bytes durante PASO 0 §4.8**:

Cadena cerrada al carácter:
1. Drawing extendido a la derecha del último real → `computePhantomsNeeded(tools, lastT, tfSecs)` (L116) calcula phantoms para cubrir endpoint del drawing.
2. `applyForcedSetData(cr, phantomsNeeded, ps)` (L1233) siembra el array con N phantoms a la derecha del último real vía `cr._phantomsNeeded` + `cr.prevCount = 0`.
3. `scrollToTailAndNotify(cr)` → `scrollToTail(cr, 8, ...)` → `cr.chart.timeScale().scrollToPosition(8, false)`.
4. **LWC mide `scrollToPosition` desde el final del array que INCLUYE phantoms.** No distingue real vs phantom — para LWC todos son barras.
5. Resultado al carácter: viewport se ancla a `array.length - 1 - 8` = endpoint phantom + 8 = endpoint drawing + 8, **NO al último real + 8.**

Ya no es hipótesis. Es causa raíz al carácter en bytes.

**Decisión arquitectónica §4.9.C al carácter — refinamiento durante sesión**:

CTO presentó al frente **Opción 2** del prompt §4.9 (`cr._lastRealIndex` propagado vía `cr` desde `applyForcedSetData` hasta `scrollToTailAndNotify`). Tras releer bytes del orquestador (L1248-1262) en preparación del Edit, CTO refinó al carácter a **versión más simple**: `phantomsNeeded` ya existe como **variable local del orquestador** (L1255). NO necesario introducir `cr._lastRealIndex`. NO necesario tocar `lib/chartViewport.js`. Basta con que `scrollToTailAndNotify` reciba `phantomsNeeded` como argumento.

**Pregunta UX previa al Edit (patrón §8.3 sesión 21)**: CTO presentó al frente 3 variantes UX (A/B/C) y Ramón respondió "no entiendo bien los ejemplos, lo quiero como TradingView". CTO §1.3 violation registrado al carácter (§7.5 abajo). Reformulación: 1 ejemplo concreto de variante TradingView + pregunta binaria. Ramón confirmó.

**Edits aplicados al carácter en 1 archivo (`_SessionInner.js`)**:

1. L1244-1257: ampliar `scrollToTailAndNotify` a `(cr, phantomsNeeded)` con comentario explicativo de 7 líneas + cuerpo:
   ```js
   const offset = 8 - (phantomsNeeded || 0)
   scrollToTail(cr, offset, () => setChartTick(t => t+1))
   ```
2. L1267 orquestador: `scrollToTailAndNotify(cr, phantomsNeeded)`.

**Comentario completo al carácter al cierre 5d.7**:
```
// R6: scroll a la posición actual tras el cambio de TF y notifica
//     a los overlays vía chartTick (KillzonesOverlay, RulerOverlay, etc.)
//
//     Sub-fase 5d.7 (deuda 5.1): el offset incluye phantomsNeeded para
//     que el viewport se ancle al ÚLTIMO REAL + 8 barras, ignorando los
//     phantoms sembrados por drawings extendidos a la derecha. Sin esto,
//     scrollToPosition mide desde el final del array (que incluye phantoms)
//     y el viewport arrastra el endpoint del drawing — comportamiento
//     reportado por Ramón desde sesión 20 (espacio negro + pérdida de
//     posición visible al cambiar TF). Estilo TradingView.
```

**Verificación bicapa estricta al carácter**:
- `git diff --stat` = 1 file changed, 12 insertions(+), 3 deletions(-).
- `wc -l lib/chartViewport.js` = 202 líneas, intacto al carácter ✓.
- 6 helpers post-5c siguen vivos como entidades separadas.

**Pero — error §9.4 mayor capturado al carácter por Ramón**: el primer Edit aplicado al carácter usó `offset = 8 + (phantomsNeeded || 0)` (signo invertido). Smoke al carácter tras Edit reveló al instante: **pantalla M5 completamente vacía**, eje Y rango ridículamente estrecho, sin velas visibles. CTO razonó mal el signo de la compensación — pensé "compensar hacia adelante" cuando debía ser "compensar hacia atrás" porque el final del array YA está más allá del último real. Detalle al carácter en §7.3 abajo.

**Fix aplicado al carácter — segundo Edit microscópico** (1 carácter): `8 + (...)` → `8 - (...)`. LWC sí acepta offset negativo en `scrollToPosition` — verificado empíricamente al carácter por Ramón en el segundo smoke.

**Smoke §5.1 al carácter post-fix**: estando en H1, drawing horizontal extendido a la derecha del último real visible. Cambio TF H1 → M5. **Viewport se ancla al último real + 8 velas M5 de margen, drawing fuera de pantalla a la derecha (TradingView puro)**. Bug que Ramón observaba desde sesión 20 **CERRADO empíricamente al carácter**.

**Edit estimado al carácter pre-Edit**: ~10-15 líneas en 2 archivos. **Real**: 12+/3- en 1 solo archivo (`_SessionInner.js`). `lib/chartViewport.js` intacto. Calibración al carácter mejor de lo previsto.

### §3.4 Sub-fase 5d.8 — Smoke combinado + decisión Opt+R

**Sin commit nuevo al carácter** — patrón decidido durante sesión: 5d.8 = verificación combinada de los 3 commits previos + decisión Opt+R sin código.

**Smoke combinado §5.8.A al carácter por Ramón**:

| Test | Descripción | Resultado |
|---|---|---|
| 1 | Drawing custom + cadena M5↔M15↔H1↔M5 | ✅ OK |
| 2 | BUY/SELL mercado con SL/TP + cambio TF M5↔M15 | ✅ OK |
| 3 | Drawing extendido + cambio H1→M5 (deuda 5.1) | ✅ OK |
| 4 | Cadena Killzones M5→M15→H1→H4→D1→H1→M5 | ✅ OK |
| 5 | Regla TV-style fijada + cambio TF | ⏸ Sin testear (atajo no listado, igual sesión 21) |

**Hallazgo nuevo durante smoke al carácter**: bug resize KillzonesOverlay en cambio a pantalla completa. Killzones a la izquierda del viewport pre-fullscreen no se pintan en el área "nueva" tras el resize. Mover el chart un píxel las restaura. **Pre-existente, NO regresión de sesión 22.** Diagnóstico CTO al carácter: KillzonesOverlay aparentemente NO tiene `ResizeObserver` para recalcular coords en resize del chart (CustomDrawingsOverlay sí lo tiene, vi en bytes L124-138 del PASO 0). Bug visible solo en cambio fullscreen, frecuencia operativa baja, severidad media. Calendarizado en §9.

**Decisión Opt+R al carácter — aplazada a sub-fase 5f**:

Razón técnica al carácter:
1. Sesión ya produjo 3 commits funcionales en cluster B — calibrado vs sesión 21.
2. Atajo Opt+R = handler de keydown que llama a `resetViewportToDefault(cr, tf, aggLength)` (helper ya existente en `lib/chartViewport.js` desde fase 3). Trabajo no trivial: requiere decidir qué TF "default" significa, smoke específico, integración con keyboard listener existente. Mínimo 3-4 turnos más.
3. Cansancio acumulado en sesión larga es vector §9.4 (sesión 16 §11.3 enseñó esto al carácter).
4. Plan v3 §1.2 lo lista como **deuda UX menor** — no bloquea cluster B.
5. Cerrar limpio con 3 commits funcionales > seguir arrastrando con riesgo §9.4 mayor en el 4º.

Recomendación firme CTO al carácter, aprobada por Ramón con "adelante con tu recom.". Aplazado a sub-fase 5f.

### §3.5 Mapa de invariantes al cierre — verificadas al carácter

```
✓ Las 3 invariantes fase 4 intactas (heredado sesión 12).
✓ El contrato chartTick formal con 4 consumers (HANDOFF 17 §2.3 invertido).
✓ Los 6 helpers post-5c separados (sesión 20).
✓ Cluster A INTOCABLE — verificado bicapa estricta sin maquillaje al carácter.
✓ KillzonesOverlay y RulerOverlay sin tocar (cerrados sesión 21).
✓ lib/chartViewport.js intacto (202 líneas).
✓ Working tree limpio en feature al cierre redacción.
```

---

## §4 — Para sesión 23

### §4.1 Estado al arranque sesión 23

- `origin/main` = `e5ae43e` (HANDOFF 21) si push de §6 se ejecuta tras esta redacción → **será el nuevo HEAD post-push**.
- Cadena en main (post-push): `<HANDOFF 22>` → `e5ae43e` → `f71a516` → `d76ed4b`.
- Rama feature `refactor/fase-5-drawings-lifecycle` con **8 commits funcionales acumulados de cluster B** + 3 commits de docs (planes v1/v2/v3).

### §4.2 Objetivo sesión 23

Plan v3 §8 calendariza **sub-fase 5e (parche 4.6)** para sesión 23. Recordatorio al carácter del estado de la deuda 4.6 al inicio sesión 22 (heredado HANDOFF 14): cerrada en producción desde commit `2851ef7` con un fix mínimo (1 línea + 3 de comentario) en zona del plugin LWC vendor. Plan v3 §5 sub-fase 5e propone **dejar el parche en código limpio + documentar al carácter el escenario** + posible test manual de regresión.

### §4.3 Calendarización al carácter

- **Sesión 23**: sub-fase 5e (parche 4.6 — limpieza + documentación al carácter).
- **Sesión 24**: sub-fase 5f (limpieza `oldTf` candidato + atajo Opt+R + bug resize KillzonesOverlay si cabe).
- **Sesión 25**: merge feature → main (cierre cluster B completo). Push a `origin/main` con todos los commits 5c-5f acumulados. Producción recibe los cambios al fin tras ~15+ días sin código nuevo.

### §4.4 Cluster A INTOCABLE en sesión 23

Mismo principio que sesiones 20-22 (HANDOFF 19 §4.5 + plan v3 §7 punto 13). Sub-fase 5e toca el plugin LWC vendor + posiblemente comentarios en `_SessionInner.js`. Las líneas del cluster A NO se modifican en sesión 23 aunque el Edit pase cerca por scrolling.

### §4.5 PASO 0 obligatorio en sesión 23

Antes del primer Edit, sesión 23 verifica al carácter desde shell zsh nativa:

1. `git status` en main → working tree limpio, HEAD = HANDOFF 22 si push ejecutado.
2. `git checkout refactor/fase-5-drawings-lifecycle` → HEAD `5b233b4`.
3. `wc -l components/_SessionInner.js` debe ser **3052** (sin cambios desde cierre 22).
4. Tamaños 6 archivos restantes → según §2.3 arriba.
5. **3 greps invariantes fase 4** repetidos al carácter:
   - `grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"` → vacío.
   - `grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"` → vacío.
   - `grep -n "computePhantomsNeeded" components/_SessionInner.js` → 3 matches L116, L1145, L1224.
6. Verificación al carácter del contrato `chartTick` post-22 según §2.5.

### §4.6 Política para Opt+R cuando se ataque (sub-fase 5f)

Heredada al carácter de sesión 22 §3.4:

> Atajo Opt+R = handler de keydown que llama a `resetViewportToDefault(cr, tf, aggLength)` ya existente en `lib/chartViewport.js` desde fase 3. **Función UX**: el usuario pulsa Opt+R y el chart "restablece la vista al estado por defecto del TF actual" (Ramón al carácter sesión 22).
>
> Trabajo necesario al carácter:
> 1. Decidir qué "default" significa para cada TF — probablemente lo que `initVisibleRange(cr, tf, aggLength)` produce al cargar el par.
> 2. Integrar el handler con el listener de teclado existente en `_SessionInner.js`.
> 3. Smoke específico: pulsar Opt+R desde varios viewport states (zoom in, zoom out, scroll lejos, etc.) y verificar que vuelve a la vista por defecto sin descolocar drawings ni Killzones.
> 4. Decisión UX: ¿Opt+R también resetea el TF al H1 default, o solo el viewport del TF actual? Pregunta al dueño antes del Edit (patrón §8.3).

### §4.7 Política para bug resize KillzonesOverlay (sub-fase 5f o sesión específica)

Heredada al carácter de sesión 22 §3.4 + §9 abajo:

> Bug pre-existente descubierto en smoke combinado sesión 22. KillzonesOverlay aparentemente NO tiene `ResizeObserver` para recalcular coords en cambio de tamaño del chart (cambio fullscreen). CustomDrawingsOverlay sí lo tiene (vi bytes L124-138 sesión 22 PASO 0). Política propuesta al carácter para sesión que lo ataque:
>
> 1. Inventario al carácter: leer KillzonesOverlay.js completo y localizar el(los) useEffect que pintan el canvas. Verificar al carácter si tiene ResizeObserver o no.
> 2. Si NO tiene → añadir uno espejo del de CustomDrawingsOverlay L124-138.
> 3. Si SÍ tiene pero rota → diagnosticar al carácter qué falla.
> 4. Smoke específico: pantalla normal → fullscreen → verificar que TODAS las killzones se ven sin línea imaginaria. Repetir varios cambios fullscreen consecutivos. Repetir con drawings de usuario superpuestos.
> 5. **NO HACER #3 del prompt sesión 22 (KillzonesOverlay intocable) deja de aplicar en esa sesión** — lo abre el dueño explícitamente para arreglar este bug.

---

## §5 — Material verificado al carácter en sesión 22 (preservado para sesiones futuras)

### §5.1 Smoke combinado §5.8.A — qué se verificó

Smoke al carácter ejecutado por Ramón al cierre de 5d.7 + verificación combinada para 5d.8. **4 tests OK al carácter + 1 sin testear no-bloqueante + 1 hallazgo nuevo no-bloqueante.**

Tests OK al carácter:
- Drawing custom + cadena cambios TF (5d.5 + 5d.7 combinados).
- Posición SL/TP + cambio TF (5d.6).
- Deuda 5.1 viewport (5d.7) — bug histórico cerrado.
- Cadena Killzones M5→M15→H1→H4→D1→H1→M5 — heredado sesión 21 §5.2, intacto.

Test sin testear: regla TV-style fijada + cambio TF. Atajo no listado en el smoke previo, mismo estado que sesión 21. NO bloquea cierre 22 al carácter.

Hallazgo nuevo: bug resize KillzonesOverlay en pantalla completa (descrito §3.4 + §9 + §4.7).

**Razón al carácter**: a diferencia de sesión 20 (smoke parcial por fricción operativa de auth Claude Code), sesión 22 ejecutó smoke al carácter tras cada commit individual + smoke combinado al cierre. Patrón validado al carácter por tercera sesión consecutiva: smoke al carácter inmediatamente tras Edit + commit caza errores §9.4 (caso 5d.7 signo invertido) en <5 minutos.

### §5.2 Mapa de funciones helper al carácter post-22

Para sesión 23 cuando arranque sub-fase 5e, el handler de cambio de TF vive en `components/_SessionInner.js` aproximadamente L1184-L1267, descompuesto al carácter en:

```
1. resolveCtx               → { ps, cr, newTf } | null              (L1198, sin cambios desde 5c)
2. deselectActiveDrawings   → limpia selección pre-setData          (L1208, sin cambios desde 5c)
3. computeTfPhantomsCount   → phantoms necesarias en TF nuevo       (L1215, sin cambios desde 5c)
4. applyForcedSetData       → siembra phantoms + fuerza updateChart (L1233, sin cambios desde 5c)
5. bumpTfKey                → re-render hooks dependientes          (L1240, sin cambios desde 5c)
6. scrollToTailAndNotify    → scroll a tail + chartTick a overlays  (L1252, MODIFICADO 5d.7)
                             ↑ AHORA recibe (cr, phantomsNeeded), offset = 8 - phantomsNeeded
```

### §5.3 Política del contrato `chartTick` heredada al carácter sesión 22

HANDOFF 21 §2.4 generalizó al carácter, confirmado en sesión 22:

> Para overlays con cache derivado del dataset (KillzonesOverlay), invalidar = recalcular. Para overlays con estado transitorio del dataset (RulerOverlay), invalidar = resetear. Para overlays sin cache (CustomDrawingsOverlay), invalidar = re-render. Para overlays con polling activo (PositionOverlay), invalidar = trigger inmediato (ataja latencia). **Mismo contrato, distinta política según el consumer.**

Generalización al carácter post-22 — **4 políticas distintas para 4 overlays**:
- KillzonesOverlay (5d.2): recalcular cache de buckets.
- RulerOverlay (5d.3): resetear estado transitorio (medición fija).
- CustomDrawingsOverlay (5d.5): re-render canvas (sin cache).
- PositionOverlay (5d.6): trigger inmediato (polling preservado como defensa).

### §5.4 `oldTf` código muerto candidato 5f — preservado intacto al carácter

`const oldTf = prevTfRef.current` se preserva en el orquestador con comentario explícito *"// preservado para trazabilidad — candidato limpieza sub-fase 5f"*. NO usar ni eliminar en sesión 23. Sesión 24 (sub-fase 5f) decide qué hacer al carácter.

---

## §6 — Procedimiento de cierre sesión 22

### §6.1 Mover HANDOFF al repo

Tras descargar este HANDOFF a `~/Downloads/HANDOFF-cierre-sesion-22.md`:

```
git checkout main
```

```
mv ~/Downloads/HANDOFF-cierre-sesion-22.md refactor/
```

```
ls -la refactor/HANDOFF-cierre-sesion-22*
```

```
wc -l refactor/HANDOFF-cierre-sesion-22*
```

### §6.2 git add + commit (en main)

```
git add refactor/HANDOFF-cierre-sesion-22.md
```

```
git status
```

```
git commit -m "docs(sesion-22): cerrar sesion 22 con sub-fases 5d.5+5d.6+5d.7 en feature y deuda 5.1 viewport cerrada al caracter"
```

```
git log --oneline -3
```

### §6.3 Push a main

**Recomendación CTO al carácter**: SÍ push. Patrón histórico sesiones 14-21 mantenido al carácter. Runtime intacto (cambio docs sin impacto funcional). Vercel re-deployará — producción seguirá funcional con `d76ed4b` desde 2 may 2026 hasta sesión 25.

```
git push origin main
```

```
git log --oneline -3
```

### §6.4 Verificación final cierre sesión 22

```
git checkout refactor/fase-5-drawings-lifecycle
git log --oneline -10
```

Esperado al carácter:
```
5b233b4 (HEAD -> refactor/fase-5-drawings-lifecycle) refactor(fase-5/5d.7): cerrar deuda 5.1 viewport — anclar scroll al ultimo real compensando phantoms para drawings extendidos (estilo TradingView)
590abe2 refactor(fase-5/5d.6): conectar PositionOverlay al contrato chartTick (useCallback estable + useEffect inmediato, polling 150ms preservado)
96eb2e8 refactor(fase-5/5d.5): conectar CustomDrawingsOverlay al contrato chartTick + arreglar typo 5d.5/5d.6 en JSDoc
d7ee4a8 refactor(fase-5/5d.3): conectar RulerOverlay al contrato chartTick (reset on TF change estilo TradingView)
4f943a4 refactor(fase-5/5d.2): conectar KillzonesOverlay al contrato chartTick formal
aa1498a refactor(fase-5/5d.1): documentar contrato chartTick formal en _SessionInner.js
84a3342 refactor(fase-5/5c): descomponer handler cambio TF en 6 helpers locales con orden explicito
1897eba docs(fase-5): plan v3 con cluster A aplazado a fase 5.A y cluster B vivo sesion 19
f2c7476 docs(fase-5): plan v2 con inventario expandido del territorio fase 5
195d02b docs(fase-5): plan v1 fase 5 con caminos A y B para drawings lifecycle
```

```
git checkout main
```

Sesión 22 cerrada al carácter.

---

## §7 — Errores §9.4 capturados al carácter en sesión 22

### §7.1 Predicción de matches `grep` mal calibrada (5d.5)

**Hecho al carácter**: en el Edit 5d.5 CTO predijo "2 matches de chartTick en CustomDrawingsOverlay.js" (firma + dep array). Tras Edit, real al carácter = **3 matches** porque el comentario nuevo redactado por CTO contenía la palabra "chartTick" como literal de texto.

**Causa**: CTO contó solo los matches "funcionales" (firma + dep) sin recordar que el comentario propio aporta un match léxico adicional.

**Severidad**: baja. Comentario funcionalmente correcto, solo ruido en la verificación de Claude Code que reportó "3 matches no 2" como discrepancia. Anotado para HANDOFF.

**Mejora futura**: cuando CTO predice número de matches grep tras Edit con palabra clave introducida en comentario nuevo, contar el comentario en la predicción.

### §7.2 Discrepancia 3031 vs 3032 — error de registro mío en HANDOFF 21 §3.3

**Hecho al carácter**: PASO 0 §4.3 sesión 22 esperaba `_SessionInner.js = 3032` líneas (heredado de mi propio HANDOFF 21 §3.3). Output real al carácter de Ramón: **3031**. Discrepancia de -1 línea.

**Causa**: error de registro mío al cierre sesión 21. Los bytes en disco son los de commit `d7ee4a8` (5d.3) — los commits son inmutables. La discrepancia tiene una sola causa posible: yo anoté mal el número en HANDOFF 21 §3.3.

**Severidad**: baja. NO causó problema operativo en sesión 22 — verificación bicapa al carácter cazó la discrepancia inmediatamente.

**Mejora futura**: cuando redacto HANDOFF al cierre, verificar al carácter el `wc -l` desde shell de Ramón en lugar de inferir desde mi memoria del PASO 0.

### §7.3 §9.4 MAYOR — signo invertido en fórmula offset 5d.7

**Hecho al carácter**: durante §4.9.C CTO presentó al frente la fórmula `offset = 8 + phantomsNeeded` para el fix de la deuda 5.1. Justificación matemática verbal pero **sin construir caso numérico concreto al carácter**. Edit aplicado por Claude Code. Smoke al carácter por Ramón: **pantalla M5 completamente vacía**, eje Y rango 1.14249-1.14259 ridículo, sin velas visibles. Captura de pantalla al chat.

**Diagnóstico al carácter post-mortem**: LWC `scrollToPosition(N, false)` mide N desde el final del array que incluye phantoms. Con N positivo = borde derecho a N barras a la **derecha** del último phantom. Mi fórmula `8 + phantomsNeeded` enviaba el viewport AÚN MÁS lejos a la derecha (último real ~128 barras a la izquierda del borde derecho → fuera de pantalla → pantalla vacía). **Fórmula correcta = `8 - phantomsNeeded`** (compensa hacia atrás restando las phantoms).

**Causa**: razoné mal el signo de la compensación. Pensé "compensar hacia adelante" cuando debía ser "compensar hacia atrás" porque el final del array YA está más allá del último real. **Aritmética mental verbal sin caso numérico concreto.**

**Severidad**: ALTA. Habría sido §9.4 mayor con regresión visible si Ramón hubiera comiteado sin smoke. Pero Ramón cazó al carácter con su captura en <5 minutos.

**Mejora futura**: para fórmulas de offset/índice/posición, **construir caso numérico concreto** (con valores reales tipo "phantomsNeeded=60, last real index=940, total=1000, offset deseado X") **antes** de proponer Edit. Aritmética mental verbal sin números concretos es vector de error de signo.

**Validación al carácter**: post-fix con `8 - phantomsNeeded`, smoke al carácter PASS. LWC sí acepta offset negativo en `scrollToPosition`. Bug histórico cerrado.

**Lección estructural al carácter**: la disciplina bicapa estricta funciona en su máxima expresión cuando un dueño con shell zsh nativa y simulador en navegador caza un error CTO en <5 minutos. Sesión 22 §7.3 es ejemplo canónico al carácter de la utilidad de la disciplina.

### §7.4 Lectura cruzada de scrollback histórico — alarma falsa por diff stale

**Hecho al carácter**: tras Ramón comitear 5d.7 con el fix correcto (`8 - phantomsNeeded`), pegó al chat un log gigante con scrollback acumulado de varios turnos. Mi lectura del log enfocó en un `git --no-pager diff components/_SessionInner.js` que mostraba la versión vieja `8 + (phantomsNeeded || 0)`. Levanté alarma "PARAR — bytes en disco no calzan con smoke OK reportado".

**Causa**: el diff que vi era un fragmento **stale del scrollback** (de antes del fix de signo aplicado posteriormente), no el estado actual. Mi señal de alarma fue alarma falsa basada en lectura cruzada de outputs históricos del paginador.

**Diagnóstico al carácter post-mortem**: cuando Ramón pega un log enorme acumulado (todo el `tmux history` o equivalente), múltiples ejecuciones de `git diff` aparecen secuencialmente. Yo enfoqué en uno antiguo en lugar del último. Verificación bicapa exigió `sed -n` en bytes para resolver — y los bytes mostraban `8 - phantomsNeeded` correcto. Alarma falsa, commit `5b233b4` válido al carácter.

**Severidad**: media. NO causó problema operativo (commit ya estaba bien, solo perdimos 1 turno verificando). Pero el patrón es vector §9.4 si en otro contexto la alarma falsa lleva a revertir un commit correcto.

**Mejora futura**: cuando un dueño pega un log gigante con scrollback acumulado de varios turnos, **NO basta con leer el último diff visible** — verificar al carácter en bytes (`sed -n`) antes de declarar problema. La fuente de verdad son los bytes del HEAD actual, no los outputs históricos del paginador.

### §7.5 §1.3 violación — 3 variantes UX presentadas en lugar de recomendación firme

**Hecho al carácter**: durante §4.9.C, antes del Edit 5d.7, CTO presentó al frente 3 variantes UX (A/B/C) del fix viewport como árbol de opciones. Ramón respondió: *"no entiendo bien los ejemplos, lo quiero como TradingView..."*

**Causa**: violación clara de §1.3 del prompt ("NO presentas alternativas equivalentes cuando tienes recomendación clara con razón técnica firme"). CTO tenía recomendación clara (Variante A — TradingView puro) basada en intuición CTO + descripción del bug por Ramón ("espacio negro al bajar TF + pérdida de posición/fecha visible"), pero presentó 3 variantes equivalentes en lugar de recomendación al frente.

**Severidad**: media. Causó 1 turno extra de re-explicación al carácter. Ramón cazó al carácter con respuesta clara — el dueño actuó como verificación bicapa también para violaciones del prompt mismo.

**Mejora futura**: cuando CTO tiene recomendación clara con razón técnica firme, presentar **un ejemplo concreto** de la variante recomendada + **pregunta binaria** de validación (sí/no), NO árbol de opciones equivalentes. Aplicado al carácter en el siguiente turno tras el feedback de Ramón.

---

## §8 — Lecciones generalizables capturadas al carácter en sesión 22

### §8.1 Smoke al carácter inmediatamente tras Edit caza errores §9.4 críticos en <5 min

Sesión 22 §7.3 (signo invertido) es ejemplo canónico al carácter. Patrón generalizable validado por tercera sesión consecutiva (sesiones 20+21+22):

> Para Edits que afectan UX visible — especialmente cálculos numéricos (offsets, índices, coordenadas, dimensiones) — el smoke local **inmediatamente** tras Edit (ANTES del commit) caza errores en magnitudes que la lectura de bytes no detecta. Disciplina bicapa estricta funciona aquí en su máxima expresión.

Aplicar al carácter en sesiones futuras: **NUNCA comitear un Edit con cálculo numérico sin smoke previo** del caso concreto que afecta. La verificación bicapa de bytes es necesaria pero no suficiente.

### §8.2 Construcción de caso numérico concreto antes de proponer fórmula

§7.3 enseña al carácter:

> Cuando una fórmula matemática vive en zona crítica del código (offset, índice, posición), construir caso numérico concreto **antes** de proponer Edit. Razonamiento verbal sin números concretos es vector de error de signo o factor.

Patrón propuesto al carácter para sesiones futuras:

> Antes de redactar Edit con fórmula, CTO escribe en chat:
> - "Caso concreto: variable_A = 60, variable_B = 940, total = 1000."
> - "Comportamiento deseado: viewport_position = X (donde X es número concreto)."
> - "Fórmula candidata: variable_X = N op variable_Y."
> - "Verificación: aplicando la fórmula al caso, da X=Y. Coincide con deseado ✓."

Si CTO no puede construir el caso numérico al carácter en chat, NO está listo para proponer Edit.

### §8.3 Lectura de scrollback acumulado — bytes son fuente de verdad

§7.4 enseña al carácter:

> Cuando dueño pega log gigante con scrollback acumulado de varios turnos, los outputs `git diff` que aparecen pueden ser históricos (de turnos previos). La fuente de verdad son los bytes del HEAD actual, no los diffs visibles en el log.

Aplicar al carácter en sesiones futuras: **antes de levantar alarma sobre estado del disco vs estado esperado, verificar al carácter con `sed -n` en bytes del HEAD actual**, no inferir desde el último diff visible en el scrollback.

### §8.4 Plan v3 sobreestima sub-fases atómicas de cluster B en factor 3-5×

Sesión 21 capturó al carácter (HANDOFF 21 §8.4): plan v3 sobreestimó 5d.1-5d.4 en 3-5× (real ~43 vs estimado 150-250). Sesión 22 confirma al carácter: 5d.5-5d.8 estimado ~100-200 líneas, real ~30 modificadas + 21 netas.

**Patrón al carácter por dos sesiones consecutivas**: plan v3 sobreestima sub-fases atómicas de cluster B en factor 3-5×. Aplicar al carácter para calibrar predicciones en sesión 23+:

- Sub-fase plan v3 estima ~50 líneas → asumir ~10-20 al carácter.
- Sub-fase plan v3 estima ~100-150 líneas → asumir ~25-40 al carácter.

NO bajar mecánicamente el estimado pero sí aplicar margen de calibración. Sesión 23 sub-fase 5e (parche 4.6 limpieza) — plan v3 §5 estima ~50-100 líneas. Predicción al carácter: ~15-30 líneas reales.

### §8.5 Atomización 1 commit por sub-fase + smoke individual + smoke combinado al cierre

Patrón validado al carácter por tercera sesión consecutiva (sesiones 20+21+22):

> Cluster B atomizado en sub-fases comitea 1 commit por sub-fase, ejecuta smoke individual tras cada Edit, y al cierre ejecuta smoke combinado §5.8 que verifica integración. Sub-fase de "smoke + commit" no requiere commit nuevo si solo es verificación.

Aplicar al carácter en sesión 23: si 5e atomiza en 5e.1+5e.2+5e.3, 1 commit por cada uno + smoke combinado al cierre.

### §8.6 La intuición del trader (Ramón) sigue siendo input técnico

Sesión 12 capturó al carácter por primera vez (HANDOFF 12 §7 punto 2). Sesión 22 confirma al carácter:

- Ramón cazó signo invertido en <5 min con captura visual.
- Ramón cazó violación §1.3 mía con respuesta directa "no entiendo los ejemplos".
- Ramón identificó bug resize KillzonesOverlay durante smoke combinado — observación que CTO no había anticipado en ningún PASO 0.

**Las observaciones empíricas de Ramón siguen siendo señal técnica encriptada en lenguaje de usuario.** Patrón validado por cuarta sesión consecutiva (12, 20, 21, 22).

---

## §9 — Bugs y deudas al cierre sesión 22

### §9.1 Deuda 5.1 viewport — CERRADA empíricamente al carácter

Bug que Ramón observó al carácter desde sesión 20 ("espacio negro al bajar TF + pérdida de posición/fecha visible"). Causa raíz confirmada al carácter en bytes en sesión 22 PASO 0 §H4. Fix aplicado en commit `5b233b4` (5d.7) — `offset = 8 - (phantomsNeeded || 0)` en `scrollToTailAndNotify`. Verificación visual al carácter por Ramón post-fix: viewport ancla al último real + 8, drawing fuera de pantalla a la derecha (TradingView puro).

**Deuda cerrada al carácter en feature.** Producción la recibirá en sesión 25 tras merge feature → main.

### §9.2 Deudas heredadas (sin cambios desde sesión 21)

| ID | Descripción | Estado |
|---|---|---|
| Quota Supabase | Plan Free excedido — gracia hasta 24 may 2026 | ⏳ Abierta |
| Pares secundarios + drawings persistencia | `activePairs` in-session no guardados | ⏳ Cluster A territory, sub-fase 5.A futura |
| `session_drawings` no separa por par | Blob `data` único con drawings mezclados | ⏳ Cluster A territory, sub-fase 5.A futura |
| 4.5 | `__algSuiteExportTools` no registrado | ⏳ Backlog (sub-fase 5e candidato) |
| Warning lifecycle plugin LWC | `_requestUpdate is not set` al destruir tool | ⏳ Backlog cluster A |
| B5 | `409 Conflict` race `session_drawings` | ⏳ Backlog cluster A |
| Limpieza ramas locales (~10 viejas) | Higiene git | ⏳ Backlog |

### §9.3 Atajo Opt+R — APLAZADO a sub-fase 5f

Decisión sesión 22 §3.4. Aclaración Ramón al carácter: "Opt+R es para restablecer la vista del gráfico". Función UX = handler de keydown que llama a `resetViewportToDefault(cr, tf, aggLength)` (helper ya existente en `lib/chartViewport.js` desde fase 3, falta el handler). Detalle técnico al carácter en §4.6 arriba.

### §9.4 NUEVA — Bug resize KillzonesOverlay en cambio a pantalla completa

**Descubrimiento al carácter**: durante smoke combinado §5.8.A sesión 22.

**Síntoma al carácter**: en pantalla normal con killzones a la izquierda visibles, al cambiar a pantalla completa hay una "línea imaginaria" a la derecha de la cual las killzones que estaban más allá no se pintan. Mover el chart un píxel las restaura.

**Captura de pantalla al carácter**: 2 imágenes pegadas por Ramón al chat sesión 22:
- Imagen 1 (modo normal): killzones visibles con drawings de usuario superpuestos.
- Imagen 2 (pantalla completa): killzones del lado izquierdo OK, área central-derecha sin killzones donde deberían estar.

**Diagnóstico CTO al carácter**:
- KillzonesOverlay tiene su propio canvas pintado vía useEffect con dep `chartTick`. `chartTick` se bumpea en cambio TF y zoom/pan/scroll del usuario. Pero entrar en pantalla completa NO bumpea `chartTick` — el viewport del chart se redimensiona pero el array de velas no cambia, el TF no cambia, el subscribeVisibleLogicalRangeChange puede o no dispararse según implementación LWC.
- Cuando el chart se redimensiona, las coordenadas X/Y de las killzones quedan calculadas con el ancho viejo, pero LWC repinta velas con el ancho nuevo. La "línea imaginaria" es probablemente el borde derecho del chart pre-fullscreen.
- CustomDrawingsOverlay tiene un `ResizeObserver` (vi en bytes L124-138 del PASO 0 sesión 22) que recalcula coords en resize. KillzonesOverlay aparentemente no.

**Severidad al carácter**: media. Bug visible solo al cambiar fullscreen, frecuencia operativa baja, mitigación trivial (mover chart un píxel).

**Pre-existencia al carácter**: este bug existía igual en main `e5ae43e` antes de que sesión 22 tocara nada. NO regresión de sesión 22. Habría sido idéntico antes.

**Calendarización al carácter**: sub-fase 5f (junto con Opt+R y limpieza `oldTf`) o sesión específica de overlays-resize si Ramón decide priorizarlo después. Política propuesta en §4.7 arriba.

### §9.5 NUEVA — Warning API 4MB candles 2026

**Descubrimiento al carácter**: durante `npm run dev` en sesión 22, log del servidor mostró:

```
API response for /api/candles?pair=EURUSD&timeframe=M1&from=1767225600&to=1778104799&year=2026 
exceeds 4MB. API Routes are meant to respond quickly. https://nextjs.org/docs/messages/api-routes-response-size-limit
```

**Severidad al carácter**: baja-media. Warning de Next.js sobre tamaño de respuesta API, no afecta funcionalidad. Probablemente pre-existente, descubierto al carácter porque smoke 22 cargó M1 EUR/USD 2026.

**Causa probable al carácter (sin verificar)**: endpoint `/api/candles` para timeframe M1 + año 2026 (~250 días × 1440 minutos × ~50 bytes/vela ≈ 18MB sin compresión / ~4-5MB con compresión gzip). Excede el límite de 4MB que Next.js sugiere para API routes.

**Calendarización al carácter**: backlog. NO bloqueante. Posible mitigación futura: paginación del endpoint, o stream, o caching más agresivo, o cambio a route handler con respuesta streaming. NO es prioridad cluster B ni cluster A.

---

## §10 — Métricas de la sesión 22

- **Inicio**: ~09:46 (7 may 2026, login del Mac visible en shell de Ramón).
- **Cierre redacción**: ~20:35 (7 may 2026, tras smoke combinado y aclaración Opt+R).
- **Duración total**: ~5 horas efectivas en chat (con pausas).
- **Commits firmados**: **3 commits funcionales** en rama feature `refactor/fase-5-drawings-lifecycle`. 0 commits de código en main. 1 commit de doc esperado tras cierre (este HANDOFF).
- **Sub-fases completadas**: 5d.5 + 5d.6 + 5d.7 + 5d.8 (esta sin commit, verificación combinada).
- **Errores §9.4 detectados y corregidos en vivo**: 5 (predicción matches grep, discrepancia 3031 vs 3032, signo invertido fórmula offset MAYOR, lectura scrollback stale, violación §1.3 con árbol UX).
- **Líneas modificadas netas en feature**: `_SessionInner.js` +21 (3031→3052), `CustomDrawingsOverlay.js` 0 (5+/5-), `lib/chartViewport.js` 0. Total al carácter ~30 líneas modificadas + 21 netas.
- **Hallazgos arquitectónicos al carácter**: hipótesis del prompt §2.6 sobre CustomDrawingsOverlay refutada parcialmente (no tiene cache derivado del dataset, solo render idempotente). Política PositionOverlay al carácter como Opción B (trigger inmediato + polling preservado).
- **Hipótesis técnicas confirmadas al carácter**: causa raíz deuda 5.1 (LWC `scrollToPosition` mide desde final del array que incluye phantoms). Verificada en bytes durante PASO 0 §H4.
- **Hipótesis técnicas refutadas al carácter**: ninguna mayor.
- **Smoke combinado al carácter**: 4 tests OK + 1 sin testear no-bloqueante + 1 hallazgo nuevo no-bloqueante.
- **Verificaciones bicapa estrictas en shell zsh de Ramón**: 7+ (PASO 0 inicial bloque 1+2+3, pre-commit 5d.5, pre-commit 5d.6, pre-commit 5d.7, smoke combinado §5.8.A).

---

## §11 — Reflexión final del CTO/revisor

Sesión 22 cierra con 3 commits funcionales y la deuda 5.1 viewport resuelta empíricamente al carácter — un bug que Ramón observaba desde sesión 20 que quedó cerrado en menos de 5 horas tras el arranque de sesión 22.

**Tres aprendizajes que merece la pena dejar fijados al carácter para sesiones futuras**:

**1. La disciplina bicapa estricta funciona en su máxima expresión cuando hay smoke al carácter inmediatamente tras Edit.** §7.3 (signo invertido) es ejemplo canónico al carácter — un error CTO mayor con regresión visible (pantalla M5 vacía) cazado por Ramón en <5 min con captura de pantalla. La verificación de bytes es necesaria pero no suficiente para Edits con cálculo numérico. **Smoke al carácter inmediatamente tras Edit + ANTES del commit es la red de seguridad real.**

**2. La intuición del trader (Ramón) sigue siendo input técnico — confirmado por 4ª sesión consecutiva (12, 20, 21, 22).** En sesión 22:
- Ramón cazó signo invertido con captura visual.
- Ramón cazó §1.3 violación con respuesta directa "no entiendo los ejemplos" → forzó CTO a reformular como recomendación firme.
- Ramón identificó bug resize KillzonesOverlay durante smoke combinado — observación que CTO no había anticipado en ningún PASO 0.

Las observaciones empíricas de Ramón **siguen siendo señal técnica encriptada en lenguaje de usuario**. Aplicar siempre al carácter.

**3. Plan v3 sigue produciendo código semana tras semana — 3 sesiones consecutivas validadas al carácter.** Tras 4 sesiones secas previas (16-19), la decisión arquitectónica de aplazar cluster A a fase 5.A y atacar cluster B con plan táctico atomizable demuestra valor empírico al carácter por tercera vez. Sesión 23 (5e) y 24 (5f) cerrarán cluster B antes del merge en 25. Si el patrón se sostiene, producción recibirá los cambios al fin tras ~15+ días sin código nuevo.

**Sesión 22 cumple los criterios §7.1 del prompt arranque al carácter**:

✓ Sub-fases 5d.5-5d.8 implementadas en feature, comiteadas con mensajes claros.
✓ Smoke local exhaustivo OK al carácter (especialmente §5.1 deuda 5.1 bloqueante — PASS empírico).
✓ Los 3 greps de invariantes intactos.
✓ Los 6 helpers post-5c intactos como entidades separadas.
✓ KillzonesOverlay + RulerOverlay sin tocar (cluster cerrado sesión 21).
✓ HANDOFF cierre sesión 22 redactado (este).
✓ Cadena feature: `5b233b4` → `590abe2` → `96eb2e8` → `d7ee4a8` → ...
✓ Decisión sobre atajo Opt+R: documentada al carácter (aplazado a sub-fase 5f con detalle técnico para sesión que lo ataque).

Sesión 23 arranca con sub-fase 5e (parche 4.6) según plan v3 §8. Probabilidad alta al carácter de cierre limpio en una sola sesión dado calibración 3-5× más rápida que estimación plan v3.

**Mensaje del CTO al cierre al carácter**: deuda 5.1 era el bloqueante visual más grande del proyecto desde sesión 20. Ya no lo es. El simulador está un paso más cerca del estado "calidad TradingView" que CLAUDE.md §1 establece como principio rector.

---

*Fin del HANDOFF cierre sesión 22. 7 mayo 2026. Redactado por CTO/revisor tras commit `5b233b4` en rama feature `refactor/fase-5-drawings-lifecycle`. Pendiente de mover al repo + commit a main + push a `origin/main` por Ramón según §6.*
