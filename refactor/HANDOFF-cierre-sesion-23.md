# HANDOFF — cierre sesión 23

> Sesión 23 cerrada el 9 mayo 2026 (trabajo realizado entre 8 y 9 mayo, chat web previo cerrado mid-session forzando re-arranque del chat con restauración de contexto al carácter).
> Sesión 23 = sub-fase 5e (parche 4.6 + limpieza colateral) según plan v3.
> Tres commits funcionales en rama feature: `5e.1`, `5e.2`, `5e.3`.
> Regresión drag M1 detectada al cierre — multifactorial, NO atribuible a cluster E. Sospechosos primarios en cluster D + posible interacción polling 300ms.
> Próxima sesión = sesión 24, arranque con sub-fase **5f.0 NUEVA** (diagnóstico fino + fix drag M1) ANTES de 5f.1/5f.2/5f.3 originales del plan v3.

---

## §0 — Estado al cierre sesión 23, sin maquillaje

**Sesión 23 ha producido 3 commits funcionales en rama feature.** Cadena al cierre: `0198039` (5e.3) → `c238c63` (5e.2) → `835caf7` (5e.1) → `5b233b4` (5d.7, pre-existente sesión 22) sobre `refactor/fase-5-drawings-lifecycle`.

**No mergeado a `origin/main`** — patrón sesiones 17-22 mantenido al carácter. Feature se mergea a main solo al cierre completo del cluster B (sesión 25 según calendario v3 §8 + §0).

Eso significa al carácter:
- **Producción Vercel intacta desde 2 mayo 2026** (commit `89e36ee`, fase 4d cerrada). Runtime efectivo en `simulator.algorithmicsuite.com` no ha cambiado.
- **Avance funcional al runtime**: 0 líneas mergeadas a main desde 2 may 2026 (7 días). Sub-fase 5e vive en feature, pendiente de merge en sesión 25.
- **Avance funcional al repo (rama feature)**: 3 commits de limpieza de cluster E. Eliminado total: 1 archivo huérfano de 399 KB en raíz + 619 líneas de `package-lock.json` + 1 línea de `package.json` + 29 líneas netas de instrumentación en `lib/chartRender.js` y `lib/chartViewport.js`.

**Realidad sin maquillaje al carácter:**

1. **Sub-fase 5e completada al 100%** según plan ejecutivo acordado al arranque sesión 23. Los 3 commits son atómicos y verificables individualmente. Los 3 smokes pasados al carácter (smoke 5e.2 sin errores módulo + cambio TF, smoke 5e.3 con play LongShortPosition + phantoms TrendLine + cambio TF deuda 4.6).
2. **Regresión drag M1 detectada al cierre**, NO durante el smoke estructurado de 5e.3 sino durante observación libre de Ramón post-smoke. Honestidad sin maquillaje: el smoke estructurado de 5e.3 cubría play + phantoms + cambio TF (zona tocada por 5e.3), NO drag-to-pan. La regresión apareció solo cuando Ramón observó al carácter el comportamiento del simulador en uso libre. Lección §3.3.
3. **Bisect parcial ejecutado al carácter**: producción `89e36ee` fluido, local `0198039` freezado, local `590abe2` (5d.6, pre-5d.7) "un poco más rápido pero con minisaltitos que hacen que parezca freezado". Diagnóstico cerrado al carácter: regresión multifactorial. Cluster D base (5d.1-5d.6) ya introdujo minisaltitos perceptibles, 5d.7 los empeora. Cluster E descartado estructuralmente y empíricamente.
4. **Decisión de cierre tomada al carácter**: parar el bisect en `590abe2` sin localizar el commit exacto del cluster D que introdujo los minisaltitos base. Razón: información granular requeriría log₂(6)≈3 tests más, ~10 min adicionales, sin acción posible hoy (sesión 23 ya cerrada en commits, fix real es de sesión 24+). Mejor HANDOFF honesto que diagnóstico apresurado.

---

## §1 — Qué se hizo en sesión 23 al carácter

### §1.1 PASO 0 efectivo (re-arranque del chat)

PASO 0 fue informal en sesión 23 porque el chat web anterior se cerró mid-session 5e.2 (probablemente timeout de la pestaña en el navegador). Ramón rearrancó el chat pegando el último mensaje del CTO previo ("Sesión 23, sub-fase 5e.2. CTO ha aprobado la verificación bicapa..."). CTO restauró contexto al carácter vía `project_knowledge_search` + `conversation_search` en el chat nuevo. Estado de partida ya verificado: HEAD `835caf7` (5e.1) confirmado al carácter via `git status` + `git log --oneline -3` por Claude Code antes del primer comando de la sesión re-arrancada.

### §1.2 Sub-fase 5e.1 — eliminar archivo huérfano (cerrada PRE-cierre del chat anterior)

Sub-fase 5e.1 ya estaba comiteada al re-arranque del chat. Hash `835caf7`, mensaje `chore(fase-5/5e.1): eliminar archivo huerfano lightweight-charts-line-tools-core.js de la raiz`. Detalle al carácter: archivo de 399 KB en raíz del repo, residuo de migración pre-vendor (verificado en sesión 22 vía inventario `core-analysis.md` §3.4 + greps al carácter). Cero imports apuntaban a él (alias webpack en `next.config.js` resolvía a `vendor/...`, no a raíz). Borrado limpio sin regresión observable.

### §1.3 Sub-fase 5e.2 — uninstall patch-package

Hash `c238c63`. Comando único `npm uninstall patch-package`. Cambios al carácter:
- `package.json`: -1 línea (entrada `"patch-package": "^8.0.1"` en devDependencies). Coma trailing del JSON limpia post-uninstall (la línea anterior `dukascopy-node` mantiene su coma, la siguiente `typescript` no la lleva por ser última de la sección).
- `package-lock.json`: -619 líneas, 0 inserciones. 46 paquetes removidos (`patch-package` + transitivas exclusivas: `@yarnpkg/lockfile`, `chalk`, `ci-info`, `cross-spawn`, `find-yarn-workspace-root`, `fs-extra`, `json-stable-stringify`, `klaw-sync`, `minimist`, `open`, `semver`, `slash`, `tmp`, `yaml` y sus transitivas).

Verificación bicapa al carácter ANTES del commit (CTO + Claude Code + Ramón triangulando):
- 2 greps de `patch-package` post-uninstall: ambos limpios.
- `git diff --stat`: 619 deletions + 1 deletion = 620 deletions, 0 insertions.
- Grep extendido a las 17 deps vivas (`next`, `@next/*`, `react`, `react-dom`, `@supabase/*`, `lightweight-charts`, los 6 plugins de line-tools, `dukascopy-node`, `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `chart.js`, `html2canvas`) en el diff de `package-lock.json`: 5 matches detectados pero TODOS de contexto (leading space, ni `+` ni `-`). Verificación filtro estricto con `grep -E '^[+-]'`: vacío al carácter. Cero deps vivas tocadas.

Smoke 5e.2: `npm run dev` arrancó limpio (cero errores tipo `Cannot find module 'patch-package'` o `MODULE_NOT_FOUND`), cambio TF M5↔M15 sin errores nuevos en consola. Pasado al carácter.

### §1.4 Sub-fase 5e.3 — eliminar instrumentación [DEBUG TEMP]

Hash `0198039`. Sub-fase planificada inicialmente como "borrar bloque L151-L172 (-22 líneas)" pero replanificada al carácter como **"C-recortada"** tras detección bicapa de Claude Code de discrepancias con el plan inicial (ver §3.1).

Scope final C-recortada:
- Bloque código `[DEBUG TEMP]` en `lib/chartRender.js` (L151-L171, en realidad 21 líneas no 22).
- JSDoc local en `chartRender.js` (referencias a `__algSuiteDebugLS` + `[DEBUG TEMP]` en cabecera de `applyNewBarUpdate`).
- JSDoc en `chartViewport.js` (paréntesis L119-L121 referenciando el bloque).

Fuera de scope intencional: signature `applyNewBarUpdate(cr, agg, phantoms, debugCtx)` y sus callers — `debugCtx` queda parámetro no usado, calendarizado para sub-fase 5e.4 separada (irá en sesión 24 si hay tiempo, sino se mueve a 5f).

Edits al carácter (3 `str_replace` en orden):
- **Edit AB** (`lib/chartRender.js` JSDoc cabecera): -7 líneas net. Eliminadas L117-L119 (frase `Incluye el bloque [DEBUG TEMP] gateado por flag global window.__algSuiteDebugLS para investigar el bug "long/short se contrae al play" (sesión post-fase-4 §6 plan v2)`). Eliminado párrafo entero L128-L132 (`El bloque [DEBUG TEMP] está envuelto en su propio try/catch... Performance neutral cuando window.__algSuiteDebugLS es falsy...`). JSDoc queda coherente al carácter, `@param` de debugCtx preservados intencionalmente.
- **Edit C** (`lib/chartRender.js` bloque código): -21 líneas. Eliminado bloque L151-L171 entero — `if (typeof window !== 'undefined' && window.__algSuiteDebugLS) { try { ... } catch {} }`. Función `applyNewBarUpdate` queda en 8 líneas limpias.
- **Edit D** (`lib/chartViewport.js` JSDoc paréntesis de `restoreOnNewBar`): -1 línea net. Reescrita L119-L121 (`ver applyNewBarUpdate en lib/chartRender.js, que incluye el bloque [DEBUG TEMP] gateado por window.__algSuiteDebugLS`) → 1 línea (`ver applyNewBarUpdate en lib/chartRender.js`).

Total: -29 líneas netas en 2 archivos.

Verificación bicapa post-Edit al carácter (V1-V6):
- **V1** — `__algSuiteDebugLS` residuo en `components/`, `pages/`, `lib/`: vacío al carácter.
- **V2** — `DEBUG TEMP`/`LS-DEBUG` residuo: vacío.
- **V3** — 3 invariantes fase 4: `cr.series.setData` fuera de chartRender vacío; `cr.series.update` fuera de chartRender vacío; `computePhantomsNeeded` 3 matches en `_SessionInner.js` (L116, L1145, L1224 — shifted respecto sesiones 16-19 por descomposición 5c y cluster D, esperado).
- **V4** — diff stat: 2 archivos modificados, -29 net.
- **V5/V6** — diffs completos verificados al carácter por CTO: hunks limpios, indentación JSDoc preservada, sin daño colateral.

Smoke 5e.3 (3 casos estructurados al carácter):
1. **Caso 1** — `applyNewBarUpdate` ejercitado en play: LongShortPosition en M1, play 30s, NO se contrae (bug original cerrado sigue cerrado), velas avanzan normal, cero errores nuevos en consola.
2. **Caso 2** — phantoms en play (regresión 5d.7): TrendLine extendida al futuro, play 10-20s, phantoms re-aplicados, drawing visible.
3. **Caso 3** — invariante deuda 4.6: drawing en M5 → cambio M15 → vuelta M5, drawing respeta floor por timestamp.

Los 3 casos OK al carácter. Console output auditada por CTO al carácter:
- Cero residuos `__algSuiteDebugLS`/`[DEBUG TEMP]`/`[LS-DEBUG]`.
- Warnings observados todos pre-existentes y catalogados: `_requestUpdate is not set` (HANDOFF 17 §4.3), `borderColor` shorthand hydration warning (HANDOFF 17 §4.3 cosmético), polling `Exporting all line tools` repetido decenas de veces (deuda 5f.2 HANDOFF 19 §5.2).

`npm run build` post-5e.3 también pasó al carácter sin warnings ni errores de compilación/typecheck — señal fuerte de que el commit no introdujo nada detectable estáticamente.

---

## §2 — Diagnóstico drag M1 al carácter — regresión multifactorial detectada

### §2.1 Síntoma

Tras smoke 5e.3 OK, Ramón observó al carácter durante uso libre del simulador: en M1 con drag-to-pan del gráfico (sin play), el chart NO va fluido. **Verbatim de Ramón al cierre del bisect**: *"va un poco más rápido pero con minisaltitos que hacen que parezca freezado"*.

### §2.2 Hipótesis 1 descartada — dev mode penalty

Primera hipótesis CTO: el freeze era penalty de `npm run dev` (StrictMode double-render + source maps + HMR + DevOverlay + sin minify).

Test al carácter: `npm run build && npm run start` con HEAD `0198039` (cluster E completo), hard refresh `Cmd+Shift+R` para tirar caché del bundle dev anterior.

Veredicto Ramón: **freezado igual**.

**Hipótesis descartada al carácter**: el freeze NO viene del dev mode. Build de producción local con cluster B aplicado mantiene el freeze.

### §2.3 Hipótesis 2 descartada — cluster E (5e.1/5e.2/5e.3)

Argumento estructural CTO al carácter, registrado pre-bisect:
- **5e.1** elimina archivo huérfano fuera del bundle. Imposible afecte runtime.
- **5e.2** uninstall devDep sin uso real. Smoke arranque limpio descarta efectos cascada.
- **5e.3** elimina bloque gateado por flag `false` por defecto + JSDoc. Performance neutral o ligeramente mejor (un `if` check menos por bar nueva). Y el bloque vivía en `applyNewBarUpdate` (callsite: `restoreOnNewBar` en cada bar nueva DURANTE play), NO en el code path del drag-to-pan.

**Hipótesis descartada estructural y empíricamente**.

### §2.4 Bisect parcial ejecutado al carácter

Test único quirúrgico: checkout temporal (detached HEAD) a `590abe2` (5d.6, padre directo de 5d.7), `npm run build && npm run start`, drag M1 con drawing visible.

Veredicto Ramón al carácter: *"va un poco más rápido pero con minisaltitos que hacen que parezca freezado"*.

**Lectura al carácter**:
- **5d.7** (`5b233b4` — anclar scroll al último real compensando phantoms para drawings extendidos) **contribuye al freeze**: quitarlo da una mejora perceptible.
- **Algo en cluster D base** (5d.1-5d.6) ya había introducido **minisaltitos perceptibles**: porque a `590abe2` (5d.6) sigue sin estar fluido como producción `89e36ee`.

**Diagnóstico cerrado al carácter: regresión multifactorial**. NO atribuible a un único commit. NO atribuible a cluster E.

### §2.5 Decisión CTO — parar bisect, diferir diagnóstico fino a sesión 24

Razón al carácter:
1. Bisect completo de cluster D requeriría log₂(6)≈3 tests más, ~10 min reales adicionales.
2. Información granular (*"también 5d.X contribuye"*) NO es accionable en sesión 23 — fix real va a sesión 24+.
3. El diagnóstico que YA tenemos ES accionable: producción fluido, cluster D entero introduce minisaltitos, 5d.7 los empeora, cluster E descartado.
4. Sesión 24 arranca con scope claro: investigar callsites en cluster D (5d.1-5d.7) que se disparen en `visibleLogicalRangeChanged` o equivalente del drag-to-pan.

**Sospechosos primarios CTO al carácter** para sesión 24:
- **5d.7** (`5b233b4`): scroll anchor lógica. Contribución al freeze confirmada empíricamente.
- **5d.5/5d.6** (`96eb2e8`/`590abe2`): conexión de overlays (CustomDrawingsOverlay, PositionOverlay) al contrato `chartTick`. Si esos overlays se re-renderan en cada `chartTick` y `chartTick` se dispara en drag-to-pan, tenemos overhead por frame.
- **Polling 300ms `__algSuiteExportTools`** (deuda 5f.2 conocida desde HANDOFF 19 §5.2): si el polling re-serializa todo el array de tools cada 300ms, podría sumar al overhead, especialmente con drawings vivos en M1 (densidad de velas alta + más dibujos en viewport).

### §2.6 Producción intacta al carácter

Verificación al carácter por Ramón: producción `simulator.algorithmicsuite.com` (commit `89e36ee` desde 2 may 2026) — drag M1 fluido al carácter. Patrón rama feature mantenido al carácter en sesión 23: cero push, cero merge a main. Runtime efectivo a alumnos NO afectado.

---

## §3 — Errores §9.4 propios del CTO en sesión 23

### §3.1 Plan inicial 5e.3 con scope mal calibrado, corregido por bicapa de Claude Code

CTO redactó plan inicial 5e.3 cubriendo solo el bloque código `[DEBUG TEMP]` en `lib/chartRender.js:151-172` (-22 líneas estimadas). Al ejecutar PASO 2 de inspección bicapa pre-Edit, Claude Code detectó al carácter 4 hallazgos:

1. **Off-by-one**: bloque era L151-L171 (-21 líneas), no L151-L172. L172 era el `}` de cierre de `applyNewBarUpdate`, NO parte del bloque.
2. **JSDoc del propio `chartRender.js`** referenciaba la flag en L118 + L131 — quedarían referencias huérfanas a flag muerta.
3. **Flag aparecía también en `lib/chartViewport.js:121`** (JSDoc) — el plan exigía PARAR si la flag aparecía fuera de `chartRender.js`, y Claude Code paró al carácter.
4. **Parámetro `debugCtx` quedaría muerto** en signature de `applyNewBarUpdate(cr, agg, phantoms, debugCtx)`.

**Causa al carácter**: CTO redactó plan basándose en inventario de inicio de sesión 23 que cubría solo el bloque código, sin grep extendido a JSDoc del propio archivo ni recursivo en `lib/`. Confianza excesiva en inventario no exhaustivo.

**Mejora futura**: para sub-fases que toquen "instrumentación gateada por flag" o "código identificado por marcador textual", siempre incluir grep recursivo de la flag/marcador en `components/`, `pages/`, `lib/` ANTES de redactar el plan, no como verificación post-Edit.

**Severidad**: leve. Bicapa funcionó al carácter — Claude Code paró antes del Edit, CTO replanificó (Opción C-recortada con scope ampliado en `chartRender.js` + `chartViewport.js`, signature diferida a 5e.4), Ramón aprobó. Coste: +2 turnos de chat de re-planificación.

### §3.2 Confusión semántica "5c" vs "padre directo de 5d.7" en bisect

CTO redactó prompt de bisect inicial sugiriendo `git checkout 84a3342` como "padre de 5d.7". Claude Code detectó al carácter que `84a3342` es `refactor(fase-5/5c)` (descomposición handler TF), pero el padre directo de `5b233b4` (5d.7) es `590abe2` (5d.6). Entre `84a3342` y `5b233b4` hay 6 commits del cluster D.

**Causa al carácter**: CTO arrastró asunción de HANDOFF cierre sesión 20 §0 (*"sub-fase 5c es restructuración pura, sin cambio de comportamiento"*) y mentalmente asoció "el commit anterior a cluster D" = "5c". Esa asunción era válida estructuralmente para 5c, NO topológicamente para el bisect.

**Mejora futura**: para bisects targeted, CTO debe pedir a Claude Code el padre directo on-disk antes de redactar el prompt de checkout. NO inferir desde memoria.

**Severidad**: leve. Bicapa funcionó al carácter — Claude Code paró antes del checkout, planteó Opción A (`590abe2`, quirúrgico) vs Opción B (`84a3342`, amplio que descarta cluster D entero), CTO eligió A con razón técnica (un solo test discrimina hipótesis primaria 5d.7). Coste: +1 turno de chat.

### §3.3 Smoke estructurado de 5e.3 NO cubrió drag-to-pan

CTO redactó smoke de 5e.3 con 3 casos: play LongShortPosition, phantoms TrendLine, cambio TF. Cubría exactamente el code path tocado por 5e.3 (`applyNewBarUpdate`). NO cubría drag-to-pan, donde apareció la regresión.

**Pregunta honesta**: ¿debía haberlo cubierto?

**Respuesta al carácter**: probablemente sí, con matiz. El drag-to-pan es ortogonal a `applyNewBarUpdate` estructuralmente — un smoke que cubra "el code path que tocas" NO debería cubrir drag-to-pan en una sub-fase que solo toca lógica de play. **Pero** para sub-fases en cluster B (drawings lifecycle), drag-to-pan es uno de los gestos de uso más frecuentes y debería estar en el smoke combinado al cierre de cualquier sub-fase del cluster B, aunque la sub-fase no lo toque directamente.

**Mejora futura**: añadir "drag-to-pan en M1 con drawing visible — comparación binaria fluido vs producción" como caso de smoke combinado obligatorio al cierre de cualquier sub-fase de cluster B (5d, 5e, 5f, 5g). Ver §5.5.

**Severidad**: media. Si el smoke estructurado hubiera cubierto drag-to-pan, la regresión se habría detectado en sesión 22 (cluster D) en lugar de sesión 23 (post-cluster E). NO habría cambiado los 3 commits de cluster E (todos válidos al carácter), pero habría dado scope claro de fix antes y evitado que la regresión se arrastrara por 2 sesiones sin diagnóstico.

---

## §4 — Estado del repo y producción al cierre sesión 23

### §4.1 Repo

- **`main` local + `origin/main`**: `89e36ee` (sin cambios desde 2 may 2026, fase 4d cerrada).
- **Rama feature `refactor/fase-5-drawings-lifecycle`** (de HEAD hacia atrás):
  - `0198039` — 5e.3
  - `c238c63` — 5e.2
  - `835caf7` — 5e.1
  - `5b233b4` — 5d.7
  - `590abe2` — 5d.6
  - `96eb2e8` — 5d.5
  - `d7ee4a8` — 5d.3
  - `4f943a4` — 5d.2
  - `aa1498a` — 5d.1
  - `84a3342` — 5c
  - `1897eba` — plan v3 docs
  - `f2c7476` — plan v2 docs
  - `195d02b` — plan v1 docs
  - `89e36ee` — fase 4d (= main = producción)
- **Working tree**: limpio al carácter post-revert del bisect.

NB: `5d.4` NO aparece en la cadena — fue absorbido o renumerado en sesión 22 (revisar HANDOFF cierre sesión 22 si se necesita el detalle). NO bloqueante para sesión 24.

### §4.2 Producción Vercel

- Deploy actual: `89e36ee` (sin cambios desde sesión 16, 2 may 2026).
- Runtime efectivo: idéntico al cierre de sesión 22.
- Smoke producción NO requerido — sesión 23 no tocó main.

### §4.3 Bugs y deudas al cierre

| ID | Descripción | Estado al cierre 23 | Encaje |
|---|---|---|---|
| 5.1 | UX viewport — mantener vista al cambiar TF + atajo Opt+R/Alt+R | ✅ CERRADA en 5d.7 (sesión 22, mensaje commit literal) | Cerrada |
| 4.5 | `__algSuiteExportTools` no registrado correctamente | ⏳ ABIERTA — backlog | Sub-fase 5f.1 |
| Warning LWC `_requestUpdate is not set` al destruir tool | Cosmético, repetido en consola | ⏳ Backlog | Sub-fase 5b futura o limpieza fase 7 |
| 4.6 (parche timestamps) | Drawings descolocados al cambiar TF | ✅ CERRADA en código (sesión 14, commit `2851ef7`) + 5e cierra limpieza colateral | Cerrada estructuralmente |
| `[DEBUG TEMP]` instrumentación LS | Bloque gateado por flag muerta | ✅ CERRADA en 5e.3 | Cerrada |
| `patch-package` devDep no usada | Declaración muerta confundía diagnóstico | ✅ CERRADA en 5e.2 | Cerrada |
| Archivo huérfano `core` 399 KB raíz | Residuo migración pre-vendor | ✅ CERRADA en 5e.1 | Cerrada |
| **Drag M1 minisaltitos/freeze** | **NUEVA — detectada al cierre s23** | ⏳ **ABIERTA — multifactorial, cluster D + posible polling 300ms** | **Sub-fase 5f.0 (NUEVA, sesión 24)** |
| `debugCtx` parámetro muerto en `applyNewBarUpdate` | Residual de 5e.3 split intencional | ⏳ ABIERTA — out of scope intencional 5e.3 | Sub-fase 5e.4 (sesión 24 si tiempo, sino 5f) |
| Polling 300ms `__algSuiteExportTools` | Re-serializa array de tools cada 300ms | ⏳ ABIERTA — sospechoso secundario del freeze drag | Sub-fase 5f.2 (probable interacción con 5f.0) |
| B5 | `409 Conflict` race `session_drawings` | ✅ CERRADA en código (HANDOFF 19 §5.3) | Cerrada |
| Regresión Killzones (TF change) | Killzones se descolocaban al cambiar TF | Estado verificado en HANDOFFs s17-s19 como abierto en cluster D — no verificado al carácter en s23 si está cerrado tras 5d.5/5d.6/5d.7 | Verificar al arranque s24 |
| Quota Supabase | Vigilancia pasiva | ⏳ Vigilancia | No-acción salvo números reales altos |
| Limpieza ramas locales (~10 viejas) | Higiene git | ⏳ Backlog | Sesión corta puntual |
| Warning React `borderColor` shorthand | Cosmético hydration | ⏳ Backlog | Limpieza final fase 7 |

---

## §5 — Plan para sesión 24

### §5.1 Calendario plan v3 ajustado

Plan v3 §8 original sesión 24: sub-fase 5f (limpieza). **Ajuste al carácter tras hallazgo regresión drag M1**:

**Sesión 24 = sub-fase 5f.0 (NUEVA, prioridad crítica) + sub-fase 5e.4 (cosmética) + sub-fases 5f originales**.

| Sub-fase | Descripción | Prioridad | Notas |
|---|---|---|---|
| **5f.0** (NUEVA) | Diagnóstico fino regresión drag M1. Bisect targeted en cluster D (5d.1-5d.7). Identificar al carácter el callsite que se dispara en `visibleLogicalRangeChanged` (o equivalente del drag). Fix targeted — throttle/debounce/gate según diagnóstico. | **Crítica — bloqueante de cierre cluster B** | Ataque ANTES de 5e.4/5f.X |
| 5e.4 | Limpiar parámetro `debugCtx` muerto en signature `applyNewBarUpdate` + callers. | Baja — cosmética | Hacer si queda tiempo tras 5f.0; sino mover a 5f |
| 5f.1 | `__algSuiteExportTools` registrar correctamente. | Media | Plan v3 original |
| 5f.2 | Polling 300ms — investigar y posiblemente reducir frecuencia o eliminar. **Probable interacción con 5f.0** — si fix de 5f.0 toca el polling, 5f.2 cierra al mismo tiempo. | Media | Plan v3 original, probable colapso con 5f.0 |

### §5.2 PASO 0 obligatorio en sesión 24

Antes de tocar nada, leer en este orden:

1. Este HANDOFF entero, especialmente **§2** (diagnóstico drag M1) y **§3** (errores §9.4) y **§5.3** (plan táctico 5f.0).
2. Plan v3 §5 (sub-fase 5f original) + §7 (NO hacer) + §8 (calendario).
3. CLAUDE.md §1-§4 reglas absolutas.
4. HANDOFF cierre sesión 22 §1.X (commits 5d.5/5d.6/5d.7 al carácter — sospechosos primarios de la regresión drag).

### §5.3 Plan táctico 5f.0 — diagnóstico drag M1

**PASO 0 verificación al carácter al arranque sesión 24**:
- Rama `refactor/fase-5-drawings-lifecycle`, HEAD `0198039`, working tree limpio.
- Producción `89e36ee` sigue fluido (smoke pasivo Ramón, 30s drag M1 en `simulator.algorithmicsuite.com`).

**PASO 1 — bisect log₂(6)≈3 tests para localizar el primer commit del cluster D que introdujo minisaltitos**:

Cadena cluster D (de antiguo a nuevo, NO incluye 5e.1/5e.2/5e.3 que ya están descartados):
- `84a3342` (5c — descomposición handler TF, declarado "sin cambio comportamiento" pero verificar al carácter)
- `aa1498a` (5d.1)
- `4f943a4` (5d.2)
- `d7ee4a8` (5d.3)
- `96eb2e8` (5d.5 — CustomDrawingsOverlay conectado a chartTick) ← sospechoso primario CTO
- `590abe2` (5d.6 — PositionOverlay conectado a chartTick) ← sospechoso primario CTO
- `5b233b4` (5d.7 — scroll anchor) ← contribución al freeze confirmada empíricamente s23

**Test 1**: checkout `84a3342` (5c). Si fluido como producción → regresión está en cluster D (5d.1-5d.7). Si freezado → regresión está en 5c (improbable estructuralmente, pero hay que verificar al carácter porque HANDOFF 20 §0 lo declara "sin cambio comportamiento" sin pruebas exhaustivas).

**Test 2**: si Test 1 fluido, checkout `4f943a4` (5d.2, mediana log₂ de cluster D). Discrimina rango {5d.1-5d.2} vs {5d.3-5d.7}.

**Test 3**: refinamiento según Test 2.

Coste estimado: 3 builds × 1min + 3 drags × 1min = ~8 min reales.

**PASO 2 — leer diff del commit identificado**:
- `git --no-pager show <SHA-culpable>`
- Identificar callsites tocados que se disparen en `visibleLogicalRangeChanged` o equivalente del drag-to-pan.

**PASO 3 — fix targeted**:
- Opciones probables (a evaluar tras leer diff): `requestAnimationFrame` throttle, `debounce` con leading edge, gate por `chartTick` solo en bar nueva (no en visibleRange change), `useMemo` más estricto en overlays, throttle del polling 300ms si está en el camino.

**PASO 4 — smoke combinado obligatorio post-fix**:
- Drag M1 fluido al carácter (caso nuevo §5.5).
- Killzones intactas al cambio TF.
- Drawings respetan floor por timestamp al cambio TF.
- LongShortPosition no se contrae al play.
- Phantoms TrendLine extendida visible en play.

**PASO 5 — commit + push (decisión aparte según patrón sesión)**.

### §5.4 Cluster A INTOCABLE en sesión 24

Mismo principio que sesiones 20-22-23 (HANDOFF 19 §4.5 + plan v3 §7 punto 13). Sub-fase 5f.0 toca posiblemente `_SessionInner.js` para fix de overlays del cluster D. Las líneas del cluster A (`_SessionInner.js` L297-L365 persistencia, L370-L415 afterEditHandler/polling, L450-L456 visibilidad TF) **NO se modifican** aunque el Edit pase cerca por scrolling. Plan v3 §7 punto 13 absoluto.

### §5.5 Smoke combinado NUEVO al cierre de cualquier sub-fase cluster B (lección §3.3)

Añadir como caso obligatorio de smoke combinado al cierre de cualquier sub-fase de cluster B (5d, 5e, 5f, 5g):

**Caso N — drag-to-pan M1 fluido**:
1. TF M1, par cualquiera, drawing visible (TrendLine o LongShortPosition).
2. Drag rápido del gráfico izq/der varias pasadas (3-5 segundos).
3. Observación binaria: fluido al carácter (como producción `89e36ee`) o freezado/minisaltitos.

Cierre limpio de sub-fase requiere fluido. Si freezado en sesión post-fix de 5f.0, fix incompleto — diagnóstico adicional requerido.

---

## §6 — Material verificado al carácter en sesión 23 (preservado para sesiones futuras)

### §6.1 Topología cluster B al carácter (verificada por bisect parcial s23)

```
89e36ee (fase 4d, producción, main)
    ↑
1897eba (plan v3, docs)
    ↑
84a3342 (5c — descomposición handler TF en 6 helpers)
    ↑
aa1498a (5d.1)
    ↑
4f943a4 (5d.2)
    ↑
d7ee4a8 (5d.3)
    ↑
96eb2e8 (5d.5 — CustomDrawingsOverlay conectado a chartTick)
    ↑
590abe2 (5d.6 — PositionOverlay conectado a chartTick)
    ↑
5b233b4 (5d.7 — scroll anchor compensando phantoms)
    ↑
835caf7 (5e.1 — borrar huérfano 399 KB)
    ↑
c238c63 (5e.2 — uninstall patch-package)
    ↑
0198039 (5e.3 — eliminar [DEBUG TEMP]) [HEAD rama feature]
```

NB: `5d.4` NO existe como commit separado — gap topológico, posiblemente renumerado o absorbido en sesión 22. No bloqueante.

### §6.2 Estrategia de parcheo LWC documentada al carácter

Confirmada al carácter en inventario sesión 22 + descarte de hipótesis errónea sobre `patch-package` en sesión 23 (5e.2 cerró la limpieza).

**Estrategia real de parcheo del fork de difurious**: alias webpack en `next.config.js` apuntando a `vendor/lightweight-charts-line-tools-{core,lines,long-short-position}/dist/`. **NO patch-package**.

**Verificado al carácter en sesión 23**:
- `patches/` directory NO existe en el repo.
- `package.json` post-5e.2: NO tiene script `postinstall: patch-package`.
- 3 vendors parcheados: `core`, `lines`, `long-short-position`.
- 3 forks SIN parche local: `fib-retracement`, `path`, `rectangle` (resuelven a `node_modules/...`).
- El parche real del bug 4.6 vive en `vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js:1605-1612` (sesión 14, commit `2851ef7` en main).

**Implicación para fases futuras**: si fase futura requiere parchear más vendors, el patrón es:
1. Copiar `node_modules/<pkg>/dist/...` a `vendor/<pkg>/dist/...`.
2. Editar el archivo en `vendor/`.
3. Añadir alias en `next.config.js`.

NO usar patch-package. NO reinstalar patch-package en devDeps.

### §6.3 Mapa runtime de la zona invariante fase 4 al carácter (post-5e.3)

`lib/chartRender.js` post-5e.3:
- `applyTickUpdate(cr, agg, phantoms, lastClose)` — render completo (path A, ticks intra-bar).
- `applyNewBarUpdate(cr, agg, phantoms, debugCtx)` — render incremental para nueva vela (path B). `debugCtx` parámetro vivo en signature pero ya no se usa en el cuerpo (out of scope 5e.3, irá a 5e.4).
- `applyFullRender(cr, agg, phantoms)` — fallback global desde catch de `restoreOnNewBar`.

3 invariantes fase 4 al carácter (verificadas en V3 sesión 23):
- `cr.series.setData` solo en `lib/chartRender.js`.
- `cr.series.update` solo en `lib/chartRender.js`.
- `computePhantomsNeeded` 3 matches en `_SessionInner.js`: L116 (definición), L1145 (call site 1), L1224 (call site 2). Líneas pueden variar +/-2 según futuras ediciones.

### §6.4 Verbatim del veredicto bisect Ramón (preservar al carácter para sesión 24)

| HEAD testeado | Veredicto Ramón al carácter |
|---|---|
| `89e36ee` (producción, fase 4d) | **fluido** |
| `0198039` (cluster E completo, HEAD feature) | **freezado** |
| `590abe2` (5d.6, pre-5d.7, detached) | *"va un poco más rápido pero con minisaltitos que hacen que parezca freezado"* |

---

## §7 — Procedimiento de cierre sesión 23

### §7.1 Inmediato (esta sesión, post-redacción del HANDOFF)

Tras descargar este HANDOFF a `~/Downloads/HANDOFF-cierre-sesion-23.md`:

```
git checkout main
```

```
mv ~/Downloads/HANDOFF-cierre-sesion-23.md refactor/
```

```
ls -la refactor/HANDOFF-cierre-sesion-23.md
```

```
wc -l refactor/HANDOFF-cierre-sesion-23.md
```

```
git add refactor/HANDOFF-cierre-sesion-23.md
```

```
git status
```

```
git commit -m "docs(sesion-23): cerrar sesion 23 con sub-fase 5e completa en rama feature y diagnostico parcial regresion drag M1"
```

```
git --no-pager log --oneline -3
```

### §7.2 Push a main

**Recomendación CTO**: SÍ push. Patrón histórico sesiones 14-22 mantenido al carácter. Runtime intacto, idempotente (HANDOFF es docs, no toca código).

```
git push origin main
```

### §7.3 Próxima sesión (sesión 24)

PASO 0 según §5.2. Plan táctico §5.3.

### §7.4 Backlog post-sesión-24

- Sub-fase 5e.4 (cosmética).
- Sub-fases 5f.1 + 5f.2 + 5f.3 originales del plan v3 (probablemente reducidas/colapsadas tras 5f.0).
- Sub-fase 5g (cierre cluster B + smoke producción + merge a main).
- Fase 6 — trading domain.
- Fase 7 — reducir `_SessionInner.js`.
- Limpieza ramas locales (~10 viejas, sesión corta puntual).

---

## §8 — Métricas sesión 23

- **Inicio efectivo**: re-arranque del chat ~10:53 hora local (8 may 2026) tras cierre del chat web previo mid-5e.2. CTO restauró contexto vía project_knowledge_search + conversation_search.
- **5e.1 (cerrada PRE-cierre del chat)**: hash `835caf7`, cerrada antes del re-arranque.
- **5e.2 (uninstall patch-package)**: ~10 min — verificación bicapa estricta + commit + smoke. Hash `c238c63`.
- **5e.3 (eliminar [DEBUG TEMP])**: ~30 min — 3 reads de inspección + replanificación C-recortada + 3 Edits + V1-V6 + commit + smoke (3 casos). Hash `0198039`.
- **Diagnóstico drag M1 + bisect parcial**: ~20 min — hipótesis dev mode penalty descartada vía `npm run build && npm run start` + bisect a `590abe2` + revert a HEAD `0198039`.
- **Total efectivo de sesión 23**: ~60 min de trabajo activo + tiempo de re-arranque del chat + tiempo de redacción del HANDOFF.
- **Commits funcionales producidos**: 2 (5e.2 + 5e.3) + 1 pre-existente al re-arranque (5e.1) = 3 totales en cluster E.
- **Líneas/bytes eliminados**:
  - 399 KB (archivo huérfano binario, 5e.1).
  - 619 líneas package-lock.json + 1 línea package.json (5e.2).
  - 29 líneas netas en chartRender.js + chartViewport.js (5e.3).
- **Push a main**: 0 (rama feature mantenida intacta, mergeará en sesión 25 según calendario v3 §8).

---

## §9 — Aprendizajes generales del proyecto (acumulados sesiones 13-23)

> Sección que persiste a través de HANDOFFs.

1. **§9.4 es bidireccional.** Errores propios del CTO se registran sin auto-flagelación. Sesión 23 añade 3 errores menores (§3.1 scope mal calibrado de 5e.3, §3.2 confusión semántica 5c vs padre directo de 5d.7, §3.3 smoke estructurado sin drag-to-pan).
2. **Principio rector (CLAUDE.md §1) es absoluto.** Sin alumnos en producción no hay urgencia operativa. Refactor primero, bugs en su fase, apertura solo tras cierre. Sesión 23 confirma al carácter: regresión drag M1 detectada en local, producción intacta, fix se calendariza limpio para sesión 24 sin presión.
3. **Validación al carácter en shell de Ramón es no-negociable.** Sesión 23 corrigió al carácter dos asunciones del CTO (off-by-one en 5e.3, padre directo de 5d.7 en bisect). Bicapa funcionó. Claude Code como ejecutor con responsabilidad de PARAR ante discrepancias es el patrón correcto.
4. **Smoke combinado de cluster B debe incluir drag-to-pan M1.** Lección nueva sesión 23 §3.3. Añadido como caso obligatorio §5.5.
5. **Bisect targeted con razón estructural primero, granular después.** Sesión 23 cerró bisect en 1 test efectivo + 1 hipótesis estructural + decisión de parar antes que log₂(6) tests adicionales sin acción inmediata.
6. **Información granular sin acción posible NO compensa el coste de obtenerla en sesión.** Sesión 23 §2.5: parar el bisect en `590abe2` fue la decisión correcta — los 3 tests adicionales habrían sido prematuros sin diff de fix en mente.
7. **Re-arranque de chat web no rompe sesión si HANDOFF + project_knowledge están actualizados.** Sesión 23 demostró al carácter que la pérdida del chat web mid-5e.2 NO causó pérdida de progreso real — Ramón pegó el último mensaje del CTO previo, project_knowledge tenía el plan ejecutivo, conversation_search recuperó los detalles. **Implicación**: HANDOFFs detallados al carácter son la red de seguridad real, no el chat web. Mantener disciplina §0 sin maquillaje al frente.

---

## §10 — Cierre

Sesión 23 deja:
- **Cluster E (5e.1, 5e.2, 5e.3) completo en rama feature**. HEAD `0198039`. Working tree limpio.
- **Producción `89e36ee` intacta** desde 2 may 2026 (7 días).
- **Diagnóstico parcial regresión drag M1**: multifactorial, NO atribuible a cluster E, sospechosos primarios en cluster D (5d.5/5d.6/5d.7) + posible interacción con polling 300ms (deuda 5f.2).
- **Plan v3 calendario ajustado**: sesión 24 arranca con sub-fase **5f.0 NUEVA** (diagnóstico fino + fix drag M1) ANTES de 5f.1/5f.2/5f.3 originales.

Próximo HANDOFF (cierre sesión 24) debe reportar al carácter:
- Si bisect targeted localizó el commit culpable de los minisaltitos base.
- Si fix de 5f.0 cerró drag M1 fluido al carácter (smoke pasa el caso "drag M1 = producción").
- Si la interacción polling 300ms × overlays chartTick fue parte del fix o se cierra en 5f.2.
- Decisión sobre orden de 5f.1/5f.2 tras fix 5f.0 (posible colapso de sub-fases).
- Si Killzones siguen intactas tras cluster D (verificar al arranque, ver §4.3 entrada Killzones).

Si sesión 24 NO cierra 5f.0, el HANDOFF lo dice al frente sin maquillaje — patrón §0 mantenido.

---

*Fin del HANDOFF cierre sesión 23. 9 mayo 2026. Redactado por CTO/revisor tras commits 5e.1+5e.2+5e.3 en rama feature `refactor/fase-5-drawings-lifecycle` (HEAD `0198039`) + bisect parcial detached HEAD `590abe2` revertido al carácter.*
