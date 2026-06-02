# HANDOFF — Cierre Sesión 52 (Fase 6 · Corte 2 breach: DISEÑO cerrado y commiteado)

> Sesión 52 · 2 junio 2026 (hora local). Sesión de DISEÑO pura del Corte 2 (breach)
> de la Fase 6. Patrón s50: se cierra el sub-plan ANTES de escribir una línea de
> código del corte. NO se escribió código de cliente. El código (2a `breach.js` +
> harness, 2b cableado) es trabajo de s53 bajo su propio gate.
> Entregable §54 (descargable, no pegado en chat).

---

## §A — VEREDICTO DE LA SESIÓN

**Corte 2 (breach) de la Fase 6: DISEÑO CERRADO, COMMITEADO y PUSHEADO.** Sin código de cliente escrito (disciplina de fase / patrón Corte 1 en s50).

Se produjo `refactor/fase-6-corte-2-plan.md` (195 líneas), entregable §54 tangible del diseño del Corte 2. Cierra:
1. **Inventario en bytes** del detector de breach — frontera REAL L1604-1764 (corregida: §2.6 del plan anotaba L1608-L1790, coordenadas de s50 corridas −2 tras el Corte 1a-ii).
2. **Los tres anillos** de `checkChallengeBreach`: anillo 2 (lectura de refs, se queda), anillo 1 (núcleo puro, se extrae a `lib/trading/breach.js`), anillo 3 (disparo de efectos, se queda).
3. **Firma de `resolveBreach` blindada** — T1 resuelta: evaluación VELA A VELA (lo que el código hace hoy). Nombre virgen verificado (`grep -c "resolveBreach"`=0, cero colisión §56).
4. **Las tres tensiones**: T1 resuelta, T2 (doble pasada `floatingOtherPairs` → escalar al núcleo) documentada, T3 (equivalencia más dura que Corte 1 por ser reescritura, no movimiento) con estrategia de harness definida.
5. **Orden de sub-cortes** 2a/2b + estrategia de equivalencia bicapa (capa-1 harness sandbox + capa-2 smoke prod).

---

## §B — ESTADO DE PLANOS AL CIERRE

| Plano | Commit | Nota |
|---|---|---|
| Local (HEAD) | `379fac8` | sub-plan Corte 2 commiteado + working tree limpio |
| origin/main | `379fac8` | push `c7d43e2..379fac8` ejecutado por Ramón (gate §3.1, OK nominal "haz el push") |
| Runtime Vercel | `71cae6f` | INTACTO — `379fac8` es docs-only, no mueve runtime. (Vercel puede buildear desde `379fac8` pero el código de cliente ≡ `71cae6f`.) |

Cadena local al cierre s52: `379fac8` (sub-plan Corte 2) → `c7d43e2` (HANDOFF s51) → `71cae6f` (Corte 1) → `fc078b6` (HANDOFF s50) → `6a47fcb` (fase-6-plan) → `8045c06` (HANDOFF s49).

**Runtime SIN cambios respecto a s51.** s52 fue diseño puro + dos commits docs-only (el push de hoy y el propio HANDOFF s52, si se commitea). El runtime de cliente sigue exactamente en el Corte 1 (`71cae6f`).

---

## §C — TRABAJO DE LA SESIÓN (método)

PASO 0 baseline bicapa REAL ejecutado y verificado al carácter (repo + BD), luego decisión de alcance, luego diseño del Corte 2 por sondeos read-only incrementales.

- **PASO 0 repo: PASS.** HEAD=origin/main=`c7d43e2`; log -6 exacto; md5/líneas de los 7 archivos de §H s51 idénticos; invariantes fase 4 (cr.series=0, computePhantomsNeeded=3); greps pricing (`pipMult`=11, `calcPnl`=9, `pipSize`=0); imports pricing (L16/L7/L2); header §1.7 verbatim; `normPair`=4; `lib/trading/` solo `pricing.js`.
- **PASO 0 BD: PASS en integridad.** `pair` NOT NULL, 0 NULLs; 4 constraints exactas (sin UNIQUE(session_id) sola); backups s45=21, s48=20.
- **Decisión de alcance:** abrir el sub-plan del Corte 2 (breach) — el corte de mayor valor para §1 (core a calidad FX Replay). Descartados como sesión: Corte 1c (RulerOverlay, bajo valor), housekeeping (cosmética/docs/DROP, no avanza core).
- **Diseño por sondeos:** grep de fronteras del breach → `sed` del cuerpo completo L1604-1770 → grep de call sites/refs → grep de los 5 escalares + `resolveBreach`. Cada sondeo read-only, un paso. Confirmó la frontera puro/impuro al carácter ANTES de fijar la firma.

---

## §D — HALLAZGOS / CORRECCIONES EN BYTES (s52)

- **`.eq('pair'` desplazado L351/L374** (no L353/L376 como anotaba §H s51 / el prompt de arranque). count=2 correcto, md5 `_SessionInner.js` intacto → bytes idénticos, invariante per-par intacto. El desplazamiento −2 viene del Corte 1a-ii (archivo 3077→3075). Corregido aquí; usar L351/L374 en adelante.
- **Frontera del breach L1604-1764** (no L1608-L1790 del plan §2.6). Misma causa: coordenadas de s50 corridas −2 tras el Corte 1. El sub-plan ya las recoge corregidas.
- **`live_rows` BD = 21** (no 20 del baseline heredado). Deriva BENIGNA, no regresión: los dos backups (snapshots congelados) exactos a su histórico (21/20); solo creció la tabla viva +1. Atribución limpia: el smoke de s51 (§E) abrió sesiones EUR/USD + USD/JPY en prod → +1 dibujo persistido. Dentro del rango ya documentado (§J s51: "21↔20 CASCADE benigno"). Fase 6 no toca filas.
- **Banner Supabase "Grace period is over"** observado en el SQL Editor. Es el aviso condicional estándar del Free ("cuando agotes la cuota"), no un corte de servicio. Anotado como salud de prod, ajeno al PASO 0 y al Corte 2. No fabrica urgencia. (Soltar los 2 backups no movería la cuota — son KB de JSON.)

---

## §E — DISEÑO DEL CORTE 2 (resumen; detalle completo en `fase-6-corte-2-plan.md`)

**Los tres anillos de `checkChallengeBreach` (L1620, `useCallback`, call site único L849):**

| Anillo | Líneas | Destino |
|---|---|---|
| 2 — lectura de estado (refs, caps, escalares, filtro `livePositions`, bucle de velas) | L1622-1681 | SE QUEDA |
| 1 — núcleo puro (`worstFloating`, `equityWorst`, DD worst-case, `breachPrice=(obj+B)/A`, medio pip, clamp) | L1683-1742 | **SE EXTRAE → `lib/trading/breach.js`** |
| 3 — disparo de efectos (`closePositionRef`, `engine.pause`, `setIsPlaying`) | L1745+ | SE QUEDA |

**Firma (T1 resuelta vela-a-vela):** `resolveBreach({ livePositions, high, low, pair, capital, realizedDelta, floatingOtherPairs, ddTotalCapUSD, ddDailyCapUSD, ddDailyAlreadyUSD }) → { breach, breachPrice, reason }`. Importa `pipMult`/`calcPnl` de `./pricing` (encadenamiento de módulos del dominio). El componente conserva el bucle de velas + lectura + efectos; le pasa al núcleo una vela ya filtrada + escalares ya leídos.

**Por qué reescritura, no movimiento (vs Corte 1):** el pricing eran funciones puras top-level → movimiento mecánico. El breach es lógica acoplada a refs → extracción con parametrización. NO conducta-neutral por bytes; SÍ por equivalencia verificada (harness §8 del sub-plan, 0 fails antes de cablear). De ahí el riesgo MEDIO-ALTO.

---

## §F — ERRORES §9.4 PROPIOS CTO (sin maquillaje)

Esta sesión: **0 errores de formulación.** Las coordenadas viejas del plan (L1608/L353) NO se transcribieron como verdad: se verificaron en bytes por sondeo ANTES de diseñar, exactamente como manda §43/§52, y se corrigieron al detectarlas. Eso es la disciplina funcionando, no un error.

**Streak en disco: mantenido en 0** (objetivo s52 cumplido). Streak histórico: 7→3→0→0→0→0→2→0→2→0→0→0→**0**.

---

## §G — ESTADO CÓDIGO AL CIERRE S52 (baselines para PASO 0 de s53)

SIN cambios de código de cliente respecto a s51. Solo se añadió docs.

| Archivo | Líneas | md5 | Nota |
|---|---|---|---|
| `lib/trading/pricing.js` | 15 | `a8cee369649171d5b6640436542a03f2` | INTACTO (Corte 1) |
| `components/_SessionInner.js` | 3075 | `76bd73c35e96dd403c6773ac1d0599b6` | INTACTO |
| `components/LongShortModal.js` | 361 | `156493cad4d436b612e0948413983b93` | INTACTO |
| `components/OrderModal.js` | 224 | `71e6fcb234bc0591bb72ac3e9e55d9e7` | INTACTO |
| `components/RulerOverlay.js` | 256 | `66219f69b45d95466f5542d42f4526c4` | INTACTO (R2 diferido) |
| `lib/chartViewport.js` | 201 | `06f531ca75abc1fc6e0919612f04ec9f` | INTACTO §1.7, **34ª al arranque s53** |
| `lib/chartRender.js` | 141 | `5af39d6036c7852a86249b74188a024e` | INTACTO |
| `refactor/fase-6-corte-2-plan.md` | 195 | `c38be7e0caa06014558a9c4d65a72c11` | NUEVO s52 (sub-plan Corte 2) |

**Invariantes fase 4 (intactas):** `cr.series.setData|update`=0; `computePhantomsNeeded`=3; header §1.7 verbatim.

**Greps de pricing (intactos, baseline s53):** `_SessionInner.js` → `pipMult`=11, `calcPnl`=9, `pipSize`=0, `const pipMult`=0, `function calcPnl`=0, `const isJpy`=1 (local L2759), import `'../lib/trading/pricing'`=1. Per-par: `.eq('pair'`=2 (L351+L374, corregido), `normPair`=4.

**Coordenadas del breach (verificadas s52, RE-VERIFICAR en s53):** bloque L1604-1764; `checkChallengeBreach` def L1620; call site L849; ref decl L221 / cableado L1401; `challengeBreachFiringRef` decl L183 / reset L1406 / guard L1627 / set L1747; `ps.lastBreachIdx` L1665-1666; núcleo a extraer L1683-1742; los 5 escalares L1638-1724.

> AVISO s53: tras el Corte 2b (cablear), el conteo de `calcPnl` en `_SessionInner.js` CAMBIARÁ (hoy=9; dos viven en el núcleo que migra L1683-1684, una en el anillo 2 que se queda L1659). NO asumir 9 tras 2b — re-contar en bytes.

---

## §H — ESTADO BD AL CIERRE S52 (SIN cambios — Fase 6 no toca esquema)

Modelo per-par, idéntico a s51 salvo +1 fila viva (deriva benigna §D).

- `session_drawings.pair` text NOT NULL, **21 filas**, 0 NULLs.
- Constraints (4): `session_drawings_pkey` PK(id); `session_drawings_session_id_pair_key` UNIQUE(session_id, pair); `session_drawings_session_id_fkey` FK→sim_sessions CASCADE; `session_drawings_user_id_fkey` FK→auth.users CASCADE. La vieja `session_drawings_session_id_key` UNIQUE(session_id) sola AUSENTE.
- Backups: `session_drawings_backup_s45` (21) + `session_drawings_backup_s48` (20). DROP de ambos ELEGIBLE, diferido; conservar es barato. Candidato oportunista, gate §3.1.

---

## §I — ITEMS / HALLAZGOS ABIERTOS (heredados + s52)

- **Corte 2 (breach)** → DISEÑO cerrado (`fase-6-corte-2-plan.md`). CÓDIGO pendiente s53.
- **Corte 1c (RulerOverlay, R2)** → candidato diferido. Reconciliar `pipSize` con renombrado (colisión §56). Bajo valor.
- **Corte 3 (orders, ALTO)** → NO abrir sin sub-plan propio cerrado. Roza `cr.priceLines`.
- **Deuda cosmética** LongShortModal (línea en blanco) — lint-pass trivial.
- **Docs §3.4 PLAN MAESTRO** — orden de bloques no reflejado. Re-leer en bytes (§55) antes de editar. Commit docs-only.
- **DROP backups s45/s48** — gate §3.1, irreversible.
- **Discrepancia user_id FK** (anotada s47, re-confirmada s48-s52): `pg_constraint` muestra FK→auth.users CASCADE vs inventario s45 "NOT NULL sin FK". No afecta Fase 6.
- **XAU/USD** en `dashboard.js` L264 ausente de `ALL_PAIRS` L36 de `_SessionInner.js`: anotado, ajeno al pricing.
- **setTimeout(300ms)** de visibilidad: en observación.
- **Banner Supabase "Grace period is over"** (s52): aviso condicional Free, no corte. Salud de prod, no zona CTO urgente.

---

## §J — PRÓXIMA SESIÓN (s53)

1. **PASO 0** baseline bicapa REAL (no transcrito, §49) contra §G/§H. Verificar los 7 archivos de código + `fase-6-corte-2-plan.md` + invariantes fase 4 + per-par. **RE-VERIFICAR las coordenadas del breach** (§G) — pueden haber cambiado si algo tocó `_SessionInner.js`; el sub-plan asume el md5 `76bd73c3…`.
2. **Corte 2a:** crear `lib/trading/breach.js` (extraer núcleo L1683-1742 parametrizado según §3 del sub-plan) + harness de equivalencia capa-1 en sandbox CTO (matriz §8: BUY/SELL/mixto × JPY/no-JPY × total/daily/none × 1/N posiciones × low/high/clamp). `Object.is`, 0 fails ANTES de cablear. Archivo no importado → código muerto. Bicapa por identidad de bytes.
3. **Corte 2b:** cablear `checkChallengeBreach` (import `resolveBreach`, reemplazar bloque L1683-1742 por construcción de inputs + llamada + uso de `r.breachPrice`/`r.reason`). Re-contar `calcPnl` en bytes. Invariantes fase 4 tras el Edit. `next build --no-lint` PASS. Bicapa.
4. **Push** (gate §3.1, OK nominal) → deploy verificado en bytes (§38) → smoke discriminante (§8 capa-2: breach controlado en par no-JPY + JPY).
5. **Corte 3 (orders)** NO se abre hasta cerrar el Corte 2. Mismo rigor, su propio gate. Disciplina de fase.

**Plan maestro vigente:** Bloque 1 cerrado; Bloque 2 (cluster A) CERRADO RATIFICADO s49; **Fase 6 ABIERTA — Corte 1 cerrado/ratificado s51, Corte 2 DISEÑADO s52** (código pendiente s53, Corte 3 diferido); luego features → Fase 7 → apertura a alumnos.

— CTO
