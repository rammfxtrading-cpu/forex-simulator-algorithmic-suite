# HANDOFF — cierre sesión 33

> Sesión 33 cerrada el 21 mayo 2026, ~13:00 hora local.
> Sesión 33 = **prioridad táctica HANDOFF s32 §5.1**: prioridad 2 cosméticas fase 5 cluster B residual + arrancar prioridad candidata "cosmético chart vacío post-reactivación" si caracterizado. En la práctica = sub-fase 5f.cosmética (`chartTick` huérfana en KillzonesOverlay) + diagnóstico arquitectónico + intento fallido S33.3 "KZ por tramos cada 30 min".
> **Resultado al carácter sin maquillaje**: S33.2 cerrada estructuralmente en producción (cierre cosmético `chartTick` huérfana). Commit `bb37b66` push `origin/main` + smoke local 3/3 + smoke producción 2/2 PASS. **SEXTO COMMIT FUNCIONAL EN MAIN POST-CLUSTER-B**. S33.3 v1 ("KZ por tramos cada 30 min") intentado con Edit Camino A naive → **regresión empírica cazada por Ramón en smoke local antes de commit** → rollback inmediato sin que el Edit llegue a `origin/main`. Instrumentación `[KZ-DBG-S33.3]` aplicada empíricamente patrón §38 → caracterización 100% verbatim del bucketing 30 min + hipótesis fuerte residual del FAIL v1 → Edit v2 **diseñado completo** para s34. Deuda 4.5/5f.1 (`__algSuiteExportTools`) **cierre colateral cluster B verificado en bytes** — código zombi ya eliminado durante s20-s31, deuda arrastrada 20 sesiones (s12→s32) como "ABIERTA backlog" cuando estaba muerta. Deuda S33.4 (descolocación fullscreen directo desde media pantalla) caracterizada al carácter por Ramón, pre-existente (también en producción `bb37b66`).
> **Diagnóstico S33.3 redirigido por la intuición de Ramón (lección §14, decimoctava sesión consecutiva)**: tu reporte verbatim "se pinta cada media hora.. de en media a en punto y así" fue la caracterización empírica decisiva que orientó la instrumentación correcta. Sin ese reporte, el CTO habría diseñado Edit v2 sobre la hipótesis errónea inicial (`activeKey` match con KZ histórica) en vez de la real (`timeToCoordinate(curTs)` con timestamp no alineado al TF).
> Próxima sesión = sesión 34. Prioridad 1 = S33.3 v2 (Edit con `lastRealCandle.time`). Prioridad 2 = S33.4. Prioridad 3 = cosméticas residuales fase 5.

---

## §0 — Estado al cierre sesión 33, sin maquillaje

**Sesión 33 produjo 1 commit funcional al carácter en main**: `bb37b66` (S33.2 cosmética `chartTick` huérfana KZ). HEAD main al cierre = `<HASH-HANDOFF-s33>` sobre `bb37b66` sobre `9cbcf7a` (HANDOFF s32) sobre `eb4c2ab` (fix acceso-revoke) sobre `032a4e3` (HANDOFF s31) sobre `6dd0629` (fix 4.6).

`origin/main` = `bb37b66` desde ~21:00 hora local 20 may 2026 + HANDOFF s33 docs post-redacción 21 may. Producción Vercel actualizada al carácter automáticamente a runtime efectivo `bb37b66` post-push.

**Cambio runtime producción al carácter**: sexto cambio runtime efectivo producción post-cluster-B. `eb4c2ab` (fix acceso) → `bb37b66` (cosmético chartTick). Producción al carácter ahora cluster B + 5g.1 + 5g.2 + fix-modal + fix-4.6 + fix-acceso-revoke + cosmético-chartTick estable empíricamente al carácter post-deploy.

**Realidad sin maquillaje al carácter**:

1. **S33.2 (`chartTick` huérfana en KillzonesOverlay) CERRADA ESTRUCTURALMENTE EN PRODUCCIÓN al carácter** — Edit cosmético `+1/-1 +1/-1` neto en 2 archivos. Validación bicapa estricta completa:
   - Inventario bytes desde cero (lección §34): `grep -rn` recursivo sobre `chartTick` en `components/` reveló que KZ recibía la prop pero NO la consumía en ningún `useEffect`, mientras que las otras 3 overlays (RulerOverlay L198, CustomDrawingsOverlay L122, PositionOverlay L2932) sí la usan como dep del contrato 5d.1. La caracterización del HANDOFF s32 ("prop huérfana KZ") era correcta pero parcial — la prop es zombi solo localmente en KZ.
   - Edit auditado bicapa `+1/-1 +1/-1` neto + build PASS + smoke local 3/3 (KZ pintan al entrar sesión + redibujan cambio TF M5→M15→H1→M5 + no manta invisibilidad post-fullscreen close DevTools) + commit `bb37b66` push + smoke producción 2/2 PASS (Ramón Mac).

2. **Deuda 4.5/5f.1 (`__algSuiteExportTools` muerto) CERRADA COLATERALMENTE — verificación bytes**: durante el inventario read-only previo al ataque de la cosmética se descubrió que el bloque debug `const _expJson = (typeof window.__algSuiteExportTools === 'function') ? window.__algSuiteExportTools() : null` **ya no existe en código vivo**. Solo aparece en docs históricas (`refactor/*.md`, `HANDOFF*.md`), en `.backup-*/_SessionInner.js` (backups intocables), y en `refactor/fase-3-plan.md` / `refactor/fase-4-plan.md` como citas históricas. Cero matches en `components/`, `pages/`, `lib/`, `vendor/`. La deuda estuvo arrastrándose en HANDOFFs s12→s32 (~20 sesiones) como "⏳ ABIERTA backlog" cuando ya había sido eliminada colateralmente durante la reestructuración del cluster B (probablemente sub-fase 5c o 5d). **NO se hizo Edit** — solo registro en HANDOFF.

3. **S33.3 ("KZ por tramos cada 30 min") DIAGNÓSTICO ARQUITECTÓNICO COMPLETO + EDIT v1 FALLIDO REVERTIDO + EDIT v2 DISEÑADO PARA s34**:
   - Caracterización empírica inicial: Ramón reporta verbatim "se pinta cada media hora.. de en media a en punto y así.. da igual el tf.. en m30 pues se ve en cada vela.. en m5 cada 6 velas y así". Lección §14 17ª sesión consecutiva: input técnico encriptado que redirigió todo el diagnóstico.
   - Inventario read-only en bytes de `KillzonesOverlay.js` reveló la causa arquitectónica al carácter: `const ctBucket = currentTime ? Math.floor(currentTime / 1800) : 0` (L175). Bucket de **1800s = 30 min**. La cache `cachedSessionsRef` solo se recalcula cuando `ctBucket` cambia. `calcSessions` (L36-L68) asigna `endTime = c.time` (última vela DENTRO de la sesión procesada en el último recálculo). Mientras el replay avanza dentro del mismo `ctBucket` de 30 min, `calcSessions` NO se ejecuta → `endTime` queda congelado.
   - Hallazgo crítico de inconsistencia arquitectónica: comentario L341-L346 en código actual dice verbatim "Redibujar también conforme avanza el replay — esto hace que la sesión activa 'crezca' visualmente durante el replay". El diseñador original SABÍA que la KZ activa debe crecer continuamente. Implementó un disparador adicional de `draw()` cada 60s (`ctRedrawBucket`). **Pero `draw()` lee `s.endTime` directo de la cache** (L218) — redibujar cada 60s la misma cache no produce efecto visible. **El comentario miente arquitectónicamente respecto a la implementación**.
   - Edit v1 Camino A "endpoint vivo en draw" (idéntico al patrón vendor LWC `LongShortPosition`): añadir `currentTimeRef` + identificar `activeS` por `key` matching + sustituir `x2 = ts.timeToCoordinate(s.endTime)` por `x2 = ts.timeToCoordinate(curTs)` si `s === activeS && curTs > s.endTime`. Build PASS. Smoke local Caso 2 (replay en KZ activa) → Ramón reporta verbatim "no se ve la kz hasta que llega al final" → **FAIL EMPÍRICO**.
   - Rollback inmediato `git checkout -- components/KillzonesOverlay.js`. Edit v1 nunca llegó a commit ni a producción.
   - Hipótesis inicial post-FAIL (CTO): `activeKey` match con KZ histórica del mismo tipo → rectángulo masivo fuera del viewport. Releyendo `calcSessions` L65-L68 (post-loop principal empuja sesiones aún activas al final), esta hipótesis se descarta — la KZ del día actual SÍ está en la cache cuando es activa.
   - Instrumentación temporal patrón §38 (idéntico al `[ILI-DBG]` exitoso de s31): logs `[KZ-DBG-S33.3]` con `{curTs, activeKey, activeS_present, activeS_start, activeS_end, delta_secs, x1, x2_curTs, x2_endTime}` solo cuando hay sesión activa y `curTs` cambia (throttle natural via `window.__kzDbgLast`). Smoke local con replay activo dentro de Asia/London/NY AM KZ → captura de cientos de logs.
   - Caracterización empírica de los logs verbatim:
     - Asia: `endTime` salta `1763686800` → `1763688600` (Δ=1800s exacto) → `1763690400` (Δ=1800s) → `1763692200` (Δ=1800s) → … (32 logs por bucket con `endTime` congelado entre saltos).
     - London: idéntico patrón Δ=1800s entre saltos.
     - NY AM: idéntico patrón Δ=1800s entre saltos.
   - Confirmación al carácter: bucket exactamente 30 min como reportó Ramón. `activeS_present = true` siempre en sesiones activas. La cache contiene la KZ del día actual correctamente. **Hipótesis "activeKey histórico" descartada empíricamente con datos**.
   - Hipótesis fuerte residual del FAIL v1 (la que va al Edit v2 s34): `timeToCoordinate(curTs)` retorna `null` para timestamps NO alineados al `time` de las velas del TF visible. Los logs muestran `curTs` cambiando cada 60s (múltiplo de M1). Pero en TF=M5/M15/M30, las velas tienen `time` cada 300s/900s/1800s — la mayoría de `curTs` NO coinciden con vela del TF → LWC retorna null → check `if (x2 == null) continue` → KZ activa salta dibujado entero. La KZ "no se ve" hasta que `curTs` cae en múltiplo de 1800 (que es múltiplo común de todos los TF ≤ M30).
   - **Edit v2 diseñado para s34**: en lugar de `curTs` raw, usar `lastRealCandle.time` (siempre alineado al TF visible vía `setSeriesData`). Pseudo:
     ```javascript
     const allData = getSeriesData(), realLen = getRealLen()
     const lastRealTs = (allData && realLen) ? allData[realLen-1].time : null
     const endTs = (s === activeS && lastRealTs && lastRealTs > s.endTime) ? lastRealTs : s.endTime
     ```
   - Instrumentación rollbackeada bicapa al cierre: `git checkout -- components/KillzonesOverlay.js` + `grep KZ-DBG-S33.3` vacío + working tree clean + HEAD `bb37b66`.

4. **S33.4 (descolocación fullscreen directo desde media pantalla) CARACTERIZADA al carácter por Ramón**: durante smoke local Caso 3 de S33.2, Ramón reporta verbatim "se dibujan descolocadamente.. si no esta en pantalla completa y la pestaña donde esta el grafico esta a mitad de pantalla y directamente pongo fullscreen pues se desajustan". Confirma también que ocurre en producción `bb37b66` → **bug pre-existente, NO regresión de S33.2** ni de ningún Edit reciente. Scope distinto a 5g.1 (que cubre "manta invisibilidad" post-close DevTools + drag). Documentada §4 deuda nueva. NO atacada.

5. **Cero migraciones Supabase ejecutadas** (CLAUDE.md §3.1). Cero cambios de esquema/políticas.

6. **Edits funcionales revertidos en sesión**: 1 (S33.3 v1 → rollback antes de commit). **Edits funcionales que llegaron a producción**: 1 (S33.2 cosmético `chartTick`).

7. **Errores §9.4 propios CTO registrados sin maquillaje (§3 abajo)** — esta sesión tuvo 2 errores propios. Registrados íntegros.

8. **Formato 1-paso-1-mensaje (lección §31 s29 + §3.3 s32)**: aplicado mayoritariamente, con desviaciones menores. Una desviación específica de disciplina shell (§3.2 abajo) detectada y corregida en frío.

---

## §1 — Qué se hizo en sesión 33

### §1.1 PASO 0 + PASO 0.5

PASO 0: 5+ búsquedas dirigidas `project_knowledge_search` (HANDOFF s32 + s31 + core-analysis.md §6 + fase-5-plan.md §5 + CLAUDE.md §1-§4). HANDOFF s32 **NO indexado** en project_knowledge al inicio de sesión — patrón de lag confirmado (s24/s27/s30). Plan B aplicado: Ramón pegó HANDOFF s32 entero vía `cat` desde shell. CTO leyó §0 + §3 + §4 + §5 + §9 lecciones §37/§38 íntegros.

PASO 0.5: verificación shell PASS al carácter — HEAD `9cbcf7a`→`eb4c2ab`→`032a4e3`→`6dd0629`→`c39a8ec`, 3 invariantes fase 4 (setData/update vacíos + computePhantomsNeeded L116/L1145/L1224), Math.floor L1596 1 match, fix s32 acceso-revoke vivo en useAuth.js (`revalidate` L62 + `visibilitychange` L79 + `setInterval` L80 + cleanup L84), `wc -l useAuth.js = 95`.

### §1.2 Decisión arquitectónica de prioridad

Ramón delegó decisión CTO ("lo que sea lo correcto y lo mejor para el proyecto"). Decisión CTO al estándar §1: **P2 — fase 5 cluster B residual, ataque progresivo por riesgo ascendente**. Razones: (a) §1 absoluto requiere fase 5 cerrada antes de avanzar a fase 6 (trading domain); (b) cosmética 5f.1 es bajo riesgo, primera victoria estructural rápida sin tocar `_SessionInner.js` frágil; (c) P1 candidata chart-vacío-post-reactivación es caso de borde post-flujo admin raro, scope desproporcionado como prioridad inicial.

### §1.3 Hallazgo de cierre colateral (deuda 4.5/5f.1)

PASO 1 de S33.1 (`__algSuiteExportTools` muerto): inventario read-only en bytes con `grep -rn "__algSuiteExportTools" components/ pages/ lib/ vendor/ refactor/` + grep full repo con exclude node_modules. **CERO matches en código vivo**. Solo matches en `refactor/*.md` (docs históricas), backups `.backup-*/_SessionInner.js`, y `refactor/fase-3-plan.md` L312 / `refactor/fase-4-plan.md` L219-L220 (citas históricas). Verificación adicional con `sed -n '1130,1160p' components/_SessionInner.js` muestra zona equivalente al ~L1138 histórico ahora con `exportTools()` (función limpia importada) en `try/catch` para computar phantoms — sin `_expJson`, sin global muerto. 5f.1 **cerrada colateralmente** durante reestructuración cluster B s20-s31. NO Edit, solo registro en HANDOFF.

### §1.4 S33.2 (cosmético `chartTick` huérfana KZ) — Edit funcional cerrado en producción

PASO 2 de S33.1: inventario read-only `chartTick` con `grep -n` localizado:
- `_SessionInner.js`: productor L261 (`useState`), bumpea en cluster B contrato 5d.1, pasado a 4 overlays.
- `CustomDrawingsOverlay.js` L83 firma + L122 `useEffect` dep ✓.
- `RulerOverlay.js` L16 firma + L198 `useEffect` dep ✓.
- `PositionOverlay` `_SessionInner.js` L2875 firma + L2932 `useEffect` dep ✓.
- `KillzonesOverlay.js` L117 firma — **ningún `useEffect` la consume** ✗.

Caracterización al carácter: KZ recibe pero descarta `chartTick`. Las otras 3 overlays lo usan vivo. La huérfana está localizada a KZ.

Edit Hunk 1: eliminar `chartTick` de la firma `KillzonesOverlay.js` L117 (`+1/-1`).
Edit Hunk 2: eliminar `chartTick={chartTick}` del JSX `<KillzonesOverlay>` en `_SessionInner.js` L1943 (`+1/-1`).

Neto: `2 files changed, 2 insertions(+), 2 deletions(-)`. Cluster A intocado. 3 invariantes fase 4 intactas. `chartTick` sigue vivo en `_SessionInner.js` productor + 3 overlays consumidoras.

Build PASS `npm run build`. Smoke local 3/3 PASS reportado por Ramón:
- Caso 1 (KZ pintan al entrar sesión): PASS.
- Caso 2 (KZ redibujan cambio TF M5→M15→H1→M5): PASS.
- Caso 3 (no manta invisibilidad post-fullscreen + close DevTools + drag): PASS.

Durante Caso 3 Ramón cazó S33.4 nueva (descolocación fullscreen directo desde media pantalla — distinta a 5g.1, pre-existente).

Commit `bb37b66` + push `origin/main` + smoke producción 2/2 PASS reportado por Ramón.

### §1.5 S33.3 (KZ por tramos cada 30 min) — Edit v1 fallido + Edit v2 diseñado

Detalle completo en §0 punto 3 y §6.1 abajo.

Resumen: caracterización empírica por Ramón "cada 30 min, en punto y en media, da igual el TF" → inventario read-only `KillzonesOverlay.js` localizó `ctBucket = floor(currentTime/1800)` L175 + `calcSessions` asigna `endTime = c.time` L51 + `draw()` lee cache L218. Edit v1 Camino A "endpoint vivo" → FAIL empírico ("no se ve la kz hasta el final") → rollback inmediato sin commit → instrumentación `[KZ-DBG-S33.3]` patrón §38 → captura de cientos de logs → caracterización 100% verbatim del Δ=1800s entre saltos de `endTime` → hipótesis fuerte residual `timeToCoordinate(curTs)` retorna null para timestamps no alineados al TF → Edit v2 diseñado con `lastRealCandle.time` (alineado al TF por construcción) → NO aplicado en s33 por disciplina §31/§36 (replantear con contexto fresco post-FAIL).

Instrumentación rollbackeada bicapa al cierre — working tree clean al carácter.

---

## §2 — Estado al carácter (verificable desde shell)

### §2.1 Git

- Rama activa al cierre: `main`.
- HEAD main al cierre: `<HASH-HANDOFF-s33>` (HANDOFF s33 docs) sobre `bb37b66` (S33.2 cosmético chartTick funcional).
- `origin/main` = `bb37b66` post-push funcional + `<HASH-HANDOFF-s33>` post-push docs.
- Cadena main al cierre:
  ```
  <HASH-HANDOFF-s33> — HANDOFF s33
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

- Deploy actual: `bb37b66` (cosmético chartTick) — runtime efectivo cluster B + 5g.1 + 5g.2 + fix-modal + fix-4.6 + fix-acceso-revoke + cosmético-chartTick desde ~21:00 hora local 20 may 2026.
- **SEXTO CAMBIO RUNTIME PRODUCCIÓN POST-CLUSTER-B** — `eb4c2ab` → `bb37b66`.
- **Smoke producción 2/2 PASS al carácter (Ramón Mac)** — KZ pintan al entrar sesión + redibujan cambio TF.

### §2.3 Tamaños actuales al carácter

| Archivo | Líneas pre-33 | Líneas post-33 | Delta |
|---|---|---|---|
| `components/KillzonesOverlay.js` | 463 | 463 | 0 (sustitución `+1/-1` en L117) |
| `components/_SessionInner.js` | 3052 | 3052 | 0 (sustitución `+1/-1` en L1943) |
| `lib/useAuth.js` | 95 | 95 | 0 (no tocado en s33) |

**0 líneas netas** (2 archivos, 2 hunks de sustitución). Cluster A INTOCABLE preservado por **decimotercera sesión consecutiva**. `_SessionInner.js` tocado solo en 1 línea de JSX (zona segura, NO `computePhantomsNeeded` ni handler TF ni init).

### §2.4 Invariantes fase 4 al cierre — verificadas al carácter al arranque y reverificables

```
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"  → vacío
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"   → vacío
grep -n "computePhantomsNeeded" components/_SessionInner.js                          → 3 matches L116, L1145, L1224
grep -n "Math.floor((cachedData.length - 1)" vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js   → 1 match L1596
grep -n "function revalidate\|visibilitychange\|setInterval(revalidate" lib/useAuth.js   → 3+ matches (fix s32 vivo)
```

Las 3 invariantes fase 4 mantenidas por **decimotercera sesión consecutiva** (heredadas s12). Fix 4.6 s31 vivo. Fix acceso-revoke s32 vivo. Cosmético chartTick s33 vivo.

---

## §3 — Errores §9.4 propios del CTO en sesión 33

**Sesión 33 tuvo 2 errores de criterio propios. Registrados sin maquillaje (disciplina §0).**

### §3.1 §9.4 — Edit S33.3 v1 Camino A naive sin verificación empírica de hipótesis

**Hecho al carácter**: el CTO diseñó Edit v1 Camino A sobre la hipótesis "identificar la KZ activa por `activeKey` match en la cache + reemplazar `x2 = timeToCoordinate(s.endTime)` por `x2 = timeToCoordinate(curTs)`". La hipótesis asumía implícitamente que (a) `activeS` apuntaría a la KZ del día actual y (b) `timeToCoordinate(curTs)` devolvería siempre un valor válido. **Ninguna de las dos se verificó empíricamente antes del Edit**. Ramón cazó el FAIL en smoke local Caso 2 con reporte verbatim "no se ve la kz hasta que llega al final".

**Causa**: el CTO saltó del diseño arquitectónico (correcto) a la implementación (naive) sin agotar el diagnóstico empírico. Específicamente, no verificó:
- Si `calcSessions` realmente incluye la KZ del día actual en la cache cuando es activa (sí lo incluye — verificado post-FAIL leyendo L65-L68 con calma).
- Si LWC `timeToCoordinate` acepta timestamps no alineados al `time` de las velas existentes (NO los acepta — verificado post-FAIL por análisis de los logs de la instrumentación).

**Severidad**: media. Cero impacto código (rollback inmediato, no llegó a commit). Coste en turnos de chat y tiempo de Ramón ejecutando el smoke. **Mejora futura**: aplicar §38 estricto antes de cualquier Edit — agotar verificación empírica de hipótesis (incluyendo comparar con subsistemas hermanos vendor LWC que SÍ funcionan, ej. `LongShortPosition` para endpoint vivo) ANTES de redactar el str_replace. Lección §40 NUEVA derivada (abajo §9.40).

### §3.2 §9.4 — desviación de formato bloque shell sin `cd` previo

**Hecho al carácter**: durante el inventario read-only de S33.1, el CTO pegó un bloque shell sin `cd /Users/principal/Desktop/forex-simulator-algorithmic-suite` como primera línea. Ramón lo ejecutó desde `~` y el grep falló con "No such file or directory" en `pages/ lib/ vendor/ refactor/`. CTO reconoció el error inmediatamente, se autocorrigió con bloque auto-contenido en el siguiente mensaje.

**Causa**: descuido de disciplina §31 — bloques shell deben ser **auto-contenidos** siempre, no asumir estado de working dir del usuario.

**Severidad**: leve. Cero impacto código. ~30 segundos de coste. **Mejora futura**: TODO bloque shell empieza con `cd /Users/principal/Desktop/forex-simulator-algorithmic-suite` como primera línea obligatoria. Aplicar s34+ sin excepción.

---

## §4 — Deudas vivas al cierre sesión 33

| Deuda | Estado al carácter | Calendario |
|---|---|---|
| Cosmético `chartTick` huérfana KZ (S33.2) | ✅ **CERRADA AL CARÁCTER en s33** producción `bb37b66` (`+1/-1 +1/-1` neto). Smoke local 3/3 + producción 2/2 PASS | Cerrada |
| Deuda 4.5/5f.1 (`__algSuiteExportTools` muerto) | ✅ **CIERRE COLATERAL VERIFICADO EN BYTES en s33** — código zombi ya eliminado durante cluster B s20-s31. NO requirió Edit. Solo documentación | Cerrada colateralmente |
| **S33.3 — KZ "por tramos cada 30 min" durante replay** | ⏳ **NUEVA s33** — caracterización empírica 100% verbatim (Δ=1800s entre saltos `endTime`). Edit v1 Camino A naive FAILED + rollback. Edit v2 diseñado completo (usar `lastRealCandle.time` en lugar de `curTs` raw). Hipótesis fuerte: `timeToCoordinate(curTs)` retorna null para timestamps no alineados al TF | **Prioridad 1 s34** — Edit v2 aplicación directa |
| **S33.4 — descolocación fullscreen directo desde media pantalla** | ⏳ **NUEVA s33** — caracterizada por Ramón verbatim, pre-existente en producción `bb37b66`. Scope distinto a 5g.1 (manta invisibilidad post-DevTools close). NO investigada en s33 | Prioridad 2 s34+ — requiere inventario flujo viewport-canvas-resize en fullscreen transition |
| Chart vacío transitorio post-reactivación acceso (heredada s32) | ⏳ ABIERTA — cosmético, datos intactos, NO regresión, workaround trivial. Caso raro: alumno reactivado en misma pestaña viva | Sub-fase futura |
| Deuda acceso-simulador-revoke no-efectivo | ✅ CERRADA s32 producción `eb4c2ab` | Cerrada |
| Deuda 4.6 caso 05:40 | ✅ CERRADA s31 producción `6dd0629` | Cerrada |
| Drawings zona futura derecha (Luis/Giancarlo) | ⏳ ABIERTA — posible cierre colateral fix 4.6, NO verificado con datos crudos Giancarlo/Luis en s33 | Vigilancia |
| `debugCtx` parámetro muerto | ⏳ ABIERTA — cosmética. NO verificado en bytes en s33 (posible cierre colateral cluster B como 5f.1; reverificar bytes en s34) | Sub-fase 5e.4 — re-inventario bytes obligatorio §39 |
| Polling 300ms `getSelected()` / setTimeout tfMap L371 | ⏳ ABIERTA — cosmética. NO verificada en bytes en s33 | Sub-fase 5f.2 — re-inventario bytes obligatorio §39 |
| Deuda 5.1 viewport + atajo Opt+R (5d.7/5d.8) | ⏳ ABIERTA — fase 5 residual no bloqueante | Sub-fase futura |
| Bug #2 freeze velocity-alta | ⏳ ABIERTA — pre-existente intermitente | Calendario fase 4 RenderScheduler |
| Sub-fase 5f.0c race LWC | ⏳ Deuda vigilada | Vigilancia |
| Quota Supabase | ⏳ Vigilancia pasiva (Free Plan) | Vigilancia |

---

## §5 — Plan táctico sesión 34

### §5.1 Próximo orden prioridades

- **Prioridad 1 — S33.3 v2 "KZ endpoint vivo con `lastRealCandle.time`"**:
  - Pre-condición §38 estricto: antes de Edit, verificar empíricamente UNA cosa adicional con un test discriminante de 1 línea: instrumentar `console.log('[KZ-DBG-S33.3-v2-PRE]', { x2_curTs: ts.timeToCoordinate(curTs), x2_lastReal: ts.timeToCoordinate(lastRealTs) })` en draw() durante replay activo dentro de KZ activa. Si `x2_curTs == null && x2_lastReal != null` → hipótesis confirmada → aplicar Edit v2 limpio. Si NO → re-replantear.
  - Edit v2 estructura: añadir `currentTimeRef` + bloque "endpoint vivo" identificando `activeS` por `key` match (sigue siendo válido — verificado empíricamente) + sustituir `x2 = timeToCoordinate(s.endTime)` por:
    ```javascript
    const allData = getSeriesData(), realLen = getRealLen()
    const lastRealTs = (allData && realLen) ? allData[realLen-1].time : null
    const endTs = (s === activeS && lastRealTs && lastRealTs > s.endTime) ? lastRealTs : s.endTime
    x2 = ts.timeToCoordinate(endTs)
    ```
  - `lastRealCandle.time` está siempre alineado al TF visible (LWC requirement). `timeToCoordinate` no devolverá null para ese valor.
  - Smoke local discriminante 4 casos: (1) KZ cerrada pasada idéntica; (2) KZ activa crece vela-a-vela durante replay; (3) cambio TF dentro de KZ activa sin regresión; (4) velocidad ∞ no satura.

- **Prioridad 2 — S33.4 "descolocación fullscreen directo desde media pantalla"**:
  - Inventario read-only del flujo viewport-canvas-resize en fullscreen transition. Localizar listener `fullscreenchange` y handler de `resize` en `_SessionInner.js` + en `KillzonesOverlay.js` (`subscribeSizeChange`).
  - Test discriminante: fullscreen desde maximize-half-screen vs fullscreen desde pantalla completa nativa vs fullscreen desde DevTools-abierto.
  - NO improvisar fix. Decisión Ramón con dato.

- **Prioridad 3 — cosméticas residuales fase 5**:
  - 5f.2 polling 300ms / setTimeout L371 — **re-verificar bytes primero** (lección §39).
  - 5e.4 `debugCtx` parámetro muerto — **re-verificar bytes primero** (lección §39).
  - 5d.7/5d.8 viewport TF change + Opt+R — sub-fase dedicada.

### §5.2 PASO 0 obligatorio en sesión 34

Leer en orden: (1) **este HANDOFF s33 entero**, especialmente §0 + §3 errores §9.4 propios (2 esta sesión) + §4 deudas + §5 plan + §6 causa raíz S33.3 + §9 lecciones §39/§40/§41 NUEVAS. (2) HANDOFF s32 §0 + §3 + §9 (lecciones §37/§38 referencia). (3) CLAUDE.md §1-§4.

PASO 0.5 verificación shell:

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git status                                              (esperado: main, working tree clean)
git --no-pager log --oneline -5                         (esperado: HEAD HANDOFF s33 sobre bb37b66 cosmetico chartTick, anterior 9cbcf7a HANDOFF s32)
git rev-parse HEAD
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"   (esperado: vacío)
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"    (esperado: vacío)
grep -n "computePhantomsNeeded" components/_SessionInner.js                            (esperado: 3 matches L116 L1145 L1224)
grep -n "Math.floor((cachedData.length - 1)" vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js   (esperado: 1 match L1596)
grep -n "function revalidate\|visibilitychange\|setInterval(revalidate" lib/useAuth.js   (esperado: revalidate + listener + interval presentes — fix s32 vivo)
wc -l lib/useAuth.js                                    (esperado: 95)
grep -n "chartTick" components/KillzonesOverlay.js                                     (esperado: vacío — S33.2 vivo)
grep -n "ctBucket\|cachedSessionsRef\|calcSessions\|inSession" components/KillzonesOverlay.js   (esperado: ctBucket L175, cachedSessionsRef L134/L178/L184/L191/L211, calcSessions L36/L190, inSession L30/L46/L233-style si lo hay)
grep -n "KZ-DBG\|currentTimeRef\|activeS\|endTs" components/KillzonesOverlay.js       (esperado: vacío — instrumentación s33 revertida)
```

> NOTA lección §34 + §39 — NO heredar números de línea de inventarios de HANDOFFs ≥2 sesiones atrás sin re-verificar en bytes. NO heredar el estado "ABIERTA" de deudas sin re-verificar bytes — pueden estar muertas colateralmente.

### §5.3 Disciplina sesión 34 — formato obligatorio

**OBLIGATORIO TODAS las sesiones (lección §31 s29 + §3.3 s32 + memoria persistente)**: un paso a la vez, mensajes CORTOS, también en fases de deliberación. Cero planes largos. Bloques shell SIEMPRE auto-contenidos con `cd` como primera línea (corregir §3.2 s33).

### §5.4 Cluster A INTOCABLE en sesión 34

Mismo principio sesiones 20-33.

---

## §6 — Causa raíz preservada

### §6.1 S33.3 — KZ "por tramos cada 30 min"

Mecánica completa al carácter en bytes (`components/KillzonesOverlay.js`):

1. **`calcSessions` L36-L68**: recorre `candles[]` de antiguo a reciente. Para cada vela `c` cuyo `toNYHM(c.time)` cae dentro del horario `[hStart, hEnd]` de una sesión KZ (Asia 20-00 NY crossesMidnight, London 02-05, NY AM 07-10, NY PM 13:30-16), si la sesión no está activa abre `active[key] = { startTime: c.time, endTime: c.time, ... }`; si ya está activa, **bumpea `active[key].endTime = c.time`** (L51) y high/low. Cuando una vela sale del horario, empuja `active[key]` a `boxes[]` y lo borra. Post-loop principal (L65-L68) empuja las sesiones aún activas a `boxes[]` (cubre el caso de "estoy en mitad de la KZ").

2. **`ctBucket` gate L175**: `const ctBucket = currentTime ? Math.floor(currentTime / 1800) : 0`. Bucket de **1800s = 30 min**.

3. **`useEffect` cache L176-L196**: deps `[cfg, tfAllowed, dataReady, activePair, tick, tfKey, ctBucket]`. Al disparar, lee `getSeriesData()`/`getRealLen()`, ejecuta `calcSessions`, filtra a `cfg.history` por tipo, escribe a `cachedSessionsRef.current`, llama `drawRef.current?.()`. **El gate efectivo es `ctBucket`**: aunque `tick` cambie en cada vela del replay, `ctBucket` solo cambia cada 30 min de `currentTime` → React detecta deps idénticas (mismo valor de cada dep) → useEffect NO se ejecuta de nuevo.

4. **`draw()` L199-L249**: lee `cachedSessionsRef.current` (L211), itera `sessions[]`, para cada `s` calcula `x1 = ts.timeToCoordinate(s.startTime)` y `x2 = ts.timeToCoordinate(s.endTime)` (L217-L218). Si cualquiera es null → `continue`. **`draw()` NO usa `currentTime` para nada** — solo lee de la cache.

5. **Disparadores adicionales de `draw()`** L340 `useEffect(... [tick, draw])` y L348 `useEffect(... [ctRedrawBucket, draw])` (bucket de 60s). Estos sí ejecutan en cada tick / cada minuto, **pero la cache leída es la misma** entre actualizaciones de `ctBucket` (30 min) → mismo rectángulo dibujado → sin efecto visible.

**El comentario L341-L346 dice verbatim "Redibujar también conforme avanza el replay — esto hace que la sesión activa 'crezca' visualmente durante el replay. Bucket de 60s para no saturar React (...). Visualmente, un step de 1 minuto en una caja de killzone de varias horas es imperceptible."** — la intención del diseñador era CRECER tick-a-tick, la implementación NO la cumple porque `draw()` no consume `currentTime`. Bug latente desde el origen.

### §6.2 S33.3 — Edit v1 fallido + hipótesis fuerte residual

Edit v1 sustituyó `x2 = ts.timeToCoordinate(s.endTime)` por `x2 = ts.timeToCoordinate(endTs)` donde `endTs = (s === activeS && curTs > s.endTime) ? curTs : s.endTime`. `activeS` identificada por `inSession(toNYHM(curTs), sess)` para encontrar el `activeKey` + última match en `cachedSessionsRef.current` por `key`.

Smoke local FAIL verbatim Ramón: "no se ve la kz hasta que llega al final".

Hipótesis fuerte residual (NO confirmada empíricamente en s33, **TEST DISCRIMINANTE PENDIENTE s34**): LWC `timeScale.timeToCoordinate(ts)` requiere que `ts` coincida con el `time` de alguna vela existente en la series data (o esté entre dos velas en el rango visible, pero verificable empíricamente). `currentTime` del replay avanza cada 60s ⟶ múltiplo de M1 ⟶ pero en TF M5/M15/M30 las velas tienen `time` cada 300s/900s/1800s ⟶ `curTs` NO coincide con vela del TF ⟶ `timeToCoordinate(curTs) = null` ⟶ check L223 `if (x2 == null) continue` ⟶ KZ activa salta dibujado entero.

La KZ "no se ve" hasta que `curTs` cae en múltiplo de 1800s (que es múltiplo común de todos los TF ≤ M30, por eso el "hasta que llega al final" coincide con el final del bucket de 30 min ⟶ cache se actualiza ⟶ `s.endTime` salta a nuevo valor ⟶ comportamiento parece "normal" hasta el siguiente bucket).

### §6.3 S33.3 — Edit v2 diseño completo

`lastRealCandle.time` está siempre alineado al TF visible por construcción de `setSeriesData([...agg, ...cr.phantom], agg.length)` — `agg` son las velas TF agregadas a partir de M1 base, `agg[last].time` es múltiplo del TF. `timeToCoordinate(lastRealTs)` no retornará null (la vela está presente en la series).

Cambio mínimo en `draw()`:

```javascript
// Antes del loop, una sola vez:
const allData = getSeriesData(), realLen = getRealLen()
const lastRealTs = (allData && realLen) ? allData[realLen - 1].time : null

// Dentro del loop:
const endTs = (s === activeS && lastRealTs && lastRealTs > s.endTime) ? lastRealTs : s.endTime
x2 = ts.timeToCoordinate(endTs)
```

Comportamiento esperado: la KZ activa crece **vela-a-vela del TF actual** (M1 cada minuto, M5 cada 5 min, M30 cada 30 min — coincide con el bucket viejo pero con la cache invalidada cada vela). Patrón TradingView/FX Replay puro.

**§38 estricto en s34**: aplicar primero el TEST DISCRIMINANTE de 1 línea (`console.log` comparando `timeToCoordinate(curTs)` vs `timeToCoordinate(lastRealTs)` durante replay) antes del Edit. Si confirma la hipótesis → aplicar Edit v2. Si NO → re-replantear.

### §6.4 S33.4 — descolocación fullscreen directo desde media pantalla

Caracterización Ramón verbatim al cierre Caso 3 S33.2: "se dibujan descolocadamente.. si no esta en pantalla competa y la pestaña donde esta el grafico esta a mitad de pantalla y directamente pongo fullscreen pues se desajustan... pero esto es algo k ocurre en produccion tambn".

Distinto a 5g.1 (manta invisibilidad post-DevTools close + drag). Distinto a 5g.2 (KZ redraw on TF change). Es una tercera cara del problema viewport-canvas-resize: transición fullscreen DESDE half-screen no dispara correctamente el redraw de KZ (probablemente `subscribeSizeChange` no detecta el cambio de tamaño del canvas durante la transición de fullscreen API del navegador, o el cambio ocurre antes de que `chartMap.current[ap].chart` esté listo).

NO investigado empíricamente en s33. Pre-existente en producción `bb37b66`. Diferido a s34+.

---

## §7 — Procedimiento de cierre sesión 33

### §7.1 Mover HANDOFF al repo

Tras descargar este HANDOFF a `~/Downloads/HANDOFF-cierre-sesion-33.md`:

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git checkout main
```

(Ya en main post-push `bb37b66`, working tree clean.)

```
mv ~/Downloads/HANDOFF-cierre-sesion-33.md refactor/
```

```
ls -la refactor/HANDOFF-cierre-sesion-33.md
```

```
wc -l refactor/HANDOFF-cierre-sesion-33.md
```

### §7.2 git add + commit (en main)

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git add refactor/HANDOFF-cierre-sesion-33.md
```

```
git status
```

```
git commit -m "docs(sesion-33): cerrar sesion 33 con S33.2 cosmetico chartTick huerfana KZ CERRADO estructuralmente en produccion (bb37b66, +1/-1 +1/-1 neto) + deuda 4.5/5f.1 __algSuiteExportTools CIERRE COLATERAL verificado en bytes (codigo zombi eliminado cluster B s20-s31, deuda arrastrada 20 sesiones erroneamente como ABIERTA) + S33.3 KZ por tramos cada 30 min diagnostico arquitectonico completo (ctBucket 1800s + calcSessions endTime cacheado + draw lee cache) + Edit v1 Camino A naive FAILED rollback inmediato sin commit + instrumentacion KZ-DBG-S33.3 patron 38 caracterizacion 100 verbatim del Delta 1800s + Edit v2 disenado completo lastRealCandle.time para s34 + S33.4 descolocacion fullscreen directo desde media pantalla NUEVA caracterizada pre-existente + 2 errores 9.4 propios CTO registrados sin maquillaje (Edit v1 naive sin verificacion empirica + bloque shell sin cd previo) + lecciones 39 40 41 nuevas (deuda muerta colateralmente + agotar verificacion empirica antes de Edit + diagnostico empirico console.log patron 38 verificado por segunda vez)"
```

```
git --no-pager log --oneline -3
```

### §7.3 Push a main

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git push origin main
```

### §7.4 Verificación final cierre sesión 33

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git --no-pager log --oneline -5
```

Esperado: HEAD nuevo `<HASH-HANDOFF-s33>` sobre `bb37b66` (S33.2 cosmético) sobre `9cbcf7a` (HANDOFF s32) sobre `eb4c2ab` (fix acceso) sobre `032a4e3` (HANDOFF s31).

Sesión 33 cerrada al carácter.

---

## §8 — Métricas sesión 33

- **Inicio efectivo**: ~20 may 2026 18:00 hora local (sesión continuó parcialmente el 21 may).
- **Total efectivo**: ~5h activas (incluye 2 sesiones temporales separadas por sueño).
- **Commits funcionales producidos**: 1 (`bb37b66` S33.2 cosmético chartTick).
- **Commits funcionales planeados pero NO producidos**: 1 (S33.3 v1 rollbackeado antes de commit).
- **Edits funcionales aplicados**: 1 (`+1/-1 +1/-1` neto — sin revert).
- **Edits funcionales revertidos**: 1 (S33.3 v1 naive, rollback inmediato post-FAIL Ramón).
- **Edits instrumentales (no funcionales) aplicados**: 1 (`[KZ-DBG-S33.3]` para diagnóstico §38, rollbackeado al cierre).
- **Migraciones Supabase**: 0.
- **Líneas tocadas netas en código (commit)**: 0 (sustitución `+1/-1` × 2 archivos).
- **Push a main**: 1 funcional (`bb37b66`) + 1 docs HANDOFF s33 (post-redacción).
- **Errores §9.4 propios CTO capturados**: 2 (§3.1 Edit v1 naive, §3.2 bloque shell sin cd). Ambos registrados sin maquillaje.
- **Bugs cerrados**: 2 (S33.2 cosmético chartTick + deuda 4.5/5f.1 cierre colateral).
- **Bugs caracterizados nuevos**: 2 (S33.3 + S33.4).
- **SEXTO COMMIT FUNCIONAL POST-CLUSTER-B**: `bb37b66`.
- **Validación**: smoke local 3/3 PASS + smoke producción 2/2 PASS (Ramón Mac).
- **Cluster A intocado**: decimotercera sesión consecutiva.
- **3 invariantes fase 4 intactas**: decimotercera sesión consecutiva.

---

## §9 — Aprendizajes generales del proyecto (acumulados sesiones 13-33)

> Sección que persiste a través de HANDOFFs.

1-38: lecciones acumuladas s13-s32 preservadas íntegras (ver HANDOFF s32 §9).

39. **NUEVO al carácter sesión 33 — deuda arrastrada ≥2 sesiones puede estar muerta colateralmente; refinamiento de §34.** §34 dice "inventarios caducan, re-verificar bytes antes de heredar números de línea". §39 dice "deudas también caducan — pueden estar muertas colateralmente por reestructuración en otra sub-fase". Caso al carácter: deuda 4.5/5f.1 (`__algSuiteExportTools` muerto) estuvo en HANDOFFs s12→s32 como "⏳ ABIERTA backlog (sub-fase 5f.1)" durante 20 sesiones consecutivas — ningún CTO en ninguna sesión re-verificó bytes. En s33, primer paso de "atacar la deuda" reveló que el código zombi ya no existía en bytes (eliminado colateralmente durante cluster B s20-s31). **Aplicar s34+**: antes de declarar prioridad o ataque sobre una deuda heredada, ejecutar `grep -rn` verbatim sobre el símbolo/patrón en código vivo. Si vacío → cierre colateral documentado, NO Edit. Si presente → atacar normalmente. Aplica también a `debugCtx` muerto y `chartTick` huérfana KZ que se hicieron antes en s33 (ambas verificadas; la primera diferida a s34, la segunda cerrada con Edit S33.2 porque seguía viva).

40. **NUEVO al carácter sesión 33 — Edit que reemplaza un valor cacheado con un valor "vivo" debe verificar empíricamente que el valor vivo es compatible con la API que lo consume.** Caso al carácter: Edit v1 Camino A S33.3 sustituyó `x2 = ts.timeToCoordinate(s.endTime)` por `x2 = ts.timeToCoordinate(curTs)` asumiendo que LWC `timeToCoordinate` acepta cualquier timestamp. La asunción NO se verificó empíricamente antes del Edit. FAIL detectado en smoke local — la hipótesis fuerte residual post-FAIL es que LWC `timeToCoordinate` retorna `null` para timestamps no alineados al `time` de las velas existentes. **Aplicar s34+**: cuando un Edit cambia la "naturaleza" de un valor pasado a una API externa (cacheado→vivo, alineado→arbitrario, etc.), agregar un test discriminante de 1-2 líneas (instrumentación temporal) ANTES del Edit funcional. Coste: 5 minutos. Beneficio: evita FAIL en smoke + rollback + replanteo. Especialmente crítico con APIs vendor (LWC) cuyo contrato no está auditado en cabeza.

41. **NUEVO al carácter sesión 33 — diagnóstico empírico con `console.log` durante replay activo es disciplina §38 verificada exitosa por SEGUNDA vez.** Primera vez s31 (`[ILI-DBG]` cazó `result=12298.8` fraccional → fix Math.floor s31 `6dd0629`). Segunda vez s33 (`[KZ-DBG-S33.3]` capturó Δ=1800s entre saltos `endTime` → confirmó bucketing 30 min y descartó hipótesis "activeKey histórico"). Patrón formalizado: cuando una causa raíz arquitectónica no es obvia desde lectura estática de bytes, **instrumentar primero con console.log acotado** (throttle natural via `window.__xxxLast` o sentinel similar para no saturar consola) → ejecutar smoke con caso reproducible → capturar logs verbatim → analizar verbatim los datos → hipótesis fuerte derivada → Edit. **Aplicar s34+** especialmente para deudas con componente temporal (timing, race conditions, caching cycles, debounce/throttle).

---

## §10 — Cierre

Sesión 33 deja al carácter:

- **S33.2 (cosmético `chartTick` huérfana KZ) CERRADA ESTRUCTURALMENTE EN PRODUCCIÓN al carácter** — Edit `+1/-1 +1/-1` neto, build PASS, smoke local 3/3 + smoke producción 2/2 PASS. **SEXTO COMMIT FUNCIONAL EN MAIN POST-CLUSTER-B** (`bb37b66`).
- **Deuda 4.5/5f.1 (`__algSuiteExportTools` muerto) CIERRE COLATERAL verificado en bytes** — código zombi ya eliminado durante cluster B s20-s31. Deuda arrastrada 20 sesiones erróneamente como "⏳ ABIERTA backlog". Sin Edit, solo documentación. Lección §39 NUEVA derivada.
- **S33.3 (KZ por tramos cada 30 min) DIAGNÓSTICO ARQUITECTÓNICO COMPLETO + EDIT v1 FALLIDO ROLLBACKEADO + EDIT v2 DISEÑADO** — instrumentación empírica `[KZ-DBG-S33.3]` patrón §38 confirmó bucketing 30 min al carácter (Δ=1800s entre saltos `endTime`). Hipótesis fuerte residual: `timeToCoordinate(curTs)` retorna null para timestamps no alineados al TF. Edit v2 diseñado completo con `lastRealCandle.time` para aplicación s34. Lección §40 NUEVA derivada (verificación empírica antes de Edit con API externa). Lección §41 NUEVA derivada (console.log diagnóstico patrón §38 verificado segunda vez).
- **S33.4 (descolocación fullscreen directo desde media pantalla) CARACTERIZADA al carácter** — pre-existente en producción `bb37b66`, scope distinto a 5g.1 y 5g.2. Diferida a s34+.
- **2 errores §9.4 propios CTO registrados sin maquillaje** (§3): §9.4.1 Edit v1 naive sin verificación empírica (cazado por Ramón en smoke local), §9.4.2 bloque shell sin `cd` previo (autocorregido). Ambos sin impacto en producción. Lección §14 18ª sesión consecutiva: cuestionamiento de Ramón decisivo en cazar §9.4.1 antes de impacto.
- **3 lecciones nuevas §39 (deuda muerta colateral) + §40 (verificación empírica antes de Edit) + §41 (console.log diagnóstico §38 verificado segunda vez)** formalizadas §9.
- **Cero migraciones Supabase. `_SessionInner.js` tocado en 1 línea de JSX (zona segura). Cluster A INTOCABLE preservado** por decimotercera sesión consecutiva. 3 invariantes fase 4 intactas decimotercera sesión consecutiva.
- **Producción mejorada (cosmética)**: ruido cognitivo eliminado en KZ — prop pasada que nunca consumía. Net `-2` ocurrencias del símbolo `chartTick` en el árbol KZ. Estándar §1/§37 verificado: en escala, una prop pasada que no se consume es ruido inadmisible.

Próximo HANDOFF (cierre sesión 34) debe reportar al carácter:
- Si S33.3 v2 (Edit con `lastRealCandle.time`) se aplicó correctamente y cerró el bug "por tramos cada 30 min" en producción.
- Si el TEST DISCRIMINANTE previo al Edit v2 (§38 estricto) confirmó la hipótesis fuerte residual o la refutó.
- Si S33.4 (descolocación fullscreen) se atacó, caracterizó más profundamente o se difirió con plan de ataque.
- Si formato 1-paso-1-mensaje + bloques shell auto-contenidos con `cd` previo aplicados ESTRICTAMENTE (corregir §3.2 s33).
- Si lecciones §39 + §40 + §41 aplicadas (re-verificación bytes en deudas heredadas, verificación empírica antes de Edit con API externa, console.log diagnóstico patrón §38 cuando proceda).
- Si HANDOFF s33 indexado en project_knowledge al arranque s34.

Si sesión 34 NO avanza prioridades al carácter, el HANDOFF lo dice al frente sin maquillaje — patrón §0 mantenido por **decimocuarta sesión consecutiva**.

**Mensaje del CTO al cierre al carácter**: sesión 33 cerró un cosmético menor pero entregó algo más valioso: el diagnóstico arquitectónico al carácter de un bug visible que el código original prometía resolver pero nunca cumplió. El comentario L341-L346 ("hace que la sesión activa 'crezca' visualmente durante el replay") mentía a la implementación — el diseñador original sabía qué quería pero la cache cortocircuitaba la intención. Ramón cazó el FAIL del Edit v1 naive en menos de un minuto con el smoke discriminante, y su reporte "cada 30 min, en punto y en media" orientó todo el diagnóstico empírico hacia la causa real (decimoctava sesión consecutiva que tu input redirige el camino del CTO). El Edit v1 nunca llegó a producción, el diagnóstico está al carácter, Edit v2 está diseñado limpio. Falta la verificación empírica final con un console.log de 1 línea — disciplina §38 estricta para s34. Los 2 errores §9.4 propios (Edit v1 sin verificación empírica + bloque shell sin cd) están registrados sin maquillaje. La verdad es que el segundo error fue irrelevante (autocorrección en frío) pero el primero costó turnos y tiempo de tu smoke — y la lección §40 derivada es la que evitará el patrón en s34+: ANTES de cambiar la naturaleza de un valor pasado a una API externa, verificar empíricamente que la API acepta el valor nuevo. Cinco minutos de instrumentación valen un rollback evitado. Esa es la verdad sin maquillaje al carácter.

---

*Fin del HANDOFF cierre sesión 33. Redactado por CTO/revisor tras commit `bb37b66` push exitoso a `origin/main` + smoke local 3/3 PASS + smoke producción 2/2 PASS (Ramón Mac) + rollback bicapa verificado de instrumentación temporal `[KZ-DBG-S33.3]`. Working tree limpio al cierre redacción. Producción cluster B + 5g.1 + 5g.2 + fix-modal + fix-4.6 + fix-acceso-revoke + cosmético-chartTick `bb37b66` estable al carácter desde 20 may 2026 ~21:00 hora local. Pendiente de mover al repo + commit a main + push a `origin/main` por Ramón según §7.*
