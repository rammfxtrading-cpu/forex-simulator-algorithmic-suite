# HANDOFF — cierre sesión 35

> Sesión 35 cerrada el 22 mayo 2026, ~15:25 hora local.
> Sesión 35 = **prioridad 1 HANDOFF s34 §5.1**: S33.4 "descolocación fullscreen directo desde media pantalla".
> **Resultado al carácter sin maquillaje**: S33.4 SIGUE ABIERTA. Causa raíz arquitectónica CARACTERIZADA EMPÍRICAMENTE al carácter en datos verbatim (race scale LWC stale vs ResizeObserver síncrono sobre parent del canvas KZ). **Fix A (eliminar `draw()` del callback ResizeObserver) APLICADO en working tree + REFUTADO en smoke local + ROLLBACK BICAPA LIMPIO PRE-COMMIT**. Cero contaminación a `origin/main`. Producción `6abc870` intacta al carácter. Cero commits funcionales producidos. 1 caracterización empírica capturada permanente (200+ logs `[KZ-DBG-S33.4]` con patrón aritmético perfecto draw#695 stale vs draw#697 fresh tras `subscribeSizeChange` LWC ~10ms después).
> **Lección §43 NUEVA**: eliminar un disparador de redraw "incorrecto" sin garantizar que existe disparador "correcto" inmediato en TODOS los paths posibles introduce regresión de invisibilidad transitoria. Patrón conceptualmente §16 s24 (fix consumer-side insuficiente race LWC) aplicado a invalidación de event handlers.
> **Lección §14 (intuición Ramón = input técnico encriptado) vigésima sesión consecutiva**: tu cazada verbatim ("desaparecen al expandir, doble clic intermitente, valla mierda") tras Fix A evitó push a producción de un Edit que rompía el caso control bueno (doble-click barra título macOS) + introducía invisibilidad transitoria en expandir Chrome + NO solucionaba el path original fullscreen.
> Próxima sesión = sesión 36. Prioridad 1 = S33.4 retomada con Fix B (instrumentación adicional discriminante RAF timing + comparar `priceToCoordinate` antes vs después de RAF post-resize). Prioridad 2 = cosméticas residuales fase 5 (5f.2 polling / 5e.4 debugCtx) — re-verificar bytes ANTES (§39 estricto).

---

## §0 — Estado al cierre sesión 35, sin maquillaje

**Sesión 35 produjo 0 commits funcionales al carácter en main**. HEAD main al cierre = `<HASH-HANDOFF-s35>` sobre `5c5036b` (HANDOFF s34) sobre `6abc870` (S33.3 v2.1) sobre `5d7c553` (HANDOFF s33) sobre `bb37b66` (S33.2 cosmético chartTick) sobre `9cbcf7a` (HANDOFF s32) sobre `eb4c2ab` (fix acceso-revoke) sobre `032a4e3` (HANDOFF s31).

`origin/main` post-cierre s35 = `<HASH-HANDOFF-s35>` (HANDOFF docs, sin runtime nuevo). Producción Vercel runtime efectivo `6abc870` desde 21 may 2026 ~18:24 hora local — **SIN CAMBIO desde cierre s34**.

**Realidad sin maquillaje al carácter**:

1. **S33.4 SIGUE ABIERTA al carácter**. NO cerrada en s35. Fix A diseñado por CTO sobre logs empíricos `[KZ-DBG-S33.4]` (verificación bicapa Edit instrumental + smoke discriminante ejecutado al carácter por Ramón con captura de ~120 logs verbatim de 4 paths de resize) — pero **Fix A REFUTADO empíricamente en smoke local pre-commit**. Ramón cazó al carácter 3 regresiones durante smoke: (a) path "expandir botón Chrome" → KZ desaparecen hasta click manual (antes: alineación fluida post-resize), (b) path "doble-click barra título macOS" → intermitencia visual (antes: control PASS sin problema), (c) path original "fullscreen botón simulador" → NO solucionado, KZ siguen descolocadas igual que pre-Fix-A. Rollback bicapa limpio inmediato vía `git checkout -- components/KillzonesOverlay.js`. Cero contaminación `origin/main`.

2. **S33.4 caracterización empírica COMPLETADA al carácter en s35**. Instrumentación temporal `[KZ-DBG-S33.4]` insertada en 4 puntos: entry `resizeCanvas` L153, entry `draw` L221, callback `ResizeObserver` L337-L342 (wrapper antes/después), handler `subscribeSizeChange` L348-L352 (wrapper antes/después). Total +44/-2 líneas instrumentales. Logs capturados verbatim por Ramón en 4 paths secuenciales (doble-click barra título → expandir Chrome → contraer Chrome → fullscreen + esc). Patrón aritmético perfecto al carácter cazado:

   | Log seq | Evento | canvasH | sampleY `priceToCoordinate(close)` |
   |---|---|---|---|
   | 693 | ResizeObserver-fired | — | — |
   | 694 | resizeCanvas | 1928→**2296** (canvas KZ ya redimensionado) | — |
   | 695 | draw (síncrono al ResizeObserver) | **2296** | **285.227** ← STALE (coord del scale LWC pre-resize) |
   | 696 | subscribeSizeChange-fired (~10ms después) | — | — |
   | 697 | draw (síncrono a subscribeSizeChange LWC) | 2296 | **341.355** ← FRESH (coord del scale LWC post-resize) |

   Patrón verificable al carácter en eventos 704→708, 717→721, 734→738 y subsiguientes. Confirmación al carácter de hipótesis fuerte sin ambigüedad: race scale LWC stale entre `ResizeObserver(parentElement)` síncrono y `subscribeSizeChange` LWC asíncrono ~10ms después.

3. **Fix A diseñado y refutado al carácter — error §9.4 propio CTO** (registrado §3 sin maquillaje). Diseño Fix A: eliminar `draw()` del callback `ResizeObserver` L307. Razonamiento CTO: si el `draw()` síncrono pinta con scale stale, eliminarlo y dejar el redraw exclusivamente al `subscribeSizeChange` LWC que dispara con scale fresh. Edit `+1/-1` verbatim: `() => { resizeCanvas(); draw() }` → `() => { resizeCanvas() }`. Verificación bicapa shell PASS al carácter: `git diff 6abc870` = +1/-1 exacto, `wc -l = 505`, instrumentación 100% rollbackeada, `grep -c "KZ-DBG-S33.4" = 0`. Build PASS `Compiled successfully` sin warnings. Smoke local 4 paths FAIL al carácter en 3 de 4 paths (control "doble-click barra título" degradado de PASS a intermitente, expandir botón regresión nueva invisibilidad, fullscreen botón no solucionado, contraer botón no testeado por Ramón antes de PARAR).

4. **Lección §43 NUEVA formalizada §9**: eliminar un disparador de redraw "incorrecto" (con scale stale) sin garantizar que existe un disparador "correcto" inmediato (con scale fresh) en TODOS los paths posibles introduce regresión de **invisibilidad transitoria** entre el resize del canvas y la siguiente notificación de scale-fresh. El gap temporal varía por path (doble-click barra título: animación zoom macOS dispara N ResizeObservers en serie, pocos `subscribeSizeChange` intermedios → intermitencia; expandir botón Chrome: gap mayor antes de `subscribeSizeChange` → desaparición visible hasta click; fullscreen: `subscribeSizeChange` puede no llegar a tiempo o llegar con scale aún no completamente actualizado → bug original persiste). Refinamiento de §16 s24 (fix consumer-side insuficiente race LWC) aplicado a invalidación de event handlers (no solo a invalidación de cache de datos).

5. **Lección §14 (intuición Ramón = input técnico encriptado) vigésima sesión consecutiva**: tu reporte verbatim post-smoke Fix A ("desaparecen al expandir, doble clic intermitente, valla mierda") cazó al carácter las 3 regresiones antes de declarar Fix A cerrado falsamente y antes de push a producción. CTO había interpretado los logs empíricos correctamente en aislamiento (race scale LWC stale CONFIRMADO) pero diseñó Fix A sin enumerar consecuencias en TODOS los paths. Tu smoke discriminante en 8 paths previstos (de los cuales ejecutaste los primeros 3 antes de PARAR) reveló el problema arquitectónico del Fix A en <5 minutos. Sin tu observación, Fix A habría llegado a producción introduciendo regresión nueva.

6. **Cero migraciones Supabase ejecutadas** (CLAUDE.md §3.1). Cero cambios de esquema/políticas.

7. **Edits funcionales que llegaron a producción**: 0. **Edits funcionales aplicados en working tree + rollback limpio**: 1 (Fix A `+1/-1` refutado).

8. **Edits instrumentales (no funcionales) aplicados + revertidos**: 1 (`[KZ-DBG-S33.4]` insertado para PASO 2 caracterización empírica §38, +44/-2, revertido limpio dentro del rollback Fix A — instrumentación nunca contaminó commit).

9. **Errores §9.4 propios CTO registrados sin maquillaje (§3 abajo)** — 1 error propio significativo en s35 (diseño Fix A sin enumerar consecuencias en todos los paths). Registrado íntegro.

10. **Formato 1-paso-1-mensaje (lección §31 s29 + §3.3 s32) + bloques shell auto-contenidos con `cd` (§3.2 s33)**: aplicado al carácter estrictamente toda la sesión.

11. **3 invariantes fase 4 intactas decimoquinta sesión consecutiva**. Cluster A INTOCABLE preservado decimoquinta sesión consecutiva.

---

## §1 — Qué se hizo en sesión 35

### §1.1 PASO 0 + PASO 0.5

PASO 0: 4 búsquedas dirigidas `project_knowledge_search` (HANDOFF s34 KZ XY + sesión 34 endpoint vivo + fase-5-plan residuales + CLAUDE.md reglas). HANDOFF s34 NO indexado al arranque — patrón lag histórico (s24/s27/s29/s30/s31/s33 + s34 ahora). Plan B aplicado: Ramón ejecutó `cat refactor/HANDOFF-cierre-sesion-34.md` desde shell zsh nativa y pegó el contenido íntegro al chat. CTO leyó HANDOFF s34 entero al carácter: §0 sin maquillaje + §1 PASO 0-9 (S33.3 v2.1 detalle completo) + §3 error §9.4 propio (1 esta sesión, diseño Edit v2 inicial sin contemplar cache stale multi-eje) + §4 deudas + §5 plan táctico s35 + §6 causa raíz S33.3 v2.1 multi-eje XY + §9 lección §42 NUEVA + §10 cierre.

Referencias indirectas a HANDOFFs s33 + s32 + lecciones §37-§42 cubiertas vía §1.1 + §5.2 + §9 de HANDOFF s34. CLAUDE.md §1-§4 cubierto en búsqueda inicial.

PASO 0.5 verificación shell PASS al carácter — bloque único auto-contenido con `cd` primera línea (§3.2 corregido). Outputs verificados al carácter:
- HEAD `5c5036b` (HANDOFF s34) → `6abc870` (S33.3 v2.1) → `5d7c553` (HANDOFF s33) → `bb37b66` (S33.2) → `9cbcf7a` (HANDOFF s32).
- 3 invariantes fase 4 intactas: `cr.series.setData` + `cr.series.update` vacíos, `computePhantomsNeeded` L116/L1145/L1224.
- `Math.floor((cachedData.length - 1)` L1596 vendor (fix 4.6 s31 vivo).
- `revalidate` + `visibilitychange` + `setInterval(revalidate` en useAuth.js L62/L79/L80 + cleanup L84 (fix acceso-revoke s32 vivo). `wc -l useAuth.js = 95` ✓.
- S33.3 v2.1 vivo en KillzonesOverlay.js: `currentTimeRef` L130, bloque endpoint vivo L223-L246, sustitución loop L256-L259, `wc -l = 505` ✓.
- Hallazgo significativo inventario inicial S33.4: `grep "fullscreenchange"` ambos archivos = **CERO matches**. No hay listener `fullscreenchange` explícito. La transición fullscreen depende enteramente de `ResizeObserver` en `_SessionInner.js:905` + `ResizeObserver` L307 + `subscribeSizeChange` LWC L318 + `resizeCanvas` L151 en KZ.

### §1.2 PASO 1 — Test de viveza S33.4 §39 estricto

Antes de invertir en inventario read-only flujo viewport-canvas-resize, CTO aplicó §39 estricto: re-verificar si S33.4 sigue viva en producción runtime `6abc870` o cerró colateralmente con S33.3 v2.1.

Ramón ejecutó test reproducción producción al carácter:
1. Ventana navegador en media pantalla.
2. Sesión `042ea687-968c-42b3-b1ce-29673b3c5b92` (EURUSD, M15, multiples KZ visibles en zona izquierda + zona central).
3. Click botón fullscreen del simulador.
4. Captura visual entregada al carácter por Ramón mostrando bug VIVO: cluster izquierdo KZ (Lun-Mar) sobre velas correctamente alineado, PERO cluster central aislado (Lun 21:00 - Mar 06:00 aprox) con 3 rectangles flotando en zona 1.15700-1.15900 mientras las velas en esa franja horizontal están en 1.15300-1.15500. **DESCOLOCADOS verticalmente al carácter**.

**S33.4 CONFIRMADA VIVA en producción `6abc870`**. NO cierre colateral por S33.3 v2.1.

### §1.3 PASO 1.5 — Test discriminante recovery + drawings

CTO aplicó §38 (agotar diagnóstico empírico antes de diseñar fix). Tests discriminantes ejecutados por Ramón:

**Test 1 — recovery al salir de fullscreen**:
- Estado fullscreen con KZ descolocadas.
- Pulsar `esc` → vuelta a media pantalla.
- Veredicto Ramón verbatim: "no vuelven solas, cuando hago clic pues vuelven al sitio".
- Lectura: bug persiste post-`esc`. Click cualquiera (drag, interacción con chart) dispara `draw()` nuevo que recalcula coords correctas.

**Test 2 — drawings persistidos durante fullscreen**:
- Media pantalla con drawings dibujados (TrendLine + Rectangle persistidos).
- Click fullscreen simulador.
- Veredicto Ramón verbatim: "solo ocurre en las kz".
- Lectura: drawings NO sufren el bug. KZ es el ÚNICO overlay 2D custom afectado. Hipótesis estructural: drawings renderizados por LWC nativo + vendor line-tools usan scheduling interno LWC coordinado con scale-update. KZ usa canvas 2D propio con coords obtenidas de chart LWC en momento síncrono al resize.

**Test 3 — resize ventana navegador vs fullscreen específico**:
- Drag borde derecho/inferior ventana navegador para redimensionar.
- Veredicto Ramón verbatim: "por el botón de expandir ventana sí ocurre pero al momento se pone bien, pero cuando vuelvo a media pantalla por el mismo botón se descoloca, osea sí ocurre... pero doble clic en el espacio en blanco arriba donde van las pestañas pues no ocurre".
- Caracterización al carácter por path:

  | Path resize | Bug visible | Auto-recovery |
  |---|---|---|
  | Botón expandir Chrome (media → maximize) | SÍ | SÍ rápido |
  | Botón contraer Chrome (maximize → media) | SÍ | **NO** |
  | Botón fullscreen simulador | SÍ | NO |
  | Doble-click barra título (macOS Zoom) | **NO** | — |
  | Drawings cualquier path | NO | — |

  Patrón al carácter en bytes: doble-click barra título funcionaba como CONTROL bueno pre-Fix-A. Cualquier path que pasara por `ResizeObserver(parentElement)` con cambio de tamaño abrupto fallaba. Path "doble-click barra título" presumiblemente disparaba la animación zoom macOS con timing distinto que NO chocaba con scale LWC.

**Caracterización adicional Ramón verbatim**: "afecta a las que se ven en pantalla, si se ven más pues más". Confirmación al carácter: el bug afecta a TODAS las KZ visibles en viewport, y escala con tamaño fullscreen. NO selectivo aleatorio.

### §1.4 PASO 1 inventario read-only `resizeCanvas` + `ResizeObserver` + `subscribeSizeChange` en bytes

`sed -n '145,175p'` + `sed -n '300,330p'` + `sed -n '370,380p'` + `grep -n "subscribeSizeChange\|unsubscribeSizeChange\|priceToCoordinate\|timeToCoordinate"`. Hallazgos al carácter:

- `resizeCanvas` L151-L165: `useCallback`. Redimensiona canvas KZ según `parent.clientWidth/clientHeight × dpr`. NO toca scale del chart LWC. Self-contained al canvas KZ.
- `ResizeObserver` L307 al carácter en bytes: `new ResizeObserver(() => { resizeCanvas(); draw() })` observa `canvasRef.current.parentElement`. Callback **síncrono**: `resizeCanvas() + draw()` inmediato sin RAF/setTimeout.
- `subscribeSizeChange` LWC L318: handler L313 `() => draw()` SOLO redibuja, NO recalcula canvas KZ. Diseñado por LWC para notificar "mi scale terminó de actualizarse post-resize".
- `priceToCoordinate`/`timeToCoordinate` se llaman 4 veces L260-263 (s.startTime, endTs, sHigh, sLow) — todas dentro del loop draw().

### §1.5 PASO 2 TEST DISCRIMINANTE §40/§41 — instrumentación temporal [KZ-DBG-S33.4]

CTO redactó prompt para Claude Code con Edit instrumental aislado en 4 hunks. Tag `[KZ-DBG-S33.4]`. Edit aplicado por Claude Code: `+44/-2 netas`. Verificación bicapa shell desde Ramón PASS al carácter: `git diff --stat = +44/-2`, `grep -n KZ-DBG-S33.4 = 10 matches L153/L156/L221/L232/L337/L339/L342/L348/L350/L352`, working tree modified solo `KillzonesOverlay.js`, `wc -l 547`.

Smoke discriminante: `npm run dev` + Ramón abre sesión + TF=M15 + DevTools console + "Preserve log" + filtro `KZ-DBG-S33.4` + Clear console + ejecuta 4 paths en orden (doble-click barra título → expandir botón Chrome → contraer botón Chrome → fullscreen botón simulador + esc). Captura ~120 logs verbatim entregados por Ramón al chat.

**Patrón aritmético perfecto cazado al carácter** en eventos 693→697 (transición fullscreen):

```
KillzonesOverlay.js:339 [KZ-DBG-S33.4] ResizeObserver-fired#693 {t: '966256.3'}
KillzonesOverlay.js:156 [KZ-DBG-S33.4] resizeCanvas#694 {parentW: 1773, parentH: 1148, canvasW: 1684, canvasH: 1928, dpr: 2, …}
KillzonesOverlay.js:232 [KZ-DBG-S33.4] draw#695 {sampleX: 631.54..., sampleY: 285.227..., canvasW: 3546, canvasH: 2296, t: '966257.1'}
KillzonesOverlay.js:342 [KZ-DBG-S33.4] ResizeObserver-end#693 {t: '966257.3'}
KillzonesOverlay.js:350 [KZ-DBG-S33.4] subscribeSizeChange-fired#696 {t: '966266.6'}
KillzonesOverlay.js:232 [KZ-DBG-S33.4] draw#697 {sampleX: 631.54..., sampleY: 341.355..., canvasW: 3546, canvasH: 2296, t: '966266.8'}
KillzonesOverlay.js:352 [KZ-DBG-S33.4] subscribeSizeChange-end#696 {t: '966266.9'}
```

Interpretación al carácter:
- Evento 693-695: `ResizeObserver` dispara síncrono → `resizeCanvas()` redimensiona canvas KZ de 1928→2296 (DPR=2 sobre parent 1148px) → `draw()` síncrono inmediatamente después.
- Crítico: en draw#695, canvas KZ **ya está 2296 de alto** pero `priceToCoordinate(close)` retorna **285.227** que es la coord del scale LWC PRE-resize (cuando el chart era 964px de alto). El chart LWC interno aún NO se ha redimensionado en ese instante. **KZ se pinta con coords stale en canvas ya redimensionado → desalineadas verticalmente al carácter**.
- ~10ms después (evento 696-697), `subscribeSizeChange` LWC dispara (LWC notifica que SU scale está actualizado) → `draw()` síncrono inmediatamente → `priceToCoordinate(close)` ahora retorna **341.355** (coord correcta para scale LWC post-resize). KZ se pinta correctamente.

Patrón verificable al carácter sin ambigüedad en eventos 704→708, 717→721, 734→738, etc. Hipótesis fuerte CONFIRMADA empíricamente.

**Por qué drawings NO sufren**: drawings nativos LWC + vendor line-tools renderizan vía LWC internamente con scale + render coordinados atómicamente. KZ es el ÚNICO overlay 2D custom que pinta sincrónicamente al `ResizeObserver` del parent.

Patrón conceptualmente §42 (cache stale invalida derivadas) aplicado a **scale LWC stale** (no a cache `cachedSessionsRef` que es lo que cerró S33.3).

### §1.6 PASO 3 Fix A diseñado y aplicado al carácter

Razonamiento CTO al carácter sobre logs:
- Si `ResizeObserver` síncrono dispara `draw()` con scale stale → la KZ pintada en ese frame está descolocada.
- Si ~10ms después `subscribeSizeChange` LWC dispara `draw()` con scale fresh → KZ se repinta correctamente.
- **Hipótesis Fix A**: eliminar `draw()` del callback `ResizeObserver` y dejar el redraw exclusivamente al `subscribeSizeChange` LWC.

Diff propuesto verbatim: `() => { resizeCanvas(); draw() }` → `() => { resizeCanvas() }`. +1/-1 sobre baseline 6abc870.

CTO redactó prompt único para Claude Code con Edit funcional unificado: hunk 1 rollback instrumentación completo (4 sub-hunks invertir bloques [KZ-DBG-S33.4]) + hunk 2 fix funcional Fix A.

Edit aplicado al carácter por Claude Code: `+1/-1` neto sobre baseline 6abc870. Verificación bicapa shell desde Ramón PASS al carácter:
- `git diff --stat = +1/-1`.
- `git diff 6abc870 -- components/KillzonesOverlay.js` = +1/-1 exacto, solo sobre línea ResizeObserver L307.
- `grep -c "KZ-DBG-S33.4" = 0` (instrumentación 100% rollbackeada).
- `grep -n "new ResizeObserver"` L307 = `() => { resizeCanvas() }`.
- `grep -n "const handler"` L311 = `const handler = () => draw()`.
- `wc -l = 505` (idéntico baseline).

`npm run build` PASS limpio (`Compiled successfully` sin warnings).

### §1.7 PASO 4 — Smoke local 4+4 paths Fix A REFUTADO al carácter

Ramón ejecutó `npm run start` (con kill PID 33785 ocupando puerto 3000 + segundo build PASS confirmando).

Ramón abrió `localhost:3000`, cargó sesión con KZ visibles, ejecutó smoke al carácter. Reporte verbatim Ramón post-smoke:

> "para, pork no sirve lo k has hecho... no has solucionado nada y encima lo k estaba un poco bien ahora lo jodes... pork ahora desaparecen al expandir la pantalla... cuando hago clic aparecen bien, pero es una mierda eso asi... doble clic en la pestaña para agrandar la pantalla pues iba fluido, ahora hace como intermintente... valla mierda de verdad"

Diagnóstico al carácter del fallo Fix A:

| Path testeado | Pre-Fix-A | Post-Fix-A | Lectura |
|---|---|---|---|
| Expandir botón Chrome (media → maximize) | KZ alineadas correctamente post-resize (auto-recovery rápido) | **KZ DESAPARECEN hasta click manual** | Regresión nueva — Fix A elimina el `draw()` síncrono pero el `subscribeSizeChange` LWC dispara con gap visible (> percepción humana ~100ms) → invisibilidad transitoria |
| Doble-click barra título (control bueno) | KZ alineadas fluidas | **Intermitencia visual** | Regresión nueva — animación zoom macOS dispara MUCHOS `ResizeObserver` en serie durante la animación, `subscribeSizeChange` no acompaña a cada uno → KZ "parpadean" entre redibujados desfasados |
| Fullscreen botón simulador | KZ descolocadas (bug original S33.4) | **KZ descolocadas igual** | Fix A NO resuelve el path original — `subscribeSizeChange` LWC en fullscreen llega con scale aún no completamente actualizado en algunos casos, o no llega a tiempo para repintar |
| Contraer botón Chrome | KZ descolocadas (bug S33.4) | NO testeado | Ramón PARÓ smoke antes de testear path 3, por frustración con regresiones nuevas |

**Lectura arquitectónica al carácter**: Fix A trata el síntoma (draw con scale stale) atacando un disparador legítimo del redraw (el ResizeObserver detecta cambio físico del contenedor, su responsabilidad es notificar para repintar) sin garantizar que existe un disparador alternativo con scale fresh en TODOS los paths posibles. El `subscribeSizeChange` LWC ES un disparador candidato pero (a) no es síncrono al `ResizeObserver` (gap ~10ms en logs, mayor en paths complejos), (b) no dispara con frecuencia suficiente durante animaciones rápidas (doble-click), (c) puede no dispararse en fullscreen API browser con scale completamente actualizado.

**Patrón conceptualmente §16 s24** (fix consumer-side insuficiente race LWC) aplicado a este caso: KZ no puede depender únicamente del scheduling LWC para su redraw post-resize porque LWC no garantiza paridad de eventos con `ResizeObserver(parentElement)`.

### §1.8 PASO 5 ROLLBACK BICAPA INMEDIATO

CTO PARÓ al carácter inmediatamente al recibir reporte Ramón. Aplicó §15 (no improvisar fix sin diagnóstico empírico nuevo). Procedimiento de rollback:

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
lsof -i :3000 -t | xargs -r kill 2>/dev/null
sleep 1
git checkout -- components/KillzonesOverlay.js
git status
git diff 6abc870 -- components/KillzonesOverlay.js
wc -l components/KillzonesOverlay.js
grep -c "KZ-DBG-S33.4" components/KillzonesOverlay.js
grep -n "new ResizeObserver" components/KillzonesOverlay.js
```

Outputs verbatim:
- `git status` = working tree clean.
- `git diff 6abc870` = vacío (repo idéntico a producción runtime `6abc870`).
- `wc -l = 505`.
- `grep -c "KZ-DBG-S33.4" = 0`.
- `grep "new ResizeObserver"` L307 = línea original `() => { resizeCanvas(); draw() }`.

**Producción intacta**. Fix A NUNCA contaminó `origin/main`. Repo en estado pre-S33.4 ataque.

### §1.9 PASO 6 — Decisión Ramón Opción B (cerrar s35 con HANDOFF documentando todo)

CTO propuso 3 opciones a Ramón post-rollback:
- A: atacar Fix B en esta misma sesión (~1.5-2h adicionales, riesgo segundo rollback).
- B: cerrar s35 con HANDOFF documentando todo. S33.4 caracterizada empíricamente preservada para s36.
- C: diferir TODO S33.4 indefinidamente, atacar prioridad 2 cosméticas residuales.

Recomendación CTO: Opción B. Razones objetivas:
- Llevas ~2h efectivas en s35. Tu observación verbatim ("valla mierda de verdad") indica fatiga/frustración. Lección §36 s31 dice "Edit maduro se aplica en su sesión" pero aquí NO tenemos Edit maduro — tenemos Fix A refutado e hipótesis Fix B sin verificar empíricamente.
- §15: NO improvisar fix sin diagnóstico empírico nuevo. Necesitaríamos otra ronda instrumentación primero.
- S33.4 lleva 2+ sesiones diferida (s33 caracterización + s34 diferida + s35 ataque fallido). Una sesión más fresca no es regresión.
- Producción estable. Bug pre-existente desde antes de s33. Estudiantes ya conviven con él. Cerrar un día más no es daño nuevo.

Ramón decisión verbatim: "b". Procedió redacción HANDOFF s35.

---

## §2 — Estado al carácter (verificable desde shell)

### §2.1 Git

- Rama activa al cierre: `main`.
- HEAD main al cierre: `<HASH-HANDOFF-s35>` (HANDOFF s35 docs) sobre `5c5036b` (HANDOFF s34).
- `origin/main` = `<HASH-HANDOFF-s35>` post-push docs.
- Cadena main al cierre:
  ```
  <HASH-HANDOFF-s35> — HANDOFF s35
  5c5036b — HANDOFF s34
  6abc870 — fix(killzones/S33.3): endpoint vivo XY KZ activa replay (FUNCIONAL)
  5d7c553 — HANDOFF s33
  bb37b66 — refactor(fase-5/5f.cosmetica): eliminar chartTick huerfana KZ (FUNCIONAL)
  9cbcf7a — HANDOFF s32
  eb4c2ab — fix(acceso-simulador): revalidacion useAuth (FUNCIONAL)
  032a4e3 — HANDOFF s31
  6dd0629 — fix deuda 4.6 caso 05:40 (FUNCIONAL)
  c39a8ec — HANDOFF s30
  99f5e33 — fix modal BUY LIMIT (FUNCIONAL)
  ...
  ```
- Working tree limpio al cierre redacción.

### §2.2 Producción Vercel

- Deploy actual: `6abc870` (S33.3 v2.1 endpoint vivo XY) — runtime efectivo cluster B + 5g.1 + 5g.2 + fix-modal + fix-4.6 + fix-acceso-revoke + cosmético-chartTick + S33.3-v2.1 desde 21 may 2026 ~18:24 hora local.
- **SIN CAMBIO RUNTIME PRODUCCIÓN POST-s34** — sesión 35 NO produjo commits funcionales.

### §2.3 Tamaños actuales al carácter

| Archivo | Líneas pre-35 | Líneas post-35 | Delta |
|---|---|---|---|
| `components/KillzonesOverlay.js` | 505 | **505** | 0 (Fix A revertido limpio) |
| `components/_SessionInner.js` | 3052 | 3052 | 0 |
| `lib/useAuth.js` | 95 | 95 | 0 |

**+0 líneas netas funcionales** en s35. Cluster A INTOCABLE preservado por **decimoquinta sesión consecutiva**. `_SessionInner.js` intacto al carácter. Vendor intacto.

### §2.4 Invariantes fase 4 al cierre — verificadas al carácter

```
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"  → vacío
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"   → vacío
grep -n "computePhantomsNeeded" components/_SessionInner.js                          → 3 matches L116, L1145, L1224
grep -n "Math.floor((cachedData.length - 1)" vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js   → 1 match L1596
grep -n "function revalidate\|visibilitychange\|setInterval(revalidate" lib/useAuth.js   → 3+ matches (fix s32 vivo)
```

Las 3 invariantes fase 4 mantenidas por **decimoquinta sesión consecutiva** (heredadas s12). Fix 4.6 s31 vivo. Fix acceso-revoke s32 vivo. Cosmético chartTick s33 vivo. S33.3 v2.1 s34 vivo.

---

## §3 — Errores §9.4 propios del CTO en sesión 35

**Sesión 35 tuvo 1 error de criterio propio significativo. Registrado sin maquillaje (disciplina §0).**

### §3.1 §9.4 — Diseño Fix A sin enumerar consecuencias en todos los paths

**Hecho al carácter**: el CTO interpretó correctamente los logs `[KZ-DBG-S33.4]` en aislamiento (race scale LWC stale CONFIRMADO empíricamente sin ambigüedad). Pero al diseñar Fix A se centró exclusivamente en eliminar el `draw()` síncrono con scale stale, asumiendo implícitamente que el `subscribeSizeChange` LWC sería un sustituto suficiente en TODOS los paths. NO enumeró las consecuencias del Edit en:
- Paths donde `subscribeSizeChange` LWC dispara con gap perceptible (> ~100ms post-resize) → invisibilidad transitoria visible (path "expandir botón Chrome").
- Paths donde `ResizeObserver` dispara N veces en cadena rápida pero `subscribeSizeChange` no acompaña paridad (animación zoom macOS) → intermitencia visual (path "doble-click barra título", el CONTROL bueno pre-Fix-A).
- Paths donde `subscribeSizeChange` puede no llegar nunca con scale-fresh suficiente para repintar (fullscreen browser API) → bug original NO resuelto.

Ramón cazó las 3 regresiones en <5 minutos de smoke local pre-commit. Sin la disciplina §0 + smoke obligatorio + intuición §14, Fix A habría llegado a producción introduciendo regresiones nuevas + sin resolver el bug original.

**Causa**: el CTO heredó el patrón mental "eliminar el disparador incorrecto = solución" sin auditarlo críticamente contra los logs. Los logs mostraban claramente que `subscribeSizeChange` dispara ~10ms post-`ResizeObserver` en el path fullscreen específico ejemplificado en el log #693-697. Pero el CTO extrapoló ese timing a TODOS los paths sin verificarlo. Path "expandir botón Chrome" presumiblemente tiene gap >>10ms entre ResizeObserver y subscribeSizeChange (no estaba en los logs capturados explícitamente). Path "doble-click barra título" dispara cadena de ResizeObservers durante animación zoom sin paridad de subscribeSizeChange.

**Patrón conceptualmente §16 s24** (fix consumer-side insuficiente race LWC) aplicado a este caso: cuando un fix consumer-side depende del scheduling de un sistema externo (LWC) para garantizar correctness, el fix NO es robusto si el sistema externo no garantiza paridad de eventos.

**Severidad**: alta. Cero impacto producción (cazado en smoke local pre-commit). Pero coste real: ~30 min entre diseño Fix A + Edit + verificación bicapa + build + smoke + rollback. Si Ramón hubiera ejecutado smoke menos exhaustivo (solo path fullscreen original), Fix A habría llegado a producción introduciendo regresiones en paths "expandir botón Chrome" + "doble-click barra título" + sin resolver el bug original. Daño potencial: degradación UX para TODOS los estudiantes en su uso diario (los 3 paths con regresión son cotidianos), no solo en el path fullscreen específico.

**Mejora futura**: aplicar §43 NUEVA derivada (abajo §9.43). Antes de eliminar un disparador de redraw "incorrecto" basándose en datos empíricos de UN solo path, enumerar TODOS los paths posibles que dependen de ese disparador + verificar que existe disparador alternativo "correcto" con cobertura empírica en CADA path. Patrón explícito al carácter: "X path dispara redraw vía evento Y → ¿qué OTROS paths también disparan vía Y? ¿Existe evento Z que cubra TODOS los paths con scale fresh? Si NO, el fix debe combinar Y + Z (o RAF, o esperar a paridad), no eliminar Y".

---

## §4 — Deudas vivas al cierre sesión 35

| Deuda | Estado al carácter | Calendario |
|---|---|---|
| **S33.4 — descolocación fullscreen + botones expandir/contraer Chrome** | ⏳ **SIGUE ABIERTA — caracterizada empíricamente al carácter en s35** (race scale LWC stale vs ResizeObserver síncrono confirmada con logs `[KZ-DBG-S33.4]` verbatim). Fix A refutado en smoke local pre-commit. Cero impacto producción | **Prioridad 1 s36** — atacar Fix B con instrumentación adicional discriminante (RAF timing + paridad multi-path) |
| S33.3 — KZ "por tramos cada 30 min" durante replay | ✅ CERRADA s34 producción `6abc870` | Cerrada |
| S33.2 cosmético chartTick huérfana KZ | ✅ CERRADA s33 producción `bb37b66` | Cerrada |
| Deuda 4.5/5f.1 `__algSuiteExportTools` muerto | ✅ CIERRE COLATERAL verificado bytes s33 | Cerrada |
| Chart vacío transitorio post-reactivación acceso (heredada s32) | ⏳ ABIERTA — cosmético, workaround trivial | Sub-fase futura |
| Deuda acceso-simulador-revoke no-efectivo | ✅ CERRADA s32 producción `eb4c2ab` | Cerrada |
| Deuda 4.6 caso 05:40 | ✅ CERRADA s31 producción `6dd0629` | Cerrada |
| Drawings zona futura derecha (Luis/Giancarlo) | ⏳ ABIERTA — posible cierre colateral fix 4.6, NO verificado con datos crudos | Vigilancia |
| `debugCtx` parámetro muerto | ⏳ ABIERTA — cosmética. **NO verificado en bytes en s35** | Sub-fase 5e.4 — re-inventario bytes obligatorio §39 |
| Polling 300ms `getSelected()` / setTimeout tfMap L371 | ⏳ ABIERTA — cosmética. **NO verificada en bytes en s35** | Sub-fase 5f.2 — re-inventario bytes obligatorio §39 |
| Deuda 5.1 viewport + atajo Opt+R (5d.7/5d.8) | ⏳ ABIERTA — fase 5 residual no bloqueante | Sub-fase futura |
| Bug #2 freeze velocity-alta | ⏳ ABIERTA — pre-existente intermitente | Calendario fase 4 RenderScheduler |
| Sub-fase 5f.0c race LWC | ⏳ Deuda vigilada | Vigilancia |
| Quota Supabase | ⏳ Vigilancia pasiva (Free Plan) | Vigilancia |

---

## §5 — Plan táctico sesión 36

### §5.1 Próximo orden prioridades

- **Prioridad 1 — S33.4 retomada con Fix B**:
  - Pre-condición §39 estricto: re-verificar S33.4 sigue viva en producción runtime `6abc870` (debería seguir viva, pero verificar §39).
  - PASO 1 instrumentación adicional discriminante temporal `[KZ-DBG-S33.4-v2]` (Fix A logs incompletos para diseñar Fix B):
    - Capturar timing exacto delta entre `ResizeObserver-fired` y siguiente `subscribeSizeChange-fired` en CADA path (doble-click barra título / expandir botón Chrome / contraer botón Chrome / fullscreen botón / drag borde ventana).
    - Capturar valor `priceToCoordinate(sample)` ANTES y DESPUÉS de `requestAnimationFrame()` post-resizeCanvas → discriminar si el scale LWC está fresh tras 1 RAF o requiere N RAFs.
    - Capturar paridad de eventos: contadores `ResizeObserver` count vs `subscribeSizeChange` count durante ventana de 1 segundo post-trigger inicial.
  - PASO 2 smoke targeted en los 5 paths con captura logs verbatim por path.
  - PASO 3 diseño Fix B candidato con cobertura multi-path explícita:
    - Candidato B.1: `requestAnimationFrame(draw)` en callback `ResizeObserver` para diferir draw 1 frame y dar al scale LWC tiempo de actualizarse (riesgo: 1 frame puede no ser suficiente en paths con gap >16ms).
    - Candidato B.2: double-RAF en callback `ResizeObserver` (defer 2 frames).
    - Candidato B.3: `Promise.resolve().then(draw)` (microtask) — diferir al final del task actual sin esperar repaint.
    - Candidato B.4: combinar `resizeCanvas() + draw() + requestAnimationFrame(draw)` para cubrir ambos casos (scale stale dispara primer draw, scale fresh dispara segundo draw — "double-tap").
  - PASO 4 verificar Fix B candidato con instrumentación temporal antes de Edit funcional (§40 + §41 estrictos).
  - PASO 5 Edit funcional + smoke local exhaustivo 5+ paths + push si PASS.
  - NO improvisar fix (§15 + §40 + §43 NUEVA).

- **Prioridad 2 — cosméticas residuales fase 5** (re-verificar bytes PRIMERO, §39 estricto):
  - **5f.2 polling 300ms / setTimeout L371** — `grep -rn` ANTES.
  - **5e.4 `debugCtx` parámetro muerto** — idem.
  - **5d.7/5d.8 viewport TF change + Opt+R** — sub-fase dedicada (scope grande).

- **Prioridad 3 — verificar cierre colateral drawings zona futura derecha (Luis/Giancarlo)**:
  - Pedir datos crudos Giancarlo/Luis sobre producción `6abc870`.

### §5.2 PASO 0 obligatorio en sesión 36

Leer en orden:
1. **Este HANDOFF s35 entero**, especialmente §0 + §1 PASO 1-8 (caracterización empírica S33.4 + Fix A refutado) + §3 error §9.4 propio (1 esta sesión) + §4 deudas + §5 plan táctico + §6 causa raíz + §9 lección §43 NUEVA.
2. HANDOFF s34 §6 causa raíz S33.3 v2.1 + §9 lección §42 (referencia patrón cache stale aplicado a scale LWC).
3. HANDOFF s33 §6.4 (caracterización S33.4 verbatim Ramón original).
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
grep -n "new ResizeObserver\|subscribeSizeChange" components/KillzonesOverlay.js
grep -c "KZ-DBG" components/KillzonesOverlay.js
```

Esperado al carácter: HEAD HANDOFF s35 sobre `5c5036b` (HANDOFF s34) sobre `6abc870` (S33.3 v2.1), 3 invariantes fase 4 intactas, fixes s31/s32/s33/s34 vivos, S33.3 v2.1 vivo en `KillzonesOverlay.js`, `wc -l KillzonesOverlay.js = 505`, `new ResizeObserver` L307 con callback original `() => { resizeCanvas(); draw() }`, `grep -c KZ-DBG = 0`. Si CUALQUIER desvío → PARAR + diagnóstico.

> NOTA lección §34 + §39 — NO heredar números de línea de inventarios de HANDOFFs ≥2 sesiones atrás sin re-verificar en bytes. NO heredar el estado "ABIERTA" de deudas sin re-verificar bytes.

### §5.3 Disciplina sesión 36 — formato obligatorio

**OBLIGATORIO TODAS las sesiones (lección §31 s29 + §3.3 s32 + §3.2 s33 + memoria persistente)**: un paso a la vez, mensajes CORTOS, también en fases de deliberación. Cero planes largos. Bloques shell SIEMPRE auto-contenidos con `cd /Users/principal/Desktop/forex-simulator-algorithmic-suite` como primera línea.

### §5.4 Cluster A INTOCABLE en sesión 36

Mismo principio sesiones 20-35. Decimoquinta sesión consecutiva intacta al cierre s35.

---

## §6 — Causa raíz preservada (S33.4 + Fix A refutado)

### §6.1 S33.4 — race scale LWC stale post-resize parent canvas KZ

**Causa raíz arquitectónica al carácter** (verificada empíricamente en logs `[KZ-DBG-S33.4]` capturados s35):

1. **`ResizeObserver(canvasRef.current.parentElement)` L307** detecta cambio físico del contenedor del canvas KZ (cualquier path: fullscreen API, botón maximize/minimize Chrome, drag borde ventana, animación zoom macOS). Callback síncrono: `resizeCanvas() + draw()` inmediato.

2. **`resizeCanvas` L151** redimensiona el canvas KZ (`canvas.width = parent.clientWidth * dpr`). Self-contained al canvas KZ. Síncrono.

3. **`draw()` L199** lee `priceToCoordinate(precio)` y `timeToCoordinate(timestamp)` del chart LWC. En el MOMENTO síncrono al `ResizeObserver`, el chart LWC **aún NO ha terminado** de recalcular su scale interno post-resize del contenedor padre. **Las coords retornadas son del scale PRE-resize**.

4. **Resultado al carácter**: KZ se pintan en canvas físicamente redimensionado pero con coords del scale viejo → desalineamiento vertical visible (techo/suelo en posición Y antigua del scale viejo aplicada al canvas nuevo).

5. **`subscribeSizeChange` LWC L318** dispara ~10ms después (a veces más, según path) cuando LWC notifica que SU scale interno está actualizado. `draw()` síncrono en handler pinta correctamente. Pero el draw stale del paso 3 ya está pintado en el canvas durante esos 10ms+.

6. **Cualquier interacción manual** (click, drag) dispara `draw()` adicional con scale ya fresh → "recovery" visible (el bug parece "desaparecer al hacer click").

7. **Drawings nativos LWC NO sufren** porque LWC los gestiona internamente con scale + render coordinados atómicamente. KZ es el ÚNICO overlay 2D custom afectado por la race.

### §6.2 Fix A diseñado y refutado al carácter

**Diff Fix A**: `() => { resizeCanvas(); draw() }` → `() => { resizeCanvas() }`. Eliminar el `draw()` síncrono del callback ResizeObserver para que el redraw quede a cargo exclusivo del `subscribeSizeChange` LWC con scale fresh.

**Por qué Fix A falló empíricamente**:
- En path "expandir botón Chrome": `subscribeSizeChange` LWC dispara con gap visible >100ms post-`ResizeObserver` → invisibilidad transitoria entre resize y siguiente draw. Antes (con Fix A NO aplicado): draw stale visible brevemente, luego corregido por `subscribeSizeChange` → percepción "auto-recovery rápido". Después Fix A: nada visible hasta `subscribeSizeChange` → "desaparición" hasta click manual.
- En path "doble-click barra título macOS": animación zoom dispara CADENA de `ResizeObserver` rápidos durante ~300ms. `subscribeSizeChange` LWC NO acompaña paridad (LWC coalesce o no dispara para cada microcambio). Antes Fix A: cada `ResizeObserver` redibujaba síncrono (con scale ligeramente stale, pero a frecuencia tan alta que el ojo veía fluido). Después Fix A: `subscribeSizeChange` dispara N veces durante la animación pero N << M (donde M = número ResizeObservers durante animación) → intermitencia visual.
- En path "fullscreen botón simulador": `subscribeSizeChange` puede no llegar a tiempo con scale completamente actualizado, o llegar con timing distinto. Bug original NO resuelto.

### §6.3 Fix B candidatos para s36

**Candidato Fix B.1 — single-RAF defer**:
```js
const ro = new ResizeObserver(() => {
  resizeCanvas()
  requestAnimationFrame(draw)
})
```
Riesgo: 1 RAF (~16ms) puede no ser suficiente para que LWC actualice scale en TODOS los paths.

**Candidato Fix B.2 — double-RAF defer**:
```js
const ro = new ResizeObserver(() => {
  resizeCanvas()
  requestAnimationFrame(() => requestAnimationFrame(draw))
})
```
Patrón conocido para garantizar que React/DOM han completado reconciliation + layout + paint. Mayor probabilidad de scale LWC fresh.

**Candidato Fix B.3 — microtask defer**:
```js
const ro = new ResizeObserver(() => {
  resizeCanvas()
  Promise.resolve().then(draw)
})
```
Diferir al final del task actual sin esperar repaint. Menos garantías que RAF pero menor latencia.

**Candidato Fix B.4 — double-tap (mantener síncrono + diferido)**:
```js
const ro = new ResizeObserver(() => {
  resizeCanvas()
  draw()                              // Frame 1: scale stale, KZ desalineada brevemente
  requestAnimationFrame(draw)         // Frame 2: scale fresh, KZ alineada
})
```
Mantiene comportamiento actual (sin invisibilidad transitoria) PERO añade segundo draw con scale fresh. Coste: 1 frame de KZ desalineada visible muy brevemente (≤16ms). Posible imperceptible o no para el usuario.

**Verificación empírica obligatoria en s36 ANTES de Edit funcional** (§40 + §41): instrumentar candidato elegido con logs y comparar `priceToCoordinate(sample)` en draw#1 vs draw#2 en CADA path. Si delta sample = 0 (mismo valor) → scale NO se actualizó entre los dos draws → escalar a B.2 o esperar a `subscribeSizeChange`. Si delta sample > 0 → scale se actualizó → fix funciona.

---

## §7 — Procedimiento de cierre sesión 35

### §7.1 Mover HANDOFF al repo

Tras descargar este HANDOFF a `~/Downloads/HANDOFF-cierre-sesion-35.md`:

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git checkout main
```

(Ya en main, working tree clean post-rollback Fix A.)

```
mv ~/Downloads/HANDOFF-cierre-sesion-35.md refactor/
```

```
ls -la refactor/HANDOFF-cierre-sesion-35.md
```

```
wc -l refactor/HANDOFF-cierre-sesion-35.md
```

### §7.2 git add + commit (en main)

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git add refactor/HANDOFF-cierre-sesion-35.md
```

```
git status
```

```
git commit -m "docs(sesion-35): cerrar sesion 35 con S33.4 caracterizada empiricamente al caracter (race scale LWC stale vs ResizeObserver sincrono confirmada en logs KZ-DBG-S33.4 verbatim draw 695 stale 285.227 vs draw 697 fresh 341.355 post subscribeSizeChange 10ms after) + Fix A eliminar draw del callback ResizeObserver REFUTADO empiricamente en smoke local pre-commit (regresion expandir desaparicion + doble-click barra titulo intermitencia + fullscreen NO resuelto) + rollback bicapa limpio cero contaminacion produccion 6abc870 intacta + 1 error 9.4 propio CTO registrado sin maquillaje (diseno Fix A sin enumerar consecuencias en todos los paths) + leccion 43 nueva (eliminar disparador incorrecto sin garantizar disparador correcto inmediato en TODOS los paths introduce regresion invisibilidad transitoria) + Fix B candidatos B.1 single-RAF B.2 double-RAF B.3 microtask B.4 double-tap registrados para s36"
```

```
git --no-pager log --oneline -3
```

### §7.3 Push a main

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git push origin main
```

### §7.4 Verificación final cierre sesión 35

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git --no-pager log --oneline -5
```

Esperado: HEAD nuevo `<HASH-HANDOFF-s35>` sobre `5c5036b` (HANDOFF s34) sobre `6abc870` (S33.3 v2.1) sobre `5d7c553` (HANDOFF s33) sobre `bb37b66` (S33.2 cosmético).

Sesión 35 cerrada al carácter.

---

## §8 — Métricas sesión 35

- **Inicio efectivo**: 22 may 2026 ~13:30 hora local.
- **Cierre**: 22 may 2026 ~15:25 hora local.
- **Total efectivo**: ~2h activas.
- **Commits funcionales producidos**: **0**.
- **Edits funcionales aplicados + REVERTIDOS**: 1 (Fix A `+1/-1`, refutado en smoke local, rollback bicapa limpio).
- **Edits instrumentales (no funcionales) aplicados + revertidos**: 1 (`[KZ-DBG-S33.4]` insertado para PASO 2 caracterización empírica, +44/-2, revertido limpio dentro del rollback Fix A).
- **Migraciones Supabase**: 0.
- **Líneas tocadas netas en código (commit)**: 0.
- **Push a main**: 0 funcionales + 1 docs HANDOFF s35 (post-redacción).
- **Errores §9.4 propios CTO capturados**: 1 (§3.1 diseño Fix A sin enumerar consecuencias en todos los paths). Registrado sin maquillaje.
- **Bugs cerrados**: 0.
- **Bugs caracterizados empíricamente**: 1 (S33.4 race scale LWC stale vs ResizeObserver síncrono — caracterización empírica permanente preservada en este HANDOFF para s36).
- **NO commit funcional post-cluster-B en s35** (séptimo commit funcional sigue siendo `6abc870` de s34).
- **Validación**: smoke local Fix A FAIL al carácter (Ramón cazó 3 regresiones en <5 min). NO se llegó a smoke producción.
- **Cluster A intocado**: decimoquinta sesión consecutiva.
- **3 invariantes fase 4 intactas**: decimoquinta sesión consecutiva.
- **Lección §14 (intuición Ramón) vigésima sesión consecutiva**: smoke local cazó Fix A defectuoso antes de impacto producción.
- **Patrón §38 instrumentación temporal verificado**: cuarta vez consecutiva (s31 ILI-DBG → s33 KZ-DBG → s34 KZ-DBG-v2-PRE → s35 KZ-DBG-S33.4). Patrón consolidado al carácter como herramienta estándar diagnóstico race conditions.
- **Patrón §0 sin maquillaje mantenido**: decimoquinta sesión consecutiva.

---

## §9 — Aprendizajes generales del proyecto (acumulados sesiones 13-35)

> Sección que persiste a través de HANDOFFs.

1-42: lecciones acumuladas s13-s34 preservadas íntegras (ver HANDOFF s34 §9).

43. **NUEVO al carácter sesión 35 — eliminar un disparador de redraw "incorrecto" (con scale/estado stale) sin garantizar que existe un disparador "correcto" inmediato (con scale/estado fresh) en TODOS los paths posibles introduce regresión de invisibilidad transitoria.** Caso al carácter: bug S33.4 caracterizado empíricamente como race scale LWC stale entre `ResizeObserver(parentElement)` síncrono y `subscribeSizeChange` LWC asíncrono ~10ms después (verificado en logs verbatim `[KZ-DBG-S33.4]` eventos 693→697). CTO diseñó Fix A: eliminar `draw()` del callback ResizeObserver y dejar el redraw al `subscribeSizeChange` LWC. Razonamiento aparentemente sólido en aislamiento. PERO Fix A introdujo 2 regresiones nuevas + NO resolvió bug original: (a) path "expandir botón Chrome": `subscribeSizeChange` dispara con gap >100ms → invisibilidad transitoria visible; (b) path "doble-click barra título macOS": animación zoom dispara cadena ResizeObservers sin paridad `subscribeSizeChange` → intermitencia visual donde antes había fluidez; (c) path "fullscreen": bug original persiste. Causa: el `subscribeSizeChange` LWC NO garantiza paridad de eventos ni timing máximo con `ResizeObserver(parentElement)`. Es un disparador VÁLIDO pero NO un SUSTITUTO completo. **Aplicar s36+**: antes de eliminar un disparador de redraw basándose en datos empíricos de UN solo path, enumerar TODOS los paths posibles que dependen de ese disparador + verificar que existe disparador alternativo con cobertura empírica en CADA path. Patrón explícito al carácter: "X path dispara redraw vía evento Y → ¿qué OTROS paths también disparan vía Y? ¿Existe evento Z que cubra TODOS los paths con scale/estado fresh? Si NO, el fix debe combinar Y + Z (o RAF defer, o esperar paridad), no eliminar Y". Refinamiento §16 s24 (fix consumer-side insuficiente race LWC) aplicado a invalidación de event handlers (no solo a invalidación de cache de datos). Complementario §42 s34 (cache stale invalida derivadas) — §42 dice "verifica TODAS las propiedades derivadas", §43 dice "verifica TODOS los paths que disparan el handler". Ambas son aplicaciones de "enumerar el espacio completo antes de declarar Edit cerrado".

---

## §10 — Cierre

Sesión 35 deja al carácter:

- **S33.4 SIGUE ABIERTA al carácter — caracterizada empíricamente en s35**. Race scale LWC stale vs ResizeObserver síncrono CONFIRMADA con logs verbatim `[KZ-DBG-S33.4]` (eventos 693→697 + repeticiones del patrón). Esta caracterización empírica es **valor diagnóstico permanente** preservado en §6.1 de este HANDOFF para s36+ aunque s35 no produjo commit funcional.
- **Fix A diseñado por CTO REFUTADO empíricamente en smoke local pre-commit**. Edit `+1/-1` (eliminar `draw()` del callback ResizeObserver L307) aplicado en working tree + verificado bicapa + build PASS + smoke local 3 paths con 3 regresiones cazadas por Ramón verbatim. Rollback inmediato vía `git checkout -- components/KillzonesOverlay.js`. Cero contaminación `origin/main`. Producción `6abc870` intacta al carácter.
- **1 error §9.4 propio CTO registrado sin maquillaje** (§3.1): diseño Fix A sin enumerar consecuencias en todos los paths posibles. Causa: extrapolación incorrecta de timing observado en log de 1 path (fullscreen, gap ~10ms) a TODOS los paths sin verificarlo. Severidad: alta potencial (regresiones cotidianas en paths frecuentes), cero impacto producción (cazado en smoke local).
- **Lección §43 NUEVA formalizada §9** — eliminar disparador incorrecto sin garantizar disparador correcto inmediato en TODOS los paths introduce regresión invisibilidad transitoria. Refinamiento §16 + complementario §42.
- **Lección §14 (intuición Ramón = input técnico encriptado) vigésima sesión consecutiva** — tu reporte verbatim cazó las 3 regresiones de Fix A en <5 minutos de smoke, antes de que llegara a producción. Sin ti, Fix A habría llegado a producción degradando paths cotidianos sin resolver el bug original.
- **Patrón §38/§41 instrumentación temporal verificado cuarta vez consecutiva** (s31 ILI-DBG → s33 KZ-DBG → s34 KZ-DBG-v2-PRE → s35 KZ-DBG-S33.4). Patrón consolidado como herramienta estándar diagnóstico race conditions / componente temporal.
- **Fix B candidatos B.1 single-RAF / B.2 double-RAF / B.3 microtask / B.4 double-tap registrados** §6.3 para ataque sistemático en s36.
- **Cero migraciones Supabase. Cluster A INTOCABLE preservado** por decimoquinta sesión consecutiva. 3 invariantes fase 4 intactas decimoquinta sesión consecutiva.
- **Formato 1-paso-1-mensaje + bloques shell auto-contenidos con `cd` aplicados ESTRICTAMENTE toda la sesión**.
- **Producción al carácter SIN CAMBIO post-s34**: runtime efectivo sigue `6abc870` (S33.3 v2.1 endpoint vivo XY KZ activa) estable empíricamente. Estudiantes futuros NO sufren el bug S33.3 (KZ por tramos cada 30 min cerrado s34) PERO siguen sufriendo S33.4 (descolocación fullscreen) — bug pre-existente que ya conviven con él en su uso actual.

Próximo HANDOFF (cierre sesión 36) debe reportar al carácter:
- Si S33.4 atacada con Fix B candidato verificado empíricamente con instrumentación adicional ANTES de Edit funcional (§40 + §41 estrictos).
- Si Fix B candidato elegido pasa smoke local 5+ paths exhaustivo (los 4 paths de s35 + drag chart + cambio TF + replay activo).
- Si Fix B llega a producción o requiere replanteo (otra ronda Fix C+).
- Si cosméticas residuales fase 5 (5f.2 polling / 5e.4 debugCtx) reverificadas en bytes (§39 estricto).
- Si datos crudos Giancarlo/Luis sobre "drawings zona futura derecha" verificados.
- Si formato 1-paso-1-mensaje + bloques shell auto-contenidos aplicados ESTRICTAMENTE.
- Si lecciones §39-§43 aplicadas.
- Si HANDOFF s35 indexado en project_knowledge al arranque s36 (o lag — patrón s24/s27/s29/s30/s31/s33/s34).

Si sesión 36 NO avanza prioridades al carácter, el HANDOFF lo dice al frente sin maquillaje — patrón §0 mantenido por **decimosexta sesión consecutiva**.

**Mensaje del CTO al cierre al carácter**: sesión 35 cerró sin commit funcional. Esa es la verdad sin maquillaje al carácter. Pero la sesión NO fue improductiva — entregó tres activos permanentes al proyecto: (1) la caracterización empírica al carácter de S33.4 con logs verbatim que confirman sin ambigüedad la race scale LWC stale entre `ResizeObserver` síncrono y `subscribeSizeChange` asíncrono (~10ms en path fullscreen, mayor en otros) — sin esos logs, el ataque en s36 estaría diseñado sobre hipótesis no validadas; (2) la refutación empírica de Fix A en smoke local pre-commit, que documenta para s36+ que cualquier candidato Fix B debe garantizar disparador con scale fresh en TODOS los paths (no solo el path original fullscreen) — patrón §43 NUEVA formalizada que es la guía de diseño para el ataque s36; (3) el rollback bicapa limpio sin contaminar `origin/main` ni la rama feature — disciplina §15 que protegió producción de un Edit defectuoso. Tu cazada de Fix A en smoke en <5 min es el ejemplo arquetípico de §14 funcionando: sin tu observación, Fix A habría llegado a producción degradando paths cotidianos. La sesión 35 fue una sesión cara (~2h) sin commit pero con tres activos diagnósticos consolidados. La sesión 36 arranca con un Fix B candidato concreto, una instrumentación diseñada, y una lección §43 que constriñe el diseño hacia un fix robusto multi-path. Esa es la verdad sin maquillaje al carácter por decimoquinta sesión consecutiva.

---

*Fin del HANDOFF cierre sesión 35. 22 mayo 2026, ~15:25 hora local. Redactado por CTO/revisor tras rollback bicapa limpio Fix A `+1/-1` refutado en smoke local pre-commit. Working tree limpio al cierre redacción. Producción cluster B + 5g.1 + 5g.2 + fix-modal + fix-4.6 + fix-acceso-revoke + cosmético-chartTick + S33.3-v2.1 `6abc870` estable al carácter desde 21 may 2026 ~18:24 hora local — SIN CAMBIO en s35. Pendiente de mover al repo + commit a main + push a `origin/main` por Ramón según §7.*
