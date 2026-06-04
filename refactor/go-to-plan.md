# PLAN — Feature "go-to session" (Bloque 3, feature 1/4)

> Redactado s56 (4 jun 2026) tras PASO 0 read-only en bytes. Contrato de ejecución de la feature.
> Requisito de producto (Ramón, s56): el go-to avanza la FECHA de la sesión ENTERA, estilo FX Replay —
> un solo reloj global, todos los pares sincronizados al mismo instante, nada de pares rezagados
> ni "cosas extrañas".
> Rumbo: PLAN MAESTRO (97fb8ff) — features: go-to → session tagging → Montecarlo; card POST-Fase-7.

---

## §1 — Inventario bytes-on-disk (PASO 0 s56, verificado en shell de Ramón)

- **Engine en timestamps REALES.** `_SessionInner.js` L839: `toOrdinal = (t) => t ?? null` con comentario
  verbatim "real timestamps — no conversion needed"; `isOrdinal` (L840) es solo guarda de legado para
  `sess.last_timestamp` antiguos (se descartan). La matemática de killzones (`toNYHM`, UTC real) aplica
  directamente sobre `candles[i].time`.
- **`seekToTime(ts)`** (`lib/replayEngine.js` L65-71): clamp a `[first, last]` del dataset, invalida
  `_aggCache`, dispara UN `onTick` en destino. No recorre velas intermedias por sí mismo.
- **`onTick`** (L844-857): `updateChart` + `checkSLTP` + `checkLimitOrders` + `checkChallengeBreach` +
  (si el par es el activo) `setCurrentTime` / `setProgress` / `setMasterTime`.
- **Los 3 checks iteran por RANGO** con cursores `ps.lastSLTPIdx` / `lastLimitIdx` / `lastBreachIdx`
  (L1530, L1557, L1612): `fromIdx = last+1 .. curIdx`, cierre a precio EXACTO de SL/TP, guardas
  `openTime`/`createdTime` (FIX BUG A). **Consecuencia: un seek hacia delante YA procesa todas las velas
  saltadas vía su único onTick.** La semántica de salto vigente en este código es la fiel, estilo FX Replay.
- **Patrón scrubber** (L2193-2204, el molde a replicar): `seekToProgress` → belt-reset
  `lastSLTPIdx`/`lastLimitIdx = currentIndex` (cinturón para el caso sin posiciones, donde los checks
  retornan temprano sin mover cursor, y para saltos hacia atrás; NO resetea `lastBreachIdx` — asimetría
  ANOTADA, fuera de alcance) → `setCurrentTime`/`setProgress` → `cr.prevCount = 0` →
  `updateChart(activePair, e, true)`. Gating `challengeLocked`.
- **masterTime global** (`lib/sessionData.js`): el onTick del par activo lo fija (L855); al cambiar de par,
  el otro engine se re-sincroniza lazy con `seekToTime(masterTime)` si |Δ|>60s (L1290-1292).
  **El "un solo reloj" del requisito ya está implementado por la arquitectura: el go-to solo mueve ESE reloj.**
- **Dominio KZ** (`lib/killzonesDomain.js`, 73 líneas): `SESSIONS` ×4 en hora NY — asia 20:00
  (crossesMidnight), london 02:00-05:00, nyam 07:00-10:00, nypm 13:30-16:00 — y `toNYHM` con DST correcto
  (EDT/EST). FALTA la función inversa: próxima apertura a partir de un instante.
- **UI**: pillRow con scrubber + speedRow (L2188-2214), todo gated por `challengeLocked`.

## §2 — Alcance (3 cortes)

### Corte A — productor puro + harness (capa-1)
- `lib/killzonesDomain.js`: AÑADIR función pura `nextSessionOpen(candles, fromIdx, sessKey = null)`
  → `{ idx, time, key } | null`.
  - Definición de "apertura": primera vela `i > fromIdx` con `inSession(NY(i), sess) === true` y
    `inSession(NY(i-1), sess) === false` (flanco de subida). `sessKey = null` → el primer flanco de
    cualquiera de las sesiones consideradas (P4).
  - Escanear VELAS del dataset (no reloj de pared): los findes/festivos/huecos se esquivan solos;
    el destino es siempre el `time` de una vela real → seek exacto.
  - SOLO añadir: funciones y constantes existentes del módulo quedan VERBATIM (consumidores:
    KillzonesOverlay + KillzonesPrimitive).
- Harness capa-1 en sandbox CTO (V8 + resolve hook, patrón validado s55): datasets M1 sintéticos con
  casos esperados a mano — apertura de cada una de las 4 sesiones, transición DST (marzo/noviembre),
  hueco de fin de semana, asia crossesMidnight, fromIdx dentro de una sesión, sin ocurrencia futura → null,
  fromIdx en última vela. Cierre bicapa: harness prueba los bytes nuevos; md5/grep en disco prueban que
  el módulo los contiene y que lo preexistente está intacto.

### Corte B — cableado UI (`_SessionInner.js`)
- `handleGoTo(sessKey | null)`, calcado al patrón scrubber:
  `const e = eng()` → `const target = nextSessionOpen(e.candles, e.currentIndex, sessKey)` →
  si `null`, no-op según P3 → `e.seekToTime(target.time)` (su onTick procesa el rango: SL/TP, límites,
  breach, masterTime) → belt-reset de cursores como el scrubber → `setCurrentTime`/`setProgress` →
  `cr.prevCount = 0` → `updateChart(activePair, e, true)`.
- Botón/selector junto a la speedRow, gated `challengeLocked` (forma exacta según P1).
- Otros pares: NO se tocan — sincronía lazy vigente al cambiar de par (L1292). Requisito multi-par
  cubierto por la arquitectura existente.

### Corte C — push (gate §3.1) + smoke producción (capa-2)
- Salto con posición abierta y SL/TP dentro del rango saltado → debe ejecutar a precio exacto.
- Salto con orden LIMIT pendiente que se llena en el rango.
- Salto en challenge cerca del cap (breach intra-rango).
- Multi-par: saltar en un par, cambiar a otro → mismo reloj (lazy sync), sin par rezagado.
- Destinos: next + cada sesión concreta; caso DST; TF altos (H1/H4); fin de dataset.

## §3 — Preguntas de diseño (decisión Ramón, cierran el contrato)

- **P1 — Destinos y UI:** ¿botón único "⏭ próxima killzone" o selector con Next + Asia/Londres/NY AM/NY PM?
  (Tu mensaje apunta a ambos: "go to next… o go to NY o LND".)
- **P2 — Sesión objetivo YA activa ahora:** propuesta = saltar siempre a la PRÓXIMA apertura estrictamente
  futura (si estás dentro de Londres y pides Londres → la de mañana). ¿OK?
- **P3 — Sin ocurrencia antes del fin del dataset:** propuesta = no saltar y avisar visualmente
  (vs. saltar al final). ¿OK?
- **P4 — "Next" considera:** ¿las 4 sesiones SIEMPRE, o solo las habilitadas en tu config de killzones?
- **P5 — Estado de reproducción tras el salto:** el scrubber mantiene lo que hubiera (si estaba en play,
  sigue). Propuesta = mismo comportamiento. ¿O pausar tras saltar?

## §4 — Orden de ejecución (un paso por mensaje, bicapa en cada commit)

1. Respuestas P1-P5 → contrato cerrado (Edit a este doc si cambia algo).
2. Corte A: Edit `killzonesDomain.js` (función nueva) → harness sandbox → verificación bicapa
   (md5 nuevo del módulo + grep de intactos) → commit local.
3. Corte B: Edits `_SessionInner.js` (handler + UI) → `next build --no-lint` PASS → invariantes →
   commit local.
4. Corte C: push (gate §3.1, OK nominal) → deploy Ready → smoke capa-2 → cierre.

## §5 — Invariantes y disciplina

- NO tocar: `lib/replayEngine.js` (`seekToTime` basta), `lib/trading/*`, `lib/chartViewport.js` (§1.7),
  `lib/chartRender.js`, overlays KZ. md5 vigilados en cada verificación.
- Invariantes fase 4: `cr.series.setData|update` = 0 y `computePhantomsNeeded` = 3 en `_SessionInner.js`.
- Sin dependencias npm nuevas. Sin BD. Cero migraciones.
- Asimetría `lastBreachIdx` del scrubber: anotada, NO se corrige en esta feature (disciplina de fase).
- Estimación: ~2-3 sesiones (A / B / C).

— CTO, s56. Contrato pendiente de P1-P5.
