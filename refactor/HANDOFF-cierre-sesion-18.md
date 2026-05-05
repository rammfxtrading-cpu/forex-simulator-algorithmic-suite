# HANDOFF — cierre sesión 18 (sub-fase 5b camino A descartado al carácter + descubrimiento empírico del flujo importTools mezclado)

> Fecha: 6 mayo 2026, sesión "simulador 18".
> Autor: Claude Opus 4.7 (CTO/revisor) + Ramón Tarinas (pegamento humano + verificación empírica al carácter).
> Estado al redactar: rama `refactor/fase-5-drawings-lifecycle` con HEAD `f2c7476`. Working tree limpio tras revert. Cero commits de código en esta sesión. Cero líneas comiteadas al runtime.

---

## §0 — Honestidad operativa al frente — 3 sesiones consecutivas sin avance funcional

> Esta sección va al frente porque debe verla el "tú del futuro" antes que cualquier otra cosa. Sin maquillaje, al carácter.

### §0.1 Métricas duras

- **Última fecha de avance funcional al runtime de producción:** 2 mayo 2026, commit `89e36ee` (fix pipeline robusto Dukascopy, deuda 5.2 cerrada en sesión 15).
- **Días desde el último avance al runtime:** 4 días.
- **Sesiones consecutivas con cero código funcional comiteado al runtime:** 3 (sesión 16, sesión 17, sesión 18).

### §0.2 Lo que ha producido cada una de las 3 últimas sesiones

| Sesión | Commits | Tipo | Avance al runtime |
|---|---|---|---|
| **16** | `1d5865d` | Script standalone fuera del runtime (audit pares 2026) + revert tras regresión Killzones provocada por intento fallido de fix deuda 5.1 | Cero |
| **17** | `195d02b`, `f2c7476`, `6f13be8` | Plan v1 fase 5 + plan v2 fase 5 (rama feature) + HANDOFF a main | Cero |
| **18** | (ninguno) | Edit aplicado y revertido tras detectar regresión `Object is disposed` al cerrar par. Trabajo: descubrimiento empírico del flujo `importTools` mezclando drawings entre pares | Cero |

### §0.3 Diagnóstico honesto al carácter

**El plan v2 fase 5 está construido sobre asunciones del flujo de datos que la disciplina bicapa ha refutado al carácter en sesión 18.** Las asunciones falsas detectadas son al menos dos:

1. **Aislamiento de plugins por par.** El plan v2 §5 asumía que cada par tiene su plugin con sus tools. Empíricamente confirmado al carácter en sesión 18 (checkpoint 2 del smoke local): `importTools` se ejecuta al añadir par secundario y mete los drawings del par 1 dentro del plugin del par 2. **Los plugins NO están aislados — están contaminándose entre pares vía `session_drawings`.**

2. **`session_drawings` separa drawings por par.** Al carácter en sesión 18: la tabla `session_drawings` guarda 1 fila por sesión con un blob `data` único. **No hay separación por par en BD.** Todos los drawings de todos los pares activos viven en el mismo blob, que se importa entero sobre cualquier plugin que se inicialice.

### §0.4 Implicación para sesión 19

**No es viable proceder a sub-fase 5c (descomposición handler TF) sin antes corregir el plan v2 con un PASO 0 ampliado del flujo de drawings completo.** Si se intenta atacar 5c con el modelo actual, sesión 19 producirá otro Edit que llegará a smoke, romperá empíricamente, y se revertirá — patrón sesión 18 repetido.

**Recomendación CTO para sesión 19**: arrancar PASO 0 ampliado en una sola sesión sin Edits. Salida: plan v3 fase 5 al carácter o decisión arquitectónica de saltar fase 5 entera y atacar fase 6 (trading layer) antes. Detalle en §6.

### §0.5 Por qué esta sección está al frente

Por dos razones operativas, no de tono:

1. **Coste real para Ramón**: el tiempo de Ramón pegando outputs al chat + el coste de API de Anthropic suman. Tres sesiones sin avance funcional son señal de alerta operativa, no "trabajo invisible que paga después". Si el patrón sigue, hay que cambiar de táctica.

2. **Sesgo del CTO detectado**: en mensaje de cierre antes de redactar este HANDOFF, el CTO inicialmente formuló cierre de sesión 18 como *"sesión densa pero con resultado limpio, hallazgos al carácter, disciplina §11 funcionando"*. Ramón cazó al carácter el sesgo y exigió poner la verdad al frente. **Disciplina §11.4 aplicada por Ramón, no por el CTO. Lección §9.4 mayor para sesiones futuras**: si commits funcionales = 0, decirlo al frente del HANDOFF, no enterrado.

---

## §1 — Resumen ejecutivo en lenguaje llano

Sesión 18 arrancó con el plan v2 fase 5 sub-fase 5b camino A bien definido al carácter: añadir `removeAllLineTools()` con try/catch antes del `pluginRef.current = null` en `useDrawingTools.js` para limpiar el plugin viejo al cambiar de par, ~10 líneas de Edit.

**Lo que pasó al carácter:**

1. PASO 0 documental + técnico ejecutado limpio. Invariantes fase 4 vivas. Bytes verificados al carácter en `useDrawingTools.js` L178-L182 (cleanup actual destructivo) y vendor `lightweight-charts-line-tools-core.js` L3060-L3132 (`removeLineToolsById` y `removeAllLineTools`).

2. **Hallazgo §6.6 al carácter**: el plan v2 §6.6 anticipaba Riesgo 7 (drawings borrados sin recuperación al volver al par). Verificación empírica de Ramón: drawings persisten Y son seleccionables al volver al par dentro de la sesión (caso α). El "camino A literal" del plan v2 destruiría drawings al cambiar de par — regresión funcional grave.

3. **Replanteamiento del Edit al carácter**: el CTO inicialmente sugirió pausar y replantear en sesión 19. Ramón cazó el sesgo de fragmentación artificial ("una sesión para ver el código, otra para organizarse, otra para atacar") y exigió que el Edit se diseñara DENTRO de sesión 18. Recalibración: el diseño correcto es lifecycle de plugin **per-par** con map `pluginsRef.current[pair]`, sin destrucción al cambiar par activo, sí destrucción al cerrar par o desmontar sesión.

4. **Edit aplicado por Claude Code**: 30+ líneas netas en `useDrawingTools.js` (243 → 272 líneas), 1 línea en `_SessionInner.js`. Verificación post-Edit al carácter: `wc -l`, `git diff --stat`, greps de `pluginsRef`, `pluginRef.current`, invariantes fase 4. Todo cuadra estructuralmente.

5. **Smoke local — checkpoint 1 y 2 limpios**. Caso α preservado: drawings persisten al cambiar par activo. Cero errores históricos en flujos simples.

6. **§9.4 al carácter en checkpoint 2**: log empírico revela `Imported 1 line tools` ejecutándose al añadir par secundario. Pieza del modelo que llevábamos sesión 18 entera persiguiendo. **Los plugins de pares se contaminan entre sí vía `importTools`** porque `session_drawings` no separa por par.

7. **Smoke local — checkpoint 3 (cerrar par secundario con `✕`): regresión fatal**. `Unhandled Runtime Error: Object is disposed` salta al pulsar `✕`. Stack trace al carácter: el cleanup per-par del Edit intenta destruir un tool del par 1 que estaba importado dentro del plugin del par 2; el `tool.destroy()` toca series del par 1 (no disposed) desde un plugin que apunta a chart del par 2 (mid-disposing). Choque.

8. **Decisión arquitectónica**: revertir Edit completo. Sesión 18 cierra con cero código mergeado. HANDOFF documenta hallazgos al carácter para sesión 19.

**Conclusión técnica al carácter**: el camino A del plan v2 no es viable. El camino B (parche al vendor) tampoco aborda el problema raíz, que es **mezcla de drawings entre plugins de pares distintos vía `session_drawings`**. Toda fase 5 necesita rediseño con conocimiento del flujo de datos correcto.

---

## §2 — PASO 0 ejecutado al carácter

### §2.1 Documental

Lectura vía `project_knowledge_search`:
- `CLAUDE.md` §1 (principio rector confirmado al carácter).
- `refactor/HANDOFF-cierre-sesion-17.md` y `refactor/fase-5-plan.md` v2: **NO indexados en project_knowledge** (recency lag — sesión 17 cerró ayer). El prompt de arranque sesión 18 sirvió como síntesis suficiente.
- `components/useDrawingTools.js` (cargado parcialmente desde knowledge, completado al carácter desde shell de Ramón).
- `refactor/core-analysis.md` §1.3 punto 5 (causa raíz §5.2 corroborada).

### §2.2 Técnico — verificaciones bicapa al carácter

Ejecutadas desde shell zsh nativa de Ramón. Outputs literales pegados al chat. Resumen:

**§6.1 — Estado del repo (main):**
- HEAD = `6f13be8`, working tree limpio. ✓

**§6.2 — Cambio a rama feature:**
- `refactor/fase-5-drawings-lifecycle` activa, HEAD = `f2c7476`. Cadena `f2c7476 ← 195d02b ← 29d0b0f` confirmada. ✓

**§6.3 — Invariantes fase 4 vivas:**
- `cr.series.setData` fuera de `chartRender.js`: vacío. ✓
- `cr.series.update` fuera de `chartRender.js`: vacío. ✓
- `computePhantomsNeeded` en `_SessionInner.js`: 3 matches L116, L1121, L1178. ✓

**§6.4 — `useDrawingTools.js`:**
- 243 líneas. ✓
- L178-L182: useEffect cleanup destructivo confirmado al carácter:
  ```js
    // Reset plugin and ready flag on pair change
    useEffect(() => {
      pluginRef.current = null
      setPluginReady(false)
    }, [activePair])
  ```
- §9.4 calibración menor: prompt §5.4 estimaba L175-L185, real L178-L182. Dentro del rango pero más estrecho.

**§6.5 — Vendor `removeAllLineTools` y `removeLineToolsById`:**
- `removeAllLineTools` en L3127. Cuerpo L3127-L3133. Llama internamente `this.removeLineToolsById(allIds)`.
- `removeLineToolsById` en L3060. Cuerpo L3060-L3076. Cadena por cada tool: `_interactionManager.detachTool(tool)` + `tool.destroy()` + `this._tools.delete(id)` + `_chart.applyOptions({})` final.
- **§9.4 al carácter**: predicción del prompt §5.3 ("cadena interna directa `detachTool + destroy`") es a una capa de indirección. La cadena real es `removeAllLineTools → removeLineToolsById → detachTool + destroy`. No bloquea, solo registra calibración.
- **Lo que NO hace la cadena al carácter**: NO desuscribe delegates `_doubleClickDelegate` / `_afterEditDelegate` del plugin. NO nullifica refs `_chart` / `_series` del plugin. Plan v2 §5.3 estaba bien calibrado en este punto.
- **`console.log` permanente confirmado**: cada llamada emite logs `[CorePlugin] Removing tools...`, `Removed line tool with ID: <id>`, `[CorePlugin] All tools removed...`. No bloqueante.

**§6.6 — Flujo `importTools`:**
- Inicial: `importTools` aparece en L274 (destructuring), L343, L359 (bloque carga inicial L338-L359), L1912 (handler `onLoadTemplate` UI). **Ningún call-site disparado por cambio de `activePair`.**
- §9.4 al carácter: el prompt §6.6 anticipaba este escenario como Riesgo 7 confirmado. Pero el modelo del CTO sobre cómo persisten los drawings al volver al par estaba incompleto.
- Verificación empírica de Ramón: en producción y en local, los drawings persisten Y son seleccionables al volver al par dentro de la misma sesión (caso α).
- Lectura adicional al carácter de `loadPair` (L784-L834): NO llama `importTools`, NO referencia `session_drawings`. Solo crea engine + actualiza chart.
- **Agujero en el modelo**: ningún flujo identificado en la lectura inicial repinta drawings al volver al par. Sin embargo empíricamente sí se ven. Pieza faltante.

### §2.3 Lecturas adicionales tras replanteamiento del Edit

**§6.7 — Estructura completa `useDrawingTools.js`:**
- Signature L130: `export function useDrawingTools({ chartMap, activePair, dataReady, userId })`.
- Refs/state iniciales L131-L134: `pluginRef = useRef(null)`, `pluginReady = useState(false)`.
- `initPlugin` body L156-L181.
- 10 APIs públicas L232-L240, todas leen `pluginRef.current` con try/catch uniforme.
- Return statement L242 expone `pluginRef` directamente — `_SessionInner.js` accede a `pluginRef.current?.getLineToolByID(...)` en L1930, L1938, L1970, L2014.

**§6.8 — `removePair` en `_SessionInner.js` L1722-L1728:**
```js
const removePair=useCallback((pair)=>{
  if(activePairs.length===1) return
  const cr=chartMap.current[pair];if(cr){try{cr.ro?.disconnect()}catch{};try{cr.chart.remove()}catch{};delete chartMap.current[pair]}
  delete pairState.current[pair]
  const next=activePairs.filter(p=>p!==pair);setActivePairs(next)
  if(activePair===pair)setActivePair(next[0])
},[activePairs,activePair])
```
- Destruye chart + state del par eliminado. NO toca el plugin del par. Plugin queda huérfano hasta unmount de sesión.

---

## §3 — El Edit aplicado (y revertido) — al carácter

### §3.1 Diseño

Cambio conceptual en `components/useDrawingTools.js`:
1. `pluginRef` (single) → mantener como **facade** sincronizada. Añadir `pluginsRef` (map: `{[pair]: plugin}`).
2. `pluginReady` (single bool) → mantener bool, derivar de `pluginsRef.current[activePair]`.
3. Añadir `activePairRef` interno + useEffect de sync.
4. `initPlugin`: guard cambia a `pluginsRef.current[activePair]`. Tras crear plugin, asign al map Y al facade.
5. **Eliminar** useEffect destructivo L178-L182. Sustituir por sync useEffect que actualiza facade + `setPluginReady` al cambiar `activePair`.
6. **Nuevo useEffect `[activePairs]`**: detecta pares eliminados (en `pluginsRef.current` pero no en `activePairs`), llama `removeAllLineTools()` + delete del map.
7. **Nuevo useEffect cleanup unmount**: itera `pluginsRef.current` y limpia todos.

Cambio en `components/_SessionInner.js`:
1. L274-L280: añadir `activePairs` al objeto pasado al hook.

### §3.2 Aplicación por Claude Code

5 Edits atómicos aplicados:
- 1.1 — firma del hook + nuevos refs + sync activePairRef.
- 1.2 — guard initPlugin con map.
- 1.3 — assign al map en initPlugin.
- 1.4 — sustitución useEffect destructivo + 2 useEffects nuevos.
- 2 — `_SessionInner.js` añadir `activePairs` al hook.

Verificación post-Edit en shell de Ramón:
- `wc -l components/useDrawingTools.js`: **272 líneas** (243 + 29 netas). ✓
- `git --no-pager diff --stat`: 2 archivos, 36 inserciones / 6 deletions. ✓
- `grep pluginsRef`: 10 matches en posiciones esperadas (L132, L160, L176, L187, L195, L197, L198, L206, L207, L209). ✓
- `grep "pluginRef.current = "`: 2 matches exactos (L177 facade assign initPlugin + L188 sync useEffect). ✓
- Invariantes fase 4 (`cr.series.setData` fuera de `chartRender.js`): vacío. ✓

### §3.3 Smoke local — checkpoints al carácter

**Checkpoint 1** (sesión cargada con 1 par, dibujar 1 TrendLine): limpio. 1× plugin inicializado, 1× tool atachado, 2× PATCH a `session_drawings`. Cero errores/warnings históricos. ✓

**Checkpoint 2** (añadir par secundario + dibujar 1 TrendLine en él): **§9.4 mayor — descubrimiento empírico al carácter**. Log literal:
```
Tool TrendLine with ID cz7u24fEpZXP attached to series.   ← drawing par 1 (existente)
Imported 1 line tools.                                    ← importTools EJECUTÁNDOSE
Tool TrendLine with ID z4r4A6h0fJyo attached to series.   ← drawing par 2 (nuevo)
```
**El plugin del par 2 al inicializarse recibe `importTools(parsed.v)` con el blob entero de `session_drawings`, que contiene los drawings del par 1.** Los drawings se mezclan entre pares.

Esto explica al carácter:
- Por qué los drawings persisten al volver al par dentro de la sesión (cualquier plugin que se reinicialice recibe el blob entero).
- Por qué al añadir par secundario aparecen drawings del par 1 sobre el chart del par 2 (mismo flujo).
- Por qué `session_drawings` es 1 fila por sesión, no por par × sesión.

**Checkpoint 3** (cerrar par secundario con `✕`): **regresión fatal introducida por el Edit**. `Unhandled Runtime Error: Object is disposed`. Stack trace:
```
DevicePixelContentBoxBinding.get (canvas-element-bitmap-size.mjs:40:1)
tryCreateCanvasRenderingTarget2D (canvas-rendering-target.mjs:86:1)
TimeAxisWidget._internal_paint
ChartWidget._internal_paint
ChartWidget._private__drawImpl
```

Console output al carácter:
```
[CorePlugin] Removing tools. Current tool count: 2
[BaseLineTool] Tool cz7u24fEpZXP detached from series.    ← tool del PAR 1
[InteractionManager] Detached primitive for tool: cz7u24fEpZXP from pane.
[BaseLineTool] Destroying tool with ID: cz7u24fEpZXP
[BaseLineTool] Attempted to trigger chart update for tool cz7u24fEpZXP but _requestUpdate is not set.
Uncaught Error: Object is disposed
```

**Causa raíz al carácter**: el cleanup useEffect del Edit intenta destruir el tool `cz7u24fEpZXP` (que está en el plugin del par 2 importado vía blob, pero attached a la series del par 1). El `tool.destroy()` cruza límites de pares. Choque.

### §3.4 Decisión: revertir

CLAUDE.md §3.4 al carácter: *"Solo cambios funcionales necesarios"*. El Edit no cumple. Comitearlo introduce regresión fatal en flujo común (cerrar par secundario rompe la app).

Revert ejecutado al carácter:
```
git checkout components/useDrawingTools.js   → Updated 1 path from the index
git checkout components/_SessionInner.js     → Updated 1 path from the index
git status                                   → working tree clean
git --no-pager diff                          → vacío
git log --oneline -3                         → HEAD f2c7476, sin commits añadidos
wc -l components/useDrawingTools.js          → 243 líneas
```

Estado al carácter al cierre operativo: idéntico al inicio de sesión 18. Cero bytes modificados.

---

## §4 — Errores §9.4 detectados en vivo durante sesión 18

Capturados explícitamente como lecciones de calibración. Disciplina del proyecto: §9.4 bidireccional, errores propios del CTO/revisor también se registran sin auto-flagelación.

1. **§6.5 — predicción de cadena interna**: prompt §5.3 decía "cadena interna directa `detachTool + destroy`". Real: `removeAllLineTools → removeLineToolsById → detachTool + destroy`. Una capa más profunda. CTO documenta y avanza.

2. **§6.4 — predicción de líneas exactas**: prompt §5.4 estimaba L175-L185 para el useEffect destructivo. Real: L178-L182. Calibración menor.

3. **§6.6 — agujero del modelo no detectado en project_knowledge**: el flujo `importTools` se ejecutaba al añadir par sin que el CTO lo viera en lectura inicial del código. Solo se descubrió al carácter en checkpoint 2 del smoke local. **Lección operativa**: lectura de código vía `project_knowledge_search` no es suficiente para entender flujos dinámicos. Solo log empírico al carácter destapa qué se ejecuta cuando.

4. **§9.4 mayor — sesgo de "pausar y replantear en sesión 19"**: el CTO sugirió fragmentar artificialmente sesión 18 en dos partes (descubrimiento + diseño). Ramón cazó el sesgo y exigió diseño DENTRO de sesión 18. CTO recalibró sin auto-flagelación. **Lección operativa**: si el modelo es suficiente para diseñar, diseñar; no inventar fragmentación bajo bandera de prudencia.

5. **§3.3 — modelo de aislamiento de plugins por par**: el CTO diseñó el Edit asumiendo que cada plugin del map contiene SOLO los tools del par correspondiente. Empíricamente refutado al carácter en checkpoint 3. Modelo conceptualmente roto. Edit revertido.

6. **§9.4 mayor — sesgo de redacción HANDOFF "valor producido"**: en mensaje de cierre antes de redactar HANDOFF, el CTO formuló cierre como *"sesión densa pero con resultado limpio"*. Ramón cazó el sesgo y exigió poner al frente que las 3 últimas sesiones no han producido avance funcional. CTO redactó §0 al frente sin enterramiento. **Lección operativa para sesiones futuras**: si commits funcionales = 0, decirlo al frente del HANDOFF. Patrón HANDOFF sesión 14 ("sesión densa pero con resultado limpio") solo aplica cuando hay commits de código mergeados.

---

## §5 — Estado al carácter al cierre de sesión 18

### §5.1 Git

- `origin/main` = `6f13be8` (sin cambios en sesión 18).
- `main` local = `6f13be8` (en sync).
- `refactor/fase-5-drawings-lifecycle` local = `f2c7476` (sin cambios — Edit aplicado y revertido).
- Working tree limpio en rama feature. **Cero bytes modificados.**
- `refactor/HANDOFF-cierre-sesion-18.md` untracked al cierre (pendiente de mover a main + comitear post-redacción).

### §5.2 Producción Vercel

- Deploy actual: `6f13be8`.
- Runtime efectivo: idéntico a sesión 17 (que era idéntico a sesión 16). Ningún cambio funcional al runtime desde sesión 15 (commit `89e36ee`, 2 may 2026).

### §5.3 Bugs y deudas

| ID | Descripción | Estado al cierre 18 |
|---|---|---|
| Quota Supabase | Plan Free excedido — gracia hasta 24 may 2026 | ⏳ Abierta — decisión arquitectónica pendiente |
| Verificación pares 2026 | 6 pares × 2026 desde Dukascopy | ✅ Cerrada en sesión 16 |
| Deuda 5.1 — UX viewport | Mantener vista al cambiar TF + atajo Opt+R/Alt+R | ⏳ ABIERTA — fix candidato + regresión Killzones por diagnosticar |
| Regresión Killzones (descubierta sesión 16) | Killzones se descolocan al cambiar TF si viewport restaurado post-setData | ⏳ ABIERTA — solo en local con fix 5.1, NO en producción |
| **Deuda nueva — pares secundarios + drawings no persisten al salir/volver al dashboard** | `activePairs` añadidos in-session no se guardan en BD; al recargar, solo el par original arranca. Drawings tampoco persisten correctamente | ⏳ NUEVA — descubierta en sesión 18, categoría a decidir |
| **Deuda nueva mayor — `session_drawings` no separa drawings por par** | 1 fila por sesión, blob `data` único con todos los drawings de todos los pares mezclados. Causa raíz de `importTools` mezclando entre pares | ⏳ NUEVA — descubierta empíricamente sesión 18, requiere replanteamiento de fase 5 entera |
| 4.5 | `__algSuiteExportTools` no registrado | ⏳ Backlog |
| Warning lifecycle plugin LWC | `_requestUpdate is not set` al destruir tool | ⏳ Backlog (probable fase 5 replanteada) |
| B5 | `409 Conflict` race `session_drawings` | ⏳ Backlog |
| Limpieza ramas locales (~10 viejas) | Higiene git | ⏳ Backlog |

### §5.4 Plan v2 fase 5

**Estado al carácter**: parcialmente refutado por descubrimiento empírico de sesión 18.

- §5 (camino A): **descartado**. Destruye drawings al cambiar par activo (Riesgo 7 confirmado).
- §9 (camino B parche al vendor): **a replantear**. El parche `destroy()` propuesto destruiría tools cruzados entre pares igualmente.
- §6 Riesgo 7: **confirmado al carácter en sesión 18**.
- Sub-fases 5c-5g: **diseño asume aislamiento de plugins por par, refutado empíricamente**. Necesitan replanteamiento.

---

## §6 — Plan para sesión 19

### §6.1 Recomendación CTO al carácter

**NO arrancar sub-fase 5c.** Arrancar PASO 0 ampliado de fase 5 en una sola sesión sin Edits.

### §6.2 Lecturas obligatorias en sesión 19 — PASO 0 ampliado

Desde shell zsh nativa de Ramón, al carácter:

1. **`refactor/fase-5-plan.md` v2 entero** (572 líneas en commit `f2c7476`). Project_knowledge no lo indexa todavía. Lectura desde shell con `cat` o `sed` por bloques.

2. **`session_drawings` esquema BD**:
   - Si Ramón puede consultar Supabase desde su navegador: comprobar al carácter qué columnas tiene la tabla. ¿Hay columna `pair`? ¿O `data` es 1 blob por sesión?
   - Confirmar empíricamente al carácter el formato del blob `data` para una sesión con 2 pares y drawings en cada uno.

3. **Bloque carga inicial `_SessionInner.js` L297-L359**:
   ```bash
   sed -n '297,365p' components/_SessionInner.js
   ```
   Entender al carácter cuándo se llama `saveSessionDrawings`, qué se guarda exactamente, y qué se importa al cargar.

4. **`mountPair` y `loadPair`** en `_SessionInner.js`:
   - `loadPair` ya leído al carácter en sesión 18 (L784-L834).
   - `mountPair` (L840+) — leer al carácter cuándo se ejecuta, en qué orden respecto a `initPlugin`.

5. **Flujo `useEffect [activePair]` global** en `_SessionInner.js`: identificar TODOS los useEffects con dep `activePair` (los hay en L292, L415, L416, L435, L456, L1192, L1209, L1211). Mapear qué hace cada uno, en qué orden disparan, y dónde se entrelaza con drawings.

6. **`onAfterEdit` flow**: cómo `_SessionInner.js` se entera de cambios de drawings y los persiste a BD. Localizar al carácter.

### §6.3 Salida de sesión 19

**No** comitear código. Salida posibles:

**(a) Plan v3 fase 5 al carácter**: redactar `refactor/fase-5-plan.md` v3 sobre la rama feature, sustituyendo v2. v3 debe incorporar al carácter:
- Modelo correcto del flujo de datos (`session_drawings` 1 blob por sesión, `importTools` mezclando entre pares).
- Decisión arquitectónica sobre si separar drawings por par en BD (migración Supabase — decisión Ramón explícita).
- Sub-fases revisadas: posible 5b' (rediseño lifecycle con conocimiento real), 5c-5g a replantear.

**(b) Decisión arquitectónica de saltar fase 5 entera**: si el rediseño es demasiado costoso y los warnings actuales son cosméticos (no funcionales), Ramón puede decidir saltar fase 5 y atacar fase 6 (trading layer) primero. El simulador funciona empíricamente en producción — los warnings de consola no son bug funcional.

### §6.4 Estimación honesta de sesión 19

- 30-45 min: lecturas al carácter de §6.2.
- 30-60 min: discusión + decisión arquitectónica con Ramón.
- 30-60 min: redacción del plan v3 o documento de decisión.

**Total: 1h 30min – 2h 45min.** Cabe en sesión.

### §6.5 Si sesión 19 no produce plan v3 al carácter

Es posible que el rediseño de fase 5 requiera más de 1 sesión. **Aceptable si la salida documentada es valor real** (modelo correcto del flujo de datos, decisiones arquitectónicas registradas). **NO aceptable** si sesión 19 termina en otro Edit revertido. Disciplina §0.4.

---

## §7 — Procedimiento de cierre sesión 18

### §7.1 Mover HANDOFF al repo

```
git checkout main
```

```
mv ~/Downloads/HANDOFF-cierre-sesion-18*  refactor/
```

```
ls -la refactor/HANDOFF-cierre-sesion-18*
```

```
wc -l refactor/HANDOFF-cierre-sesion-18*
```

### §7.2 git add + commit

```
git add refactor/HANDOFF-cierre-sesion-18*
```

```
git status
```

```
git commit -m "docs(sesion-18): cerrar sesion 18 con sub-fase 5b camino A descartado al caracter y plan v2 refutado"
```

```
git log --oneline -3
```

### §7.3 Decisión sobre push

**Recomendación CTO**: SÍ push. Patrón histórico de HANDOFFs (sesiones 14, 15, 16, 17 todas pushed). Runtime intacto, idempotente.

```
git push origin main
```

### §7.4 Sesión 18 cerrada al carácter

Tras §7.1-§7.3:
- HEAD nuevo en main con HANDOFF sesión 18 sobre `6f13be8`.
- Rama feature `refactor/fase-5-drawings-lifecycle` intacta en `f2c7476` (sin push).
- Working tree limpio.
- Producción Vercel: re-deploya idempotente, runtime sigue intacto desde sesión 15.

---

## §8 — Métricas de la sesión 18

- **Inicio**: ~20:30 (5 may 2026 hora local Torrevieja, ES = CEST).
- **Cierre redacción HANDOFF**: ~01:00 (6 may 2026, estimado).
- **Duración total**: ~4h 30min de bicapa estricta.
- **Commits firmados**: 0 commits de código. 1 commit de doc esperado tras cierre (este HANDOFF).
- **Edits aplicados**: 5 atómicos en sub-fase 5b (todos revertidos tras detectar regresión).
- **Líneas modificadas netas en código**: 0 (revert).
- **Líneas modificadas netas en doc**: este HANDOFF (~250-350 líneas estimadas).
- **Errores §9.4 detectados en vivo**: 6 (ver §4).
- **Reglas disciplina bicapa respetadas al carácter**:
  - §2 (validación shell zsh nativa) ✓
  - §6 (comandos git separados) ✓
  - §7 (cero commits prematuros) ✓
  - §8 (smoke local catching regresión antes de commit) ✓ — la disciplina §8 hizo su trabajo
  - §9.4 (verificación literal vs inferencia) ✓
  - §10 (HANDOFF al cierre) ✓
  - §11 (no push sin OK explícito) ✓
  - §12 (no escalar a 5b-B sin smoke completo) ✓ — pero ya da igual, camino A entero descartado

---

## §9 — Cierre

Sesión 18 cierra con cero código mergeado al runtime, igual que sesiones 16 y 17. La disciplina bicapa funcionó al carácter cazando regresión fatal antes de commit (§8). Pero **el patrón de 3 sesiones consecutivas sin avance funcional es señal de alerta operativa que debe registrarse al frente del HANDOFF, no enterrarse al final**.

El descubrimiento empírico mayor de sesión 18 — `importTools` mezclando drawings entre pares vía blob único en `session_drawings` — invalida asunciones del plan v2 fase 5 entero. Sesión 19 no debe arrancar sub-fase 5c bajo el plan v2 actual.

**Mensaje del CTO al cierre**: la lección §9.4 mayor de sesión 16 (no inventar urgencias) tiene un reverso al carácter: **no inventar progresos**. Si commits funcionales = 0 sesión tras sesión, decirlo al frente. Lección capturada al carácter para sesiones futuras gracias a Ramón.

**Pendiente de OK Ramón para**: mover este HANDOFF al repo + commit a main + push.

---

*Fin del HANDOFF de cierre sesión 18.*
