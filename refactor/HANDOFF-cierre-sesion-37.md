# HANDOFF — cierre sesión 37

> Sesión 37 cerrada el 23 mayo 2026, ~17:00 hora local.
> Sesión 37 = **prioridad 1 HANDOFF s36 §12**: diseño esqueleto `components/KillzonesPrimitive.js` implementando `ISeriesPrimitive` nativo LWC 5.1.0. NO implementación runtime — solo lectura + diseño + plan implementación detallado.
> **Resultado al carácter sin maquillaje**: PASO 0 inventario bytes-verbatim COMPLETADO al carácter sobre 7 fuentes (typings.d.ts, fancy-canvas, KillzonesOverlay.js 505 líneas, TextWatermark, MarkersPrimitivePaneView, MarkersPrimitiveRenderer, package.json LWC versión). PASO 1 documento `refactor/fase-5g-killzones-primitive-design.md` producido al carácter, 816 líneas, 45139 bytes, commit `bc48578` registrado en local main. Cero implementación runtime. Cero contaminación `origin/main`. Producción `6abc870` intacta decimoséptima sesión consecutiva.
> **Pivote arquitectónico s36 RATIFICADO en s37 con bytes en mano al carácter**: lectura `IPrimitivePaneRenderer` + `IPrimitivePaneView` + `ISeriesPrimitiveBase` + `SeriesAttachedParameter` + `BitmapCoordinatesRenderingScope` + `CanvasRenderingTarget2D` + `PrimitivePaneViewZOrder` confirma al carácter que decisión Opción C (primitive custom directo `series.attachPrimitive(kp)`) es viable estructuralmente. LWC 5.1.0 expone API pública estable. Métodos requeridos: `attached`, `detached`, `paneViews`, `updateAllViews`. Métodos opcionales descartados para KZ: `hitTest` (KZ no interactivas), `autoscaleInfo` (KZ NO deben expandir Y), `priceAxisViews`, `timeAxisViews`, `priceAxisPaneViews`, `timeAxisPaneViews`. Renderer usa `useBitmapCoordinateSpace` (NO `useMediaCoordinateSpace`) para crispness DPR-aware.
> **Decisión arquitectónica RATIFICADA al carácter con ejemplos LWC oficial leídos verbatim**: TextWatermark L14437-L14601 (190 líneas) + MarkersPrimitivePaneView L15658-L15691 (33 líneas) + MarkersPrimitiveRenderer L15604-L15644 (54 líneas) confirman estructura triple del primitive (renderer + paneView + primitive principal) + patrón canónico DPR correction (`tickWidth = Math.max(1, Math.floor(hpr))`, `correction = (tickWidth % 2) / 2`) + patrón ref estable `paneViews()` (misma ref siempre, perf hint L2611 typings). Esqueleto §12 HANDOFF s36 REFINADO al carácter sobre bytes reales — descubrimientos NO contemplados §12: 4 sesiones NYAM/NYPM (no 3), borde dashed `[4,3]` 1px, labels Montserrat 9px 700 alpha 0.85, S33.3 KZ activa endpoint vivo, culling `width < 2`, filtro history N por key.
> **Lección §47 NUEVA**: entregable tangible cada sesión. Una sesión 100% lectura sin commit/archivo nuevo en disco tiene coste oculto: re-contextualización al inicio de la siguiente sesión. Mejor producir documento de síntesis aunque sea para diferir implementación.
> **Lección §48 NUEVA**: leer ejemplos LWC oficial antes que vendor fork. LWC oficial tiene primitives documentados (TextWatermark, ImageWatermark, SeriesMarkersPrimitive, UpDownMarkersPrimitive). Vendor fork (`lightweight-charts-line-tools-*`) es capa específica para drawings interactivas con UI handlers. Para diseñar primitive NO interactiva (KZ), oficial precede vendor fork.
> **Lección §14 (intuición Ramón = input técnico encriptado) vigesimosegunda sesión consecutiva al carácter**: pregunta verbatim "que hemos hecho para que quieras redctar handoff ya?" cazó error CTO de proponer pausa sin entregable tangible. Sesión 37 había sido 100% lectura (sub-pasos 1-21) sin producir nada en disco. Si pauso ahí, s38 arranca releyendo HANDOFF + re-contextualizando PASO 0 desde cero. Tu §14 forzó avance a PASO 1 producir documento de diseño 816 líneas en disco = entregable tangible. Origen lección §47.
> Próxima sesión = sesión 38. Prioridad 1 = **implementar `components/KillzonesPrimitive.js` + reformular `components/KillzonesOverlay.js` + smoke local discriminante 4 paths + commit + push origin/main**.

---

## §0 — Estado al cierre sesión 37, sin maquillaje

**Sesión 37 produjo 1 commit funcional al carácter en local main**:
- `bc48578 docs(5g): killzones primitive design doc (s37 PASO 1)` — 816 líneas +0 eliminadas, 1 archivo nuevo `refactor/fase-5g-killzones-primitive-design.md`

HEAD local main al cierre s37 = `bc48578` sobre `2a91e61` (HANDOFF s36) sobre `245070c` (HANDOFF s35) sobre `5c5036b` (HANDOFF s34) sobre `6abc870` (S33.3 v2.1) sobre `5d7c553` (HANDOFF s33) sobre `bb37b66` (S33.2 cosmético chartTick) sobre `9cbcf7a` (HANDOFF s32) sobre `eb4c2ab` (fix acceso-revoke) sobre `032a4e3` (HANDOFF s31).

`origin/main` post-cierre s37 = `2a91e61` (HANDOFF s36) — **SIN push s37 todavía**. Decisión Ramón: push diferido a final s38 cuando se haya verificado smoke discriminante de la implementación KZ primitive. Cero contaminación `origin/main` hasta verificación bicapa funcional.

Producción Vercel runtime efectivo `6abc870` desde 21 may 2026 ~18:24 hora local — **SIN CAMBIO desde cierre s33 v2.1**. Decimoséptima sesión consecutiva con producción intacta.

**Realidad sin maquillaje al carácter**:

1. **PASO 0 inventario bytes-verbatim CERRADO al carácter** en 7 fuentes:
   - `node_modules/lightweight-charts/package.json` versión 5.1.0
   - `node_modules/lightweight-charts/dist/typings.d.ts` (4902 líneas, 6 interfaces + 2 type aliases leídas íntegras)
   - `node_modules/fancy-canvas/canvas-rendering-target.d.ts` (40 líneas íntegras)
   - `components/KillzonesOverlay.js` (505 líneas mapeadas + clasificadas preservar/migrar/eliminar)
   - `node_modules/lightweight-charts/dist/lightweight-charts.development.mjs` TextWatermark L14437-L14601 (190 líneas)
   - mismo .mjs MarkersPrimitivePaneView L15658-L15691 (33 líneas)
   - mismo .mjs MarkersPrimitiveRenderer L15604-L15644 (54 líneas)

2. **PASO 1 documento de diseño PRODUCIDO al carácter**: `refactor/fase-5g-killzones-primitive-design.md` 816 líneas 45139 bytes, md5 `94347ae91cf55ce90a20b3f1952ef444`. Contiene 10 secciones: contexto + decisión C + PASO 0 síntesis + KillzonesPrimitive clase principal + KillzonesPaneView + S33.3 + KillzonesRenderer + DPR correction + reformulación KillzonesOverlay.js + plan s38 PASO 0→5 + 16 riesgos identificados + 10 criterios verificación + lecciones §47/§48 + cierre.

3. **Decisión arquitectónica Opción C RATIFICADA al carácter con bytes en mano**:
   - `ISeriesPrimitive = ISeriesPrimitiveBase<SeriesAttachedParameter<HorzScaleItem, SeriesType>>` confirmado L4635 typings
   - `series.attachPrimitive(primitive)` API pública confirmada L12826 typings + L5483/L3760 .mjs internal
   - Todos los métodos de `ISeriesPrimitiveBase` son OPCIONALES verbatim L2600-L2693 typings — interface mínima viable
   - `BitmapCoordinatesRenderingScope` exporta `{context, mediaSize, bitmapSize, horizontalPixelRatio, verticalPixelRatio}` desde fancy-canvas
   - `PrimitivePaneViewZOrder = "bottom" | "normal" | "top"` con semántica verbatim: "bottom: Draw below everything except the background" — exactamente lo que KZ necesita

4. **Esqueleto §12 HANDOFF s36 REFINADO al carácter con descubrimientos sobre código real**:
   - 4 sesiones (NYAM + NYPM) NO 3, coherente con Pine Script
   - Borde dashed `[4, 3]` lineWidth 1 — NO contemplado §12
   - Labels Montserrat 700 9px alpha 0.85 textBaseline bottom posición (left+4, top+height-2) — NO contemplado §12
   - S33.3 KZ activa endpoint vivo (~35 líneas lógica L215-L249 actual) — NO contemplado §12
   - Culling `width < 2` — NO contemplado §12
   - Filtro history N por key (cfg.history default 5) en wrapper React — NO contemplado §12
   - `cfg.showLabel` toggle — NO contemplado §12
   - DPR correction crispness sub-pixel patrón LWC oficial — NO contemplado §12 (bug latente `left + 0.5` hardcoded en KillzonesOverlay.js L279 resuelto al carácter gratis con migración)

5. **Working tree clean al cierre s37 verbatim**:
   ```
   git status --short → vacío
   wc -l components/KillzonesOverlay.js → 505 (intacto)
   wc -l refactor/fase-5g-killzones-primitive-design.md → 816 (nuevo commit bc48578)
   ls components/KillzonesPrimitive.js → NO existe (correcto, s38)
   ls lib/killzonesDomain.js → NO existe (correcto, s38 PASO 1 decisión)
   ```

6. **3 invariantes fase 4 intactas decimoséptima sesión consecutiva al carácter**:
   - `cr.series.setData` y `cr.series.update` solo aparecen en `lib/chartRender.js`
   - `computePhantomsNeeded` aparece exactamente 3 veces en `_SessionInner.js`
   - Cluster A `lib/chartViewport.js` §1.7 intocado

7. **1 error §9.4 propio CTO registrado al carácter en s37** (cazado verbatim por mí mismo en sub-paso 18, pero originado por mí en sub-paso anterior). Detalle §2.

8. **Cero touch a producción durante toda la sesión al carácter**. PASO 0 fue 100% lecturas read-only. PASO 1 fue un solo commit sobre archivo nuevo. Cero modificación a `components/`, `lib/`, `pages/`, `next.config.js`, ni cualquier otro archivo runtime.

---

## §1 — PASO 0 inventario bytes-verbatim cerrado al carácter

Sub-pasos 1-20 ejecutados secuencialmente con verificación bicapa después de cada uno.

### §1.1 Contrato API LWC 5.1.0 — typings.d.ts (sub-pasos 1-8)

7 interfaces + 2 type aliases localizados y leídos íntegros:

| Interface / Type | Línea | Función |
|---|---|---|
| `IPrimitivePaneRenderer` | L2199-L2218 | contrato `draw(target: CanvasRenderingTarget2D, utils?: DrawingUtils)` + opcional `drawBackground?()` |
| `IPrimitivePaneView` | L2221-L2237 | contrato `renderer(): IPrimitivePaneRenderer \| null` + opcional `zOrder?(): PrimitivePaneViewZOrder` |
| `ISeriesPrimitiveBase<TSeriesAttachedParameters>` | L2600-L2693 | base — TODOS los métodos opcionales. Hooks: `updateAllViews`, `priceAxisViews`, `timeAxisViews`, `paneViews`, `priceAxisPaneViews`, `timeAxisPaneViews`, `autoscaleInfo`, `attached`, `detached`, `hitTest` |
| `SeriesAttachedParameter<HorzScaleItem, TSeriesType>` | L3736-L3753 | param `attached()` — expone `{chart, series, requestUpdate, horzScaleBehavior}` |
| `BitmapCoordinatesRenderingScope` | fancy-canvas/canvas-rendering-target.d.ts L13-L19 | `{context, mediaSize, bitmapSize, horizontalPixelRatio, verticalPixelRatio}` |
| `MediaCoordinatesRenderingScope` | fancy-canvas/canvas-rendering-target.d.ts L6-L9 | `{context, mediaSize}` (sin DPR) |
| `CanvasRenderingTarget2D` | fancy-canvas/canvas-rendering-target.d.ts L23-L33 | `useMediaCoordinateSpace<T>(f)` + `useBitmapCoordinateSpace<T>(f)` |
| `ISeriesPrimitive` alias | L4635 | `ISeriesPrimitiveBase<SeriesAttachedParameter<HorzScaleItem, SeriesType>>` |
| `PrimitivePaneViewZOrder` | L4750 | `"bottom" \| "normal" \| "top"` con semántica verbatim L4745-L4749 |

**Hallazgos decisivos al carácter**:
- TODOS los métodos de `ISeriesPrimitiveBase` son opcionales — interface mínima posible para KZ: `attached`, `detached`, `paneViews`, `updateAllViews`
- `BitmapCoordinatesRenderingScope` y `MediaCoordinatesRenderingScope` viven en peer dep `fancy-canvas`, NO en `lightweight-charts` (re-export implícito vía tipo)
- `attachPrimitive(primitive: ISeriesPrimitive<HorzScaleItem>)` API pública confirmada
- `requestUpdate: () => void` es el mecanismo de actualización post-mutate del primitive — NO invocar `updateAllViews` directamente, LWC lo hace tras `requestUpdate`

### §1.2 Inventario `KillzonesOverlay.js` 505 líneas (sub-pasos 9-15)

Mapeo completo línea a línea con clasificación migración C:

| Bloque | Líneas | Acción migración C |
|---|---|---|
| Imports React + sessionData helpers | L1-L4 | PRESERVAR + add `import KillzonesPrimitive` |
| `getNYOffset`/`toNYHM`/`toMinutes` | L5-L19 | PRESERVAR (lógica dominio puro) |
| `SESSIONS` (4 sesiones ASIA/LONDON/NYAM/NYPM) + `TF_LIST` | L21-L28 | PRESERVAR |
| `inSession`/`calcSessions` | L30-L68 | PRESERVAR — output dominio puro `{...sess, startTime, endTime, high, low}` directamente consumible por primitive |
| `DEF`/`STORAGE_KEY`/`loadCfg` | L70-L115 | PRESERVAR |
| Component decl + refs init | L117-L135 | PRESERVAR menos `canvasRef`, `drawRef` |
| useEffect cfg persist | L138-L141 | PRESERVAR |
| useEffect click-fuera panel | L143-L149 | PRESERVAR |
| **`resizeCanvas` callback** | **L151-L163** | **ELIMINAR** |
| useEffect recálculo cache + filtro history L189-L192 | L177-L198 | REFORMULAR (`drawRef.current?.()` → `primitiveRef.current?.setSessions(...)`) |
| **`draw` callback (95 líneas)** | **L200-L294** | **ELIMINAR ÍNTEGRO — migra a renderer/paneView del primitive** |
| useEffect drawRef sync | L295 | **ELIMINAR** |
| **useEffect montaje RO + subscribeVisibleLogicalRangeChange + subscribeSizeChange + dragRaf + mousedown/mouseup + wheel (79 líneas)** | **L298-L376** | **ELIMINAR ÍNTEGRO** — todos los disparadores enumerados y migrados a updateAllViews automático de LWC |
| 3 useEffect redraw cfg/tick/ctRedrawBucket | L378-L390 | REFORMULAR (colapsan en 1-2 useEffect que invocan `primitiveRef.current?.setSessions`) |
| `Toggle` + `TfChip` components | L393-L417 | PRESERVAR íntegros |
| JSX wrapper externo `<div position:absolute inset:0 zIndex:5>` | L420 | REVISAR — sin canvas Capa 1 puede simplificarse |
| **`<canvas>` Capa 1 con `ref={canvasRef}`** | **L424-L431** | **ELIMINAR** |
| Indicator label "Killzones" + iconos visible/cogwheel + panel toggles ASIA/LONDON/NYAM/NYPM/showLabel/history + chips TF | L434-L502 | PRESERVAR ÍNTEGRO |

**Cuantitativo al carácter post-migración estimado**:
- `KillzonesOverlay.js`: 505 → ~340 líneas (-33%)
- `KillzonesPrimitive.js`: ~200-250 líneas nuevo
- Eliminadas: ~170 líneas
- Migradas al primitive: ~95 líneas
- Preservadas: ~265 líneas

**Disparadores actuales L298-L376 enumerados al carácter (§43)**:

| # | Disparador | Línea | Destino C |
|---|---|---|---|
| 1 | ResizeObserver parent → `draw()` síncrono | L307 | ELIMINAR — LWC repinta interno al resize |
| 2 | subscribeVisibleLogicalRangeChange → `draw()` | L313 | ELIMINAR — LWC invoca `updateAllViews` automático |
| 3 | subscribeSizeChange → `draw()` | L318 | ELIMINAR — LWC invoca `updateAllViews` automático |
| 4 | dragLoop mousedown+rAF → `draw()` por frame | L322-L334 | ELIMINAR — LWC invoca `updateAllViews` en drag price scale |
| 5 | wheel event → `draw()` defensivo "por si acaso" | L355 | ELIMINAR — patrón §15 (improvisar sin diagnóstico) |
| 6 | useEffect `cfg`/`tfAllowed` → `draw()` | L378 | REFORMULAR → `setSessions(sessions, currentTime, cfg.showLabel)` |
| 7 | useEffect `tick` → `draw()` | L382 | REFORMULAR → `setSessions(...)` |
| 8 | useEffect `ctRedrawBucket` (60s) → `draw()` | L388 | REFORMULAR → `setSessions(...)` con `currentTime` updateado |

§43 satisfecho al carácter: TODOS los paths enumerados con destino claro.

**Hallazgo arqueológico al carácter L93-L115 (comentario v4 verbatim)**:
> "DRAG VERTICAL DE LA ESCALA DE PRECIOS: lightweight-charts NO dispara subscribeVisibleLogicalRangeChange cuando el usuario arrastra la escala de precios (cambio vertical). Sólo lo dispara para horizontal. Solución: mientras el botón del ratón está pulsado sobre el chart, arrancar un loop de rAF que redibuja en cada frame."

Confesión arqueológica del workaround §15. v4 patchó síntoma sin abordar modelo arquitectónico incorrecto. Migración C elimina al carácter la CATEGORÍA ENTERA de patches consumer-side — el primitive recibe `updateAllViews()` automático del pipeline LWC en cualquier cambio (horizontal o vertical) sin que el consumer haga nada.

### §1.3 Ejemplos primitives oficiales LWC 5.1.0 (sub-pasos 16-20)

**`TextWatermark` L14437-L14601** (190 líneas leídas verbatim):
- Estructura triple: `TextWatermarkRenderer` (implementa `IPrimitivePaneRenderer`) + `TextWatermarkPaneView` (implementa `IPrimitivePaneView`) + `TextWatermark` (implementa `IPanePrimitiveBase`)
- `_paneViews = [new TextWatermarkPaneView(...)]` creado UNA vez en constructor — ref estable
- `paneViews() { return this._paneViews }` siempre misma ref (cumple perf hint L2611 typings)
- `updateAllViews()` itera paneViews + invoca método interno `_internal_update(...)` de cada uno
- `attached({ requestUpdate })` solo destructura `requestUpdate` (TextWatermark es pane-anchored, no necesita chart/series)
- `_internal_applyOptions(options)` mutador externo invoca `this._internal_requestUpdate()` — LWC repintará en siguiente frame
- Renderer usa `useMediaCoordinateSpace` (texto, no necesita crispness DPR)
- `TextWatermarkPaneView.renderer()` retorna NUEVA instancia cada llamada

**`MarkersPrimitivePaneView` L15658-L15691** (33 líneas leídas verbatim):
- Constructor recibe `series`, `timeScale`, `options` (wiring desde primitive principal en `attached`)
- `_internal_update(markers)` mapea dominio → coords pixel con null-check:
  ```js
  const y = this._private__series.priceToCoordinate(marker.value)
  if (y === null) return null
  const x = ensureNotNull(this._private__timeScale.timeToCoordinate(marker.time))
  ```
- `priceToCoordinate` retorna `null` legítimo → filtrar (KZ replica esto al carácter)
- `timeToCoordinate` LWC oficial usa `ensureNotNull` (assume tiempo visible) — **KZ NO aplica** porque KZ pueden estar fuera del rango visible (scroll histórico/futuro)
- `.filter(notNull)` descarta entries fallidos
- `renderer()` retorna NUEVA instancia cada llamada (patrón confirmado canónico LWC)

**`MarkersPrimitiveRenderer` L15604-L15644** (54 líneas leídas verbatim):
- `draw(target)` usa `useBitmapCoordinateSpace((scope) => {...})` para crispness DPR-aware
- Patrón canónico DPR correction:
  ```js
  const tickWidth = Math.max(1, Math.floor(scope.horizontalPixelRatio))
  const correction = (tickWidth % 2) / 2
  ```
- En DPR=1 → correction=0.5 (offset clásico canvas), en DPR=2 → correction=0 (alineado), en DPR=3 → correction=0.5
- `data.forEach((item) => {...})` itera shapes DENTRO de UN solo `useBitmapCoordinateSpace` callback (no callback por shape)
- Constantes en coords CSS multiplicadas por `pixelRatio` dentro del callback
- Sin `ctx.save()/ctx.restore()` por shape — reasignación directa de estado entre shapes (más eficiente)
- `ctx.beginPath()` por shape (necesario para shapes con paths como arc, NO necesario para `fillRect`/`strokeRect`)

**Decisión arquitectónica al carácter — vendor `LineToolRectanglePaneView` SKIPPED**:
- Patrón canónico LWC ya cubierto entre TextWatermark + MarkersPrimitive
- KZ NO necesita features de LineTool (selección, edición, hover, handles, drag)
- Si surgen dudas visuales específicas en s38, grep targeted puntual

---

## §2 — Error §9.4 propio CTO registrado al carácter en s37

**Error #1 — `head -20` truncó grep en sub-paso 18**.

En sub-paso 18 ejecuté:
```bash
grep -n "class MarkersPrimitivePaneView\|class MarkersPrimitiveRenderer\|_internal_update\|class SeriesMarkersPrimitive\b" node_modules/lightweight-charts/dist/lightweight-charts.development.mjs | head -20
```

El `head -20` truncó los matches relevantes. Salida devolvió 20 hits de `_internal_update` de OTROS componentes LWC internos (crosshair, pane, priceLine, etc.) — NO los 3 nombres clase que buscaba (`MarkersPrimitivePaneView` L15658, `MarkersPrimitiveRenderer` L15604, `SeriesMarkersPrimitive` L15296), todos al FINAL del archivo de 15873 líneas.

Reconocí error inmediato al carácter. Corregí en sub-paso 18-bis quitando filtro `_internal_update` (que dispara N hits irrelevantes) y eliminando `head -20`:
```bash
grep -n "class MarkersPrimitivePaneView\|class MarkersPrimitiveRenderer\|class SeriesMarkersPrimitive\b" node_modules/lightweight-charts/dist/lightweight-charts.development.mjs
```

Salida corregida: 3 hits exactos. Mismo patrón §9.4 que error #2 s36 (muestreo defectuoso). Cazado por bytes propios.

**Lección consolidada al carácter**: `head -N` sobre grep que combina términos generales (`_internal_update`) con específicos (`class MarkersPrimitive...`) trunca los específicos si los generales aparecen antes. Solución: filtros mutuamente excluyentes o sin `head` cuando hay duda de orden.

---

## §3 — PASO 1 documento de diseño producido al carácter

**Path**: `refactor/fase-5g-killzones-primitive-design.md`
**Tamaño**: 816 líneas, 45139 bytes (44 KB)
**MD5**: `94347ae91cf55ce90a20b3f1952ef444`
**Commit**: `bc48578 docs(5g): killzones primitive design doc (s37 PASO 1)`

**Estructura 10 secciones al carácter**:

| § | Contenido |
|---|---|
| §0 | Contexto + decisión arquitectónica C + razones objetivas (6 razones enumeradas) |
| §1 | PASO 0 inventario bytes-verbatim cerrado al carácter — síntesis 7 fuentes |
| §2 | Diseño `KillzonesPrimitive` clase principal — código verbatim completo |
| §3 | Diseño `KillzonesPaneView` + S33.3 KZ activa endpoint vivo `computeActiveSession` — código verbatim |
| §4 | Diseño `KillzonesRenderer` + DPR correction — código verbatim con explicación |
| §5 | Reformulación `KillzonesOverlay.js` wrapper React — esqueleto post-migración |
| §6 | Plan s38 PASO 0→5 — implementación paso a paso |
| §7 | 16 riesgos identificados + mitigaciones (arquitectónicos, visuales, lógicos, performance) |
| §8 | 10 criterios verificación empírica S33.4 desaparece estructuralmente |
| §9 | Lecciones consolidadas + §47/§48 nuevas |
| §10 | Cierre + estado al cierre |

**Decisión arquitectónica diferida a s38 PASO 1**: ubicación helpers dominio (`toNYHM`, `inSession`, `SESSIONS`, `getNYOffset`, `toMinutes`, `calcSessions`). 3 opciones:
- A: re-export desde `KillzonesOverlay.js` (mínimo blast radius, riesgo circular import)
- **B: extraer a `lib/killzonesDomain.js`** (recomendado CTO, desacoplamiento limpio, +1 archivo nuevo)
- C: duplicar en `KillzonesPrimitive.js` (descartado, viola DRY)

Decisión final s38 con working tree en mano.

---

## §4 — Lecciones nuevas al carácter en s37

### §4.1 Lección §47 NUEVA — entregable tangible cada sesión

Una sesión SIN entregable tangible (commit o archivo nuevo en disco) tiene coste oculto al carácter: re-contextualización al inicio de la siguiente sesión. Si una sesión es 100% lectura y termina sin producir documento de síntesis, los hallazgos viven en context window efímera y se re-construyen desde HANDOFF en la siguiente sesión.

Aplicabilidad al carácter: cualquier sesión de PASO 0 / inventario / lectura — antes de cerrar, evaluar si los hallazgos justifican documento de síntesis. Si sí, redactar como parte del cierre.

Origen lección: §14 Ramón verbatim "que hemos hecho para que quieras redctar handoff ya?" en sub-paso 22 cazó el patrón. CTO había propuesto pausa con cero entregable.

### §4.2 Lección §48 NUEVA — leer ejemplos LWC oficial antes que vendor fork

LWC oficial (`lightweight-charts.development.mjs` v5.1.0) tiene primitives oficiales documentados con JSDoc verbatim: `TextWatermark`, `ImageWatermark`, `SeriesMarkersPrimitive`, `UpDownMarkersPrimitive`. Vendor fork (`lightweight-charts-line-tools-*`) es una capa específica para drawings interactivas con UI handlers (selección, edición, hover, handles, drag).

Aplicabilidad al carácter: cualquier extensión LWC futura — empezar por primitives oficiales del paquete `lightweight-charts`, después considerar vendor fork solo si features específicas (selección/edición/hover) lo requieren. Para primitives NO interactivas (KZ, watermarks, markers, áreas de highlight), oficial precede vendor fork.

---

## §5 — Lección §14 vigesimosegunda sesión consecutiva al carácter

S37 instancia decisiva:

**Pregunta verbatim Ramón sub-paso 22**: "pero y que hemos hecho para que quieras redctar handoff ya?"

**Contexto al carácter**: CTO había propuesto en sub-paso 21 pausar sesión 37 con PASO 0 cerrado, dejando PASO 1 redacción documento para inicio s38. Razonamiento CTO: "varias horas leyendo bytes, redactar documento denso fácil deslizar errores §9.4 si arrancamos cansados".

**Falla CTO al carácter**: enumerar lo que se había hecho en s37 = TODO lecturas read-only, CERO entregable tangible en disco. Pausar ahí significaba s38 arrancar releyendo HANDOFF + re-contextualizando PASO 0 desde cero. Coste de re-contextualización gratuito que §14 cazó al instante.

**Resultado §14**: forzó avance a PASO 1 producir documento de diseño 816 líneas en disco = entregable tangible. Origen lección §47.

Patrón consistente al carácter con instancias previas §14 documentadas s31-s36:
- s33 "no le veo sentido al instrumentar X"
- s34 "el ResizeObserver no es el problema, mira tu logs"
- s35 "k kieres k haga? probar lo k ya sabemos k esta mal?"
- s36 "k control bueno, si se desajusta tambien..."
- s36 "y lo k ya esta pintado de las killzones no se puede anclar al precio y hora? como los drawings?"
- **s37 "pero y que hemos hecho para que quieras redctar handoff ya?"**

Vigesimosegunda sesión consecutiva al carácter §14 input técnico encriptado.

---

## §6 — Plan sesión 38: implementación + integración + verificación

**Objetivo s38 al carácter**: implementar `components/KillzonesPrimitive.js` + reformular `components/KillzonesOverlay.js` + smoke local discriminante 4 paths + commit + push origin/main si smoke PASS.

### §6.1 PASO 0 s38 — verificación bicapa baseline

1. `git status --short` → vacío esperado
2. `git rev-parse --short HEAD` → `bc48578` esperado
3. `git log --oneline -3` → ver bc48578 + 2a91e61 + ancestros
4. `wc -l components/KillzonesOverlay.js` → 505 esperado
5. `ls -la components/KillzonesPrimitive.js` → NO existe esperado
6. `ls -la lib/killzonesDomain.js` → NO existe esperado
7. Re-leer `refactor/fase-5g-killzones-primitive-design.md` verbatim entero
8. 3 invariantes fase 4 verificación bicapa

### §6.2 PASO 1 s38 — decisión final ubicación helpers dominio

Decidir entre opciones §3 doc design:
- **A**: re-export desde `KillzonesOverlay.js`
- **B**: extraer a `lib/killzonesDomain.js` ← **recomendado CTO**
- **C**: duplicar (descartado)

Si B (recomendado):
- Crear `lib/killzonesDomain.js` con `SESSIONS`, `TF_LIST`, `toNYHM`, `inSession`, `getNYOffset`, `toMinutes`, `calcSessions`. ~80 líneas estimadas.
- Bicapa shell + grep verificar imports.

### §6.3 PASO 2 s38 — crear `components/KillzonesPrimitive.js`

1. `cat > components/KillzonesPrimitive.js << 'EOF' ... EOF` con código verbatim §2.2 + §3.2 + §4.2 doc design
2. Verificación bicapa al carácter:
   - `wc -l components/KillzonesPrimitive.js` → ~200-250 esperado
   - `grep -c "class KillzonesPrimitive\|class KillzonesPaneView\|class KillzonesRenderer" components/KillzonesPrimitive.js` → 3 esperado
   - `grep -c "attachPrimitive\|detachPrimitive\|requestUpdate\|useBitmapCoordinateSpace\|priceToCoordinate\|timeToCoordinate" components/KillzonesPrimitive.js`
3. `npm run build` local → PASS esperado

### §6.4 PASO 3 s38 — reformular `components/KillzonesOverlay.js`

Edits múltiples bloques según §5 doc design:
- Añadir `import { KillzonesPrimitive } from './KillzonesPrimitive'`
- Eliminar `canvasRef`, `drawRef`, `resizeCanvas` callback
- Eliminar `draw` callback completo L200-L294
- Eliminar useEffect montaje RO/SSC/dragRaf/wheel completo L298-L376
- Añadir `primitiveRef` + useEffect mount/unmount primitive
- Colapsar 3 useEffect redraw en lógica `setSessions`
- Eliminar JSX `<canvas>` Capa 1

Verificación bicapa al carácter:
- `wc -l components/KillzonesOverlay.js` → ~340 esperado
- `grep -c "canvas\|ResizeObserver\|subscribeSizeChange\|drawRef\|resizeCanvas" components/KillzonesOverlay.js` → 0 esperado
- `grep -c "attachPrimitive\|detachPrimitive\|primitiveRef\|setSessions" components/KillzonesOverlay.js` → >= 4 esperado
- 3 invariantes fase 4 intactas bicapa

`npm run build` local → PASS esperado.

### §6.5 PASO 4 s38 — smoke local discriminante 4 paths

Server `npm run start`. Sesión EUR/USD M15 con KZ visibles cluster central. DevTools Console abierto.

| Path | Trigger | Esperado |
|---|---|---|
| 1 | doble-click barra título macOS | KZ permanecen |
| 2 | botón verde Chrome expandir/contraer | KZ permanecen (path race +637.98px s36) |
| 3 | drag vertical price scale | KZ permanecen (path comentario v4 L107) |
| 4 | botón fullscreen simulador propio | KZ permanecen (path original S33.4) |

Bonus paths:
- 5: pan/zoom horizontal del chart → KZ permanecen
- 6: replay vela-a-vela → KZ activa endpoint vivo crece
- 7: cambio TF M15 → M5 → M30 → KZ recalcula correctamente

Criterio PASS al carácter: KZ NO se descolocan en NINGÚN path. Si bug = bug propio implementación, NO arquitectónico — diagnóstico antes de commit.

### §6.6 PASO 5 s38 — commit + push origin/main (si smoke 4/4 PASS)

1. `git add components/KillzonesPrimitive.js components/KillzonesOverlay.js [lib/killzonesDomain.js]`
2. `git commit -m "feat(5g): migrate KillzonesOverlay to ISeriesPrimitive (closes S33.4)"`
3. Verificación bicapa pre-push: `git log --oneline -5`
4. Push solo con OK explícito Ramón
5. Verificar deploy Vercel
6. Smoke producción `simulator.algorithmicsuite.com` — repetir 4 paths del PASO 4

---

## §7 — Items diferidos post-Phase-5

Items registrados al carácter para resolver tras cierre fase 5 / S33.4:

1. **5f.2 polling cleanup** — diferido desde s28
2. **5e.4 debugCtx cleanup** — diferido desde s29
3. **5d.7-5d.8 viewport preservation** — diferido desde s30
4. **Killzones regression** — placeholder s33.5 si aparece regresión visual post-migración C
5. **Debt 5.1** — TradingView-style viewport preservation on timeframe change
6. **Datos crudos Giancarlo/Luis "drawings zona futura derecha"** — diferido desde s30
7. **Sub-phase 5f LS-DEBUG cleanup** — diferido desde s23
8. **`CustomDrawingsOverlay.js`** TEXT/RULER — verificar empíricamente si sufre S33.4 o no (asunto pendiente s35 §6)

Todos diferidos al carácter hasta cierre S33.4 estructural en s38.

---

## §8 — Cierre sesión 37

Sesión 37 cerrada al carácter 23 mayo 2026, ~17:00 hora local.

HEAD local main = `bc48578` (commit doc design s37 PASO 1).
`origin/main` = `2a91e61` (HANDOFF s36) — sin push s37 todavía.
Producción `6abc870` intacta decimoséptima sesión consecutiva.
Working tree clean. Cero contaminación.

PASO 0 inventario bytes-verbatim cerrado al carácter sobre 7 fuentes. PASO 1 documento de diseño producido al carácter (816 líneas, 45139 bytes, md5 `94347ae91cf55ce90a20b3f1952ef444`). Decisión arquitectónica Opción C ratificada con bytes en mano. Esqueleto §12 HANDOFF s36 refinado al carácter sobre código real (4 sesiones NYAM/NYPM, borde dashed, labels, S33.3 endpoint vivo, culling, filtro history, DPR correction).

1 error §9.4 propio CTO registrado al carácter (head -20 truncó grep sub-paso 18).
2 lecciones nuevas al carácter (§47 entregable tangible, §48 LWC oficial precede vendor fork).
Lección §14 vigesimosegunda sesión consecutiva (pregunta Ramón cazó error CTO de proponer pausa sin entregable).

Próxima sesión = sesión 38. Prioridad 1 = implementar `KillzonesPrimitive.js` + reformular `KillzonesOverlay.js` + smoke discriminante 4 paths + commit + push.

Calidad TradingView no negociable. CLAUDE.md §1.

— CTO
