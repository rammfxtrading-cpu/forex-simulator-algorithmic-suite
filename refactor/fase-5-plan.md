# refactor/fase-5-plan.md — v1

> **Plan táctico de fase 5 — Drawings lifecycle.**
> Redactado: 4 mayo 2026, sesión 17 (CTO/revisor).
> Estado: **v1 — borrador para revisión.** Puede haber detalles que refinar en sesión 18 tras inventario más profundo de bytes.
> HEAD del repo al redactar: `29d0b0f` (HANDOFF sesión 16).

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
- **NO elimina los globales `window.__algSuite*`** salvo el documentado muerto (`__algSuiteExportTools`). El resto sigue siendo decisión de fase 7 (limpieza final).
- **NO toca el replay engine** ni el viewport core (fases 3 y 4 ya cerradas, sus invariantes deben mantenerse intactas en cada commit).

---

## §2 — Inventario al carácter (verificado en sesión 17)

> Lo siguiente está verificado al carácter desde la shell zsh nativa de Ramón en la sesión 17. Lo demás (referencias a `core-analysis.md` o HANDOFFs) es inferencia documental y debe re-verificarse al carácter en sub-fase concreta.

### §2.1 Estado del repo

- Rama: `main`. Working tree limpio.
- HEAD: `29d0b0f docs(sesion-16): cerrar sesion 16 ...`.
- Sincronizado con `origin/main`.

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

- Init asíncrono: `initPlugin` hace 6 dynamic imports (core, lines, path, rectangle, fib, long-short-position) y monta `createLineToolsPlugin(cr.chart, cr.series)`. Registra 6 tipos de tool. Setea `pluginRef.current = plugin` y `setPluginReady(true)`.
- **Teardown del plugin al cambiar par: NO existe.** El `useEffect` con dependencia `[activePair]` solo hace:
  ```js
  pluginRef.current = null
  setPluginReady(false)
  ```
  El plugin viejo queda vivo en memoria con sus listeners enchufados al chart anterior. **Ésta es la causa raíz** de los errores `Series not attached to tool` y `Object is disposed` documentados en CLAUDE.md §9.
- API expuesta: `addTool`, `removeSelected`, `removeAll`, `deselectAll`, `exportTools`, `importTools`, `onAfterEdit/offAfterEdit`, `onDoubleClick/offDoubleClick`, `getSelected`, `applyToTool`, `setToolVisible`, `updateToolConfig`. Todas envuelven llamadas a `pluginRef.current?.<método>`.

### §2.5 Persistencia drawings (tabla `session_drawings`)

Definida en `_SessionInner.js`:
- L297: `saveSessionDrawings = useCallback(async () => {...})`.
- L317: `.from('session_drawings')` (lectura).
- L325: `.from('session_drawings').insert(...)` (escritura).
- L338: `.from('session_drawings').select('data')...maybeSingle()` (carga inicial).
- L331: `saveDrawingsRef.current = saveSessionDrawings` (ref para event handlers).

### §2.6 Handler de cambio de TF (`_SessionInner.js` L1154-L1192)

Este es el **nodo crítico de coordinación de fase 5.** Hoy hace 6 cosas dentro de un único `useEffect`:

1. Obtener `ps` (pairState) y `cr` (chart record). Salir si falta alguno.
2. **Deselect drawings** (`deselectAll()`) — para evitar contraerse del LongShortPosition durante setData.
3. **Calcular phantoms necesarios** — lee `exportTools()`, parsea, llama `computePhantomsNeeded`. Fallback a 10 si falla.
4. **Forzar setData** — `cr._phantomsNeeded = phantomsNeeded; cr.prevCount = 0; updateChart(activePair, ps.engine, true)`.
5. **Incrementar `tfKey`** — `setTfKey(k => k+1)` (re-render de hooks dependientes).
6. **Scroll a tail + tick** — `scrollToTail(cr, 8, () => setChartTick(t => t+1))`.

**Problema arquitectónico:** estas 6 acciones deben ejecutarse en orden específico, pero ese orden no está documentado en ninguna parte. Cualquier modificación (como la deuda 5.1 de sesión 16) puede romper el timing de overlays externos sin previo aviso.

### §2.7 `chartTick` — múltiples disparadores, contrato confuso

`chartTick` es un `useState(0)` en `_SessionInner.js:237` que se incrementa para notificar cambios de viewport a overlays HTML. Disparadores:

- L891: `setChartTick(t=>t+1)` (sitio A — pendiente identificar contexto exacto en sub-fase).
- L1189: `setChartTick(t => t+1)` (sitio B — handler de TF, dentro del callback de `scrollToTail`).
- `lib/chartViewport.js:168`: comentario menciona "onScrolled dispara setChartTick".

**Y aquí el descubrimiento crítico de sesión 17:**

```js
// _SessionInner.js L1865
<KillzonesOverlay chartMap={...} activePair={...} tick={tick} chartTick={chartTick} ... />

// KillzonesOverlay.js L117
export default function KillzonesOverlay({ chartMap, activePair, dataReady, currentTf, tick, currentTime }) {
```

`KillzonesOverlay` recibe `chartTick` como prop pero **NO lo destructura ni lo lee.** Lo que dispara su redibujado es otro mecanismo (probablemente el `subscribeVisibleLogicalRangeChange` interno, o el `tick` que sí lee). Esto explica la regresión de sesión 16: el fix 5.1 disparaba `setChartTick` esperando que Killzones reaccionara, pero Killzones nunca lo hizo — su recalculado venía por la cadena interna de LWC que en ese punto del flujo aún tenía viewport intermedio.

**Implicación para fase 5:** el contrato entre handler de TF, `chartTick`, y overlays está **roto desde antes de sesión 16**. La regresión de 16 solo expuso el problema. Cualquier fase 5 honesta debe rediseñar este contrato.

---

## §3 — Diagnóstico arquitectónico

Cinco problemas arquitectónicos vivos en el dominio drawings/overlays, ordenados por severidad:

### Problema 1 — Plugin LWC no se destruye al cambiar par

**Síntoma observable:** errores `Series not attached to tool` y `Object is disposed` en consola al cerrar pares con drawings o cambiar sesiones rápidamente. **Causa raíz confirmada al carácter en §2.4.**

**Severidad:** alta. Es bug histórico del CLAUDE.md §9.

### Problema 2 — Handler de cambio de TF acoplado en exceso

6 responsabilidades en un único `useEffect` sin orden documentado. Cualquier cambio rompe el timing de algo. La regresión Killzones de sesión 16 es prueba.

**Severidad:** alta. Bloquea futuras intervenciones (incluida la deuda 5.1 que sigue abierta).

### Problema 3 — Contrato `chartTick` ↔ overlays roto

`chartTick` se dispara desde múltiples sitios, llega como prop a `KillzonesOverlay` que **no lo lee**. No hay contrato claro de quién observa qué. Posiblemente otros overlays (RulerOverlay, PositionOverlay) tengan el mismo problema — pendiente verificar al carácter en sesión 18 con sub-fase 5d.

**Severidad:** alta. Es la causa raíz de la regresión Killzones de sesión 16, y bloquea la deuda 5.1.

### Problema 4 — Drawings descolocados al cambiar TF (parche 4.6 vivo)

Parche `2851ef7` (snap timestamp al floor en `interpolateLogicalIndexFromTime` del plugin LWC vendor) funciona pero es **local al plugin**. Si el rediseño de fase 5 cambia cómo se persisten/resuelven coordenadas, este parche puede sobrar o requerir adaptación.

**Severidad:** media. No es bloqueante. Decisión: mantener tal cual hasta sub-fase 5e, donde se evalúa.

### Problema 5 — Persistencia con race condition (B5)

`POST /session_drawings 409 Conflict` aparece esporádicamente al guardar drawings. Hipótesis (sin verificar al carácter): saves concurrentes desde múltiples disparadores (`onAfterEdit`, autosave, cambio de par) sin debounce/lock.

**Severidad:** baja-media. No corrompe datos (Supabase rechaza el segundo). Apuntado para sub-fase 5f.

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

7. **Plugin LWC tiene teardown explícito** al cambiar par. Listeners viejos desconectados antes de montar el plugin nuevo.
8. **Handler de cambio de TF documentado y testeable.** Las 6 responsabilidades actuales separadas en funciones nombradas, con orden explícito.
9. **Contrato `chartTick` ↔ overlays explícito.** Documentado quién dispara, quién observa, cuándo. Killzones (y el resto de overlays) reaccionan correctamente.
10. **Deuda 5.1 cerrable.** El rediseño de fase 5 debe permitir que mantener vista al cambiar TF sea una operación de 1-3 líneas, no una intervención frágil.
11. **B2 (drawings descolocadas en Review) y B6 (plugin reinicializado) cerrados** o explícitamente documentados como no aplicables tras el refactor.

### Criterios de estabilidad

12. Smoke local de Killzones tras cada sub-fase: rectángulos bien colocados al cambiar TF en zona pasada.
13. Smoke producción al cierre de fase 5: las 6 deudas listadas en §1.2 verificadas como resueltas.
14. Invariantes fase 4 (los 3 greps de §2.2) mantenidas intactas en cada commit de fase 5.

---

## §5 — Sub-fases propuestas

Fase 5 es **el bloque más grande del refactor** y se reparte en sub-fases atomizables, cada una commit propio en rama feature `refactor/fase-5-drawings-lifecycle`. Merge a `main` se hace solo al cerrar la fase completa con smoke producción OK.

### Sub-fase 5b — Lifecycle del plugin LWC al cambiar par

**Objetivo:** plugin viejo se destruye explícitamente antes de montar el nuevo al cambiar `activePair`.

**Scope:**
- `components/useDrawingTools.js`: añadir teardown en el `useEffect` con dependencia `[activePair]`.
- Si el plugin del fork de difurious **no expone `destroy()`/`dispose()`**: parche al vendor vía `patch-package` (procedimiento ya usado en deuda 4.6 commit `2851ef7`). **Verificar al carácter en sesión 18 antes de empezar 5b.**
- Posible polish en `_SessionInner.js`: revisar consumers que asumen plugin vivo durante transición.

**Riesgo:** alto. Si rompemos algo, drawings desaparecen al cambiar par. Mitigación: smoke local exhaustivo cambio par × 30 ciclos antes de commit.

**Tamaño estimado:** ~30-50 líneas en `useDrawingTools.js` + posible patch al vendor.

**Cobertura:** Problema 1 (§3). Cierra warning `_requestUpdate is not set`, errores `Series not attached`/`Object is disposed`.

### Sub-fase 5c — Descomposición del handler de cambio de TF

**Objetivo:** las 6 responsabilidades del handler (§2.6) extraídas a funciones nombradas con orden explícito documentado.

**Scope:**
- `components/_SessionInner.js` L1154-L1192: refactor del `useEffect`.
- Posible nuevo módulo `lib/tfTransition.js` que orqueste el flujo (decidible en sesión 18).
- Cero cambios funcionales en este commit — solo extracción y documentación. Comportamiento idéntico al actual.

**Riesgo:** medio-alto. Es un nodo de coordinación frágil. Mitigación: cero cambios de comportamiento, solo restructuración. Smoke local exhaustivo (cambio TF × todas las combinaciones M1↔M3↔M5↔M15↔M30↔H1↔H4↔D1).

**Tamaño estimado:** ~80 líneas movidas, ~50 nuevas (orquestador + comentarios).

**Cobertura:** Problema 2 (§3). Habilita 5d.

### Sub-fase 5d — Contrato `chartTick` ↔ overlays + cierre deuda 5.1

**Objetivo:** definir contrato explícito entre handler de TF, `chartTick`, y overlays HTML. Cerrar deuda 5.1 (mantener vista al cambiar TF) como aplicación natural del contrato.

**Scope:**
- Inventario al carácter de TODOS los overlays consumers de `chartTick` (KillzonesOverlay, RulerOverlay, PositionOverlay, posibles otros). Sesión 18 PASO 0.
- Decisión de contrato (propuesta v1, refinable):
  - **Un único disparador** de `chartTick` por evento de viewport.
  - **Disparado SIEMPRE dentro del rAF** posterior a la operación que altera viewport.
  - **Overlays observan `chartTick` explícitamente** — Killzones lo lee y reacciona, RulerOverlay/PositionOverlay igual.
- Aplicación a `KillzonesOverlay`: destructurar `chartTick`, añadir `useEffect` que recalcule sesiones cuando cambie.
- Cierre deuda 5.1: añadir `captureSavedTimeRange` + `restoreSavedTimeRange` (ya diseñadas en sesión 16, revertidas) al handler descompuesto en 5c, con `setChartTick` disparado dentro del rAF post-restore.

**Riesgo:** alto. Cambia el contrato de varios consumers a la vez. Mitigación: smoke local de cada overlay tras cada sub-paso (5d.1 inventario, 5d.2 contrato KillzonesOverlay, 5d.3 contrato RulerOverlay, 5d.4 contrato PositionOverlay, 5d.5 reaplicar deuda 5.1).

**Tamaño estimado:** ~30 líneas en `chartViewport.js` (3 funciones nuevas), ~20 en `_SessionInner.js`, ~10-15 en cada overlay.

**Cobertura:** Problema 3 (§3) + deuda 5.1 + regresión Killzones de sesión 16.

### Sub-fase 5e — Decisión sobre parche 4.6

**Objetivo:** decidir si el parche `snap timestamp al floor` en plugin LWC vendor (commit `2851ef7`) sigue siendo necesario tras 5b/5c/5d, o si el rediseño lo hace redundante.

**Scope:**
- Reproducir caso original (M5 → M15 con LongShortPosition en timestamp intermedio) sin el parche, sobre fase 5 ya parcialmente rediseñada.
- Decisión:
  - **Si sigue siendo necesario:** mantener tal cual.
  - **Si el rediseño lo hace redundante:** revertirlo en commit aparte con justificación documentada.
  - **Si el rediseño permite arreglarlo más arriba (en `useDrawingTools` o nuevo módulo):** rediseño limpio, parche borrado.

**Riesgo:** medio. Mitigación: cualquier cambio aquí pasa por smoke producción de la matriz completa de TFs (3x3 transiciones) con 6 tipos de drawings.

**Tamaño estimado:** desconocido — depende del resultado del análisis.

**Cobertura:** Problema 4 (§3). Limpia el parche en `vendor/` si es seguro.

### Sub-fase 5f — Limpieza y persistencia

**Objetivo:** absorber deudas chicas que viven en este dominio.

**Scope:**
- **Deuda 4.5:** borrar `__algSuiteExportTools` del bloque debug (`_SessionInner.js:1138` según `core-analysis.md §7 punto 5`). Verificar al carácter antes.
- **B5 (409 Conflict en `session_drawings`):** investigar disparadores concurrentes. Hipótesis a verificar: añadir debounce/single-flight a `saveSessionDrawings`.
- **Polling 300ms `getSelected()`:** investigar por qué se puso (CLAUDE.md §7 punto 6). Si `subscribeLineToolsAfterEdit` no cubre cambios de selección sin edición, sustituir por evento sintético o suscripción al fork.

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

**Mitigación:** smoke local cambio par × 30 ciclos con drawings activos antes de cualquier commit. Si fallan, revert inmediato y diagnóstico.

### Riesgo 2 — Romper Killzones (otra vez) durante 5d

**Mitigación:** smoke local de Killzones es **test crítico obligatorio** tras CADA sub-paso de 5c y 5d. Lección de sesión 16 grabada.

### Riesgo 3 — Sub-fase 5e (parche 4.6) introduce regresión

**Mitigación:** cualquier cambio en el parche pasa por matriz completa de smoke (3 TFs × 6 tools × 2 direcciones). Si dudas, mantener parche y documentar como deuda futura post-fase-5.

### Riesgo 4 — Tamaño de fase 5 supera capacidad de sesiones

**Mitigación:** cada sub-fase es commit atómico mergeable a su rama feature. Si fase 5 tarda 6 sesiones en lugar de 4, no pasa nada — la rama feature aguanta. Solo se mergea a main al cierre completo.

### Riesgo 5 — Errores §9.4 del CTO durante fase 5

**Mitigación:** disciplina bicapa estricta (ver `CLAUDE.md` y prompt de sesión 17). Verificación al carácter desde shell de Ramón en cada predicción de tamaño. No comitear sin `wc -l` previo. Si CTO recomienda atacar deuda fuera de orden, releer principio rector.

### Riesgo 6 — Petición fuera de orden durante fase 5

**Mitigación:** si Ramón pide atacar deuda UX no asignada a sub-fase actual, **CTO advierte una vez con razón clara**. Si Ramón insiste tras advertencia, ejecuta y documenta como excepción. NO inventar urgencia operativa para justificar desvío.

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
10. **NO** usar Claude Code en sesión 17 ni 18. Sesiones 17-18 son planificación. Implementación a partir de sesión 19.
11. **NO** comitear si los 3 greps de invariantes fase 4 (§2.2) fallan.
12. **NO** documentar/comentar código que ya funciona "porque ya estoy aquí". Solo cambios funcionales necesarios.

---

## §8 — Estimación temporal y secuencia de sesiones

> Estimaciones aproximadas. Sesiones 16 y anteriores muestran subestimación recurrente del 30-50% — añadir margen.

| Sesión | Sub-fase | Tipo | Tiempo estimado |
|---|---|---|---|
| 17 | PASO 0 + plan v1 | Planificación | ~3-4h (en curso) |
| 18 | Plan v2 + inventario más profundo | Planificación | ~2-3h |
| 19 | 5b — lifecycle plugin LWC | Implementación | ~2-3h |
| 20 | 5c — handler TF descomposición | Implementación | ~2-3h |
| 21 | 5d — contrato chartTick + deuda 5.1 | Implementación | ~3-4h (la más grande) |
| 22 | 5e — decisión parche 4.6 | Implementación | ~1-2h |
| 23 | 5f — limpieza | Implementación | ~2h |
| 24 | 5g — cierre + smoke producción + HANDOFF | Cierre | ~2-3h |

**Total estimado:** 8 sesiones (~17-24h de trabajo).

**Importante:** este calendario es propuesta. Ramón decide ritmo. Si en algún momento decide pausar fase 5 para validación pasiva en producción (estilo cierre de fase 4d), la rama feature aguanta.

---

## §9 — Material pendiente para sesión 18 (plan v2)

Ramón, esto es lo que **falta verificar al carácter** antes de empezar implementación:

### §9.1 Inventario al carácter pendiente

1. **`vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js`** — ¿expone `destroy()` o `dispose()` el plugin? Decide si necesitamos parche al fork en sub-fase 5b.
2. **`components/_SessionInner.js` L891** — qué dispara `setChartTick` en este sitio (segundo disparador detectado).
3. **`components/RulerOverlay.js`** y **`components/PositionOverlay.js`** — ¿reciben `chartTick` como prop? ¿lo leen? Necesario para sub-fase 5d.
4. **Polling 300ms `getSelected()`** — localizar al carácter (mencionado en `core-analysis.md §7 punto 6`, probablemente en `_SessionInner.js` o `useDrawingTools.js`).
5. **Bloque debug `__algSuiteExportTools`** — localizar al carácter (`core-analysis.md` apunta a L1138 pero verificar).
6. **Race B5 — disparadores de `saveSessionDrawings`** — qué eventos lo gatillan. Hipótesis: `onAfterEdit` + autosave. Verificar.

### §9.2 Decisiones pendientes

1. **Sub-fase 5b — ¿parche al fork o no?** Depende de §9.1.1.
2. **Sub-fase 5c — ¿módulo nuevo `lib/tfTransition.js` o función dentro de `chartViewport.js`?** Depende del tamaño y de si la lógica reutiliza otras del módulo.
3. **Sub-fase 5e — decisión parche 4.6.** No se puede tomar hasta tener 5b/5c/5d implementadas.

### §9.3 Procedimiento sesión 18

1. PASO 0: lectura al carácter de los puntos §9.1.
2. Refinamiento del plan a v2 con bytes verificados.
3. Decisiones §9.2 cuando sea posible.
4. Si v2 está aprobado por Ramón: arrancar sesión 19 con sub-fase 5b.

---

## §10 — Aprobación

Este plan es **v1 — borrador.** No se ejecuta nada hasta que Ramón lo apruebe explícitamente o pida cambios. Si aprobado:

1. Comitear este archivo a rama feature `refactor/fase-5-drawings-lifecycle` (no a main aún).
2. Cerrar sesión 17 con HANDOFF.
3. Sesión 18: redactar v2 con bytes pendientes en §9.

Si requiere cambios, iterar v1 → v1.1 → ... antes de comitear.

---

*Fin del plan v1 fase 5. Redactado en sesión 17 por CTO/revisor. Pendiente revisión por Ramón.*
