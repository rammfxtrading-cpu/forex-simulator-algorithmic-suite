# HANDOFF — cierre sesión 17

> Fecha: 4 mayo 2026, sesión "simulador 17" (~3h efectivas en chat).
> Autor: Claude Opus 4.7 (CTO/revisor) + Ramón Tarinas (pegamento humano).
> Estado al redactar: `main` = `29d0b0f` (HANDOFF sesión 16), sin cambios. Rama feature `refactor/fase-5-drawings-lifecycle` = `f2c7476` (plan v2) sobre `195d02b` (plan v1) sobre `29d0b0f`.

---

## §1 — Contexto y resumen ejecutivo

Sesión 17 con un único objetivo planificado al arranque (prompt sesión 17): **PASO 0 + redactar `refactor/fase-5-plan.md` v1.** Sin Edits de código. Claude Code no se usa.

**Resultado:**

- ✅ **PASO 0 documental cerrado al carácter** — lectura de `CLAUDE.md` §1 (principio rector), `core-analysis.md` §6 fase 5, `HANDOFF-cierre-sesion-16.md`, `useDrawingTools.js`, `useCustomDrawings.js`.
- ✅ **PASO 0 técnico cerrado al carácter** — verificación estado repo, invariantes fase 4, tamaños actuales, mapeo del territorio fase 5 (plugin, persistencia drawings, overlays, `chartTick`).
- ✅ **Plan v1 redactado y comiteado** en rama feature `refactor/fase-5-drawings-lifecycle` (commit `195d02b`, 399 líneas).
- ✅ **Inventario al carácter expandido tras aprobación de Ramón** — bytes verificados de: handler de cambio de TF (L1154-L1192), plugin LWC vendor (búsqueda exhaustiva de métodos cleanup), disparadores de `chartTick`, mapa completo de los 4 overlays sensibles al viewport.
- ✅ **Plan v2 redactado y comiteado** en misma rama (commit `f2c7476`, 572 líneas, +277/-104 vs v1) con bytes verificados, sub-fase 5b refinada en dos caminos (A sin parche / B con parche al fork), sub-fase 5d expandida a 8 sub-pasos (5d.1-5d.8).

**Estado de runtime en producción:** intacto. Cero cambios en `pages/`, `lib/`, `components/`. Solo nuevos archivos `.md` en rama feature.

**Disciplina bicapa al carácter durante toda la sesión:** cero Edits de código, cero pushes, cero acciones destructivas. Verificación shell zsh nativa de Ramón en cada paso.

---

## §2 — Lo que se hizo (técnico)

### §2.1 PASO 0 documental

Lectura vía `project_knowledge_search` de los documentos del prompt §3:

1. `CLAUDE.md` §1 — principio rector confirmado al carácter: *"dejar el core de backtesting del simulador a la calidad de TradingView (drawings) y FX Replay (replay engine). Nada más importa hasta que esto esté sólido."*
2. `core-analysis.md` §6 fase 5 — diseño macro: lifecycle del plugin LWC, `useDrawingTools` recibe `chart`/`series` por parámetro, eliminar polling 300ms de `getSelected()`, ~150 líneas + posible parche al fork. Bugs candidatos: B2, B5, B6, warning lifecycle.
3. `HANDOFF-cierre-sesion-16.md` — estado al cierre: `origin/main` = `1d5865d`, regresión Killzones nueva, §9.4 mayor de patrón de urgencias ficticias.
4. `useDrawingTools.js` — plugin LWC, init asíncrono, **teardown del plugin viejo NO existe**.
5. `useCustomDrawings.js` — store de drawings TEXT/RULER, coordenadas absolutas `{time, price}`, no persiste a Supabase desde el hook (responsabilidad implícita del consumer).

### §2.2 PASO 0 técnico — al carácter desde shell zsh nativa

Outputs literales pegados al chat por Ramón. Resumen de hallazgos:

- **Estado repo:** `main` = `29d0b0f` (HANDOFF sesión 16), working tree limpio, en sync con `origin/main`.
- **Invariantes fase 4:** ✅ los 3 greps esperados.
  - `cr.series.setData` solo en `lib/chartRender.js`.
  - `cr.series.update` solo en `lib/chartRender.js`.
  - `computePhantomsNeeded` en 3 sitios de `_SessionInner.js` (L116 definición, L1121 y L1178 consumers).
- **Tamaños actuales:**
  - `lib/chartViewport.js`: 202 líneas.
  - `components/_SessionInner.js`: 2962 líneas.
  - `components/useDrawingTools.js`: 243 líneas.
  - `components/useCustomDrawings.js`: 62 líneas.
- **Persistencia drawings** (tabla `session_drawings`): definida en `_SessionInner.js` L297 (`saveSessionDrawings`), L317/L325/L338 (operaciones Supabase), L331 (ref).
- **Killzones componente:** `KillzonesOverlay` recibe `chartTick` como prop pero **NO lo destructura**. Hallazgo crítico — explica al carácter por qué el fix de la deuda 5.1 rompió las Killzones en sesión 16.
- **Disparadores de `chartTick`:** L237 (declaración), L891 (sitio A: dentro de `subscribeVisibleLogicalRangeChange`), L1189 (sitio B: handler TF).

### §2.3 Inventario al carácter expandido (post-plan v1)

Tras aprobación de Ramón ("avanzamos, yo decido cuando se termina esta sesión"), se realizó inventario más profundo para preparar plan v2:

**Handler de cambio de TF (L1154-L1192):** `useEffect` que hace 6 cosas mezcladas:
1. Obtener `ps`/`cr`, salir si falta.
2. `deselectAll()` — limpia drawings.
3. Calcular `phantomsNeeded` vía `exportTools()` + `computePhantomsNeeded`.
4. `cr._phantomsNeeded` + `cr.prevCount = 0` + `updateChart(activePair, ps.engine, true)` — fuerza setData.
5. `setTfKey(k => k+1)` — re-render hooks dependientes.
6. `scrollToTail(cr, 8, () => setChartTick(t => t+1))` — scroll y notifica overlays.

**`useDrawingTools.js` teardown:** confirmado al carácter que el `useEffect` con dependencia `[activePair]` solo hace `pluginRef.current = null; setPluginReady(false)`. **Plugin viejo queda vivo en memoria con listeners enchufados al chart anterior.** Esta es la causa raíz arquitectónica de los errores `Series not attached to tool` y `Object is disposed` documentados en CLAUDE.md §9.

**Plugin LWC vendor (`lightweight-charts-line-tools-core.js`, 8737 líneas):**
- Clase `LineToolsCorePlugin` en L2929 — **no tiene `destroy()` propio**.
- Mejor método de cleanup disponible: `removeAllLineTools()` en L3127. Documentado como "performs a full cleanup, detaching every tool".
- Cadena interna: `removeAllLineTools` → `detachTool` (InteractionManager L1814) → `tool.destroy()` (BaseLineTool L6575).
- **Lo que `removeAllLineTools` no hace probablemente:** desuscribir delegates `_doubleClickDelegate`/`_afterEditDelegate`, ni nulificar refs `_chart`/`_series` del plugin.

**Implicación para sub-fase 5b:** dos caminos viables.
- **Camino A (intentar primero):** llamar `pluginRef.current.removeAllLineTools()` antes de `pluginRef.current = null`. Sin parche al fork.
- **Camino B (escalar si A no basta):** parche al fork añadiendo `destroy()` a `LineToolsCorePlugin` (~10 líneas).

**Disparador A de `chartTick` (L888-L892):**

```js
chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{
  const _cr=chartMap.current[pair]
  markUserScrollIfReal(_cr)
  setChartTick(t=>t+1)
})
```

Se dispara cada vez que cambia el rango lógico visible (zoom, pan, scroll, cambios programáticos del viewport).

**Mapa de overlays sensibles al viewport (4 totales):**

| Overlay | Ubicación | Recibe `chartTick`? | Mecanismo real de reactividad |
|---|---|---|---|
| `KillzonesOverlay` | archivo propio | Sí pero **NO lo destructura** | `tick` + suscripción LWC interna (presumible) |
| `RulerOverlay` | archivo propio | No | Suscripción LWC interna (presumible) |
| `CustomDrawingsOverlay` | archivo propio | No | `tfKey` + `subscribeVisibleLogicalRangeChange` |
| `PositionOverlay` | helper local en `_SessionInner.js` L2796 | No | Por verificar al carácter en sesión 21 |

**Hallazgo crítico arquitectónico:** **ninguno de los 4 overlays consume `chartTick` directamente.** Cada uno improvisó su propio mecanismo. Esto es la causa raíz arquitectónica de la regresión Killzones de sesión 16 — el fix esperaba un canal que en realidad no estaba conectado.

### §2.4 Plan v1 redactado y comiteado

- Rama feature creada: `git checkout -b refactor/fase-5-drawings-lifecycle`.
- Archivo `refactor/fase-5-plan.md` v1 — 399 líneas, 23681 bytes — redactado por CTO en chat web.
- Movido a `refactor/` desde `~/Downloads/` por Ramón.
- Comiteado: `195d02b docs(fase-5): plan v1 de fase 5 drawings lifecycle (sesion 17)`.
- **Sin push** — decisión Ramón al cierre + recomendación CTO de no pushear v1 antes de v2.

Estructura de v1: 10 secciones (contexto, inventario, diagnóstico, criterios, sub-fases 5b-5g, riesgos, NO HACER, estimación, pendientes, aprobación). Sub-fase 5b inicial sin distinción de caminos A/B (refinada en v2).

### §2.5 Plan v2 redactado y comiteado

Tras inventario expandido (§2.3), redacción de v2 con bytes verificados.

- Archivo `refactor/fase-5-plan.md` reemplazado en mismo nombre. v1 sigue vivo en commit `195d02b` para trazabilidad.
- v2: 572 líneas, 32387 bytes, +277 inserciones / -104 eliminaciones vs v1.
- Comiteado: `f2c7476 docs(fase-5): plan v2 con inventario al caracter sesion 17`.

**Diferencias clave v1 → v2:**

- §2.5 nuevo — análisis al carácter del plugin LWC vendor.
- §2.8 nuevo — disparadores de `chartTick` documentados.
- §2.9 nuevo — mapa completo de los 4 overlays.
- Sub-fase 5b refinada en caminos 5b-A / 5b-B con criterio de escalado.
- Sub-fase 5d expandida a 8 sub-pasos (5d.1-5d.8) — cada overlay como commit propio.
- Riesgo 7 nuevo (`removeAllLineTools` puede borrar drawings vivos, mitigación documentada).
- §9 reducido de 8 puntos pendientes a 6 puntos para sub-fases concretas.

---

## §3 — Errores §9.4 detectados en vivo durante sesión 17

Disciplina §9.4 estricta: distinguir lo verificado de lo inferido. Capturados explícitamente como lecciones de calibración.

### §3.1 Predicción optimista sobre `destroy()` del plugin

Al ver el primer `grep` que devolvió `destroy()` en L429 y L6575, anuncié al chat: *"✅ Excelente noticia. El plugin sí tiene `destroy()` — dos métodos en concreto"* y declaré que **NO hace falta parchear el fork**. **Verificación posterior** (al pedir el `sed -n '6570,6615p'`) reveló que ambos `destroy()` son de `BaseLineTool` (cleanup individual por herramienta), no del plugin global. Tuve que rectificar.

**Patrón:** afirmar como verificado lo que era inferencia desde un grep aislado sin contexto.

**Mitigación:** ya aplicada en este HANDOFF y en plan v2 — los métodos `destroy()` están etiquetados con su clase de origen. Aprendizaje: **un `grep` por palabra clave NO equivale a verificación arquitectónica.** Antes de declarar un hallazgo, leer el contexto al carácter.

### §3.2 Inferencia inicial sobre overlays

En plan v1 §2.9 enumeré 4 overlays incluyendo `PositionOverlay.js` y `RulerOverlay.js` como archivos separados. **Verificación** (`ls components/ | grep -i "overlay"`) reveló que `PositionOverlay.js` **NO existe como archivo** — es helper local en `_SessionInner.js` L2796. Lo corregí en plan v2.

**Patrón:** asumir estructura de archivos sin verificar al carácter. Inferencia desde nombre del componente sin confirmar dónde vive.

**Mitigación:** verificar listado de archivos al carácter antes de declarar inventario completo.

### §3.3 Subestimación inicial del tamaño del plan

v1 = 399 líneas. v2 = 572 líneas (+43%). El crecimiento vino del inventario expandido §2.3. No es error puro — los hallazgos justifican el crecimiento — pero confirma el patrón documentado en HANDOFFs previos: estimaciones iniciales de tamaño tienden a quedarse cortas en este proyecto.

**Mitigación ya activa:** plan v2 §8 estima 8 sesiones de implementación (vs 6 en v1) con margen +30-50% sobre estimaciones puntuales por sub-fase.

### §3.4 Sin §9.4 mayor en sesión 17

A diferencia de sesión 16 (§9.4 mayor de patrón de urgencias ficticias), sesión 17 ha respetado el principio rector al carácter. CTO no propuso atacar deudas UX fuera de orden en ningún momento. Verificación: revisar este HANDOFF al carácter — no hay rastro de "alumnos esperan", "deadline forzoso", o "scope acotado, encajemos".

---

## §4 — Estado al carácter al cierre de sesión 17

### §4.1 Git

- `origin/main` = `29d0b0f` (sin cambios en push remoto).
- `main` local = `29d0b0f` (en sync con remoto, working tree limpio).
- Rama feature `refactor/fase-5-drawings-lifecycle` = `f2c7476` (plan v2) sobre `195d02b` (plan v1) sobre `29d0b0f`.
- Cadena en main: `29d0b0f ← 1d5865d ← 5cef4e7 ← 3f1da59 ← 89e36ee`.
- Cadena en feature: `f2c7476 ← 195d02b ← 29d0b0f`.

### §4.2 Producción Vercel

- Deploy actual: `29d0b0f` (sin cambios desde sesión 16).
- Runtime efectivo: **idéntico al cierre de sesión 16.**
- Smoke producción **NO requerido** — sesión 17 fue planificación pura, sin Edits.

### §4.3 Bugs y deudas (sin cambios respecto a sesión 16)

| ID | Descripción | Estado al cierre 17 | Encaje |
|---|---|---|---|
| 5.1 | UX viewport — mantener vista al cambiar TF + atajo Opt+R/Alt+R | ⏳ ABIERTA — diseño en plan v2 sub-fase 5d.7 | Sub-fase 5d |
| Regresión Killzones | Killzones se descolocan al cambiar TF si viewport se restaura post-setData | ⏳ ABIERTA — causa raíz arquitectónica identificada (§2.9 plan v2) | Sub-fase 5d |
| 4.5 | `__algSuiteExportTools` no registrado | ⏳ Backlog | Sub-fase 5f.1 |
| Warning LWC `_requestUpdate is not set` | Aparece al destruir tool | ⏳ Backlog | Sub-fase 5b |
| B5 | `409 Conflict` race `session_drawings` | ⏳ Backlog | Sub-fase 5f.3 |
| 4.6 (parche) | Drawings descolocados al cambiar TF (parche `2851ef7` snap floor) | ⏳ ABIERTA — decisión en sub-fase 5e | Sub-fase 5e |
| Quota Supabase | Banner aviso ciclo previo, uso real bajo | ⏳ Vigilancia pasiva | No-acción salvo numeros reales altos |
| Limpieza ramas locales (~10 viejas) | Higiene git | ⏳ Backlog | Sesión corta puntual |
| Warning React `borderColor` shorthand | Cosmético | ⏳ Backlog | Limpieza final fase 7 |

---

## §5 — Plan para sesión 18

### §5.1 Recomendación CTO

Dos opciones legítimas, decisión de Ramón:

**Opción 1 — Validación pasiva (~2-3 días reales).** Ramón juega con producción durante 2-3 días detectando algún edge case que se nos haya escapado en el inventario de sesión 17. Si aparece algo, sesión corta dedicada antes de arrancar 5b. Si no aparece nada, arrancamos 5b directamente.

**Opción 2 — Arranque directo de sub-fase 5b.** Confianza en el plan v2 alta tras inventario al carácter. Sub-fase 5b camino A (sin parche al fork) es de bajo tamaño (~10 líneas en `useDrawingTools.js`) y permite iterar rápido. Si funciona, pasamos a 5c en sesión 20.

**Mi recomendación CTO: Opción 1.** Razones:

1. Sesión 17 fue larga (~3h). Volver con cabeza fresca a la implementación es mejor que encadenar inmediatamente.
2. Plan v2 está fresco y profundo. Pasar 2-3 días con la cabeza en producción real puede revelar comportamiento que no veo desde el código estático.
3. Riesgo 7 del plan v2 (`removeAllLineTools` borra drawings vivos al cambiar par) merece verificación pasiva primero — Ramón puede observar al usar producción si hay flujos donde esto sería problemático.

Si Ramón prefiere Opción 2, ajustamos.

### §5.2 PASO 0 obligatorio en sesión 18

Antes de tocar nada, leer en este orden:

1. `CLAUDE.md` (raíz repo) — principio rector.
2. **`refactor/HANDOFF-cierre-sesion-17.md`** (este documento) — único punto de entrada al estado actual.
3. **`refactor/fase-5-plan.md` v2** (commit `f2c7476` en rama feature).
4. Si Ramón eligió Opción 1 y reporta hallazgo nuevo: investigar al carácter antes de proceder.

Verificación de estado del repo en shell de Ramón:

```bash
cd ~/Desktop/forex-simulator-algorithmic-suite
git status
git log --oneline -10
git branch --show-current
```

Esperado: rama `main` activa, working tree limpio, HEAD = commit del HANDOFF sesión 17 (último visible en log) sobre `f2c7476` (en feature) sobre `195d02b` (en feature) sobre `29d0b0f`.

### §5.3 Si Ramón elige Opción 2 (arranque directo 5b)

Sub-fase 5b camino A:
1. `git checkout refactor/fase-5-drawings-lifecycle` (volver a rama feature).
2. PASO 0 técnico de sub-fase 5b — verificación al carácter:
   - Confirmar que `LineToolsCorePlugin.prototype.removeAllLineTools` existe y es función accesible.
   - Verificar `useDrawingTools.js` entre L175 y L185 (zona del teardown actual) al carácter.
3. Op 1 — Edit propuesto a Claude Code (opción 1 manual) en `useDrawingTools.js`. Tamaño estimado: ~10 líneas.
4. Smoke local exhaustivo: cambio par × 30 ciclos con drawings activos. Verificar consola limpia (cero errores `Series not attached`, `Object is disposed`, `_requestUpdate is not set`).
5. Si todo verde: commit + decisión sobre push.
6. Si aparece warning persistente: escalar a camino 5b-B (parche al fork).

---

## §6 — Reflexión final del CTO/revisor

Sesión 17 fue **limpia en proceso y sólida en resultado.**

**Lo bueno:**

- Disciplina bicapa al carácter durante toda la sesión. Cero Edits de código. Cero pushes (ni v1 ni v2). Cero acciones destructivas. Verificación shell zsh nativa de Ramón en cada paso.
- Principio rector respetado al carácter. CTO no propuso atacar deudas UX fuera de orden en ningún momento. Lección §9.4 mayor de sesión 16 aplicada con disciplina.
- Inventario al carácter del territorio fase 5 más completo que en cualquier sesión previa de planificación. Bytes verificados sobre handler TF, plugin vendor, disparadores `chartTick`, mapa de overlays. Plan v2 descansa sobre verificaciones, no inferencias.
- Hallazgo crítico nuevo descubierto al carácter: **ninguno de los 4 overlays consume `chartTick` directamente.** Esto explica al carácter la regresión Killzones de sesión 16 y eleva la importancia arquitectónica de sub-fase 5d.
- Trabajo separado limpiamente entre `main` (intacta) y rama feature `refactor/fase-5-drawings-lifecycle` (planes v1 y v2). Patrón replicable para futuras fases grandes.

**Lo mejorable:**

- 3 errores §9.4 detectados en vivo (§3). Predicción optimista sobre `destroy()` del plugin (§3.1) es la más relevante — confunde grep con verificación arquitectónica. Lección capturada.
- Plan v1 → v2 creció +43% en líneas. Patrón recurrente de subestimación. Mitigado con margen explícito en estimación temporal del plan v2.
- Decisión sobre HANDOFF en `main` vs rama feature — Ramón delegó al CTO ("eres el cto ahora"). Decisión tomada (main, siguiendo patrón histórico) pero podría haber sido más ágil.

**Tres aprendizajes para fijar:**

1. **Un `grep` aislado NO equivale a verificación arquitectónica.** Antes de declarar un hallazgo desde un grep, leer el contexto al carácter (clase de origen, qué hace el método, qué referencias borra). Aplicado en §3.1 con `destroy()` de `BaseLineTool` vs `LineToolsCorePlugin`.

2. **El inventario al carácter de `chartTick` ↔ overlays es lección estructural.** Lo que parecía un contrato roto entre 1-2 componentes resultó ser ausencia total de contrato entre 4 overlays. **Generalizable:** cuando un mecanismo "obvio" parece roto, verificar al carácter cuántos consumers tiene realmente. Probablemente sean más de los visibles.

3. **El plan v1 → v2 demuestra valor de iteración con bytes.** v1 fue redactado tras PASO 0 mínimo. v2 incorpora inventario expandido y mejora la calidad arquitectónica del plan (sub-fase 5b en dos caminos, 5d en 8 sub-pasos, Riesgo 7 nuevo). **Patrón replicable:** para fases grandes, redactar v1 mínimo, expandir inventario, redactar v2 con bytes. Sesión 18 puede beneficiarse de validación pasiva antes de v3 (si fuera necesario).

---

## §7 — Métricas de la sesión 17

- **Inicio:** ~21:12 (4 may 2026) — login del Mac visible en shell de Ramón.
- **PASO 0 documental:** ~10 min. 5 lecturas vía `project_knowledge_search`.
- **PASO 0 técnico:** ~15 min. 4 bloques de comandos (estado repo, invariantes fase 4, tamaños, mapeo fase 5).
- **Inventario al carácter expandido:** ~45 min. 6 bloques adicionales (handler TF, useDrawingTools cabecera+final, KillzonesOverlay, plugin vendor cleanup, segundo `setChartTick`, overlays).
- **Redacción plan v1:** ~20 min en chat web. 399 líneas, 23681 bytes.
- **Mover + commit v1:** ~5 min con verificación al carácter.
- **Redacción plan v2:** ~25 min en chat web. 572 líneas, 32387 bytes.
- **Mover + commit v2:** ~5 min con verificación al carácter.
- **HANDOFF redactado:** post-cierre de v2.
- **Total estimado:** ~3h efectivas.

---

## §8 — Procedimiento de cierre (próximos pasos en orden estricto)

### §8.1 Inmediato (esta sesión, post-redacción del HANDOFF)

1. Mover `HANDOFF-cierre-sesion-17.md` desde `~/Downloads/` a `refactor/HANDOFF-cierre-sesion-17.md` en el repo.
2. `git add refactor/HANDOFF-cierre-sesion-17.md` (comando separado).
3. `git commit -m "docs(sesion-17): cerrar sesion 17 con plan v1+v2 fase 5 en rama feature"` (comando separado).
4. Decisión de Ramón sobre push:
   - **Si push:** `git push origin main` (comando separado). Vercel re-deploya idempotentemente.
   - **Si no push:** dejar local hasta sesión 18.
5. Sesión 17 cerrada al carácter.

Comandos exactos en §10 abajo.

### §8.2 Próxima sesión (sesión 18)

Decisión Ramón al arrancar:

- **Opción 1 (recomendada CTO):** validación pasiva 2-3 días, sesión corta de hallazgos si los hay.
- **Opción 2:** arranque directo de sub-fase 5b camino A (lifecycle plugin LWC sin parche al fork).

### §8.3 Backlog post-sesión-18 (sin orden estricto, ya planificado en plan v2)

- Sub-fases 5b → 5c → 5d → 5e → 5f → 5g de fase 5.
- Fase 6 — trading domain.
- Fase 7 — reducir `_SessionInner.js`.
- Limpieza ramas locales (sesión corta puntual).
- Saneamiento histórico B4 (decisión separada).

---

## §9 — Aprendizajes generales del proyecto (acumulados sesiones 13-17)

> Sección que persiste a través de HANDOFFs. Sirve como recordatorio para CTO en futuras sesiones.

1. **§9.4 es bidireccional.** Errores propios del CTO también se registran sin auto-flagelación. Patrón: predicción/inferencia → verificación al carácter → registrar discrepancia.
2. **Principio rector (CLAUDE.md §1) es absoluto.** Sin alumnos en producción no hay urgencia operativa. Refactor primero, bugs en su fase, apertura solo tras cierre. Lección §9.4 mayor de sesión 16 grabada.
3. **Validación al carácter en shell de Ramón es no-negociable.** project_knowledge puede estar desactualizado. Output de Claude Code no es validación. Solo bytes en disco vistos en esta sesión cuentan como verificado.
4. **Comandos git separados, no encadenados con `&&`.** Cada uno es decisión revisable.
5. **`git checkout -- <file>` es la herramienta de revert por defecto** (lección sesión 16 §3.4). Más atómico, más seguro.
6. **Killzones es test crítico para cualquier cambio en viewport o handler TF.** Smoke local de Killzones obligatorio en cada sub-fase.
7. **Estimaciones de tamaño suben típicamente 30-50%.** Mitigación: margen explícito + iteración v1 → v2 cuando aplique.
8. **Bug del cliente con `.md`:** el cliente autoformatea `nombre.md` → enlace HTTP. **Solución:** wildcards (`HANDOFF*`) o escapes (`"HANDOFF"".md"`) en comandos shell que toquen archivos `.md`.

---

## §10 — Comandos exactos para cierre de sesión 17

> Todos los comandos usan wildcards o escapes para evitar el bug del cliente con `.md`.

### §10.1 Mover HANDOFF y comitear

```bash
mv ~/Downloads/HANDOFF-cierre-sesion-17.md refactor/HANDOFF-cierre-sesion-17.md
ls -la refactor/HANDOFF*
wc -l refactor/HANDOFF-cierre-sesion-17.md
git add refactor/HANDOFF*
git status
git commit -m "docs(sesion-17): cerrar sesion 17 con plan v1+v2 fase 5 en rama feature"
git log --oneline -3
```

### §10.2 Si Ramón aprueba push (decisión suya)

```bash
git push origin main
```

Espera salida de Vercel deploy en panel (idempotente — sin cambios de runtime).

### §10.3 Si Ramón no quiere push

Cerrar shell. Sesión 17 termina con HANDOFF comiteado solo localmente. En sesión 18 se decide push o no.

---

*Fin del HANDOFF de cierre sesión 17. Redactado por CTO/revisor en chat web. Commit pendiente tras movimiento al repo.*
