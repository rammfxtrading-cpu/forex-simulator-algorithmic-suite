# HANDOFF — cierre sesión 21

> Sesión 21 cerrada el 6 mayo 2026.
> Sesión 21 = sub-fases 5d.1 + 5d.2 + 5d.3 según plan v3 (cluster B contrato `chartTick`).
> **Segundo, tercero y cuarto commits funcionales de cluster B en rama feature**.
> Próxima sesión = sesión 22, arranque sub-fases 5d.5-5d.8 según plan v3 (CustomDrawingsOverlay + PositionOverlay + deuda 5.1 viewport + atajo Opt+R).

---

## §0 — Estado al cierre sesión 21, sin maquillaje

**Sesión 21 ha producido 3 commits funcionales de cluster B en rama feature**, encadenados sobre el commit funcional de sesión 20 (`84a3342`, sub-fase 5c). Hashes al carácter:

```
d7ee4a8 refactor(fase-5/5d.3): conectar RulerOverlay al contrato chartTick (reset on TF change estilo TradingView)
4f943a4 refactor(fase-5/5d.2): conectar KillzonesOverlay al contrato chartTick formal
aa1498a refactor(fase-5/5d.1): documentar contrato chartTick formal en _SessionInner.js
```

Cadena viva en `refactor/fase-5-drawings-lifecycle`: `d7ee4a8` → `4f943a4` → `aa1498a` → `84a3342` (5c) → `1897eba` (plan v3) → `f2c7476` (plan v2) → `195d02b` (plan v1).

**No mergeado a `origin/main`** — patrón sesiones 17-20 mantenido al carácter, feature se mergea a main solo al cierre completo del cluster B (sesión 25 según calendario plan v3 §8).

Eso significa al carácter:
- **Producción Vercel intacta desde 2 mayo 2026** (commit `89e36ee`, fase 4d cerrada). Runtime efectivo en `simulator.algorithmicsuite.com` no ha cambiado.
- **Avance funcional al runtime**: 0 líneas mergeadas a main desde 2 may 2026 (6 días). Sub-fases 5c + 5d.1 + 5d.2 + 5d.3 viven en feature, pendiente de merge en sesión 25.
- **Avance funcional al repo (rama feature)**: **3 commits de código de cluster B en una sola sesión**, más que sesiones 16-20 sumadas (las cuales produjeron 1 commit en total — el 5c de sesión 20).

**Plan v3 valida su valor retroactivamente al carácter por segunda sesión consecutiva**. La decisión arquitectónica de sesión 19 (aplazar cluster A, atacar cluster B con plan táctico atomizable) sigue siendo correcta. La decisión §4.7 de sesión 21 (productor en `_SessionInner.js`, firma `useState(0)` con bump entero, prop drilling, suscripciones LWC mantenidas) cayó dentro del estimado §D del CTO (~40-60 líneas) — el diff real total fue **+38 / -4 líneas tocadas**, muy por debajo del estimado plan v3 §5 (150-250) y dentro del margen §D del CTO al carácter.

**Realidad sin maquillaje al carácter**:

1. **Regresión Killzones sesión 16 resuelta empíricamente**. El test bloqueante §5.1 del prompt (cambio TF en cadena con replay en zona pasada) pasó al carácter en sub-fase 5d.2.
2. **Regla TV-style en runtime al carácter**. Sub-fase 5d.3 v1 (reproyección de coords) se aplicó y se descartó por decisión del dueño antes del commit. Sub-fase 5d.3 v2 (reset on chartTick + onDeactivate) cierra al carácter con UX deseado.
3. **Smoke combinado 5d.4 OK al carácter**. Killzones + regla + drawings cluster A coexistiendo en cambio TF múltiple, sin warnings nuevos respecto al estado pre-Edit.
4. **Causa raíz parcial deuda 5.1 viewport identificada al carácter por Ramón** durante el smoke 5d.2. Hallazgo incorporado al §4.5 abajo como input directo para sesión 22 — sub-fase 5d.5 arranca con causa raíz ya documentada.
5. **3 errores §9.4 detectados en vivo durante sesión 21**. Detalle en §7.

---

## §1 — Qué se hizo en sesión 21 al carácter

### §1.1 PASO 0 ejecutado al carácter (cerrado al carácter)

Lectura completa del prompt arranque sesión 21 + búsquedas en project_knowledge sobre HANDOFF cierre sesión 20 (§0, §4, §5.2, §7, §9), HANDOFFs 17 + 19 (referencias), CLAUDE.md §3 reglas absolutas. Plan v3 leído vía referencias en HANDOFFs 19 y 20 (no se accedió al archivo en feature directamente — la referencia indirecta cubrió las 4 secciones requeridas: §1, §2.6, §5, §7, §10).

Verificación al carácter desde shell zsh nativa de Ramón:

- **Estado repo main**: `origin/main` = `f71a516` (HANDOFF 20 pusheado al cierre de sesión 20). Working tree limpio. Cadena confirmada al carácter desde `f71a516` hasta `4c03ee6` (HANDOFF 18).
- **Cambio a rama feature**: ejecutado al carácter, HEAD = `84a3342` (sub-fase 5c). Working tree limpio.
- **Tamaños actuales** (4 archivos heredados intactos + 3 overlays inventariados al carácter por primera vez):
  - `_SessionInner.js` = 3007.
  - `useDrawingTools.js` = 243.
  - `useCustomDrawings.js` = 62.
  - `chartViewport.js` = 202.
  - `KillzonesOverlay.js` = **455** (nuevo al carácter sesión 21).
  - `RulerOverlay.js` = **246** (nuevo al carácter sesión 21).
  - `CustomDrawingsOverlay.js` = **192** (nuevo al carácter sesión 21).
- **Mapeo `chartTick`**: 2 productores confirmados al carácter (L891 sitio A + L1221 sitio B post-5c, antes en L1189 — renumeración +32 líneas). KillzonesOverlay recibe la prop pero no la destructura. RulerOverlay y CustomDrawingsOverlay no la reciben.
- **Hallazgo nuevo al carácter durante PASO 0**: KillzonesOverlay además de `chartTick` recibe `tick` (canal distinto, propósito general, 11 productores en `_SessionInner.js`). Coexistencia de dos canales de reactividad en el mismo consumer — input para decisión §4.7.
- **Inventario expandido al carácter**: lectura completa de los 3 overlays (`cat` de los 455+246+192 = 893 líneas). Refutó al carácter una asunción de HANDOFF 17 §2.3: RulerOverlay **no tiene suscripción LWC**, solo handlers de mouse. Cuando la regla está en estado `fixed`, no se redibuja al cambiar viewport. CustomDrawingsOverlay sí tiene `subscribeVisibleLogicalRangeChange` (L161 del overlay).
- **3 invariantes fase 4 verificadas al carácter**: vacío / vacío / 3 matches L116/L1121/L1200 (este último renumerado vs sesiones 16-19 por +45 líneas de 5c). ✓.

### §1.2 Decisión arquitectónica §4.7 al carácter

Tras PASO 0 + inventario expandido, decisión §4.7 al carácter del contrato `chartTick` formal — recomendación CTO firme con razón técnica al frente, alternativas como nota (patrón §1.3 del prompt):

- **Productor**: state `chartTick` se queda en `_SessionInner.js` L237. NO se mueve a `lib/chartTick.js`. Razón: alto acoplamiento al componente, mover requiere Context o singleton externo, no aporta nada. Patrón consistente con decisión §2.1 sesión 20 (helpers locales > módulo nuevo cuando acoplamiento es alto).
- **Firma del evento**: `useState(0)` con bump entero `setChartTick(t => t+1)`. NO objeto con `{tick, reason}`. Razón: ningún consumer necesita distinguir causa, solo invalidar cache. Patrón uniforme con `tick` y `tfKey`.
- **Mecanismo de suscripción**: prop drilling. NO Context React. Razón: 2 productores y 3 consumers no justifican Context. Patrón consistente con cómo `tick`, `tfKey`, `dataReady`, `currentTf`, `currentTime` ya se propagan.
- **Suscripciones LWC paralelas**: MANTENER + AÑADIR `chartTick` como dep adicional. NO eliminar las existentes. Razón: cubren canales ortogonales — LWC reacciona a viewport (zoom/pan), `chartTick` reacciona a dataset (setData). Eliminar uno deja huecos.

Decisión validada por Ramón con la frase "haz lo correcto y más profesional para el proyecto". Razón técnica documentada en chat antes del primer Edit.

### §1.3 Causa raíz al carácter de la regresión Killzones sesión 16

Establecida al carácter en chat antes del primer Edit, derivada del inventario expandido §1.1:

> El handler de cambio TF post-5c bumpea `setTfKey` (R5) y `setChartTick` (R6) pero NO bumpea `setTick`. KillzonesOverlay deriva su cache de `[..., tick, ctBucket]`. Tras cambio TF: ningún dep cambia → cache stale. El dataset subyacente (`getSeriesData()`) sí cambió porque `applyForcedSetData` hizo setData. La suscripción LWC sí dispara `draw()`, pero `draw()` redibuja del cache stale → coordenadas calculadas con timestamps de TF anterior → rectángulos descolocados.

Esto encaja al carácter con el síntoma sesión 16. El "fix" de sesión 16 esperaba que el contrato existiera. No existía. Sesión 21 lo construye al carácter.

### §1.4 Sub-fase 5d.1 — JSDoc del contrato

**Commit**: `aa1498a` (`refactor(fase-5/5d.1): documentar contrato chartTick formal en _SessionInner.js`).

**Cambio**: bloque JSDoc multilinea de 24 líneas insertado encima de la declaración `const [chartTick, setChartTick] = useState(0)` (L237 pre-Edit, L261 post-Edit). Documenta al carácter:
- Definición del contrato (señal monotónica de invalidación de cache derivado del dataset).
- 2 productores con líneas aproximadas (~L891 sitio A, ~L1221 sitio B).
- 4 consumidores objetivo (Killzones, Ruler, CustomDrawings, Position).
- Distinción explícita con `tick` (L207) — canal distinto, propósito general.
- Marca temporal: contrato introducido en sub-fase 5d.1.

**Diff**: +24 / -0 en `_SessionInner.js`. `wc -l`: 3007 → 3031.

**Cero cambio funcional**. Solo doc.

**Verificación bicapa**: ejecutada al carácter desde shell zsh de Ramón pre-commit. `git status`, `git diff --stat`, `wc -l`, `grep chartTick`, `sed 230-265` (lectura íntegra del JSDoc en disco), 3 invariantes fase 4 (intactas, `computePhantomsNeeded` renumerado a L116 / L1145 / L1224 por +24 desplazamiento).

**Smoke local**: NO ejecutado. Razón al carácter: 5d.1 es JSDoc puro dentro de un comentario `/** */`, imposible romper parser. Recomendación CTO de comitear sin smoke fue aceptada por Ramón. Smoke se exige a partir de 5d.2 (cambio funcional real).

### §1.5 Sub-fase 5d.2 — KillzonesOverlay consume el contrato

**Commit**: `4f943a4` (`refactor(fase-5/5d.2): conectar KillzonesOverlay al contrato chartTick formal`).

**Cambios al carácter en `components/KillzonesOverlay.js`**:
1. Firma del componente L117: añadir `chartTick` entre `tick` y `currentTime`.
2. Dep array del useEffect del cache de sesiones L192: añadir `chartTick` entre `tick` y `ctBucket`.

**Cero cambios** en `_SessionInner.js` — la prop ya viajaba desde L1934 (post-5d.1, antes L1910), heredado de fases anteriores cuando se intentó pasar `chartTick` sin destructurarlo.

**Diff**: +2 / -2 en `KillzonesOverlay.js`. `wc -l`: 455 (sin cambio neto, líneas reescritas no añadidas).

**Verificación bicapa**: ejecutada al carácter pre-commit. `git diff KillzonesOverlay.js` muestra 2 hunks quirúrgicos exactos. Cero ruido. 3 invariantes fase 4 intactas (L116 / L1145 / L1224, sin cambio respecto a 5d.1).

**Smoke local §5.1 al carácter**: ejecutado por Ramón en navegador tras `npm run dev`. Flujo: EUR/USD, play, avanzar replay 100+ velas, pausar, cambios TF en cadena (M5 → M15 → H1 → H4 → D1 → H1 → M5 → M15). **Killzones bien colocadas en cada cambio TF**. Reportado al carácter por Ramón como "está bien".

**Resultado arquitectónico al carácter**: regresión Killzones sesión 16 resuelta empíricamente. El test bloqueante de sesión 21 pasa al carácter.

### §1.6 Sub-fase 5d.3 — RulerOverlay reset on chartTick (versión B)

**Commit**: `d7ee4a8` (`refactor(fase-5/5d.3): conectar RulerOverlay al contrato chartTick (reset on TF change estilo TradingView)`).

**Iteración del diseño al carácter**:

- **Versión A (descartada)**: reproyectar coords de la regla desde `start.data.time/price` y `end.data.time/price` usando `timeToCoordinate` y `priceToCoordinate`. La regla se mantenía visible al cambiar TF, anclada lógicamente. Aplicada por Claude Code, NO comiteada. Smoke en chat reveló al carácter que el comportamiento era contrario a la intención del dueño — Ramón quería UX TradingView (regla efímera, cualquier cambio del chart la cancela). Edit revertido en shell de Ramón con `git checkout --`.
- **Versión B (aplicada y comiteada)**: al recibir `chartTick` con regla en estado `fixed`, llamar `reset()` + `onDeactivate()`. Vuelve a cursor, regla limpia, herramienta desactivada. Replicación al carácter del comportamiento TradingView confirmado por Ramón ("solo se mantiene si no tocas nada").

**Cambios versión B al carácter**:
1. `_SessionInner.js` L1935: añadir prop `chartTick={chartTick}` al render `<RulerOverlay ... />`.
2. `RulerOverlay.js` L16 firma: añadir `chartTick` al final de la firma destructurada.
3. `RulerOverlay.js` L190-L198: nuevo `useEffect` con cabecera de comentario + cuerpo compacto (`if (stateRef.current.phase !== 'fixed') return; reset(); if (onDeactivate) onDeactivate()`) + dep array `[chartTick, reset, onDeactivate]`.

**Diff**: +12 / -1 en `RulerOverlay.js`, +1 / -1 en `_SessionInner.js`. `wc -l RulerOverlay.js`: 246 → 256.

**Verificación bicapa**: ejecutada al carácter pre-commit. Greps de control crítico al carácter: `grep timeToCoordinate RulerOverlay.js` = vacío (confirma al carácter que no quedó residuo del intento A descartado). `grep chartTick`: 4 matches (firma + 2 menciones en el comentario + dep array). 3 invariantes fase 4 intactas.

**Smoke local §5.2 al carácter**: ejecutado por Ramón en navegador tras Cmd+R. Flujo: activar regla, click+drag entre 2 puntos, regla fijada, cambio TF. Resultado al carácter: regla desaparece + cursor vuelve a normal en cada cambio TF. Reportado por Ramón como "está bien... como me gusta".

### §1.7 Sub-fase 5d.4 — verificación final + smoke combinado

**Sin commit nuevo**. 5d.4 es la verificación cruzada de que 5d.1 + 5d.2 + 5d.3 coexisten al carácter sin regresión.

**3 greps post-cierre 5d.3** ejecutados al carácter en shell zsh de Ramón:
1. **Invariantes fase 4**: vacío / vacío / 3 matches L116, L1145, L1224. ✓.
2. **6 helpers post-5c**: 6 declaraciones (L1198 `resolveCtx`, L1208 `deselectActiveDrawings`, L1215 `computeTfPhantomsCount`, L1233 `applyForcedSetData`, L1240 `bumpTfKey`, L1244 `scrollToTailAndNotify`) + 6 referencias en orquestador (L1249-L1258). Sub-fase 5c intacta al carácter. ✓.
3. **Contrato `chartTick` formal**: 12 matches cubren productor declaración (L261), JSDoc cabecera (L238), comentarios cabecera 5c (L1189, L1243), props pasadas en JSX (L1934 Killzones, L1935 Ruler), consumers KillzonesOverlay (L117 firma, L192 dep array), consumers RulerOverlay (L16 firma, L190 cabecera, L192 línea comentario, L198 dep array). Contrato completo al carácter. ✓.

**Smoke combinado al carácter**: ejecutado por Ramón. Flujo: EUR/USD, play, avanzar, pausar, Killzones visibles, activar regla, medir, fijar, cambio TF múltiple en cadena, drawings cluster A dibujados (línea + rectángulo), cambio TF adicional. Resultado al carácter: Killzones reposicionadas en cada cambio + regla reseteada en cada cambio + drawings cluster A intactos en cada cambio + cero warnings nuevos en consola. Reportado por Ramón como "todo bien".

---

## §2 — Decisiones arquitectónicas tomadas en sesión 21

### §2.1 Productor del contrato `chartTick`: local en `_SessionInner.js`

Decisión cerrada en §1.2. Justificación al carácter:
- State `chartTick` vive en `useState` a nivel del componente.
- Mover a `lib/chartTick.js` requiere Context React o singleton externo.
- 2 productores y 3 consumers no justifican refactor a módulo externo.
- Patrón consistente con §2.1 sesión 20 (helpers locales > módulo nuevo cuando acoplamiento es alto).

**Si en sub-fase 5e o 5f aparece otro consumer fuera del componente**, refactorizar a módulo entonces. NO ahora.

### §2.2 Firma del evento: bump entero

Decisión cerrada en §1.2. `useState(0)` con `setChartTick(t => t+1)`. NO objeto con metadata.

**Si en sub-fase 5d.x aparece consumer que necesite distinguir "cambio TF" de "cambio range"**, ahí refactorizamos a `{tick, reason}`. Hoy ningún consumer lo necesita al carácter.

### §2.3 Suscripciones LWC paralelas: coexistencia

Decisión cerrada en §1.2. Las suscripciones existentes (`subscribeVisibleLogicalRangeChange`, `subscribeSizeChange`, `ResizeObserver`, drag-aware loop en KillzonesOverlay) **NO se eliminan**. `chartTick` se añade como dep adicional al useEffect que mantiene cache derivado del dataset.

Razón al carácter: las suscripciones LWC reaccionan a cambios de viewport (zoom/pan/drag/resize). `chartTick` reacciona a cambios de dataset (setData en cambio TF). Son canales ortogonales. Eliminar uno dejaría huecos.

### §2.4 RulerOverlay: política reset en lugar de reproyectar

**Decisión iterada al carácter durante la sesión**. Diseño inicial CTO (versión A): reproyectar coords de la regla desde anclaje `{time, price}` al recibir `chartTick`. Aplicada por Claude Code, NO comiteada, descartada por Ramón antes del commit con criterio UX TradingView.

**Decisión final al carácter (versión B)**: regla TV-style. Cualquier cambio del chart (TF) cancela la medición y vuelve a cursor.

**Generalización al carácter del contrato `chartTick`**: el contrato dice "señal de invalidación de cache derivado del dataset". Para overlays con cache derivado del dataset (KillzonesOverlay), invalidar = recalcular. Para overlays con estado **transitorio** del dataset (RulerOverlay), invalidar = resetear. Mismo contrato, distinta política según el consumer. Esto se documenta al carácter en este HANDOFF como referencia para sesión 22 cuando se conecte CustomDrawingsOverlay y PositionOverlay — cada uno decide su política según su naturaleza.

### §2.5 NO unificar `tick` y `chartTick`

Tentación arquitectónica detectada al carácter durante PASO 0. Inventario reveló al carácter que `tick` (L207) tiene 11 productores repartidos por `_SessionInner.js` (trades, balance, order modal, etc.) — canal de propósito general. `chartTick` tiene 2 productores específicos (visibleRange + post-cambio TF) — canal específico de invalidación de cache de dataset.

**Decisión CTO al carácter**: mantenerlos separados. Razón:
- Unificar haría que cada trade bumpeara `chartTick`, invalidando caches de overlays innecesariamente.
- Separar canales por intención semántica es buen diseño, no deuda.
- 11 productores `tick` no se tocan en sesión 21 — fuera de scope §6 punto 1 del prompt (no atacar cluster A — aunque `tick` no es cluster A estricto, su intersección con polling 300ms y otros patrones lo aproxima).

`tick` queda como **candidato de inspección sub-fase 5f** (sesión 24) si se confirma al carácter que su uso por KillzonesOverlay genera redibujados innecesarios. NO se ataca antes.

---

## §3 — Estado del repo al cierre sesión 21

### §3.1 Cadena de commits al carácter

**Rama main** (`origin/main` = `HEAD`, sin cambios desde HANDOFF 20 hasta el push de §6 abajo):
```
f71a516 docs(sesion-20): cerrar sesion 20 con sub-fase 5c en rama feature primer commit funcional cluster B
d76ed4b docs(sesion-19): cerrar sesion 19 con plan v3 en rama feature y cluster A documentado al caracter
4c03ee6 docs(sesion-18): cerrar sesion 18 con sub-fase 5b camino A descartado al caracter y plan v2 refutado
```

**Rama feature** `refactor/fase-5-drawings-lifecycle` (NO pusheada, patrón histórico):
```
d7ee4a8 refactor(fase-5/5d.3): conectar RulerOverlay al contrato chartTick (reset on TF change estilo TradingView)    ← NUEVO sesión 21
4f943a4 refactor(fase-5/5d.2): conectar KillzonesOverlay al contrato chartTick formal                                  ← NUEVO sesión 21
aa1498a refactor(fase-5/5d.1): documentar contrato chartTick formal en _SessionInner.js                                ← NUEVO sesión 21
84a3342 refactor(fase-5/5c): descomponer handler cambio TF en 6 helpers locales con orden explicito                    ← sesión 20
1897eba docs(fase-5): plan v3 con cluster A aplazado a fase 5.A y cluster B vivo sesion 19
f2c7476 docs(fase-5): plan v2 con inventario al caracter sesion 17
195d02b docs(fase-5): plan v1 de fase 5 drawings lifecycle (sesion 17)
```

### §3.2 Estado al carácter

- **Working tree feature**: limpio tras commit `d7ee4a8`.
- **Rama feature SIN upstream**: deliberado, patrón sesiones 17-20.
- **Plan v3 vigente**: `refactor/fase-5-plan.md` en rama feature.
- **Producción Vercel**: deploy actual `d76ed4b`. Runtime intacto desde 2 may 2026.

### §3.3 Tamaños actuales al carácter

| Archivo | Pre-21 | Post-21 | Delta |
|---|---|---|---|
| `lib/chartViewport.js` | 202 | 202 | 0 |
| `components/_SessionInner.js` | 3007 | **3032** | **+25** |
| `components/useDrawingTools.js` | 243 | 243 | 0 |
| `components/useCustomDrawings.js` | 62 | 62 | 0 |
| `components/KillzonesOverlay.js` | 455 | 455 | 0 (líneas reescritas) |
| `components/RulerOverlay.js` | 246 | **256** | **+10** |
| `components/CustomDrawingsOverlay.js` | 192 | 192 | 0 (intacto, sesión 22) |

Total +35 líneas tocadas en código. Delta neto frente a estimación CTO §D del chat (~40-60): -7%, dentro del margen de calibración.

Diff total al carácter de los 3 commits 5d.x:
- 5d.1: +24 / -0 (`_SessionInner.js` JSDoc).
- 5d.2: +2 / -2 (`KillzonesOverlay.js` firma + dep array).
- 5d.3: +12 / -1 (`RulerOverlay.js` firma + nuevo useEffect) + 1 / -1 (`_SessionInner.js` prop).

**Total**: +39 / -4. Estimación plan v3 §5 sub-fases 5d.1-5d.4 (~150-250 líneas) **muy por encima del real** (~43 líneas tocadas si sumamos +39 / -4). Esto NO es señal de error de plan v3 — el plan v3 estimaba *4* sub-fases; sesión 21 cerró las 3 primeras de manera más quirúrgica de lo previsto. Si la inferencia se mantiene, sesión 22 (sub-fases 5d.5-5d.8 + deuda 5.1) puede tener un diff similar al de sesión 21 si la deuda 5.1 viewport tiene la causa raíz simple que parece tener (§4.5 abajo).

---

## §4 — Para sesión 22 (sub-fases 5d.5-5d.8 + deuda 5.1)

### §4.1 Objetivo al carácter

Sub-fase 5d.5-5d.8 según plan v3 §5 + §8:
- **5d.5**: conectar `CustomDrawingsOverlay` al contrato `chartTick`.
- **5d.6**: conectar `PositionOverlay` (helper local en `_SessionInner.js` L2796) al contrato `chartTick`.
- **5d.7**: cerrar deuda 5.1 viewport (causa raíz pre-identificada en sesión 21, §4.5 abajo).
- **5d.8**: smoke + commit.

Atajo Opt+R queda mencionado en plan v3 §1.2 como deuda UX menor — sesión 22 evalúa si cabe en scope o se aplaza a sub-fase 5f.

### §4.2 Pre-arranque obligatorio en sesión 22

Antes del primer Edit, sesión 22 verifica al carácter desde shell zsh nativa:

1. `git status` en main → working tree limpio, HEAD = HANDOFF 21 pusheado.
2. `git checkout refactor/fase-5-drawings-lifecycle` → HEAD `d7ee4a8`.
3. `wc -l components/_SessionInner.js` debe ser **3032**.
4. `wc -l components/CustomDrawingsOverlay.js` debe ser **192** (intacto desde sesión 21).
5. **3 greps invariantes fase 4** repetidos al carácter:
   - `grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"` → vacío.
   - `grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"` → vacío.
   - `grep -n "computePhantomsNeeded" components/_SessionInner.js` → 3 matches L116, L1145, **L1224**.
6. **6 helpers post-5c siguen vivos**: `grep -n "resolveCtx\|deselectActiveDrawings\|computeTfPhantomsCount\|applyForcedSetData\|bumpTfKey\|scrollToTailAndNotify" components/_SessionInner.js` → 6 declaraciones + 6 referencias + N comentarios.
7. **Contrato `chartTick` formal** en su sitio: `grep -n "chartTick" components/_SessionInner.js` debe mostrar JSDoc L238 + declaración L261 + 2 productores (sitio A L891, sitio B implícito L1245 en `scrollToTailAndNotify`) + 2 props JSX L1934/L1935 + 2 comentarios cabecera 5c.

### §4.3 Cluster A INTOCABLE en sesión 22

Mismo principio que sesiones 20 y 21. Las líneas del cluster A (`_SessionInner.js` L297-L365 persistencia, L370-L415 afterEditHandler/polling, L450-L456 visibilidad TF — renumeración +25 líneas vs sesión 20, ajustar al carácter en sesión 22) **NO se modifican** aunque el Edit pase cerca por scrolling.

### §4.4 Aplicación del contrato `chartTick` a CustomDrawingsOverlay y PositionOverlay

**CustomDrawingsOverlay** (sub-fase 5d.5): inventario al carácter de sesión 21 reveló que **ya tiene** suscripción LWC `subscribeVisibleLogicalRangeChange` (L161 del overlay) + dep `tfKey` en useEffect de redraw (L181 del overlay). Política recomendada al carácter: añadir `chartTick` como prop + dep adicional al useEffect de redraw. Cambio mínimo. Estimación al carácter: ~3-5 líneas.

**PositionOverlay** (sub-fase 5d.6): vive en `_SessionInner.js` como helper local (HANDOFF 17 §2.3 lo localizaba en L2796 — verificar al carácter en sesión 22, posible renumeración tras +25 líneas de sesión 21). Inventario al carácter pendiente. Política recomendada al carácter: depende de cómo está construido — si tiene cache derivado del dataset, añadir `chartTick` como dep. Si es estado transitorio como la regla, evaluar política reset.

### §4.5 Deuda 5.1 viewport — causa raíz parcial pre-identificada al carácter por Ramón en sesión 21

Durante el smoke de 5d.2 (cambio TF en zona pasada), Ramón identificó al carácter:

> El viewport tras cambio TF se ancla al endpoint del último drawing, no al final del array de velas reales. Si el endpoint del drawing está a la derecha de la última vela en el TF actual (caso típico: drawing dibujado en H1 que se extiende más allá del rango visible al bajar a M5), el `scrollToTail` post-cambio TF respeta ese margen del drawing, no el de las velas. Resultado visual: el chart "se va hacia atrás" al bajar TF.

**Hipótesis técnica al carácter** (NO verificada — sesión 22 lo verifica al carácter): probablemente `computePhantomsNeeded` (L116 de `_SessionInner.js`) extiende el array de velas con phantoms hasta cubrir los timestamps de los drawings, y `scrollToTailAndNotify` (helper R6 post-5c, L1244-L1247) llama `scrollToTail(cr, 8, ...)` que se ancla al final del array extendido, no al último timestamp real.

**Fix candidato al carácter para sesión 22** (NO comprometido — depende de verificación al carácter):
- Opción 1: `scrollToTail` recibe `lastRealIndex` (el índice de la última vela real, sin phantoms) y se ancla a ese índice + offset 8.
- Opción 2: `applyForcedSetData` setea `cr._lastRealIndex` antes del setData, y `scrollToTailAndNotify` lo lee.
- Opción 3: separación quirúrgica entre "phantoms para drawings" y "phantoms para viewport" — solo las del viewport bumpean el ancla.

Sesión 22 verifica al carácter cuál se ajusta. NO se commitea fix sin verificar al carácter en bytes que la hipótesis es correcta.

### §4.6 Tamaño estimado y riesgo sesión 22

Plan v3 §5 estima sub-fases 5d.5-5d.8 como ~100-200 líneas tocadas. Riesgo medio al carácter — la deuda 5.1 toca `scrollToTail` y/o `applyForcedSetData`, código sensible del helper R6 post-5c. Mitigación: smoke local exhaustivo en zona pasada con drawings + sin drawings, cambios TF en cadena, y validación empírica producción vs local del bug viewport (replicar la prueba de sesión 20 §1.6).

### §4.7 Smoke local obligatorio antes del commit

Mismo patrón que sesiones 20 y 21 §5:

1. **Cambio TF en zona pasada** + Killzones intactas (test crítico de regresión sesión 16 — debe seguir pasando, ya validado en sesión 21 pero verificar al carácter de nuevo en sesión 22).
2. **Cambio TF con drawings dibujados a la derecha del último real** + viewport NO se va hacia atrás (test bloqueante de deuda 5.1).
3. **3 greps invariantes fase 4** post-Edit.
4. **6 helpers post-5c** intactos.
5. **Consola sin warnings nuevos**.

Si los 3 greps fallan o smoke deuda 5.1 rompe, NO comitear. Revisar Edit antes.

---

## §5 — Material verificado al carácter en sesión 21 (preservado para sesiones futuras)

### §5.1 Inventario completo de los 3 overlays cluster B objetivo

Lectura íntegra al carácter de:
- `KillzonesOverlay.js` (455 líneas): canvas-based, cache de sesiones derivado del dataset, suscripción LWC `subscribeVisibleLogicalRangeChange` + `subscribeSizeChange` + `ResizeObserver` + drag-aware redraw via mousedown/mouseup loop. Recibe props `chartMap`, `activePair`, `dataReady`, `currentTf`, `tick`, `currentTime` (pre-21) + `chartTick` (post-21). Cache se rellena en useEffect dep `[cfg, tfAllowed, dataReady, activePair, tick, ctBucket]` (pre-21) → `[cfg, tfAllowed, dataReady, activePair, tick, chartTick, ctBucket]` (post-21).
- `RulerOverlay.js` (246 líneas pre-21 → 256 post-21): canvas-based, estado interno `phase: idle | measuring | fixed`, sin suscripción LWC, solo handlers de mouse. **Refutó al carácter la asunción HANDOFF 17 §2.3** ("suscripción interna LWC presumible"). En estado `fixed`, pre-21 no se redibujaba al cambiar viewport ni TF — coordenadas píxel quedaban stale. Post-21: al recibir `chartTick`, si `phase === 'fixed'`, llama `reset()` + `onDeactivate()`.
- `CustomDrawingsOverlay.js` (192 líneas, intacto): canvas-based, render por `drawings` prop + `tfKey` + suscripción LWC `subscribeVisibleLogicalRangeChange` (L161 del overlay). Pendiente sub-fase 5d.5.

### §5.2 Mapa al carácter de productores y consumers `chartTick` post-21

**Productores** (en `_SessionInner.js`):
- L891 sitio A: dentro de `subscribeVisibleLogicalRangeChange`, dispara en cambios de visible logical range (zoom/pan/scroll usuario).
- L1245 (post-21, antes L1221 post-5c, antes L1189 pre-5c): dentro del helper R6 `scrollToTailAndNotify`, dispara post-cambio TF que reemplaza dataset vía `applyForcedSetData`.

**Consumers**:
- KillzonesOverlay (L117 firma, L192 dep array). Política: invalidar cache + recalcular.
- RulerOverlay (L16 firma, L198 dep array). Política: reset + onDeactivate.
- CustomDrawingsOverlay: pendiente sub-fase 5d.5.
- PositionOverlay: pendiente sub-fase 5d.6.

**Distinción al carácter con `tick` (L207)**: canal distinto. `tick` tiene 11 productores en `_SessionInner.js` (L833, L1048, L1253, L1298, L1318, L1415, L1430, L1456, L1472, L1556, L2493, L2521 — renumeración +25 vs sesión 20 — pendiente verificación al carácter en sesión 22 por mover líneas hacia abajo). Es señal de propósito general bumpeada por trades, balance, modal de orden. NO refleja cambios de dataset. Documentado en JSDoc L238 del contrato `chartTick`.

### §5.3 Hallazgo arquitectónico Ramón sobre deuda 5.1 viewport

Documentado al carácter en §4.5 arriba. Input directo para sesión 22. Reduce el trabajo de PASO 0 sesión 22 — la causa raíz parcial está pre-identificada y la sesión arranca verificando hipótesis técnica en lugar de descubriendo causa de cero.

---

## §6 — Procedimiento de cierre sesión 21

### §6.1 Mover HANDOFF al repo

Tras descargar este HANDOFF a `~/Downloads/HANDOFF-cierre-sesion-21.md`:

```
git checkout main
```

```
mv ~/Downloads/HANDOFF-cierre-sesion-21.md refactor/
```

```
ls -la refactor/HANDOFF-cierre-sesion-21*
```

```
wc -l refactor/HANDOFF-cierre-sesion-21*
```

### §6.2 git add + commit

```
git add refactor/HANDOFF-cierre-sesion-21.md
```

```
git status
```

```
git commit -m "docs(sesion-21): cerrar sesion 21 con sub-fases 5d.1+5d.2+5d.3 en feature y regresion killzones resuelta al caracter"
```

```
git log --oneline -3
```

### §6.3 Push a main

**Recomendación CTO**: SÍ push. Patrón histórico sesiones 14-20 mantenido al carácter. Runtime intacto, idempotente.

```
git push origin main
```

### §6.4 Sesión 21 cerrada al carácter

Tras §6.1-§6.3:
- HEAD nuevo en main con HANDOFF sesión 21 sobre `f71a516`.
- Rama feature `refactor/fase-5-drawings-lifecycle` intacta en `d7ee4a8` (sin push).
- Working tree limpio.
- Producción Vercel: re-deploya idempotente, runtime sigue intacto desde sesión 15 / fase 4d.

---

## §7 — Errores §9.4 detectados en vivo durante sesión 21

Disciplina §9.4 estricta: distinguir lo verificado al carácter de lo inferido. Capturados explícitamente como lecciones de calibración para sesiones futuras.

### §7.1 Subestimación inicial CTO sobre tamaño de 5d.3

**Hecho**: en mensaje de decisión §C del chat, CTO estimó al carácter ~10-15 líneas para 5d.3 versión A (reproyección). Edit aplicado por Claude Code reportó +27 / -1 (versión A descartada). Versión B aplicada reportó +12 / -1.

**Severidad**: leve. La estimación final (versión B aplicada) cayó dentro del rango. El error de sesión 21 NO fue de tamaño, fue de diseño (versión A vs B — ver §7.2).

**Mejora futura**: cuando el diseño del Edit incluye un comentario de cabecera multi-línea, sumar +5 líneas al estimado. Aplicado retroactivamente al carácter al diseñar versión B.

### §7.2 Diseño inicial CTO de 5d.3 (versión A) descartado por Ramón

**Hecho**: CTO recomendó al carácter "camino A" en §C — reproyectar coords desde anclaje `{time, price}` para que la regla se mantenga visible al cambiar TF. Razón técnica documentada al carácter ("la regla guarda time y price reales — son ancla lógica, no píxeles"). Edit aplicado por Claude Code, NO comiteado. Smoke en chat con Ramón cazó al carácter el desajuste con UX deseado: Ramón quería comportamiento TradingView (regla efímera, cualquier cambio del chart la cancela). Edit revertido en shell con `git checkout --`.

**Causa**: CTO derivó el diseño desde análisis técnico (la regla TIENE anclaje lógico, ergo se PUEDE reproyectar) sin verificar al carácter intención UX del dueño. La pregunta "¿qué hace TradingView en este flujo?" no se hizo antes del prompt de Claude Code — solo después, durante la verificación pre-commit.

**Severidad**: media. Cero código mergeado erróneamente (la disciplina §1.2 + smoke pre-commit cazaron al carácter). 1 ciclo de Edit + revert + Edit consumido (~30 min).

**Mejora futura al carácter**: cuando una decisión arquitectónica involucra UX (no solo invariantes técnicas), preguntar al dueño la intención UX **antes** de redactar prompt para Claude Code. Patrón explícito al carácter:
- Decisiones puramente técnicas (firma del state, ubicación del productor, mecanismo de suscripción): CTO recomienda con razón técnica, dueño valida.
- Decisiones que afectan UX visible (qué pasa con la regla al cambiar TF, qué pasa con drawings al cambiar par, etc.): CTO pregunta al dueño primero, recomienda después.

### §7.3 Confusión operativa CTO sobre flujo de smoke replay

**Hecho**: en el prompt de smoke 5d.2 al carácter, CTO replicó literal el §5.1 del prompt sesión 21 ("Retroceder en replay 200+ velas (zona pasada bien adentro)"). Ramón cazó al carácter que el simulador es replay forward-only — no se puede retroceder. El smoke real fue subir y bajar TFs en distintos puntos del replay, lo que cubre igualmente la regresión sesión 16.

**Causa**: CTO aceptó al carácter el texto literal del prompt sesión 21 sin verificar al carácter contra realidad del simulador. El prompt sesión 21 fue redactado al cierre de sesión 20 — posiblemente con asunción incorrecta sobre capacidad de retroceso.

**Severidad**: leve. Cero impacto en el smoke (Ramón ejecutó variante equivalente que cubre la regresión). Pero el prompt sesión 22 NO debe heredar la misma redacción.

**Mejora futura**: para prompts de sesión que mencionen flujos del simulador específicos, CTO valida al carácter contra capacidades reales del runtime antes de aceptarlos como instrucción. Aplicado a prompt sesión 22 en §4.7 arriba — el flujo "Cambio TF en zona pasada" se mantiene como descripción genérica de "subir y bajar TFs en distintos puntos del replay", no se especifica retroceso.

### §7.4 Re-ejecución de Edit por Claude Code tras revert

**Hecho**: tras revert de versión A de 5d.3 en shell de Ramón (working tree limpio, HEAD `4f943a4`), CTO redactó prompt versión B y se lo pasó a Ramón para que pegara en Claude Code. Claude Code mostró log que mencionaba "regla fija + cambio de TF debería reproyectar coords, no quedar stale" — vocabulario de versión A, no B. CTO interpretó al carácter que Claude Code re-aplicó versión A. Pidió revert "preventivo".

**Realidad al carácter** (descubierta tras pedir `git status && git log --oneline -2 && grep -n chartTick RulerOverlay.js`): working tree limpio, HEAD `4f943a4`, RulerOverlay.js sin `chartTick`. Claude Code NO había re-aplicado nada — su mensaje era el log/recap del Edit anterior, sin nuevo Edit aplicado tras el revert.

**Causa**: CTO leyó el output de Claude Code asumiendo que cualquier output con código de versión A implicaba que el código estaba en disco. Disciplina §1.2 dice exactamente lo contrario — la verificación al carácter es shell de Ramón, no log de Claude Code.

**Severidad**: leve. El revert "preventivo" pedido a Ramón fue idempotente (no había nada que revertir). Cero pérdida de trabajo. Pero generó 1-2 turnos de chat innecesarios.

**Mejora futura al carácter**: cuando el log de Claude Code muestra Edits, CTO pide al carácter `git status && git diff --stat` en shell de Ramón ANTES de inferir estado de disco. Verificación bicapa estricta también para confirmar lo que Claude Code DICE haber hecho.

### §7.5 Eficiencia operativa global de sesión 21

A pesar de los 4 errores §9.4 anteriores, sesión 21 produjo **3 commits funcionales en ~4h**, vs sesión 20 que produjo **1 commit en ~6h**. La curva de aprendizaje del patrón disciplina bicapa + Claude Code + atomización por sub-fase mejora al carácter:
- Sesión 20: 6 turnos de fricción operativa antes del primer Edit.
- Sesión 21: 0 turnos de fricción de auth (test trivial al inicio cazó al carácter), ~2 turnos de fricción por iteración 5d.3 versión A → B.

Ratio commits/hora sesión 21: 0.75 commit/h. Ratio sesión 20: 0.17 commit/h. **Mejora ×4 al carácter**.

---

## §8 — Lecciones generalizables de sesión 21

### §8.1 Atomización por sub-fase produce confianza incremental

Sesión 21 demostró al carácter que atomizar 5d.x en commits separados (5d.1 doc / 5d.2 KillzonesOverlay / 5d.3 RulerOverlay) tiene 3 ventajas concretas observadas:

1. **Cierre parcial siempre posible**: si 5d.3 se hubiera complicado (como casi pasa con la versión A descartada), 5d.1 + 5d.2 ya estaban comiteadas y la regresión Killzones resuelta. Patrón §7.2 del prompt ("cierre parcial al carácter") en acción.
2. **Smoke específico por commit**: 5d.1 sin smoke (JSDoc), 5d.2 con smoke específico Killzones, 5d.3 con smoke específico regla. Cada smoke valida lo que ese commit cambió, sin ruido cruzado.
3. **Revert quirúrgico**: la versión A de 5d.3 se revirtió con `git checkout --` sobre 2 archivos sin afectar 5d.1 ni 5d.2 ya comiteadas. Si hubieran sido un commit gordo, revertir habría tocado los 4 archivos juntos.

### §8.2 Inventario expandido al carácter refuta asunciones documentales

PASO 0 sesión 21 leyó al carácter los 3 overlays enteros (`cat` de 893 líneas). HANDOFF 17 §2.3 marcaba RulerOverlay como "presumible suscripción interna LWC". El `cat` reveló al carácter que RulerOverlay **no tiene** suscripción LWC — solo handlers de mouse. Si CTO hubiera diseñado 5d.3 confiando en la asunción HANDOFF 17, el Edit hubiera sido incoherente.

**Lección al carácter**: las marcas "presumible" en HANDOFFs históricos son hipótesis pendientes de verificar, no datos. Cuando se ataca el componente, la primera acción es leer los bytes al carácter. Disciplina §1.2 aplicada también a documentación interna del proyecto, no solo a código.

### §8.3 Decisiones UX requieren input del dueño antes del Edit

Documentado en §7.2 arriba. Aplicación al carácter: en sesión 22, antes de diseñar 5d.5 (CustomDrawingsOverlay), CTO pregunta al dueño: "¿Los drawings del usuario al cambiar TF deben (a) mantenerse anclados a su `{time, price}` y reproyectarse, (b) borrarse?" Aunque la respuesta parezca obvia (los drawings YA están arreglados desde fases 1-4 con anclaje a timestamp — ergo (a) es la política existente), confirmarlo al carácter evita el patrón §7.2.

### §8.4 Estimaciones plan v3 vs realidad: subestimación de sub-fases discretas

Plan v3 §5 estimaba sub-fases 5d.1-5d.4 como ~150-250 líneas. Realidad al carácter sesión 21: ~43 líneas tocadas (+39 / -4). **Plan v3 sobreestima en ~3-5x al carácter** para esta sub-fase.

**Hipótesis al carácter sobre la causa**: plan v3 incluyó margen para "rediseño imprevisto" (como pasó con cluster A en sesión 18). Cuando el rediseño no es necesario y los Edits son quirúrgicos, el margen se queda sin usar.

**Implicación al carácter para sesión 22**: NO bajar mecánicamente la estimación de plan v3 §5 sub-fases 5d.5-5d.8 (~100-200 líneas) — la deuda 5.1 viewport puede requerir cambios en `scrollToTail` y/o `applyForcedSetData`, código sensible. El estimado debe revisarse al carácter en sesión 22 tras inventario propio del territorio 5d.5-5d.8, no por extrapolación lineal.

---

## §9 — Cierre

Sesión 21 deja:
- 3 commits funcionales nuevos en rama feature: `aa1498a` (5d.1), `4f943a4` (5d.2), `d7ee4a8` (5d.3).
- Regresión Killzones sesión 16 resuelta empíricamente al carácter.
- Contrato `chartTick` formal documentado al carácter en código.
- 4 errores §9.4 registrados al carácter para mejora operativa.
- Causa raíz parcial deuda 5.1 viewport pre-identificada al carácter por Ramón.
- Sesión 22 con objetivo concreto al carácter: sub-fases 5d.5-5d.8 (CustomDrawingsOverlay + PositionOverlay + deuda 5.1 + atajo Opt+R).

**Plan v3 valida su valor por segunda sesión consecutiva al carácter**. Sesiones 20 y 21 produjeron 4 commits funcionales en cluster B en 2 sesiones — el ratio de progreso es ahora coherente con plan v3 §8 (calendario sub-fases por sesión). Si sesión 22 cierra 5d.5-5d.8, cluster B estará al 60% según calendario plan v3, y el merge a main de sesión 25 queda al alcance al carácter.

**Próximo HANDOFF (cierre sesión 22) debe reportar al carácter**:
- Si sub-fases 5d.5-5d.8 cerraron con commit en rama feature.
- Si la deuda 5.1 viewport quedó resuelta empíricamente al carácter.
- Si los 3 greps de invariantes fase 4 siguieron intactos.
- Si los 6 helpers de sub-fase 5c siguen separados.
- Si el contrato `chartTick` siguió formal sin regresión.

Si sesión 22 NO cierra 5d.5-5d.8 al carácter, el HANDOFF lo dice al frente sin maquillaje — patrón §0 mantenido.

**Mensaje del CTO al cierre al carácter**: sesión 21 ha sido la sesión más productiva de cluster B hasta la fecha. La disciplina bicapa cazó al carácter el desajuste UX en versión A de 5d.3 antes del commit, demostrando que el patrón funciona también en decisiones de diseño, no solo de código. Lección §7.2 capturada al carácter para no repetirla en sesión 22.

---

*Fin del HANDOFF cierre sesión 21. 6 mayo 2026, ~4h efectivas. Redactado por CTO/revisor tras commit `d7ee4a8` en rama feature `refactor/fase-5-drawings-lifecycle`. Pendiente de mover al repo + commit a main + push a `origin/main` por Ramón según §6.*
