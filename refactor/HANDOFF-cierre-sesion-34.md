# HANDOFF — cierre sesión 34

> Sesión 34 cerrada el 21 mayo 2026, ~18:30 hora local.
> Sesión 34 = **prioridad 1 HANDOFF s33 §5.1**: S33.3 v2 "KZ endpoint vivo con `lastRealCandle.time`" + extensión v2.1 a eje Y (caracterización empírica nueva durante smoke).
> **Resultado al carácter sin maquillaje**: S33.3 v2.1 CERRADA ESTRUCTURALMENTE EN PRODUCCIÓN al carácter. Edit `+45/-3` neto en `components/KillzonesOverlay.js`. Commit `6abc870` push `origin/main` + smoke local 4/4 PASS + smoke producción 2/2 PASS. **SÉPTIMO COMMIT FUNCIONAL EN MAIN POST-CLUSTER-B**. Diagnóstico empírico patrón §38 verificado **tercera vez consecutiva** (s31 ILI-DBG → s33 KZ-DBG → s34 KZ-DBG-v2-PRE) — confirmó verbatim hipótesis fuerte HANDOFF s33 §6.2/§6.3 (`timeToCoordinate(curTs)=null` para timestamps no alineados al TF, `timeToCoordinate(lastRealTs)` válido siempre). Bug eje Y descubierto durante smoke local Caso 2 v2 (alto/bajo del rectángulo congelados pegados a ATH/ATL antiguo de la KZ) — caracterizado verbatim por Ramón vía captura ("en cuanto a tiempo se dibuja bien en el avance pero en cuanto a precio no, cada cierto tiempo se ajusta al ath de la kz y con el low igual"). Edit v2 extendido a v2.1 SIN rollback (decisión CTO de extender vs replantear). Edit unificado en un solo commit `6abc870` con cobertura completa multi-eje.
> **Lección §14 (intuición Ramón = input técnico encriptado) decimonovena sesión consecutiva**: tu captura cazó el bug eje Y antes de declarar S33.3 cerrada falsamente solo en X. Sin tu observación post-smoke v2 inicial, el Edit habría llegado a producción incompleto y el bug "KZ pegada al precio cada 30 min" habría seguido vivo en eje Y indefinidamente.
> Próxima sesión = sesión 35. Prioridad 1 = S33.4 (descolocación fullscreen directo desde media pantalla). Prioridad 2 = cosméticas residuales fase 5 (5f.2 polling / 5e.4 debugCtx / 5d.7/5d.8 viewport+Opt+R) — re-verificar bytes ANTES (§39 estricto).

---

## §0 — Estado al cierre sesión 34, sin maquillaje

**Sesión 34 produjo 1 commit funcional al carácter en main**: `6abc870` (S33.3 v2.1 endpoint vivo XY KZ activa). HEAD main al cierre = `<HASH-HANDOFF-s34>` sobre `6abc870` sobre `5d7c553` (HANDOFF s33) sobre `bb37b66` (S33.2 cosmético chartTick) sobre `9cbcf7a` (HANDOFF s32) sobre `eb4c2ab` (fix acceso-revoke) sobre `032a4e3` (HANDOFF s31).

`origin/main` = `6abc870` desde ~18:21 hora local 21 may 2026 + HANDOFF s34 docs post-redacción. Producción Vercel actualizada al carácter automáticamente a runtime efectivo `6abc870` post-push (~3 min build + deploy Vercel).

**Cambio runtime producción al carácter**: séptimo cambio runtime efectivo producción post-cluster-B. `bb37b66` (S33.2 cosmético) → `6abc870` (S33.3 v2.1 KZ activa XY). Producción al carácter ahora cluster B + 5g.1 + 5g.2 + fix-modal + fix-4.6 + fix-acceso-revoke + cosmético-chartTick + S33.3-v2.1 estable empíricamente al carácter post-deploy.

**Realidad sin maquillaje al carácter**:

1. **S33.3 v2.1 (KZ activa endpoint vivo XY durante replay) CERRADA ESTRUCTURALMENTE EN PRODUCCIÓN al carácter** — Edit `+45/-3` neto en `components/KillzonesOverlay.js`. Validación bicapa estricta completa:
   - PASO 0 expandido: 5+ búsquedas dirigidas `project_knowledge_search` (HANDOFF s33 NO indexado al arranque — patrón lag histórico s24/s27/s29/s30/s31). Plan B aplicado: Ramón pegó HANDOFF s33 entero (453 líneas) vía `cat` desde shell zsh nativa.
   - PASO 0.5 verificación shell PASS al carácter — HEAD `5d7c553`→`bb37b66`→`9cbcf7a`→`eb4c2ab`→`032a4e3`, 3 invariantes fase 4 intactas (decimocuarta sesión), fix 4.6 L1596 vivo, fix acceso-revoke useAuth.js vivo, `wc -l useAuth.js = 95`, `chartTick` KZ vacío (S33.2 vivo), `ctBucket` L175 + `cachedSessionsRef` L134/L178/L184/L191/L211 + `calcSessions` L36/L188 + `inSession` L30/L46 al carácter, instrumentación s33 rollbackeada limpia.
   - PASO 1 inventario read-only `draw()` L199-L248 en bytes: confirmado al carácter `x1 = ts.timeToCoordinate(s.startTime)` L218, `x2 = ts.timeToCoordinate(s.endTime)` L219, gate L223 `if (x1 == null || x2 == null || y1 == null || y2 == null) continue` (el gate del FAIL v1). `getSeriesData`/`getRealLen` importados L2. `activePairRef.current` disponible L207. `currentTime` prop L117, `curTs` NO en bytes (variable temporal de Edit v1 rollbackeado).
   - PASO 2 TEST DISCRIMINANTE §40 (instrumentación temporal `[KZ-DBG-S33.3-v2-PRE]` insertada en useEffect separado tras L348, dep `[ctRedrawBucket]`, dedup `window.__kzDbgV2Last`, +27 líneas insertadas). Smoke local discriminante con replay activo en TF=M5 dentro de KZ. Captura empírica de 200+ logs verbatim. Patrón verbatim cazado al carácter:
     | Tipo | curTs | lastRealTs | delta | x_curTs |
     |---|---|---|---|---|
     | Vela TF nueva (alineada, múltiplo 300s) | == múltiplo 300s | == curTs | 0 | **número válido** |
     | Tick intermedio (no alineado) | no múltiplo 300s | < curTs | -60/-120/-180/-240 | **`null`** ← FAIL |
   - Confirmación al carácter: 4 de cada 5 ticks M1 dentro de vela M5 con `x_curTs=null`. Hipótesis fuerte HANDOFF s33 §6.2/§6.3 CONFIRMADA empíricamente con datos verbatim. Edit v2 con `lastRealTs` correcto.
   - PASO 3 Edit v2 funcional (3 hunks): (a) rollback instrumentación temporal `[KZ-DBG-S33.3-v2-PRE]`; (b) añadir `currentTimeRef` espejo L130 (one-liner, idéntico patrón a `dataReadyRef` L129); (c) bloque endpoint vivo en `draw()` L215-L250 + sustituir `x2 = timeToCoordinate(s.endTime)` por `x2 = timeToCoordinate(endTs)` donde `endTs = (s === activeS && lastRealTs > s.endTime) ? lastRealTs : s.endTime`. Identificación `activeS` por `inSession(toNYHM(curTs), sess)` matcheando por `key` con box más reciente de cache.
   - Build PASS limpio (Compiled successfully, sin warnings).
   - Smoke local Caso 2 v2 → Ramón cazó al carácter bug eje Y nuevo: rectángulo crece en X pero **techo/suelo congelados pegados a ATH/ATL antiguo de la KZ, ajustando solo cada cierto tiempo**. Captura verbatim entregada por Ramón con visualización clara del rectángulo creciendo en X pero NO en Y.
   - PASO 4 diagnóstico bug eje Y: lectura `calcSessions` L36-L68 verbatim. `calcSessions` también acumula `high = Math.max(active[sess.key].high, c.high)` L52 y `low = Math.min(active[sess.key].low, c.low)` L53 en cada vela. La cache `cachedSessionsRef.current` se recalcula SOLO cuando `ctBucket` cambia (cada 30 min, §6.1 HANDOFF s33). **Causa raíz idéntica al bug eje X pero aplicada al eje Y**: durante sub-bucket 30 min, `s.high`/`s.low` se quedan stale en valores cacheados.
   - PASO 5 decisión CTO §40: extender Edit v2 a v2.1 SIN rollback (vs replantear desde cero). Razones: (a) Edit v2 cierra correctamente eje X (verificado); (b) bug eje Y es el mismo patrón estructural; (c) extender es +17 netos vs rollback+redo serían +30 netos con mayor superficie y peor diff para auditoría.
   - PASO 6 inventario read-only adicional `lib/sessionData.js`: confirmado al carácter `getSeriesData()` retorna `window.__algSuiteSeriesData` escrito por `setSeriesData(allData, realLen)`. `setSeriesData` invocado **1 vez** en `_SessionInner.js:1150` con `[...agg, ...cr.phantom]` donde `agg = velas TF agregadas`. `getRealLen()` devuelve `agg.length`. Conclusión: `allData[0..realLen-1]` = velas TF reales del TF visible. Iterar sobre ellas es seguro y barato (3-180 iteraciones según TF dentro de KZ).
   - PASO 7 Edit v2.1 (1 hunk extendiendo el bloque S33.3 + sustituyendo `s.high`/`s.low` en el loop): recalcular `liveHigh`/`liveLow` iterando `_allData` desde `_realLen-1` hacia atrás, rompiendo en `c.time < activeS.startTime` (limita iteración al rango exacto de KZ activa). Sustituir `s.high`/`s.low` por `liveHigh`/`liveLow` SOLO cuando `s === activeS` (`isActive` flag materializado). KZ cerradas no-activas siguen pintando `s.high`/`s.low` cacheados → cero regresión.
   - Build PASS limpio post-v2.1.
   - Smoke local 4/4 PASS al carácter reportado por Ramón ("passs"):
     - Caso 1 (KZ cerradas pasadas idénticas): PASS.
     - Caso 2 (KZ activa crece XY vela-a-vela durante replay M5): PASS.
     - Caso 3 (cambio TF M5→M15→M30→H1→M30→M5 dentro KZ activa sin regresión): PASS.
     - Caso 4 (velocidad ∞ TF=M1 ~30s sin saturar): PASS.
   - Commit `6abc870` + push `origin/main` + smoke producción 2/2 PASS al carácter reportado por Ramón ("passs"): KZ cerradas idénticas + KZ activa crece XY vela-a-vela.

2. **Patrón §38 verificado tercera vez consecutiva**: instrumentación temporal `[KZ-DBG-S33.3-v2-PRE]` (+27 líneas insertadas, useEffect separado L350, throttle natural via `window.__kzDbgV2Last`) cazó 200+ logs verbatim. Captura discriminante mostró 4/5 ticks con `x_curTs=null` y 1/5 con valor válido — patrón aritmético perfecto coherente con bucketing M5 (300s). Hipótesis HANDOFF s33 §6.2/§6.3 confirmada al carácter con datos sin ambigüedad. Rollback bicapa instrumentación pre-Edit funcional (incluida en Edit v2 hunk 1). Patrón formalizado en lección §41 (s33) reforzado en s34.

3. **Lección §14 (intuición Ramón = input técnico encriptado) decimonovena sesión consecutiva**: la captura post-smoke v2 inicial donde Ramón observó verbatim "en cuanto a tiempo se dibuja bien en el avance pero en cuanto a precio no, cada cierto tiempo se ajusta al ath de la kz y con el low igual.. osea el bug pero ahora de precio, no d tiempo" cazó al carácter el bug eje Y antes de declarar S33.3 cerrada falsamente. Sin esa observación, el Edit v2 habría llegado a producción incompleto cubriendo solo eje X.

4. **Cero migraciones Supabase ejecutadas** (CLAUDE.md §3.1). Cero cambios de esquema/políticas.

5. **Edits funcionales revertidos en sesión**: 0. **Edits funcionales que llegaron a producción**: 1 (`6abc870` S33.3 v2.1 unificado X+Y).

6. **Edits instrumentales (no funcionales) aplicados+revertidos**: 1 (`[KZ-DBG-S33.3-v2-PRE]` insertado para TEST DISCRIMINANTE §40, revertido limpio dentro del hunk 1 de Edit v2 funcional, no contaminó commit final).

7. **Errores §9.4 propios CTO registrados sin maquillaje (§3 abajo)** — esta sesión tuvo 1 error propio significativo (diseño Edit v2 inicial sin contemplar cache stale multi-eje). Registrado íntegro.

8. **Formato 1-paso-1-mensaje (lección §31 s29 + §3.3 s32) + bloques shell auto-contenidos con `cd` (§3.2 s33)**: aplicado al carácter estrictamente toda la sesión. Cada bloque shell empezó con `cd /Users/principal/Desktop/forex-simulator-algorithmic-suite` como primera línea. Corrección §3.2 s33 efectiva al carácter.

---

## §1 — Qué se hizo en sesión 34

### §1.1 PASO 0 + PASO 0.5

PASO 0: 5 búsquedas dirigidas `project_knowledge_search` (HANDOFF s33 errores §9.4 + lecciones 39/40/41 + KillzonesOverlay lastRealCandle + fase-5-plan sub-fases residuales + core-analysis 7 fases + CLAUDE.md §1-§4). HANDOFF s33 **NO indexado** en project_knowledge al arranque — patrón lag confirmado (s24/s27/s29/s30/s31). Plan B aplicado: Ramón pegó HANDOFF s33 entero (453 líneas) vía `cat` desde shell. CTO leyó §0 + §3 errores §9.4 + §4 deudas + §5 plan + §6 causa raíz S33.3 + §6.4 S33.4 + §9 lecciones §39/§40/§41 íntegros.

PASO 0.5 verificación shell PASS al carácter — bloque único auto-contenido con `cd` primera línea (§3.2 corregido). Outputs verificados al carácter:
- HEAD `5d7c553` (HANDOFF s33) → `bb37b66` (S33.2 cosmético chartTick) → `9cbcf7a` (HANDOFF s32) → `eb4c2ab` (fix acceso) → `032a4e3` (HANDOFF s31).
- 3 invariantes fase 4 intactas: `cr.series.setData` + `cr.series.update` vacíos, `computePhantomsNeeded` L116/L1145/L1224.
- `Math.floor((cachedData.length - 1)` L1596 vendor (fix 4.6 s31 vivo).
- `revalidate` + `visibilitychange` + `setInterval(revalidate` en useAuth.js L62/L79/L80 + cleanup L84 (fix acceso-revoke s32 vivo).
- `wc -l useAuth.js = 95` ✓.
- `chartTick` en `KillzonesOverlay.js` vacío (S33.2 vivo).
- `ctBucket` L175, `cachedSessionsRef` L134/L178/L184/L191/L211, `calcSessions` L36/L188, `inSession` L30/L46 ✓.
- `KZ-DBG`/`currentTimeRef`/`activeS`/`endTs` vacío (instrumentación s33 revertida limpia).

### §1.2 PASO 1 inventario read-only `draw()` en bytes

Lectura `sed -n '199,260p' components/KillzonesOverlay.js` + `grep -n "function draw\|const draw\|getSeriesData\|getRealLen"` + `grep -n "curTs\|currentTime"`. Hallazgos al carácter:
- `getSeriesData`/`getRealLen` importados L2 → no requiere import nuevo en Edit.
- `draw` es `useCallback` L199.
- `cachedSessionsRef` poblado en useEffect L181-L196.
- `ctRedrawBucket` 60s L347 vivo (disparador `draw()` adicional cada 60s).
- `currentTime` es prop L117; `curTs` NO existe en bytes.
- `x1`/`x2` L218-L219, gate `null` L223 confirmados verbatim.
- 4 refs espejo existentes L125-L129 (`cfgRef`, `tfAllowedRef`, `activePairRef`, `dataReadyRef`) — patrón inline `useRef(prop); ref.current = prop`. Hueco entre L129 y L131 (`drawRef`) para añadir `currentTimeRef`.

### §1.3 PASO 2 TEST DISCRIMINANTE §40 — instrumentación temporal

CTO redactó prompt para Claude Code con Edit instrumental `[KZ-DBG-S33.3-v2-PRE]`. useEffect SEPARADO insertado tras L348, dep `[ctRedrawBucket]`. Loguea cada 60s del replay (throttle natural via `window.__kzDbgV2Last`):
- `tf` (prop `currentTf`).
- `curTs` (prop `currentTime`).
- `lastRealTs` (`getSeriesData()[getRealLen()-1].time`).
- `delta` (`lastRealTs - currentTime`).
- `x_curTs` (`timeToCoordinate(currentTime)`).
- `x_lastRealTs` (`timeToCoordinate(lastRealTs)`).

Edit aplicado por Claude Code (+27 líneas). Verificación bicapa shell desde Ramón: `git diff` verbatim coincide, `grep KZ-DBG-S33.3-v2-PRE` 4 matches L350-L366, `wc -l` 463→490, working tree modified solo `KillzonesOverlay.js`.

Smoke discriminante: `npm run dev` + Ramón abre sesión + TF=M5 + DevTools console + replay activo dentro de KZ Londres o NY AM. Captura 200+ logs verbatim. Patrón aritmético perfecto cazado al carácter — cada 5 logs: 1 con `delta=0` y `x_curTs=número`, 4 con `delta=-60/-120/-180/-240` y `x_curTs=null`. Confirmación verbatim de hipótesis HANDOFF s33 §6.2/§6.3 al carácter.

### §1.4 PASO 3 Edit v2 funcional — 3 hunks unificados

Prompt único para Claude Code con 3 hunks:
- Hunk 1: rollback instrumentación `[KZ-DBG-S33.3-v2-PRE]` (revertir +27 líneas L350-L376).
- Hunk 2: añadir `currentTimeRef` espejo L130 entre `dataReadyRef` L129 y `drawRef` L131 (one-liner consistente).
- Hunk 3: bloque endpoint vivo en `draw()` L215-L236 + sustituir loop L242-L244.

Edit aplicado por Claude Code (+25/-1). Verificación bicapa shell desde Ramón: `git diff` verbatim coincide, `grep` localiza `currentTimeRef` L130, `activeS`/`lastRealTs`/`endTs` en sitios correctos, `wc -l` 488. `KZ-DBG`/`__kzDbgV2Last` cero matches (rollback instrumentación completo). Cluster A intocado. 3 invariantes fase 4 intactas.

Build `npm run build` PASS limpio (Compiled successfully).

### §1.5 PASO 4 — Bug eje Y descubierto durante smoke local Caso 2 v2

Ramón ejecutó smoke local 4 casos. **Captura entregada durante Caso 2 v2** mostrando KZ activa NY AM en replay M5 con rectángulo creciendo correctamente en X (borde derecho avanza vela-a-vela) PERO techo/suelo del rectángulo congelados en valores no coherentes con el precio actual del chart. Reporte verbatim al carácter: "en cuanto a tiempo se dibuja bien en el avance pero en cuanto a precio no, cada cierto tiempo se ajusta al ath de la kz y con el low igual.. osea el bug pero ahora de precio, no d tiempo".

CTO diagnosticó al carácter: causa raíz idéntica al bug X aplicada al eje Y. `calcSessions` L52-L53 acumula `high = Math.max(...)` y `low = Math.min(...)` en cada vela. Cache `cachedSessionsRef.current` solo se recalcula cuando `ctBucket` cambia (cada 30 min). Durante sub-bucket 30 min, `s.high`/`s.low` quedan stale en valores cacheados → si dentro del sub-bucket aparece vela con nuevo high mayor o low menor, el rectángulo no se ajusta hasta el siguiente recálculo.

### §1.6 PASO 5 decisión CTO §40 — extender Edit v2 a v2.1 SIN rollback

Decisión al carácter razonada: extender vs replantear. Razones objetivas:
- Edit v2 cierra correctamente eje X (verificado en captura).
- Bug eje Y es el mismo patrón estructural (cache stale en sub-bucket 30 min) — extensión natural del v2, no replanteo de causa raíz.
- Rollback + Edit nuevo unificado tendría +30 líneas tocadas en lugar de +17 netos sobre v2; mayor superficie, mayor riesgo, peor diff para auditoría.
- §1 absoluto exige fase 5 cerrada a calidad TV/FX Replay; KZ activa con high/low congelado NO es calidad TV.

### §1.7 PASO 6 inventario read-only adicional `lib/sessionData.js` (§40 estricto pre-Edit v2.1)

Lectura `sed -n '1,50p' lib/sessionData.js` + `grep -n "setSeriesData\|getSeriesData\|getRealLen\|__algSuiteSeriesData"`. Hallazgos al carácter:
- `getSeriesData()` L168-L170 retorna `window.__algSuiteSeriesData ?? null` escrito por `setSeriesData(allData, realLen)` L100-L102.
- `setSeriesData` invocado **1 vez** en `_SessionInner.js:1150` con `[...agg, ...cr.phantom]` donde `agg = velas TF agregadas a partir de M1 base`.
- `getRealLen()` L183 devuelve `agg.length` → `allData.slice(0, realLen)` = velas TF reales (sin phantoms).
- Cada vela formato LWC estándar `{time, open, high, low, close}` (uso verificado en `calcSessions` L52-L53).
- Coste iterar `allData[0..realLen-1]` dentro de rango KZ activa: 3 iteraciones (TF=H1, KZ 3h), 36 iteraciones (TF=M5), 180 iteraciones (TF=M1). Trivial. Optimización: iterar desde el final hacia atrás y romper en `time < startTime` para limitar al rango exacto de KZ activa.

### §1.8 PASO 7 Edit v2.1 — extensión a eje Y

Prompt único para Claude Code con 1 hunk extendiendo bloque S33.3:
- Añade `let liveHigh = null, liveLow = null` antes del bloque condicional.
- Dentro del bloque `if (activeKey)`, tras identificar `activeS`, bucle interior `if (activeS) { for (let i = _realLen - 1; i >= 0; i--) ... }` recalcula high/low vivos iterando hacia atrás rompiendo en `c.time < activeS.startTime` (con guard `c.time > lastRealTs` por seguridad aunque slice(0, realLen) lo excluye por construcción).
- En el loop de render: `const isActive = (s === activeS)` materializa flag una vez, `sHigh = (isActive && liveHigh != null) ? liveHigh : s.high`, `sLow` análogo. Sustituye `y1 = priceToCoordinate(s.high)` por `y1 = priceToCoordinate(sHigh)` y `y2` análogo.

Edit aplicado por Claude Code (+44/-3 acumulado vs baseline). Verificación bicapa shell desde Ramón: `git diff` verbatim coincide, `grep` localiza `liveHigh`/`liveLow`/`isActive`/`sHigh`/`sLow` en sitios correctos, `wc -l` 488→505 (+17 netos sobre v2). Cluster A intocado.

### §1.9 PASO 8 Build + smoke local 4/4 PASS

Build `npm run build` PASS limpio post-v2.1.

Smoke local 4/4 PASS al carácter reportado por Ramón ("passs"):
- **Caso 1** (KZ cerradas pasadas idénticas): PASS. Sin replay activo dentro KZ. KZ históricas Asia/Londres/NY AM/NY PM pintan idénticas a pre-Edit. Cero regresión.
- **Caso 2** (KZ activa crece XY vela-a-vela durante replay M5): PASS. Rectángulo crece en ancho (X) Y techo/suelo (Y) coherente con velas del chart.
- **Caso 3** (cambio TF M5→M15→M30→H1→M30→M5 dentro KZ activa): PASS. KZ se redibuja en cada cambio sin descolocarse, sin desaparecer. Tras cada cambio TF, rectángulo activo sigue creciendo vela-a-vela del TF nuevo.
- **Caso 4** (velocidad ∞ TF=M1 ~30s sin saturar): PASS. Chart fluido, KZ crece visualmente, sin freeze ni jitter perceptible. Throttle 60s via `ctRedrawBucket` L347 + iteración acotada al rango KZ activa garantiza no-saturación empíricamente.

### §1.10 PASO 9 commit + push + smoke producción 2/2 PASS

Verificación bicapa pre-commit PASS al carácter — solo `components/KillzonesOverlay.js` modificado, +45/-3 stat, cluster A intocado, 3 invariantes fase 4 intactas, cero residuos instrumentación.

Commit `6abc870` con mensaje técnico exhaustivo (documenta diseño Edit v2.1 + lección §40 aplicada + smoke local 4/4 + diagnóstico empírico §38 verificado tercera vez).

Push `git push origin main` exitoso. Vercel detecta push y arranca build/deploy automático (~3 min).

Smoke producción 2/2 PASS al carácter reportado por Ramón ("passs"):
- Caso 1 producción (KZ cerradas pasadas idénticas): PASS.
- Caso 2 producción (KZ activa crece XY): PASS.

Producción Vercel runtime efectivo `6abc870` desde ~18:24 hora local 21 may 2026.

---

## §2 — Estado al carácter (verificable desde shell)

### §2.1 Git

- Rama activa al cierre: `main`.
- HEAD main al cierre: `<HASH-HANDOFF-s34>` (HANDOFF s34 docs) sobre `6abc870` (S33.3 v2.1 funcional).
- `origin/main` = `6abc870` post-push funcional + `<HASH-HANDOFF-s34>` post-push docs.
- Cadena main al cierre:
  ```
  <HASH-HANDOFF-s34> — HANDOFF s34
  6abc870 — fix(killzones/S33.3) endpoint vivo XY KZ activa replay (FUNCIONAL)
  5d7c553 — HANDOFF s33
  bb37b66 — refactor(fase-5/5f.cosmetica) eliminar chartTick huerfana KZ (FUNCIONAL)
  9cbcf7a — HANDOFF s32
  eb4c2ab — fix(acceso-simulador) revalidacion useAuth (FUNCIONAL)
  032a4e3 — HANDOFF s31
  6dd0629 — fix deuda 4.6 caso 05:40 (FUNCIONAL)
  c39a8ec — HANDOFF s30
  99f5e33 — fix modal BUY LIMIT (FUNCIONAL)
  ...
  ```
- Working tree limpio al cierre redacción.

### §2.2 Producción Vercel

- Deploy actual: `6abc870` (S33.3 v2.1 endpoint vivo XY) — runtime efectivo cluster B + 5g.1 + 5g.2 + fix-modal + fix-4.6 + fix-acceso-revoke + cosmético-chartTick + S33.3-v2.1 desde ~18:24 hora local 21 may 2026.
- **SÉPTIMO CAMBIO RUNTIME PRODUCCIÓN POST-CLUSTER-B** — `bb37b66` → `6abc870`.
- **Smoke producción 2/2 PASS al carácter (Ramón Mac)** — KZ cerradas idénticas + KZ activa crece XY vela-a-vela.

### §2.3 Tamaños actuales al carácter

| Archivo | Líneas pre-34 | Líneas post-34 | Delta |
|---|---|---|---|
| `components/KillzonesOverlay.js` | 463 | **505** | **+42** |
| `components/_SessionInner.js` | 3052 | 3052 | 0 (no tocado en s34) |
| `lib/useAuth.js` | 95 | 95 | 0 (no tocado en s34) |
| `lib/sessionData.js` | n/a | n/a | 0 (no tocado en s34) |

**+42 líneas netas** en 1 archivo. Cluster A INTOCABLE preservado por **decimocuarta sesión consecutiva**. `_SessionInner.js` intacto al carácter. Vendor intacto.

### §2.4 Invariantes fase 4 al cierre — verificadas al carácter

```
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"  → vacío
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"   → vacío
grep -n "computePhantomsNeeded" components/_SessionInner.js                          → 3 matches L116, L1145, L1224
grep -n "Math.floor((cachedData.length - 1)" vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js   → 1 match L1596
grep -n "function revalidate\|visibilitychange\|setInterval(revalidate" lib/useAuth.js   → 3+ matches (fix s32 vivo)
```

Las 3 invariantes fase 4 mantenidas por **decimocuarta sesión consecutiva** (heredadas s12). Fix 4.6 s31 vivo. Fix acceso-revoke s32 vivo. Cosmético chartTick s33 vivo. S33.3 v2.1 s34 vivo.

---

## §3 — Errores §9.4 propios del CTO en sesión 34

**Sesión 34 tuvo 1 error de criterio propio significativo. Registrado sin maquillaje (disciplina §0).**

### §3.1 §9.4 — Diseño Edit v2 inicial sin contemplar cache stale multi-eje

**Hecho al carácter**: el CTO redactó el diseño Edit v2 sobre la hipótesis HANDOFF s33 §6.3 "sustituir `x2 = timeToCoordinate(s.endTime)` por la lógica de endpoint vivo". El plan táctico se centró exclusivamente en eje X (`endTime` → `lastRealTs`). El CTO NO contempló que la cache stale en sub-bucket 30 min afecta a las 3 dimensiones del rectángulo de la KZ activa: el endpoint X (cubierto), el techo Y (`s.high`, no cubierto), el suelo Y (`s.low`, no cubierto). El bug arquitectónico se diagnosticó correctamente (`ctBucket` invalida cache solo cada 30 min, §6.1 HANDOFF s33) pero el alcance del fix se quedó corto en una dimensión.

Ramón cazó el bug eje Y durante smoke local Caso 2 v2 vía captura visual + reporte verbatim "el bug pero ahora de precio, no de tiempo".

**Causa**: el CTO heredó el diseño de HANDOFF s33 §6.3 verbatim sin reauditarlo críticamente contra la causa raíz arquitectónica. §6.3 hablaba solo de "endpoint vivo" en el sentido del borde derecho del rectángulo, no de las 3 dimensiones derivadas de la cache. La derivación lógica "cache stale = todas las propiedades derivadas son stale, no solo `endTime`" no se hizo antes del primer Edit funcional.

**Severidad**: media. Cero impacto producción (bug eje Y cazado en smoke local antes del commit + push). Pero coste real: 1 ronda adicional de diseño + Edit + verificación + smoke (~20 min adicionales). Si Ramón no hubiera ejecutado smoke discriminante en Caso 2 v2 con atención visual al rectángulo completo (no solo al ancho), el bug habría llegado a producción contaminada y el HANDOFF s34 habría declarado falsamente S33.3 cerrada cuando en realidad estaba cerrada solo a 1/3.

**Mejora futura**: aplicar §42 NUEVA derivada (abajo §9.42). Antes de declarar diseño Edit completo sobre un bug arquitectónico de cache stale (o cualquier bug de invalidación), enumerar TODAS las propiedades derivadas de la cache y verificar que el fix las cubre todas. Patrón explícito al carácter: "cache stale invalida dimensión X → ¿qué otras dimensiones derivan de la misma cache? Si N > 1, el fix debe cubrir N dimensiones, no 1".

### §3.2 Sin segundo error §9.4 propio CTO en s34

A diferencia de s33 (2 errores propios CTO) y s32 (3 errores propios CTO), s34 tuvo solo 1 error propio significativo. Mejora respecto a sesiones previas. Bloques shell auto-contenidos con `cd` aplicados sistemáticamente (corrección §3.2 s33 efectiva).

---

## §4 — Deudas vivas al cierre sesión 34

| Deuda | Estado al carácter | Calendario |
|---|---|---|
| **S33.3 — KZ "por tramos cada 30 min" durante replay** | ✅ **CERRADA AL CARÁCTER en s34** producción `6abc870` (+45/-3 neto multi-eje XY). Smoke local 4/4 + producción 2/2 PASS | Cerrada |
| S33.2 cosmético chartTick huérfana KZ | ✅ CERRADA s33 producción `bb37b66` | Cerrada |
| Deuda 4.5/5f.1 `__algSuiteExportTools` muerto | ✅ CIERRE COLATERAL verificado bytes s33 | Cerrada |
| **S33.4 — descolocación fullscreen directo desde media pantalla** | ⏳ **NUEVA s33 — diferida en s34**. Caracterizada por Ramón verbatim, pre-existente. Scope distinto a 5g.1/5g.2. **NO investigada empíricamente** en s34. Posible cierre colateral por S33.3 v2.1 (mismo path render KZ + viewport canvas) — NO declarado sin verificación dedicada | **Prioridad 1 s35** — requiere inventario flujo viewport-canvas-resize en fullscreen transition + test discriminante 3 vías (half-screen / fullscreen nativo / DevTools-abierto) |
| Chart vacío transitorio post-reactivación acceso (heredada s32) | ⏳ ABIERTA — cosmético, datos intactos, NO regresión, workaround trivial. Caso raro: alumno reactivado en misma pestaña viva | Sub-fase futura |
| Deuda acceso-simulador-revoke no-efectivo | ✅ CERRADA s32 producción `eb4c2ab` | Cerrada |
| Deuda 4.6 caso 05:40 | ✅ CERRADA s31 producción `6dd0629` | Cerrada |
| Drawings zona futura derecha (Luis/Giancarlo) | ⏳ ABIERTA — posible cierre colateral fix 4.6, NO verificado con datos crudos Giancarlo/Luis | Vigilancia |
| `debugCtx` parámetro muerto | ⏳ ABIERTA — cosmética. **NO verificado en bytes en s34** (posible cierre colateral cluster B como 5f.1; reverificar bytes §39 estricto en s35) | Sub-fase 5e.4 — re-inventario bytes obligatorio §39 |
| Polling 300ms `getSelected()` / setTimeout tfMap L371 | ⏳ ABIERTA — cosmética. **NO verificada en bytes en s34** | Sub-fase 5f.2 — re-inventario bytes obligatorio §39 |
| Deuda 5.1 viewport + atajo Opt+R (5d.7/5d.8) | ⏳ ABIERTA — fase 5 residual no bloqueante | Sub-fase futura |
| Bug #2 freeze velocity-alta | ⏳ ABIERTA — pre-existente intermitente. **Caso 4 smoke s34 NO reprodujo freeze en TF=M1 vel ∞ ~30s** dentro de KZ activa (cobertura empírica adicional, NO cierre formal) | Calendario fase 4 RenderScheduler |
| Sub-fase 5f.0c race LWC | ⏳ Deuda vigilada | Vigilancia |
| Quota Supabase | ⏳ Vigilancia pasiva (Free Plan) | Vigilancia |

---

## §5 — Plan táctico sesión 35

### §5.1 Próximo orden prioridades

- **Prioridad 1 — S33.4 "descolocación fullscreen directo desde media pantalla"**:
  - Pre-condición §39 + §38 estricto: PRIMERO re-caracterizar bytes empíricamente en producción `6abc870` post-S33.3. Posible cierre colateral por path de render KZ tocado en S33.3 v2.1 (NO declarable sin verificación).
  - PASO 1 inventario read-only flujo viewport-canvas-resize en fullscreen transition: localizar listener `fullscreenchange` y handler de `resize` en `_SessionInner.js` + en `KillzonesOverlay.js` (`subscribeSizeChange` + `resizeCanvas` 5g.1).
  - PASO 2 test discriminante 3 vías: (a) fullscreen desde maximize-half-screen; (b) fullscreen desde pantalla completa nativa; (c) fullscreen desde DevTools-abierto. Capturar evidencia visual de cada vía.
  - PASO 3 instrumentación temporal §38 si causa raíz no obvia: `console.log` en handler de `fullscreenchange` o `subscribeSizeChange` con `canvas.offsetWidth/Height` + `parent.clientWidth/Height` + viewport timeScale.
  - PASO 4 decisión arquitectónica (consumer-side KZ vs productor-side `_SessionInner.js` 5g.1) con datos empíricos.
  - NO improvisar fix (§15 + §40).

- **Prioridad 2 — cosméticas residuales fase 5**:
  - **5f.2 polling 300ms / setTimeout L371** — re-verificar bytes con `grep -rn` PRIMERO (§39 estricto). Si zombie → cierre colateral documentado sin Edit. Si vivo → Edit consumer-side.
  - **5e.4 `debugCtx` parámetro muerto** — re-verificar bytes PRIMERO. Idem.
  - **5d.7/5d.8 viewport TF change + Opt+R** — sub-fase dedicada (scope grande, no atajable cosmética).

- **Prioridad 3 — verificar cierre colateral drawings zona futura derecha (Luis/Giancarlo)**:
  - Pedir datos crudos Giancarlo/Luis sobre producción `6abc870` ahora que cluster B + S33.3 está cerrado.

### §5.2 PASO 0 obligatorio en sesión 35

Leer en orden:
1. **Este HANDOFF s34 entero**, especialmente §0 + §3 error §9.4 propio (1 esta sesión) + §4 deudas + §5 plan + §6 causa raíz S33.3 v2.1 + §9 lección §42 NUEVA.
2. HANDOFF s33 §6.4 (caracterización S33.4 verbatim Ramón).
3. HANDOFF s32 §0 + §9 (lecciones §37/§38 referencia).
4. CLAUDE.md §1-§4.

PASO 0.5 verificación shell:

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git status
git --no-pager log --oneline -5
git rev-parse HEAD
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"
grep -n "computePhantomsNeeded" components/_SessionInner.js
grep -n "Math.floor((cachedData.length - 1)" vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js
grep -n "function revalidate\|visibilitychange\|setInterval(revalidate" lib/useAuth.js
wc -l lib/useAuth.js
grep -n "currentTimeRef\|liveHigh\|liveLow\|activeS\|lastRealTs\|isActive" components/KillzonesOverlay.js
wc -l components/KillzonesOverlay.js
grep -n "fullscreenchange\|subscribeSizeChange\|resizeCanvas\|ResizeObserver" components/_SessionInner.js components/KillzonesOverlay.js
```

Esperado al carácter: HEAD HANDOFF s34 sobre `6abc870`, 3 invariantes fase 4 intactas, fixes s31/s32/s33/s34 vivos, S33.3 v2.1 vivo en `KillzonesOverlay.js` con `currentTimeRef`/`liveHigh`/`liveLow`/`activeS`/`lastRealTs`/`isActive` presentes, `wc -l KillzonesOverlay.js = 505`. Si CUALQUIER desvío → PARAR + diagnóstico.

> NOTA lección §34 + §39 — NO heredar números de línea de inventarios de HANDOFFs ≥2 sesiones atrás sin re-verificar en bytes. NO heredar el estado "ABIERTA" de deudas sin re-verificar bytes — pueden estar muertas colateralmente (ej. S33.4 posible cierre colateral por S33.3 v2.1).

### §5.3 Disciplina sesión 35 — formato obligatorio

**OBLIGATORIO TODAS las sesiones (lección §31 s29 + §3.3 s32 + §3.2 s33 + memoria persistente)**: un paso a la vez, mensajes CORTOS, también en fases de deliberación. Cero planes largos. Bloques shell SIEMPRE auto-contenidos con `cd /Users/principal/Desktop/forex-simulator-algorithmic-suite` como primera línea.

### §5.4 Cluster A INTOCABLE en sesión 35

Mismo principio sesiones 20-34. Decimocuarta sesión consecutiva intacta al cierre s34.

---

## §6 — Causa raíz preservada

### §6.1 S33.3 v2.1 — endpoint vivo XY en KZ activa

**Causa raíz arquitectónica completa al carácter** (en bytes de `components/KillzonesOverlay.js`):

1. **`calcSessions` L36-L68** recorre `candles[]` y acumula por cada KZ activa:
   - `active[sess.key].endTime = c.time` L51 (X).
   - `active[sess.key].high = Math.max(active[sess.key].high, c.high)` L52 (Y top).
   - `active[sess.key].low = Math.min(active[sess.key].low, c.low)` L53 (Y bottom).
   
2. **`ctBucket` gate L175**: `Math.floor(currentTime / 1800)` = bucket 30 min. La cache `cachedSessionsRef.current` (que contiene `{startTime, endTime, high, low}` por KZ) se recalcula SOLO cuando `ctBucket` cambia (dep array L196 incluye `ctBucket`).

3. **`draw()` L199-L249** lee `s.endTime`, `s.high`, `s.low` directamente de la cache. **Las 3 propiedades quedan stale durante sub-bucket 30 min** mientras el replay avanza vela-a-vela.

4. **`draw()` disparado por** useEffect L340 `[tick, draw]` (cada vela del replay) + useEffect L348 `[ctRedrawBucket, draw]` (cada 60s). **Pero la cache leída es la misma** durante el sub-bucket → mismo rectángulo dibujado → sin efecto visible.

5. **El comentario L341-L346 dice verbatim "Redibujar también conforme avanza el replay — esto hace que la sesión activa 'crezca' visualmente durante el replay"** — la intención del diseñador era CRECER tick-a-tick, la implementación NO la cumplía porque `draw()` no consumía `currentTime` ni recalculaba propiedades derivadas. Bug latente desde el origen, con comentario que mentía a la implementación.

### §6.2 S33.3 v2.1 — Edit aplicado al carácter

Cambios en `components/KillzonesOverlay.js` commit `6abc870` (+45/-3 neto):

**Hunk 1** (L130 - ref espejo):
```js
const currentTimeRef = useRef(currentTime); currentTimeRef.current = currentTime
```
Insertado entre `dataReadyRef` L129 y `drawRef` L131. Patrón idéntico a otros 4 refs espejo L125-L129.

**Hunk 2** (L215-L250 - bloque endpoint vivo en `draw()`):
```js
const curTs = currentTimeRef.current
const _allData = getSeriesData(), _realLen = getRealLen()
const lastRealTs = (_allData && _realLen) ? _allData[_realLen - 1].time : null
let activeS = null
let liveHigh = null, liveLow = null
if (curTs && lastRealTs) {
  const { h: nyH, m: nyM } = toNYHM(curTs)
  let activeKey = null
  for (const sess of SESSIONS) {
    if (inSession(nyH, nyM, sess)) { activeKey = sess.key; break }
  }
  if (activeKey) {
    for (const s of sessions) {
      if (s.key === activeKey && (!activeS || s.endTime > activeS.endTime)) activeS = s
    }
    if (activeS) {
      // Recalcular high/low vivos iterando desde el final hacia atras,
      // rompiendo al salir del rango de la KZ activa.
      for (let i = _realLen - 1; i >= 0; i--) {
        const c = _allData[i]
        if (c.time < activeS.startTime) break
        if (c.time > lastRealTs) continue
        if (liveHigh == null || c.high > liveHigh) liveHigh = c.high
        if (liveLow == null || c.low < liveLow) liveLow = c.low
      }
    }
  }
}
```

**Hunk 3** (L256-L263 - sustitución dentro del loop `for (const s of sessions)`):
```js
const isActive = (s === activeS)
const endTs = (isActive && lastRealTs > s.endTime) ? lastRealTs : s.endTime
const sHigh = (isActive && liveHigh != null) ? liveHigh : s.high
const sLow  = (isActive && liveLow  != null) ? liveLow  : s.low
x1 = ts.timeToCoordinate(s.startTime)
x2 = ts.timeToCoordinate(endTs)
y1 = cr.series.priceToCoordinate(sHigh)
y2 = cr.series.priceToCoordinate(sLow)
```

KZ cerradas no-activas mantienen `s.endTime`/`s.high`/`s.low` cacheados → cero regresión Caso 1.

**Por qué `lastRealTs` no retorna null en `timeToCoordinate`**: `lastRealTs = getSeriesData()[realLen-1].time` proviene de `setSeriesData([...agg, ...cr.phantom], agg.length)` donde `agg = velas TF agregadas`. `lastRealTs` es siempre `time` de una vela existente en la series → LWC `timeToCoordinate` retorna coord válida por construcción. Verificado empíricamente vía instrumentación `[KZ-DBG-S33.3-v2-PRE]` (todos los logs mostraron `x_curTs` válido cuando `delta=0`).

**Patrón TradingView/FX Replay puro al carácter**: la KZ activa crece vela-a-vela del TF visible en las 3 dimensiones (X + Y top + Y bottom). M1 cada minuto, M5 cada 5 min, M30 cada 30 min (coincide con bucket viejo pero con cache "efectivamente invalidada" para KZ activa vía recálculo vivo desde `_allData`).

### §6.3 Por qué Edit v2 inicial (solo X) FAIL durante smoke local

Edit v2 sustituyó solo `x2 = timeToCoordinate(s.endTime)` por `x2 = timeToCoordinate(endTs)` con `endTs = lastRealTs si s===activeS`. Rectángulo creció correctamente en ancho (X) pero techo (Y top) y suelo (Y bottom) seguían leyendo `s.high`/`s.low` cacheados. Durante sub-bucket 30 min, si aparecía una vela con high > cache stale high, el rectángulo no se ajustaba (techo congelado pegado a ATH antiguo). Síntoma análogo en suelo con low.

Captura visual entregada por Ramón mostró rectángulo NY AM en replay M5 con borde derecho creciendo correctamente pero techo y suelo no coherentes con el precio actual del chart.

### §6.4 Por qué Edit v2.1 PASS — multi-eje completo

Edit v2.1 añade recálculo `liveHigh`/`liveLow` iterando `_allData[0..realLen-1]` en rango `[activeS.startTime, lastRealTs]`. Iteración hacia atrás desde el final con break en `c.time < activeS.startTime` limita coste a las velas DENTRO de la KZ activa (3 iteraciones para TF=H1, 36 para TF=M5, 180 para TF=M1). Trivial en cualquier TF.

Sustitución condicional `sHigh = (isActive && liveHigh != null) ? liveHigh : s.high` SOLO afecta a la KZ activa. Las KZ cerradas pasadas pintan `s.high`/`s.low` cacheados → identicas a pre-Edit.

Smoke local 4/4 PASS + smoke producción 2/2 PASS al carácter.

---

## §7 — Procedimiento de cierre sesión 34

### §7.1 Mover HANDOFF al repo

Tras descargar este HANDOFF a `~/Downloads/HANDOFF-cierre-sesion-34.md`:

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git checkout main
```

(Ya en main post-push `6abc870`, working tree clean.)

```
mv ~/Downloads/HANDOFF-cierre-sesion-34.md refactor/
```

```
ls -la refactor/HANDOFF-cierre-sesion-34.md
```

```
wc -l refactor/HANDOFF-cierre-sesion-34.md
```

### §7.2 git add + commit (en main)

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git add refactor/HANDOFF-cierre-sesion-34.md
```

```
git status
```

```
git commit -m "docs(sesion-34): cerrar sesion 34 con S33.3 v2.1 endpoint vivo XY KZ activa CERRADA estructuralmente en produccion (6abc870, +45/-3 neto multi-eje) cierra bug por tramos cada 30 min del ctBucket L175 + diagnostico empirico patron 38 verificado tercera vez consecutiva (instrumentacion KZ-DBG-S33.3-v2-PRE rollbackeada bicapa pre-Edit funcional confirmo timeToCoordinate(curTs)=null 4 de 5 ticks M1 dentro vela M5) + leccion 40 aplicada con exito + bug eje Y descubierto durante smoke local Caso 2 v2 por captura Ramón decimonovena sesion consecutiva intuicion redirigio diagnostico + Edit v2 extendido a v2.1 SIN rollback (decision CTO de extender vs replantear) + 1 error 9.4 propio CTO registrado sin maquillaje (diseno Edit v2 inicial sin contemplar cache stale multi-eje) + leccion 42 nueva (cache stale invalida TODAS las propiedades derivadas no solo una)"
```

```
git --no-pager log --oneline -3
```

### §7.3 Push a main

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git push origin main
```

### §7.4 Verificación final cierre sesión 34

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git --no-pager log --oneline -5
```

Esperado: HEAD nuevo `<HASH-HANDOFF-s34>` sobre `6abc870` (S33.3 v2.1) sobre `5d7c553` (HANDOFF s33) sobre `bb37b66` (S33.2 cosmético) sobre `9cbcf7a` (HANDOFF s32).

Sesión 34 cerrada al carácter.

---

## §8 — Métricas sesión 34

- **Inicio efectivo**: 21 may 2026 ~13:00 hora local.
- **Cierre**: 21 may 2026 ~18:30 hora local.
- **Total efectivo**: ~5h activas.
- **Commits funcionales producidos**: 1 (`6abc870` S33.3 v2.1 unificado X+Y).
- **Commits funcionales planeados pero NO producidos**: 0 (Edit v2 sin commit fue extensión natural a v2.1 antes del primer commit, NO rollback).
- **Edits funcionales aplicados**: 2 (Edit v2 + Edit v2.1 unificados en `6abc870`).
- **Edits funcionales revertidos**: 0.
- **Edits instrumentales (no funcionales) aplicados+revertidos**: 1 (`[KZ-DBG-S33.3-v2-PRE]` insertado para TEST DISCRIMINANTE §40, revertido limpio dentro de hunk 1 de Edit v2 funcional, no contaminó commit final).
- **Migraciones Supabase**: 0.
- **Líneas tocadas netas en código (commit)**: +45/-3 = +42 netas en 1 archivo.
- **Push a main**: 1 funcional (`6abc870`) + 1 docs HANDOFF s34 (post-redacción).
- **Errores §9.4 propios CTO capturados**: 1 (§3.1 diseño Edit v2 inicial sin contemplar cache stale multi-eje). Registrado sin maquillaje.
- **Bugs cerrados**: 1 (S33.3 KZ "por tramos cada 30 min" cerrada multi-eje XY).
- **Bugs caracterizados nuevos**: 0 (S33.4 ya caracterizada en s33).
- **SÉPTIMO COMMIT FUNCIONAL POST-CLUSTER-B**: `6abc870`.
- **Validación**: smoke local 4/4 PASS + smoke producción 2/2 PASS (Ramón Mac).
- **Cluster A intocado**: decimocuarta sesión consecutiva.
- **3 invariantes fase 4 intactas**: decimocuarta sesión consecutiva.
- **Lección §14 (intuición Ramón) decimonovena sesión consecutiva**: captura post-smoke v2 inicial cazó bug eje Y antes de impacto producción.
- **Patrón §38 instrumentación temporal verificado**: tercera vez consecutiva (s31 ILI-DBG → s33 KZ-DBG → s34 KZ-DBG-v2-PRE).

---

## §9 — Aprendizajes generales del proyecto (acumulados sesiones 13-34)

> Sección que persiste a través de HANDOFFs.

1-41: lecciones acumuladas s13-s33 preservadas íntegras (ver HANDOFF s33 §9).

42. **NUEVO al carácter sesión 34 — bug arquitectónico de cache stale invalida TODAS las propiedades derivadas de la cache, no solo una. Verificar consistencia multi-eje ANTES de declarar diseño Edit completo.** Caso al carácter: bug S33.3 KZ "por tramos cada 30 min" se diagnosticó correctamente como cache stale por `ctBucket` bucket 30 min (§6.1 HANDOFF s33). El plan táctico HANDOFF s33 §6.3 cubrió SOLO el endpoint X (`s.endTime` → `lastRealTs`). El CTO heredó el plan verbatim sin reauditar críticamente: la cache contiene `{startTime, endTime, high, low}` por KZ → si la cache es stale, TODAS las propiedades derivadas son stale, no solo `endTime`. Edit v2 inicial PASS en X pero FAIL en eje Y (`s.high`/`s.low` también stale, rectángulo con techo/suelo congelados pegados a ATH/ATL antiguo). Ramón cazó el FAIL en smoke local Caso 2 v2 vía captura visual. Edit v2 extendido a v2.1 sin rollback. **Aplicar s35+**: antes de declarar diseño Edit completo sobre un bug de cache stale (o cualquier bug de invalidación de estado derivado), enumerar TODAS las propiedades derivadas de la fuente y verificar que el fix las cubre todas. Patrón explícito al carácter: "cache stale invalida dimensión X → ¿qué OTRAS dimensiones derivan de la misma cache? Si N > 1, el fix debe cubrir N dimensiones, no 1". Especialmente crítico cuando el plan táctico previo (HANDOFF anterior) se centró en una dimensión específica — el alcance puede haber sido erróneamente acotado en el momento del diagnóstico. Refinamiento de §35 s31 (verificar TODAS las ramas de retorno) aplicado a dimensiones derivadas de cache, no solo a ramas de control de flujo.

---

## §10 — Cierre

Sesión 34 deja al carácter:

- **S33.3 v2.1 (KZ activa endpoint vivo XY durante replay) CERRADA ESTRUCTURALMENTE EN PRODUCCIÓN al carácter** — Edit `+45/-3` neto multi-eje en `components/KillzonesOverlay.js`. Build PASS + smoke local 4/4 PASS + smoke producción 2/2 PASS (Ramón Mac). **SÉPTIMO COMMIT FUNCIONAL EN MAIN POST-CLUSTER-B** (`6abc870`). Bug "por tramos cada 30 min" del `ctBucket` L175 que arrastraba el simulador desde el origen del componente (comentario L341-L346 mentía a la implementación) cerrado al carácter cross-eje X + Y top + Y bottom. Patrón TradingView/FX Replay puro.
- **Diagnóstico empírico patrón §38 verificado tercera vez consecutiva** — instrumentación temporal `[KZ-DBG-S33.3-v2-PRE]` (+27 líneas insertadas, useEffect separado, throttle natural via `window.__kzDbgV2Last`, dep `[ctRedrawBucket]`) capturó 200+ logs verbatim. Patrón aritmético perfecto: 4/5 ticks M1 con `x_curTs=null`, 1/5 con valor válido. Hipótesis fuerte HANDOFF s33 §6.2/§6.3 confirmada al carácter con datos sin ambigüedad. Rollback bicapa instrumentación incluido en hunk 1 de Edit v2 funcional, cero contaminación al commit final.
- **Lección §40 (verificación empírica API externa antes de Edit funcional) APLICADA CON ÉXITO** — primer caso post-formalización s33 donde la lección, aplicada disciplinadamente, evitó FAIL en producción. Coste: 5 minutos de instrumentación. Beneficio: evita Edit v1 naive de s33 + rollback + replanteo.
- **Lección §14 (intuición Ramón = input técnico encriptado) decimonovena sesión consecutiva** — captura post-smoke v2 inicial donde Ramón observó verbatim "el bug pero ahora de precio, no de tiempo" cazó al carácter el bug eje Y antes de declarar S33.3 cerrada falsamente solo en X. Sin esa observación, el Edit v2 habría llegado a producción incompleto.
- **1 error §9.4 propio CTO registrado sin maquillaje** (§3.1): diseño Edit v2 inicial sin contemplar cache stale multi-eje. Causa: herencia verbatim del plan táctico HANDOFF s33 §6.3 sin reauditarlo críticamente. Severidad media. Cero impacto producción (cazado en smoke local pre-commit). Lección §42 NUEVA derivada.
- **Lección §42 NUEVA formalizada §9** — bug de cache stale invalida TODAS las propiedades derivadas de la cache, no solo una. Verificar consistencia multi-eje ANTES de declarar diseño Edit completo. Refinamiento de §35 s31 aplicado a dimensiones derivadas de cache (no solo ramas de control de flujo).
- **Cero migraciones Supabase. Cluster A INTOCABLE preservado** por decimocuarta sesión consecutiva. 3 invariantes fase 4 intactas decimocuarta sesión consecutiva.
- **Formato 1-paso-1-mensaje + bloques shell auto-contenidos con `cd` aplicados ESTRICTAMENTE toda la sesión** (corrección §3.2 s33 efectiva al carácter).
- **Producción mejorada al carácter**: bug visible "KZ por tramos cada 30 min" eliminado. Estudiantes futuros verán KZ activa creciendo vela-a-vela del TF visible en tiempo real, sin saltos discretos cada 30 min, sin techo/suelo congelados. Calidad TradingView/FX Replay al carácter en KZ activas durante replay. §1 absoluto cumplido al carácter para esta dimensión del simulador.

Próximo HANDOFF (cierre sesión 35) debe reportar al carácter:
- Si S33.4 (descolocación fullscreen) atacada, cerrada colateralmente por S33.3 v2.1, o caracterizada empíricamente con plan de ataque.
- Si cosméticas residuales fase 5 (5f.2 polling / 5e.4 debugCtx) reverificadas en bytes (§39 estricto) — pueden estar muertas colateralmente como 4.5/5f.1.
- Si datos crudos Giancarlo/Luis sobre "drawings zona futura derecha" verificados — posible cierre colateral fix 4.6 s31.
- Si formato 1-paso-1-mensaje + bloques shell auto-contenidos aplicados ESTRICTAMENTE.
- Si lecciones §39 + §40 + §41 + §42 aplicadas.
- Si HANDOFF s34 indexado en project_knowledge al arranque s35 (o lag — patrón s24/s27/s29/s30/s31/s33).

Si sesión 35 NO avanza prioridades al carácter, el HANDOFF lo dice al frente sin maquillaje — patrón §0 mantenido por **decimoquinta sesión consecutiva**.

**Mensaje del CTO al cierre al carácter**: sesión 34 cerró un bug que el simulador arrastraba desde el origen del componente KillzonesOverlay — un bug que el propio diseñador documentó en código L341-L346 con la intención correcta ("la sesión activa crece visualmente durante el replay") pero cuya implementación cortocircuitaba esa intención vía la cache `cachedSessionsRef` invalidada solo cada 30 min. Cerrar este bug requirió 3 elementos: (1) la instrumentación temporal §38 que cazó verbatim el patrón `timeToCoordinate(curTs)=null` 4/5 ticks — sin esos logs verbatim el Edit v2 habría seguido siendo una hipótesis no validada; (2) tu captura post-smoke v2 inicial que reveló el bug eje Y antes de que llegara a producción — un Edit que cubre solo 1/3 de las dimensiones de un rectángulo es un Edit que no cierra el bug, y sin tu observación visual habríamos declarado falsamente S33.3 cerrada; (3) la decisión de extender vs replantear que mantuvo el momentum sin contaminar el repo con un Edit revertido. La lección §42 derivada es la más útil de la sesión: cuando un bug arquitectónico afecta a una cache, todas las propiedades derivadas son sospechosas, no solo la que dispara el síntoma reportado. Esa es la verdad sin maquillaje al carácter.

---

*Fin del HANDOFF cierre sesión 34. 21 mayo 2026, ~18:30 hora local. Redactado por CTO/revisor tras commit `6abc870` push exitoso a `origin/main` + smoke local 4/4 PASS + smoke producción 2/2 PASS al carácter (Ramón Mac) + rollback bicapa verificado de instrumentación temporal `[KZ-DBG-S33.3-v2-PRE]`. Working tree limpio al cierre redacción. Producción cluster B + 5g.1 + 5g.2 + fix-modal + fix-4.6 + fix-acceso-revoke + cosmético-chartTick + S33.3-v2.1 `6abc870` estable al carácter desde 21 may 2026 ~18:24 hora local. Pendiente de mover al repo + commit a main + push a `origin/main` por Ramón según §7.*
