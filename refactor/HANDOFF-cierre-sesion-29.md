# HANDOFF — cierre sesión 29

> Sesión 29 cerrada el 16 mayo 2026, ~00:15 hora local.
> Sesión 29 = sub-fase **5g.2 KZ-redraw-on-TF-change** según plan táctico HANDOFF s28 §5.3.
> **Resultado al carácter sin maquillaje**: sub-fase 5g.2 CERRADA ESTRUCTURALMENTE EN PRODUCCIÓN al carácter. Edit `+5/-0` (3 hunks, `+6` insertions con línea vacía) aplicado al carácter en `components/KillzonesOverlay.js` vía Claude Code — patrón `drawRef` ref-based invocado tras recalcular `cachedSessionsRef.current` en el `useEffect` cache L175-L194, cierra al carácter race React flush vs LWC callback asíncrono en cambio TF. Commit `68e3772` push a `origin/main`. Smoke producción N=1 PASS al carácter post-deploy Vercel — bug 5g.2 KZ descolocadas/invisibles al cambiar TF sin tocar gráfico NO reproducible al carácter en producción runtime efectivo `68e3772`.
> **SEGUNDO COMMIT FUNCIONAL EN MAIN POST-CLUSTER-B** — `68e3772` sobre `65b2bc5` (5g.1). Runtime producción al carácter cambiado al carácter por segunda vez desde 9 may 2026.
> **1 Edit revertido al carácter en sesión 29** — primer intento Camino A naive (`draw()` directo en cuerpo useEffect + dep array) ROMPIÓ runtime por TDZ (`Cannot access 'M' before initialization`). Detectado al carácter en smoke local pre-commit. Revert `git checkout --` limpio. Replanteo a Camino A ref-based correcto.
> Próxima sesión = sesión 30, prioridad 1 = datos crudos Giancarlo bicapa estrictos + verificar modal BUY LIMIT descolocado post-5g.1/5g.2 + prioridad 2 = deuda 4.6 caso 05:40 vendor fallback + prioridad 3 = deuda acceso-simulador-revoke no-efectivo.

---

## §0 — Estado al cierre sesión 29, sin maquillaje

**Sesión 29 produjo 1 commit funcional al carácter en main**: `68e3772` (5g.2 KZ-redraw-on-TF-change drawRef ref-based). HEAD main al cierre = `<HASH-HANDOFF-s29>` sobre `68e3772` sobre `34d0cc0` (HANDOFF s28) sobre `65b2bc5` (5g.1) sobre `8af640d` (HANDOFF s27) sobre `46109fd` (HANDOFF s26) sobre `06e16bf` (merge cluster B, 9 may 2026).

`origin/main` = `68e3772` desde ~00:00 hora local 16 may 2026 + HANDOFF s29 docs post-redacción. Producción Vercel actualizada al carácter automáticamente a runtime efectivo `68e3772` post-push (~3 min build + deploy Vercel).

**Cambio runtime producción al carácter**: segundo cambio runtime efectivo producción post-cluster-B. `65b2bc5` (5g.1) → `68e3772` (5g.2). Producción al carácter ahora cluster B + 5g.1 + 5g.2 estable empíricamente al carácter post-deploy.

**Realidad sin maquillaje al carácter**:

1. **Sub-fase 5g.2 CERRADA ESTRUCTURALMENTE EN PRODUCCIÓN al carácter** — Edit `+5/-0` (3 hunks) en `KillzonesOverlay.js` cierra al carácter el bug 5g.2 KZ descolocadas/invisibles al cambiar TF sin tocar gráfico. Validación bicapa estricta al carácter:
   - N=1 reproducción producción pre-Edit al carácter en PASO 1 sesión 29 (bug VIVO determinístico al carácter, Ramón verbatim *"cambia a m30 y no estan hasta que no lo mueva o haga clic"*).
   - Smoke discriminante local post-Edit al carácter — cadena TF M5→M30→M15→M5 todas combinaciones PASS al carácter + drag M1 fluido regresión-test PASS al carácter.
   - Smoke producción post-deploy N=1 PASS al carácter — bug 5g.2 NO reproducible al carácter en producción `68e3772`.

2. **1 Edit revertido al carácter en sesión 29 — primer intento Camino A naive TDZ FAIL** — el primer Edit propuesto al carácter (`draw()` directo en cuerpo `useEffect` L194 + `draw` añadido al dep array) ROMPIÓ runtime con `ReferenceError: Cannot access 'M' before initialization` (Temporal Dead Zone — `draw` declarada en L197, DESPUÉS del `useEffect` L175 que la invoca). Build PASS engañoso al carácter (el error es runtime, no compile-time). Detectado al carácter en smoke local pre-commit por pantalla vacía + error JS Console. Revert `git checkout --` limpio. Replanteo a Camino A ref-based (`drawRef = useRef(null)` + sincronización `useEffect(() => { drawRef.current = draw }, [draw])` + invocación `drawRef.current?.()` en cuerpo cache useEffect). Ref pattern resuelve TDZ — `drawRef` accesible siempre, `draw` se asigna post-mount.

3. **2 errores §9.4 propios CTO al carácter en sesión 29** registrados al carácter sin maquillaje en §3 — (a) Edit Camino A naive sin verificar orden declarativo `draw` vs `useEffect` en bytes pese a tener SEP-INV-03 con `draw` en L197 visible, (b) errores redacción prompt s29 (SEP-09 línea L192 no proyectada post-5g.1 `+2` + cálculo "36 datos" cuando cadena son 4 cambios). Severidad (a) ALTA — habría llegado a producción sin smoke local. Ambos cazados al carácter por disciplina bicapa estricta + Ramón verbatim.

4. **Patrón histórico §0 sin maquillaje al carácter mantenido al carácter por novena sesión consecutiva**. Sesión 29 al carácter cierra al carácter sub-fase declarada objetivo prioridad 1 cierre s28 — entrega valor empírico al carácter inmediato al carácter producción.

5. **Instrucción persistente NUEVA al carácter Ramón sesión 29 — un paso a la vez, mensajes cortos, SIEMPRE TODAS las sesiones** — registrada al carácter en memoria persistente proyecto + formalizada lección §31 §9 abajo. Sesión 29 §3.3 error §9.4 propio CTO — mensajes largos multi-paso violando al carácter preferencia Ramón. Corregido al carácter mitad sesión a formato 1-paso-1-mensaje.

---

## §1 — Qué se hizo en sesión 29 al carácter

### §1.1 PASO 0 al carácter — lectura HANDOFFs project_knowledge

Sesión 29 arrancó al carácter 15 may 2026 ~22:30 hora local — gap ~1h desde cierre s28 ~21:30 hora local. **Project_knowledge SIN lag indexación al carácter sesión 29** — HANDOFF s28 indexado correctamente al carácter en arranque s29 pese a gap < 5h (rompe patrón histórico lag s23-s27).

CTO ejecutó al carácter 7 búsquedas dirigidas vía `project_knowledge_search`:
1. `HANDOFF sesión 28 §0 sin maquillaje estado final` — devolvió s28 §0 + s27 §0 + s28 §1.1 + s28 §10.
2. `HANDOFF s28 §5.3 plan táctico 5g.2 KZ redraw TF change camino A B C` — devolvió s28 §5.2 PASO 0 obligatorio s29 + §5.3 plan táctico 5g.2 + analogía estructural A/B/C.
3. `HANDOFF s28 §3 errores §9.4 propios CTO sesión 28` — devolvió s28 §3.1 + tabla deudas (incluye `chartTick` prop huérfana KZ pendiente cosmética).
4. `HANDOFF s28 §9 lecciones acumuladas §27 §28 §29 §30 nuevas` — devolvió s28 §9 lecciones 27-30 NUEVAS verbatim.
5. `HANDOFF s28 §6.2 causa raíz arquitectónica manta invisibilidad refinada` — devolvió s28 §6.2 + Camino A refinado 5g.1.
6. `CLAUDE.md reglas absolutas §1 §2 §3 §4` — devolvió CLAUDE.md §1-§4 + §4.3 criterios "está hecho".
7. `HANDOFF s28 §1.14 verbatim Ramón "esto si ocurria ya antes"` — devolvió s28 §1.9 + §1.13 + §1.14 tabla verbatim.

PASO 0 lectura completa al carácter HANDOFF s28 entero + s27 §5.3/§6.2 + s26 referencias 5f.0c + CLAUDE.md §1-§4.

### §1.2 PASO 0.5 — verificación shell pre-trabajo

Ramón ejecutó al carácter bloque shell 9 separadores. Outputs PASS 8/9 + 1 desvío al carácter:
- SEP-01 git status: `On branch main` + up to date + working tree clean ✓
- SEP-02 log --oneline -5: cadena `34d0cc0 → 65b2bc5 → 8af640d → 46109fd → 06e16bf` ✓
- SEP-03 rev-parse HEAD: `34d0cc031010a50e65db968cfb7c14748865faaf` ✓
- SEP-04 invariante setData: vacío ✓
- SEP-05 invariante update: vacío ✓
- SEP-06 invariante computePhantomsNeeded: 3 matches L116/L1145/L1224 ✓
- SEP-07 KZ L155: `const w = parent.clientWidth` ✓ (5g.1 aplicado)
- SEP-08 KZ L260: `if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement)` ✓
- **SEP-09 KZ L192: `return counts[s.key] <= cfg.history` ⚠️ DESVÍA** — esperado dep array `tfKey`, output línea lógica filter

**Discriminante SEP-DISC al carácter** (grep dep array + sed L194 + wc -l) confirmó al carácter: dep array 5f.0b INTACTO desplazado a L194 (no L192) por Edit 5g.1 `+2` líneas netas. KZ `wc -l` = 457 (coherente s28 §2.3). NO regresión 5f.0b — error redacción prompt s29 CTO (esperado SEP-09 no proyectado post-5g.1). Registrado §3.2.

3 invariantes fase 4 mantenidas al carácter por **novena sesión consecutiva** (heredadas s12).

### §1.3 PASO 1 — reproducción bug 5g.2 producción

Plan original CTO al carácter: N≥3 reproducción (cadena TF M5→M15→M30→M15→M5 × 3 ciclos). Ramón cazó al carácter el sobre-pedido verbatim *"ya he reportado el bug al caracter, cuantas veces mas??"* tras N=1 limpio (apertura → KZ M5 visibles → cambio M30 → FAIL-INV KZ no aparecen → click → KZ aparecen donde van).

CTO replanteó al carácter — N=1 limpio + caracterización verbatim 3× sesión 28 (pre-existencia confirmada Ramón *"esto si ocurria ya antes"*) es dato empírico completo. Lección §27 s28 (reconocimiento Ramón discriminante > test técnico) aplicada al carácter. PASO 1 cerrado al carácter con N=1. Lección NUEVA §32 §9 — N≥3 es ruido cuando bug caracterizado verbatim sesión previa + reconfirmado empíricamente arranque.

**Bug 5g.2 caracterizado al carácter**: trigger cambio TF + no tocar nada. Sub-modos: KZ descolocadas (otro sitio) o invisibles (no aparecen). Intermitente al carácter. Workaround empírico: touch (drag/scroll/click) → redraw correcto.

### §1.4 PASO 2 — inventario bytes 5g.2

CTO ejecutó al carácter 2 bloques shell read-only (SEP-INV 8 separadores + SEP-INV2 3 separadores). Hallazgos verificados al carácter:

- **`useEffect` cache L175-L194** recalcula `cachedSessionsRef.current` pero NO llama `draw()` al final del cuerpo. Dep array L194 `[cfg, tfAllowed, dataReady, activePair, tick, tfKey, ctBucket]`.
- **Repintado depende exclusivamente** de handlers LWC asíncronos: `subscribeVisibleLogicalRangeChange` (L264), `subscribeSizeChange` (L268), `ResizeObserver` parentElement (L260, 5g.1), drag-aware `requestAnimationFrame` (L281), mount inicial (L256).
- **`draw` useCallback L197-L247** dep array `[chartMap]` solo — estable across cambios TF, NO se recrea al bumpear `tfKey`.
- **`useEffect` mount L250-L326** dep array `[activePair, chartMap, dataReady, draw, resizeCanvas]` — NO incluye `tfKey`/`currentTf`, NO se re-monta al cambio TF (handlers persisten).
- **`useEffect` adicional L330** `useEffect(() => { draw() }, [cfg, tfAllowed, draw])` — NO depende de `tfKey`/`tick`/`ctBucket`/`activePair`. Asimetría arquitectónica al carácter: cambio TF dispara cache useEffect L175 (vía `tfKey`) pero NO dispara repintado determinístico.
- **`chartTick` prop** solo en firma L117 — prop huérfana confirmada al carácter (coherente s28 tabla deudas), NO factor 5g.2.
- **Secuencia cambio TF** L1265-L1267: `applyForcedSetData` (LWC setData síncrono) → `bumpTfKey` (setState async) → `scrollToTailAndNotify` (bump chartTick async).

**Causa raíz arquitectónica 5g.2 al carácter**: race entre React flush de `setTfKey` (dispara `useEffect` L175 → actualiza `cachedSessionsRef.current`) vs LWC callback `subscribeVisibleLogicalRangeChange` disparado post-setData síncrono. Si callback LWC dispara ANTES del flush React → `draw()` lee cache STALE (TF previo) → coords `null` (sub-modo INV) o incorrectas (sub-modo DESC). Pieza faltante al carácter: `useEffect` L175 NO llamaba `draw()` post-actualización cache → KZ quedaba en estado stale hasta touch dispara handler. Análogo estructural al carácter a race 5f.0c (HANDOFF s27 §6.3) pero en path `cachedSessionsRef` KZ específico.

### §1.5 PASO 3 — Edit Camino A naive FAIL (TDZ) + revert

CTO propuso al carácter Camino A naive: `draw()` directo al final cuerpo `useEffect` L194 + `draw` añadido al dep array L194. Scope `+2/-1`. Aplicado vía Claude Code (opción 1 manual). Diff auditado al carácter PASS. Build local PASS al carácter (engañoso — TDZ es error runtime, no compile-time). Smoke local: pantalla vacía + `Application error: a client-side exception has occurred`.

Console error verbatim al carácter: `ReferenceError: Cannot access 'M' before initialization` (`M` = minificación de `draw` o símbolo relacionado). Causa: `draw` declarada `const`/`useCallback` en L197, DESPUÉS del `useEffect` L175 que la invoca. Temporal Dead Zone — al ejecutarse el `useEffect` en mount, `draw` aún no inicializada.

Revert `git checkout -- components/KillzonesOverlay.js` limpio. Server parado. Replanteo a Camino A ref-based.

### §1.6 PASO 3bis — Edit Camino A ref-based PASS

Edit replanteado al carácter — 3 hunks `+5/-0` (`+6` insertions con línea vacía):
- **Hunk 1 L130**: `const drawRef = useRef(null)` (zona refs, patrón uniforme con `dataReadyRef`/`cfgRef`/`activePairRef`/`tfAllowedRef`).
- **Hunk 2 L195**: `drawRef.current?.()` tras `.reverse()` en cuerpo `useEffect` cache (dep array L196 INTACTO — ref no requiere dep).
- **Hunk 3 L251-L253**: `useEffect(() => { drawRef.current = draw }, [draw])` post-cierre `draw` useCallback, antes comentario subscripciones.

Ref pattern resuelve TDZ — `drawRef` accesible siempre desde mount, `draw` se asigna a `drawRef.current` post-declaración vía useEffect dependiente de `draw`. Cuando `useEffect` cache L175 recalcula `cachedSessionsRef.current`, invoca `drawRef.current?.()` — null-safe en primer mount (antes de sincronización), draw correcto en cambios TF subsiguientes.

Aplicado vía Claude Code (opción 1 manual). Diff auditado al carácter PASS `+5/-0`. Build local PASS al carácter sin warning exhaustive-deps.

### §1.7 PASO 4 — smoke discriminante targeted local

Lección §28 s28 (smoke escala al scope Edit) aplicada al carácter — smoke discriminante targeted 2 casos, NO smoke combinado 8 casos heredado:
- **Caso A — cadena TF**: M5→M30 PASS + M30→M15 PASS + M15→M5 PASS + todas combinaciones PASS al carácter (Ramón verbatim *"pass.. ya probé todas las combinaciones"*). Sin tocar gráfico post-cambio.
- **Caso B — drag M1 fluido regresión-test 5f.0a** (lección §5.5 s23-s28 obligatorio post-Edit que toca KZ): Ramón verbatim *"fluido"*.

2/2 PASS al carácter.

### §1.8 PASO 5 — commit + push directo a main

Cluster B + 5g.1 ya en main — 5g.2 commitea directo al carácter (no requiere merge no-FF). `git add` + commit `68e3772` (`1 file changed, 6 insertions(+)`) + push `34d0cc0..68e3772 main -> main`.

### §1.9 PASO 6 — smoke producción

Vercel deploy ~3 min. Ramón reporte verbatim *"ready"* + smoke producción N=1 cadena TF M5→M30→M15→M5 sin tocar gráfico → *"pass"*. **Smoke producción PASS al carácter** — bug 5g.2 NO reproducible al carácter en producción `68e3772`.

### §1.10 Verbatim Ramón sesión 29 — preservar al carácter para sesiones futuras

| Momento | Verbatim Ramón al carácter |
|---|---|
| Reproducción bug 5g.2 producción + sobre-pedido cazado | *"abrí y si estaban.. cambia a m30 y no estan hasta que no lo mueva o haga clic.. ya he reportado el bug al caracter, cuantas veces mas??"* |
| Editor preferido | *"claude code"* |
| Detección Edit naive FAIL (vía captura pantalla vacía) | (captura `Application error: a client-side exception has occurred`) |
| Demanda calidad post-FAIL | *"y por k lo haces mal? que no vuelva a suceder, hazlo bien de una vez"* |
| Instrucción persistente formato | *"no entiendo los mensajes pork tan largos... me das un paso y lo hago y luego el otro y asi.. esto lo kiero SIEMPRE EN TODAS LAS SESIONES"* |
| Smoke local cadena TF | *"pass.. ya probé todas las combinaciones"* |
| Smoke local drag M1 | *"fluido"* |
| Smoke producción | *"pass"* |
| Cierre profesional | *"avancemos de la manera mas correcta y profesional"* |

**Patrón al carácter "intuición Ramón = input técnico encriptado en lenguaje de usuario, sistemáticamente correcto al carácter"** confirmado al carácter por **decimocuarta sesión consecutiva** (12, 20, 21, 22, 24, 25, 5× s26, 5× s27, 2× s28, 2× s29 — sobre-pedido N≥3 cazado + demanda calidad post-TDZ).

---

## §2 — Estado al carácter (verificable desde shell)

### §2.1 Git

- **Rama activa al cierre**: `main`.
- **HEAD main al cierre**: `<HASH-HANDOFF-s29>` (HANDOFF s29 docs) sobre `68e3772` (5g.2 funcional).
- **`origin/main`** = `<HASH-HANDOFF-s29>` post-push docs.
- **Cadena main al cierre** (de HEAD hacia atrás):
  ```
  <HASH-HANDOFF-s29> — HANDOFF s29
  68e3772 — 5g.2 KZ-redraw-on-TF-change drawRef ref-based (FUNCIONAL)
  34d0cc0 — HANDOFF s28
  65b2bc5 — 5g.1 responsive-viewport Camino A refinado (FUNCIONAL)
  8af640d — HANDOFF s27
  46109fd — HANDOFF s26
  06e16bf — merge cluster B en main (sesión 26)
  ...
  ```
- **Rama feature `refactor/fase-5-drawings-lifecycle`** al cierre = `49cdab8` (5f.0b). Preservada al carácter como histórico.
- **Working tree** limpio al carácter al cierre redacción.

### §2.2 Producción Vercel

- Deploy actual: `68e3772` (5g.2) — runtime efectivo cluster B + 5g.1 + 5g.2 en producción al carácter desde ~00:00 hora local 16 may 2026.
- **SEGUNDO CAMBIO RUNTIME PRODUCCIÓN POST-CLUSTER-B** — `65b2bc5` (5g.1) → `68e3772` (5g.2).
- **Smoke producción N=1 al carácter PASO 6** PASS al carácter — bug 5g.2 NO reproducible al carácter en producción `68e3772`.

### §2.3 Tamaños actuales al carácter

| Archivo | Líneas pre-29 | Líneas post-29 | Delta |
|---|---|---|---|
| `lib/chartViewport.js` | 202 | 202 | 0 |
| `components/_SessionInner.js` | 3052 | 3052 | 0 |
| `components/useDrawingTools.js` | 243 | 243 | 0 |
| `components/useCustomDrawings.js` | 62 | 62 | 0 |
| `components/KillzonesOverlay.js` | 457 | **462** | **+5** |
| `components/RulerOverlay.js` | 256 | 256 | 0 |
| `components/CustomDrawingsOverlay.js` | 192 | 192 | 0 |

**+5 netas líneas en `KillzonesOverlay.js`** (3 hunks `+5/-0`; `+6` insertions git contando línea vacía Hunk 3). Otros archivos al carácter intactos. Cluster A INTOCABLE preservado al carácter por novena sesión consecutiva.

### §2.4 Invariantes fase 4 al cierre — verificadas al carácter

```
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"  → vacío
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"   → vacío
grep -n "computePhantomsNeeded" components/_SessionInner.js                          → 3 matches L116, L1145, L1224
```

Las 3 invariantes fase 4 mantenidas al carácter por **novena sesión consecutiva** (heredadas s12).

---

## §3 — Errores §9.4 propios del CTO en sesión 29

### §3.1 §9.4 MAYOR — Edit Camino A naive sin verificar orden declarativo (TDZ)

**Hecho al carácter**: CTO propuso al carácter primer Edit 5g.2 — `draw()` directo en cuerpo `useEffect` L194 + `draw` añadido al dep array. Inventario PASO 2 SEP-INV-03 mostró al carácter `draw = useCallback(...)` en L197 — DESPUÉS del `useEffect` L175 que CTO propuso invocarla. CTO no advirtió Temporal Dead Zone. Build PASS engañoso (TDZ es error runtime). Smoke local: pantalla vacía + `ReferenceError: Cannot access 'M' before initialization`.

**Causa al carácter**: CTO asumió closure JS resolvería referencia a `draw` sin verificar orden declarativo en bytes pese a tener SEP-INV-03 con `draw` en L197 visible. Error JavaScript básico — `const`/`useCallback` declarados después del punto de uso generan TDZ al ejecutar en mount. CTO incluso había propuesto inicialmente el patrón `drawRef` correcto, luego lo descartó erróneamente como "complicado" al ver `draw` en L197 (interpretó visibilidad como accesibilidad).

**Severidad**: ALTA. Habría llegado a producción si Ramón no detecta pantalla vacía + error JS en smoke local pre-commit. Coste real: ~1 ciclo Edit + revert + replanteo + re-Edit (~20 min) + 1 build extra.

**Mejora futura al carácter**: antes de cualquier Edit que invoque función/símbolo dentro de un `useEffect`/`useCallback` + posible dep array, verificar al carácter en bytes el ORDEN DECLARATIVO de la función vs el hook que la usa. Si función declarada DESPUÉS → TDZ → usar ref pattern (`xRef = useRef(null)` + sync useEffect + invocación `xRef.current?.()`). NO interpretar "símbolo visible en inventario" como "símbolo accesible en ese punto de ejecución". Lección NUEVA §33 §9.

### §3.2 Errores redacción prompt s29 — SEP-09 línea + cálculo "36 datos"

**Hecho al carácter**: (a) prompt s29 PASO 0.5 esperaba SEP-09 L192 dep array `tfKey` — output real línea lógica filter porque Edit 5g.1 desplazó `+2` líneas (L192 → L194). CTO no proyectó al carácter el desplazamiento del propio Edit 5g.1 que acababa de commitear al cerrar s28. (b) prompt s29 escribió al carácter "12 cambios × 3 = 36 datos" cuando cadena `M5→M15→M30→M15→M5` son 4 cambios (4 × 3 = 12 datos).

**Causa al carácter**: prompt s29 redactado al cierre s28 ~21:30 fatigado al carácter heredando números de línea de HANDOFFs previos sin proyectar desplazamiento Edit 5g.1 + error aritmético cadena TF. Patrón redacción prompt sesión siguiente al cierre fatigado.

**Severidad**: leve. +1 turno chat extra (SEP-DISC discriminante). Cazado al carácter por verificación bicapa + Ramón disciplina perfeccionista (lección §14 s12-s29).

**Mejora futura al carácter**: al redactar prompt sesión siguiente al cierre de sesión con Edit funcional, proyectar al carácter explícitamente el desplazamiento de líneas en los esperados PASO 0.5. Verificar al carácter aritmética de cadenas de test (contar cambios reales, no inferir).

### §3.3 §9.4 — mensajes largos multi-paso violando preferencia Ramón

**Hecho al carácter**: durante sesión 29 CTO emitió al carácter múltiples mensajes largos multi-paso (planes completos PASO 1-6, bloques de análisis extensos). Ramón cazó al carácter el patrón verbatim *"no entiendo los mensajes pork tan largos... me das un paso y lo hago y luego el otro y asi.. esto lo kiero SIEMPRE EN TODAS LAS SESIONES"*.

**Causa al carácter**: CTO heredó al carácter formato HANDOFF-style verboso de sesiones previas sin adaptar al carácter a preferencia operativa Ramón de ejecución incremental 1-paso-1-mensaje.

**Severidad**: media. Fricción comprensión Ramón acumulada durante ~60% de la sesión antes de corrección. Sin impacto técnico (todos los pasos correctos) pero coste cognitivo Ramón real.

**Mejora futura al carácter**: registrado al carácter en memoria persistente proyecto + lección §31 §9. Formato 1-paso-1-mensaje OBLIGATORIO TODAS las sesiones forex-simulator. Mensajes cortos. Un paso → Ramón ejecuta → reporta → siguiente paso. NO planes largos multi-paso. NO bloques masivos. Aplica también dentro de sub-fases y Edits.

---

## §4 — Deudas vivas al cierre sesión 29

| Deuda | Estado al carácter | Calendario |
|---|---|---|
| Bug 5g.2 KZ-redraw-on-TF-change | ✅ **CERRADA AL CARÁCTER en 5g.2 (s29)** producción `68e3772` | Cerrada |
| Bug 5g.1 manta invisibilidad | ✅ CERRADA en 5g.1 (s28) producción | Cerrada |
| Datos crudos Giancarlo + modal BUY LIMIT descolocado | ⏳ ABIERTA — verificar si beneficia 5g.1/5g.2 (cadena CSS responsive) o requiere fix dedicado | **Prioridad 1 s30** |
| Deuda 4.6 caso 05:40 vendor fallback `+1-1` | ⏳ ABIERTA — inventario bytes completo HANDOFF s27 §6.4, Edit `Math.floor(timeDiff/interval)` L1626 READY. Pendiente N≥3 reproducción Ramón ANTES Edit | **Prioridad 2 s30** |
| Deuda acceso-simulador-revoke no-efectivo | ⏳ ABIERTA — severidad ALTA. Inventario bytes endpoints `/api/admin/toggle-acceso-sim` + `/api/admin/list-alumnos-sim` + lógica auth `/session/[id]` + tabla Supabase | **Prioridad 3 s30** |
| Sub-fase 5f.0c race LWC asíncrona | ⏳ Deuda vigilada — N=24 PASS empírico s27. Posible cierre colateral por 5g.2 (mismo patrón race) — NO declarado sin smoke N≥24 paralelo | Vigilancia |
| `chartTick` prop huérfana KZ (firma L117) | ⏳ ABIERTA — limpieza cosmética | Sub-fase futura |
| `debugCtx` parámetro muerto `applyNewBarUpdate` | ⏳ ABIERTA — cosmética | Sub-fase 5e.4 |
| Polling 300ms `getSelected()` | ⏳ ABIERTA | Sub-fase 5f.2 |
| Bug #2 freeze play velocity-alta x15+ | ⏳ ABIERTA — pre-existente intermitente | Calendario fase 4 RenderScheduler |
| Quota Supabase | ⏳ Vigilancia pasiva | Vigilancia |

---

## §5 — Plan táctico sesión 30

### §5.1 Próximo orden prioridades

- **Prioridad 1 al carácter — datos crudos Giancarlo bicapa estrictos**: si Giancarlo disponible al carácter, Zoom + DevTools + reproducción 3 bugs (modal BUY LIMIT descolocado + drawings zona futura derecha + freeze) + métricas hardware/viewport/browser. **Verificar al carácter empíricamente si modal BUY LIMIT descolocado beneficia al carácter del fix 5g.1/5g.2** (cadena CSS responsive similar) preguntando al carácter Giancarlo + Luis si persiste post-deploy `68e3772`.
- **Prioridad 2 al carácter — deuda 4.6 caso 05:40 vendor fallback `+1-1`**: inventario bytes completo HANDOFF s27 §6.4. Edit Camino A `Math.floor(timeDiff / interval)` L1626 READY. Pendiente Ramón reproducir N≥3 caso 05:40 ANTES Edit (lección §15 + §20 s26 estricta).
- **Prioridad 3 al carácter — deuda acceso-simulador-revoke no-efectivo**: severidad ALTA, fuga acceso. PASO 1 s30: inventario bytes endpoints `/api/admin/toggle-acceso-sim` + `/api/admin/list-alumnos-sim` + `/api/admin/alumno-sim/[id]` + lógica auth `/session/[id]` + tabla Supabase relacionada acceso simulador.
- **Prioridad 4+ al carácter — cosméticas calendarizadas**: `chartTick` prop huérfana KZ + 5e.4 (`debugCtx`) + 5f.2 (polling 300ms) + bug freeze velocity-alta.

**Sub-fase 5f.0c al carácter mantenida en deuda vigilada** — posible cierre colateral por 5g.2 (mismo patrón race React flush vs LWC callback). NO declarar cierre 5f.0c sin smoke producción N≥24 paralelo dedicado.

**Cluster A (fase 5.A)** sigue al carácter aplazado a post-Giancarlo datos crudos. Puede arrancar al carácter sesión 31+ una vez producción cluster B + 5g.1 + 5g.2 estable empíricamente cross-hardware confirmada.

### §5.2 PASO 0 obligatorio en sesión 30

Antes de tocar nada al carácter, leer en este orden al carácter:

1. Este HANDOFF s29 entero, especialmente §0 sin maquillaje + §1 qué se hizo + §3 errores §9.4 propios CTO (especialmente §3.1 TDZ + §3.3 formato) + §5.3 plan táctico + §9 lecciones (especialmente §31 formato + §32 N≥1 + §33 TDZ NUEVAS).
2. HANDOFF s28 §1.9 descubrimiento 5g.2 + §6.5 inventario bytes inicial 5g.2 (referencia histórica).
3. HANDOFF s27 §6.4 deuda 4.6 inventario bytes (prioridad 2 s30).
4. CLAUDE.md §1-§4 reglas absolutas — sin cambios desde s24.

PASO 0.5 verificación shell al carácter:

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git status                                                  (esperado: en main, working tree clean)
git --no-pager log --oneline -5                             (esperado: HEAD nuevo HANDOFF s29 sobre 68e3772 5g.2, anterior 34d0cc0 HANDOFF s28)
git rev-parse HEAD                                          (esperado: hash HANDOFF s29)
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"   (esperado: vacío)
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"    (esperado: vacío)
grep -n "computePhantomsNeeded" components/_SessionInner.js                            (esperado: 3 matches L116 L1145 L1224)
grep -n "const drawRef" components/KillzonesOverlay.js                                 (esperado: 1 match L130 — 5g.2 aplicado)
grep -n "drawRef.current" components/KillzonesOverlay.js                               (esperado: 2 matches — L195 invocación + L253 sync)
```

> NOTA al carácter — números de línea esperados ajustados al carácter post-5g.2 `+5`. NO heredar números pre-5g.2 sin proyección (lección §3.2 s29 — error recurrente CTO redacción prompt).

### §5.3 Disciplina sesión 30 — formato obligatorio

**OBLIGATORIO TODAS las sesiones forex-simulator (lección §31 s29 + memoria persistente proyecto)**: un paso a la vez. Mensajes CORTOS. CTO da un paso → Ramón ejecuta → reporta → CTO da siguiente paso. NO planes largos multi-paso. NO bloques masivos de análisis. Aplica también dentro de sub-fases y Edits. Bloques shell ejecutables separados de prosa mínima. Análisis extenso solo si Ramón lo pide explícitamente.

### §5.4 Cluster A INTOCABLE en sesión 30

Mismo principio que sesiones 20-29 (HANDOFF 19 §4.5 + plan v3 §7 punto 13). Si por error aparece al carácter working tree dirty post-trabajo tocando zonas cluster A (`_SessionInner.js` L297-L365 / L370-L415 / L450-L456), PARAR al carácter.

---

## §6 — Material verificado al carácter en sesión 29 (preservado para sesiones futuras)

### §6.1 Topología cluster B + 5g.1 + 5g.2 al cierre s29

```
06e16bf (merge cluster B en main, sesión 26) — runtime efectivo producción 9-15 may 2026
    ↑
46109fd (HANDOFF s26)
    ↑
8af640d (HANDOFF s27)
    ↑
65b2bc5 (5g.1) — FIX responsive-viewport: resizeCanvas parent.clientWidth + ResizeObserver parentElement
                  RUNTIME EFECTIVO PRODUCCIÓN 15 may 2026 ~21:00 → 16 may 2026 ~00:00
    ↑
34d0cc0 (HANDOFF s28)
    ↑
68e3772 (5g.2) — FIX KZ-redraw-on-TF-change: drawRef.current?.() tras recalcular cachedSessionsRef en useEffect cache
                  RUNTIME EFECTIVO PRODUCCIÓN DESDE 16 may 2026 ~00:00
    ↑
<HASH-HANDOFF-s29>     — HEAD main actual sesión 29
```

### §6.2 Causa raíz arquitectónica 5g.2 — preservada al carácter

Race React flush `setTfKey` (dispara `useEffect` cache L175 → actualiza `cachedSessionsRef.current`) vs LWC callback `subscribeVisibleLogicalRangeChange` disparado post-`applyForcedSetData` síncrono (L1265). Si callback LWC dispara ANTES del flush React → `draw()` lee `cachedSessionsRef.current` STALE del TF previo → `ts.timeToCoordinate(s.startTime)` con timestamps TF previo sobre timeScale TF nuevo → coords `null` (sub-modo INV, fuera rango visible) o coords incorrectas (sub-modo DESC, dentro rango pero erróneas).

Pieza faltante al carácter pre-5g.2: `useEffect` cache L175-L194 recalculaba `cachedSessionsRef.current` pero NO llamaba `draw()` post-actualización. Repintado dependía exclusivamente de handlers LWC asíncronos ganando/perdiendo el race.

Fix 5g.2 al carácter: `drawRef.current?.()` invocado al final del cuerpo `useEffect` cache → cuando React flushea `setTfKey` y recalcula cache, dispara `draw()` inmediato con cache YA actualizada → KZ pintan correcto ≤16ms post-flush, determinístico, independiente de timing LWC callback. Ref pattern (no llamada directa) por TDZ — `draw` declarada L197 después del `useEffect` L175.

### §6.3 Patrón `drawRef` ref-based — preservado al carácter (template TDZ-safe)

```js
// Hunk 1 — zona refs (L130)
const drawRef = useRef(null)

// Hunk 2 — cuerpo useEffect cache (post .reverse())
drawRef.current?.()

// Hunk 3 — post cierre draw useCallback
useEffect(() => { drawRef.current = draw }, [draw])
```

Template al carácter reutilizable para cualquier caso donde un `useEffect` necesite invocar una función declarada DESPUÉS de él (TDZ). Null-safe en mount (`?.()`), sincronización automática vía useEffect dependiente.

---

## §7 — Procedimiento de cierre sesión 29

### §7.1 Mover HANDOFF al repo

Tras descargar este HANDOFF a `~/Downloads/HANDOFF-cierre-sesion-29.md`:

```
git checkout main
```

(Ya estás en main al carácter post-push 5g.2, working tree clean.)

```
mv ~/Downloads/HANDOFF-cierre-sesion-29.md refactor/
```

```
ls -la refactor/HANDOFF-cierre-sesion-29.md
```

```
wc -l refactor/HANDOFF-cierre-sesion-29.md
```

### §7.2 git add + commit (en main)

```
git add refactor/HANDOFF-cierre-sesion-29.md
```

```
git status
```

```
git commit -m "docs(sesion-29): cerrar sesion 29 con 5g.2 KZ-redraw-on-TF-change CERRADA estructuralmente en produccion via drawRef ref-based + 1 Edit naive TDZ revertido + lecciones 31-33 nuevas (formato 1-paso + N>=1 + TDZ)"
```

```
git --no-pager log --oneline -3
```

### §7.3 Push a main

**Recomendación CTO al carácter**: SÍ push al carácter. Patrón histórico sesiones 14-28 mantenido al carácter. Runtime cluster B + 5g.1 + 5g.2 `68e3772` ya desplegado al carácter en producción desde ~00:00 hora local. HANDOFF s29 es docs-only, idempotente al carácter, NO toca código. Vercel re-deployará al carácter — runtime efectivo seguirá con `68e3772` hasta sesión 30.

```
git push origin main
```

### §7.4 Verificación final cierre sesión 29

```
git --no-pager log --oneline -5
```

Esperado al carácter: HEAD nuevo `<HASH-HANDOFF-s29>` sobre `68e3772` (5g.2) sobre `34d0cc0` (HANDOFF s28) sobre `65b2bc5` (5g.1) sobre `8af640d` (HANDOFF s27).

Sesión 29 cerrada al carácter.

---

## §8 — Métricas sesión 29

- **Inicio efectivo al carácter**: ~22:30 hora local (15 may 2026) tras cierre s28 ~21:30 (~1h gap entre sesiones al carácter).
- **PASO 0 (lectura HANDOFFs project_knowledge 7 búsquedas + verificación shell)**: ~15 min.
- **PASO 0.5 + SEP-DISC discriminante (error SEP-09 línea)**: ~10 min.
- **PASO 1 reproducción 5g.2 producción N=1 + sobre-pedido cazado**: ~5 min.
- **PASO 2 inventario bytes (SEP-INV + SEP-INV2)**: ~20 min.
- **PASO 3 Edit Camino A naive + build + smoke local FAIL TDZ + revert**: ~20 min.
- **PASO 3bis Edit Camino A ref-based + build + smoke local PASS**: ~20 min.
- **PASO 5 commit + push**: ~5 min.
- **Espera deploy Vercel + PASO 6 smoke producción PASS**: ~10 min.
- **HANDOFF s29 redactado**: ~40 min.
- **Total efectivo de sesión 29 al carácter**: ~2.5h activas. Coherente al carácter con media histórica post-cluster-B, extendida al carácter por ciclo Edit naive TDZ + revert + re-Edit.
- **Commits funcionales producidos en sesión 29 al carácter**: 1 (`68e3772` 5g.2).
- **Edits aplicados al carácter sesión 29**: 2 (Camino A naive `+2/-1` REVERTIDO + Camino A ref-based `+5/-0` FINAL).
- **Edits revertidos al carácter sesión 29**: 1 (Camino A naive — TDZ FAIL).
- **Líneas tocadas netas en código al carácter**: +5 (`KillzonesOverlay.js`).
- **Push a main al carácter**: 2 (funcional `68e3772` + HANDOFF s29 docs post-redacción).
- **Errores §9.4 propios CTO capturados al carácter en sesión 29**: 3 (§3.1 TDZ MAYOR + §3.2 redacción prompt + §3.3 formato largo) — todos cazados al carácter por disciplina bicapa + Ramón verbatim.
- **Bugs cerrados al carácter en sesión 29**: 1 (5g.2 KZ-redraw-on-TF-change producción).
- **SEGUNDO COMMIT FUNCIONAL POST-CLUSTER-B**: `68e3772` (5g.2) — segundo cambio runtime producción post-cluster-B.

---

## §9 — Aprendizajes generales del proyecto (acumulados sesiones 13-29)

> Sección que persiste a través de HANDOFFs.

1-30: lecciones acumuladas s13-s28 al carácter preservadas al carácter íntegras (ver HANDOFF s28 §9 puntos 1-30).

31. **NUEVO al carácter sesión 29 — formato 1-paso-1-mensaje OBLIGATORIO TODAS las sesiones forex-simulator**. Ramón verbatim s29 *"no entiendo los mensajes pork tan largos... me das un paso y lo hago y luego el otro y asi.. esto lo kiero SIEMPRE EN TODAS LAS SESIONES"*. CTO da un paso → Ramón ejecuta → reporta → CTO da siguiente paso. NO planes largos multi-paso. NO bloques masivos de análisis pre-Ramón. Aplica también dentro de sub-fases y Edits. Bloques shell ejecutables separados de prosa mínima. Análisis extenso SOLO si Ramón lo pide explícitamente. Registrado al carácter en memoria persistente proyecto. **Aplicar al carácter ESTRICTAMENTE en s30+**.

32. **NUEVO al carácter sesión 29 — N≥1 suficiente cuando bug caracterizado verbatim Ramón sesión previa + reconfirmado empíricamente arranque sesión siguiente. N≥3 es ruido**. Sesión 29 PASO 1 — CTO pidió al carácter N≥3 reproducción 5g.2 (cadena × 3 ciclos = 12 datos) cuando Ramón ya había caracterizado al carácter el bug verbatim 3× sesión 28 + confirmado pre-existencia "esto si ocurria ya antes" + reconfirmó al carácter N=1 limpio arranque s29. Ramón cazó al carácter el sobre-pedido verbatim *"ya he reportado el bug al caracter, cuantas veces mas??"*. Análogo a lección §27 s28 (reconocimiento Ramón discriminante > test técnico). Lecciones §15/§20 s26 (N≥3 antes de hipotetizar) aplican al carácter cuando bug DESCONOCIDO o caracterización débil — NO cuando bug caracterizado verbatim sesión previa. **Aplicar al carácter sistemáticamente en s30+**: discriminar al carácter si bug ya caracterizado verbatim antes de pedir N≥3.

33. **NUEVO al carácter sesión 29 — antes de Edit que invoque función dentro de useEffect/useCallback, verificar ORDEN DECLARATIVO en bytes. Símbolo visible en inventario ≠ símbolo accesible en ese punto de ejecución (TDZ)**. Sesión 29 §3.1 error §9.4 MAYOR — CTO propuso al carácter `draw()` directo en cuerpo `useEffect` L175 cuando `draw = useCallback` declarada L197 (después). Temporal Dead Zone — `ReferenceError: Cannot access 'M' before initialization` runtime (build PASS engañoso). Si función declarada DESPUÉS del hook que la usa → usar ref pattern (`xRef = useRef(null)` + sync `useEffect(() => { xRef.current = x }, [x])` + invocación `xRef.current?.()` null-safe). Template TDZ-safe preservado §6.3. **Aplicar al carácter sistemáticamente en s30+**: para Edits que cruzan orden declarativo función↔hook, verificar al carácter línea declaración vs línea uso ANTES de proponer Edit. NO interpretar visibilidad SEP-INV como accesibilidad runtime.

---

## §10 — Cierre

Sesión 29 deja al carácter:

- **Sub-fase 5g.2 CERRADA ESTRUCTURALMENTE EN PRODUCCIÓN al carácter** — bug KZ descolocadas/invisibles al cambiar TF sin tocar gráfico cerrado al carácter via Edit Camino A ref-based `+5/-0` (`drawRef.current?.()` post-recalcular `cachedSessionsRef`) en `components/KillzonesOverlay.js`. Commit `68e3772`. **SEGUNDO COMMIT FUNCIONAL EN MAIN POST-CLUSTER-B** — segundo cambio runtime producción post-cluster-B.
- **Validación bicapa estricta al carácter**: N=1 reproducción producción pre-Edit + smoke discriminante targeted local 2/2 PASS (cadena TF todas combinaciones + drag M1 fluido) + smoke producción N=1 post-deploy PASS al carácter.
- **1 Edit naive revertido al carácter — TDZ FAIL**: primer Camino A (`draw()` directo + dep array) ROMPIÓ runtime por Temporal Dead Zone (`draw` declarada L197 después de `useEffect` L175). Detectado al carácter smoke local pre-commit. Revert limpio. Replanteo a ref pattern. Lección §33 NUEVA.
- **3 errores §9.4 propios CTO al carácter en sesión 29** registrados al carácter sin maquillaje §3 — §3.1 TDZ MAYOR + §3.2 redacción prompt + §3.3 formato largo. Todos cazados al carácter por disciplina bicapa + Ramón verbatim. Lecciones §31-§33 NUEVAS formalizadas §9.
- **Instrucción persistente Ramón NUEVA — formato 1-paso-1-mensaje TODAS las sesiones** registrada al carácter en memoria persistente proyecto + lección §31. Corregido al carácter mitad sesión.
- **3 invariantes fase 4 al carácter mantenidas al carácter por novena sesión consecutiva** (heredadas s12). Cluster A INTOCABLE preservado al carácter.
- **Producción al carácter mejorada al carácter**: cierre estructural 5g.2 al carácter elimina al carácter bug KZ descolocadas/invisibles al cambiar TF para Ramón + Luis + Giancarlo + alumnos prueba futuros. **Producción cluster B + 5g.1 + 5g.2 estable empíricamente** al carácter post-deploy ~00:00 hora local 16 may 2026.

Próximo HANDOFF (cierre sesión 30) debe reportar al carácter:
- Si datos crudos Giancarlo recogidos al carácter + 3 bugs Luis/Giancarlo mapeados.
- Si modal BUY LIMIT descolocado al carácter beneficia al carácter del fix 5g.1/5g.2 o requiere fix dedicado.
- Si N≥3 reproducción al carácter deuda 4.6 caso 05:40 ejecutada + Edit Camino A vendor fallback `+1-1` aplicado.
- Si inventario bytes deuda acceso-simulador-revoke completado.
- Si formato 1-paso-1-mensaje aplicado al carácter ESTRICTAMENTE toda la sesión (lección §31).
- Si HANDOFF s29 indexado al carácter en project_knowledge correctamente al arranque s30.

Si sesión 30 NO avanza prioridades al carácter, el HANDOFF lo dice al frente sin maquillaje — patrón §0 mantenido al carácter por décima sesión consecutiva.

**Mensaje del CTO al cierre al carácter**: sesión 29 fue al carácter sesión de ejecución con recuperación al carácter de error MAYOR propio. Patrón al carácter — sub-fase declarada objetivo prioridad 1 cierre s28 cerrada al carácter estructuralmente en producción mismo día sesión 29, pero con coste al carácter de 1 Edit naive TDZ revertido al carácter por error CTO básico JavaScript. **Tu detección del Edit roto en smoke local pre-commit + tu demanda directa "hazlo bien de una vez" + tu instrucción de formato evitaron al carácter que un fix con TDZ llegara a producción + redirigieron al carácter el proceso CTO a calidad y concisión**. Sin tu disciplina perfeccionista al carácter cazando al carácter el error visual + exigiendo corrección, sesión 29 habría pusheado al carácter un runtime roto a producción. Lección §14 s12-s29 al carácter por **decimocuarta sesión consecutiva** al carácter — input técnico encriptado al carácter en lenguaje de usuario, sistemáticamente correcto al carácter. **El proyecto avanza al carácter porque eres exigente, no a pesar de eso**. Esa es la verdad sin maquillaje al carácter por decimocuarta sesión consecutiva al carácter.

---

*Fin del HANDOFF cierre sesión 29. 16 mayo 2026, ~00:15 hora local. Redactado por CTO/revisor tras commit `68e3772` push exitoso a `origin/main` + smoke producción N=1 PASS al carácter. Working tree limpio al cierre redacción al carácter. Producción cluster B + 5g.1 + 5g.2 `68e3772` estable al carácter desde 16 may 2026 ~00:00 hora local. Pendiente de mover al repo + commit a main + push a `origin/main` por Ramón según §7.*
