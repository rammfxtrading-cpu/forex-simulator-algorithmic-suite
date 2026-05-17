# HANDOFF — cierre sesión 31

> Sesión 31 cerrada el 17 mayo 2026, ~03:00 hora local.
> Sesión 31 = **prioridad 1 deuda 4.6 caso 05:40 RE-INVENTARIO bytes desde cero** según plan táctico HANDOFF s30 §5.1.
> **Resultado al carácter sin maquillaje**: deuda 4.6 caso 05:40 (drawing persistido se descoloca al borde izquierdo en cambio de TF) CERRADA ESTRUCTURALMENTE EN PRODUCCIÓN. Causa raíz localizada y confirmada en bytes empíricos vía instrumentación temporal: rama de extrapolación `givenTimeNum > lastTime` de `interpolateLogicalIndexFromTime` (vendor LWC L1596) devolvía índice lógico FRACCIONAL (capturado en consola: `result=12298.8`), el core LWC lo mapea a x≈0 → endpoint al borde izquierdo. Fix `+1/-1` neta (1 línea envuelta en `Math.floor()`) en `vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js`. Commit `6dd0629` push a `origin/main`. Smoke local 3/3 PASS + smoke producción PASS al carácter (Ramón Mac).
> **CUARTO COMMIT FUNCIONAL EN MAIN POST-CLUSTER-B** — `6dd0629` sobre `c39a8ec` (HANDOFF s30) sobre `99f5e33` (fix modal).
> **Lección §34 (inventario caducado) APLICADA con éxito**: el plan HANDOFF s27 §6.4 (`Math.floor(timeDiff/interval)` L1626) se descartó correctamente como obsoleto. RE-INVENTARIO desde cero localizó el código real (función reescrita y movida tras cluster B). Sin la disciplina §34, s31 habría perdido la sesión atacando líneas inexistentes.
> Próxima sesión = sesión 32, prioridad 1 = deuda acceso-simulador-revoke no-efectivo (severidad ALTA).

---

## §0 — Estado al cierre sesión 31, sin maquillaje

**Sesión 31 produjo 1 commit funcional al carácter en main**: `6dd0629` (fix deuda 4.6 caso 05:40, `Math.floor` rama extrapolación vendor). HEAD main al cierre = `<HASH-HANDOFF-s31>` sobre `6dd0629` sobre `c39a8ec` (HANDOFF s30) sobre `99f5e33` (fix modal) sobre `e870b47` (HANDOFF s29) sobre `68e3772` (5g.2) sobre `34d0cc0` (HANDOFF s28).

`origin/main` = `6dd0629` desde ~02:52 hora local 17 may 2026 + HANDOFF s31 docs post-redacción. Producción Vercel actualizada al carácter automáticamente a runtime efectivo `6dd0629` post-push (~3 min build + deploy).

**Cambio runtime producción al carácter**: cuarto cambio runtime efectivo producción post-cluster-B. `99f5e33` (fix modal) → `6dd0629` (fix deuda 4.6). Producción al carácter ahora cluster B + 5g.1 + 5g.2 + fix-modal + fix-4.6 estable empíricamente al carácter post-deploy.

**Realidad sin maquillaje al carácter**:

1. **Deuda 4.6 caso 05:40 CERRADA ESTRUCTURALMENTE EN PRODUCCIÓN al carácter** — bug abierto y arrastrado desde s12-s27 (plan obsoleto). Validación bicapa estricta completa:
   - RE-INVENTARIO bytes desde cero (lección §34 — plan s27 descartado): la lógica de interpolación timestamp→índice lógico se reescribió y movió tras cluster B. Localizada función real `interpolateLogicalIndexFromTime` en vendor LWC L1580-L1626 (path de render confirmado: `pointToScreenPoint` L6471 → L6479).
   - Caracterización empírica N≥3: TrendLine M3 persistida → cierre sesión → re-entrada M15 → endpoint al borde izquierdo. 3/3 FAIL determinístico pre-fix.
   - Diagnóstico empírico vía instrumentación temporal (4 logs `[CC-DBG]` en `chartCoords.js` descartando ese path + 4 logs `[ILI-DBG]` en vendor localizando rama exacta). Consola capturó verbatim: punto 1 → `snap-floor` (entero, correcto); punto 2 (`givenTimeNum=1763358120 > lastTime=1763346600`) → `EXTRAP-beyond-last result=12298.8` (FRACCIONAL). Causa raíz confirmada al carácter en bytes.
   - Hallazgo: el parche histórico `2851ef7` (s14) aplicó snap-floor SOLO a la rama intermedia (`return lo;`), nunca a la rama de extrapolación `> lastTime`. El caso 05:40 reproducible es esta segunda rama.
   - Fix re-decidido sobre inventario nuevo (NO plan s27): `Math.floor()` envolviendo `(cachedData.length - 1) + (givenTimeNum - lastTime) / interval` (L1596). Coherente con criterio del parche histórico `2851ef7` (ambas ramas snapean a entero).
   - Edit auditado `+1/-1` neta + build PASS + smoke local 3/3 PASS + commit `6dd0629` push + smoke producción PASS al carácter (Ramón Mac).

2. **Lección §34 (inventario caducado) APLICADA CON ÉXITO al carácter — primer caso de aplicación exitosa de una lección formalizada la sesión anterior**. El plan HANDOFF s27 §6.4 se trató como histórico obsoleto desde el arranque (instrucción explícita arranque s31). RE-INVENTARIO desde cero. Sin esto, s31 habría perdido la sesión atacando `Math.floor(timeDiff/interval)` en L1626 — línea que ya no existe.

3. **Cero errores §9.4 propios CTO al carácter en sesión 31**. Cero Edits funcionales revertidos. 3 Edits de instrumentación temporal aplicados y revertidos limpios vía `git checkout --` (no contaminaron el commit funcional).

4. **Patrón histórico §0 sin maquillaje al carácter mantenido por undécima sesión consecutiva**. Sesión 31 cierra prioridad 1 declarada objetivo s31 — entrega valor empírico inmediato producción.

5. **Formato 1-paso-1-mensaje (lección §31 s29) APLICADO al carácter ESTRICTAMENTE toda la sesión 31** — un paso → Ramón ejecuta → reporta → siguiente. Cero planes largos multi-paso. Mensajes cortos. Bloques shell separados de prosa mínima. Disciplina mantenida íntegra.

6. **Intervención decisiva de Ramón (lección §14, decimosexta sesión consecutiva)**: ante la propuesta CTO de diferir el Edit funcional a s32, Ramón cuestionó verbatim *"y porque dejamos el edit para otra sesion k no tiene exactamente el mismo contexto k esta?"*. CTO rectificó al carácter — diferir introducía el riesgo §34 (degradación de contexto entre sesiones), no lo evitaba. El Edit se decidió y aplicó en s31 con contexto íntegro. Sin la pregunta de Ramón, el fix se habría arriesgado a una reconstrucción de contexto en s32.

---

## §1 — Qué se hizo en sesión 31 al carácter

### §1.1 PASO 0 — lectura HANDOFFs project_knowledge + lag s30/s29

Sesión 31 arrancó ~02:30 hora local 17 may 2026. CTO ejecutó 5 búsquedas dirigidas vía `project_knowledge_search`. **Lag indexación HANDOFF s30 + s29 confirmado al carácter** — patrón idéntico s24/s27/s30 anticipado en el arranque. project_knowledge devolvió hasta s28 entero + s27/s26/s25/s24/s14 + CLAUDE.md. CTO PARÓ, reportó lag, pidió Plan B. Ramón ejecutó `cat refactor/HANDOFF-cierre-sesion-30.md` + pegó contenido entero. CTO leyó HANDOFF s30 entero: §0 + §1.11 + §3.1 + §5 plan s31 + §6.4 obsoleto + §9 lección §34.

### §1.2 PASO 0.5 — verificación shell pre-trabajo

Outputs PASS 8/8 al carácter:
- git status: On branch main + working tree clean + up to date ✓
- log --oneline -5: `c39a8ec → 99f5e33 → e870b47 → 68e3772 → 34d0cc0` ✓
- rev-parse HEAD: `c39a8ec7c673cd8c6710769a7f41d19a9d6ad51a` ✓
- invariante setData: vacío ✓
- invariante update: vacío ✓
- invariante computePhantomsNeeded: 3 matches L116/L1145/L1224 ✓
- `minWidth:0` OrderModal.js: 2 matches L208 + L218 (fix s30) ✓
- `const drawRef` KillzonesOverlay.js: 1 match L130 (5g.2) ✓

Cero desvíos. 3 invariantes fase 4 mantenidas por **undécima sesión consecutiva**.

### §1.3 PASO 1 — RE-INVENTARIO bytes desde cero (lección §34)

Plan s27 §6.4 descartado como obsoleto desde el arranque. `grep -rn "logicalIndex|timeToCoordinate|interpolat" components/ lib/` localizó **`lib/chartCoords.js`** (archivo nuevo post-cluster-B, no existía en s27) con `timeToLogical()` L10-39. CTO leyó `chartCoords.js` entero (117 líneas) + cadena de datos (`getSeriesData` L168 / `getRealLen` L183 de `lib/sessionData.js`). `interpolateLogicalIndexFromTime` confirmado solo en comentarios de `_SessionInner.js` L1136/L1172 — función reescrita, no eliminada.

### §1.4 PASO 2 — caracterización empírica N≥3

Protocolo: TrendLine M3 con 2 endpoints → cierra sesión (persiste `session_drawings`) → re-entra M15 → observar. **3/3 FAIL determinístico**. Síntoma verbatim Ramón: *"se va a la izquierda... estaban bien dibujadas como en m3... pero al entrar pasa lo mismo"*. Bug 05:40 caracterizado empíricamente verbatim por primera vez en runtime.

### §1.5 PASO 3 — diagnóstico empírico vía instrumentación temporal

Discriminación del path real en bytes:
- Instrumentación 1 (`chartCoords.js`, 4 logs `[CC-DBG]`): consola devolvió **0 logs** → `toScreenCoords`/`timeToLogical` NO se invoca en carga de drawings persistidos. `chartCoords.js` descartado como path del bug.
- Inventario: `useDrawingTools.js:235` `importTools` → `pluginRef.current.importLineTools(json)`. `_SessionInner.js:357` useEffect carga `session_drawings` → `importTools(parsed.v)`. El render de drawings persistidos lo hace el **plugin vendor LWC**, no código nuestro. Verificado NO solapa Cluster A (L297-L365).
- Localizado vendor activo: `vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js` (8740 líneas, con parches históricos del proyecto inyectados, NO vendor puro). Función `interpolateLogicalIndexFromTime` L1580-L1626 con parche `2851ef7` (s14, `return lo;`) ya aplicado en rama intermedia L1610. Call chain confirmado: `pointToScreenPoint` L6471 → `interpolateLogicalIndexFromTime` L6479.
- Instrumentación 2 (vendor, 4 logs `[ILI-DBG]`): consola capturó verbatim 3 ciclos consistentes. Punto 1 (`givenTimeNum=1763140680`) → `snap-floor lo=12253 hi=12254` (entero, correcto). Punto 2 (`givenTimeNum=1763358120`) → **`EXTRAP-beyond-last givenTimeNum=1763358120 lastTime=1763346600 interval=900 result=12298.8`** (FRACCIONAL).

**Causa raíz confirmada al carácter en bytes**: el punto 2 cae en zona futura (`> lastTime`), entra en la rama de extrapolación L1596 (`return (cachedData.length - 1) + (givenTimeNum - lastTime) / interval;`) que devuelve `12298.8` fraccional. Comentario del propio parche L1609 lo describe literal: *"Devolver fractIdx hace que logicalToCoordinate de LWC core devuelva 0 (borde izquierdo)"*. El parche `2851ef7` solo cubrió la rama intermedia, nunca la rama `> lastTime`.

### §1.6 PASO 4 — Edit funcional re-decidido sobre inventario nuevo

Instrumentación revertida primero (`git checkout -- vendor... lib/chartCoords.js`) — no mezclar debug con fix. Decisión de snap: `Math.floor` (coherente con criterio parche `2851ef7`; `Math.round` introduciría criterio distinto entre ramas; clamp perdería posición relativa en zona futura). Edit vía Claude Code (opción 1 manual):
- **L1596**: `return (cachedData.length - 1) + (givenTimeNum - lastTime) / interval;` → `return Math.floor((cachedData.length - 1) + (givenTimeNum - lastTime) / interval);`

Claude Code detectó correctamente que la instrumentación ya no estaba (revert previo) y aplicó sobre estado limpio `c39a8ec`.

### §1.7 PASO 5 — verificación bicapa + build

- `grep "Math.floor((cachedData.length - 1)"` → 1 match L1596 ✓
- `grep "ILI-DBG|CC-DBG"` → 0 matches (instrumentación limpia) ✓
- `git diff --stat` → `vendor...js | 2 +-`, `1 insertion(+), 1 deletion(-)` ✓
- `git diff` verbatim → solo L1596 envuelta en `Math.floor()`, rama snap-floor `return lo;` intacta ✓
- `npm run build` → Compiled successfully, 6/6 static pages, bundle idéntico baseline ✓

### §1.8 PASO 6 — smoke local 3/3 PASS

Mismo protocolo que caracterizó el bug (3/3 FAIL → exigir 3/3 PASS). TrendLine M3 persistida → re-entra M15. **3/3 PASS**. Ramón verbatim: *"lo has clavado!! pass, gracias a Dios"* + *"3/3 pass"*.

### §1.9 PASO 7 — commit + push directo a main

Archivo basura `=` (0 bytes, redirect accidental) eliminado pre-commit. `git add` solo `vendor...js`. Commit `6dd0629` (`1 file changed, 1 insertion(+), 1 deletion(-)`). `git push origin main` → `c39a8ec..6dd0629 main -> main` exitoso. `origin/main` = `6dd0629`.

### §1.10 PASO 8 — smoke producción PASS

Vercel deploy ~3 min. Ramón smoke producción `simulator.algorithmicsuite.com` `6dd0629` (recarga caché limpia). Caso 05:40 NO reproducible. **Smoke producción PASS al carácter (Ramón Mac)**. Ramón verbatim: *"pass"*.

### §1.11 Verbatim Ramón sesión 31 — preservar al carácter

| Momento | Verbatim Ramón al carácter |
|---|---|
| Caracterización ciclo 1 | *"antes en m3 y despues de salir y al entrar en m15... descolocada"* |
| Caracterización ciclo 2 | *"se va a la izquierda... estaban bien dibujadas como en m3... pero al entrar pasa lo mismo, fail"* |
| Caracterización ciclo 3 | *"3: fail"* |
| Console vacía (descarta chartCoords path) | *"acabo de entrar en m15, pero en console no aparece nada"* |
| Cuestionamiento diferir Edit (lección §14) | *"y porque dejamos el edit para otra sesion k no tiene exactamente el mismo contexto k esta?"* |
| Smoke local ciclo 1 | *"lo has clavado!! pass, gracias a Dios"* |
| Smoke local N≥3 | *"3/3 pass"* |
| Smoke producción | *"pass"* |

**Patrón "intuición Ramón = input técnico encriptado, sistemáticamente correcto" confirmado por decimosexta sesión consecutiva** — el cuestionamiento sobre diferir el Edit evitó una reconstrucción de contexto en s32 y aplicó preventivamente la lógica de la lección §34 al propio flujo de trabajo.

---

## §2 — Estado al carácter (verificable desde shell)

### §2.1 Git

- **Rama activa al cierre**: `main`.
- **HEAD main al cierre**: `<HASH-HANDOFF-s31>` (HANDOFF s31 docs) sobre `6dd0629` (fix deuda 4.6 funcional).
- **`origin/main`** = `<HASH-HANDOFF-s31>` post-push docs.
- **Cadena main al cierre**:
  ```
  <HASH-HANDOFF-s31> — HANDOFF s31
  6dd0629 — fix deuda 4.6 caso 05:40 Math.floor rama extrapolacion (FUNCIONAL)
  c39a8ec — HANDOFF s30
  99f5e33 — fix modal BUY LIMIT Field minWidth/width (FUNCIONAL)
  e870b47 — HANDOFF s29
  68e3772 — 5g.2 KZ-redraw-on-TF-change drawRef ref-based (FUNCIONAL)
  34d0cc0 — HANDOFF s28
  ...
  06e16bf — merge cluster B en main (sesión 26)
  ```
- **Working tree** limpio al cierre redacción.

### §2.2 Producción Vercel

- Deploy actual: `6dd0629` (fix deuda 4.6) — runtime efectivo cluster B + 5g.1 + 5g.2 + fix-modal + fix-4.6 desde ~02:55 hora local 17 may 2026.
- **CUARTO CAMBIO RUNTIME PRODUCCIÓN POST-CLUSTER-B** — `99f5e33` → `6dd0629`.
- **Smoke producción PASS al carácter (Ramón Mac)** — caso 05:40 NO reproducible en producción `6dd0629`.

### §2.3 Tamaños actuales al carácter

| Archivo | Líneas pre-31 | Líneas post-31 | Delta |
|---|---|---|---|
| `vendor/.../lightweight-charts-line-tools-core.js` | 8740 | **8740** | **0 (1 línea modificada in-place)** |
| `lib/chartCoords.js` | 117 | 117 | 0 (instrumentación revertida) |
| `components/_SessionInner.js` | 3052 | 3052 | 0 |
| `components/OrderModal.js` | 223 | 223 | 0 |
| `components/KillzonesOverlay.js` | 462 | 462 | 0 |

**+0 netas líneas** (1 hunk `+1/-1`; modificación in-place de 1 return). Cluster A INTOCABLE preservado por undécima sesión consecutiva.

### §2.4 Invariantes fase 4 al cierre — verificadas al carácter

```
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"  → vacío
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"   → vacío
grep -n "computePhantomsNeeded" components/_SessionInner.js                          → 3 matches L116, L1145, L1224
```

Las 3 invariantes fase 4 mantenidas por **undécima sesión consecutiva** (heredadas s12).

---

## §3 — Errores §9.4 propios del CTO en sesión 31

**Cero errores §9.4 propios en sesión 31.** Un momento de juicio sub-óptimo corregido en tiempo real (no llegó a error de ejecución, sin impacto código):

- CTO propuso diferir el Edit funcional a s32 ("el Edit merece decisión fresca"). Ramón cuestionó verbatim *"y porque dejamos el edit para otra sesion k no tiene exactamente el mismo contexto k esta?"*. CTO reconoció inmediatamente que el único argumento real era el peso de la conversación (no técnico) y que diferir INTRODUCÍA el riesgo §34 (degradación de contexto), no lo evitaba. Rectificó: Edit decidido y aplicado en s31 con contexto íntegro. Severidad: nula (cero impacto código, conservadurismo mal aplicado cazado por Ramón antes de actuar). Registrado sin maquillaje por disciplina §0 — la propuesta era incorrecta y la pregunta de Ramón la corrigió.

---

## §4 — Deudas vivas al cierre sesión 31

| Deuda | Estado al carácter | Calendario |
|---|---|---|
| Deuda 4.6 caso 05:40 vendor extrapolación | ✅ **CERRADA AL CARÁCTER en s31** producción `6dd0629` (Math.floor rama `> lastTime`). Smoke local 3/3 + producción PASS | Cerrada |
| Bug modal BUY LIMIT cápsulas descentradas | ✅ CERRADA en s30 producción `99f5e33` cross-hardware | Cerrada |
| Bug 5g.2 KZ-redraw-on-TF-change | ✅ CERRADA en 5g.2 (s29) | Cerrada |
| Bug 5g.1 manta invisibilidad | ✅ CERRADA en 5g.1 (s28) | Cerrada |
| Deuda acceso-simulador-revoke no-efectivo | ⏳ ABIERTA — severidad ALTA, fuga acceso. Inventario bytes endpoints `/api/admin/toggle-acceso-sim` + `/api/admin/list-alumnos-sim` + `/api/admin/alumno-sim/[id]` + lógica auth `/session/[id]` + tabla Supabase | **Prioridad 1 s32** |
| Drawings zona futura derecha al cargar (Luis/Giancarlo) | ⏳ ABIERTA — NO reproducida Ramón. POSIBLE cierre colateral por fix 4.6 (mismo origen: rama extrapolación). NO declarar sin verificación Giancarlo/Luis | Vigilancia — verificar con datos crudos |
| Bug freeze Luis Giancarlo velocity-alta | ⏳ ABIERTA — pre-existente intermitente | Calendario fase 4 RenderScheduler |
| Sub-fase 5f.0c race LWC asíncrona | ⏳ Deuda vigilada — posible cierre colateral 5g.2 | Vigilancia |
| `chartTick` prop huérfana KZ (firma L117) | ⏳ ABIERTA — cosmética | Sub-fase futura |
| `debugCtx` parámetro muerto `applyNewBarUpdate` | ⏳ ABIERTA — cosmética | Sub-fase 5e.4 |
| Polling 300ms `getSelected()` / `setTimeout` tfMap | ⏳ ABIERTA — observado en inventario s31 (`_SessionInner.js` L371 setTimeout 300) | Sub-fase 5f.2 |
| Bug #2 freeze play velocity-alta x15+ | ⏳ ABIERTA — pre-existente intermitente | Calendario fase 4 RenderScheduler |
| Quota Supabase | ⏳ Vigilancia pasiva | Vigilancia |

---

## §5 — Plan táctico sesión 32

### §5.1 Próximo orden prioridades

- **Prioridad 1 — deuda acceso-simulador-revoke no-efectivo**: severidad ALTA, fuga de acceso. PASO 1 s32: inventario bytes endpoints `/api/admin/toggle-acceso-sim` + `/api/admin/list-alumnos-sim` + `/api/admin/alumno-sim/[id]` + lógica auth `/session/[id]` + tabla Supabase relacionada. PASO 2: caracterización del fallo (¿el revoke no persiste? ¿el guard auth no lo lee? ¿cache de sesión?). NO improvisar fix sin inventario + caracterización (lección §34 + §15).
- **Prioridad 2 — verificar cierre colateral "drawings zona futura derecha"**: el fix 4.6 (Math.floor rama extrapolación) puede haber cerrado colateralmente la deuda "drawings zona futura derecha al cargar" reportada por Luis/Giancarlo (mismo origen estructural: rama `> lastTime` devolvía fraccional). NO declarar cierre sin verificación con datos crudos Giancarlo/Luis.
- **Prioridad 3+ — cosméticas calendarizadas**: `chartTick` prop huérfana KZ + 5e.4 (`debugCtx`) + 5f.2 (polling 300ms / setTimeout tfMap) + bug freeze velocity-alta.

**Cluster A (fase 5.A)** sigue aplazado. Arranca s33+ una vez deuda ALTA (acceso-revoke) cerrada + producción estable confirmada.

### §5.2 PASO 0 obligatorio en sesión 32

Leer en orden: (1) este HANDOFF s31 entero, especialmente §0 + §1.5 diagnóstico + §3 + §5 + §9 lección §35 NUEVA. (2) HANDOFF s30 §3.1 + §9 lección §34 (referencia patrón inventario caducado). (3) CLAUDE.md §1-§4.

PASO 0.5 verificación shell:

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git status                                                  (esperado: en main, working tree clean)
git --no-pager log --oneline -5                             (esperado: HEAD HANDOFF s31 sobre 6dd0629 fix 4.6, anterior c39a8ec HANDOFF s30)
git rev-parse HEAD                                          (esperado: hash HANDOFF s31)
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"   (esperado: vacío)
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"    (esperado: vacío)
grep -n "computePhantomsNeeded" components/_SessionInner.js                            (esperado: 3 matches L116 L1145 L1224)
grep -n "Math.floor((cachedData.length - 1)" vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js   (esperado: 1 match L1596 — fix 4.6 aplicado)
grep -rn "ILI-DBG\|CC-DBG" lib/ vendor/ components/                                   (esperado: vacío — instrumentación revertida)
```

> NOTA lección §34/§35 — NO heredar números de línea de inventarios de HANDOFFs ≥2 sesiones atrás sin re-verificar en bytes. El fix 4.6 está en L1596 al cierre s31; re-verificar si el vendor cambia.

### §5.3 Disciplina sesión 32 — formato obligatorio

**OBLIGATORIO TODAS las sesiones (lección §31 s29 + memoria persistente)**: un paso a la vez, mensajes CORTOS, un paso → Ramón ejecuta → reporta → siguiente. Cero planes largos. Aplicado ESTRICTAMENTE toda s31 — mantener s32+.

### §5.4 Cluster A INTOCABLE en sesión 32

Mismo principio sesiones 20-31. Si working tree dirty post-trabajo tocando zonas cluster A (`_SessionInner.js` L297-L365 / L370-L415 / L450-L456), PARAR.

---

## §6 — Material verificado al carácter en sesión 31 (preservado)

### §6.1 Causa raíz deuda 4.6 caso 05:40 — preservada al carácter

El render de drawings persistidos NO pasa por `lib/chartCoords.js` (`toScreenCoords`/`timeToLogical`, que sirven a `CustomDrawingsOverlay.js`). Pasa por el plugin vendor LWC: carga `_SessionInner.js` L357 useEffect → `importTools(parsed.v)` → `useDrawingTools.js:235` → `pluginRef.current.importLineTools(json)` → render plugin → `BaseLineTool.pointToScreenPoint()` L6471 → `interpolateLogicalIndexFromTime` L6479.

`interpolateLogicalIndexFromTime` (vendor L1580-L1626) tiene 3 ramas para un timestamp con cache disponible (`window.__algSuiteSeriesData`, ≥2 elementos):
1. **L1596 `givenTimeNum > lastTime`** (extrapolación zona futura): devolvía `(cachedData.length-1) + (givenTimeNum-lastTime)/interval` FRACCIONAL → core LWC mapea a x≈0 → borde izquierdo. **ESTE era el caso 05:40.** Fix s31: envuelto en `Math.floor()`.
2. **L1610 `return lo;`** (snap-floor rama intermedia): parche histórico `2851ef7` s14. Funciona correcto (entero). Intacto.
3. Fallback linear interpolation (cache <2 elementos): `return timeDiff / interval`. No alcanzado en caso 05:40.

### §6.2 Patrón fix índice lógico fraccional → x=0 — preservado al carácter (template)

```js
// Cualquier rama de interpolateLogicalIndexFromTime (o función análoga time→logical)
// que devuelva un índice lógico para alimentar logicalToCoordinate del core LWC:
// DEBE devolver ENTERO. Un valor fraccional hace que el core devuelva 0 (borde izquierdo).
// Snap criterio del proyecto: Math.floor (coherente con parche 2851ef7).
return Math.floor(<expresión índice lógico>);
```

Aplicar si reaparece síntoma "drawing persistido al borde izquierdo / se va a la izquierda al cambiar TF o recargar". Verificar TODAS las ramas de retorno de la función de interpolación, no solo la intermedia (lección s31: `2851ef7` solo cubrió 1 de 2 ramas).

### §6.3 Instrumentación temporal como herramienta de diagnóstico — preservado

Patrón validado s31: ante bug en path desconocido, instrumentar con `console.log` etiquetados (`[TAG-DBG]`) en TODAS las ramas de retorno candidatas, build local, reproducir con consola filtrada por TAG + Preserve log, capturar verbatim qué rama se ejecuta. Revertir con `git checkout --` antes del Edit funcional (no mezclar debug con fix en el commit). Coste bajo, discrimina path real en bytes empíricos, evita improvisar fix sobre hipótesis (anti-§34).

---

## §7 — Procedimiento de cierre sesión 31

### §7.1 Mover HANDOFF al repo

Tras descargar este HANDOFF a `~/Downloads/HANDOFF-cierre-sesion-31.md`:

```
git checkout main
```

(Ya en main post-push `6dd0629`, working tree clean.)

```
mv ~/Downloads/HANDOFF-cierre-sesion-31.md refactor/
```

```
ls -la refactor/HANDOFF-cierre-sesion-31.md
```

```
wc -l refactor/HANDOFF-cierre-sesion-31.md
```

### §7.2 git add + commit (en main)

```
git add refactor/HANDOFF-cierre-sesion-31.md
```

```
git status
```

```
git commit -m "docs(sesion-31): cerrar sesion 31 con deuda 4.6 caso 05:40 CERRADA estructuralmente en produccion (Math.floor rama extrapolacion interpolateLogicalIndexFromTime vendor L1596) + RE-INVENTARIO bytes desde cero leccion 34 aplicada con exito + leccion 35 nueva (verificar TODAS las ramas de retorno) + cero errores 9.4 + cero Edits revertidos"
```

```
git --no-pager log --oneline -3
```

### §7.3 Push a main

```
git push origin main
```

### §7.4 Verificación final cierre sesión 31

```
git --no-pager log --oneline -5
```

Esperado: HEAD nuevo `<HASH-HANDOFF-s31>` sobre `6dd0629` (fix 4.6) sobre `c39a8ec` (HANDOFF s30) sobre `99f5e33` (fix modal).

Sesión 31 cerrada al carácter.

---

## §8 — Métricas sesión 31

- **Inicio efectivo**: ~02:30 hora local (17 may 2026).
- **PASO 0 (lectura HANDOFFs + lag s30 + Plan B cat + verificación shell)**: ~10 min.
- **PASO 1 RE-INVENTARIO bytes desde cero (chartCoords + sessionData + vendor localización)**: ~25 min.
- **PASO 2 caracterización N≥3**: ~15 min.
- **PASO 3 diagnóstico instrumentación (2 rondas: chartCoords descartado + vendor localizado, 8 logs totales, build + captura)**: ~40 min.
- **PASO 4 Edit funcional + decisión snap**: ~10 min.
- **PASO 5 verificación bicapa + build**: ~10 min.
- **PASO 6 smoke local 3/3**: ~10 min.
- **PASO 7 commit + push**: ~5 min.
- **PASO 8 smoke producción**: ~5 min.
- **HANDOFF s31 redactado**: ~30 min.
- **Total efectivo**: ~2.8h activas. Coherente con media histórica post-cluster-B (sesión de diagnóstico profundo + fix).
- **Commits funcionales producidos**: 1 (`6dd0629` fix deuda 4.6).
- **Edits funcionales aplicados**: 1 (`+1/-1` neta — sin revert).
- **Edits funcionales revertidos**: 0.
- **Edits instrumentación temporal aplicados + revertidos limpios**: 3 (4 logs `[CC-DBG]` + 4 logs `[ILI-DBG]` en 2 rondas; revertidos vía `git checkout --` sin contaminar commit).
- **Líneas tocadas netas en código**: 0 (vendor 1 línea modificada in-place).
- **Push a main**: 2 (funcional `6dd0629` + HANDOFF s31 docs post-redacción).
- **Errores §9.4 propios CTO capturados**: 0 (1 propuesta sub-óptima corregida en tiempo real por cuestionamiento Ramón, sin impacto código).
- **Bugs cerrados**: 1 (deuda 4.6 caso 05:40 — abierta/arrastrada desde s12-s27).
- **CUARTO COMMIT FUNCIONAL POST-CLUSTER-B**: `6dd0629`.
- **Validación**: smoke local 3/3 PASS + smoke producción PASS (Ramón Mac).

---

## §9 — Aprendizajes generales del proyecto (acumulados sesiones 13-31)

> Sección que persiste a través de HANDOFFs.

1-33: lecciones acumuladas s13-s29 preservadas íntegras (ver HANDOFF s29 §9).

34. **Inventario bytes tiene CADUCIDAD implícita** (formalizada s30). **APLICADA CON ÉXITO POR PRIMERA VEZ en s31**: el plan HANDOFF s27 §6.4 se descartó como obsoleto desde el arranque; RE-INVENTARIO desde cero localizó el código real (función reescrita y movida tras cluster B). Sin §34, s31 habría perdido la sesión atacando `Math.floor(timeDiff/interval)` L1626 — línea inexistente. Confirmación: una lección formalizada en HANDOFF, aplicada disciplinadamente, convierte una sesión potencialmente perdida en un cierre funcional.

35. **NUEVO al carácter sesión 31 — un parche aplicado a UNA rama de una función con múltiples returns NO cubre las demás ramas. Verificar TODAS las rutas de retorno.** El parche `2851ef7` (s14) aplicó snap-floor (`return lo;`) a la rama intermedia de `interpolateLogicalIndexFromTime`, pero la rama de extrapolación `givenTimeNum > lastTime` (L1596) seguía devolviendo índice fraccional → caso 05:40 persistió 17 sesiones. La caracterización histórica asumió que "el parche cubre el bug" sin verificar que cubría TODAS las ramas por las que un timestamp problemático puede salir. **Aplicar sistemáticamente s32+**: al diagnosticar un bug en una función con un parche previo que "debería cubrirlo", instrumentar TODAS las ramas de retorno y confirmar empíricamente cuál se ejecuta — no asumir que el parche existente alcanza el caso reproducible. Corolario de §34 (no asumir; verificar en bytes) aplicado a control de flujo intra-función.

36. **NUEVO al carácter sesión 31 — diferir un Edit a una sesión futura con "contexto fresco" puede INTRODUCIR el riesgo §34, no evitarlo.** CTO propuso diferir el Edit funcional 4.6 a s32. Ramón cuestionó verbatim *"y porque dejamos el edit para otra sesion k no tiene exactamente el mismo contexto k esta?"*. La sesión que produce el diagnóstico tiene el inventario en bytes y los logs empíricos VIVOS; una sesión nueva los reconstruye desde HANDOFF (degradación de contexto = exactamente el mecanismo de §34). **Aplicar s32+**: cuando una sesión ha completado diagnóstico + caracterización + decisión de fix con contexto íntegro, el Edit se aplica EN esa sesión salvo razón técnica concreta. El peso de la conversación NO es razón técnica — se gestiona con disciplina §31 (mensajes cortos) o nueva conversación con HANDOFF, no aplazando el trabajo ya maduro. Lección §14 (intuición Ramón = input técnico) por decimosexta sesión consecutiva.

---

## §10 — Cierre

Sesión 31 deja al carácter:

- **Deuda 4.6 caso 05:40 CERRADA ESTRUCTURALMENTE EN PRODUCCIÓN al carácter** — bug abierto/arrastrado desde s12-s27 (plan s27 obsoleto). Fix `+1/-1` neta (`Math.floor` rama extrapolación `interpolateLogicalIndexFromTime` vendor L1596). Commit `6dd0629`. **CUARTO COMMIT FUNCIONAL EN MAIN POST-CLUSTER-B**.
- **Validación bicapa estricta completa**: RE-INVENTARIO bytes desde cero + caracterización N≥3 (3/3 FAIL pre-fix) + diagnóstico empírico instrumentación temporal (causa raíz `result=12298.8` fraccional capturado en consola verbatim) + Edit auditado + build PASS + smoke local 3/3 PASS + smoke producción PASS (Ramón Mac).
- **Lección §34 (inventario caducado) APLICADA CON ÉXITO** — primer caso documentado de una lección formalizada que, aplicada disciplinadamente, convierte una sesión potencialmente perdida en cierre funcional.
- **2 lecciones nuevas §35 (verificar TODAS las ramas de retorno) + §36 (no diferir Edit maduro = anti-§34)** formalizadas §9.
- **Cero errores §9.4 propios CTO** — 1 propuesta sub-óptima (diferir Edit) corregida en tiempo real por cuestionamiento Ramón antes de actuar, sin impacto código, registrada sin maquillaje §3.
- **Cero Edits funcionales revertidos**. 3 Edits de instrumentación temporal aplicados y revertidos limpios sin contaminar el commit funcional.
- **Formato 1-paso-1-mensaje APLICADO ESTRICTAMENTE toda la sesión 31**.
- **3 invariantes fase 4 mantenidas por undécima sesión consecutiva**. Cluster A INTOCABLE preservado.
- **Producción mejorada**: cierre estructural del caso 05:40 elimina drawings persistidos descolocados al cambiar TF para Ramón + Giancarlo + Luis + alumnos futuros. Posible cierre colateral de la deuda "drawings zona futura derecha" (verificar s32 con datos Giancarlo/Luis).

Próximo HANDOFF (cierre sesión 32) debe reportar al carácter:
- Si inventario bytes deuda acceso-simulador-revoke completado + caracterización del fallo.
- Si la deuda "drawings zona futura derecha" cerró colateralmente por el fix 4.6 (verificación Giancarlo/Luis).
- Si formato 1-paso-1-mensaje aplicado ESTRICTAMENTE toda la sesión (lección §31).
- Si HANDOFF s31 indexado en project_knowledge al arranque s32 (o lag — patrón s24/s27/s30).
- Si lección §34 + §35 + §36 aplicadas — NO arrastrar planes viejos, verificar TODAS las ramas, NO diferir Edits maduros.

Si sesión 32 NO avanza prioridades al carácter, el HANDOFF lo dice al frente sin maquillaje — patrón §0 mantenido por duodécima sesión consecutiva.

**Mensaje del CTO al cierre al carácter**: sesión 31 fue la sesión que cerró una deuda que llevaba abierta y mal-diagnosticada 17 sesiones. La clave no fue brillantez técnica — fue disciplina: aplicar la lección §34 que tú formalizaste en s30 (no arrastrar el plan s27, re-inventariar desde cero), instrumentar en vez de hipotetizar, exigir N≥3 simétrico en la validación. Y, de nuevo, tu cuestionamiento fue decisivo: cuando propuse diferir el Edit a s32 "por contexto fresco", tu pregunta *"¿por qué dejamos el edit para otra sesión que no tiene exactamente el mismo contexto que esta?"* señaló que yo estaba a punto de introducir el riesgo §34 en el propio flujo de trabajo. Tenías razón. El proyecto avanza porque cuestionas, no a pesar de eso — decimosexta sesión consecutiva. Esa es la verdad sin maquillaje al carácter.

---

*Fin del HANDOFF cierre sesión 31. 17 mayo 2026, ~03:00 hora local. Redactado por CTO/revisor tras commit `6dd0629` push exitoso a `origin/main` + smoke local 3/3 PASS + smoke producción PASS al carácter (Ramón Mac). Working tree limpio al cierre redacción. Producción cluster B + 5g.1 + 5g.2 + fix-modal + fix-4.6 `6dd0629` estable al carácter desde 17 may 2026 ~02:55 hora local. Pendiente de mover al repo + commit a main + push a `origin/main` por Ramón según §7.*
