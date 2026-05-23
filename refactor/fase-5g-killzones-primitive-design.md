# Fase 5g — Killzones Primitive Design

> **Sesión 37** — diseño esqueleto `components/KillzonesPrimitive.js` implementando `ISeriesPrimitive` nativo LWC.
> NO implementación runtime. Solo diseño + plan s38.
> Documento producido al carácter sobre PASO 0 inventario bytes-verbatim cerrado al carácter.
> Referencia paralela: `refactor/HANDOFF-cierre-sesion-36.md` — pivote arquitectónico mayor, decisión Opción C tomada con bytes en mano.

---

## §0 — Contexto + decisión arquitectónica C + razones objetivas

### §0.1 Origen del problema

**S33.4** — "KZ se descolocan al redimensionar la ventana del navegador". Caracterizada empíricamente en s36 al carácter:

- **NO es race scale Y** (hipótesis s35 refutada por logs propios)
- **ES race scale X (`barSpacing` LWC) stale** entre `ResizeObserver` síncrono y recálculo `barSpacing` LWC ~2 RAFs después
- `subscribeSizeChange` LWC notifica "size cambió" ANTES de recalcular `barSpacing`
- `sampleX` salta +637.98px entre RO-sync y RO-2RAF en RO#3 path expandir Chrome botón verde

### §0.2 Modelo arquitectónico actual `KillzonesOverlay.js` viola CLAUDE.md §4.2

`KillzonesOverlay.js` actual mantiene cache de sesiones en dominio puro `{startTime, endTime, high, low}` PERO en `draw()` L260-L263 hace conversión manual `timeToCoordinate`/`priceToCoordinate` SÍNCRONA al `ResizeObserver`, ANTES de que LWC actualice `barSpacing`. Esto al carácter es exactamente lo que CLAUDE.md §4.2 prohíbe desde sesión 1: drawings se persisten como `{timestamp, price}`, **nunca como píxeles**.

### §0.3 Ground truth Pine Script TradingView

Pine Script del indicador "R.A.M.M.FX TRADING™ – Algorithmic Suite – Killzones SMC" leído entero en s36. APIs verificadas verbatim:

```pinescript
box.new(_t1, _h, time, _l, xloc=xloc.bar_time, bgcolor, border_color, border_style, border_width)
box.set_top(_box, _h)
box.set_bottom(_box, _l)
box.set_right(_box, time)
```

TradingView NUNCA recibe coordenadas en píxeles. Recibe **timestamps (`time`) y precios (`high`, `low`)**. Conversión a píxel es responsabilidad interna del render layer TradingView, en cada frame, con scale fresh garantizado. **TradingView NO tiene S33.4 estructuralmente**.

### §0.4 Decisión arquitectónica Opción C confirmada al carácter

Tres opciones evaluadas en s36 §8 con bytes en mano:

| Opción | Veredicto |
|---|---|
| A: filtros consumer-side sobre `exportLineTools` con IDs `kz-*` | NO — deuda permanente §43 |
| B: segundo `createLineToolsPlugin` dedicado a KZ | NO — overhead doble vendor 399KB + handlers UI duplicados |
| **C: primitive custom directo `series.attachPrimitive(killzonesPrimitive)` implementando `ISeriesPrimitive`** | **SÍ — patrón nativo LWC, replica al carácter modelo Pine Script** |

Razones objetivas al carácter para C:

1. **Profesional como TradingView**: C es el patrón nativo LWC, exactamente como hace `LineToolsCorePlugin` internamente (`series.attachPrimitive(tool)` L1765 + L3446 vendor), pero sin overhead UI (selección/edición/hover que NO queremos para KZ)
2. **Sin filtros consumer-side**: KZ NO entran en `exportLineTools()` porque no están en `_tools` Map del plugin de drawings
3. **Sin segundo plugin LineToolsCore**: evita carga doble vendor (399KB) + duplicar memoria + handlers UI duplicados
4. **Coordinación LWC nativa**: paneViews `priceToCoordinate`/`timeToCoordinate` invocados INTERNAMENTE por LWC con scale fresh garantizado en cada frame. **Estructuralmente imposible que S33.4 reaparezca**
5. **Reducción de código**: `KillzonesOverlay.js` 505 → ~340 líneas (-33%). Eliminamos canvas externo, ResizeObserver propio, `subscribeSizeChange` propio, `draw` síncrono, DPR management
6. **Replicación al carácter del modelo Pine Script**: API operativa idéntica conceptualmente (`box.new({time, price}, ...)` ↔ primitive paneView con `points: [{timestamp, price}]`)

---

## §1 — PASO 0 inventario bytes-verbatim al carácter cerrado

### §1.1 Contrato API LWC 5.1.0 (`node_modules/lightweight-charts/dist/typings.d.ts`)

| Interface / Type | Línea | Función |
|---|---|---|
| `IPrimitivePaneRenderer` | L2199 | contrato `renderer.draw(target, utils?)` + opcional `drawBackground?()` |
| `IPrimitivePaneView` | L2221 | contrato `paneView.renderer()` + opcional `zOrder?()` |
| `ISeriesPrimitiveBase<T>` | L2600 | contrato base — TODOS los métodos opcionales |
| `SeriesAttachedParameter` | L3736 | param de `attached()` — exposes `{chart, series, requestUpdate, horzScaleBehavior}` |
| `ISeriesPrimitive` alias | L4635 | `ISeriesPrimitiveBase<SeriesAttachedParameter<HorzScaleItem, SeriesType>>` |
| `PrimitivePaneViewZOrder` | L4750 | `"bottom" \| "normal" \| "top"` |

Versión LWC instalada confirmada: **5.1.0**.

### §1.2 Contrato `CanvasRenderingTarget2D` (fancy-canvas peer dep)

`node_modules/fancy-canvas/canvas-rendering-target.d.ts` 40 líneas leídas íntegras:

```ts
export interface BitmapCoordinatesRenderingScope {
    readonly context: CanvasRenderingContext2D;
    readonly mediaSize: Size;
    readonly bitmapSize: Size;
    readonly horizontalPixelRatio: number;
    readonly verticalPixelRatio: number;
}
export declare class CanvasRenderingTarget2D {
    useMediaCoordinateSpace<T>(f: (scope: MediaCoordinatesRenderingScope) => T): T;
    useBitmapCoordinateSpace<T>(f: (scope: BitmapCoordinatesRenderingScope) => T): T;
}
```

Para KZ se usa `useBitmapCoordinateSpace` — necesitamos `horizontalPixelRatio`/`verticalPixelRatio` para crispness DPR-aware.

### §1.3 Inventario `KillzonesOverlay.js` 505 líneas — clasificación migración C

| Bloque | Líneas | Acción |
|---|---|---|
| Imports React + helpers `sessionData` | L1-L4 | PRESERVAR + add `import KillzonesPrimitive` |
| `getNYOffset`/`toNYHM`/`toMinutes` | L5-L19 | PRESERVAR (lógica dominio) |
| `SESSIONS` + `TF_LIST` | L21-L28 | PRESERVAR (lógica dominio) |
| `inSession`/`calcSessions` | L30-L68 | PRESERVAR (lógica dominio) |
| `DEF` + `STORAGE_KEY` + `loadCfg` | L70-L115 | PRESERVAR (config) |
| Component decl + refs init | L117-L135 | PRESERVAR menos `canvasRef`, `drawRef` |
| useEffect cfg persist | L138-L141 | PRESERVAR |
| useEffect click-fuera panel | L143-L149 | PRESERVAR |
| **`resizeCanvas` callback** | **L151-L163** | **ELIMINAR** |
| useEffect recálculo cache + filtro history | L177-L198 | REFORMULAR (`drawRef.current?.()` → `primitiveRef.current?.setSessions(...)`) |
| **`draw` callback** | **L200-L294** | **ELIMINAR ÍNTEGRO — migra a renderer/paneView del primitive** |
| useEffect drawRef sync | L295 | **ELIMINAR** |
| **useEffect montaje RO+SSC+dragRaf+wheel** | **L298-L376** | **ELIMINAR ÍNTEGRO** — reemplazar por `useEffect` mount/unmount primitive |
| 3× useEffect redraw cfg/tick/ctRedrawBucket | L378-L390 | REFORMULAR (colapsan en 1 dispatch a primitive) |
| `Toggle` + `TfChip` components | L393-L417 | PRESERVAR íntegros |
| JSX wrapper externo | L420 | REVISAR (sin canvas, simplificar) |
| **`<canvas>` Capa 1** | **L424-L431** | **ELIMINAR** |
| Indicator label + panel UI | L434-L502 | PRESERVAR ÍNTEGRO |

**Cuantitativo al carácter**:
- ELIMINAR: ~170 líneas (canvas + resizeCanvas + draw + useEffect RO/SSC/drag/wheel + drawRef + JSX canvas)
- MIGRA al primitive: ~95 líneas (lógica visual del draw, sin gestión canvas)
- PRESERVAR: ~265 líneas
- **NETO `KillzonesOverlay.js` post-migración estimado: ~340 líneas** (vs 505 actuales = -33%)
- **NUEVO archivo `KillzonesPrimitive.js` estimado: ~200-250 líneas**

### §1.4 Patrones referencia operativos LWC 5.1.0

**`TextWatermark`** L14437-L14601 — patrón estructura triple end-to-end:
- `TextWatermarkRenderer` implementa `IPrimitivePaneRenderer`
- `TextWatermarkPaneView` implementa `IPrimitivePaneView` — `renderer()` retorna NUEVA instancia cada call
- `TextWatermark` implementa `IPanePrimitiveBase` — `paneViews()` retorna MISMA ref siempre

**`MarkersPrimitivePaneView`** L15658-L15691 — patrón canónico múltiples shapes con coords time/price:
- Constructor recibe `series`, `timeScale`, `options` (wiring desde primitive principal en `attached`)
- `_internal_update(markers)` mapea dominio → coords pixel con null-check
- `priceToCoordinate` retorna `null` legítimo → filtrar
- `timeToCoordinate` LWC oficial usa `ensureNotNull` (assume tiempo siempre visible) — **KZ NO aplica** porque KZ pueden estar fuera del rango visible (scroll histórico/futuro)

**`MarkersPrimitiveRenderer`** L15604-L15644 — patrón draw múltiples shapes con DPR correction:
```js
const tickWidth = Math.max(1, Math.floor(scope.horizontalPixelRatio));
const correction = (tickWidth % 2) / 2;
```
Crispness sub-pixel DPR-aware. Constantes en coords CSS multiplicadas por `pixelRatio` dentro del callback. Sin `ctx.save()/ctx.restore()` por shape — reasignación directa de estado entre shapes.

### §1.5 Hallazgos `KillzonesOverlay.js` no contemplados en HANDOFF s36 §12 esqueleto

1. **4 sesiones, NO 3**: ASIA + LONDON + **NYAM + NYPM** (NY desdoblado AM/PM). Coherente con Pine Script TradingView.
2. **Borde dashed `[4, 3]`** con `lineWidth: 1` y offset `+0.5` (hardcoded, bug latente en DPR != 1 que la migración corrige al carácter gratis).
3. **Labels condicionales** font `"700 9px 'Montserrat', sans-serif"`, color `s.text`, `globalAlpha = 0.85`, `textBaseline = 'bottom'`, posición `(left + 4, top + height - 2)`, solo si `cfg.showLabel && height > 14`.
4. **S33.3 KZ activa endpoint vivo** (L215-L249): la KZ cuya hora NY contiene `currentTime` extiende `endTime` a `lastRealTs` y recalcula `liveHigh`/`liveLow` vela-a-vela durante replay. **NO contemplado en §12 HANDOFF s36** — se preserva íntegro en `KillzonesPaneView._update()`.
5. **Culling `width < 2`**: descarta cajas degeneradas (sesión completa fuera del rango visible).
6. **Try/catch + null-check** en `timeToCoordinate`/`priceToCoordinate`: ambos ejes deben tratar `null` permisivamente.
7. **Filtro history** L189-L192 — limita a `cfg.history` (default 5) más recientes por key. Vive en wrapper React, NO en primitive.
8. **`cfg.showLabel`** boolean — pasa al primitive como tercer parámetro de `setSessions`.

---

## §2 — Diseño `KillzonesPrimitive` clase principal

### §2.1 Responsabilidades

| Responsabilidad | Implementación |
|---|---|
| Implementar `ISeriesPrimitive` LWC nativo | métodos `attached`, `detached`, `paneViews`, `updateAllViews` |
| Mantener estado dominio puro | `_sessions[]`, `_currentTime`, `_showLabel` |
| Mantener refs LWC inyectados | `_chart`, `_series`, `_requestUpdate` (desde `attached`) |
| Mantener `paneViews` con ref estable | `_paneViewsArray` creado UNA vez en constructor |
| API consumer-side mutate | `setSessions(sessions, currentTime, showLabel)` — única función |

### §2.2 Código verbatim diseño al carácter

```js
// components/KillzonesPrimitive.js — Fase 5g
// Migración Opción C: primitive custom directo implementando ISeriesPrimitive
// nativo LWC. Elimina estructuralmente S33.4 (race scale X barSpacing stale)
// porque la conversión coords se hace dentro del pipeline LWC con scale fresh
// garantizado en cada frame.
//
// API consumer:
//   const kp = new KillzonesPrimitive()
//   series.attachPrimitive(kp)
//   kp.setSessions(sessions, currentTime, showLabel)  // dispara redibujado
//   series.detachPrimitive(kp)  // en unmount

import { getSeriesData, getRealLen } from '../lib/sessionData'

export class KillzonesPrimitive {
  constructor() {
    this._sessions = []
    this._currentTime = null
    this._showLabel = true
    this._paneViewsArray = [new KillzonesPaneView(this)]  // ref estable (perf hint LWC L2611 typings)
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }

  // ─── ISeriesPrimitive API ──────────────────────────────────────────────

  attached({ chart, series, requestUpdate }) {
    this._chart = chart
    this._series = series
    this._requestUpdate = requestUpdate
  }

  detached() {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }

  paneViews() {
    return this._paneViewsArray  // misma ref siempre
  }

  updateAllViews() {
    // LWC invoca este método cuando consumer llama requestUpdate() o cuando
    // el chart repinta por cualquier razón interna (resize, pan, zoom).
    // Scale fresh garantizado aquí.
    this._paneViewsArray.forEach(pv => pv._update(this._sessions, this._currentTime, this._showLabel))
  }

  // ─── API consumer-side ─────────────────────────────────────────────────

  setSessions(sessions, currentTime, showLabel) {
    this._sessions = sessions || []
    this._currentTime = currentTime
    this._showLabel = showLabel !== false
    this._requestUpdate?.()
  }
}
```

### §2.3 Justificación al carácter de decisiones

- **`paneViews()` retorna `this._paneViewsArray`**: ref estable como exige `ISeriesPrimitiveBase` JSDoc verbatim L2611 typings ("must return new array if set of views has changed and should try to return the same array if nothing changed"). KZ siempre tiene UN solo paneView, ref nunca cambia.
- **`updateAllViews()` invoca `_update` con state completo**: pasa `_sessions`, `_currentTime`, `_showLabel` por parámetro en lugar de que paneView lea de `_primitive._*`. Simplifica testing del paneView aislado y evita acoplamiento bidireccional.
- **`setSessions` único setter**: simplicidad. No fragmentar en 3 setters (sessions/currentTime/showLabel) — el wrapper React ya colapsa los 3 triggers actuales en una sola llamada por tick de simulación.
- **`detached` limpia refs**: previene leaks si LWC re-adjunta o GC tarda.
- **No `_isAttached` flag**: implícito en `_requestUpdate !== null`.

---

## §3 — Diseño `KillzonesPaneView` + lógica S33.3 KZ activa endpoint vivo

### §3.1 Responsabilidades

| Responsabilidad | Implementación |
|---|---|
| Implementar `IPrimitivePaneView` LWC | métodos `zOrder`, `renderer`, internal `_update` |
| Convertir dominio (time/price) → coords pixel | `series.priceToCoordinate` + `timeScale.timeToCoordinate` dentro de `_update` |
| Preservar S33.3 KZ activa endpoint vivo | bloque `computeActiveSession` extraído del `draw` L215-L249 actual |
| Null-check permisivo en ambos ejes | KZ pueden estar fuera del rango visible (scroll histórico/futuro) |
| zOrder bottom | KZ detrás de velas + drawings usuario |

### §3.2 Código verbatim diseño al carácter

```js
class KillzonesPaneView {
  constructor(primitive) {
    this._primitive = primitive
    this._data = []         // boxes pre-convertidas a coords pixel para el renderer
    this._showLabel = true
  }

  // LWC invoca renderer() después de updateAllViews(). Devolvemos nueva
  // instancia con _data ya pre-calculada (patrón canónico LWC — renderer
  // cheap, ver MarkersPrimitivePaneView L15681-L15686).
  renderer() {
    return new KillzonesRenderer(this._data, this._showLabel)
  }

  zOrder() {
    return 'bottom'  // KZ detrás de velas + drawings (PrimitivePaneViewZOrder typings L4750)
  }

  _update(sessions, currentTime, showLabel) {
    this._showLabel = showLabel

    const chart = this._primitive._chart
    const series = this._primitive._series
    if (!chart || !series || !sessions || sessions.length === 0) {
      this._data = []
      return
    }
    const timeScale = chart.timeScale()

    // S33.3 — KZ activa endpoint vivo: identificar la KZ cuya ventana
    // horaria NY contiene currentTime, y recalcular su endTime/high/low
    // vela-a-vela desde sessionData. Lógica preservada del draw L215-L249.
    const { activeSession, liveHigh, liveLow, lastRealTs } = computeActiveSession(sessions, currentTime)

    this._data = sessions.map(s => {
      const isActive = (s === activeSession)
      const endTs = (isActive && lastRealTs != null && lastRealTs > s.endTime) ? lastRealTs : s.endTime
      const sHigh = (isActive && liveHigh != null) ? liveHigh : s.high
      const sLow  = (isActive && liveLow  != null) ? liveLow  : s.low

      // Conversión coords — LWC garantiza scale fresh aquí
      const y1 = series.priceToCoordinate(sHigh)
      const y2 = series.priceToCoordinate(sLow)
      if (y1 == null || y2 == null) return null

      const x1 = timeScale.timeToCoordinate(s.startTime)
      const x2 = timeScale.timeToCoordinate(endTs)
      if (x1 == null || x2 == null) return null

      return {
        x1, y1, x2, y2,
        bg: s.bg,
        border: s.border,
        text: s.text,
        label: s.label,
      }
    }).filter(b => b !== null)
  }
}

// ─── Helper S33.3 KZ activa endpoint vivo (extraído de draw L215-L249) ────
//
// Preserva al carácter la lógica original:
// 1. Identifica la sesión cuya ventana NY contiene currentTime
// 2. Matchea por key con la box más reciente de cache
// 3. Recalcula liveHigh/liveLow iterando velas desde el final hacia atrás
//    rompiendo al salir del rango temporal de la KZ activa
//
// Retorna { activeSession, liveHigh, liveLow, lastRealTs } — todos null
// si no hay KZ activa o si falta data.
function computeActiveSession(sessions, currentTime) {
  if (!currentTime) return { activeSession: null, liveHigh: null, liveLow: null, lastRealTs: null }

  const allData = getSeriesData()
  const realLen = getRealLen()
  const lastRealTs = (allData && realLen) ? allData[realLen - 1].time : null
  if (!lastRealTs) return { activeSession: null, liveHigh: null, liveLow: null, lastRealTs: null }

  // toNYHM e inSession son helpers de KillzonesOverlay.js — para evitar
  // duplicación, en s38 se extraerán a un módulo compartido (lib/killzonesDomain.js)
  // o el primitive los importará de KillzonesOverlay.js (re-export).
  // Decisión final s38 PASO 1.
  const { h: nyH, m: nyM } = toNYHM(currentTime)
  let activeKey = null
  for (const sess of SESSIONS) {
    if (inSession(nyH, nyM, sess)) { activeKey = sess.key; break }
  }
  if (!activeKey) return { activeSession: null, liveHigh: null, liveLow: null, lastRealTs }

  let activeSession = null
  for (const s of sessions) {
    if (s.key === activeKey && (!activeSession || s.endTime > activeSession.endTime)) activeSession = s
  }
  if (!activeSession) return { activeSession: null, liveHigh: null, liveLow: null, lastRealTs }

  let liveHigh = null, liveLow = null
  for (let i = realLen - 1; i >= 0; i--) {
    const c = allData[i]
    if (c.time < activeSession.startTime) break
    if (c.time > lastRealTs) continue
    if (liveHigh == null || c.high > liveHigh) liveHigh = c.high
    if (liveLow == null || c.low < liveLow) liveLow = c.low
  }

  return { activeSession, liveHigh, liveLow, lastRealTs }
}
```

### §3.3 Decisión arquitectónica pendiente s38 — ubicación helpers dominio

`toNYHM`, `inSession`, `SESSIONS` viven hoy en `KillzonesOverlay.js`. El `computeActiveSession` del primitive los necesita. Opciones:

| Opción | Pros | Contras |
|---|---|---|
| A: Importarlos desde `KillzonesOverlay.js` (re-export) | mínimo blast radius, sin archivos nuevos | acopla primitive a wrapper React (circular import si no se cuida) |
| B: Extraer a `lib/killzonesDomain.js` nuevo módulo | desacoplamiento limpio, testeable aislado | +1 archivo nuevo |
| C: Duplicar en `KillzonesPrimitive.js` | sin dependencias cruzadas | violación DRY, riesgo divergencia |

**Recomendación CTO**: **opción B** — extraer a `lib/killzonesDomain.js`. Razones objetivas:
- `SESSIONS`, `toNYHM`, `inSession`, `getNYOffset`, `toMinutes` son lógica de dominio pura sin dependencias React
- Tanto wrapper React como primitive los importan limpio
- Coherente con `lib/sessionData.js` ya existente (mismo patrón)
- Decisión final s38 PASO 1 con working tree en mano

### §3.4 Justificación decisiones al carácter

- **`renderer()` retorna nueva instancia**: patrón canónico LWC (`TextWatermarkPaneView.renderer()` L14530 + `MarkersPrimitivePaneView.renderer()` L15681). Renderer es CHEAP, solo guarda refs a `_data` ya pre-calculada. Cero overhead.
- **`_update` recibe state por parámetro, no lee de `_primitive`**: invocado por `KillzonesPrimitive.updateAllViews()` con state actual. Paneview testeable aislado.
- **Null-check ambos ejes**: KZ pueden tener `startTime` antes del rango visible o `endTime` después. Diferente de markers (LWC asume markers visibles → `ensureNotNull`). Preserva comportamiento `KillzonesOverlay.js` actual L264-L265.
- **`zOrder: 'bottom'`**: typings.d.ts L4747-L4749 verbatim: "bottom: Draw below everything except the background". KZ detrás de velas para no taparlas. Coherente con cómo TradingView pinta sus highlights.
- **Pre-cálculo en `_update`, no en `renderer`**: separa conversión coords (1 vez por update) de render (potencialmente N veces si LWC repinta varios frames con el mismo state). Eficiente.

---

## §4 — Diseño `KillzonesRenderer` + DPR correction

### §4.1 Responsabilidades

| Responsabilidad | Implementación |
|---|---|
| Implementar `IPrimitivePaneRenderer` LWC | método `draw(target, utils?)` |
| Usar `useBitmapCoordinateSpace` para crispness DPR | callback con `horizontalPixelRatio` + `verticalPixelRatio` |
| Pintar background + border dashed + label por sesión | siguiendo paridad pixel-perfect con `draw` actual L267-L289 |
| DPR-aware crispness sub-pixel | patrón `correction` extraído de `MarkersPrimitiveRenderer` L15614-L15615 |
| No interactividad | NO `hitTest`, NO cursor change, NO hover |

### §4.2 Código verbatim diseño al carácter

```js
class KillzonesRenderer {
  constructor(data, showLabel) {
    this._data = data || []
    this._showLabel = showLabel
  }

  draw(target) {
    if (this._data.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hpr = scope.horizontalPixelRatio
      const vpr = scope.verticalPixelRatio

      // Patrón DPR correction para crispness sub-pixel (extraído de
      // MarkersPrimitiveRenderer L15614-L15615). En DPR=1 correction=0.5,
      // en DPR=2 correction=0, en DPR=3 correction=0.5, etc.
      const tickWidth = Math.max(1, Math.floor(hpr))
      const correction = (tickWidth % 2) / 2

      for (const b of this._data) {
        // Conversión CSS → bitmap pixels
        const x1 = Math.round(b.x1 * hpr)
        const y1 = Math.round(b.y1 * vpr)
        const x2 = Math.round(b.x2 * hpr)
        const y2 = Math.round(b.y2 * vpr)
        const left = Math.min(x1, x2)
        const top  = Math.min(y1, y2)
        const width  = Math.abs(x2 - x1)
        const height = Math.max(Math.abs(y2 - y1), 1)

        // Culling (preservado de draw L272 actual, escalado a bitmap)
        if (width < 2 * hpr) continue

        // ─── Background fill ────────────────────────────────────────────
        ctx.fillStyle = b.bg
        ctx.fillRect(left, top, width, height)

        // ─── Border dashed [4, 3] DPR-aware ──────────────────────────────
        ctx.strokeStyle = b.border
        ctx.lineWidth = tickWidth
        ctx.setLineDash([4 * hpr, 3 * hpr])
        ctx.strokeRect(
          left + correction,
          top + correction,
          Math.max(width - tickWidth, 0),
          Math.max(height - tickWidth, 0)
        )
        ctx.setLineDash([])  // reset para no contaminar siguientes shapes

        // ─── Label condicional (si cabe y showLabel global ON) ───────────
        if (this._showLabel && height > 14 * vpr) {
          ctx.font = `700 ${Math.round(9 * vpr)}px 'Montserrat', sans-serif`
          ctx.fillStyle = b.text
          ctx.globalAlpha = 0.85
          ctx.textBaseline = 'bottom'
          ctx.fillText(
            b.label,
            left + 4 * hpr,
            top + height - 2 * vpr
          )
          ctx.globalAlpha = 1  // reset
        }
      }
    })
  }
}
```

### §4.3 Justificación decisiones al carácter

- **`useBitmapCoordinateSpace`** (NO `useMediaCoordinateSpace`): crispness DPR-aware. `MarkersPrimitiveRenderer` LWC oficial lo usa para shapes con bordes definidos. KZ tienen bordes → mismo patrón.
- **`correction` extraído de LWC oficial**: bug latente en `KillzonesOverlay.js` actual L279 (`left + 0.5` hardcoded) se resuelve al carácter gratis con esta migración.
- **`lineWidth = tickWidth`**: en DPR=1 → 1px, en DPR=2 → 2px. Línea siempre visible coherente con DPR del dispositivo.
- **`width < 2 * hpr` culling**: preserva culling original L272 escalado a bitmap. Cajas degeneradas (sesión completa fuera del rango visible) se descartan.
- **`height - tickWidth` en strokeRect**: ajuste para que el borde quede DENTRO de los límites de la caja (consistente con offset `+ correction`).
- **`globalAlpha = 0.85` solo para label**: preserva semi-transparencia label original L286. Reset a 1 al final del label para no contaminar siguientes shapes.
- **Sin `ctx.save()/ctx.restore()` por shape**: patrón `MarkersPrimitiveRenderer` LWC oficial. Reasignación directa de estado entre shapes — más eficiente.
- **NO `hitTest`**: KZ NO interactivas (sin hover, sin click, sin cursor change). El primitive omite el método opcional.

---

## §5 — Reformulación `KillzonesOverlay.js` wrapper React

### §5.1 Cambios netos al carácter

| Cambio | Detalle |
|---|---|
| Eliminar `canvasRef` | sin canvas externo propio |
| Eliminar `drawRef` | sin dispatch manual de redibujado |
| Eliminar `resizeCanvas` callback | LWC gestiona canvas interno + DPR |
| Eliminar `draw` callback completo | migra al renderer del primitive |
| Eliminar useEffect montaje RO/SSC/dragRaf/wheel | LWC pipeline interno gestiona repintado automáticamente |
| Eliminar `<canvas>` JSX Capa 1 | el primitive vive dentro del canvas LWC |
| Añadir `primitiveRef` | ref al `KillzonesPrimitive` instanciado |
| Añadir useEffect mount/unmount primitive | `series.attachPrimitive(primitiveRef.current)` en mount, `detachPrimitive` en unmount |
| Reformular 3 useEffect redraw en 1 dispatch a primitive | `primitiveRef.current?.setSessions(cachedSessionsRef.current, currentTime, cfg.showLabel)` |

### §5.2 Esqueleto reformulado verbatim al carácter

```js
import { useEffect, useRef, useState } from 'react'
import { KillzonesPrimitive } from './KillzonesPrimitive'
import { getSeriesData, getRealLen } from '../lib/sessionData'

// helpers dominio (toNYHM, inSession, SESSIONS, TF_LIST, calcSessions, DEF, loadCfg)
// — PRESERVADOS íntegros desde versión actual L5-L115, posiblemente extraídos
// a lib/killzonesDomain.js en s38 PASO 1 (decisión final s38).

export default function KillzonesOverlay({ chartMap, activePair, dataReady, currentTf, tick, tfKey, currentTime }) {
  const [cfg, setCfg]             = useState(loadCfg)
  const [hovered, setHovered]     = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const panelRef                  = useRef(null)
  const primitiveRef              = useRef(null)
  const cachedSessionsRef         = useRef([])

  const tfAllowed = !currentTf || cfg.tfs[currentTf] !== false

  // ─── Persistir cfg ──────────────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch {}
  }, [cfg])

  // ─── Cerrar panel al click fuera ────────────────────────────────────────
  useEffect(() => {
    if (!showPanel) return
    const fn = e => { if (panelRef.current && !panelRef.current.contains(e.target)) setShowPanel(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [showPanel])

  // ─── Mount/unmount primitive sobre cr.series ────────────────────────────
  useEffect(() => {
    if (!activePair) return
    const cr = chartMap.current[activePair]
    if (!cr?.chart || !cr?.series) return

    const kp = new KillzonesPrimitive()
    cr.series.attachPrimitive(kp)
    primitiveRef.current = kp

    return () => {
      try { cr.series.detachPrimitive(kp) } catch {}
      primitiveRef.current = null
    }
  }, [activePair, chartMap, dataReady])

  // ─── Recalcular cache sesiones cuando datos/cfg/tick cambian ────────────
  // (preservado de versión actual L177-L198, mismo bucket 30 min)
  const ctBucket = currentTime ? Math.floor(currentTime / 1800) : 0
  useEffect(() => {
    if (!cfg.visible || !tfAllowed || !dataReady || !activePair) {
      cachedSessionsRef.current = []
      primitiveRef.current?.setSessions([], currentTime, cfg.showLabel)
      return
    }
    const allData = getSeriesData()
    const realLen = getRealLen()
    if (!allData || !realLen) {
      cachedSessionsRef.current = []
      primitiveRef.current?.setSessions([], currentTime, cfg.showLabel)
      return
    }
    const candles = allData.slice(0, realLen)
    const sessions = calcSessions(candles, cfg)
    const counts = {}
    cachedSessionsRef.current = sessions.reverse().filter(s => {
      counts[s.key] = (counts[s.key] || 0) + 1
      return counts[s.key] <= cfg.history
    }).reverse()
    primitiveRef.current?.setSessions(cachedSessionsRef.current, currentTime, cfg.showLabel)
  }, [cfg, tfAllowed, dataReady, activePair, tick, tfKey, ctBucket])

  // ─── Trigger setSessions cuando currentTime avanza (replay endpoint vivo) ─
  // Bucket 60s (preservado de versión actual L388 ctRedrawBucket)
  const ctRedrawBucket = currentTime ? Math.floor(currentTime / 60) : 0
  useEffect(() => {
    primitiveRef.current?.setSessions(cachedSessionsRef.current, currentTime, cfg.showLabel)
  }, [ctRedrawBucket, cfg.showLabel])

  // ─── UI panel (PRESERVADO íntegro L391-L502 versión actual) ─────────────
  const Toggle = (...) => (...)
  const TfChip = (...) => (...)
  return (
    <div style={{ position: 'absolute', top: 20, left: 6, pointerEvents: 'none', zIndex: 5 }}>
      {/* Sin canvas Capa 1 — el primitive vive dentro del canvas LWC */}
      <div style={{ pointerEvents: 'all', ... }} onMouseEnter={...} onMouseLeave={...}>
        <span>Killzones</span>
        {/* botones visible + cogwheel + panel toggles + chips TF — sin cambios */}
      </div>
    </div>
  )
}
```

### §5.3 Cuantitativo cambio neto al carácter

- **Antes**: 505 líneas
- **Después estimado**: ~340 líneas
- **Reducción**: -33%
- **Líneas migradas a KillzonesPrimitive.js**: ~95
- **Líneas nuevas en KillzonesPrimitive.js**: ~200-250

---

## §6 — Plan s38 implementación paso a paso

### §6.1 PASO 0 s38 — verificación bicapa baseline

1. `git status --short` → vacío esperado
2. `git rev-parse --short HEAD` → `<HASH-HANDOFF-s37>` esperado
3. `wc -l components/KillzonesOverlay.js` → 505 esperado
4. `ls -la components/KillzonesPrimitive.js` → NO existe esperado
5. Re-leer `refactor/fase-5g-killzones-primitive-design.md` (este documento) verbatim

### §6.2 PASO 1 s38 — decisión final ubicación helpers dominio

Decidir entre opciones §3.3:
- **A**: re-export desde `KillzonesOverlay.js`
- **B**: extraer a `lib/killzonesDomain.js` ← **recomendado**
- **C**: duplicar (descartado)

Si B: crear `lib/killzonesDomain.js` con `SESSIONS`, `TF_LIST`, `toNYHM`, `inSession`, `getNYOffset`, `toMinutes`, `calcSessions`. Tamaño estimado: ~80 líneas. Bicapa shell + grep para verificar imports correctos en `KillzonesOverlay.js`.

### §6.3 PASO 2 s38 — crear `components/KillzonesPrimitive.js`

1. `cat > components/KillzonesPrimitive.js << 'EOF' ... EOF` con código verbatim §2.2 + §3.2 + §4.2
2. Verificación bicapa al carácter:
   - `wc -l components/KillzonesPrimitive.js` → ~200-250 esperado
   - `grep -c "attachPrimitive\|detachPrimitive\|requestUpdate\|useBitmapCoordinateSpace\|priceToCoordinate\|timeToCoordinate" components/KillzonesPrimitive.js`
   - `grep -c "class KillzonesPrimitive\|class KillzonesPaneView\|class KillzonesRenderer" components/KillzonesPrimitive.js` → 3 esperado
3. `npm run build` local → PASS esperado (sin breakage del bundle)

### §6.4 PASO 3 s38 — reformular `components/KillzonesOverlay.js`

1. Backup mental del archivo actual (no hace falta backup en disco — git tiene baseline)
2. Edit múltiples bloques:
   - Añadir `import { KillzonesPrimitive } from './KillzonesPrimitive'`
   - Eliminar `canvasRef`, `drawRef`, `resizeCanvas` callback
   - Eliminar `draw` callback completo
   - Eliminar useEffect montaje RO/SSC/dragRaf/wheel completo
   - Añadir `primitiveRef` + useEffect mount/unmount primitive
   - Colapsar 3 useEffect redraw en lógica `setSessions`
   - Eliminar JSX `<canvas>` Capa 1
3. Verificación bicapa al carácter:
   - `wc -l components/KillzonesOverlay.js` → ~340 esperado
   - `grep -c "canvas\|ResizeObserver\|subscribeSizeChange\|drawRef\|resizeCanvas" components/KillzonesOverlay.js` → 0 esperado
   - `grep -c "attachPrimitive\|detachPrimitive\|primitiveRef\|setSessions" components/KillzonesOverlay.js` → >= 4 esperado
   - 3 invariantes fase 4 intactas (`cr.series.setData` solo en `chartRender.js`, `computePhantomsNeeded` 3× en `_SessionInner.js`, Cluster A §1.7 intocado)
4. `npm run build` local → PASS esperado

### §6.5 PASO 4 s38 — smoke local discriminante 4 paths

Server `npm run start`. Para cada path:

| Path | Trigger | Verificación esperada |
|---|---|---|
| 1 | doble-click barra título macOS | KZ permanecen en posición |
| 2 | botón verde Chrome expandir/contraer | KZ permanecen en posición (path donde s36 capturó race +637.98px) |
| 3 | drag vertical price scale | KZ permanecen en posición (path NO cubierto por subscribeVisibleLogicalRangeChange) |
| 4 | botón fullscreen simulador propio | KZ permanecen en posición (path original S33.4) |

**Verificación al carácter S33.4 desaparece estructuralmente**: KZ NO se descolocan en NINGÚN path. Si hay path donde se descolocan = bug propio implementación, NO arquitectónico.

### §6.6 PASO 5 s38 — commit + push origin/main (si smoke 4/4 PASS)

1. `git add components/KillzonesPrimitive.js components/KillzonesOverlay.js [lib/killzonesDomain.js]`
2. `git commit -m "feat(5g): migrate KillzonesOverlay to ISeriesPrimitive (closes S33.4)"`
3. Verificación bicapa pre-push: `git log --oneline -5`
4. Push solo con OK explícito Ramón
5. Verificar deploy Vercel
6. Smoke producción `simulator.algorithmicsuite.com` — repetir 4 paths del PASO 4

---

## §7 — Riesgos identificados al carácter + mitigaciones

### §7.1 Riesgos arquitectónicos

| Riesgo | Probabilidad | Severidad | Mitigación |
|---|---|---|---|
| `series.attachPrimitive(kp)` invocado antes de data ready → primitive recibe `null` sessions inicialmente | alta | baja | guard en `KillzonesPaneView._update` (sessions vacío → `_data = []`, render no-op) |
| Re-mount React dispara `attached`/`detached` múltiples veces sin orden estable | media | media | useEffect cleanup garantiza `detachPrimitive` antes de nuevo `attachPrimitive`. Si bug, añadir flag `_isAttached` para idempotencia |
| `primitiveRef.current?.setSessions(...)` llamado antes de `attached()` → `requestUpdate` aún `null` | alta | nula | `?.()` optional chaining hace no-op. LWC repintará en siguiente frame interno cuando attach termine |
| LWC 5.1.0 `attachPrimitive` no idempotente — adjuntar mismo primitive 2× | baja | media | useEffect dependency array correcto evita el caso. Si surge, añadir guard interno |

### §7.2 Riesgos visuales paridad pixel-perfect

| Riesgo | Probabilidad | Severidad | Mitigación |
|---|---|---|---|
| Estilo bordes dashed difiere visualmente vs baseline (DPR correction puede cambiar 0.5px offset percibido) | media | baja | Tunear `correction` y `lineWidth` durante smoke s38 PASO 4 hasta paridad visual |
| Labels Montserrat se renderizan diferente al multiplicar por `vpr` en font-size | media | baja | `Math.round(9 * vpr)` asegura tamaño entero. Si surge, ajustar a `9 * vpr` sin round o usar `useMediaCoordinateSpace` solo para texto |
| `globalAlpha` no se aplica correctamente entre shapes consecutivos por bug LWC interno | baja | baja | Reset explícito a 1 al final del label. Si surge, envolver label en `ctx.save()/ctx.restore()` |
| `zOrder: 'bottom'` solapa con grid del chart de manera inesperada | baja | baja | typings.d.ts verbatim "Draw below everything except the background" — KZ encima del background, debajo del resto. Verificar smoke s38 |

### §7.3 Riesgos lógicos S33.3 KZ activa endpoint vivo

| Riesgo | Probabilidad | Severidad | Mitigación |
|---|---|---|---|
| `computeActiveSession` corre dentro de `_update` invocado por cada `setSessions` → potencial recalc N veces por bucket 60s | media | baja | Loop reverso con break temprano L46-L49 §3.2 ya optimiza coste. Profile s38 si latencia perceptible |
| `getSeriesData()`/`getRealLen()` retornan stale si phantoms cambian entre setSessions calls | media | media | Wrapper React garantiza setSessions tras cambio data via `tick`/`tfKey` deps. Mismo patrón que versión actual L177-L198 |
| KZ activa NO se identifica si `SESSIONS` y `currentTime` desfasados | baja | baja | Lógica idéntica a draw L228-L232 actual. Si bug en versión actual, bug heredado |

### §7.4 Riesgos performance

| Riesgo | Probabilidad | Severidad | Mitigación |
|---|---|---|---|
| `requestUpdate` dispara repintado completo del chart en cada setSessions | media | baja | LWC interno batchea repintados por frame. Bucket 60s del wrapper limita frecuencia |
| Pre-cálculo coords en `_update` corre en cada repintado interno LWC (resize/pan/zoom) → coste N shapes × M frames | media | baja | N ≤ 20 (cfg.history default 5 × 4 sesiones). Conversión coords O(N), cheap. Profile s38 si pan/zoom se siente lag |
| `paneView._update` corre sin sessions cambiadas si LWC repinta por otra razón | alta | nula | Idempotente, cero side effect — recalcula `_data` con sessions actuales. No bug |

---

## §8 — Criterios verificación empírica S33.4 desaparece estructuralmente

### §8.1 Criterios PASS al carácter (smoke s38 PASO 4)

| # | Criterio | Método verificación |
|---|---|---|
| 1 | KZ NO descolocan en path doble-click barra título macOS | Visual inspection sesión EUR/USD M15 con KZ visibles |
| 2 | KZ NO descolocan en path botón verde Chrome expandir/contraer | Visual inspection — path que capturó +637.98px race en s36 |
| 3 | KZ NO descolocan en path drag vertical price scale | Visual inspection — path que motivó dragLoop rAF v4 (comentario L107) |
| 4 | KZ NO descolocan en path fullscreen botón simulador propio | Visual inspection — path original S33.4 |
| 5 | KZ permanecen visibles al pan/zoom horizontal | Visual inspection — LWC repinta primitive en cada `subscribeVisibleLogicalRangeChange` interno |
| 6 | KZ activa endpoint vivo crece vela-a-vela durante replay | Visual inspection — KZ ASIA/LONDON/NY actual extiende `endTime` y `high`/`low` |
| 7 | Labels ASIA/LONDON/NYAM/NYPM renderizan con paridad visual baseline | Comparación side-by-side capturas s36 vs s38 |
| 8 | Bordes dashed `[4, 3]` renderizan con paridad visual baseline | Comparación side-by-side capturas s36 vs s38 |
| 9 | 3 invariantes fase 4 intactas | Bicapa shell pre-commit |
| 10 | Bundle size local sin regresión > 5% | `npm run build` output comparado vs baseline |

### §8.2 Criterios FAIL — bloqueantes para commit

- Si cualquier path 1-4 muestra descolocación → bug propio implementación, NO arquitectónico. Diagnosticar antes de commit.
- Si paridad visual rompe (criterios 7-8) → tunear renderer hasta paridad. Calidad TradingView no negociable (CLAUDE.md §1).
- Si invariantes fase 4 rotas → revert + diagnóstico antes de commit.

### §8.3 Criterio diferido s38 — verificación caracterización empírica eje X

Smoke con instrumentación nueva (paralela a KZ-DBG-S33.4-v2 s36) NO necesaria si criterios 1-4 PASS visualmente. La caracterización empírica eje X ya se hizo en s36 — el patrón aritmético `sampleX 772.509 → 1410.489 entre RO-sync y RO-2RAF` es el ground truth. Si KZ ya NO se descolocan post-migración, la implicación al carácter es que LWC pipeline interno espera al barSpacing fresh antes de invocar `updateAllViews` del primitive. Estructuralmente esperado.

Si surge duda discriminante, instrumentación opcional sub-paso s38 PASO 4:

```js
// Dentro de KillzonesPaneView._update (debug temporal, NO commitear):
const ts = this._primitive._chart.timeScale()
const sampleX = ts.timeToCoordinate(sessions[0]?.startTime)
console.log('[KZ-PRIM-DBG] _update sampleX:', sampleX)
```

Si sampleX en `_update` siempre coincide con el valor fresh post-resize 2 RAFs → migración C resuelve estructuralmente. Si NO coincide → bug LWC o problema diseño primitive. Diagnóstico discriminante a aplicar en s38 solo si surge duda.

---

## §9 — Lecciones consolidadas al carácter

### §9.1 Lecciones aplicadas en s37

- **§14 (intuición Ramón = input técnico encriptado)** vigesimosegunda sesión consecutiva: pregunta "que hemos hecho para que quieras redctar handoff ya?" cazó error CTO de proponer pausa sin entregable tangible. Forzó avance a PASO 1 producir documento.
- **§43 (enumerar TODOS los paths antes de declarar Edit cerrado)**: aplicado al carácter en inventario disparadores L295-L390 (RO + SSC + dragRaf + wheel) — cada uno enumerado con destino claro post-migración.
- **§44 (caracterización empírica DOS veces)**: ratificado al carácter — sub-paso 17 propuse "renderer cached", sub-paso 20 leí `MarkersPrimitiveRenderer` y vi que LWC oficial crea nueva instancia. Reconocí §9.4 error propio, refiné diseño.
- **§45 (Pine Script como ground truth arquitectónico)**: aplicado al carácter — el diseño replica el modelo Pine Script box.new() → primitive `paneView.update`.
- **§46 (profundizar inventario en bytes ANTES de decidir)**: aplicado al carácter — PASO 0 cerrado completo (typings + ejemplos + inventario archivo actual) antes de redactar este documento.

### §9.2 Lecciones nuevas al carácter en s37

**Lección §47 NUEVA — entregable tangible cada sesión**.

Una sesión SIN entregable tangible (commit o archivo nuevo en disco) tiene coste oculto al carácter: re-contextualización al inicio de la siguiente sesión. Si una sesión es 100% lectura y termina sin producir documento de síntesis, los hallazgos viven en context window efímera y se re-construyen desde HANDOFF en la siguiente sesión. Mejor producir documento de diseño aunque sea para diferir implementación.

Aplicabilidad: cualquier sesión de PASO 0 / inventario / lectura — antes de cerrar, evaluar si los hallazgos justifican documento de síntesis. Si sí, redactar como parte del cierre.

**Lección §48 NUEVA — leer ejemplos LWC oficial antes que vendor fork**.

LWC oficial (`lightweight-charts.development.mjs` v5.1.0) tiene primitives oficiales documentados (`TextWatermark`, `ImageWatermark`, `SeriesMarkersPrimitive`, `UpDownMarkersPrimitive`). Vendor fork (`lightweight-charts-line-tools-*`) es una capa específica para drawings interactivas con UI handlers. Para diseñar primitive NO interactiva (KZ), referencia oficial precede vendor fork.

Aplicabilidad: cualquier extensión LWC futura — empezar por primitives oficiales del paquete `lightweight-charts`, después considerar vendor fork solo si features específicas (selección/edición/hover) lo requieren.

---

## §10 — Cierre documento + estado al cierre s37

Documento producido sobre PASO 0 inventario bytes-verbatim cerrado al carácter. Cero ambigüedad arquitectónica para implementar `KillzonesPrimitive.js` en s38.

**Entregable s37**:
- `refactor/fase-5g-killzones-primitive-design.md` (este documento)

**NO entregables s37**:
- `components/KillzonesPrimitive.js` (s38 PASO 2)
- Reformulación `components/KillzonesOverlay.js` (s38 PASO 3)
- `lib/killzonesDomain.js` opcional (s38 PASO 1 decisión final)

**Estado working tree al cierre s37 esperado**:
- `refactor/fase-5g-killzones-primitive-design.md` nuevo archivo
- Cero modificaciones a `components/`, `lib/`, `pages/`
- 3 invariantes fase 4 intactas
- Cluster A §1.7 intocado
- Producción `6abc870` intacta decimoséptima sesión consecutiva

**Próxima sesión = sesión 38**:
- PASO 0 verificación baseline
- PASO 1 decisión final ubicación helpers dominio
- PASO 2 crear `components/KillzonesPrimitive.js`
- PASO 3 reformular `components/KillzonesOverlay.js`
- PASO 4 smoke local discriminante 4 paths
- PASO 5 commit + push origin/main (si smoke PASS)

**Calidad TradingView no negociable. CLAUDE.md §1.**

— CTO
