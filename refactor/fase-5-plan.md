# refactor/fase-5-plan.md — v3

> **Plan táctico de fase 5 — Drawings lifecycle (cluster B vivo, cluster A aplazado).**
> Redactado: 6 mayo 2026, sesión 19 (CTO/revisor). Versión 3 — incorpora hallazgos empíricos sesión 18 + PASO 0 ampliado al carácter sesión 19.
> v2 (commit `f2c7476`) se conserva en histórico git. v3 es la versión vigente.
> HEAD del repo al redactar v3: `f2c7476` (rama `refactor/fase-5-drawings-lifecycle`).

---

## §0 — Cambios de v2 a v3 (al frente, sin maquillaje)

> Esta sección va al frente porque define qué partes del plan v2 siguen vivas y cuáles han sido refutadas al carácter. Sin ella, el lector del plan v3 no entiende por qué algunas sub-fases desaparecen.

### §0.1 Lo que sesión 18 refutó al carácter

Sesión 18 ejecutó sub-fase 5b camino A del plan v2 con un Edit replanteado (`pluginsRef[pair]` map per-par + cleanup useEffect). El Edit pasó checkpoints 1 y 2 (caso α: drawings persisten al cambiar par) pero rompió en checkpoint 3 (cerrar par secundario → `Object is disposed` fatal). Edit revertido al carácter.

**Causa raíz al carácter** (verificada empíricamente en checkpoint 2 + confirmada al carácter en sesión 19): el modelo de datos actual mezcla drawings entre pares vía `importTools(blob)` cada vez que un plugin nuevo se inicializa con `pluginReady: false → true`. La tabla `session_drawings` guarda 1 fila por sesión sin columna `pair`. Cualquier intento de aislamiento per-par solo en la capa plugin choca con el blob compartido en BD.

### §0.2 Lo que sesión 19 verificó al carácter (cluster A completo)

Sesión 19 cerró PASO 0 ampliado leyendo al carácter en shell de Ramón el flujo completo de drawings. **4 piezas estructurales** del modelo actual confirmadas:

1. **Persistencia BD** (`_SessionInner.js` L297-L330): blob `JSON.stringify({v, c, tfMap})` único por `session_id`, sin columna `pair` en queries (UPDATE/INSERT/SELECT filtran solo por `.eq('session_id', sid)`).
2. **Carga inicial** (L335-L365): `useEffect` con deps `[pluginReady, id]`. Cada vez que `pluginReady` pasa false→true, llama `importTools(parsed.v)` con el blob entero al plugin recién inicializado.
3. **Plugin lifecycle** (`useDrawingTools.js` L178-L182 según HANDOFF 18 §3): single `pluginRef`. Destruido al cambiar `activePair` (`pluginRef.current = null` + `setPluginReady(false)`). Recreado por `initPlugin` cuando `dataReady` y `chartMap.current[activePair]` listos.
4. **Visibilidad por TF** (`_SessionInner.js` L450-L456): `drawingTfMap` global por sesión, aplicado a todos los `toolId` del plugin actual al cambiar par/TF (`setToolVisible(toolId, ...)`).

**Las 4 piezas se sostienen mutuamente.** Cambiar 1 sola pieza (lo que hizo sesión 18) choca con las otras 3. Para resolver de raíz hay que cambiar al menos 2 coordinadamente, o introducir capa de filtrado externa.

### §0.3 Separación arquitectónica cluster A / cluster B al carácter

El plan v2 trató fase 5 como un único cluster de 5 problemas. Sesión 19 ha verificado al carácter que son **2 clusters separables**:

**Cluster A — Drawings lifecycle + persistencia (REFUTADO al carácter)**:
- Problemas 1 + 5 del plan v2 §3.
- Sub-fase 5b del plan v2.
- Criterios funcionales 3 + 4 + criterio arquitectónico 7 del plan v2 §4.
- **APLAZADO** a fase futura (denominada "fase 5.A" en este plan v3) — ver §10.

**Cluster B — Handler TF + chartTick + overlays + viewport (VIVO al carácter)**:
- Problemas 2 + 3 + 4 del plan v2 §3.
- Sub-fases 5c + 5d + 5e del plan v2.
- Criterios funcionales 1 + 6 + criterios arquitectónicos 8 + 9 + 10 + criterio 11 (B2/B6) del plan v2 §4.
- **VIVO al carácter** — el descubrimiento de sesión 18 NO afecta este cluster.

Plan v3 ataca cluster B + sub-fase 5f (limpieza) + sub-fase 5g (cierre). Cluster A queda documentado al carácter como deuda mayor en §10.

### §0.4 Sub-fase 5f.3 (B5 race) — OBSOLETA al carácter

Plan v2 §5 sub-fase 5f.3 proponía investigar disparadores concurrentes de `saveSessionDrawings` para resolver B5 (`409 Conflict`). Sesión 19 verificó al carácter en `_SessionInner.js` L313-L317 que **B5 ya está resuelto en código**: patrón UPDATE-then-INSERT atómico-por-fila implementado, comentario explícito al carácter explicando que el patrón anterior (delete + insert) producía 409 cuando dos saves se solapaban.

**Sub-fase 5f.3 omitida en plan v3.** Anotada como cerrada en §3 problema 5.

### §0.5 Sub-fase 5b — DESCARTADA al carácter (movida a fase 5.A)

Plan v2 §5 sub-fase 5b (lifecycle plugin LWC al cambiar par) está descartada al carácter porque tanto camino A como camino B chocan con el cluster A intacto. Sesión 18 §1 punto 8 al carácter: *"el camino A del plan v2 no es viable. El camino B (parche al vendor) tampoco aborda el problema raíz"*.

**Sub-fase 5b movida a fase 5.A.** Los warnings que esta sub-fase pretendía cerrar (`_requestUpdate is not set`, `Series not attached to tool`, `Object is disposed` ocasional al cambiar par/sesión) **se aceptan como deuda cosmética** en plan v3 — no rompen funcionalidad real para el usuario en producción actual (verificado empíricamente: producción funciona desde 2 may 2026 con estos warnings sin quejas).

---

## §1 — Contexto y alcance

### §1.1 Por qué fase 5 (cluster B) ahora

Cluster B contiene las **deudas UX visibles al usuario**:
- Deuda 5.1 — vista no se mantiene al cambiar TF.
- Regresión Killzones — descolocadas al cambiar TF si viewport se restaura post-setData.

Estas deudas viven arquitectónicamente repartidas entre el handler de cambio de TF (1 useEffect con 6 responsabilidades sin orden documentado) y un contrato implícito `chartTick` ↔ overlays que nadie consume correctamente. Atacarlas sueltas antes ha demostrado generar parches o regresiones (lección §9.4 mayor sesión 16).

**Principio rector activo (CLAUDE.md §1):** *"dejar el core de backtesting a la calidad de TradingView (drawings) y FX Replay (replay engine). Nada más importa hasta que esto esté sólido."*

Cluster B cierra deudas que el usuario VE. Cluster A contiene ruido cosmético en consola que el usuario NO ve. Por orden de prioridad respecto al principio rector, cluster B va primero.

### §1.2 Qué resuelve plan v3 (cluster B)

| ID | Descripción | Encaje en plan v3 |
|---|---|---|
| **5.1** | UX viewport — mantener vista al cambiar TF + atajo Opt+R/Alt+R | Sub-fase 5d (handler TF rediseñado) |
| **Regresión Killzones** | Killzones se descolocan al cambiar TF si viewport se restaura post-setData | Sub-fase 5d (contrato chartTick/overlays) |
| **4.5** | `__algSuiteExportTools` no registrado | Sub-fase 5f (limpieza) |
| **4.6 (parche)** | Drawings descolocados al cambiar TF (parche `snap floor` en `2851ef7`) | Sub-fase 5e (decidir si rediseño o se queda) |
| **Polling 300ms `getSelected()`** | CLAUDE.md §7 punto 6 — investigar si suscripción al fork es viable | Sub-fase 5f.2 |

### §1.3 Qué APLAZA plan v3 a fase 5.A (cluster A)

| ID | Descripción | Documentado en |
|---|---|---|
| **Warning LWC `_requestUpdate is not set`** | Aparece al destruir tool — síntoma del cluster A | §10 |
| **`Series not attached to tool`** | Consola al cerrar pares con drawings — síntoma del cluster A | §10 |
| **`Object is disposed`** | Consola al cambiar sesión rápidamente — síntoma del cluster A | §10 |
| **Mezcla de drawings entre pares** | `importTools` mete blob entero en plugin de cualquier par activo — causa raíz cluster A | §10 |
| **Deuda nueva — pares secundarios + drawings no persisten al salir/volver** | `activePairs` añadidos in-session no se guardan en BD; al recargar solo el par original arranca | §10 (deuda nueva descubierta sesión 18) |

### §1.4 Lo que plan v3 NO hace

- **NO toca trading domain** (positions, orders, balance) — eso es fase 6.
- **NO reduce `_SessionInner.js`** a su tamaño objetivo — eso es fase 7.
- **NO migra `session_drawings`** ni cambia esquema BD — eso sería fase 5.A si Ramón lo decide.
- **NO toca lifecycle del plugin LWC** ni el flujo `importTools` ni la columna `pair` de `session_drawings` — eso sería fase 5.A.
- **NO elimina globales `window.__algSuite*`** salvo el documentado muerto (`__algSuiteExportTools`).
- **NO toca el replay engine** ni el viewport core (fases 3 y 4 cerradas — invariantes deben mantenerse intactas).

### §1.5 B5 ya cerrado al carácter

Sub-fase 5f.3 del plan v2 (B5 `409 Conflict` race en `session_drawings`) ya cerrada en código actual. Sesión 19 verificó al carácter `_SessionInner.js` L313-L317: patrón UPDATE-then-INSERT atómico-por-fila ya implementado. **B5 NO aparece en plan v3 como sub-fase pendiente.**

---

## §2 — Inventario al carácter (preservado de sesión 17 + ampliado sesión 19)

> Todo lo siguiente está verificado al carácter desde shell zsh nativa de Ramón. Inventario sesión 17 marcado **[s17]**, ampliación sesión 19 marcada **[s19]**.

### §2.1 Estado del repo al cierre sesión 18

- `origin/main` = `4c03ee6` (HANDOFF sesión 18) sobre `6f13be8` (HANDOFF 17) sobre `29d0b0f` (HANDOFF 16) sobre `1d5865d` (audit pares 2026) sobre `5cef4e7` (HANDOFF 15) **[s19]**.
- Rama feature `refactor/fase-5-drawings-lifecycle` = `f2c7476` (plan v2). Cero commits de código en sesiones 16-18 al runtime.
- Working tree limpio en main al arranque sesión 19 **[s19]**.

### §2.2 Invariantes fase 4 (deben mantenerse intactas)

Verificado al carácter sesión 19:
- `cr.series.setData` fuera de `lib/chartRender.js`: **vacío** ✅ **[s19]**
- `cr.series.update` fuera de `lib/chartRender.js`: **vacío** ✅ **[s19]**
- `computePhantomsNeeded` en `_SessionInner.js`: 3 matches L116, L1121, L1178 ✅ **[s19]**

**Cualquier commit de plan v3 debe verificar estos 3 greps al cierre.**

### §2.3 Tamaños actuales

Verificado al carácter sesión 17 + sin cambios al carácter sesión 19 (revert sesión 18 ejecutado al carácter):

| Archivo | Líneas |
|---|---|
| `lib/chartViewport.js` | 202 |
| `components/_SessionInner.js` | 2962 |
| `components/useDrawingTools.js` | 243 |
| `components/useCustomDrawings.js` | 62 |

### §2.4 Cluster A — modelo del flujo de datos al carácter [s19]

> Inventario completo del cluster A NO porque plan v3 lo ataque, sino porque plan v3 lo APLAZA a fase 5.A. Documentar el modelo al carácter ahora evita que sesiones futuras tengan que repetir el descubrimiento de sesiones 18+19.

#### §2.4.1 Persistencia BD (`_SessionInner.js` L297-L330) [s19]

`saveSessionDrawings` callback construye blob `JSON.stringify({v: vendorJson, c: customJson, tfMap})`:
- `v` = output de `exportTools()` — drawings vendor del plugin LWC vivo en ese momento.
- `c` = drawings custom TEXT/RULER (de `useCustomDrawings`).
- `tfMap` = mapa visibilidad por TF (`drawingTfMapRef.current`).

Patrón persistencia: UPDATE primero por `.eq('session_id', sid)` → si UPDATE no afectó filas, INSERT con catch que absorbe carrera entre tabs. **Cero filtro por par. Cero columna `pair` en queries.**

#### §2.4.2 Carga inicial (`_SessionInner.js` L335-L365) [s19]

`useEffect` con deps `[pluginReady, id]`. Guard: si `!pluginReady || !id || !userIdRef.current` → return. SELECT del blob por `session_id = id`. Parsea blob → si tiene `.v` → llama `importTools(parsed.v)` con blob entero. Restaura `tfMap` con `setTimeout(300ms)` aplicando visibilidad al TF activo del par activo en ese momento.

**Reactivación crítica al carácter**: cada vez que `pluginReady` pasa false→true (lo que ocurre al cambiar `activePair`), este useEffect ejecuta de nuevo y reimporta el blob entero al plugin recién inicializado. Esto es la causa al carácter del log `Imported 1 line tools` que vio sesión 18 en checkpoint 2 al añadir par secundario.

#### §2.4.3 Plugin lifecycle (`useDrawingTools.js`) [s17 + s18]

- `pluginRef` single (no map per-par). Verificado al carácter sesión 17.
- `initPlugin` (cuerpo): 6 dynamic imports → `createLineToolsPlugin(cr.chart, cr.series)` → register 6 tipos de tool → `pluginRef.current = plugin` + `setPluginReady(true)`.
- Teardown actual L178-L182 según HANDOFF 18 §3: `useEffect` con dep `[activePair]` solo hace `pluginRef.current = null` + `setPluginReady(false)`. **NO destruye el plugin viejo** — queda vivo en memoria con listeners enchufados al chart anterior.
- API expuesta (12 métodos): `addTool`, `removeSelected`, `removeAll`, `deselectAll`, `exportTools`, `importTools`, `onAfterEdit/offAfterEdit`, `onDoubleClick/offDoubleClick`, `getSelected`, `applyToTool`, `setToolVisible`, `updateToolConfig`. Todas envuelven `pluginRef.current?.<método>`.

#### §2.4.4 Visibilidad por TF (`_SessionInner.js` L450-L456) [s19]

`useEffect` con deps `[pairTf, activePair, drawingTfMap, setToolVisible]`. Itera `drawingTfMap` (que es global por sesión, no per-par) y llama `setToolVisible(toolId, tfs.includes(tf))` para cada tool. Aplica visibilidad sobre todos los toolIds del plugin actual cada vez que cambia par/TF.

**Implicación al carácter**: si plugin del par 2 contiene tools del par 1 (vía `importTools` reactivado), este useEffect aplica visibilidad TF de tools del par 1 sobre el plugin del par 2 sin discriminar.

#### §2.4.5 Bucle de persistencia confirmado al carácter [s19]

`afterEditHandler` (`_SessionInner.js` L370-L391): cada edit dispara `saveDrawingsRef.current()` al final del handler. Esto significa al carácter que cada edición de drawing en cualquier par exporta `pluginRef.current.exportTools()` y guarda blob mezclado a BD. **El blob está en deriva de mezcla creciente** cada vez que se edita algo en un par cuyo plugin recibió el blob de otro par.

#### §2.4.6 Cadena causal completa del flujo `Imported 1 line tools` [s19]

Al añadir par secundario:

1. Usuario añade par → `setActivePair(par2)`.
2. `useEffect L1211` dispara `loadPair(par2)` (carga datos del par 2).
3. `useEffect L416` actualiza `activePairRef.current = par2`.
4. `useEffect destructivo en useDrawingTools.js L178-L182`: `pluginRef.current = null` + `setPluginReady(false)`. **`pluginReady: true → false`**.
5. `useEffect L290-L292` (chartConfigLoaded): aplica config visual a par2.
6. `initPlugin` ejecuta cuando `dataReady` + `chartMap.current[par2]` listos → al final `pluginRef.current = pluginNew` + `setPluginReady(true)`. **`pluginReady: false → true`**.
7. **`useEffect L335-L365` reactivado por `pluginReady: false → true`**: SELECT del blob → `importTools(parsed.v)` mete drawings del par 1 (que estaban en BD) en plugin del par 2. **Aquí aparece el log `Imported 1 line tools` que vio sesión 18 al carácter.**
8. `useEffect L420-L435`: re-suscribe handler de click sobre chart par 2.
9. `useEffect L?-L415`: re-monta `afterEditHandler` + `dblClickHandler` + polling 300ms sobre nuevo plugin.
10. `useEffect L450-L456`: aplica visibilidad TF de todos los toolIds (incluidos los del par 1 ahora cargados en par 2).

### §2.5 Cluster B — Handler de cambio de TF (`_SessionInner.js` L1154-L1192) [s17]

Nodo crítico de coordinación. 1 useEffect con 6 responsabilidades sin orden documentado:

1. Obtener `ps` (pairState) y `cr` (chart record). Salir si falta alguno.
2. **Deselect drawings** (`deselectAll()`) — para evitar contraerse del LongShortPosition durante setData.
3. **Calcular phantoms necesarios** — lee `exportTools()`, parsea, llama `computePhantomsNeeded`. Fallback a 10 si falla.
4. **Forzar setData** — `cr._phantomsNeeded = phantomsNeeded; cr.prevCount = 0; updateChart(activePair, ps.engine, true)`.
5. **Incrementar `tfKey`** — `setTfKey(k => k+1)` (re-render de hooks dependientes).
6. **Scroll a tail + tick** — `scrollToTail(cr, 8, () => setChartTick(t => t+1))`.

**Problema arquitectónico vivo**: orden frágil, no documentado. Cualquier modificación (deuda 5.1 sesión 16) puede romper el timing de overlays externos sin previo aviso.

### §2.6 Cluster B — Disparadores de `chartTick` [s17]

`chartTick = useState(0)` declarado en `_SessionInner.js:237`. **2 disparadores verificados al carácter**:

- **Disparador A (automático, L888-L892)**: dentro de `subscribeVisibleLogicalRangeChange` registrado al montar cada par. Se dispara cada cambio de rango visible (zoom, pan, scroll, cambios programáticos).
- **Disparador B (manual, L1189)**: dentro del callback de `scrollToTail`, al final del handler de cambio de TF.

**Contrato implícito**: *"si cambia el viewport — sea por interacción del usuario o por código — `chartTick` se incrementa".* No documentado en código. No respetado por todos los overlays. El fix 5.1 de sesión 16 disparaba `setChartTick` fuera del rAF → Killzones leían viewport intermedio.

### §2.7 Cluster B — Mapa de overlays sensibles al viewport [s17]

**4 overlays totales**, cada uno con mecanismo distinto de reactividad al viewport:

| Overlay | Ubicación | Firma | Recibe `chartTick`? | Reactividad real |
|---|---|---|---|---|
| `KillzonesOverlay` | archivo propio | `{chartMap, activePair, dataReady, currentTf, tick, currentTime}` | Sí (L1865) pero **NO lo destructura** → ignorado | `tick` + suscripción interna LWC (presumible) |
| `RulerOverlay` | archivo propio | `{active, onDeactivate, chartMap, activePair}` | No | Suscripción interna LWC (presumible) |
| `CustomDrawingsOverlay` | archivo propio | `{drawings, chartMap, activePair, tfKey}` | No | `tfKey` + suscripción `subscribeVisibleLogicalRangeChange` (verificado al carácter) |
| `PositionOverlay` | helper local en `_SessionInner.js` L2796 | `{positions, pendingOrders, chartMap, activePair, dataReady, onClosePos, onCancelOrder, onDragEnd}` | No | Por verificar al carácter en sub-fase 5d.1 |

**Hallazgo crítico**: ninguno de los 4 overlays consume `chartTick` directamente. Cada uno improvisó su propio mecanismo. **Causa raíz arquitectónica de la regresión Killzones de sesión 16** — el fix esperaba que un canal funcionara que en realidad no estaba conectado.

### §2.8 Polling 300ms `getSelected()` localizado al carácter [s19]

CLAUDE.md §7 punto 6 mencionaba polling 300ms sin localización exacta. Sesión 19 verificó al carácter: **vive en `_SessionInner.js` L397-L408** dentro del useEffect `[pluginReady, activePair]` (mismo useEffect que monta `onAfterEdit` + `onDoubleClick`). Es un `setInterval(()=>{...}, 300)` que llama `getSelected()` y sincroniza `selectedTool`/`activeToolKey`.

Sub-fase 5f.2 (sesión 24 según calendario v3) investigará si `subscribeLineToolsAfterEdit` cubre cambios de selección sin edición — si sí, sustituible por evento sintético o suscripción al fork.

### §2.9 Plugin LWC vendor (preservado de sesión 17) [s17]

Estructura del archivo `vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js`:
- 8737 líneas, NO minificado.
- Clase `LineToolsCorePlugin` (plugin global) en L2929.
- Factory `createLineToolsPlugin(chart, series)` en L8681.
- Cleanup más completo: `removeAllLineTools()` (L3127). Cadena interna confirmada al carácter sesión 18: `removeAllLineTools → removeLineToolsById → detachTool + tool.destroy()` (una capa más profunda que lo estimado en plan v2 §2.5.3).

**Plan v3 NO usa esta información**. Queda preservada para fase 5.A futura.

### §2.10 Componentes secundarios [s17]

- **DrawingToolbar** (`components/DrawingToolbar.js`): UI de selección de tool, no toca lifecycle.
- **CustomDrawingsOverlay** dibuja TEXT (vía DOM) y RULER (vía canvas). El RULER del overlay y el `RulerOverlay` independiente son cosas distintas.

---

## §3 — Diagnóstico arquitectónico

### Problemas vivos en plan v3 (cluster B)

#### Problema 2 — Handler de cambio de TF acoplado en exceso

6 responsabilidades en un único `useEffect` sin orden documentado. Cualquier cambio rompe el timing de algo. La regresión Killzones de sesión 16 es prueba.

**Severidad**: alta. Bloquea futuras intervenciones (incluida la deuda 5.1 que sigue abierta).

**Ruta de cierre**: sub-fase 5c.

#### Problema 3 — Contrato `chartTick` ↔ overlays roto

- Contrato implícito ("chartTick se incrementa cuando cambia el viewport") existe pero no documentado y no especifica timing.
- Ningún overlay lo consume:
  - KillzonesOverlay: recibe `chartTick` pero NO lo destructura → ignorado.
  - RulerOverlay: solo suscripción interna.
  - CustomDrawingsOverlay: `tfKey` + suscripción interna.
  - PositionOverlay: por verificar.
- Disparar `setChartTick` no notifica a nadie efectivamente. Equivalente a NOOP para los overlays.

**Severidad**: alta. Causa raíz arquitectónica de la regresión Killzones de sesión 16. Bloquea la deuda 5.1.

**Ruta de cierre**: sub-fase 5d. Rediseño del contrato + adopción explícita por los 4 overlays.

#### Problema 4 — Drawings descolocados al cambiar TF (parche 4.6 vivo)

Parche `2851ef7` (snap timestamp al floor en `interpolateLogicalIndexFromTime` del plugin LWC vendor) funciona pero es local al plugin. Si el rediseño cluster B cambia coordenadas o flujo, este parche puede sobrar o requerir adaptación.

**Severidad**: media. No bloqueante.

**Ruta de cierre**: sub-fase 5e.

#### Problema 5 — Persistencia con race condition (B5) — **CERRADO al carácter**

`POST /session_drawings 409 Conflict` ya resuelto en código actual (`_SessionInner.js` L313-L317). Patrón UPDATE-then-INSERT atómico-por-fila implementado. **Cero acción requerida en plan v3.**

### Problemas APLAZADOS a fase 5.A (cluster A)

#### Problema 1 — Plugin LWC no se destruye al cambiar par + drawings mezclados entre pares

**Síntoma observable**:
- Errores `Series not attached to tool` y `Object is disposed` en consola al cerrar pares con drawings o cambiar sesiones rápidamente.
- Drawings de un par aparecen en plugin de otro par tras añadir par secundario o cambiar par activo (verificado al carácter sesión 18 checkpoint 2).
- `activePairs` añadidos in-session no persisten al recargar página (verificado al carácter sesión 18, deuda nueva).

**Causa raíz al carácter** (sesión 18 + 19): modelo de datos `session_drawings` blob único por sesión + `importTools(blob)` reactivado por `pluginReady: false→true` + `pluginRef` single + `drawingTfMap` global por sesión. Las 4 piezas se sostienen mutuamente.

**Severidad runtime real**: baja (verificado empíricamente: producción funciona desde 2 may 2026 sin quejas con estos warnings).

**Severidad arquitectónica**: alta (es deuda mayor pendiente de resolución estructural).

**Ruta de cierre**: fase 5.A futura. Decisión Ramón (post-fase-6 o post-fase-7) entre 3 caminos documentados en §10.

---

## §4 — Objetivo de plan v3 — criterios "está hecho"

Plan v3 está cerrado cuando se cumplen TODOS estos criterios sin excepción.

### Criterios funcionales (CLAUDE.md §4.3, subset cluster B)

1. Dibujo una línea, cambio de TF 70 veces seguidas, la línea se queda anclada al timestamp de la vela existente más cercana al original (regla `floor`, equivalente TradingView). **No se mueve ni un pixel respecto a esa vela.**
2. Cambio par durante un replay. Vuelvo al par anterior. Drawings exactamente como los dejé (caso α verificado al carácter sesión 18 — ya cumplido en estado actual).
3. Recargo la página. Drawings persistidos exactamente como estaban (cumplido en estado actual para el par primario; pares secundarios añadidos in-session NO persisten — esto es deuda cluster A documentada en §10).

### Criterios funcionales APLAZADOS a fase 5.A (cluster A)

- Cierro un par mientras hay drawings activos. Cero errores en consola.
- Cambio sesión rápidamente (3 sesiones en <2 segundos). Cero errores en consola.
- Borro un drawing. Cero warnings `_requestUpdate is not set`.

### Criterios arquitectónicos (subset cluster B)

4. **Handler de cambio de TF documentado y testeable.** Las 6 responsabilidades actuales separadas en funciones nombradas, con orden explícito.
5. **Contrato `chartTick` ↔ overlays explícito.** Documentado quién dispara, quién observa, cuándo. Los 4 overlays adaptados.
6. **Deuda 5.1 cerrable.** El rediseño del cluster B debe permitir que mantener vista al cambiar TF sea una operación de 1-3 líneas, no una intervención frágil.
7. **B2 (drawings descolocadas en Review) y B6 (plugin reinicializado) cerrados** o explícitamente documentados como no aplicables tras el refactor cluster B.

### Criterios arquitectónicos APLAZADOS a fase 5.A

- Plugin LWC tiene teardown explícito al cambiar par.
- `session_drawings` modelo de datos resuelto (separación per-par o aceptación documentada de blob compartido).

### Criterios de estabilidad

8. Smoke local de Killzones tras cada sub-fase: rectángulos bien colocados al cambiar TF en zona pasada.
9. Smoke producción al cierre de fase 5 (cluster B): las 4 deudas cluster B listadas en §1.2 verificadas como resueltas.
10. Invariantes fase 4 (los 3 greps de §2.2) mantenidas intactas en cada commit.

---

## §5 — Sub-fases propuestas

Plan v3 se reparte en sub-fases atomizables, cada una commit propio en rama feature `refactor/fase-5-drawings-lifecycle`. Merge a `main` se hace solo al cerrar el plan v3 completo con smoke producción OK.

### Sub-fase 5c — Descomposición del handler de cambio de TF

**Objetivo**: las 6 responsabilidades del handler (§2.5) extraídas a funciones nombradas con orden explícito documentado.

**Scope**:
- `components/_SessionInner.js` L1154-L1192: refactor del `useEffect`.
- Crear funciones nombradas para cada paso. Decisión sobre ubicación (helpers locales en `_SessionInner.js` o módulo nuevo `lib/tfTransition.js`) al inicio de la sub-fase, basada en tamaño real del refactor.
- Cero cambios funcionales en este commit — solo extracción y documentación. Comportamiento idéntico al actual.

**Riesgo**: medio-alto. Nodo de coordinación frágil. Mitigación: cero cambios de comportamiento, solo restructuración. Smoke local exhaustivo (cambio TF × todas las combinaciones M1↔M3↔M5↔M15↔M30↔H1↔H4↔D1).

**Tamaño estimado**: ~80 líneas movidas, ~50 nuevas (orquestador + comentarios).

**Cobertura**: Problema 2 (§3). Habilita 5d.

**Pre-arranque al carácter en sesión que ataque 5c**:
- Confirmar al carácter `wc -l components/_SessionInner.js` = 2962 antes de empezar.
- Releer al carácter L1154-L1192 desde shell.
- Decidir helpers locales vs `lib/tfTransition.js` antes del primer Edit.

### Sub-fase 5d — Contrato `chartTick` ↔ overlays + cierre deuda 5.1

**Objetivo**: definir contrato explícito entre handler de TF, `chartTick`, y overlays HTML. Cerrar deuda 5.1 (mantener vista al cambiar TF) como aplicación natural del contrato.

#### Sub-pasos

**5d.1 — Inventario al carácter de overlays**:
- Verificar al carácter cómo cada uno de los 4 overlays reacciona al viewport hoy.
- Para `RulerOverlay`, `CustomDrawingsOverlay` y `PositionOverlay`: leer `useEffect` que se suscribe a `subscribeVisibleLogicalRangeChange` (si existe) y confirmar comportamiento.
- Para `KillzonesOverlay`: confirmar al carácter que `tick` (NO `chartTick`) es el canal que lo redibuja.

**5d.2 — Definir contrato v1 propuesto**:
- Un único canal de notificación: `chartTick`.
- Disparado SIEMPRE dentro del rAF posterior a la operación que altera viewport.
- Overlays observan `chartTick` explícitamente vía destructuring + `useEffect` con dependencia `[chartTick]`.
- Documentado en `_SessionInner.js` con comentario de bloque arriba del `chartTick` state.

**5d.3 — Adoptar contrato en KillzonesOverlay**:
- Destructurar `chartTick`.
- Añadir `useEffect([chartTick, ...])` que recalcule sesiones / fuerce redraw.
- Smoke local: cambio TF en zona pasada → Killzones bien colocadas (test crítico de regresión sesión 16).

**5d.4 — Adoptar contrato en RulerOverlay**:
- Pasar `chartTick` desde `_SessionInner.js`.
- Adaptar lógica interna.

**5d.5 — Adoptar contrato en CustomDrawingsOverlay**:
- Reemplazar dependencia de `tfKey` por `chartTick` (o documentar por qué se mantiene `tfKey` si el caso lo justifica).

**5d.6 — Adoptar contrato en PositionOverlay**:
- Pasar `chartTick` desde `_SessionInner.js`.
- Adaptar render de SL/TP/entrada.

**5d.7 — Cierre deuda 5.1 (UX viewport)**:
- Reaplicar las 3 funciones de `chartViewport.js` diseñadas en sesión 16 (`captureSavedTimeRange`, `restoreSavedTimeRange`, `resetViewportToDefault`).
- Integrar en handler de TF descompuesto (5c).
- `setChartTick` se dispara dentro del rAF posterior al `restoreSavedTimeRange`.
- Smoke local de los 4 tests de sesión 16 (cambio TF rango pasado, cambio durante play, cambio extremo, cambio en phantoms).

**5d.8 — Atajo Opt+R / Alt+R (sub-Op D pendiente de sesión 16)**:
- Implementar el atajo que llama `resetViewportToDefault`.
- Smoke local: tras cambio de TF, Opt+R devuelve viewport al final del chart.

**Riesgo**: alto. Cambia el contrato de varios consumers a la vez. Mitigación: cada sub-paso es commit propio. Smoke local de cada overlay tras cada sub-paso.

**Tamaño estimado**: ~30 líneas en `chartViewport.js` (3 funciones nuevas), ~20 en `_SessionInner.js`, ~10-15 en cada overlay → total ~100 líneas.

**Cobertura**: Problema 3 (§3) + deuda 5.1 + regresión Killzones de sesión 16.

### Sub-fase 5e — Decisión sobre parche 4.6

**Objetivo**: decidir si el parche `snap timestamp al floor` en plugin LWC vendor (commit `2851ef7`) sigue siendo necesario tras 5c/5d, o si el rediseño cluster B lo hace redundante.

**Procedimiento**:
1. Reproducir caso original (M5 → M15 con LongShortPosition en timestamp intermedio) **con el parche activo** (estado actual). Confirmar que funciona.
2. Revertir el parche en una rama experimental local. Reproducir el caso. Si vuelve el bug → parche sigue siendo necesario.
3. Decisión:
   - Si sigue siendo necesario: mantener tal cual. Cerrar 5e con commit de no-acción + nota.
   - Si ya no es necesario: revertir el parche en commit aparte con justificación documentada.
   - Si el rediseño de 5c/5d permite arreglarlo más arriba: rediseño limpio, parche borrado.

**Nota al carácter**: el parche 4.6 es de la capa vendor del plugin LWC, parte del cluster A en sentido amplio. Pero es local y no toca el modelo de datos `session_drawings`. Se mantiene en plan v3 porque es decisión que se beneficia de tener cluster B cerrado primero.

**Riesgo**: medio. Mitigación: cualquier cambio aquí pasa por smoke producción de la matriz completa de TFs (3x3 transiciones) con 6 tipos de drawings.

**Tamaño estimado**: desconocido — depende del resultado del análisis.

**Cobertura**: Problema 4 (§3). Limpia el parche en `vendor/` si es seguro.

### Sub-fase 5f — Limpieza

**Objetivo**: absorber deudas chicas que viven en este dominio.

#### Sub-pasos

**5f.1 — Deuda 4.5**: borrar `__algSuiteExportTools` del bloque debug. Localización al carácter pendiente al inicio de sub-fase 5f en sesión que la ataque (mencionado en `core-analysis.md §7 punto 5` como ~L1138).

**5f.2 — Polling 300ms `getSelected()`**: investigar si `subscribeLineToolsAfterEdit` (suscripción al fork) cubre cambios de selección sin edición. Si sí, sustituir por evento sintético o suscripción al fork. Localización al carácter ya verificada sesión 19: `_SessionInner.js` L397-L408.

**5f.3 — B5 (409 Conflict)**: **OMITIDA al carácter — ya cerrada en código** (ver §0.4 y §1.5).

**Riesgo**: bajo cada elemento por separado. Commit por elemento.

**Tamaño estimado**: ~20-50 líneas netas borradas.

**Cobertura**: Problemas 4 (parcial) y deuda 4.5.

### Sub-fase 5g — Cierre plan v3

**Objetivo**: smoke producción + HANDOFF + merge a `main`.

**Scope**:
- Smoke producción exhaustivo (los 10 criterios cluster B de §4).
- Si todo verde: merge fast-forward de `refactor/fase-5-drawings-lifecycle` a `main`.
- Si algo rojo: documentar en HANDOFF, decisión Ramón sobre continuar o aparcar.
- HANDOFF de cierre de fase 5 (cluster B).
- **NO** se cierra cluster A — eso es fase 5.A futura.

---

## §6 — Riesgos y mitigaciones

### Riesgo 1 — Romper Killzones (otra vez) durante 5d

**Mitigación**: smoke local de Killzones es **test crítico obligatorio** tras CADA sub-paso de 5c y 5d. Cada sub-paso de 5d es commit propio. Lección de sesión 16 grabada al carácter.

### Riesgo 2 — Sub-fase 5c rompe el orden frágil del handler TF

**Mitigación**: cero cambios funcionales en commit 5c — solo extracción y documentación. Smoke local exhaustivo de cambio TF × 8 TFs × 6 tipos de drawings antes de commit.

### Riesgo 3 — Sub-fase 5e (parche 4.6) introduce regresión

**Mitigación**: cualquier cambio en el parche pasa por matriz completa de smoke (3 TFs × 6 tools × 2 direcciones). Si dudas, mantener parche y documentar como deuda futura.

### Riesgo 4 — Tamaño de cluster B supera capacidad de sesiones

**Mitigación**: cada sub-fase es commit atómico mergeable a su rama feature. Si cluster B tarda 6 sesiones en lugar de 4, no pasa nada — la rama feature aguanta. Solo se mergea a main al cierre completo del cluster B.

### Riesgo 5 — Errores §9.4 del CTO durante implementación

**Mitigación**: disciplina bicapa estricta. Verificación al carácter desde shell de Ramón en cada predicción de tamaño. No comitear sin `wc -l` previo. Si CTO recomienda atacar deuda fuera de orden, releer principio rector.

### Riesgo 6 — Petición fuera de orden durante cluster B

**Mitigación**: si Ramón pide atacar deuda UX no asignada a sub-fase actual (ejemplo: deuda cluster A), CTO advierte una vez con razón clara. Si Ramón insiste tras advertencia, ejecuta y documenta como excepción. NO inventar urgencia operativa para justificar desvío.

### Riesgo 7 — Cluster A se vuelve bloqueante durante implementación cluster B

Es posible que durante implementación de 5c/5d/5e emerjan síntomas del cluster A que parezcan bloqueantes (ejemplo: smoke local de cluster B falla porque drawings mezclados confunden al test).

**Mitigación**: si esto ocurre al carácter, PARAR. Documentar el síntoma exacto. Decidir con Ramón si:
- (a) el síntoma es realmente del cluster A y el smoke se puede adaptar para no depender de la pieza contaminada; o
- (b) el síntoma indica que cluster A es más bloqueante de lo previsto y el plan v3 debe revisarse → decisión Ramón sobre acelerar fase 5.A.

---

## §7 — Lista de NO HACER en plan v3

> Cosas tentadoras que rompen el alcance. Si CTO o Claude Code se ven haciéndolas, **PARAR**.

1. **NO** tocar trading domain (positions, orders, balance, checkSLTP, etc.). Eso es fase 6.
2. **NO** reducir `_SessionInner.js` por debajo de su tamaño funcional necesario. Reducción final es fase 7.
3. **NO** eliminar globales `window.__algSuite*` salvo el documentado muerto (`__algSuiteExportTools`).
4. **NO** introducir tests automáticos. Decisión Ramón en CLAUDE.md §5.4.
5. **NO** instalar dependencias nuevas (regla absoluta CLAUDE.md §3.4).
6. **NO** hacer migraciones de Supabase ni cambios de esquema (regla absoluta CLAUDE.md §3.1). La tabla `session_drawings` se queda EXACTAMENTE como está. Tocarla es fase 5.A.
7. **NO** atacar el lifecycle del plugin LWC (`useDrawingTools.js` L178-L182), el flujo `importTools`, el polling de `pluginReady`, ni el bloque de carga inicial L335-L365. Eso es **cluster A → fase 5.A**.
8. **NO** mergear a `main` durante el plan. Solo commits en `refactor/fase-5-drawings-lifecycle`.
9. **NO** hacer push de la rama feature antes del cierre del plan salvo OK explícito Ramón.
10. **NO** atacar deudas UX que no estén en §1.2 bajo justificación de "scope acotado, encajemos".
11. **NO** comitear si los 3 greps de invariantes fase 4 (§2.2) fallan.
12. **NO** documentar/comentar código que ya funciona "porque ya estoy aquí". Solo cambios funcionales necesarios.
13. **NO** "aprovechar que estoy en `_SessionInner.js`" para tocar nada del cluster A. Si un Edit del cluster B accidentalmente pasa cerca de las L297-L365 o las L450-L456, NO modificar esas líneas.

---

## §8 — Estimación temporal y secuencia de sesiones

> Estimaciones aproximadas. Sesiones 16 y anteriores muestran subestimación recurrente del 30-50% — añadir margen.

| Sesión | Sub-fase | Tipo | Tiempo estimado |
|---|---|---|---|
| 17 | PASO 0 + plan v1 + plan v2 + inventario al carácter | Planificación | ~5-6h (cerrado) |
| 18 | Intento sub-fase 5b camino A — descartado al carácter | Implementación → revert | ~4-5h (cerrado) |
| 19 | PASO 0 ampliado + decisión arquitectónica + plan v3 | Replanificación | ~4-5h (en curso) |
| 20 | 5c — descomposición handler TF | Implementación | ~2-3h |
| 21 | 5d.1-5d.4 — contrato chartTick + KillzonesOverlay + RulerOverlay | Implementación | ~3-4h |
| 22 | 5d.5-5d.8 — CustomDrawingsOverlay + PositionOverlay + deuda 5.1 + atajo Opt+R | Implementación | ~3-4h |
| 23 | 5e — decisión parche 4.6 | Implementación | ~1-2h |
| 24 | 5f — limpieza (5f.1 + 5f.2) | Implementación | ~2h |
| 25 | 5g — cierre plan v3 + smoke producción + HANDOFF cluster B | Cierre | ~2-3h |

**Total estimado plan v3**: 6 sesiones de implementación tras sesión 19 (~13-18h adicionales).

**Importante**: este calendario es propuesta. Ramón decide ritmo. Si en algún momento decide pausar para validación pasiva en producción (estilo cierre fase 4d), la rama feature aguanta.

**Fase 5.A (cluster A)**: NO planificada en este calendario. Se planificará tras cierre cluster B + decisión Ramón sobre prioridad respecto a fase 6.

---

## §9 — Material aún pendiente para sesiones 20+ (corto)

La mayor parte del inventario al carácter ya está hecho en sesiones 17 + 19. Lo que queda pendiente, a verificar al inicio de cada sub-fase concreta.

### Para sub-fase 5c (sesión 20)

1. Confirmar al carácter `wc -l components/_SessionInner.js` = 2962 antes de empezar.
2. Releer al carácter L1154-L1192 desde shell para confirmar que el handler no ha cambiado desde el inventario sesión 17.
3. Decidir helpers locales vs `lib/tfTransition.js` antes del primer Edit.

### Para sub-fase 5d (sesiones 21-22)

1. Inventario al carácter de los `useEffect` de los 4 overlays (sub-paso 5d.1) — qué dependencias tienen, qué subscriben, qué hacen al re-render.
2. Verificar al carácter ubicación exacta del `chartTick` state (`_SessionInner.js:237` según plan v2 §2.6).
3. Verificar al carácter L888-L892 (disparador A) y L1189 (disparador B).

### Para sub-fase 5e (sesión 23)

1. Localizar al carácter el parche `snap floor` en `vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js` (commit `2851ef7`).

### Para sub-fase 5f (sesión 24)

1. Localización al carácter del bloque debug `__algSuiteExportTools`. Mencionado en `core-analysis.md §7 punto 5` como ~L1138 — confirmar antes del Edit.
2. Polling 300ms `getSelected` — ya localizado al carácter sesión 19: `_SessionInner.js` L397-L408.

---

## §10 — Cluster A documentado como deuda mayor para fase 5.A futura

> Esta sección es valor real producido en sesión 19. Captura al carácter el modelo del cluster A para que sesiones futuras no tengan que repetir el descubrimiento.

### §10.1 Estado al carácter del cluster A

**Definición**: el cluster A es el conjunto de 4 piezas estructurales que mezclan drawings entre pares vía blob compartido en `session_drawings`. Verificadas al carácter en sesión 19 — ver §2.4 para detalle de cada pieza.

**Síntomas observables (deuda runtime)**:
- Warning `_requestUpdate is not set` al destruir tool.
- `Series not attached to tool` en consola al cerrar pares con drawings.
- `Object is disposed` al cambiar sesión rápidamente o cerrar par secundario.
- Drawings de un par aparecen visualmente en plugin de otro par tras añadir par secundario.
- `activePairs` añadidos in-session no persisten al recargar página (deuda nueva descubierta sesión 18).

**Severidad runtime real**: baja. Producción funciona desde 2 may 2026 sin quejas con estos síntomas.

**Severidad arquitectónica**: alta. Es deuda mayor estructural que limita el simulador a "1 sesión = 1 conjunto unificado de drawings" en lugar de "1 sesión × N pares = N conjuntos separados".

### §10.2 Tres caminos viables para fase 5.A (decisión Ramón cuando se ataque)

#### Camino fase 5.A — Opción A: migración `session_drawings` con columna `pair`

- Migración Supabase: añadir columna `pair` a `session_drawings`. Cambiar índice/constraint a `(session_id, pair)`.
- `saveSessionDrawings`: filtrar por `(session_id, pair)`.
- Bloque carga inicial: cargar solo blob del par activo. Deps cambian a `[pluginReady, id, activePair]`.
- `drawingTfMap`: probablemente per-par también.
- Plugin lifecycle: ciclo destrucción/recreación per-par sigue, pero cada plugin recibe SOLO sus drawings.

**Coste**: migración Supabase = regla absoluta CLAUDE.md §3.1 → requiere OK explícito Ramón. Coordinación con datos existentes (asignar `pair` a blobs históricos). Validar quota Supabase antes de migrar.

**Beneficio**: aislamiento real. Sub-fase 5b del plan v2 se vuelve trivial. B2 + B6 cerrados estructuralmente.

#### Camino fase 5.A — Opción B: blob único + plugins persistentes

- Mantener `session_drawings` como está. Cero migración BD.
- Modelo "todos los plugins viven a la vez": map `pluginsRef.current[pair]` con un plugin por par activo.
- `importTools(blob)` solo UNA VEZ al cargar la sesión, sobre el plugin del par primario.
- Al cambiar `activePair`, NO destrucción/recreación. Solo cambia visibilidad.
- `saveSessionDrawings` exporta del plugin "primario". Sincronización entre plugins compartiendo blob.

**Coste**: rediseño completo de `useDrawingTools.js` (~150-300 líneas). Sincronización entre plugins es fuente nueva de bugs. Memoria: 6 plugins LWC vivos para sesión multi-par.

**Beneficio**: sin migración BD. Warnings de plugin lifecycle desaparecen.

#### Camino fase 5.A — Opción C: aceptar permanentemente el cluster A

- Documentar al carácter que el simulador opera con modelo "1 sesión = 1 conjunto unificado de drawings" como diseño, no bug.
- UX deja claro al usuario que drawings son por sesión, no por par.
- Warnings de consola permanecen como ruido cosmético aceptado.

**Coste**: cero código.

**Beneficio**: cero coste. Cero riesgo. Pero acepta que el simulador NO alcanzará paridad con TradingView en este aspecto del principio rector.

### §10.3 Cuándo atacar fase 5.A

Decisión Ramón. Opciones:

- **Inmediatamente tras cluster B (sesión 26+)**: si Ramón decide que cluster A es la siguiente prioridad arquitectónica antes de fase 6.
- **Tras fase 6 (trading domain)**: si Ramón decide que avanzar trading layer es más urgente que cerrar deuda cosmética.
- **Tras fase 7 (reducción `_SessionInner.js`)**: si Ramón decide que la reducción del archivo monstruo facilita el rediseño del cluster A.
- **Nunca (Opción C de §10.2)**: si los warnings cosméticos se aceptan permanentemente y cluster A queda como "diseño" en lugar de "deuda".

**No decidido en plan v3.** El plan v3 solo deja documentado el modelo al carácter y las opciones para cuando Ramón decida.

---

## §11 — Aprobación

Este plan es **v3 — propuesta consolidada con cluster A aplazado y cluster B vivo, basada en hallazgos sesiones 18 + 19 verificados al carácter.** No se ejecuta nada hasta que Ramón lo apruebe explícitamente o pida cambios.

Si aprobado:

1. v3 sustituye a v2 en `refactor/fase-5-plan.md` (mismo nombre de archivo, sobrescribe; v1 sigue vivo en commit `195d02b` y v2 en commit `f2c7476` para trazabilidad).
2. Comitear v3 a la rama `refactor/fase-5-drawings-lifecycle`. Mensaje sugerido: `docs(fase-5): plan v3 con cluster A aplazado a fase 5.A y cluster B vivo sesion 19`.
3. Cerrar sesión 19 con HANDOFF.
4. Sesión 20: arranque sub-fase 5c (descomposición handler TF).

Si requiere cambios, iterar v3 → v3.1 → ... antes de comitear.

---

*Fin del plan v3 fase 5. Redactado en sesión 19 por CTO/revisor tras PASO 0 ampliado al carácter. Pendiente revisión por Ramón.*
