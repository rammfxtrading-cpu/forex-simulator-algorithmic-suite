# refactor/fase-5-plan.md — v2

> **Plan táctico de fase 5 — Drawings lifecycle.**
> Redactado: 4 mayo 2026, sesión 17 (CTO/revisor). Versión 2 — incorpora inventario al carácter realizado al cierre de sesión 17.
> v1 (commit `195d02b`) se conserva en histórico git. v2 es la versión vigente.
> HEAD del repo al redactar v2: `195d02b` (rama `refactor/fase-5-drawings-lifecycle`).

---

## §1 — Contexto y alcance

### §1.1 Por qué fase 5 ahora

Fase 5 es la siguiente capa del refactor según el orden establecido (1 → 2 → 3 → 4 → 4d → **5** → 6 → 7). Todas las deudas UX abiertas viven aquí arquitectónicamente — atacarlas sueltas antes ha demostrado generar parches o regresiones (lección §9.4 mayor de sesión 16).

**Principio rector activo (CLAUDE.md §1):** *"dejar el core de backtesting a la calidad de TradingView (drawings) y FX Replay (replay engine). Nada más importa hasta que esto esté sólido."*

### §1.2 Qué resuelve fase 5

Cierre limpio de 6 deudas UX que hoy viven repartidas y se interfieren entre sí:

| ID | Descripción | Encaje en fase 5 |
|---|---|---|
| **5.1** | UX viewport — mantener vista al cambiar TF + atajo Opt+R/Alt+R | Sub-fase 5d (handler TF rediseñado) |
| **Regresión Killzones** | Killzones se descolocan al cambiar TF si viewport se restaura post-setData | Sub-fase 5d (contrato chartTick/overlays) |
| **4.5** | `__algSuiteExportTools` no registrado | Sub-fase 5f (limpieza) |
| **Warning LWC `_requestUpdate is not set`** | Aparece al destruir tool | Sub-fase 5b (lifecycle plugin) |
| **B5** | `POST /session_drawings 409 Conflict` race | Sub-fase 5f (persistencia) |
| **4.6 (parche)** | Drawings descolocados al cambiar TF (parche `snap floor` en `2851ef7`) | Sub-fase 5e (decidir si rediseño o se queda) |

**Adicionalmente cierra 2 bugs históricos del CLAUDE.md §9:**

- `Series not attached to tool ...` (consola al cerrar pares con drawings)
- `Object is disposed` (al cambiar de sesión rápidamente)

### §1.3 Lo que fase 5 NO hace

- **NO toca trading domain** (positions, orders, balance) — eso es fase 6.
- **NO reduce `_SessionInner.js`** a su tamaño objetivo — eso es fase 7.
- **NO elimina los globales `window.__algSuite*`** salvo el documentado muerto (`__algSuiteExportTools`). El resto sigue siendo decisión de fase 7.
- **NO toca el replay engine** ni el viewport core (fases 3 y 4 ya cerradas, sus invariantes deben mantenerse intactas en cada commit).

---

## §2 — Inventario al carácter (verificado en sesión 17)

> Todo lo siguiente está verificado al carácter desde la shell zsh nativa de Ramón en la sesión 17. Lo demás (referencias a `core-analysis.md` o HANDOFFs) es inferencia documental y debe re-verificarse al carácter en sub-fase concreta.

### §2.1 Estado del repo

- Rama feature activa: `refactor/fase-5-drawings-lifecycle`.
- Commit más reciente: `195d02b docs(fase-5): plan v1 ...` sobre `29d0b0f` (HANDOFF sesión 16).
- Working tree limpio (al cierre de redacción de v2 habrá un nuevo HANDOFF y v2 untracked, pendientes de comitear).

### §2.2 Invariantes fase 4 (deben mantenerse intactas)

- `cr.series.setData` aparece SOLO dentro de `lib/chartRender.js`. ✅
- `cr.series.update` aparece SOLO dentro de `lib/chartRender.js`. ✅
- `computePhantomsNeeded` aparece en 3 sitios de `_SessionInner.js`: L116 (definición), L1121, L1178 (consumers). ✅

**Cualquier commit de fase 5 debe verificar estos 3 greps al cierre.**

### §2.3 Tamaños actuales

| Archivo | Líneas |
|---|---|
| `lib/chartViewport.js` | 202 |
| `components/_SessionInner.js` | 2962 |
| `components/useDrawingTools.js` | 243 |
| `components/useCustomDrawings.js` | 62 |

### §2.4 Plugin LWC en `useDrawingTools.js`

#### §2.4.1 Inicialización

`initPlugin` (en `useDrawingTools.js`) hace:

1. 6 dynamic imports: core, lines, path, rectangle, fib (custom local), long-short-position.
2. Monta `createLineToolsPlugin(cr.chart, cr.series)`.
3. Registra 6 tipos de tool con `plugin.registerLineTool(...)`.
4. Setea `pluginRef.current = plugin` y `setPluginReady(true)`.

#### §2.4.2 Teardown — confirmado: NO existe

El `useEffect` con dependencia `[activePair]` solo hace:

```js
pluginRef.current = null
setPluginReady(false)
```

El plugin viejo **queda vivo en memoria** con sus listeners enchufados al chart anterior. **Ésta es la causa raíz** de los errores `Series not attached to tool` y `Object is disposed` documentados en CLAUDE.md §9.

#### §2.4.3 API expuesta por `useDrawingTools`

`addTool`, `removeSelected`, `removeAll`, `deselectAll`, `exportTools`, `importTools`, `onAfterEdit/offAfterEdit`, `onDoubleClick/offDoubleClick`, `getSelected`, `applyToTool`, `setToolVisible`, `updateToolConfig`. Todas envuelven llamadas a `pluginRef.current?.<método>`.

### §2.5 Plugin LWC vendor — análisis para 5b (NUEVO en v2)

#### §2.5.1 Estructura del archivo `lightweight-charts-line-tools-core.js`

- 8737 líneas, NO minificado.
- Clase `LineToolsCorePlugin` (plugin global) en L2929.
- Clase `BaseLineTool` (cada herramienta individual) — origen exacto pendiente de verificar al carácter en sesión 19.
- Factory `createLineToolsPlugin(chart, series)` en L8681.

#### §2.5.2 Métodos de cleanup encontrados

`grep` en el archivo devolvió 11 sitios con `destroy/dispose/detach/cleanup/removeAllLineTools/unsubscribe`:

| Línea | Contexto | Notas |
|---|---|---|
| L379 | `unsubscribe(callback)` | Delegate genérico |
| L393 | `unsubscribeAll(linkedObject)` | Delegate genérico |
| L429 | `destroy()` | Probablemente Delegate o componente helper. Verificar al carácter en sesión 19. |
| L1814 | `detachTool(tool)` | InteractionManager — desengancha tool individual |
| L3066 | `this._interactionManager.detachTool(tool)` | Llamada interna desde plugin global |
| L3067 | `tool.destroy()` | Llamada interna después del detach |
| **L3127** | **`removeAllLineTools()`** | **Cleanup global de todas las herramientas. Es lo más cercano a un "destroy" del plugin que existe.** |
| L3298 | `unsubscribeLineToolsDoubleClick` | API pública del plugin |
| L3329 | `unsubscribeLineToolsAfterEdit` | API pública del plugin |
| L6051 | `detached()` | Hook lifecycle de LWCharts en BaseLineTool |
| L6575 | `destroy()` | De `BaseLineTool` (cleanup interno por tool) |

#### §2.5.3 Hallazgo clave

**`LineToolsCorePlugin` (la clase del plugin global) NO tiene un método `destroy()` propio.** El cleanup más completo disponible es `removeAllLineTools()` (L3127), cuya documentación dice: *"performs a full cleanup, detaching every tool from the chart's series"*.

Cadena interna confirmada: `removeAllLineTools` → por cada tool → `detachTool` (InteractionManager) → `tool.destroy()` (BaseLineTool).

**Lo que `removeAllLineTools` probablemente NO hace:**
- Desuscribir `_doubleClickDelegate` y `_afterEditDelegate` del propio plugin.
- Soltar referencias a `_chart` y `_series` que tiene `LineToolsCorePlugin` internamente.

#### §2.5.4 Implicación para sub-fase 5b

Dos caminos viables:

- **Camino 5b-A — sin parche al fork:** llamar `pluginRef.current.removeAllLineTools()` antes de `pluginRef.current = null`. Más simple, sin tocar `vendor/`. Riesgo: si los delegates colgando o las refs `_chart`/`_series` causan los warnings, no se cierra del todo.
- **Camino 5b-B — parche al fork (recomendado si A no basta):** añadir un método `destroy()` a `LineToolsCorePlugin` (~10 líneas: llamar `removeAllLineTools`, vaciar delegates, nulificar refs). Sigue patrón ya usado en commit `2851ef7`. Cierre arquitectónicamente limpio.

**Decisión de v2:** intentar 5b-A primero. Si tras 5b-A los warnings persisten o aparecen errores nuevos, escalar a 5b-B. Documentar resultado.

### §2.6 Persistencia drawings (tabla `session_drawings`)

Definida en `_SessionInner.js`:
- L297: `saveSessionDrawings = useCallback(async () => {...})`.
- L317: `.from('session_drawings')` (lectura).
- L325: `.from('session_drawings').insert(...)` (escritura).
- L338: `.from('session_drawings').select('data')...maybeSingle()` (carga inicial).
- L331: `saveDrawingsRef.current = saveSessionDrawings` (ref para event handlers).

### §2.7 Handler de cambio de TF (`_SessionInner.js` L1154-L1192)

Este es el **nodo crítico de coordinación de fase 5.** Hoy hace 6 cosas dentro de un único `useEffect`:

1. Obtener `ps` (pairState) y `cr` (chart record). Salir si falta alguno.
2. **Deselect drawings** (`deselectAll()`) — para evitar contraerse del LongShortPosition durante setData.
3. **Calcular phantoms necesarios** — lee `exportTools()`, parsea, llama `computePhantomsNeeded`. Fallback a 10 si falla.
4. **Forzar setData** — `cr._phantomsNeeded = phantomsNeeded; cr.prevCount = 0; updateChart(activePair, ps.engine, true)`.
5. **Incrementar `tfKey`** — `setTfKey(k => k+1)` (re-render de hooks dependientes).
6. **Scroll a tail + tick** — `scrollToTail(cr, 8, () => setChartTick(t => t+1))`.

**Problema arquitectónico:** estas 6 acciones deben ejecutarse en orden específico, pero ese orden no está documentado. Cualquier modificación (como la deuda 5.1 de sesión 16) puede romper el timing de overlays externos sin previo aviso.

### §2.8 Disparadores de `chartTick` (NUEVO en v2 — verificado al carácter)

`chartTick` es un `useState(0)` declarado en `_SessionInner.js:237`. Tiene **2 disparadores** verificados al carácter:

#### Disparador A — automático (L888-L892)

Dentro de la suscripción `subscribeVisibleLogicalRangeChange` registrada al montar cada par:

```js
chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{
  const _cr=chartMap.current[pair]
  markUserScrollIfReal(_cr)
  setChartTick(t=>t+1)
})
```

Se dispara cada vez que el chart cambia su rango visible (zoom, pan, scroll del usuario, o cambios programáticos del viewport vía API LWC).

#### Disparador B — manual (L1189)

Dentro del callback de `scrollToTail`, al final del handler de cambio de TF:

```js
scrollToTail(cr, 8, () => setChartTick(t => t+1))
```

Se dispara explícitamente cuando termina la operación de cambio de TF.

#### Contrato implícito

> *"si cambia el viewport — sea por interacción del usuario o por código — `chartTick` se incrementa".*

**Es contrato razonable** pero no está escrito en ninguna parte y no todos los overlays lo respetan (ver §2.9). El fix 5.1 de sesión 16 disparaba `setChartTick` **fuera del rAF**, antes de que LWC aplicara el `setVisibleRange` interno → Killzones leían viewport intermedio. Esto no contradice el contrato, simplemente lo expone como insuficiente: el contrato debe especificar **timing** (después de qué momento se dispara).

### §2.9 Mapa de overlays sensibles al viewport (NUEVO en v2)

Verificado al carácter. **4 overlays totales**, cada uno con un mecanismo distinto de reactividad al viewport:

| Overlay | Ubicación | Firma | Recibe `chartTick`? | Reactividad real al viewport |
|---|---|---|---|---|
| `KillzonesOverlay` | archivo propio | `{chartMap, activePair, dataReady, currentTf, tick, currentTime}` | Sí (L1865) pero **NO lo destructura** → ignorado | `tick` + suscripción interna LWC (presumible, verificar 5d) |
| `RulerOverlay` | archivo propio | `{active, onDeactivate, chartMap, activePair}` | No | Suscripción interna LWC (presumible, verificar 5d) |
| `CustomDrawingsOverlay` | archivo propio | `{drawings, chartMap, activePair, tfKey}` | No | `tfKey` + suscripción `subscribeVisibleLogicalRangeChange` (verificado al carácter en `CustomDrawingsOverlay.js`) |
| `PositionOverlay` | helper local en `_SessionInner.js` L2796 | `{positions, pendingOrders, chartMap, activePair, dataReady, onClosePos, onCancelOrder, onDragEnd}` | No | Por verificar al carácter en sesión 21 |

**Hallazgo crítico:** ninguno de los 4 overlays consume `chartTick` directamente. Cada uno improvisó su propio mecanismo. Esto es la **causa raíz arquitectónica** de la regresión Killzones de sesión 16 — el fix esperaba que un canal funcionara que en realidad no estaba conectado.

### §2.10 Componentes secundarios

- **DrawingToolbar** (`components/DrawingToolbar.js`): UI de selección de tool, no toca lifecycle.
- **CustomDrawingsOverlay** dibuja TEXT (vía DOM) y RULER (vía canvas). El RULER del overlay y el `RulerOverlay` independiente **son cosas distintas**: el primero es persistido como drawing custom, el segundo es regla temporal estilo TradingView (no persistida).

---

## §3 — Diagnóstico arquitectónico

Cinco problemas arquitectónicos vivos en el dominio drawings/overlays, ordenados por severidad:

### Problema 1 — Plugin LWC no se destruye al cambiar par

**Síntoma observable:** errores `Series not attached to tool` y `Object is disposed` en consola al cerrar pares con drawings o cambiar sesiones rápidamente. **Causa raíz confirmada al carácter en §2.4.2.**

**Severidad:** alta. Es bug histórico del CLAUDE.md §9.

**Ruta de cierre:** sub-fase 5b. Camino A primero (sin parche), B si A no basta.

### Problema 2 — Handler de cambio de TF acoplado en exceso

6 responsabilidades en un único `useEffect` sin orden documentado. Cualquier cambio rompe el timing de algo. La regresión Killzones de sesión 16 es prueba.

**Severidad:** alta. Bloquea futuras intervenciones (incluida la deuda 5.1 que sigue abierta).

**Ruta de cierre:** sub-fase 5c.

### Problema 3 — Contrato `chartTick` ↔ overlays roto

**Diagnóstico afilado tras inventario al carácter en sesión 17:**

- **El contrato existe implícitamente** ("chartTick se incrementa cuando cambia el viewport") pero no está documentado y no especifica timing.
- **Ningún overlay lo consume.** Los 4 overlays usan 3 mecanismos distintos:
  - KillzonesOverlay: `tick` + suscripción LWC interna (recibe `chartTick` pero lo ignora).
  - RulerOverlay: solo suscripción interna.
  - CustomDrawingsOverlay: `tfKey` + suscripción interna.
  - PositionOverlay: por verificar.
- **Implicación:** disparar `setChartTick` no notifica a nadie efectivamente. Es equivalente a NOOP para los overlays, salvo efectos colaterales por cascada de re-renders de React.

**Severidad:** alta. Es la causa raíz arquitectónica de la regresión Killzones de sesión 16, y bloquea la deuda 5.1.

**Ruta de cierre:** sub-fase 5d. Rediseño del contrato + adopción explícita por los 4 overlays.

### Problema 4 — Drawings descolocados al cambiar TF (parche 4.6 vivo)

Parche `2851ef7` (snap timestamp al floor en `interpolateLogicalIndexFromTime` del plugin LWC vendor) funciona pero es **local al plugin**. Si el rediseño de fase 5 cambia cómo se persisten/resuelven coordenadas, este parche puede sobrar o requerir adaptación.

**Severidad:** media. No es bloqueante. Decisión: mantener tal cual hasta sub-fase 5e, donde se evalúa.

**Ruta de cierre:** sub-fase 5e.

### Problema 5 — Persistencia con race condition (B5)

`POST /session_drawings 409 Conflict` aparece esporádicamente al guardar drawings. Hipótesis (sin verificar al carácter): saves concurrentes desde múltiples disparadores (`onAfterEdit`, autosave, cambio de par) sin debounce/lock.

**Severidad:** baja-media. No corrompe datos (Supabase rechaza el segundo). Apuntado para sub-fase 5f.

**Ruta de cierre:** sub-fase 5f.

---

## §4 — Objetivo de fase 5 — criterios "está hecho"

Fase 5 está cerrada cuando se cumplen TODOS estos criterios sin excepción:

### Criterios funcionales (CLAUDE.md §4.3)

1. Dibujo una línea, cambio de TF 70 veces seguidas, la línea se queda anclada al timestamp de la vela existente más cercana al original (regla `floor`, equivalente TradingView). **No se mueve ni un pixel respecto a esa vela.**
2. Cambio par durante un replay. Vuelvo al par anterior. Drawings exactamente como los dejé.
3. Cierro un par mientras hay drawings activos. **Cero errores en consola.**
4. Cambio sesión rápidamente (3 sesiones en <2 segundos). **Cero errores en consola.**
5. Borro un drawing. **Cero warnings `_requestUpdate is not set`.**
6. Recargo la página. Drawings persistidos exactamente como estaban.

### Criterios arquitectónicos

7. **Plugin LWC tiene teardown explícito** al cambiar par (vía `removeAllLineTools` o vía `destroy()` parcheado). Listeners viejos desconectados antes de montar el plugin nuevo.
8. **Handler de cambio de TF documentado y testeable.** Las 6 responsabilidades actuales separadas en funciones nombradas, con orden explícito.
9. **Contrato `chartTick` ↔ overlays explícito.** Documentado quién dispara, quién observa, cuándo. Los 4 overlays adaptados.
10. **Deuda 5.1 cerrable.** El rediseño de fase 5 debe permitir que mantener vista al cambiar TF sea una operación de 1-3 líneas, no una intervención frágil.
11. **B2 (drawings descolocadas en Review) y B6 (plugin reinicializado) cerrados** o explícitamente documentados como no aplicables tras el refactor.

### Criterios de estabilidad

12. Smoke local de Killzones tras cada sub-fase: rectángulos bien colocados al cambiar TF en zona pasada.
13. Smoke producción al cierre de fase 5: las 6 deudas listadas en §1.2 verificadas como resueltas.
14. Invariantes fase 4 (los 3 greps de §2.2) mantenidas intactas en cada commit de fase 5.

---

## §5 — Sub-fases propuestas

Fase 5 se reparte en sub-fases atomizables, cada una commit propio en rama feature `refactor/fase-5-drawings-lifecycle`. Merge a `main` se hace solo al cerrar la fase completa con smoke producción OK.

### Sub-fase 5b — Lifecycle del plugin LWC al cambiar par

**Objetivo:** plugin viejo se destruye explícitamente antes de montar el nuevo al cambiar `activePair`.

#### Estrategia — dos caminos secuenciales

**Camino 5b-A (intentar primero, sin parche):**
- En `useDrawingTools.js`, en el `useEffect` con dependencia `[activePair]`:
  - Antes de `pluginRef.current = null`, llamar `pluginRef.current?.removeAllLineTools()` (con try/catch).
  - Verificar al carácter que la función existe en el plugin antes de la primera llamada.
- Smoke local exhaustivo: cambio par × 30 ciclos con drawings activos. Verificar consola limpia.

**Camino 5b-B (escalar si A no basta):**
- Parche al fork de difurious vía edición directa de `vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js`.
- Añadir método `destroy()` a `LineToolsCorePlugin` (~10 líneas):
  ```js
  destroy() {
    this.removeAllLineTools()
    this._doubleClickDelegate = new Delegate()
    this._afterEditDelegate = new Delegate()
    this._chart = null
    this._series = null
    this._interactionManager = null
  }
  ```
- En `useDrawingTools.js` llamar `pluginRef.current?.destroy()` en lugar de `removeAllLineTools`.

**Decisión criterio:** si tras 5b-A persisten warnings o errores en consola tras smoke local, escalar a 5b-B en commit separado.

**Riesgo:** alto. Si rompemos algo, drawings desaparecen al cambiar par. Mitigación: smoke local exhaustivo cambio par × 30 ciclos con drawings de los 6 tipos antes de commit.

**Tamaño estimado:**
- Camino A: ~10 líneas en `useDrawingTools.js`.
- Camino B: ~10 líneas en `useDrawingTools.js` + ~10 líneas en `vendor/`.

**Cobertura:** Problema 1 (§3). Cierra warning `_requestUpdate is not set`, errores `Series not attached`/`Object is disposed`.

### Sub-fase 5c — Descomposición del handler de cambio de TF

**Objetivo:** las 6 responsabilidades del handler (§2.7) extraídas a funciones nombradas con orden explícito documentado.

**Scope:**
- `components/_SessionInner.js` L1154-L1192: refactor del `useEffect`.
- Crear funciones nombradas para cada paso (probablemente helpers locales en `_SessionInner.js` o en un nuevo módulo `lib/tfTransition.js` — decisión al inicio de sesión 20 según tamaño).
- Cero cambios funcionales en este commit — solo extracción y documentación. Comportamiento idéntico al actual.

**Riesgo:** medio-alto. Es un nodo de coordinación frágil. Mitigación: cero cambios de comportamiento, solo restructuración. Smoke local exhaustivo (cambio TF × todas las combinaciones M1↔M3↔M5↔M15↔M30↔H1↔H4↔D1).

**Tamaño estimado:** ~80 líneas movidas, ~50 nuevas (orquestador + comentarios).

**Cobertura:** Problema 2 (§3). Habilita 5d.

### Sub-fase 5d — Contrato `chartTick` ↔ overlays + cierre deuda 5.1

**Objetivo:** definir contrato explícito entre handler de TF, `chartTick`, y overlays HTML. Cerrar deuda 5.1 (mantener vista al cambiar TF) como aplicación natural del contrato.

#### Sub-pasos

**5d.1 — Inventario al carácter de overlays:**
- Verificar al carácter cómo cada uno de los 4 overlays reacciona al viewport hoy.
- Para `RulerOverlay`, `CustomDrawingsOverlay` y `PositionOverlay`: leer `useEffect` que se suscribe a `subscribeVisibleLogicalRangeChange` (si existe) y confirmar comportamiento.
- Para `KillzonesOverlay`: confirmar al carácter que `tick` (NO `chartTick`) es el canal que lo redibuja.

**5d.2 — Definir contrato v1 propuesto:**
- **Un único canal de notificación:** `chartTick`.
- **Disparado SIEMPRE dentro del rAF posterior a la operación que altera viewport.**
- **Overlays observan `chartTick` explícitamente** vía destructuring + `useEffect` con dependencia `[chartTick]`.
- **Documentado en `_SessionInner.js`** con comentario de bloque arriba del `chartTick` state.

**5d.3 — Adoptar contrato en KillzonesOverlay:**
- Destructurar `chartTick`.
- Añadir `useEffect([chartTick, ...])` que recalcule sesiones / fuerce redraw.
- Smoke local: cambio TF en zona pasada → Killzones bien colocadas (test crítico de regresión sesión 16).

**5d.4 — Adoptar contrato en RulerOverlay:**
- Pasar `chartTick` desde `_SessionInner.js`.
- Adaptar lógica interna.

**5d.5 — Adoptar contrato en CustomDrawingsOverlay:**
- Reemplazar dependencia de `tfKey` por `chartTick` (o documentar por qué se mantiene `tfKey` si el caso lo justifica).

**5d.6 — Adoptar contrato en PositionOverlay:**
- Pasar `chartTick` desde `_SessionInner.js`.
- Adaptar render de SL/TP/entrada.

**5d.7 — Cierre deuda 5.1 (UX viewport):**
- Reaplicar las 3 funciones de `chartViewport.js` diseñadas en sesión 16 (`captureSavedTimeRange`, `restoreSavedTimeRange`, `resetViewportToDefault`).
- Integrar en handler de TF descompuesto (5c).
- `setChartTick` se dispara dentro del rAF posterior al `restoreSavedTimeRange`.
- Smoke local de los 4 tests de sesión 16 (cambio TF rango pasado, cambio durante play, cambio extremo, cambio en phantoms).

**5d.8 — Atajo Opt+R / Alt+R (sub-Op D pendiente de sesión 16):**
- Implementar el atajo que llama `resetViewportToDefault`.
- Smoke local: tras cambio de TF, Opt+R devuelve viewport al final del chart.

**Riesgo:** alto. Cambia el contrato de varios consumers a la vez. Mitigación: cada sub-paso es commit propio. Smoke local de cada overlay tras cada sub-paso.

**Tamaño estimado:** ~30 líneas en `chartViewport.js` (3 funciones nuevas), ~20 en `_SessionInner.js`, ~10-15 en cada overlay → total ~100 líneas.

**Cobertura:** Problema 3 (§3) + deuda 5.1 + regresión Killzones de sesión 16.

### Sub-fase 5e — Decisión sobre parche 4.6

**Objetivo:** decidir si el parche `snap timestamp al floor` en plugin LWC vendor (commit `2851ef7`) sigue siendo necesario tras 5b/5c/5d, o si el rediseño lo hace redundante.

**Procedimiento:**
1. Reproducir caso original (M5 → M15 con LongShortPosition en timestamp intermedio) **con el parche activo** (estado actual). Confirmar que funciona.
2. Revertir el parche en una rama experimental local. Reproducir el caso. Si vuelve el bug → parche sigue siendo necesario.
3. Decisión:
   - **Si sigue siendo necesario:** mantener tal cual. Cerrar 5e con commit de no-acción + nota.
   - **Si ya no es necesario:** revertir el parche en commit aparte con justificación documentada.
   - **Si el rediseño de 5b/5c/5d permite arreglarlo más arriba (en `useDrawingTools` o en módulo nuevo):** rediseño limpio, parche borrado.

**Riesgo:** medio. Mitigación: cualquier cambio aquí pasa por smoke producción de la matriz completa de TFs (3x3 transiciones) con 6 tipos de drawings.

**Tamaño estimado:** desconocido — depende del resultado del análisis.

**Cobertura:** Problema 4 (§3). Limpia el parche en `vendor/` si es seguro.

### Sub-fase 5f — Limpieza y persistencia

**Objetivo:** absorber deudas chicas que viven en este dominio.

**Sub-pasos:**

**5f.1 — Deuda 4.5:** borrar `__algSuiteExportTools` del bloque debug (`_SessionInner.js:1138` aproximado, según `core-analysis.md §7 punto 5`). Verificar al carácter antes.

**5f.2 — Polling 300ms `getSelected()`:** investigar por qué se puso (CLAUDE.md §7 punto 6). Si `subscribeLineToolsAfterEdit` no cubre cambios de selección sin edición, sustituir por evento sintético o suscripción al fork.

**5f.3 — B5 (409 Conflict en `session_drawings`):** investigar disparadores concurrentes. Hipótesis a verificar: añadir debounce/single-flight a `saveSessionDrawings`.

**Riesgo:** bajo cada elemento por separado. Commit por elemento.

**Tamaño estimado:** ~20-50 líneas netas borradas.

**Cobertura:** Problemas 4 (parcial) y 5 (§3).

### Sub-fase 5g — Cierre fase 5

**Objetivo:** smoke producción + HANDOFF + merge a `main`.

**Scope:**
- Smoke producción exhaustivo (los 14 criterios de §4).
- Si todo verde: merge fast-forward de `refactor/fase-5-drawings-lifecycle` a `main`.
- Si algo rojo: documentar en HANDOFF, decisión Ramón sobre continuar o aparcar.
- HANDOFF de cierre de fase.

---

## §6 — Riesgos y mitigaciones

### Riesgo 1 — Romper drawings durante 5b (lifecycle plugin)

**Mitigación:** smoke local cambio par × 30 ciclos con drawings activos antes de cualquier commit. Si fallan, revert inmediato y diagnóstico. Camino A primero (sin parche al fork) reduce superficie de cambio.

### Riesgo 2 — Romper Killzones (otra vez) durante 5d

**Mitigación:** smoke local de Killzones es **test crítico obligatorio** tras CADA sub-paso de 5c y 5d. Cada sub-paso de 5d es commit propio. Lección de sesión 16 grabada.

### Riesgo 3 — Sub-fase 5e (parche 4.6) introduce regresión

**Mitigación:** cualquier cambio en el parche pasa por matriz completa de smoke (3 TFs × 6 tools × 2 direcciones). Si dudas, mantener parche y documentar como deuda futura post-fase-5.

### Riesgo 4 — Tamaño de fase 5 supera capacidad de sesiones

**Mitigación:** cada sub-fase es commit atómico mergeable a su rama feature. Si fase 5 tarda 8 sesiones en lugar de 6, no pasa nada — la rama feature aguanta. Solo se mergea a main al cierre completo.

### Riesgo 5 — Errores §9.4 del CTO durante fase 5

**Mitigación:** disciplina bicapa estricta (ver `CLAUDE.md` y prompt de sesión 17). Verificación al carácter desde shell de Ramón en cada predicción de tamaño. No comitear sin `wc -l` previo. Si CTO recomienda atacar deuda fuera de orden, releer principio rector.

### Riesgo 6 — Petición fuera de orden durante fase 5

**Mitigación:** si Ramón pide atacar deuda UX no asignada a sub-fase actual, **CTO advierte una vez con razón clara**. Si Ramón insiste tras advertencia, ejecuta y documenta como excepción. NO inventar urgencia operativa para justificar desvío.

### Riesgo 7 (NUEVO en v2) — `removeAllLineTools` borra drawings vivos en cambio de par

Si en sub-fase 5b camino A llamamos `removeAllLineTools()` antes de cambiar par, **se borran los drawings del par actual de la vista del plugin**. Pero los drawings persistidos en BD (`session_drawings`) y los re-importados al volver al par siguen intactos porque el flujo de `loadPair` reimporta vía `importTools(json)`.

**Mitigación:** verificar al carácter en sesión 19 que el flujo "cambiar par → volver al par anterior" reimporta correctamente los drawings desde BD. Si hay race condition o falta de re-import, ajustar lógica.

---

## §7 — Lista de NO HACER en fase 5

> Cosas tentadoras que rompen el alcance. Si CTO o Claude Code se ven haciéndolas, **PARAR**.

1. **NO** tocar trading domain (positions, orders, balance, checkSLTP, etc.). Eso es fase 6.
2. **NO** reducir `_SessionInner.js` por debajo de su tamaño funcional necesario. Reducción final es fase 7.
3. **NO** eliminar globales `window.__algSuite*` salvo el documentado muerto (`__algSuiteExportTools`).
4. **NO** introducir tests automáticos. Decisión Ramón en CLAUDE.md §5.4. Verificación es manual al carácter.
5. **NO** instalar dependencias nuevas (regla absoluta CLAUDE.md §3.4).
6. **NO** hacer migraciones de Supabase ni cambios de esquema (regla absoluta CLAUDE.md §3.1). La tabla `session_drawings` se queda como está.
7. **NO** mergear a `main` durante la fase. Solo commits en `refactor/fase-5-drawings-lifecycle`.
8. **NO** hacer push antes del cierre de fase salvo que Ramón lo apruebe explícitamente.
9. **NO** atacar deudas UX que no estén en §1.2 bajo justificación de "scope acotado, encajemos".
10. **NO** comitear si los 3 greps de invariantes fase 4 (§2.2) fallan.
11. **NO** documentar/comentar código que ya funciona "porque ya estoy aquí". Solo cambios funcionales necesarios.
12. **NO** escalar de 5b camino A a 5b camino B sin smoke completo del camino A primero.

---

## §8 — Estimación temporal y secuencia de sesiones

> Estimaciones aproximadas. Sesiones 16 y anteriores muestran subestimación recurrente del 30-50% — añadir margen.

| Sesión | Sub-fase | Tipo | Tiempo estimado |
|---|---|---|---|
| 17 | PASO 0 + plan v1 + plan v2 + inventario al carácter | Planificación | ~5-6h (en curso) |
| 18 | Validación pasiva o arranque 5b | Decisión Ramón | — |
| 19 | 5b — lifecycle plugin LWC (camino A primero) | Implementación | ~2-3h |
| 20 | 5c — handler TF descomposición | Implementación | ~2-3h |
| 21 | 5d.1-5d.4 — contrato chartTick + KillzonesOverlay + RulerOverlay | Implementación | ~3-4h |
| 22 | 5d.5-5d.8 — CustomDrawingsOverlay + PositionOverlay + deuda 5.1 + atajo Opt+R | Implementación | ~3-4h |
| 23 | 5e — decisión parche 4.6 | Implementación | ~1-2h |
| 24 | 5f — limpieza | Implementación | ~2h |
| 25 | 5g — cierre + smoke producción + HANDOFF | Cierre | ~2-3h |

**Total estimado:** 8 sesiones de implementación sobre lo ya hecho (~17-25h adicionales).

**Importante:** este calendario es propuesta. Ramón decide ritmo. Si en algún momento decide pausar fase 5 para validación pasiva en producción (estilo cierre de fase 4d), la rama feature aguanta.

---

## §9 — Material aún pendiente para sesión 19+ (corto)

La mayor parte del inventario al carácter ya está hecho en sesión 17. Lo que queda pendiente, a verificar al inicio de cada sub-fase concreta:

### Para sub-fase 5b (sesión 19)

1. Confirmar al carácter que `LineToolsCorePlugin.prototype.removeAllLineTools` existe y no requiere argumentos (probablemente sí — está documentado en L3127 — pero verificar antes del Edit).
2. Verificar que el flujo "cambiar par → volver" reimporta drawings (Riesgo 7).

### Para sub-fase 5c (sesión 20)

1. Decidir si los helpers extraídos viven en `_SessionInner.js` (locales) o en `lib/tfTransition.js` (módulo nuevo). Decisión basada en el tamaño real del refactor.

### Para sub-fase 5d (sesión 21)

1. Inventario al carácter de los `useEffect` de los 4 overlays — qué dependencias tienen, qué subscriben, qué hacen al re-render.

### Para sub-fase 5f (sesión 24)

1. Localización al carácter del polling 300ms `getSelected` (mencionado en `core-analysis.md §7 punto 6`).
2. Localización al carácter del bloque debug `__algSuiteExportTools`.
3. Análisis de disparadores de `saveSessionDrawings` para race B5.

---

## §10 — Aprobación

Este plan es **v2 — propuesta consolidada con bytes verificados.** No se ejecuta nada hasta que Ramón lo apruebe explícitamente o pida cambios.

Si aprobado:

1. v2 sustituye a v1 en `refactor/fase-5-plan.md` (mismo nombre de archivo, sobrescribe; v1 sigue vivo en commit `195d02b` para trazabilidad).
2. Comitear v2 a la rama `refactor/fase-5-drawings-lifecycle`.
3. Cerrar sesión 17 con HANDOFF.
4. Sesión 18: Ramón decide si arranca 5b directamente o quiere validación pasiva.
5. Sesión 19+: implementación de sub-fases.

Si requiere cambios, iterar v2 → v2.1 → ... antes de comitear.

---

*Fin del plan v2 fase 5. Redactado en sesión 17 por CTO/revisor. Pendiente revisión por Ramón.*
