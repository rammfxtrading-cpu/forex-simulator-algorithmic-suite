# PLAN Feature Montecarlo — Bloque 3, feature 3/4 (última pre-Fase-7)

> Redactado sesión 58, 4 junio 2026 (v2 — contrato cerrado con Ramón en s58 sobre referencia visual FX Replay).
> PLAN MAESTRO §1.4/§2.3: módulo `lib/metrics/montecarlo.js` + integración UI métricas.
> Estado al redactar: inventario PASO 0 s58 CERRADO en bytes. CERO código escrito.
> Disciplina: regla 15 (sin dependencias npm — RNG determinista propio con seed), bicapa estricta en cada corte.

---

## §0 — Qué es y para qué sirve

Simulación Montecarlo PARAMÉTRICA estilo FX Replay (referencia: captura de retro.fxreplay.com aportada por Ramón, 4 jun 2026): a partir del win rate, ganancia media y pérdida media del alumno, generar N escenarios de M trades cada uno y pintar todas las curvas de balance ("espagueti") + métricas agregadas. En cristiano: "con tu estadística actual, estos son 100 futuros posibles — incluida la mala suerte normal".

Valor pedagógico R.A.M.M.FX: el alumno ve que una racha de pérdidas cabe dentro de un sistema ganador, y cuánta. Mentalidad de proceso, no de resultado. Y puede jugar al "¿y si mejoro mi win rate 5 puntos?" editando los parámetros.

---

## §1 — Inventario en bytes (PASO 0 s58, cerrado)

### §1.1 Repo
- `grep -rin "montecarlo\|monte carlo"` en components/pages/lib → VACÍO. `lib/metrics` NO existe. Terreno virgen, igual que en s40.
- `lib/` contiene dominio adyacente (`challengeRules.js`, `challengeEngine.js`, `lib/trading/breach.js`): NO se toca en esta feature.

### §1.2 BD (`sim_trades`, 155 filas al sondeo)
- Cerrados 155/155 con `pnl`, `rr`, `result` poblados (0 nulls). `result ∈ {WIN,LOSS,BREAKEVEN}`, 0 OPEN al sondeo.
- `risk_percent`/`risk_amount` NULL 155/155 (el cliente nunca los escribe) → irrelevante para el modelo paramétrico elegido.
- La feature NO escribe en BD (solo deriva parámetros de los trades ya fetched por la UI) → regla 8 (constraints pre-escritura) NO aplica; anotado.

### §1.3 UI (`pages/analytics.js`, 420 líneas, md5 ead019a0)
- Fetch `loadData` L83; `filteredTrades` L94 por sesión sim (`selectedSession`, default All Sessions); `closedTrades` L99; `initialBalance` L113 (capital de la sesión o suma de todas).
- Stats a pelo en cuerpo del componente, CERO `useMemo` (corrige dato heredado s57 §3.4). La simulación NO seguirá ese patrón: corre on-demand (botón), no por render.
- `buildPath` L138 (SVG path W=800 H=160): patrón base para el espagueti.
- Patrón de card: `s.summaryCard` / `s.cardTitle` / `s.summaryGrid` / `s.summaryRow`.
- `pages/admin.js` (983, md5 12a3fae4): panel por alumno ya agrega métricas por sesión (Corte C s57) — anclaje de la vista admin (§2.4).

---

## §2 — CONTRATO CERRADO (decisiones D, s58)

### §2.1 Modelo de simulación (D1)
- PARAMÉTRICO en $ (estilo FX Replay), NO remuestreo de pnl: cada trade simulado es WIN (+avgGain $) con probabilidad winRate, o LOSS (−avgLoss $) en caso contrario, partiendo de startBalance.
- Parámetros PRECARGADOS desde la estadística real del alumno bajo el filtro vigente, y EDITABLES por el usuario.

### §2.2 Muestra de la que salen los precargados (D2)
- La card obedece al MISMO filtro de sesión sim que el resto de analytics (`selectedSession`): los precargados se derivan de los `closedTrades` filtrados.
- Derivación (decisión técnica CTO, BREAKEVEN documentado): winRate = wins/(wins+losses)×100 (BE EXCLUIDOS del cómputo — no aportan gain ni loss y meterlos como pérdida de 0 distorsiona avgLoss); avgGain = media de `pnl` de WINs; avgLoss = |media de `pnl` de LOSSes|; startBalance = `initialBalance` ya calculado en la página.
- Casos borde: 0 wins → avgGain precarga 0; 0 losses → avgLoss precarga 0; 0 trades cerrados → precargas 0 y campos editables. SIN umbral bloqueante de muestra mínima (D5 resuelta de facto: el alumno siempre puede editar los parámetros a mano).

### §2.3 Controles y salida (D3 + D4)
- 6 campos editables: Nº simulaciones (tope 100), Trades por simulación (tope 100), Start balance ($), Win rate (%), Avg Gain ($), Avg Loss ($). Botones: Reset values (vuelve a precargados) + Start simulation.
- La simulación corre SOLO al pulsar el botón (on-demand) — nunca en cada render.
- Salida 1: gráfico espagueti — TODAS las curvas de balance (eje X = nº de trade 0..M, eje Y = $), SVG inline.
- Salida 2: 8 métricas (semántica verificada contra la captura — 7170+2830 = 10000 = 100×100 confirma totales GLOBALES):
  - Average balance / Max balance / Min balance: media/máx/mín del balance FINAL entre simulaciones.
  - Average profit factor: media del PF por simulación (PF_i = ganado_i/perdido_i; sims sin pérdidas se excluyen de la media para no promediar infinitos — documentar en harness).
  - Max consecutive wins / Max consecutive losses: máximos GLOBALES entre todas las simulaciones.
  - Total wins / Total losses: sumas globales de todas las simulaciones.

### §2.4 Vista admin (ampliación pedida por Ramón, s58)
- Ramón (admin) puede ver/lanzar el Montecarlo de cada alumno: misma card, precargados derivados de los trades del alumno seleccionado en el panel de `admin.js`. RECON en bytes del panel antes del corte (qué datos ya tiene fetched).

---

## §3 — Diseño técnico

### §3.1 Módulo puro `lib/metrics/montecarlo.js`
- `mulberry32(seed)`: RNG determinista propio (~5 líneas, sin npm).
- `deriveParams(closedTrades)` → { winRate, avgGain, avgLoss, wins, losses } según §2.2 (BE excluidos).
- `runMontecarlo({ nSims, nTrades, startBalance, winRate, avgGain, avgLoss, seed })` → { curves: nSims arrays de nTrades+1 balances, stats: las 8 métricas de §2.3 }. Clamp de nSims/nTrades a [1,100].
- Puro: ni Supabase ni React. Determinista con seed → harness con verificación exacta.
- En UI el seed será variable (cada click un espagueti distinto, como FX Replay); en harness, fijo.

### §3.2 Integración UI
- `analytics.js`: card "Monte Carlo simulation" bajo el patrón summaryCard, estado local para los 6 campos (inicializados por precarga y re-precargados al cambiar el filtro salvo edición), resultado en estado al pulsar Start.
- `admin.js`: misma card parametrizada con los trades del alumno seleccionado (corte separado).

---

## §4 — Cortes (bicapa, cada uno con su cierre)

- **Corte A — módulo puro + harness.** `lib/metrics/montecarlo.js` completo. Harness sandbox Node: deterministas con seed fijo (output exacto), propiedades (winRate 100 → curva monótona creciente y probabilidad 0 de loss; winRate 0 → decreciente; avgLoss 0 → minBalance ≥ startBalance; totalWins+totalLosses = nSims×nTrades SIEMPRE; rachas ≤ nTrades; balances finales coherentes con totales; clamp de topes), miles de property checks. Cierre por identidad md5 3 capas. Sin importar = código muerto, runtime intacto.
- **Corte B — card en analytics.js.** Import + estado + precarga + render (controles, espagueti SVG, 8 métricas). Invariantes de la página, `next build --no-lint` PASS, identidad md5.
- **Corte C — vista admin.** RECON en bytes del panel por alumno + misma card. Identidad md5.
- **Corte D — smoke + producción.** Smoke local cubriendo el rango (regla 9): precarga con muestra real, filtro por sesión sim, edición manual, topes 100/100, casos borde 0-wins/0-losses/0-trades, re-click (espagueti cambia). Push gate §3.1 (OK PUSH nominal) → smoke producción.

---

## §5 — Riesgos

- **Coste del render espagueti:** 100 curvas × 101 puntos = ~10k puntos SVG. Asumible, pero medir en Corte B; si rasca, reducir puntos por curva (decimación visual) sin tocar el motor.
- **Sims sin pérdidas → PF infinito:** tratado en §2.3 (excluir de la media de PF); el harness lo cubre.
- **Precarga vs edición del usuario:** definir en Corte B cuándo se machacan los campos al cambiar de filtro (propuesta: re-precargar al cambiar `selectedSession`, ya que cambia la estadística base).
- **Post-apertura muestra 0** (históricos borrados, D4-s57): cubierto por §2.2 casos borde — la card nace editable a mano.

---

## §6 — Próximos pasos

1. Commit docs-only de este plan.
2. Corte A (módulo + harness) → Corte B (card analytics) → Corte C (admin) → Corte D (smoke + push gate + prod).

— CTO, s58
