# fase-6-corte-2-plan.md — Fase 6 · Corte 2: motor de breach intra-vela

> Sub-plan redactado en sesión 52 (2 junio 2026, hora local). Sesión de DISEÑO pura
> (patrón Corte 1 / s50): este sub-plan se cierra ANTES de escribir una sola línea
> de código del Corte 2. La escritura (2a `breach.js` + harness, 2b cableado) es
> trabajo de s53 bajo su propio gate (§3.1 para el push). Entregable §54 (descargable,
> no pegado en chat).
>
> Baseline de bytes: `_SessionInner.js` md5 `76bd73c35e96dd403c6773ac1d0599b6`
> (3075 líneas), HEAD `c7d43e2`. Los números de línea de abajo se verificaron en
> ESTOS bytes (PASO 0 + sondeos s52). Si entre s52 y s53 cambia `_SessionInner.js`,
> RE-VERIFICAR en el PASO 0 de s53 (§43/§52: verificar, no transcribir).

---

## §0 — Estado heredado al arranque del Corte 2

- **Corte 1 (pricing) CERRADO y RATIFICADO en runtime `71cae6f`** (s51). La fuente única `lib/trading/pricing.js` exporta `{ isJpy, pipMult, pipSize, calcPnl }`. El predicado JPY murió en los 3 consumidores reconciliados.
- **`lib/trading/` existe** con un solo archivo (`pricing.js`, 595 bytes). El Corte 2 AÑADE `breach.js` al directorio. Encadenamiento de módulos del dominio: `breach.js` importará `calcPnl` y `pipMult` de `./pricing` (no reimplementa pricing).
- **Cortes 2 y 3 dimensionados pero diferidos** en `fase-6-plan.md` §2.6/§2.7. Este sub-plan abre formalmente el Corte 2 (MEDIO-ALTO).
- **Fase 6 NO toca esquema BD** (refactor de código puro). El Corte 2 tampoco. Gate §3.1 solo aplica al push de producción de s53.

---

## §1 — Objetivo del Corte 2

Extraer el **núcleo matemático del detector de breach intra-vela** a `lib/trading/breach.js`, dejando en el componente la lectura de estado (refs de React) y el disparo de efectos (cierres, pausa). El refactor es **conducta-neutral**: el simulador detecta y resuelve el breach idéntico antes y después; cambia la organización del código, no la matemática de riesgo FTMO.

**Diferencia clave respecto al Corte 1:** el pricing eran funciones puras top-level (fuera del componente, sin refs) → movimiento mecánico. El breach NO es eso: es lógica de negocio acoplada a la lectura de refs. La extracción exige **diseñar una función pura con firma de parámetros** que reciba lo que hoy pesca del entorno. No es conducta-neutral por simple movimiento de bytes; es una reescritura con extracción de parámetros, verificada por equivalencia (§8). De ahí el riesgo MEDIO-ALTO.

---

## §2 — Inventario al carácter (verificado en bytes, s52)

### §2.1 — Topología del breach

`checkChallengeBreach` es un `useCallback` (L1620) con **un solo call site real**: L849, vía el patrón ref-indirect `checkChallengeBreachRef.current?.(pair,engine)`. El ref se declara en L221 y se cablea en L1401. No hay N consumidores que reconciliar (a diferencia del Corte 1).

| Elemento | Línea(s) | Rol |
|---|---|---|
| `checkChallengeBreach` (def) | L1620 | `useCallback`, el bloque entero |
| call site único | L849 | `checkChallengeBreachRef.current?.(pair,engine)` |
| `checkChallengeBreachRef` (decl) | L221 | ref-indirect |
| ref cableado | L1401 | `...Ref.current = checkChallengeBreach` |
| `challengeBreachFiringRef` (decl) | L183 | flag breach-en-tick |
| flag reset por sesión | L1406 | `= false` |
| flag guard | L1627 | early-return si ya disparó |
| flag set | L1747 | `= true` al confirmar breach |
| `ps.lastBreachIdx` | L1665-1666 | cursor de vela por par (vive en `pairState`) |

Frontera del bloque completo: **L1604-1764** (comentario de cabecera en L1604; último efecto relevante en L1764). NOTA: `fase-6-plan.md` §2.6 anotaba "L1608-L1790" — coordenadas de s50, corridas −2 tras el Corte 1a-ii (que bajó el archivo 3077→3075 con borraduras altas L107/108/116). Coordenadas reales de hoy = las de esta tabla.

### §2.2 — Los tres anillos

`checkChallengeBreach` tiene tres capas concéntricas. La extracción saca el anillo central; los de fuera se quedan.

| Anillo | Líneas | Qué hace | Destino |
|---|---|---|---|
| **2 — lectura de estado** | L1622-1681 | lee refs (`sessionRef`, `challengeStatusRef`, `pairState.current`, `balanceRef`), deriva caps/escalares, prepara inputs, filtra `livePositions`, itera velas | SE QUEDA (orquestador) |
| **1 — núcleo puro** | L1683-1742 | `worstFloating`, `equityWorst`, los dos DD worst-case, resolución lineal `breachPrice=(obj+B)/A`, medio pip, clamp | **SE EXTRAE → `lib/trading/breach.js`** |
| **3 — disparo de efectos** | L1745+ | `challengeBreachFiringRef=true`, `closePositionRef.current(...)`, iteración de cierre en otros pares, `engine.pause()`, `setIsPlaying(false)` | SE QUEDA (orquestador) |

Tras el Corte 2, `checkChallengeBreach` pasa a ser un **orquestador delgado**: lee refs → llama `resolveBreach(...)` por vela → si hay breach, dispara cierres.

### §2.3 — Inputs del núcleo: los 5 escalares de contexto

Verificado en bytes (sondeo s52): los 5 escalares viven SOLO dentro de `checkChallengeBreach` (L1638-1724), como `const`/`let` de ámbito de función. Cero referencias globales. Entran al núcleo como parámetros sin arrancar nada de fuera.

| Escalar | Origen (anillo 2) | Tipo |
|---|---|---|
| `capital` | `Number(sess.capital)` (L1635) | const |
| `realizedDelta` | `balanceRef.current - capital` (L1647) | const |
| `floatingOtherPairs` | acumulador sobre otros pares (L1651 `let`, += L1659) | **escalar ya resuelto** (T2) |
| `ddTotalCapUSD` | `capital * dd_total_pct/100` (L1638) | const |
| `ddDailyCapUSD` | `cs?.evaluation?.ddDailyCapUSD \|\| …` (L1642) | const |
| `ddDailyAlreadyUSD` | `cs?.evaluation?.ddDailyCurrentUSD \|\| 0` (L1645) | const |

### §2.4 — `resolveBreach` = nombre virgen (§56)

Verificado en bytes: `grep -c "resolveBreach"` = 0 en `_SessionInner.js`. Cero colisión de nombre. Igual que `lib/trading/` fue directorio limpio en el Corte 1, este identificador no choca con nada.

---

## §3 — Firma de `resolveBreach` (DECISIÓN DE DISEÑO CERRADA — T1)

**T1 resuelta: evaluación VELA A VELA** (no rango entero). Razón: es literalmente lo que el código hace hoy (itera y sale en la primera vela que quema, L1701 `continue`); mantiene el núcleo como función pura mínima; deja el bucle de velas en el componente (donde vive la lectura de `engine.candles`). Frontera puro/impuro nítida. Riesgo de equivalencia: el más bajo posible.

```
// lib/trading/breach.js
import { pipMult, calcPnl } from './pricing'

export function resolveBreach({
  livePositions,        // posiciones vivas en ESTA vela (ya filtradas por anillo 2)
  high, low,            // extremos de la vela
  pair,                 // para pipMult / calcPnl
  capital,
  realizedDelta,
  floatingOtherPairs,   // escalar ya resuelto (T2)
  ddTotalCapUSD,
  ddDailyCapUSD,
  ddDailyAlreadyUSD
}) {
  // ... worstFloating → equityWorst → DD worst-case → ¿breach? → breachPrice
  // return { breach: false }                              si no quema
  // return { breach: true, breachPrice, reason }          si quema
}
```

El componente conserva el bucle de velas, la lectura de refs y el disparo de cierres. Le pasa al núcleo los escalares ya leídos + el high/low de UNA vela + las `livePositions` ya filtradas; el núcleo devuelve el veredicto de esa vela. El componente usa `reason` para `closePositionRef.current(p.id, reason, …)` y deriva `reasonLabel` (`dd_daily`/`dd_total`) en el anillo 3.

**Matemática que migra al núcleo (verbatim de L1683-1742):** `pnlAtLow`/`pnlAtHigh` (reduce con `calcPnl`), `worstFloating = Math.min(...)`, `equityWorst = capital + realizedDelta + floatingOtherPairs + worstFloating`, `ddTotalAtWorst`, `ddDailyAtWorst`, los dos breaches (`>= cap - 0.01`), `A`/`B` (con `mult = pipMult(pair)`), `targetForTotal`/`targetForDaily`, `pnlObjetivo = Math.max(...)`, `reason` (daily si `targetForDaily > targetForTotal`), `breachPrice = (pnlObjetivo + B) / A`, `halfPip = 0.5/mult`, `pushDown = (pnlAtLow < pnlAtHigh)`, empuje ±halfPip, clamp `Math.max(low, Math.min(high, breachPrice))`.

---

## §4 — Las tres tensiones del corte

- **T1 — frontera del loop → RESUELTA (vela a vela, §3).** El núcleo recibe una vela y devuelve su veredicto. El bucle `for i in [fromIdx,curIdx]` se queda en el componente (anillo 2). El filtro `livePositions = ps.positions.filter(p => p.openTime == null || candle.time >= p.openTime)` (L1681) se queda fuera: depende de `candle.time` y `p.openTime`, es preparación de inputs, no matemática. El núcleo recibe `livePositions` ya filtradas.

- **T2 — doble pasada sobre `floatingOtherPairs` → DOCUMENTADA.** Se calcula en el anillo 2 (L1651-1663, lectura) y la MISMA iteración se repite en el anillo 3 (L1758-1768, para cerrar esos pares). Es lectura+efecto sobre la misma estructura `pairState`. El núcleo NO toca esto: recibe `floatingOtherPairs` como **escalar ya resuelto**. La doble pasada se queda en el componente sin cambios (no es objetivo del Corte 2 deduplicarla; eso rozaría arrastre de alcance hacia órdenes/Corte 3).

- **T3 — equivalencia conducta-neutral, más dura que el Corte 1 → ESTRATEGIA DEFINIDA (§8).** El Corte 1 movía funciones idénticas. Aquí REESCRIBIMOS: código inline → función con firma. El harness viejo-vs-nuevo debe alimentar el núcleo nuevo con los MISMOS inputs que el inline viejo veía y comparar `breach`/`breachPrice`/`reason` bit a bit (`Object.is`) sobre una matriz de escenarios. Es el corazón del riesgo del corte.

---

## §5 — Orden de sub-cortes (para s53, NO ejecutar en s52)

1. **Corte 2a — crear `lib/trading/breach.js` (productor) + harness de equivalencia.**
   - Escribir `resolveBreach` extrayendo la matemática de L1683-1742 verbatim, parametrizada según §3.
   - Archivo no importado aún → código muerto, cero impacto runtime.
   - Verificar en bytes: `cat` correcto, md5 = sandbox, `_SessionInner.js` INTACTO, `git status` = solo `?? lib/trading/breach.js` (o modificación si se reordena `ls`).
   - Harness capa-1 en sandbox CTO (V8, ESM): viejo-vs-nuevo, matriz §8, `Object.is`, 0 fails ANTES de cablear.

2. **Corte 2b — cablear `checkChallengeBreach` (consumidor).**
   - Import `{ resolveBreach }` de `../lib/trading/breach`.
   - Reemplazar el bloque L1683-1742 por: construir el objeto de inputs (de los escalares ya leídos + vela actual + `livePositions`) → `const r = resolveBreach({...})` → `if (!r.breach) continue` → usar `r.breachPrice` y `r.reason` en el anillo 3.
   - Anillos 2 y 3 intactos salvo el punto de empalme.
   - Verificar firma: `git diff` de hunks exactos; `wc -l`; greps de pricing intactos (`pipMult`=11, `calcPnl`=9 — OJO: `calcPnl` migra a `breach.js` pero los call sites de `_SessionInner` que NO son del breach siguen; re-contar en s53 PASO 0 cuáles quedan); invariantes fase 4 (cr.series=0, computePhantomsNeeded=3); `next build --no-lint` PASS.

3. **Push de producción** (gate §3.1, OK nominal que nombra la acción) → deploy verificado en bytes (§38) → smoke discriminante (§50, §8 capa-2).

> NOTA de re-conteo para s53: `calcPnl` aparece 9 veces en `_SessionInner.js` hoy. DOS de esas (L1683+L1684, `pnlAtLow`/`pnlAtHigh`) viven en el núcleo que migra a `breach.js`, y UNA (L1659, `floatingOtherPairs`) vive en el anillo 2 que se queda. Tras 2b, el conteo de `calcPnl` en `_SessionInner.js` CAMBIARÁ. Re-verificar el nuevo baseline en bytes en s53; no asumir 9.

---

## §6 — Invariantes y disciplina a vigilar (cuando llegue s53)

1. **3 invariantes fase 4** — tras CADA Edit: `cr.series.setData|update`=0; `computePhantomsNeeded`=3; header §1.7 verbatim. El Corte 2 NO toca `cr.series` ni phantoms.
2. **`chartViewport.js` §1.7** y **`chartRender.js`** — md5 sin cambios. El Corte 2 no toca la capa viewport/render.
3. **§56** — `resolveBreach` virgen (verificado, §2.4). Confirmar al cablear que no se introduce shadowing.
4. **Doctrina de fase virgen** — el Corte 2 NO toca `advance.js` ni `sim_trades`. El breach es cálculo de cliente; la doctrina vive en el endpoint. Preservada por no-acción.
5. **`pricing.js` intacto** — el Corte 2 lo IMPORTA, no lo modifica. md5 `a8cee369…` sin cambios.
6. **Bicapa estricta** — cada Edit vía Claude Code con OK "opción 1 manual"; verificación bytes-on-disk antes del siguiente paso. Push = gate §3.1.

---

## §7 — Riesgos identificados al carácter

- **Reescritura, no movimiento** (§1, T3): la firma de parámetros debe entregar al núcleo EXACTAMENTE lo que el inline veía. Un input mal mapeado cambia el comportamiento de detección de breach — el riesgo más serio del corte. Mitigación: harness §8 con 0 fails antes de cablear.
- **Empuje de medio pip y clamp** (`halfPip`, `pushDown`, clamp [low,high]): lógica sutil de redondeo IEEE-754 para evitar falsos negativos en backend. Debe migrar verbatim. La equivalencia bit a bit (`Object.is`) lo blinda.
- **Re-conteo de `calcPnl`** (§5 NOTA): NO asumir que el grep da 9 tras 2b. Verificar en bytes.
- **Arrastre de alcance hacia el Corte 3 (orders)**: la tentación de deduplicar la doble pasada de `floatingOtherPairs` (T2) o de tocar `closePositionRef`. NO. El Corte 2 = solo el núcleo de breach. La doble pasada y las órdenes tienen su gate (Corte 3). Disciplina de fase.
- **JPY**: `pipMult`/`calcPnl` ya cubren la rama JPY (Corte 1). El harness §8 debe incluir un escenario JPY (×100) para confirmar que el núcleo extraído la respeta.

---

## §8 — Verificación de equivalencia (T3, capa-1 + capa-2)

**Capa-1 (sandbox CTO, ESM, V8 — mismo motor que el cliente Next):** harness viejo-vs-nuevo. Replica el bloque inline viejo (L1683-1742) y lo compara con `resolveBreach` sobre una matriz de escenarios. Comparación bit a bit con `Object.is` de `{ breach, breachPrice, reason }`. Determinista, independiente de datos. 0 fails es condición para cablear.

Matriz mínima de escenarios:
- **Side agregado:** BUY puro · SELL puro · mixto (posiciones de ambos signos en el mismo par).
- **Par:** no-JPY (EUR/USD, ×10000, pipSize 0.0001) · JPY (USD/JPY, ×100, pipSize 0.01).
- **Tipo de breach:** total (`targetForTotal` gana) · diario (`targetForDaily` gana) · ninguno (no quema → `{ breach: false }`).
- **Posiciones:** una sola · múltiples (suma lineal de A/B).
- **Extremo:** breach al low (`pushDown` true) · breach al high (`pushDown` false) · clamp activo (breachPrice fuera de [low,high] por error matemático → cae al extremo).

**Capa-2 (runtime tras push, §50):** smoke discriminante en producción. Abrir posición(es) que provoquen breach controlado, verificar que el challenge se marca failed al precio esperado, en par no-JPY y en par JPY. Cubre el núcleo cableado + el disparo de cierres en navegador real.

**Cierre bicapa por identidad de bytes** (patrón Corte 1, §9 HANDOFF s51): el sandbox prueba que ESTOS bytes de `breach.js` ≡ viejo; `md5` en disco prueba que el disco tiene ESTOS bytes. No se ejecuta `breach.js` en la zsh de Ramón (es ESM, el repo es CommonJS → `node breach.js` petaría con SyntaxError).

---

## §9 — Entregable del Corte 2 (este sub-plan) y siguiente paso

Este `fase-6-corte-2-plan.md` es el entregable tangible del diseño del Corte 2 (§47: no exige código). Cierra: inventario en bytes + los tres anillos + la firma de `resolveBreach` (T1 resuelta) + las tres tensiones (T2/T3 documentadas) + el orden de sub-cortes + la estrategia de equivalencia.

**Siguiente paso (s53):**
1. PASO 0 baseline bicapa REAL contra los baselines de §H del HANDOFF s52 (cuando se redacte). RE-VERIFICAR en bytes las líneas de §2 (pueden haber cambiado) y el conteo de `calcPnl`.
2. Corte 2a: crear `breach.js` + harness §8 (0 fails) → bicapa.
3. Corte 2b: cablear → bicapa.
4. Push (gate §3.1) → deploy en bytes → smoke §8 capa-2.

Hasta el cierre del Corte 2, el Corte 3 (orders, ALTO) NO se abre. Mismo rigor, su propio gate. Disciplina de fase (§7: no arrastrar alcance).

— CTO (diseño Corte 2, cierre s52)
