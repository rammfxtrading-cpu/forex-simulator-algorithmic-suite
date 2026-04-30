# Core de backtesting — Análisis técnico

> Documento de diagnóstico, no de implementación.
> Lectura recomendada: 30–40 min con calma.
> Toda referencia al código apunta a `archivo:línea` para que abras y verifiques.

---

## 0. Cómo leer este documento

- **§1** es el resumen ejecutivo en lenguaje llano. Si solo lees una sección, lee esa.
- **§2** es el inventario de los 5 archivos del core. Sirve como mapa.
- **§3** es la auditoría detallada de `_SessionInner.js`. La parte densa.
- **§4** es el mapa de acoplamientos cruzados — el diagnóstico real.
- **§5** mapea cada uno de los 6 bugs conocidos a su causa probable.
- **§6** es la propuesta de refactor por fases.
- **§7** son los puntos que necesito que confirmemos juntos antes de tocar código.

---

## 1. Resumen ejecutivo

### 1.1 Diagnóstico en una frase

El core funciona porque hay **estado global compartido por convención** (variables en `window` y refs mutables que se cruzan entre dominios). No hay separación entre datos, replay, viewport, drawings y trading: todo vive en un solo componente de 3.012 líneas (`_SessionInner.js`) y se comunica por refs y por `window.__algSuite*`. Cada bug conocido sale de ese acoplamiento, no de un fallo puntual.

### 1.2 Lo que está bien

- **`replayEngine.js`** está correctamente aislado. Es la pieza más sana del core. Source of truth claro (`_currentTime`), `currentIndex` derivado, loop con `requestAnimationFrame` + acumulador fraccional (esto está bien diseñado, no es el origen del freeze). Solo expone `onTick`/`onEnd` como callbacks. Ningún acoplamiento desde dentro del engine hacia fuera.
- **`chartCoords.js`** tiene una API razonable (`toScreenCoords`, `fromScreenCoords`, `timeToLogical`). El problema no es el cómo, sino el **qué leen**: dos variables globales en `window` (`__algSuiteSeriesData`, `__algSuiteRealDataLen`).
- **`useDrawingTools.js`** y **`useCustomDrawings.js`** son hooks pequeños, con responsabilidades claras. No son el problema en sí — el problema es cómo `_SessionInner.js` los conecta y desconecta.
- Los drawings vendor (plugin LWC) **se persisten correctamente como `{points: [{point, price}]}`** vía `exportTools()`/`importTools()`. Los custom drawings (text) **también se persisten como `{time, price}`** vía `useCustomDrawings`. La regla del CLAUDE.md §4.2.4 ("drawings se persisten como timestamp+price, nunca píxeles") **se cumple en BD**. El problema está en la conversión a píxel, no en cómo se guardan.

### 1.3 Lo que está mal

1. **Estado global en `window`** como source of truth implícito:
   - `window.__algSuiteSeriesData`: array de velas + phantoms del par activo. Lo lee `chartCoords` y el `autoscaleInfoProvider` del candlestick series. Lo escribe `updateChart()` en tres ramas distintas. Si dos pares estuvieran activos a la vez, esto reventaría.
   - `window.__algSuiteRealDataLen`: longitud de las velas reales (sin phantoms). Mismo patrón.
   - `window.__algSuiteCurrentTime`: master time para sincronizar engines de distintos pares. Limpiado a mano al cambiar de sesión (`_SessionInner.js:527`).
   - `window.__chartMap`: referencia al `chartMap` ref. Usado por el `autoscaleInfoProvider` (`_SessionInner.js:858`). Si el ref se desmonta y alguien lee este global, lee referencias rotas.

2. **`pairState.current[pair]`** mezcla en una sola estructura tres dominios incompatibles:
   - **Replay**: `engine`, `ready`
   - **Trading**: `positions`, `trades`, `orders`
   - **Bookkeeping de checks por tick**: `lastSLTPIdx`, `lastLimitIdx`, `lastBreachIdx`
   - Más legacy: `ordinalToReal`, `realToOrdinal` (siempre `null` desde el commit de filtros de fin de semana — ver `_SessionInner.js:783-784`).

3. **`chartMap.current[pair]`** es similar: chart + series + viewport state (`hasLoaded`, `userScrolled`, `prevCount`) + drawings/render state (`phantom`, `_phantomsNeeded`, `priceLines`) + cleanup callbacks (`dragCleanup`, `ro`).

4. **`engine.onTick`** (definido en `_SessionInner.js:800-813`) hace **cinco cosas** en cada tick:
   1. `updateChart()` — render
   2. `checkSLTPRef.current()` — trading (cierre por SL/TP)
   3. `checkLimitOrdersRef.current()` — trading (activación de limit orders)
   4. `checkChallengeBreachRef.current()` — challenge (breach FTMO)
   5. `setCurrentTime`, `setProgress`, `window.__algSuiteCurrentTime` — estado UI + global
   
   Todo en cada tick. En M1 a `speed=500` esto se llama hasta ~500 veces por segundo (modulado por el rAF loop, pero igualmente alto).

5. **El plugin de drawings se "resetea" sin destruirse** al cambiar de par (`useDrawingTools.js:179-182`):
   ```js
   useEffect(() => {
     pluginRef.current = null
     setPluginReady(false)
   }, [activePair])
   ```
   No hay `plugin.destroy()`. El plugin viejo sigue vivo con suscripciones colgando, referenciando una `series` que puede haberse eliminado en `removePair`. Probable origen de los errores `Series not attached to tool ...` y `Object is disposed`.

6. **El TF change effect** (`_SessionInner.js:1199-1252`) toca tres dominios distintos: drawings (deselect, exportTools), render (`_phantomsNeeded`, `prevCount=0`, `updateChart(true)`, `scrollToPosition`), replay (`getAggregated`). Cualquier cambio en esa función puede mover sin querer drawings o desincronizar el viewport.

7. **Polling de drawings cada 300 ms** (`_SessionInner.js:379-390`): un `setInterval` que llama a `getSelected()` para sincronizar el state `selectedTool`. Es un fallback porque `subscribeLineToolsAfterEdit` no dispara siempre. Mientras el chart juega a velocidad máxima, este polling también se ejecuta y puede pisar el `selectedTool` con un `id` viejo justo después de un cambio de par.

### 1.4 Lo importante

Los 6 bugs de `CLAUDE.md §9` no se arreglan parcheándolos uno a uno. Son la **misma enfermedad**: el core no tiene capas. La solución es la propuesta del §6: aislar dominios.

---

## 2. Inventario de los 5 archivos del core

### 2.1 `lib/replayEngine.js` (288 líneas)

**Responsabilidad:** avanzar/retroceder en el tiempo sobre un array de velas M1, y exponer agregaciones por TF.

**API pública:**
- `load(candles, startTimestamp?)`
- `seekToTime(ts)`, `seekToProgress(fraction)`
- `play()`, `pause()`, `setSpeed(v)`, `reset()`
- `nextCandle(steps)`
- Getters: `currentTime`, `currentIndex`, `progress`, `visibleCandles`
- `getAggregated(timeframe)`
- Callbacks: `onTick`, `onEnd`

**Cosas que hace bien:**
- `_currentTime` es el único source of truth. `currentIndex` se deriva por búsqueda binaria.
- Loop con `requestAnimationFrame` + acumulador fraccional + clamp 250 ms para pestañas en background. Esto es bueno y elimina los "martillazos" de la versión anterior (ver comentario L177-198).
- Cache incremental de agregación TF (`_aggCache`) — solo recalcula los buckets nuevos desde el último tick.
- `_clearTimers` siempre cancela el `requestAnimationFrame` y limpia `setInterval` legacy.

**Lo que NO hace (y está bien que no haga):**
- No toca el chart.
- No toca drawings.
- No toca viewport.
- No conoce React.

**Veredicto:** esta es la pieza que *menos* hay que tocar. Como mucho, exponer un sistema de eventos suscribibles en lugar del callback singular `onTick`/`onEnd` (para que múltiples consumers puedan suscribirse: trading, render, telemetry...). Pero no es prioritario.

---

### 2.2 `lib/chartCoords.js` (115 líneas)

**Responsabilidad:** convertir entre `(time, price)` ↔ `(x, y)` en píxeles.

**API pública:**
- `timeToLogical(time)` — interpola un timestamp a su posición logical sobre `window.__algSuiteSeriesData`.
- `toScreenCoords(cr, time, price)` — `time/price` → `{x, y}`. Tres fallbacks en cascada.
- `fromScreenCoords(cr, x, y)` — `{x, y}` → `{time, price}`.

**Lo que está bien:**
- Las firmas son razonables.
- La cascada de fallbacks de `toScreenCoords` (LWC nativa → interpolación de visible range → logical) cubre los casos donde el `time` cae fuera de las velas reales (fin de semana, phantom, futuro).

**Lo que está mal:**
- **Lee de `window.__algSuiteSeriesData` y `window.__algSuiteRealDataLen`**. No recibe los datos por parámetro. Esto significa que la función no es testeable de forma aislada y que cualquier cambio en cómo `updateChart` escribe esos globals afecta silenciosamente todas las conversiones.
- En `fromScreenCoords` (L98-113), si `rawLogical >= realLen-1` extrapola usando el último intervalo real. **`Math.round(time)`** redondea — un drawing colocado al final del array y luego convertido a píxel + de vuelta a time, podría drift de 1 segundo. No es crítico hoy pero lo marco.
- Si `realLen` cambia entre el momento en que se dibuja un drawing y el momento en que se renderiza, el mapeo `logical → time` cambia sin avisar.

**Punto a confirmar con Ramón:** ¿alguna vez hay dos charts visibles a la vez (ej. multi-pair lado a lado)? Si sí, los globals de `window` son una bomba de tiempo: solo uno puede ser el "activo".

---

### 2.3 `components/useDrawingTools.js` (243 líneas)

**Responsabilidad:** wrapper React del plugin `lightweight-charts-line-tools-core` (TrendLine, Path, HorizontalRay, Rectangle, FibRetracement, LongShortPosition).

**API pública:**
- `pluginRef`, `pluginReady`
- `toolConfigs`, `updateToolConfig(toolKey, patch)` (persiste en `user_tool_config` de Supabase)
- `addTool(toolKey)`, `applyToTool(id, key, cfg)`, `setToolVisible(id, visible)`
- `removeSelected`, `removeAll`, `deselectAll`
- `exportTools` / `importTools` (JSON)
- `onAfterEdit/offAfterEdit`, `onDoubleClick/offDoubleClick`
- `getSelected`

**Lo que está bien:**
- `DEFAULT_CFG` y `buildOptions` están organizados por tool key, sin if/else infinitos.
- Carga config del usuario desde Supabase al montar (`user_tool_config`).
- `cfgRef` se mantiene sincronizado con `toolConfigs` para evitar stale closures en `addTool`.

**Lo que está mal:**
- **No hay teardown del plugin viejo al cambiar de par** (L179-182). Solo se hace `pluginRef.current = null`, lo cual deja el plugin anterior vivo. Si el plugin tiene listeners suscritos al chart anterior, esos listeners siguen disparándose mientras la `series` original esté viva. Si la `series` se elimina (`removePair`), aparecen `Series not attached to tool` y `Object is disposed`.
- **`initPlugin` es async** y no hay guardas contra cambios de par durante la inicialización: si cambias `EUR/USD → GBP/USD → EUR/USD` rápidamente, dos `initPlugin` pueden estar a medias y el ganador es el último que termine los `import()` dinámicos.
- El plugin se construye contra `cr.chart` y `cr.series` directamente. Si esa series es reemplazada (por ejemplo en un `setData` rebuild), el plugin sigue apuntando a la series vieja.
- **Punto a confirmar con Ramón:** ¿el plugin LWC del fork tiene método `destroy()` o `dispose()`? Si no lo tiene, hay que añadirlo en el patch o reconstruir el plugin desde cero al cambiar de par implica perder todos los drawings vivos hasta que se reimporten desde JSON. Esto importa para el refactor.

---

### 2.4 `components/useCustomDrawings.js` (62 líneas)

**Responsabilidad:** store en memoria (no en BD) de drawings que NO ofrece el plugin: `TEXT` y `RULER`.

**API pública:**
- `drawings` (state) + `drawingsRef` (espejo síncrono)
- `addDrawing(type, points, metadata)`, `updateDrawing(id, patch)`, `removeDrawing(id)`, `removeAll()`
- `toJSON()`, `fromJSON(json)`

**Lo que está bien:**
- Patrón clásico de mantener `drawingsRef` en paralelo al `state` para evitar stale closures dentro de event handlers.
- Cada drawing se guarda como `{id, type, points: [{time, price}], metadata}` — coordenadas absolutas, no píxeles. Cumple la regla del CLAUDE.md §4.2.4.

**Lo que está mal / a confirmar:**
- El hook **no persiste a Supabase**. La persistencia ocurre desde fuera, en `_SessionInner.js:saveSessionDrawings` (L278), que llama a `customDrawingsToJSON()` y lo embebe junto a los vendor drawings en el campo `data` de `session_drawings`. Esto está bien pero **es responsabilidad implícita del consumer**, no del hook.
- **`DRAWING_TYPES.RULER` está declarado pero no se usa**. Solo se crean drawings tipo `TEXT` (ver `_SessionInner.js:930`). El "ruler" se gestiona aparte, vía `RulerOverlay` y `rulerActive` state (un overlay HTML, no un drawing persistido). **Punto a confirmar con Ramón:** ¿el ruler debería ser persistido como drawing tipo `RULER`, o es intencional que sea solo visualización temporal?

---

### 2.5 `components/_SessionInner.js` (3.012 líneas)

Ver §3.

---

## 3. Auditoría de `_SessionInner.js`

> Es un único componente `SessionPage` (default export, L134) más helpers locales (`TfInputModal`, `CloseModal`, `PositionOverlay`).
> A continuación: estados, efectos y funciones agrupados por dominio.

### 3.1 Estructura macro

| Líneas | Bloque |
|---|---|
| 1–27 | imports |
| 29–33 | constantes (TF_LIST, SPEED_OPTS, ALL_PAIRS) |
| 35–97 | `chartOpts(w,h)` — opciones del chart |
| 99–108 | helpers (pip, fmtPx, calcPnl, fmtTs) |
| 110–133 | `TfInputModal` (modal flotante para input de TF por teclado) |
| 134–1856 | **`SessionPage`** — el componente |
| 1857–2589 | el JSX retornado |
| 2592–2674 | `s = {...}` styles |
| 2676–2685 | `css` global |
| 2688 | `Spin()` |
| 2690 | `StatBadge()` |
| 2700–2842 | `CloseModal` |
| 2844–3012 | `PositionOverlay` (líneas SL/TP/entry como overlay HTML) |

### 3.2 Estado del componente, agrupado por dominio

> **40+ pares de `useState`/`useRef`** en un solo componente. Esta es la magnitud del problema.

#### 3.2.1 Sesión / auth / datos (8 piezas)
- `session`, `sessionRef` (state + ref espejo) — la `sim_session` cargada de BD.
- `loading`
- `authUser`, `profile`, `authLoading`, `hasAccess` — vienen del hook `useAuth`.
- `userIdRef` — set una vez al cargar auth.
- `id` — desde `router.query`.

#### 3.2.2 Datos del chart, viewport y render (mezclados; 13 piezas)
- `chartMap` (ref) — `{[pair]: {chart, series, prevCount, ro, hasLoaded, userScrolled, isAutoSettingRange, phantom, _phantomsNeeded, dragCleanup, priceLines}}`.
- `pairState` (ref) — el monstruo: replay + trading + checks (ver §4.1).
- `mountPairRef` (ref a la función mount, definida cada render — L831).
- `activePair`, `activePairRef`, `activePairs`
- `pairTf`, `pairTfRef`
- `dataReady`
- `tfKey`, `chartTick`, `tick` — counters para forzar rerenders.
- `prevTfRef` (L1199) — para comparar TF anterior en el effect.

#### 3.2.3 Replay (10 piezas)
- `isPlaying`, `speed`, `speedRef`, `progress`
- `currentTime`, `currentTimeRef`, `currentPrice`
- `lastMadridDayRef` — para detectar cambio de día Madrid en challenges.
- Globales en `window`: `__algSuiteCurrentTime`, `__algSuiteSeriesData`, `__algSuiteRealDataLen`, `__chartMap`, `__algSuiteExportTools` (no veo dónde se setea — ver §7), `__algSuiteDebugLS`.

#### 3.2.4 Trading (15 piezas)
- `balance`, `balanceRef` — espejo síncrono porque varios callbacks lo necesitan sin stale.
- `lots`, `slPips`, `rr`
- `lastTrade` (BUY/SELL flash visual), `tick` (counter)
- `preview` (limit order pre-confirm), `ctxMenu` (menú contextual), `closeModal`, `orderModal`
- `draggingRef` (drag de SL/TP, scope antiguo del chart canvas; ahora hay drag duplicado en `PositionOverlay`).
- Refs a callbacks "siempre frescos": `closePositionRef`, `checkSLTPRef`, `checkLimitOrdersRef`, `checkChallengeBreachRef` (L197-199, 1364-1373).

#### 3.2.5 Drawings (UI + estado) (16 piezas)
- (Lo que devuelve `useDrawingTools`): `pluginRef`, `pluginReady`, `toolConfigs`, `updateToolConfig`, `applyToTool`, `setToolVisible`, `addTool`, `removeSelected`, `removeAll`, `deselectAll`, `exportTools`, `importTools`, `onAfterEdit`, `offAfterEdit`, `onDoubleClick`, `offDoubleClick`, `getSelected`.
- (Lo que devuelve `useCustomDrawings`): `drawings`, `drawingsRef`, `addDrawing`, `updateDrawing`, `removeDrawing`, `removeAllCustom`, `customDrawingsToJSON`, `customDrawingsFromJSON`.
- `activeTool`, `activeToolRef`
- `drawingCount`, `selectedTool`, `selectedToolRef`, `templates`
- `drawingTfMap`, `drawingTfMapRef`, `drawingCtxMenu`
- `longShortModal`, `activeToolKey`, `activeToolKeyRef`
- `chartConfigOpen`, `rulerActive`, `hoverCandle`
- `textInput`, `tfInput`, `selectedDrawing`, `selectedDrawingRef`
- `saveDrawingsRef`, `tfMapSaveTimerRef` (debounce save), `textPillDragRef`
- `pillPos`, `pillDragRef` (drag del pill replay).

#### 3.2.6 Challenge (8 piezas)
- `challengeStatus`, `challengeStatusRef`
- `challengeBreachFiringRef` (lock contra duplicados)
- `challengeModal`, `challengeAdvancing`, `challengeModalShownRef`
- `sessionStatus`, `evalStatus`, `challengeLocked` (derivados, calculados arriba para evitar TDZ — L231-241)

#### 3.2.7 UI (4 piezas)
- `addingPair`, `showPos`, `showTrades`, `showOrders`, `bgCanvasRef`

### 3.3 `useEffect`s — qué dispara cada uno (29 efectos)

| # | Línea | Deps | Qué hace | Dominio |
|---|---|---|---|---|
| 1 | 243 | `[selectedDrawing]` | sync `selectedDrawingRef` | drawings |
| 2 | 270–273 | `[chartConfigLoaded, chartConfig, activePair]` | `applyChartConfig` al chart | chart cfg |
| 3 | 312 | `[saveSessionDrawings]` | sync `saveDrawingsRef` | drawings |
| 4 | 315–346 | `[pluginReady, id]` | cargar drawings de Supabase + restaurar TF visibility | drawings |
| 5 | 349–396 | `[pluginReady, activePair]` | subscribe afterEdit + dblClick **+ polling 300 ms `getSelected()`** | drawings |
| 6 | 397 | `[activePair]` | sync `activePairRef` | activePair |
| 7 | 398 | `[selectedTool]` | sync `selectedToolRef` | drawings |
| 8 | 401–416 | `[dataReady, activePair]` | chart click → si no hay tool seleccionado, deselect | drawings |
| 9 | 417 | `[activeToolKey]` | sync ref | drawings |
| 10 | 418 | `[activeTool]` | sync ref | drawings |
| 11 | 419 | `[pairTf]` | sync `pairTfRef` | tf |
| 12 | 421–428 | `[drawingTfMap]` | sync ref + debounce save (400 ms) | drawings |
| 13 | 431–437 | `[pairTf, activePair, drawingTfMap, setToolVisible]` | aplicar visibilidad TF a cada drawing | drawings |
| 14 | 440–469 | `[]` | animación constellation background | UI |
| 15 | 474–480 | `[authUser, hasAccess]` | cargar templates del usuario | drawings |
| 16 | 487–517 | `[]` | listener keyboard para TF input (1, 5, 1h, …) | tf |
| 17 | 520–554 | `[id]` | cargar `sim_session` + `sim_trades` previos | session |
| 18 | 591–593 | `[session?.id, session?.challenge_type, refreshChallengeStatus]` | fetch inicial challenge status | challenge |
| 19 | 598–612 | `[currentTime, session?.challenge_type, refreshChallengeStatus]` | refresh HUD al cruzar día Madrid | challenge |
| 20 | 627–630 | `[id]` | reset modal flags | challenge |
| 21 | 632–672 | `[challengeStatus, challengeModal, id]` | abrir modal pass/fail | challenge |
| 22 | 1199–1252 | `[pairTf, activePair, updateChart, deselectAll, exportTools]` | **TF change** — recalcula phantomsNeeded, full update, scrollToPosition | mezcla |
| 23 | 1254–1269 | `[activePair, loadPair]` | cambio activePair → sync engine al masterTime, setIsPlaying, setCurrentTime | mezcla |
| 24 | 1271 | `[session, activePair, loadPair]` | `loadPair(activePair)` cuando sesión y par listos | data |
| 25 | 1364–1373 | `[]` (cada render) | refrescar `closePositionRef`, `checkSLTPRef`, `checkLimitOrdersRef`, `checkChallengeBreachRef` con la closure más reciente | trading |
| 26 | 1376–1378 | `[id]` | reset breach firing | challenge |
| 27 | 1781–1792 | `[]` | shift+click global → activate ruler | drawings |
| 28 | 1793–1827 | `[handlePlayPause, handleStep, challengeLocked]` | keyboard global (Space, ArrowRight, Esc, Delete) | mezcla |
| 29 | 1829–1839 | `[]` | **cleanup on unmount** — save drawings, save progress, pause engines, remove charts | mezcla |

### 3.4 Funciones clave

| Función | Líneas | Responsabilidad | Dominios que toca |
|---|---|---|---|
| `loadPair` | 737–828 | fetch /api/candles + filter weekend + crear engine + onTick + updateChart inicial | data, replay, render, trading (vía onTick) |
| `mountPairRef.current` | 831–1064 | crear chart LWC + series + ResizeObserver + subscribers + drag SL/TP + `loadPair()` | render, drawings, trading |
| `updateChart` | 1067–1186 | aplicar agregación TF al chart en 3 ramas (full / nueva vela / within-bucket); **escribe `window.__algSuite*`** | render, data, drawings (vía globals) |
| `engine.onTick` (anon) | 800–813 | render + trading checks + state UI + global window | TODO |
| `checkSLTP` | 1499–1524 | rango `lastSLTPIdx+1..curIdx`; cierra posiciones que tocaron SL/TP | trading |
| `checkLimitOrders` | 1526–1563 | rango similar; activa LIMIT pending → posición abierta | trading |
| `checkChallengeBreach` | 1581–1762 | calcula peor floating PnL en cada vela del rango y cierra todas las posiciones si se cruza el cap | trading + challenge |
| `closePosition` | 1317–1362 | cerrar posición (manual/SL/TP/breach), persistir trade + balance | trading |
| `saveSessionDrawings` | 278–311 | upsert de `session_drawings` (UPDATE-then-INSERT atómico por fila) | drawings |
| `mountPair` | 1065 | wrapper `useCallback` de `mountPairRef.current` | — |

### 3.5 El callback `engine.onTick` — el cuello de botella

```js
// _SessionInner.js:800-813
engine.onTick = () => {
  updateChart(pair, engine, false)              // ← render
  checkSLTPRef.current?.(pair, engine)          // ← trading
  checkLimitOrdersRef.current?.(pair, engine)   // ← trading
  checkChallengeBreachRef.current?.(pair, engine) // ← trading + challenge
  if (pair === activePairRef.current) {
    setCurrentTime(engine.currentTime)          // ← state UI
    setProgress(Math.round(engine.progress*100))// ← state UI
    if (typeof window !== 'undefined') 
      window.__algSuiteCurrentTime = engine.currentTime  // ← global
  }
}
```

A `speed=500` en M1, este callback se ejecuta una vez por **cada vela M1** que avanza, lo cual a 60 fps puede ser hasta ~8 velas/frame. Cada vela:
- Llama `updateChart` que en la rama "within-bucket" (la más común durante play) hace 1 `series.update()` + hasta 10 `series.update()` para refrescar phantoms (`_SessionInner.js:1170-1175`). Eso son hasta **11 updates de LWC por tick × 8 ticks/frame = 88 updates por frame**. Es mucho.
- Llama `setCurrentTime` y `setProgress` → React rerender del componente entero (3000 líneas de JSX) → cada hijo (`KillzonesOverlay`, `RulerOverlay`, `CustomDrawingsOverlay`, `PositionOverlay`, `ChallengeHUD`) recibe nuevas props.

Probable causa raíz del **bug #2 (freeze en M1 a velocidad máxima)**.

---

## 4. Mapa de acoplamientos cruzados

### 4.1 `pairState.current[pair]` — el contenedor mezclado

```js
{
  // dominio replay
  engine,
  ready,
  // dominio trading (estado vivo)
  positions,    // [{ id, side, entry, sl, tp, lots, ... }]
  trades,       // historial cerrado
  orders,       // limit orders pending
  // dominio "checks bookkeeping" (índices del último tick procesado)
  lastSLTPIdx,
  lastLimitIdx,
  lastBreachIdx,
  // legacy muerto
  ordinalToReal,  // siempre null desde el filtro de fines de semana
  realToOrdinal,  // siempre null
}
```

Quién lo lee/escribe: prácticamente todas las funciones del componente. No hay invariantes claros (ej. ¿qué pasa si `engine` es null pero `positions` no? ¿qué pasa si `lastSLTPIdx > engine.currentIndex` tras un seekToProgress?).

### 4.2 `chartMap.current[pair]` — segundo contenedor mezclado

```js
{
  chart, series,                      // LWC
  ro,                                 // ResizeObserver
  prevCount,                          // para detectar cuántas velas TF se añadieron
  hasLoaded, userScrolled,            // viewport state
  isAutoSettingRange,                 // flag temporal anti-bucle
  phantom, _phantomsNeeded,           // render state
  dragCleanup,                        // función para quitar listeners de mousedown/up
  priceLines,                         // LWC priceLines de limit orders
}
```

### 4.3 Globales en `window` — el bus implícito

- `window.__algSuiteSeriesData` — escrito en `updateChart` (3 ramas, L1096, L1129, L1167, L1181). Leído en `chartCoords.timeToLogical/fromScreenCoords` y en `autoscaleInfoProvider` (L854).
- `window.__algSuiteRealDataLen` — escrito junto con el anterior. Leído por `chartCoords` y `autoscaleInfoProvider`.
- `window.__algSuiteCurrentTime` — escrito en `engine.onTick`. Leído al cambiar de par (sync de engines, L1259) y al cargar par (validación masterTime, L792).
- `window.__chartMap` — referencia al `chartMap` ref. Leído en `autoscaleInfoProvider` (L858).
- `window.__algSuiteExportTools` — usado en debug log (L1138). **Punto a confirmar:** no veo dónde se setea.
- `window.__algSuiteDebugLS` — flag de debug.

### 4.4 Quién llama a quién

```
loadPair() ────────────► engine.load()
   │                        │
   │                        └──► engine.onTick (cada tick):
   │                                 ├──► updateChart() ──► window.__algSuiteSeriesData
   │                                 │                      window.__algSuiteRealDataLen
   │                                 │                      cr.series.setData/update
   │                                 ├──► checkSLTP ──► closePosition ──► supabase, setBalance
   │                                 ├──► checkLimitOrders ──► createPositionLines
   │                                 ├──► checkChallengeBreach ──► closePosition (todas), setChallengeModal
   │                                 └──► setCurrentTime, setProgress, window.__algSuiteCurrentTime
   │
TF change effect (1199) ────► deselectAll() (drawings)
                               exportTools() (drawings)
                               cr._phantomsNeeded = ...
                               updateChart(pair, engine, true) ──► window globals
                               scrollToPosition

activePair effect (1254) ─── engine.seekToTime(masterTime)
                              setIsPlaying, setCurrentTime, setProgress
                              setCurrentPrice (de getAggregated)

useDrawingTools ──── pluginRef ── plugin LWC ── chart, series  (acoplado al par actual)
                                                  │
                              activePair change ──┼──► pluginRef = null (sin destroy!)
                                                  │
useCustomDrawings ──── drawingsRef + state ───────┘
```

### 4.5 Inversiones de control problemáticas

1. El `autoscaleInfoProvider` del candlestick series **lee `window.__chartMap` y `window.__algSuiteSeriesData`** (L853-871). Esto significa que **el autoscale del chart depende de un global**. Cuando el global se vacía o queda stale (mid-render, mid-mount, mid-tick), el provider cae al fallback `computeOriginal()` y el chart se reescala según LWC default — efecto visual de "salto" del eje Y.

2. `chartCoords.toScreenCoords` lee `window.__algSuiteSeriesData` indirectamente (vía `timeToLogical`). Eso significa que las **drawings se reposicionan según un global** que cambia 60 veces por segundo durante el replay.

3. El TF change effect llama a `exportTools()` (un wrapper sobre `pluginRef.current.exportLineTools()`) para mirar los timestamps de los drawings. Pero `exportTools()` puede devolver `null` si el plugin todavía no está listo o ya fue desreferenciado. El `try/catch` lo absorbe y caemos al default 10 phantoms — los drawings cuyo `point.timestamp` cae más allá de 10 buckets en el TF nuevo se descolocan. Probable origen del **bug #1**.

---

## 5. Trazabilidad: 6 bugs conocidos → causa raíz probable

### Bug #1 — Drawings se descolocan al cambiar de TF varias veces

**Schema de `exportTools()` verificado en runtime (2026-04-27):**
```js
JSON.parse(window.__debugPlugin.exportLineTools())[0].points[0]
// → { timestamp: 1723816800, price: 1.0982249642363742 }
Object.keys(...) // → ['timestamp', 'price']
```
El código (`_SessionInner.js:1227`) lee `p.timestamp` y eso **coincide con el schema real**. La hipótesis original (campo equivocado → siempre cae al default 10) queda **descartada**.

**Hipótesis nuevas a investigar (en orden de probabilidad):**

1. **`exportTools()` devuelve `null` o lanza durante el TF change** — el bloque `try/catch` de L1216-1237 tiene el fallback `phantomsNeeded = 10`. Si el plugin está siendo recreado (cambio de par concurrente), `exportTools()` puede devolver `null` y caemos al default. Verificable: instrumentar el catch para que cuente cuántas veces falla en condiciones reales.

2. **Phantom de la vela actual con `time` duplicado** — cuando se cierra una vela TF, `agg[last].time` y `phantom[0].time` pueden coincidir si las phantoms no se regeneran a tiempo. El comentario de `_SessionInner.js:1118-1126` lo reconoce explícitamente como bug pasado y aplica un fix. Pero el fix vive solo en la rama "una vela TF nueva" (curr === prev+1). En la rama "full" (TF change) se regeneran las phantoms partiendo de `_lastT + _tfS2*(i+1)`, lo cual está bien si `_lastT` es exactamente el bucket-start del último agg. Verificable: añadir asserts.

3. **`Math.floor(c.time / tfSecs) * tfSecs` y precisión flotante** — el bucketing en `replayEngine.getAggregated` (L114, 138) usa enteros (timestamps en segundos), seguro. **No es esto.**

4. **Visible range stale tras TF change rápido** — el `_savedRange` se captura ANTES del `setData` y se restaura en un `requestAnimationFrame`. Si el usuario cambia de TF dos veces seguidas (clic-clic rápido), el rAF del primero se ejecuta DESPUÉS del setData del segundo y deja el rango aplicado a un dataset distinto. El cambio aparente: el chart parece "no scrollear" donde debería y los drawings cerca del borde caen fuera del viewport visible — el usuario lo percibe como descoloque. Verificable: cancelar el rAF pendiente cuando empieza un TF change nuevo.

5. **Polling de `getSelected()` a 300 ms re-aplica `selectedTool` con un `id` viejo tras cambio de TF** — el effect L349-396 resetea sus suscripciones al cambiar `activePair` pero el polling sigue corriendo durante el TF change. Si dispara entre setData y rAF restore, puede llamar a `applyToTool` con un id de un tool que el plugin acaba de reconstruir → desplazamiento.

6. **Acumulación de imprecisión por re-import en cada TF change** — confirmar que el plugin NO re-importa los drawings al cambiar de TF (no debería, el plugin solo necesita recalcular pixels). Si por alguna ruta sí lo hace, cada round-trip JSON puede perder precisión.

**Acción:** la fase 4 ya planeaba reconstruir el ciclo del plugin. Antes de la fase 4, durante la fase 3 (render layer), investigamos las hipótesis 1, 4 y 5 — las tres caen dentro del trabajo de aislar el render del onTick.

---

### Bug #2 — Replay se freeze en M1 a velocidad máxima (speed=500)

**Probable causa raíz:** en cada tick el `engine.onTick` dispara hasta **11 `series.update()` + 1 `setCurrentTime` + 1 `setProgress`**. Con `speed=500` y rAF a 60 fps, son hasta ~8 ticks/frame → 88 series.update + 8 setCurrentTime/frame. React rerender + el polling de selectedTool a 300 ms + el setInterval de PositionOverlay a 150 ms saturan el main thread.

Adicionalmente, cada `setCurrentTime` rerender el componente entero (3000 líneas de JSX), incluyendo `KillzonesOverlay`, `RulerOverlay`, etc., aunque sus props no hayan cambiado de forma relevante.

**Solución estructural:** desacoplar render del tick (frame budget propio), throttle de `setCurrentTime` a ~30 fps, mover los overlays a su propio canal de updates.

---

### Bug #3 — Posiciones se descolocan al hacer drag

**Probable causa raíz:** durante el drag, `PositionOverlay` actualiza `lines` localmente con `setLines` (`_SessionInner.js:2918-2923`). El `setInterval` de update de líneas (cada 150 ms, L2892) está bloqueado por `dragState.current?.active` (L2889). Pero si llega un tick del replay durante el drag → `setData` o `update` con autoscale dispara recálculo del eje Y → `priceToCoordinate(pos.sl)` cambia, pero el setLines no se reactualiza (porque el drag lo bloquea).

Al soltar (mouseup), `onDragEnd` escribe `pos.sl = newPrice`, pero el redibujo final usa `priceToCoordinate` con el nuevo eje, y el usuario percibe "salto" porque la línea se ve donde estaba ANTES del autoscale del tick.

**Punto a confirmar:** ¿el bug ocurre solo durante replay corriendo, o también con replay pausado? Esto valida la hipótesis.

---

### Bug #4 — Cambiar TF + play rompe cosas

**Probable causa raíz:** combinación de #1 y #2. El TF change effect hace:
1. `cr.prevCount = 0`
2. `updateChart(activePair, ps.engine, true)` — full setData
3. `requestAnimationFrame(() => scrollToPosition)`

Si el engine sigue ticking durante este flujo, los onTick **antes** del rAF pueden invocar `updateChart(pair, engine, false)` con `prevCount=0`, lo que cae en la rama "full" otra vez (curr !== prev). Doble setData en frames consecutivos → el `_savedRange` capturado en el primer setData se pisa, el visible range se reinicia a la default vista de 50-80 barras, y los drawings cerca del borde se "saltan" porque `__algSuiteSeriesData` cambió de longitud entre los dos setData.

---

### Bug #5 — Error `Series not attached to tool ...` al cerrar pares

**Probable causa raíz:** `removePair()` (L1772-1778) hace `chart.remove()` y borra entradas de `chartMap`/`pairState`, pero **no destruye el plugin** del par cerrado. Cuando el plugin intenta acceder a la series eliminada (por ejemplo durante un import/export pendiente o un afterEdit residual), LWC lanza este error.

Adicionalmente, `useDrawingTools` no llama a destroy del plugin al cambiar de par (L179-182), solo nullea el ref. El plugin viejo queda con suscripciones colgando.

---

### Bug #6 — Error `Object is disposed` al cambiar de sesión rápidamente

**Probable causa raíz:** Next.js puede reutilizar el componente entre rutas `/session/[id]` (no remount). El cleanup `useEffect` (L1829-1839) hace `chart.remove()` y `engine.pause()`. Pero:
- `loadPair` es async y hace `fetch /api/candles` en bucle. Si la sesión cambia mientras un fetch está pendiente, al resolver intenta crear un engine y llamar `updateChart` en un `chartMap[pair]` que pertenece a la NUEVA sesión (o que ya no existe).
- El `setTimeout(300)` dentro del effect 4 (drawings load, L331) puede ejecutarse después de un cambio de sesión.
- Las llamadas async dentro de `closePosition` (await supabase) pueden volver tras desmonte.

Cualquier acceso a `cr.series` o `cr.chart` después del `chart.remove()` lanza `Object is disposed`.

---

## 6. Propuesta de refactor por fases

> **No pongo plazos.** Cada fase la confirmamos antes de empezar.
> Cada fase aterriza en una rama propia (`refactor/fase-N-...`).
> Cada fase debe poder mergearse a `main` sola, sin romper lo demás.

> **Nota sobre el orden de fases (29 abr 2026).** El orden original de este §6 (redactado en la auditoría inicial) tenía: fase 1 data layer, fase 2 viewport, fase 3 render, fase 4 drawings, fase 5 trading, fase 6 reducir `_SessionInner.js`. Tras cerrar fase 1 en producción el 28 abr 2026 (sub-fases 1a/1b/1c, HEAD `125ad4b`) reordenamos: insertamos una **fase 2 nueva = "cerrar el data layer (lecturas)"**, y desplazamos viewport/render/drawings/trading/reducir a 3/4/5/6/7. Razón: fase 1 solo centralizó las 3 escrituras de `window.__algSuite*`; las 14 lecturas siguieron leyendo el global directo (decisión consciente de §1 del `fase-1-plan.md`). Saltar a viewport sin cerrar el círculo de data layer dejaría dos capas a medio aislar a la vez. La disciplina "una capa cada vez" del §1 del propio análisis pide cerrar data layer entera antes de tocar viewport. El coste aceptado: B2 (drawings descolocadas en Review Session) y B3 (TF reset al entrar Review) viven en viewport+drawings y siguen sin atacar hasta fase 3+ del nuevo orden.

### Fase 0 — Preparación (sin cambios funcionales)

- Crear `refactor/` (hecho).
- Documentar este análisis (hecho).
- Confirmar contigo los puntos a confirmar (§7).
- Crear rama `refactor/fase-1-data-layer` para arrancar la fase 1.

**Riesgo:** ninguno. **Tamaño:** 0 líneas tocadas.
**Estado:** ✅ cerrada.

---

### Fase 1 — Aislar la "data layer" (escrituras)

**Objetivo realmente ejecutado (28 abr 2026, HEAD `125ad4b`):**

Centralizar en un único módulo `lib/sessionData.js` el fetch+filter y las **3 escrituras** de globales `window.__algSuite*`. Las 14 lecturas se aparcaron a fase 2 (decisión consciente de `fase-1-plan.md §1`: "No reescribir las lecturas — eso es fase 2/3").

**Sub-fases ejecutadas:**

- **1a** (`6f7d829`): `fetchSessionCandles` + `filterWeekends` extraídos de `_SessionInner.js:loadPair` (L737–783) a `lib/sessionData.js`. Eliminado `ordinalToReal/realToOrdinal/ordinalCandles` (verificado 0 lecturas).
- **1b** (`0f644f8`): `setSeriesData(allData, realLen)` y `updateSeriesAt(index, candle)` en `lib/sessionData.js`. 5 escrituras en `_SessionInner.js:updateChart` delegadas a la nueva API (L1057, L1090, L1116, L1127–L1128, L1142).
- **1c** (`7c47bdb`): `setMasterTime(time)` y `clearCurrentTime()` en `lib/sessionData.js`. 3 escrituras en `_SessionInner.js` delegadas (L528, L772, L1225 — esta última línea compuesta, solo la 3ª sentencia tocada).

**Lo que NO se hizo en fase 1 (alcance fase 2):**

Las lecturas directas de `window.__algSuite*` se aparcaron a fase 2 (decisión consciente de `fase-1-plan.md §1`: "No reescribir las lecturas — eso es fase 2/3"). Al cierre de fase 1 el inventario declarado era "14 lecturas en 4 archivos" según `fase-1-plan.md §2.3`. Verificación posterior con `grep -rn` recursivo en HEAD `125ad4b` (30 abr 2026, durante preparación de fase 2) detectó que el inventario real es 13 lecturas en 4 archivos: la cifra "14" mezclaba sin querer lecturas del cluster `__algSuite*` con globales auxiliares (`__chartMap`, `__algSuiteDebugLS`, `__algSuiteExportTools`), y el archivo `components/KillzonesOverlay.js` (2 lecturas) no estaba inventariado. Alcance real detallado en Fase 2.

**Validación:** 10 pruebas manuales pasadas, >700.000 velas escaneadas sin regresiones. Detalles en `HANDOFF-pruebas-resultado.md`.

**Estado:** ✅ cerrada y deployada en producción (Vercel verde, HEAD `125ad4b`).

---

### Fase 2 — Cerrar la "data layer" (lecturas)

**Objetivo:** cerrar el círculo abierto en fase 1. Que `lib/sessionData.js` sea no solo el único módulo que **escribe** los globales `__algSuiteSeriesData`, `__algSuiteRealDataLen` y `__algSuiteCurrentTime`, sino también el único que expone **lecturas** (vía getters síncronos o equivalente). Tras fase 2, el data layer queda totalmente aislado en un único archivo.

**Decisión arquitectónica pendiente (a resolver en el plan táctico de fase 2):**

- Opción I: getters síncronos `getSeriesData()`, `getRealLen()`, `getMasterTime()` que internamente leen del global. El global se mantiene como almacén pero ningún consumer fuera de `sessionData.js` lo lee directamente.
- Opción II: store/contexto que publique los datos sin pasar por `window`. El global desaparece como source of truth.
- Decisión Ramón en `core-analysis.md §7` (auditoría original): los globales se MANTIENEN. Por tanto, la opción I es la coherente con esa decisión. La opción II es alcance posterior, si llegamos a quitar globales del todo.

**Cambios concretos (alcance):**

13 lecturas en 4 archivos (inventario verificado al carácter con grep sobre HEAD `125ad4b`, 30 abr 2026):

- `components/_SessionInner.js`: 5 lecturas
  - L568: `__algSuiteCurrentTime` (refreshChallengeStatus fallback)
  - L753: `__algSuiteCurrentTime` (validación masterTime al cargar par)
  - L815: `__algSuiteSeriesData` (autoscaleInfoProvider)
  - L816: `__algSuiteRealDataLen` (autoscaleInfoProvider)
  - L1218: `__algSuiteCurrentTime` (sync engine al cambiar par)
- `lib/chartCoords.js`: 4 lecturas
  - L9: `__algSuiteSeriesData` (timeToLogical)
  - L11: `__algSuiteRealDataLen` (timeToLogical)
  - L89: `__algSuiteSeriesData` (fromScreenCoords)
  - L96: `__algSuiteRealDataLen` (fromScreenCoords)
- `components/RulerOverlay.js`: 2 lecturas
  - L28: `__algSuiteSeriesData`
  - L30: `__algSuiteRealDataLen`
- `components/KillzonesOverlay.js`: 2 lecturas
  - L177: `__algSuiteSeriesData`
  - L178: `__algSuiteRealDataLen`

Adicionalmente, dentro del mismo alcance fase 2 (coste cero, coherencia documental):

- Actualizar 2 comentarios en `components/_SessionInner.js` que referencian la API antigua por nombre (L524, L566 — ambos mencionan `window.__algSuiteCurrentTime`) para que reflejen la API nueva tras la decisión Opción I/II.

**Fuera de alcance de fase 2:**

3 globales auxiliares (`__chartMap`, `__algSuiteDebugLS`, `__algSuiteExportTools`) catalogados como fase de limpieza separada en `HANDOFF.md §9`. NO entran en fase 2.

**Riesgo:** medio-alto. Las lecturas son consumidas en caminos críticos: `autoscaleInfoProvider` (cada frame del chart), `chartCoords` (cada drawing recalculado), `RulerOverlay` (cada hover del ratón), `KillzonesOverlay` (cada repintado de killzones), sync engine al cambiar par (`__algSuiteCurrentTime` debe estar actualizado o el par nuevo arranca en `date_from` en lugar del masterTime).

**Cómo probamos:** baselines numéricos pre/post al carácter (mismas velas, mismas longitudes, mismas conversiones time↔pixel), validación manual de los criterios "está hecho" del CLAUDE.md §4.3 que afecten al data layer (drawings al cambiar TF, sync entre pares).

**Tamaño estimado:** se calculará en el plan táctico (`fase-2-plan.md`) con desglose en sub-fases por archivo, similar a la disciplina de fase 1.

---

### Fase 3 — Aislar la "viewport layer"

**Objetivo:** un módulo `lib/chartViewport.js` que sea el ÚNICO que llame a `chart.timeScale().setVisibleLogicalRange/scrollToPosition`. Encapsula:
- Init del rango visible al cargar par.
- Restauración tras setData (TF change, full update).
- Detección de scroll del usuario (`userScrolled`).

**Cambios concretos:**
- Mover toda la gestión de `_savedRange`, `userScrolled`, `hasLoaded`, `isAutoSettingRange` de `_SessionInner.js` a `chartViewport.js`.
- `updateChart` queda más limpio: solo `setData` + `update`.

**Riesgo:** medio. Es buena posición para aislar antes de tocar drawings.

**Tamaño estimado:** ~80 líneas movidas + 150 nuevas.

**Bugs que esta fase puede atacar:** B3 (TF reset al entrar Review), posiblemente B2 (drawings descolocadas — depende de si la causa es viewport o drawings).

---

### Fase 4 — Aislar el "render layer" (updateChart) y desacoplar del onTick

**Objetivo:**
- `updateChart` se convierte en una clase/módulo `ChartRenderer` con métodos `mount(pair, candles, tf)`, `update(newCandles)`, `dispose()`.
- El `engine.onTick` ya no llama directamente a `updateChart`. En su lugar, dispara un evento que un `RenderScheduler` consume con su propio frame budget (~30 fps cap durante play).
- Drawings se redibujan en su propio canal, no atado al tick.

**Cambios concretos:**
- Extraer `updateChart` (1067-1186) y la lógica de phantoms a `lib/chartRenderer.js`.
- Crear `lib/renderScheduler.js` que throttle a 30 fps cuando `isPlaying`.
- `engine.onTick` queda reducido a: `if(active) renderScheduler.markDirty(); checks(); maybeUpdateUI()`.

**Riesgo:** alto. Esta es la fase que más probablemente desbloquee el bug #2 (freeze en M1).

**Cómo probamos:** play en M1 a speed=500 y comprobar que el frame rate se mantiene. Comparar consumo de CPU antes/después.

**Tamaño estimado:** ~250 líneas tocadas.

---

### Fase 5 — Aislar los drawings (lifecycle del plugin)

**Objetivo:**
- El plugin LWC se destruye correctamente al cambiar de par o al desmontar.
- Si el plugin del fork no tiene `destroy()`, lo añadimos vía `patch-package` (es lo que tenemos para eso).
- `useDrawingTools` recibe `chart` y `series` por parámetro y se hace cargo de su ciclo de vida; si la series cambia, reconstruye el plugin desde el JSON exportado.
- Eliminar el polling 300 ms de `getSelected()` — investigar por qué se necesitaba.

**Riesgo:** alto. Si rompemos algo aquí, los drawings desaparecen.

**Cómo probamos:** los criterios de "está hecho" del CLAUDE.md §4.3 — dibujar línea, cambiar TF 70 veces, debe quedarse exactamente en el mismo sitio.

**Tamaño estimado:** ~150 líneas + posible patch al plugin del fork.

**Bugs que esta fase puede atacar:** B2 (drawings descolocadas, si no se resolvió en fase 3), B5 (409 en `session_drawings`), B6 (plugin LWC se reinicializa varias veces).

---

### Fase 6 — Aislar el dominio "trading" del componente

**Objetivo:**
- `pairState.current[pair]` se parte en dos: `pairReplay` (engine, ready) y `pairTrading` (positions, trades, orders, lastIdxs).
- Los `checkSLTP`, `checkLimitOrders`, `checkChallengeBreach` se mueven a `lib/tradingChecks.js`.
- `closePosition`, `openPosition` también se sacan a `lib/tradingActions.js`.
- El componente `_SessionInner.js` solo orquesta y renderiza.

**Riesgo:** medio. Esta fase es mecánica, mover código a archivos.

**Tamaño estimado:** ~400 líneas movidas.

---

### Fase 7 — Reducir `_SessionInner.js`

**Objetivo:** que el componente sea solo JSX + estado UI + dispatch de acciones. Idealmente ≤700 líneas.

**Riesgo:** bajo si las fases 1-6 fueron bien. Es la cosecha.

---

## 7. Puntos a confirmar contigo — RESUELTOS (2026-04-27)

> Resueltos en sesión con Ramón. Cada decisión queda anotada para que las fases siguientes la apliquen sin re-preguntar.

1. **Plugin LWC `destroy()`/`dispose()`** — Decisión: investigar si existe en el código del plugin. Si no, parche con `patch-package` en **fase 4**. Confirmado.

2. **Schema de `exportTools()`** — **Verificado en runtime (ver §5 bug #1).** Schema real: `{timestamp, price}`. Coincide con lo que el código asume. Hipótesis original descartada; nuevas hipótesis listadas en §5 bug #1.

3. **Multi-pair simultáneo** — Decisión: NO es prioridad. Asumimos 1 chart visible. **Mantenemos los globales `window.__algSuite*` por ahora**, pero con buena higiene: un único punto de escritura por global, limpieza explícita al desmontar. La fase 1 NO tiene que eliminarlos.

4. **`RULER` en `useCustomDrawings`** — Decisión: **es código muerto**, se borra en la fase de limpieza (fase 5 o 6). El `RulerOverlay` (regla temporal estilo TradingView) se queda como está — funciona como temporal, no se persiste.

5. **`window.__algSuiteExportTools`** — Confirmado: **NUNCA se asigna** (verificado por Ramón desde consola, `undefined`). Es código muerto. El log de debug en `_SessionInner.js:1138` queda inerte. **Borrar el bloque entero** en la fase de limpieza.

6. **Polling de `getSelected()` cada 300 ms** — Decisión: investigar **dentro de la fase 4** (drawings lifecycle) antes de quitarlo. Ramón quiere entender por qué se puso. Hipótesis a verificar: `subscribeLineToolsAfterEdit` no dispara cuando la selección cambia sin edición (ej. clic en otro tool). Si confirmamos eso, sustituir polling por `subscribeLineToolsSelected` (si existe en el fork) o por un evento sintético.

7. **Drag de SL/TP duplicado** — Confirmado código muerto. `createPositionLines/removePositionLines/updatePositionLine` (L1384-1394) están vacías. El drag del canvas (`_SessionInner.js:969-1061`) tampoco hace nada útil porque depende de esas funciones. **Borrar en fase 5**, ahorra ~100 líneas.

8. **`Math.round(time)` en `chartCoords.fromScreenCoords`** — Decisión: **NO arreglar ahora**. Drift de ±1 s irrelevante en M1 (granularidad 60 s). Apuntado como tarea futura sin fase asignada.

9. **Carpetas `.backup-*`** — Decisión: **NO borrar**. Son seguro de Ramón hasta que el refactor esté en producción y validado 2-3 semanas. Ya están en `.gitignore` desde el commit `6f3e86f`, no contaminan el repo.

### Implicaciones para las fases

- **Fase 1** (data layer): NO elimina los globales, solo asegura que se escriben/limpian desde un único lugar.
- **Fase 4** (drawings): incluye investigar el polling de `getSelected()` y, si es necesario, parchear el plugin para añadir `destroy()` y/o evento de selección.
- **Fase 5/6** (limpieza): borra `RULER` muerto, `window.__algSuiteExportTools` muerto, drag SL/TP duplicado del canvas. Podemos hacerlo todo en un solo PR de limpieza.

---

## 8. Anexo: ficheros tocados durante el análisis

Ninguno. Solo se ha creado este documento (`refactor/core-analysis.md`) y la carpeta `refactor/`.

El working tree no está commiteado todavía — confirma tú si lo quieres en git o si prefieres que lo dejemos sin trackear hasta que lo leas y me digas.
