# fase-6-plan.md — Fase 6: trading domain (`lib/trading/`)

> Plan redactado en sesión 50 (1 junio 2026, hora local). Arranque de la Fase 6
> del plan maestro (Bloque 4). Disciplina de fase: este plan se cierra ANTES de
> escribir una sola línea de código de Fase 6 (§15 + disciplina de fase + CLAUDE.md §1).
> Entregable §54 (descargable, no pegado en chat).

---

## §0 — Estado heredado al arranque de Fase 6

- **Bloque 2 (cluster A) CERRADO RATIFICADO en s49** (push `e084ed2` + deploy Vercel verificado en bytes + smoke multi-par discriminante PASS). Fase 6 DESBLOQUEADA.
- **PASO 0 s50 baseline bicapa REAL 12/12 + 2 backups** — repo y BD en estado heredado s49 exacto, cero deriva.
  - HEAD = origin/main = `8045c06` (HANDOFF s49, docs-only).
  - Runtime Vercel efectivo = `e084ed2` (código per-par sobre BD per-par).
  - `_SessionInner.js` md5 `41865af1791719cfb2287ce009f97374` (3077 líneas).
  - `chartViewport.js` §1.7 md5 `06f531ca75abc1fc6e0919612f04ec9f` (201 líneas) — INTACTO 31ª sesión.
  - `chartRender.js` md5 `5af39d6036c7852a86249b74188a024e` (141 líneas).
  - 3 invariantes fase 4 intactas: `cr.series.setData|update` = 0 en `_SessionInner.js`; `computePhantomsNeeded` = 3 en `_SessionInner.js`; header §1.7 protegido.
  - BD `session_drawings`: `pair` NOT NULL, 0 NULLs, 20 filas, UNIQUE(session_id, pair) + pkey + 2 FK CASCADE. Backups `_backup_s45` (21) + `_backup_s48` (20).

**Fase 6 NO toca esquema BD.** A diferencia de 5.A (que tuvo Corte A de migración), Fase 6 es refactor de código puro (extracción de lógica de trading a `lib/`). No hay corte BD-primero (§3.3 N/A aquí). Gate §3.1 solo aplicaría al push de producción de cada corte, no a migraciones.

---

## §1 — Objetivo de la Fase 6

Extraer el **dominio de trading** que hoy vive inline en `_SessionInner.js` (y duplicado en varios componentes) a un módulo `lib/trading/`, estableciendo una **única fuente de verdad** para el pricing y el cálculo de P&L. Es trabajo de modularización (preparatorio de la Fase 7, que reduce `_SessionInner.js` de 3077 a ~800-1200 líneas), no de cambio de comportamiento. **El refactor debe ser conducta-neutral**: el simulador se comporta idéntico antes y después; cambia la organización del código, no la matemática.

---

## §2 — Inventario al carácter (verificado en bytes, PASO 1 s50)

### §2.1 — `lib/trading/` NO existe

El árbol `lib/` tiene 11 archivos (`authApi`, `challengeEngine`, `challengeRules`, `chartCoords`, `chartRender`, `chartViewport`, `killzonesDomain`, `replayEngine`, `sessionData`, `supabase`, `useAuth`). Ninguno `trading/`. **Fase 6 crea el directorio de cero. Cero colisión de nombre de módulo (§56).**

### §2.2 — Lo que YA está modularizado (no se toca en Fase 6)

- `challengeEngine.js` (13 KB) — `evaluateChallenge(...)`, `isChallengeOver`, `isChallengePassed`, `statusLabel`. Dominio de **evaluación** de challenge (pnlTotal, balanceNow, DD total, DD diario FTMO). Ya es lib.
- `challengeRules.js` (2 KB) — `getChallengeConfig`, `getPhaseTarget`, `formatAccountSize`. Reglas FTMO.

El dominio de *evaluación* ya está extraído. Lo que falta es el dominio de *pricing/P&L* (inline) y, en cortes posteriores, *breach* y *órdenes*.

### §2.3 — Primitivas de pricing inline en `_SessionInner.js` (L106-L116, top-level, puras)

Bloque contiguo de funciones puras top-level (fuera del componente, sin hooks/refs/estado):

```
L107  const isJpy    = p => p?.includes('JPY')
L108  const pipMult  = p => isJpy(p) ? 100 : 10000
L109  const fmtPx    = (px,p) => px?.toFixed(isJpy(p)?3:5) ?? '—'
L110  const fmtPnl   = v => ...        (formato $)
L111  const pnlColor = v => ...        (color UI puro)
L116  function calcPnl(side,entry,exit,lots,pair) { const pips = side==='BUY' ? (exit-entry)*pipMult(pair) : (entry-exit)*pipMult(pair); return pips*lots*10 }
```

`pipSize` no existe como función en `_SessionInner.js`: se calcula inline como `1/pipMult(pair)` (L1337, L1439, L1525, L1534) y dentro del motor de breach (L1713).

### §2.4 — Call sites de `calcPnl` (8, todos en `_SessionInner.js`)

L1353 (cierre de posición) · L1661 (floating de otros pares en breach) · L1685 + L1686 (pnlAtLow / pnlAtHigh del breach) · L1901 (unrealized del HUD) · L2357 (tabla de posiciones abiertas) · L2567 (cierre parcial) · L2769 (estPnl del modal de cierre).

### §2.5 — HALLAZGO: pricing TRIPLICADO en 4 archivos (§56)

No hay fuente única. Cada consumidor reimplementa `pair.includes('JPY') ? 100 : 10000`:

| Archivo | `isJpy` | `pipMult` | `pipSize` | decimals/fmt |
|---|---|---|---|---|
| `_SessionInner.js` | L107 | L108 | inline `1/pipMult` | L109 (fmtPx) + L2770 |
| `LongShortModal.js` | L50 | L51 | L52 | L95, L342 |
| `OrderModal.js` | L16 | L17 (inline `mult`) | — | L56 (fmtP) |
| `RulerOverlay.js` | L93 | — (inline) | L94 | L102 |

**Implicación de alcance:** el Corte 1 no es "mover funciones de 1 archivo". Es **crear la fuente única y reconciliar 4 consumidores**. La lección s47 (verificar, no estimar) aquí reveló MÁS alcance, no menos. Riesgo de reconciliación: el detalle JPY (3 vs 5 decimales, ×100 vs ×10000) debe quedar idéntico tras unificar — un error sutil cambia el comportamiento.

### §2.6 — Bloque (B): motor de breach intra-vela (~L1608-L1790, ≈180 líneas)

Matemática de riesgo FTMO: peor floating P&L en la vela (high/low por posición), equity worst-case, resolución del breach price exacto (`pnl(price) = price·A − B`). **Tejido con refs de React** (`pairState.current`, `balanceRef.current`, iteración sobre otros pares). Consume `calcPnl` y `pipMult`. Extracción posible pero **MEDIO-ALTO riesgo** (hay que separar la matemática pura de la lectura de estado). Diferido a corte posterior.

### §2.7 — Bloque (C): órdenes open/close/limit (L1334+)

`openPosition`, `closePosition`, cierre parcial, limit orders (creación, ejecución por barrido de vela, cancelación). **Muy entrelazado** con `cr.priceLines.createPriceLine/removePriceLine` y estado React (`ps.positions`, `ps.orders`). **ALTO riesgo** — roza la frontera de `cr.series` (invariante fase 4) por la cercanía de `cr.priceLines`. Diferido a corte posterior.

### §2.8 — Doctrina de fase virgen (R.A.M.M.FX): YA viva en bytes — PRESERVAR, no crear

`pages/api/challenge/advance.js` la implementa al carácter (invariante pedagógica viva en producción `e084ed2`):

- L60/L64 — las posiciones abiertas llegan en `open_positions` del POST body.
- L222-228 — el server las loggea (`discarded_positions` + `positions`) para trazabilidad y **las descarta sin persistir** (no van a `sim_trades`, no se contabilizan en balance).
- L255-256 — la fase hija nace virgen: `capital` = mismo capital inicial, `balance` = `capital` (fresco).

**Fase 6 NO toca `advance.js` ni `sim_trades`.** El pricing/P&L vive en el lado cliente (cálculo en vivo); la doctrina vive en el endpoint. Se preserva por no-acción. Si algún corte futuro (B/C) tocara `advance.js`, la doctrina del P&L flotante es invariante: vigilar al carácter.

---

## §3 — Alcance de la Fase 6 (recomendación CTO)

El plan **dimensiona los tres bloques**, pero la **escritura arranca solo por el Corte 1 (pricing)**. Patrón 5.A-3 (cortes incrementales menor→mayor riesgo, cada uno verificado bicapa). (B) y (C) quedan dimensionados pero diferidos a sub-fases con su propio gate. No se fabrica urgencia para atacarlos ahora (CLAUDE.md §1).

| Corte | Contenido | Riesgo | Toca invariantes/§1.7 | Estado |
|---|---|---|---|---|
| **0 (BD)** | N/A — Fase 6 no toca esquema | — | No | N/A |
| **1 (pricing)** | Crear `lib/trading/` + fuente única de pricing/P&L + reconciliar 4 consumidores | BAJO | No (funciones puras) | **ESTA fase de escritura** |
| **2 (breach)** | Extraer motor de breach intra-vela | MEDIO-ALTO | Cerca de equity/balance | Diferido (sub-fase posterior) |
| **3 (orders)** | Extraer open/close/limit | ALTO | Roza `cr.priceLines` (frontera `cr.series`) | Diferido (sub-fase posterior) |

---

## §4 — Corte 1 (pricing): preguntas de diseño ABIERTAS

**NO se escribe código hasta resolver estas en bytes/decisión de Ramón** (§15 + §14: la intuición de trader es input técnico encriptado).

### §4.1 — Estructura del módulo
¿Un único `lib/trading/pricing.js` que exporte `{ isJpy, pipMult, pipSize, calcPnl }`? ¿O separar pricing puro (`pipMult`, `pipSize`, `calcPnl`) de formato/presentación (`fmtPx`, `fmtPnl`, `pnlColor`)? Recomendación inicial CTO: `lib/trading/pricing.js` para pricing/P&L; dejar `fmtPnl`/`pnlColor` donde están (son presentación UI, no dominio de trading) o moverlas a un `lib/format.js` aparte en otro momento. ABIERTA.

### §4.2 — `pipSize`: ¿unificar a función nombrada?
`_SessionInner.js` usa `1/pipMult(pair)` inline; `LongShortModal`/`RulerOverlay` tienen `pipSize` explícito (`0.01`/`0.0001`). ¿Exportar `pipSize(pair)` y reemplazar los `1/pipMult` por `pipSize`? Equivalencia float a verificar (`1/10000 === 0.0001`, `1/100 === 0.01`) antes de unificar — no introducir deriva numérica. ABIERTA.

### §4.3 — Granularidad de la reconciliación
¿Reconciliar los 4 consumidores (`_SessionInner`, `LongShortModal`, `OrderModal`, `RulerOverlay`) en el mismo Corte 1, o extraer primero desde `_SessionInner` (con sus 8 call sites de `calcPnl`) y reconciliar los otros 3 en cortes 1b/1c separados? Trade-off: un corte grande (más superficie de error de una vez) vs varios pequeños (más gates de verificación). Recomendación CTO: **sub-cortes** — 1a crea `lib/trading/pricing.js` + reconcilia `_SessionInner`; 1b reconcilia los 3 componentes restantes. Cada sub-corte con md5/grep + smoke. ABIERTA (depende de §4.1).

### §4.4 — Verificación de equivalencia de comportamiento
¿Cómo probamos que el refactor es conducta-neutral? Propuesta: smoke en producción tras el corte — abrir posición, ver P&L flotante, cerrar, verificar pnl/result idénticos; repetir en un par JPY si hay datos (valoración ×100) para cubrir la rama `isJpy`. ABIERTA (definir guion discriminante §50).

---

## §5 — Invariantes y disciplina a vigilar durante la escritura (cuando llegue)

1. **3 invariantes fase 4** — tras CADA Edit: `grep -c "cr\.series\.setData\|cr\.series\.update"` = 0; `grep -c "computePhantomsNeeded"` = 3; header §1.7 verbatim. El Corte 1 (pricing) NO debe alterarlas (no toca `cr.series` ni phantoms).
2. **`chartViewport.js` §1.7** (31ª sesión intacto) y **`chartRender.js`** — md5 sin cambios. Corte 1 no toca la capa viewport/render.
3. **§56** — antes de introducir el `import` de `lib/trading/pricing` en cada archivo, confirmar que los nombres locales (`isJpy`/`pipMult`/`pipSize`/`calcPnl`) se reemplazan limpiamente sin shadowing. (Ya verificado: `lib/trading` no existe; los identificadores hoy son locales, se sustituyen por import.)
4. **Doctrina de fase virgen** — no tocar `advance.js`/`sim_trades` en Corte 1. Preservada por no-acción.
5. **Bicapa estricta** — cada Edit vía Claude Code con OK "opción 1 manual"; verificación bytes-on-disk (Ramón zsh + output Claude Code) antes del siguiente paso. Push a producción = gate §3.1 (OK explícito).

---

## §6 — Orden de ejecución propuesto (post-cierre de este plan)

1. **Resolver §4** (preguntas de diseño) — decisión de Ramón / verificación en bytes.
2. **Corte 1a**: crear `lib/trading/pricing.js` (fuente única) + extraer e importar en `_SessionInner.js` (reconciliar 8 call sites de `calcPnl` + los `pipMult`/`pipSize` inline). Edit → md5/grep bicapa → smoke.
3. **Corte 1b**: reconciliar `LongShortModal.js` + `OrderModal.js` + `RulerOverlay.js` contra la fuente única. Edit → bicapa → smoke.
4. **Push de producción** del Corte 1 (gate §3.1, OK explícito) → deploy verificado en bytes (§38) → smoke discriminante (§50).
5. **Cortes 2 (breach) y 3 (orders)**: sub-planes propios en sesiones futuras, mismo rigor. NO se abren hasta cerrar Corte 1.

---

## §7 — Riesgos identificados al carácter

- **Reconciliación de 4 fuentes duplicadas** (§2.5): unificar mal el detalle JPY (decimales 3/5, multiplicador 100/10000) cambia comportamiento. Mitigación: smoke en par JPY + verificación de equivalencia (§4.4).
- **Deriva numérica `pipSize`** (§4.2): `1/pipMult` vs constante literal. Verificar igualdad float antes de sustituir.
- **Arrastre de alcance hacia (B)/(C)**: tentación de "ya que toco trading, extraigo el breach". NO. Corte 1 = solo pricing. (B)/(C) tienen su gate. Disciplina de fase.
- **Invariantes fase 4 / §1.7**: Corte 1 no las toca, pero el reflejo de verificar md5/grep tras cada Edit se mantiene (no relajar por "es solo pricing").
- **`fmtPnl`/`pnlColor` ambiguas** (§4.1): no forzar su movimiento si la decisión de diseño las deja como presentación; no inflar el Corte 1.

---

## §8 — Entregable de Fase 6 (este plan) y siguiente paso

Este `fase-6-plan.md` es el entregable tangible del arranque de Fase 6 (§47: no exige código). Cierra el inventario read-only + alcance + preguntas de diseño + orden de cortes.

**Siguiente paso (s50 o s51):** resolver las preguntas de diseño §4 con Ramón. Solo entonces se abre el Corte 1a (primera escritura de código de Fase 6). Hasta ese cierre, cero código.

— CTO
