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
| 3 | 5d.7-5d.8 viewport preservation | ⏳ ABIERTO arquitectónico | — |
| 5 | Debt 5.1 viewport timeframe change | ⏳ ABIERTO arquitectónico | — |
| 6 | Datos crudos Giancarlo/Luis drawings | ⏳ ABIERTO bloqueado terceros | — |
| 7 | 5f LS-DEBUG cleanup | ✅ CERRADO FANTASMA | s39 (resuelto colateral s23) |
| 8 | CustomDrawingsOverlay.js S33.4 | ✅ CERRADO "no aplica empíricamente" | s39 |
| 9 NUEVO | Polling 150ms zoom Y L2914 _SessionInner.js | ⏳ ABIERTO prioridad 1 s41 | — |

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
GAP funcional al carácter: falta tag-at-trade-close en pages/api + agregación métricas

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

### §2.1 Bloque 1: cleanup §10.1 restante (~3-4 sesiones, s41-s44)

| Sesión | Item | Notas |
|---|---|---|
| s41 | Item 9 NUEVO polling 150ms zoom Y L2914 | Análogo arquitectónico a 5f.2 — caracterización + Edit + smoke producción 3 paths |
| s42-s43 | Items 3 + 5 viewport preservation TradingView-style | Sesión arquitectónica dedicada — caracterización vs FX Replay/TradingView empírica + atajo Opt+R/Alt+R |
| s44 | Smoke producción multi-path post-cleanup + HANDOFF cleanup §10.1 completo | Cierre bloque 1 |

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
- **Hito intermedio apertura beta**: post-bloque 3 (s58) considerar apertura beta con alumnos test (Luis ya confirmado) para feedback real ANTES Fase 6/7 completas.

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
- Decisión Ramón al carácter en s45 cuando llegue momento.

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
- ⏳ Cleanup §10.1 completo (3 items abiertos: 3, 5, 9 NUEVO + 1 bloqueado terceros 6)
- ⏳ Fase 5.A cluster A Opción A migración Supabase cerrada
- ⏳ 4 features bloqueantes cerradas: killzones tagging trades + Montecarlo + go-to next + card dashboard PDFs/videos
- ⏳ Fase 6 trading domain extraída a `lib/trading/`
- ⏳ Fase 7 reducción `_SessionInner.js` ≤ ~1000 líneas
- ⏳ Smoke producción exhaustivo multi-par + multi-TF + multi-killzone + Montecarlo + go-to + dashboard + challenge phases

Cuando los 8 criterios sean ✅, abrimos.

---

## §6 — Próxima sesión = sesión 41

**PASO 0 s41**: baseline verificación bicapa REAL (§49) + §51 NUEVA aplicada al item 9 §10.1 polling 150ms zoom Y L2914 (re-verificar empírica bytes-on-disk ANTES de asumir vivo, patrón s40 aplicado al item 1).

**PASO 1 s41**: caracterización empírica item 9 + decisión estrategia Edit (análogo a 5f.2 si patrón arquitectónico permite).

**PASO 2-N s41**: dependiente decisión PASO 1.

§14 input encriptado escuchado al carácter desde s31 (~10 sesiones consecutivas). Plan maestro post-s40 ratificado bicapa al carácter.

— CTO. Plan maestro post-s40 al carácter. Calidad TradingView no negociable. CLAUDE.md §1.
