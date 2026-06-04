# PLAN MAESTRO POST-S40 — refactor completo + features bloqueantes hasta apertura alumnos

> Redactado al carácter 26 may 2026 ~13:30 hora local tras cierre s40.
> Ratificación arquitectónica Ramón al carácter s40 §14 instancia decisiva: **refactor completo antes apertura alumnos + Cluster A → Opción A migración Supabase columna `pair` + plan maestro formalizado en repo**.
> Estado al carácter: HEAD origin/main = `efa197f` HANDOFF s40. Producción Vercel runtime efectivo = `ae29f16` cleanup(5f.2). Fases 1-4 cerradas + Fase 5 cluster B estructural cerrada s38 + cleanup post-fase-5g 2 items cerrados (s39 + s40).
> Estimación al carácter: ~25-43 sesiones efectivas hasta apertura alumnos con producto sin deuda visible.

---

## §0 — Decisiones arquitectónicas ratificadas al carácter

| Decisión | Estado | Origen |
|---|---|---|
| Refactor completo antes de apertura alumnos | ✅ Ratificada s40 | §14 input Ramón "refactor completo" |
| Cluster A → Opción A migración Supabase columna `pair` | ✅ Ratificada s40 | §14 input Ramón "Opción A. Sin duda" |
| Multi-par robusto = requisito apertura | ✅ Ratificada s40 | Metodología R.A.M.M.FX enseña correlaciones inter-par |
| Calidad TradingView no negociable | ✅ Heredada CLAUDE.md §1 | Principio rector vigente |
| Patrón cleanup 1 item §10.1/sesión | ✅ Consolidado s39+s40 | HANDOFFs s39+s40 §4 |
| Disciplina bicapa estricta + §49 + §51 + §52 + §53 | ✅ Consolidada | 13 lecciones al carácter |

---

## §1 — Estado al carácter post-s40

### §1.1 Fases cerradas estructuralmente

```
FASE 1 data layer setup                       ✅ CERRADA
FASE 2 centralizar lecturas __algSuite*       ✅ CERRADA (HANDOFF-cierre-fase-2.md, 5 commits)
FASE 3 viewport layer chartViewport.js        ✅ CERRADA (§1.7 protegido vigesimoprimera sesión consecutiva)
FASE 4 render layer chartRender.js            ✅ CERRADA (3 invariantes intactas vigesimoprimera sesión consecutiva)
FASE 5 cluster B drawings lifecycle           ✅ ESTRUCTURAL CERRADA s38 (fase 5g KillzonesOverlay → ISeriesPrimitive)
                                              ⏳ Cleanup post-fase-5g en curso (2/6 items cerrados)
```

### §1.2 Cleanup §10.1 al cierre s40

| # | Item | Estado | Cierre |
|---|---|---|---|
| 1 | 5f.2 polling 300ms getSelected | ✅ CERRADO | s40 ae29f16 |
| 2 | 5e.4 debugCtx parámetro muerto | ✅ CERRADO | s39 e44bb9b |
| 3 | 5d.7-5d.8 viewport preservation | ✅ CERRADO FANTASMA | s43 (5d.7 cerrada s22 5b233b4 + 5d.8 cerrada s42 e6c1430) |
| 5 | Debt 5.1 viewport timeframe change TradingView-style | ✅ CERRADO | s42 e6c1430 |
| 6 | Datos crudos Giancarlo/Luis drawings | ⏳ ABIERTO bloqueado terceros | — |
| 7 | 5f LS-DEBUG cleanup | ✅ CERRADO FANTASMA | s39 (resuelto colateral s23) |
| 8 | CustomDrawingsOverlay.js S33.4 | ✅ CERRADO "no aplica empíricamente" | s39 |
| 9 NUEVO | Polling 150ms zoom Y L2922 _SessionInner.js | ✅ CERRADO "no aplica empíricamente" | s41 |

### §1.3 Fases abiertas/no empezadas

```
FASE 5.A cluster A drawings lifecycle    ⏳ APLAZADA — Opción A ratificada s40
FASE 6   trading domain                  ⏳ NO EMPEZADA
FASE 7   reducción _SessionInner.js      ⏳ NO EMPEZADA (3045 líneas actuales)
```

### §1.4 Features bloqueantes apertura — caracterización empírica bytes-on-disk s40

```
=== Killzones tagging trades (bug "salen 0 en métricas") ===
lib/killzonesDomain.js:1                      ← dominio VIVO
components/KillzonesPrimitive.js:14           ← inSession() importado
components/KillzonesOverlay.js:14             ← STORAGE_KEY 'killzones_cfg_v2'
✅ CERRADO s57 (commits 723aea0/c8af5cc/f851304, en producción): sessionKeyAt en dominio + tag en los 2 inserts del CLIENTE (el productor no era pages/api) + 3 lectores reconciliados (analytics/admin/dashboard, NY AM/NY PM separados) + hotfix BD: CHECK de session_type migrado al vocabulario del dominio (backup sim_trades_backup_s57, 154 filas)

=== Test Montecarlo ===
grep retornó VACÍO al carácter — NO existe en repo
GAP funcional al carácter: módulo nuevo lib/metrics/montecarlo.js + UI métricas

=== Go-to next session opening ===
grep retornó solo matches challenge/advance.js (no relacionado feature UI)
GAP funcional al carácter: feature UI nueva — botón toolbar + lógica cursor temporal sobre eje time

=== Card dashboard "Operativa RammFX Trading" PDFs + videos ===
pages/dashboard.js existe (51839 bytes, 25 abr 2026)
GAP funcional al carácter: añadir contenido card existente — miniaturas + enlaces PDFs/videos
```

---

## §2 — Plan completo al carácter — calendario propuesto

> ⚠️ NOTA DE VIGENCIA (s56, 4 jun 2026): el calendario s41-s85 de abajo es la estimación original post-s40 y NO refleja el reorden de bloques decidido s45 ni el orden interno de features s56. Secuencia EFECTIVA: Bloque 1 ✅ s44 → Bloque 2 ✅ s49 → Fase 6 ✅ s55 → features (go-to → tagging → Montecarlo) → Fase 7 → validación Luis+Giancarlo → card → apertura. §2.3/§2.4 conservan valor como caracterización de alcance, NO como orden ni numeración de sesiones.

### §2.1 Bloque 1: cleanup §10.1 restante (~3-4 sesiones, s41-s44)

| Sesión | Item | Notas |
|---|---|---|
| s41 | Item 9 NUEVO polling 150ms zoom Y L2922 | ✅ CERRADO "no aplica empíricamente" — caracterización empírica: LWC oficial 5.x NO expone canal pub/sub price scale change (typings IPriceScaleApi L2160-L2188 solo mutación/query) → polling 150ms justificado bytes-on-disk. Migración ISeriesPrimitive reclasificada deuda Bloque 4 Fase 6 trading domain |
| s42 | Item 5 Debt 5.1 viewport timeframe change TradingView-style | ✅ CERRADO s42 e6c1430 — feat atajo reset viewport Alt+R / Option+R + reuso initVisibleRange + getRealLen() API canónica preexistente + Edit B único minimal +14 líneas _SessionInner.js + smoke localhost 6/6 PASS + smoke producción simulator.algorithmicsuite.com PASS |
| s43 | Item 3 5d.7-5d.8 viewport preservation | ✅ CERRADO FANTASMA s43 — caracterización empírica bytes-on-disk al carácter ratificó: sub-fase 5d.7 (Debt 5.1 viewport TF change estilo TradingView) cerrada s22 commit 5b233b4 "anclar scroll al último real compensando phantoms para drawings extendidos" + sub-fase 5d.8 (atajo Opt+R/Alt+R reset viewport) cerrada s42 e6c1430. _SessionInner.js:1240 comentario in-code "Sub-fase 5d.7 (deuda 5.1)" descriptivo implementación ya aplicada. Adjetivo "deeper" en HANDOFFs sucesivos s30→s42 = invención retórica sin sustento bytes-on-disk. Ramón ratificó empíricamente "yo lo veo muy bien" navegador real PASS. Quinto FANTASMA §10.1 patrón items 7+8+9 |
| s44 | Smoke producción multi-path post-cleanup + HANDOFF cleanup §10.1 completo | ✅ BLOQUE 1 CERRADO — smoke producción simulator.algorithmicsuite.com (runtime e6c1430) 5/5 paths PASS al carácter: path 1 cargar sesión+drawings persistencia + path 2 TF change M1↔H1↔H4 viewport preservation (5d.7 s22 5b233b4) + path 3 Alt+R/Option+R reset viewport (5d.8 s42 e6c1430) + path 4 zoom Y axis polling 150ms (item 9 s41 "no aplica") + path 5 crear/editar/eliminar drawings lifecycle (debugCtx s39 e44bb9b + polling 300ms s40 ae29f16). 7 items §10.1 zona CTO cerrados consecutivos s39→s43 RATIFICADOS EMPÍRICAMENTE producción. 1 item bloqueado terceros (item 6 Giancarlo/Luis) NO bloqueante apertura alumnos |

### §2.2 Bloque 2: Fase 5.A cluster A Opción A migración Supabase (~3-5 sesiones, s45-s49)

**PASO 0 obligatorio s45**: redactar `refactor/fase-5A-plan.md` con:
- Inventario al carácter actual `session_drawings` (filas existentes, asignación `pair` retrocompatible)
- Migración Supabase script al carácter (añadir columna `pair`, reindex, backup pre-migración)
- Verificación quota Supabase pre-migración (CLAUDE.md §3.1 OK explícito requiere)

| Sesión | Sub-fase 5.A | Notas |
|---|---|---|
| s45 | Plan 5.A redactado + OK Ramón migración BD | Pre-arranque crítico |
| s46 | Migración Supabase + backup + verificación filas existentes | Pre-condición resto fase |
| s47 | `saveSessionDrawings` filtrar por (session_id, pair) + carga inicial deps [pluginReady, id, activePair] | Consumer-side rediseño |
| s48 | `drawingTfMap` per-par + plugin lifecycle adaptación | Consumer-side rediseño |
| s49 | Smoke producción 5+ paths multi-par + HANDOFF cluster A cierre | Cierre bloque 2 |

### §2.3 Bloque 3: Features bloqueantes apertura (~6-9 sesiones, s50-s58)

| Sesión | Feature | Estado bytes-on-disk | Notas |
|---|---|---|---|
| s50-s52 | Killzones tagging trades | Dominio existe + falta tag-at-trade-close + agregación métricas | Fix bug "salen 0" + extender API trades con `killzone` campo |
| s53-s55 | Test Montecarlo | NO existe | Crear módulo `lib/metrics/montecarlo.js` + integración UI métricas |
| s56-s57 | Go-to next session opening | NO existe | Botón toolbar + lógica cursor temporal jump a próxima apertura killzone seleccionada |
| s58 | Card dashboard PDFs + videos | dashboard.js existe | Añadir miniaturas + enlaces card "Operativa RammFX Trading" |

### §2.4 Bloque 4: Fase 6 trading domain (~8-15 sesiones, s59-s73)

**PASO 0 obligatorio s59**: redactar `refactor/fase-6-plan.md` con caracterización al carácter de:
- Positions/orders/balance actual en `_SessionInner.js` (probable ~600-1000 líneas)
- `checkSLTP` lógica actual
- Challenge phases doctrina pedagógica (avance fase "virgen" capital nominal, 0 floating P&L, solo cursor + drawings persisten)
- Extracción `lib/trading/` modular: positions.js + orders.js + balance.js + sltp.js + challenge.js
- Migración `PositionsOverlay`/`OrdersOverlay` líneas precio → `ISeriesPrimitive` (deuda heredada item 9 §10.1 cerrado s41 "no aplica empíricamente"): polling 150ms zoom Y L2922 `_SessionInner.js` justificado bytes-on-disk por LWC oficial sin canal pub/sub price scale change. Patrón análogo cierre fase 5g (KillzonesOverlay → KillzonesPrimitive) — pipeline interno LWC invoca `updateAllViews` automático en TODOS los paths (resize/pan/zoom/drag horizontal/drag vertical), eliminando polling consumer-side

Estimación amplia ~8-15 sesiones por scope incierto pre-PASO-0. Refinamiento s59.

### §2.5 Bloque 5: Fase 7 reducción `_SessionInner.js` (~5-10 sesiones, s74-s83)

**Estado al carácter post-s40**: `_SessionInner.js` = 3045 líneas. Tras Fase 6 trading domain extraída, estimación reducción a ~1500-2000 líneas (extracción trading) + extracción overlays/hooks dedicados puede llevar a ~800-1200 líneas finales.

**PASO 0 obligatorio s74**: redactar `refactor/fase-7-plan.md` con inventario al carácter post-fase-6 estado real archivo + extracción candidatos (overlays, hooks, refs).

### §2.6 Bloque 6: cierre + apertura alumnos (~1-2 sesiones, s84-s85)

| Sesión | Acción |
|---|---|
| s84 | Smoke producción exhaustivo multi-par + multi-TF + multi-killzone + Montecarlo + go-to + dashboard + challenge phases |
| s85 | Apertura alumnos — release notes + cierre refactor completo + HANDOFF apertura |

### §2.7 Estimación total al carácter

```
Bloque 1 cleanup §10.1 restante      ~3-4 sesiones
Bloque 2 Fase 5.A cluster A          ~3-5 sesiones
Bloque 3 features bloqueantes        ~6-9 sesiones
Bloque 4 Fase 6 trading domain       ~8-15 sesiones
Bloque 5 Fase 7 reducción            ~5-10 sesiones
Bloque 6 cierre + apertura           ~1-2 sesiones
─────────────────────────────────────────────────────
TOTAL                                ~26-45 sesiones
```

A ritmo histórico ~1 sesión efectiva cada 1-3 días: **~2-4 meses calendario efectivo** hasta apertura alumnos con producto sin deuda visible.

§52 NUEVA aplicada al carácter: estimación es **aproximada** sin verificación mecánica posible (cada bloque requiere PASO 0 propio). Refinamiento real sesión por sesión.

---

## §3 — Riesgos identificados al carácter

### §3.1 Riesgo perfeccionismo bloqueante

Refactor completo antes apertura = riesgo "sesión 41 → 100 sin abrir". Mitigación al carácter:
- **Plazo duro autodefinido Ramón**: si en sesión ~75 no se ha cerrado Fase 7, evaluar apertura con Fase 7 parcial.
- **Hito intermedio apertura beta**: RESUELTO s56 — Luis + Giancarlo ya testean en producción de forma continua durante features y Fase 7; tras su "todo bien" post-Fase-7 salen, se monta la card PDFs/videos y se abre oficialmente.

### §3.2 Riesgo Fase 5.A migración Supabase

Migración BD = regla absoluta CLAUDE.md §3.1 + datos existentes producción ya tienen drawings asignados (single-par implícito). Mitigación al carácter:
- Backup BD pre-migración obligatorio.
- Script idempotente con rollback.
- Asignación retrocompatible: `pair = pair_principal_sesion` por default para filas históricas.
- Validación quota Supabase Free Plan pre-migración.

### §3.3 Riesgo Fase 6 trading domain scope incierto

Estimación ~8-15 sesiones es amplia porque scope real solo se conocerá tras PASO 0 s59. Mitigación al carácter:
- s59 dedicada exclusiva a redactar `refactor/fase-6-plan.md` con caracterización al carácter.
- Si scope real > 15 sesiones, evaluar fragmentación en Fase 6a + Fase 6b.

### §3.4 Riesgo features features (~6-9 sesiones) interfieren con refactor estructural

Killzones tagging trades + Montecarlo tocan métricas/trades — pueden colisionar con Fase 6 trading domain. Mitigación al carácter:
- **Orden propuesto**: cleanup §10.1 → Fase 5.A → features → Fase 6 → Fase 7. Features ANTES Fase 6 evita rework — pero introduce código en `_SessionInner.js` que Fase 7 luego extraerá.
- **Orden alternativo**: cleanup §10.1 → Fase 5.A → Fase 6 → features (sobre arquitectura limpia) → Fase 7. Más coherente arquitectónicamente, pero retrasa apertura beta visible.
- ✅ DECIDIDO s45 (fijado en bytes s56): **orden alternativo** — cleanup §10.1 → Fase 5.A → Fase 6 → features (sobre arquitectura limpia) → Fase 7 → apertura. Fase 6 cerrada s55 (lib/trading/: pricing.js + breach.js + orders.js, runtime 6e14c9c).
- ✅ ORDEN INTERNO features DECIDIDO s56 (input Ramón): go-to session (next/NY/LND...) → session tagging → Montecarlo. La card dashboard PDFs/videos se reposiciona POST-Fase-7: validación Luis+Giancarlo "todo bien" → salida de testers → card → apertura oficial. La card SIGUE siendo bloqueante de apertura; solo cambia el orden.

### §3.5 Riesgo Supabase RLS 30 oct 2026

Email Supabase 27 may 2026 18:00 hora local notifica cambio política seguridad por defecto: a partir 30 oct 2026 tablas NUEVAS creadas en proyectos existentes requerirán GRANT explícito PostgREST/GraphQL/supabase-js para exposición API datos.

**Impacto al carácter sobre forex-simulator-algorithmic-suite**:

| Aspecto | Estado al carácter |
|---|---|
| Categoría proyecto | "proyecto existente" (creado pre-30 oct 2026) |
| Tablas ya creadas (sim_sessions, sim_trades, sim_orders, sim_drawings, sim_progress) | SIN impacto retroactivo — GRANT implícito heredado vigente |
| Runtime Vercel efectivo s42 `e6c1430` | CERO impacto runtime |
| Riesgo bloqueante apertura alumnos | NO bloqueante |

**Acción única al carácter ANTES del 30 oct 2026** (5 meses de gracia al carácter — NO urgencia):

- Revisar panel Supabase → Asesor de seguridad → inventario tablas expuestas API datos
- Confirmar GRANT explícito heredado sobre las 5 tablas existentes
- Si se crean tablas NUEVAS post-30 oct 2026 (ej. Fase 5.A migración Supabase añade columna `pair` a `sim_drawings` o crea tabla auxiliar `sim_drawings_v2`), aplicar GRANT explícito en script de migración

**Bloque cronológico al carácter**: documentar en `refactor/fase-5A-plan.md` PASO 0 s45 + en `refactor/fase-6-plan.md` PASO 0 s59 que toda migración Supabase post-30 oct 2026 incluye GRANT explícito como paso obligatorio.

§38 + §48 + §51 NUEVA s39 aplicadas al carácter — caracterización empírica deuda operativa antes asumir impacto runtime + verificar bytes-on-disk impacto Vercel runtime efectivo s42 `e6c1430` = CERO impacto runtime ratificado.

---

## §4 — Disciplina mantenida al carácter en TODO el refactor

| Lección | Aplicación |
|---|---|
| §14 input encriptado Ramón | Cada sesión escuchar intuición Ramón como input técnico |
| §15 NO improvisar fix sin diagnóstico | Cada Edit precedido caracterización empírica |
| §38 agotar bytes propios ANTES externo | Cada decisión sobre datos bytes-on-disk |
| §43 enumerar TODOS los paths | Cada Edit con paths exhaustivos pre-declarados |
| §44 caracterización empírica DOS veces | Cada cambio crítico verificado pre + post |
| §47 entregable tangible cada sesión | Commit funcional + push + smoke producción |
| §48 LWC oficial precede vendor fork | Cada decisión arquitectónica drawings |
| §49 HANDOFF requiere ejecución bytes-on-disk REAL | Cada HANDOFF verbatim, NO transcribir memoria |
| §50 verificación discriminante modela runtime real | npm run build + smoke runtime, no estática |
| §51 items diferidos requieren re-verificación | Cada item §10.1 al inicio sesión |
| §52 contar líneas mecánicamente ANTES aritmética | Cada predicción aritmética con wc -l |
| §53 pregunta diagnóstica Ramón ≠ orden cambio plan | Default justificar patrón, NO replantear |

---

## §5 — Criterio salida apertura alumnos al carácter

Apertura ratificada al carácter cuando se cumplan TODOS estos criterios:

- ✅ Fases 1-4 cerradas estructuralmente (CUMPLIDO post-s40)
- ✅ Fase 5 cluster B estructural cerrada (CUMPLIDO post-s38)
- ✅ Cleanup §10.1 zona CTO 100% completado (0 items abiertos zona CTO + 1 bloqueado terceros 6 datos crudos Giancarlo/Luis + items 1+2+3+5+7+8+9 cerrados consecutivos s39→s43 — item 1 s40 ae29f16 + item 2 s39 e44bb9b + item 3 FANTASMA s43 5d.7 cerrada s22 5b233b4 + 5d.8 cerrada s42 e6c1430 + item 5 s42 e6c1430 + item 7 FANTASMA s39 + item 8 "no aplica empíricamente" s39 + item 9 NUEVO "no aplica empíricamente" s41)
- ✅ Fase 5.A cluster A Opción A migración Supabase cerrada (CUMPLIDO s49, smoke producción multi-par PASS)
- ⏳ 4 features bloqueantes cerradas — orden s56: go-to session ✅ s56 (prod s57) → session tagging ✅ s57 (prod f851304) → Montecarlo (pre-Fase-7) + card dashboard PDFs/videos (POST-Fase-7, último paso antes de apertura)
- ✅ Fase 6 trading domain extraída a `lib/trading/` (CUMPLIDO s55 — pricing.js + breach.js + orders.js, smoke producción PASS)
- ⏳ Fase 7 reducción `_SessionInner.js` ≤ ~1000 líneas
- ⏳ Smoke producción exhaustivo multi-par + multi-TF + multi-killzone + Montecarlo + go-to + dashboard + challenge phases

Cuando los 8 criterios sean ✅, abrimos.

---

## §6 — Próxima sesión = sesión 43

**Sesión 42 ejecutada al carácter**: PASO 0 baseline bicapa REAL (10 checks PASS) + §51 NUEVA aplicada items 3+5 §10.1 (grep 11 patrones `chartViewport.js` retornó 0 matches — items 3+5 declarativas HANDOFFs sin materializar in-code, pipeline viewport básico YA implementado bytes-on-disk vía `userScrolled` flag + doble rAF + `opts.full restoreSavedRange`) + caracterización convención teclado TradingView ratificada 5 fuentes web independientes coincidentes (`Alt+R` Win/Linux / `Option+R` Mac, `e.altKey && e.code === 'KeyR'`) + caracterización API LWC oficial 5.x typings.d.ts (`resetTimeScale()` L2821 + `fitContent()` L2825 nativos pero NO replican `_tbars[tf]` custom simulador → reuso `initVisibleRange` + `getRealLen()` API canónica preexistente L13+L881) + Edit B único minimal +14 líneas `_SessionInner.js` (3045→3059 líneas, md5 `6eaa3b56...` → `2651d34d...`) + smoke localhost 6/6 PASS + commit `e6c1430` + push origin/main fast-forward `ef7face..e6c1430` + smoke producción `simulator.algorithmicsuite.com` PASS. Item 5 §10.1 Debt 5.1 CERRADO ESTRUCTURALMENTE EN PRODUCCIÓN POST SMOKE. Runtime Vercel CAMBIÓ `ae29f16` → `e6c1430` (primer cambio runtime efectivo desde s40). CERO errores §9.4 propios CTO. 4 instancias §14 catalogadas vigesimoquinta sesión consecutiva multi-instancia. CERO lecciones nuevas, lecciones previas reforzadas (§38 + §48 + §49 + §51 + §52 + §53 + §54 NUEVA). HANDOFF s42 entregado vía §54 NUEVA archivo descargable sandbox CTO web (`refactor/HANDOFF-cierre-sesion-42.md` 730 líneas md5 `e6869dee...`). Cuarto cleanup post-fase-5g cerrado estructural (s39 debugCtx + s40 polling 300ms + s41 polling 150ms "no aplica" + s42 reset viewport feature).

**PASO 0 s43**: baseline verificación bicapa REAL (§49) ✅ EJECUTADO 27 may 2026 ~22:50 hora local (10 checks PASS: HEAD = origin/main = `a846c3f` + `_SessionInner.js` 3059 líneas md5 `2651d34d...` + `chartViewport.js` 201 líneas md5 `06f531ca...` intacto vigesimocuarta sesión consecutiva + `chartRender.js` 141 líneas md5 `5af39d60...` + 3 invariantes fase 4 intactas + header §1.7 protegido verbatim) + §51 NUEVA s39 aplicada al carácter sobre PLAN MAESTRO POST-S40 baseline pre-Edits (md5 `197c0f13...` + 237 líneas).

**PASO 1 s43**: actualización PLAN MAESTRO POST-S40 vía 5 Edits docs-only diferidos s42 (§1.2 fila item 5 cerrado ✅ + §2.1 desdoblar fila s42-s43 en filas s42 ejecutada + s43 dedicada + §5 criterio salida 2→1 items abiertos + §6 íntegro reemplazo histórico s42 + PASO 0/1/2-N s43 + §3.5 NUEVA deuda operativa Supabase RLS 30 oct 2026).

**PASO 2 s43**: caracterización empírica item 3 §10.1 sub-fase 5d.7-5d.8 viewport preservation deeper ✅ EJECUTADA — §38 + §43 + §46 + §51 NUEVA s39 aplicadas al carácter ratificaron bicapa REAL: 5d.7 (Debt 5.1 viewport TF change estilo TradingView) cerrada s22 commit `5b233b4` "anclar scroll al último real compensando phantoms para drawings extendidos" + 5d.8 (atajo Opt+R/Alt+R reset viewport) cerrada s42 `e6c1430`. `_SessionInner.js:1240` comentario in-code descriptivo implementación ya aplicada. Adjetivo "deeper" HANDOFFs sucesivos s30→s42 = invención retórica sin sustento bytes-on-disk. Ramón ratificó empíricamente "yo lo veo muy bien" navegador real PASS. Verificación commit `5b233b4` bicapa REAL: existe + branch main lo contiene + 48 commits sobre `5b233b4` hasta HEAD s43. **Item 3 §10.1 CERRADO FANTASMA s43** — quinto FANTASMA §10.1 patrón items 7+8+9.

**PASO 3 s43**: cleanup §10.1 zona CTO 100% completado al carácter — 0 items abiertos zona CTO + 1 bloqueado terceros 6 (datos crudos Giancarlo/Luis drawings). Bloque 1 cleanup §10.1 según §2.1 CERRADO ESTRUCTURALMENTE.

**PASO 4 s43**: 3 Edits docs-only adicionales sobre PLAN MAESTRO POST-S40 (§1.2 fila item 3 ✅ CERRADO FANTASMA + §2.1 fila s43 reclasificada FANTASMA + §5 criterio salida 0 items abiertos zona CTO + §6 este bloque reformulado) + amend commit `ab79573` para coherencia narrativa atómica.

**PASO 5 s43**: redactar HANDOFF s43 vía §54 NUEVA s41 archivo descargable sandbox CTO web + commit + push atómico final 2 commits (`ab79573` amend plan maestro + HANDOFF s43).

§14 input encriptado escuchado al carácter desde s31 (~12 sesiones consecutivas). Plan maestro post-s40 ratificado bicapa al carácter.

— CTO. Plan maestro post-s40 al carácter. Calidad TradingView no negociable. CLAUDE.md §1.
