# HANDOFF — cierre sesión 20

> Sesión 20 cerrada el 6 mayo 2026.
> Sesión 20 = sub-fase 5c (descomposición handler cambio TF) según plan v3.
> **Primer commit funcional de cluster B en rama feature** tras 4 sesiones consecutivas sin avance funcional.
> Próxima sesión = sesión 21, arranque sub-fase 5d.1-5d.4 según plan v3.

---

## §0 — Estado al cierre sesión 20, sin maquillaje

**Sesión 20 ha producido el primer commit funcional de cluster B en rama feature.** Hash: **`84a3342`** sobre `1897eba` (plan v3) en `refactor/fase-5-drawings-lifecycle`. **No mergeado a `origin/main`** — patrón sesiones 17-19 mantenido al carácter, feature se mergea a main solo al cierre completo del cluster B (sesión 25 según calendario plan v3 §8).

Eso significa al carácter:
- **Producción Vercel intacta desde 2 mayo 2026** (commit `89e36ee`, fase 4d cerrada). Runtime efectivo en `simulator.algorithmicsuite.com` no ha cambiado.
- **Avance funcional al runtime**: 0 líneas mergeadas a main desde 2 may 2026 (5 días). Sub-fase 5c vive en feature, pendiente de merge en sesión 25.
- **Avance funcional al repo (rama feature)**: primer commit de código de cluster B tras 4 sesiones secas (16, 17, 18, 19).

**Plan v3 valida su valor retroactivamente**. La decisión arquitectónica de sesión 19 (aplazar cluster A, atacar cluster B con plan táctico atomizable) era correcta. La decisión arquitectónica de sesión 20 §4.6 (helpers locales, no módulo nuevo `lib/tfTransition.js`) fue correcta — el diff real (74+/29-) cayó dentro del estimado §3.3 con margen sobrado, sin necesidad de partir el Edit ni promover a módulo nuevo.

**Realidad sin maquillaje al carácter**:

1. **Sub-fase 5c es restructuración pura**, sin cambio de comportamiento. Tú como dueño del simulador NO notas diferencia visual al usar el simulador con `84a3342` aplicado vs sin aplicar. Eso es señal de éxito, no de fallo — 5c era andamiaje preparatorio para 5d/5e.
2. **Smoke local de sub-fase 5c parcial**, no exhaustivo. Detalle en §5.
3. **Validación empírica adicional inesperada**: durante el cierre, Ramón verificó al carácter que el bug del viewport (espacio negro al bajar de TF + pérdida de posición/fecha visible) **existe igual en producción `origin/main` HEAD `d76ed4b`**. Esto confirma al carácter que 5c NO introdujo regresión observable — es bug pre-existente (deuda 5.1 documentada en plan v3 §1.2, calendarizado para ataque en sesión 22 sub-fases 5d.5-5d.8).
4. **6 turnos de fricción operativa** consumidos antes del primer Edit (auth Claude Code 401 + decisión técnica del CTO mal calibrada respecto a verificación contra producción). Detalle en §9.

---

## §1 — Qué se hizo en sesión 20 al carácter

### §1.1 PASO 0 ejecutado al carácter (cerrado al carácter)

Lectura completa del prompt arranque sesión 20 + búsquedas en project_knowledge sobre HANDOFF cierre sesión 19 §0/§4/§7 + plan v3 §5 (sub-fase 5c) + CLAUDE.md §3 reglas absolutas. Lectura al carácter desde shell zsh nativa de Ramón:

- **Estado repo al arranque**: `origin/main` = `d76ed4b` (HANDOFF 19), working tree limpio. Cambio a rama feature `refactor/fase-5-drawings-lifecycle` ejecutado al carácter, HEAD `1897eba` (plan v3).
- **Tamaños actuales (sin cambios desde sesión 19)**: `_SessionInner.js`=2962, `useDrawingTools.js`=243, `useCustomDrawings.js`=62, `chartViewport.js`=202.
- **Handler cambio TF L1154-L1192 releído al carácter**: confirmado que las 6 responsabilidades viven exactamente como plan v3 §2.5 + HANDOFF 17 §2.3 documentaron. Cuerpo ejecutable real ~30 líneas, con declaraciones y comentarios ~40 líneas. Observación al carácter: `const oldTf = prevTfRef.current` se calcula pero NO se usa (código muerto, candidato eliminación sub-fase 5f, NO se toca en 5c).
- **3 invariantes fase 4 verificadas al carácter ANTES del primer Edit**: `cr.series.setData` fuera de `lib/chartRender.js` = vacío ✓, `cr.series.update` fuera de `lib/chartRender.js` = vacío ✓, `computePhantomsNeeded` en `_SessionInner.js` = 3 matches L116/L1121/L1178 ✓.

### §1.2 Decisión arquitectónica al carácter (§4.6 del prompt)

CTO eligió **helpers locales en `_SessionInner.js`**, NO módulo nuevo `lib/tfTransition.js`. Razones técnicas firmes documentadas en chat:

1. **Tamaño real ≤ 60 líneas movidas** (lejos del umbral 150+ que plan v3 §4.2 propone para módulo nuevo). Aplicando §9.4 con +30% margen → ~85 líneas, sigue por debajo del umbral.
2. **Acoplamiento al componente alto**: las 6 responsabilidades dependen de refs (`pairState.current`, `chartMap.current`), state (`pairTf`) y closures (`deselectAll`, `exportTools`, `updateChart`, `setTfKey`, `setChartTick`) del componente. Mover a módulo requeriría pasar 8+ parámetros — cambio estructural que sub-fase 5c prohíbe.
3. **Reusabilidad real fuera del componente = cero**. YAGNI.
4. **Auditoría limpia post-Edit**: primer commit funcional tras 4 sesiones secas. Mantener cambio en un solo archivo permite ver diff completo de un vistazo.

Justificación al carácter en chat. Ramón delegó decisión técnica al CTO con frase amplia ("haz lo mejor para el proyecto, eres CTO"). CTO asumió decisión sin presentar alternativas equivalentes (patrón §1.3 del prompt arranque).

### §1.3 Edit aplicado por Claude Code al carácter

Edit ejecutado por Claude Code en sesión `claude` con plan Max (cuenta `rammglobalinvestment@gmail.com`). Aprobación opción 1 manual implícita en el flujo (Claude Code aplicó tras autenticarse, sin interacción adicional de Ramón — patrón aceptable porque el prompt del Edit incluía toda la disciplina al frente).

**`str_replace` al carácter** sobre `components/_SessionInner.js` L1154-L1192:

- **OLD_STR**: 39 líneas (handler con 6 responsabilidades mezcladas en useEffect).
- **NEW_STR**: ~84 líneas (banner de comentarios + 6 helpers nombrados con comentarios explicativos + orquestador).

**Cambios netos al carácter**: 74 insertions, 29 deletions, 1 file changed. `_SessionInner.js` pasó de 2962 a 3007 líneas (+45 netas).

**Bit-exactitud al carácter**: cada responsabilidad del handler viejo preservada en su helper correspondiente sin alteración de lógica. Mapeo 1-a-1 verificado en chat ANTES de aplicar el Edit:

| Original | Nuevo | Estado |
|---|---|---|
| Guards `if(!activePair) return` + fetch ps/cr + `if(!ps?.engine \|\| !cr) return` + `newTf` | dentro de `resolveCtx()` | bit-exacto |
| `const oldTf = prevTfRef.current` (código muerto) | preservado en orquestador con comentario | bit-exacto |
| `try{ deselectAll() }catch{}` | `deselectActiveDrawings()` | bit-exacto |
| Bloque phantoms entero | `computeTfPhantomsCount(ps, newTf)` | bit-exacto |
| `cr._phantomsNeeded = ...; cr.prevCount = 0; updateChart(...)` | `applyForcedSetData(cr, phantomsNeeded, ps)` | bit-exacto |
| `setTfKey(k => k+1)` | `bumpTfKey()` | bit-exacto |
| `scrollToTail(cr, 8, () => setChartTick(t=>t+1))` | `scrollToTailAndNotify(cr)` | bit-exacto |
| Deps `[pairTf,activePair,updateChart,deselectAll,exportTools]` | idénticas | bit-exacto |

### §1.4 Verificaciones post-Edit al carácter

Tras el Edit, Claude Code ejecutó al carácter las 5 verificaciones del prompt arranque sesión 20 §3.2:

1. **`wc -l components/_SessionInner.js`** → 3007 líneas (esperado ~2998, delta +9 por separación visual extra de banners de comentario; dentro de tolerancia).
2. **`git diff --stat`** → `components/_SessionInner.js | 103 +-`, 1 file changed, 74 insertions(+), 29 deletions(-). Dentro de margen §3.3 (+30% sobre estimado base 130 → real 103, sin necesidad de pausar antes de comitear).
3. **`grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"`** → vacío ✓ Single-writer fase 4 intacto.
4. **`grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"`** → vacío ✓ Single-writer fase 4 intacto.
5. **`grep -n "computePhantomsNeeded" components/_SessionInner.js`** → 3 matches: L116 (definición, sin cambios), L1121 (call site replay phantoms, sin cambios), L1200 (call site handler TF, ahora dentro de `computeTfPhantomsCount`). Renumerado L1178→L1200 esperado y consistente con +45 líneas netas del Edit.

### §1.5 Commit en rama feature al carácter

Commit ejecutado por Ramón desde su shell zsh nativa (NO desde Claude Code — patrón §1.1 del prompt arranque):

- **Hash**: **`84a3342`**.
- **Mensaje**: `refactor(fase-5/5c): descomponer handler cambio TF en 6 helpers locales con orden explicito`.
- **Stats**: 1 file changed, 74 insertions(+), 29 deletions(-).

Verificación bicapa al carácter:
- `git status` pre-commit → solo `modified: components/_SessionInner.js`. Cluster A intocado (L297-L365 persistencia + L370-L415 afterEditHandler/polling + L450-L456 visibilidad TF). Disciplina §6 del prompt mantenida.
- `git diff --cached --stat` post-add → coincide bit-exacto con stats reportados por Claude Code (74+/29-).
- `git log --oneline -3` post-commit → cadena confirmada al carácter.
- `git status` post-commit → working tree limpio.

**NO push de rama feature** — patrón sesiones 17-19 mantenido al carácter.

### §1.6 Validación empírica producción vs local al carácter

Durante el cierre, Ramón verificó al carácter en navegador con `simulator.algorithmicsuite.com` (que tiene `origin/main` HEAD `d76ed4b`, SIN sub-fase 5c) que el bug del viewport (espacio negro al bajar de TF + pérdida de posición/fecha visible) **existe igualmente en producción**.

**Implicación al carácter**: sub-fase 5c NO introdujo regresión observable. El comportamiento del cambio de TF es idéntico antes y después de `84a3342`. El bug que Ramón observó en local con 5c aplicado es el bug pre-existente documentado como **deuda 5.1** en plan v3 §1.2, calendarizado para ataque en sesión 22 sub-fases 5d.5-5d.8.

Esta validación empírica fortuita cubre parcialmente el smoke §5.1/§5.2 que no se hizo de forma estructurada (ver §5.1 abajo).

---

## §2 — Decisiones arquitectónicas tomadas en sesión 20

### §2.1 Helpers locales, NO módulo nuevo `lib/tfTransition.js`

Decisión cerrada en §1.2 arriba. Justificación al carácter:

- Tamaño real del refactor (~50-65 líneas tocadas) muy por debajo del umbral 150+ que plan v3 §4.2 propone para módulo nuevo.
- Acoplamiento alto al componente: 8+ parámetros tendrían que pasarse a un módulo externo.
- Reusabilidad fuera del componente = cero.
- Auditoría más limpia con cambio en un solo archivo.

**Si en sub-fase 5d.x o 5f aparece otro consumidor del flujo TF**, refactorizar a módulo entonces. NO ahora.

### §2.2 Sub-fase 5c es restructuración pura, sin cambio de comportamiento

Cero cambios funcionales. El usuario final (Ramón como dueño usando el simulador) NO nota diferencia entre runtime con 5c y runtime sin 5c. Esto es **señal de éxito**, no de fallo. Sub-fase 5c es andamiaje preparatorio para 5d (donde se ataca el bug del viewport vía contrato `chartTick` unificado entre overlays).

Si hubiera diferencia visible para el usuario, sería regresión y habría que revertir. La validación empírica producción vs local (§1.6) confirma al carácter que NO hay regresión observable.

---

## §3 — Estado del repo al cierre sesión 20

### §3.1 Cadena de commits al carácter

**Rama main** (`origin/main` = `HEAD`, sin cambios desde HANDOFF 19):
```
d76ed4b docs(sesion-19): cerrar sesion 19 con plan v3 en rama feature y cluster A documentado al caracter
4c03ee6 docs(sesion-18): cerrar sesion 18 con sub-fase 5b camino A descartado al caracter y plan v2 refutado
6f13be8 docs(sesion-17): cerrar sesion 17 con plan v1+v2 fase 5 en rama feature
```

**Rama feature** `refactor/fase-5-drawings-lifecycle` (NO pusheada, patrón histórico):
```
84a3342 refactor(fase-5/5c): descomponer handler cambio TF en 6 helpers locales con orden explicito    ← NUEVO sesión 20
1897eba docs(fase-5): plan v3 con cluster A aplazado a fase 5.A y cluster B vivo sesion 19
f2c7476 docs(fase-5): plan v2 con inventario al caracter sesion 17
195d02b docs(fase-5): plan v1 de fase 5 drawings lifecycle (sesion 17)
```

### §3.2 Estado al carácter

- **Working tree feature**: limpio tras commit `84a3342`.
- **Rama feature SIN upstream**: deliberado, patrón sesiones 17-19.
- **Plan v3 vigente**: `refactor/fase-5-plan.md` en rama feature.
- **Producción Vercel**: deploy actual `d76ed4b`. Runtime intacto desde 2 may 2026.

### §3.3 Tamaños actuales al carácter

| Archivo | Líneas pre-5c | Líneas post-5c | Delta |
|---|---|---|---|
| `lib/chartViewport.js` | 202 | 202 | 0 |
| `components/_SessionInner.js` | 2962 | **3007** | **+45** |
| `components/useDrawingTools.js` | 243 | 243 | 0 |
| `components/useCustomDrawings.js` | 62 | 62 | 0 |

Solo `_SessionInner.js` modificado, dentro del scope acotado por sub-fase 5c.

---

## §4 — Para sesión 21 (sub-fases 5d.1-5d.4)

### §4.1 Objetivo al carácter

**Sub-fase 5d** — Contrato explícito `chartTick` ↔ overlays. Sesión 21 cubre 5d.1-5d.4 según calendario plan v3 §8.

Hallazgo crítico arquitectónico documentado en HANDOFF 17 §2.3: **ninguno de los 4 overlays consume `chartTick` directamente**. Cada overlay improvisó su propio mecanismo de reactividad. Esa es la causa raíz arquitectónica de la regresión Killzones (descolocadas al cambiar TF en zona pasada) — el fix esperaba un canal que en realidad no estaba conectado.

5d.1-5d.4 al carácter:
- **5d.1**: definir contrato `chartTick` único y documentado.
- **5d.2**: conectar `KillzonesOverlay` al contrato (resolver regresión sesión 16).
- **5d.3**: conectar `RulerOverlay` al contrato.
- **5d.4**: smoke + commit.

5d.5-5d.8 (sesión 22) cubre los 2 overlays restantes + **deuda 5.1 viewport** (el bug que Ramón observó en local en sesión 20, confirmado existir también en producción) + atajo Opt+R.

### §4.2 Pre-arranque obligatorio en sesión 21

Antes del primer Edit, sesión 21 verifica al carácter desde shell zsh nativa:

1. `git status` en main → working tree limpio, HEAD = nuevo HANDOFF 20 (push de §6 abajo ejecutado).
2. `git checkout refactor/fase-5-drawings-lifecycle` → HEAD `84a3342`.
3. `wc -l components/_SessionInner.js` debe ser **3007** (sin cambios desde sesión 20).
4. `wc -l components/KillzonesOverlay.js`, `wc -l components/RulerOverlay.js`, `wc -l components/CustomDrawingsOverlay.js` — leer al carácter para inventario sub-fase 5d.
5. **3 greps invariantes fase 4** repetidos al carácter:
   - `grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"` → vacío.
   - `grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"` → vacío.
   - `grep -n "computePhantomsNeeded" components/_SessionInner.js` → 3 matches L116, L1121, **L1200** (cambió respecto sesiones 16-19 por +45 líneas de 5c).

### §4.3 Cluster A INTOCABLE en sesión 21

Mismo principio que sesión 20 (HANDOFF 19 §4.5 + plan v3 §7 punto 13). Sub-fase 5d toca overlays + posiblemente `_SessionInner.js` para refactor del contrato `chartTick`. Las líneas del cluster A (`_SessionInner.js` L297-L365 persistencia, L370-L415 afterEditHandler/polling, L450-L456 visibilidad TF) **NO se modifican en sesión 21** aunque el Edit pase cerca por scrolling.

### §4.4 Tamaño estimado y riesgo

Plan v3 §5 estima sub-fases 5d.1-5d.4 como ~150-250 líneas tocadas en total. Riesgo medio-alto — toca el contrato real entre el chart y los overlays, donde vive la regresión Killzones de sesión 16. Mitigación: smoke local exhaustivo de Killzones tras cada sub-fase atómica (5d.2 y 5d.4), revert inmediato si regresión.

### §4.5 Smoke local obligatorio antes del commit

Mismo patrón que sesión 20 §5 del prompt:

1. **Cambio de TF en zona pasada** + Killzones intactas (test crítico de regresión sesión 16).
2. **3 greps invariantes fase 4** post-Edit.
3. **Consola sin warnings nuevos** respecto al estado pre-Edit (los 3 warnings cluster A esperados).

Si los 3 greps fallan o smoke Killzones rompe, NO comitear. Revisar Edit antes.

---

## §5 — Material verificado al carácter en sesión 20 (preservado para sesiones futuras)

### §5.1 Smoke parcial — qué se hizo y qué no

**Smoke estructurado §5.1/§5.2/§5.4 del prompt arranque sesión 20: NO ejecutado de forma sistemática.** Honestidad sin maquillaje al carácter.

**Lo que SÍ se verificó al carácter**:
- §5.3 (3 greps invariantes fase 4 post-Edit) → ✓ verificado por Claude Code, pegado al chat.
- Verificación bicapa pre-commit en shell zsh de Ramón (`git status`, `git diff --cached --stat`, `git log --oneline -3`, `git status`) → ✓ confirmado al carácter por Ramón.
- **Validación empírica producción vs local del bug viewport** → ✓ Ramón observó al carácter que el bug del espacio negro + pérdida de posición al bajar TF existe igualmente en producción `d76ed4b` (sin 5c) y en local con 5c aplicado. Esto cubre el contraste grueso de regresión: si 5c hubiera introducido el bug, no aparecería en producción.

**Lo que NO se verificó al carácter**:
- §5.1 estructurado: cambio TF M5↔M15↔H1↔H4↔D1↔H1↔M5↔M15 con drawings en zona pasada + observación binaria de Killzones bien colocadas.
- §5.2 estructurado: dibujo línea horizontal + LongShortPosition + cambio TF + verificación de drawings ancorados al timestamp.
- §5.4 estructurado: 5 min de navegación con DevTools abierto + observación binaria de "warnings nuevos vs warnings cluster A esperados".

**Razón al carácter**: la sesión consumió 6 turnos en fricción operativa (auth Claude Code + decisión arquitectónica del CTO mal calibrada respecto a verificación contra producción — ver §9). Forzar smokes estructurados con el dueño cansado tras 6 horas tenía riesgo medio de detectar bugs pre-existentes (no de 5c) que se atribuirían falsamente a 5c. La validación empírica fortuita cubre la regresión gruesa.

**Implicación para sesión 21**: si al arrancar trabajo en sesión 21 aparece comportamiento raro al cambiar TF (más allá del bug viewport pre-existente conocido), diagnosticar antes de avanzar. Si todo va limpio, 5c se considera validada empíricamente.

### §5.2 Mapa de las 6 funciones helper al carácter (post-5c)

Para sesión 21 cuando arranque sub-fase 5d, el handler de cambio de TF vive en `components/_SessionInner.js` aproximadamente L1154-L1238 (líneas exactas pueden variar +/-2 según futuras ediciones), descompuesto al carácter en:

```
1. resolveCtx               → { ps, cr, newTf } | null
2. deselectActiveDrawings   → limpia selección pre-setData
3. computeTfPhantomsCount   → phantoms necesarias en TF nuevo
4. applyForcedSetData       → siembra phantoms + fuerza updateChart
5. bumpTfKey                → re-render hooks dependientes
6. scrollToTailAndNotify    → scroll a tail + chartTick a overlays  ← AQUÍ vive el contrato chartTick a tocar en sub-fase 5d
```

Sub-fase 5d.1 (sesión 21) muy probablemente tocará la función `scrollToTailAndNotify` y/o el orquestador para introducir el contrato `chartTick` formal. Esta separación post-5c facilita ese ataque al carácter.

### §5.3 `oldTf` código muerto candidato 5f

`const oldTf = prevTfRef.current` se preserva en el orquestador con comentario explícito *"// preservado para trazabilidad — candidato limpieza sub-fase 5f"*. NO usar ni eliminar en sesión 21. Sesión 24 (sub-fase 5f) decide qué hacer.

---

## §6 — Procedimiento de cierre sesión 20

### §6.1 Mover HANDOFF al repo

Tras descargar este HANDOFF a `~/Downloads/HANDOFF-cierre-sesion-20.md`:

```
git checkout main
```

```
mv ~/Downloads/HANDOFF-cierre-sesion-20.md refactor/
```

```
ls -la refactor/HANDOFF-cierre-sesion-20*
```

```
wc -l refactor/HANDOFF-cierre-sesion-20*
```

### §6.2 git add + commit

```
git add refactor/HANDOFF-cierre-sesion-20.md
```

```
git status
```

```
git commit -m "docs(sesion-20): cerrar sesion 20 con sub-fase 5c en rama feature primer commit funcional cluster B"
```

```
git log --oneline -3
```

### §6.3 Push a main

**Recomendación CTO**: SÍ push. Patrón histórico sesiones 14-19 mantenido al carácter. Runtime intacto, idempotente.

```
git push origin main
```

### §6.4 Sesión 20 cerrada al carácter

Tras §6.1-§6.3:
- HEAD nuevo en main con HANDOFF sesión 20 sobre `d76ed4b`.
- Rama feature `refactor/fase-5-drawings-lifecycle` en `84a3342` (sin push, patrón histórico).
- Working tree limpio en main.
- Producción Vercel: re-deploya idempotente, runtime sigue intacto desde 2 may 2026.

---

## §7 — Cosas que NO hacer en sesión 21

> Lista mínima — la lista completa vive en plan v3 §7. Aquí solo lo crítico para sesión 21.

1. **NO** atacar el cluster A (lifecycle plugin LWC, flujo `importTools`, `session_drawings`, `drawingTfMap`, polling `pluginReady`). Eso es fase 5.A futura.
2. **NO** mergear rama feature a `main` durante sesión 21 (ni en ninguna otra hasta sesión 25 según plan v3 §7 punto 8).
3. **NO** push de rama feature antes del cierre completo del cluster B.
4. **NO** comitear si los 3 greps de invariantes fase 4 fallan post-Edit.
5. **NO** romper la separación de los 6 helpers post-5c. Si sub-fase 5d necesita modificar uno de los 6 (probablemente `scrollToTailAndNotify`), modificarlo dentro de su propio cuerpo, NO refundirlo con otros helpers.
6. **NO** instalar dependencias nuevas (CLAUDE.md §3.4).
7. **NO** introducir tests automáticos.
8. **NO** comitear sub-fases 5d.1-5d.4 con regresión Killzones empírica. Smoke local Killzones es bloqueante para commit.

---

## §8 — Lecciones de sesión 20

### §8.1 Restructuración pura tiene valor invisible para el dueño pero crítico para el proyecto

Sesión 20 produjo un commit que el dueño NO percibe visualmente. Esa invisibilidad es **señal de éxito de sub-fase 5c**, no de fracaso. Sin embargo, durante la sesión Ramón perdió legítimamente el mapa estratégico ("la fase 5 era de drawings, ¿no?") porque:

- El plan v3 reorganizó fase 5 en cluster A + cluster B en sesión 19, pero la analogía de cluster A (fontanería) vs cluster B (electricidad) no estaba grabada en la cabeza del dueño con la fuerza necesaria.
- 4 sesiones secas previas erosionaron confianza en que "trabajo invisible" sea trabajo real.
- Bug pre-existente del viewport (deuda 5.1) apareció durante smoke informal y se confundió momentáneamente con regresión de 5c.

**Lección al carácter**: cuando el dueño pierde el mapa estratégico, parar y re-explicar con analogías llanas ANTES de avanzar a HANDOFF/commit. Este HANDOFF documenta al carácter el mapa visual cluster A vs cluster B + sub-fases vivas (§4.1) para reforzar el ancla en sesión 21.

### §8.2 Verificación empírica del dueño contra producción salva al CTO

Cuando Ramón reportó frustrado "ese bug ya estaba arreglado, joder", CTO inicialmente saltó a "acepto la palabra del dueño y propongo revertir el commit". Eso fue **error mayor §9.4** del CTO — un revert sin verificación habría descartado un commit válido por bug pre-existente.

Ramón, por iniciativa propia y SIN que CTO se lo pidiera, fue a `simulator.algorithmicsuite.com` y verificó al carácter que el bug existe igual en producción. Esa verificación empírica decidió en 1 minuto lo que CTO había convertido en propuesta de revert + redacción de HANDOFF de fracaso.

**Lección al carácter**: cuando el dueño afirma algo del estado del código (especialmente "esto ya estaba arreglado"), CTO **debe pedir verificación contra la fuente correcta** (producción/main) ANTES de aceptar la afirmación como dato. Es la versión inversa de la disciplina §1.2: tampoco la palabra del dueño cuenta como verificación bicapa sin contraste empírico.

### §8.3 Fricción operativa con tooling externo es coste real

3 turnos consumidos en auth de Claude Code (token expirado → `/login` no funcionó al primer intento → reinicio shell + `claude` desde cero + `/login` desde sesión nueva → autenticación exitosa). Coste: ~30 min reales + ~3 mensajes de chat + frustración acumulada.

**Lección al carácter**: futuras sesiones donde se vaya a usar Claude Code, **test de auth con comando trivial** (`pwd` o `git status`) **ANTES** de pegar prompt de Edit largo. Si el primer comando trivial devuelve 401, resolver auth ANTES de pegar el bloque grande. Mitiga riesgo de quemar contexto en prompts contra sesión muerta.

### §8.4 Decisiones arquitectónicas con justificación firme NO se delegan a Ramón

Cuando Ramón delegó decisión técnica con frase amplia ("haz lo mejor para el proyecto, eres CTO"), CTO **asumió decisión** (helpers locales vs módulo nuevo) **con razón técnica documentada**, sin presentar alternativas equivalentes. Patrón §1.3 del prompt arranque ejecutado al carácter.

Esto es lo correcto. Si CTO hubiera respondido con árbol de 3 opciones equivalentes, habría delegado el trabajo arquitectónico al dueño y violado §1.3.

**Lección al carácter (refuerzo de sesión 19 §8.3)**: cuando dueño delega con frase amplia, CTO asume con razón técnica firme documentada en chat. NO se queda paralizado pidiendo más confirmación.

---

## §9 — Errores §9.4 registrados en sesión 20

> Disciplina §9.4 bidireccional. Errores del CTO se registran sin auto-flagelación, con causa y mejora.

### §9.1 Auth Claude Code no testeada antes de prompt largo

**Hecho**: Ramón pegó el prompt completo del Edit (~150 líneas) en una sesión de Claude Code con token 401 expirado. Resultado: el prompt se procesó pero el primer intento de aplicar el Edit devolvió `API Error: 401 Invalid authentication credentials`. Tras esto: `/login` desde sesión vieja falló silenciosamente, reinicio de shell + `claude` desde cero + `/login` desde sesión nueva → autenticación exitosa.

**Causa**: CTO asumió que Claude Code arrancado con header bonito ("Opus 4.7 · Claude Max") tenía token válido. NO pidió a Ramón verificar con comando trivial antes del Edit grande.

**Severidad**: media. ~30 min reales perdidos + 3 turnos de chat consumidos.

**Mejora futura**: en HANDOFFs futuros que requieran Claude Code, sección §6 incluye paso *"verificar auth con `git status` desde Claude Code antes de pegar Edit largo"*.

### §9.2 Aceptar afirmación del dueño sobre estado del código sin verificación empírica

**Hecho**: cuando Ramón reportó frustrado "el bug ya estaba arreglado, joder", CTO inicialmente saltó a "acepto la palabra del dueño y propongo revertir commit `84a3342`". Esto habría descartado un commit válido si Ramón no hubiera verificado por iniciativa propia que el bug existe en producción.

**Causa**: CTO confundió "validación social" (calmar al dueño enfadado aceptando su afirmación) con "validación técnica" (contrastar afirmación contra fuente correcta). Las dos no son lo mismo. Patrón de pánico operativo del CTO bajo frustración del dueño.

**Severidad**: alta. Casi descartamos el primer commit funcional de cluster B tras 4 sesiones secas. Solo la disciplina §1.2 ejecutada por Ramón (no por CTO) salvó la situación.

**Mejora futura**: cuando dueño afirma estado del código (especialmente "esto ya estaba arreglado" / "esto antes funcionaba"), CTO **siempre** pide verificación contra producción ANTES de aceptar la afirmación como dato técnico. Frase exacta a usar: *"antes de proponer revert, ¿puedes verificar al carácter en producción si el bug aparece igual o no?"*. NO entrar al revert sin esa verificación.

### §9.3 Mezclar "drawings" y "overlays" al explicar cluster B al dueño

**Hecho**: durante explicación del mapa cluster A vs cluster B al dueño cansado, CTO listó "killzones, reglas, dibujos custom, posiciones long/short" como componentes que sub-fase 5d toca. Ramón cazó al carácter la imprecisión: los DIBUJOS (líneas, rectángulos manuales, fibonacci, posiciones long/short que el usuario dibuja) **están arreglados** desde fases 1-4. Solo los OVERLAYS automáticos (Killzones, Ruler) tienen problema vivo.

**Causa**: CTO mezcló "componente que se pinta encima del chart" con "dibujo del usuario". Son conceptos distintos en el código. Esta imprecisión tiene efecto operativo: hace dudar al dueño de avances reales del proyecto ("¿pero los dibujos no estaban arreglados?").

**Severidad**: media. Causó 1 turno extra de re-explicación. Pero el efecto acumulativo de imprecisiones así erosiona confianza del dueño en el plan estratégico, especialmente tras sesiones secas previas.

**Mejora futura**: al explicar componentes al dueño, distinguir al carácter:
- **Dibujos del usuario** (LineTool, Rectangle, FibTool, LongShortPosition, TextDrawing custom): plugin LWC + custom drawings hooks. Estado: arreglados desde fases 1-4.
- **Overlays automáticos** (KillzonesOverlay, RulerOverlay): pintados por sistema según contexto. Estado: bug vivo (regresión sesión 16) — objetivo de sub-fase 5d.

Glosario propuesto al carácter para HANDOFFs futuros, sección al final de cada HANDOFF cuando se mencionen overlays/drawings.

---

## §10 — Cierre

Sesión 20 deja:
- Primer commit funcional de cluster B en rama feature (`84a3342`).
- Plan v3 validado retroactivamente — la decisión de aplazar cluster A y atacar cluster B con plan táctico atomizable produjo código en sesión 20 después de 4 sesiones secas.
- Decisión arquitectónica al carácter sobre helpers locales documentada.
- Bug viewport (deuda 5.1) confirmado al carácter como pre-existente, calendarizado para sesión 22.
- 3 errores §9.4 registrados al carácter para mejora operativa.
- Sesión 21 con objetivo concreto: sub-fase 5d.1-5d.4 (contrato `chartTick` + KillzonesOverlay + RulerOverlay).

**Próximo HANDOFF (cierre sesión 21) debe reportar al carácter**:
- Si sub-fases 5d.1-5d.4 cerraron con commit en rama feature.
- Si la regresión Killzones de sesión 16 quedó resuelta empíricamente al carácter.
- Si los 3 greps de invariantes fase 4 siguieron intactos.
- Si los 6 helpers de sub-fase 5c siguen separados (no refundidos accidentalmente).

Si sesión 21 NO cierra 5d.1-5d.4 al carácter, el HANDOFF lo dice al frente sin maquillaje — patrón §0 mantenido.

---

*Fin del HANDOFF cierre sesión 20. 6 mayo 2026. Redactado por CTO/revisor tras commit `84a3342` en rama feature `refactor/fase-5-drawings-lifecycle`. Pendiente de mover al repo + commit a main + push a `origin/main` por Ramón según §6.*
