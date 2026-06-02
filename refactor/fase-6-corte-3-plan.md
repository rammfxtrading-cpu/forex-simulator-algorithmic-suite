# SUB-PLAN — FASE 6 · CORTE 3 (orders)

> Diseño cerrado en s54 (2 junio 2026, hora local) para ejecutar en s55.
> Patrón Corte 1 (s50) / Corte 2 (s52): el diseño se cierra ANTES de escribir código.
> Fuente de verdad = bytes en disco de Ramón. Los números de línea de este doc son de
> DISCO al cierre s54 (`_SessionInner.js` md5 `2ddccd6b…`, wc 3031). NO se escribe una
> línea de código de cliente hasta que este sub-plan esté commiteado.

---

## §1 — OBJETO Y ALCANCE

**Corte 3 (orders), riesgo ALTO.** Extrae a `lib/trading/orders.js` la matemática PURA del subsistema de órdenes/posiciones de `_SessionInner.js`, encadenando con `pricing.js` (Corte 1) y dejando `breach.js` (Corte 2) intacto. El componente queda como orquestador: refs, estado, `cr.priceLines`, persistencia Supabase y overlay siguen impuros y en su sitio.

**En alcance:**
1. Núcleo de **realización de P&L/RR/result** al cerrar posición — duplicado al byte en dos rutas (cierre total y cierre parcial).
2. **Aritmética SL/TP por pips** — repetida en 5 sitios.
3. **Predicado de fill** de órdenes LIMIT — un sitio (valor de dedup bajo; ver §3.3).
4. **T2 — deduplicación de la doble pasada de `floatingOtherPairs`** — diferida deliberadamente del Corte 2; su sitio es aquí. **NO inventariada al completo en s54** (ver §5).

**Fuera de alcance (no arrastrar, §13):** Corte 1c (RulerOverlay/R2), deuda cosmética LongShortModal, viewport debt 5.1, Killzones, docs §3.4. La semántica del `*10` del RR (§5) NO se corrige en este corte: se reproduce verbatim para garantizar conducta-neutral.

---

## §2 — INVENTARIO READ-ONLY (bytes verificados, sondeos s54)

Ciclo de vida de la orden, mapeado end-to-end:

| Etapa | Líneas (disco) | Naturaleza |
|---|---|---|
| Abrir market `openPosition(side)` | def L1333; SL/TP L1336-1338 | mixto |
| Colocar LIMIT (desde `OrderModal`) | L2498; SL/TP por defecto L1440-1441 | mixto |
| Render líneas entry/SL/TP | L1454-1457 (crear), L1490-1513 (modificar), L1586 (borrar) | **IMPURO** (chart series) |
| Recompute SL/TP al modificar | L1524-1525 (SL), L1533-1534 (TP) | mixto |
| **Fill** (vela cruza entry) → posición | predicado L1580; `newPos` L1589/L1594 | mixto |
| Cancelar orden | L1586 | impuro |
| `closePosition` (def) | L1347; bind ref L1399 | **IMPURO** (Supabase+state) |
| Cierre — llamadas | manual L2302 (cerrar todas) / L2529 (CloseModal); breach L1709/L1720; no-breach L1563 | — |
| Persistencia `sim_trades` | load L595; insert L1370 (total) + L2541 (parcial) | **IMPURO** (Supabase) |
| Overlay de posiciones/órdenes | `PositionOverlay` L2856+ | **IMPURO** (chart) |

**El núcleo de realización es idéntico al byte en las dos rutas** (`closePosition` L1347-1370 y cierre parcial L2515-2541):

```
pnl         = calcPnl(side, entry, exit, lots, pair)          // ya en pricing.js
result      = pnl>0 ? 'WIN' : pnl<0 ? 'LOSS' : 'BREAKEVEN'
slPipsForRr = initialSlPips ?? slPips                         // FIX BUG C, idéntico
rrReal      = slPipsForRr>0 ? pnl/(slPipsForRr*lots*10) : 0
```

Única diferencia entre rutas: `lots` (total `pos.lots` vs parcial `lotsToClose`). El redondeo `parseFloat(x.toFixed(2))` ocurre DESPUÉS, en el push a `trades` y en el payload del insert — es frontera impura (formato de almacenamiento), no núcleo.

**`pipSz = 1/pipMult(pair)`** aparece en 4 puntos (L1336, L1438, L1524, L1533), siempre seguido de aritmética direccional SL/TP. Regla direccional:
- **SL:** largo → `entry − Δ`; corto → `entry + Δ`.
- **TP:** largo → `entry + Δ`; corto → `entry − Δ`.
- `Δ = pips / pipMult(pair)`.

**Predicado de fill (L1580):** `(BUY_LIMIT && low ≤ entry) || (SELL_LIMIT && high ≥ entry)`. Booleano limpio. Al fill, el lado se normaliza `BUY_LIMIT→BUY` / `SELL_LIMIT→SELL` (L1589) antes de construir `newPos`.

---

## §3 — FRONTERA PURO / IMPURO

### §3.1 — `lib/trading/orders.js` (NUEVO, encadena `pricing.js`)

| Función | Firma propuesta | Devuelve | Origen inline | Prioridad |
|---|---|---|---|---|
| `realizePnl` | `{ side, entry, exit, lots, pair, initialSlPips, slPips }` | `{ pnl, rrReal, result }` **(raw, sin toFixed)** | L1347-1370 ≈ L2515-2541 | **ALTA — deduplica 2 rutas** |
| `priceFromPips` | `{ isLong, entry, pips, pair, leg }` (`leg ∈ {'SL','TP'}`) | `number` (precio) | L1336-38, L1440-41, L1525, L1534 | **ALTA — deduplica 5 sitios** |
| `isFilled` | `{ isLong, entry, high, low }` | `boolean` | L1580 | BAJA (1 sitio; ver §3.3) |

- `realizePnl` llama internamente a `calcPnl` (encadenamiento de módulos del dominio, como `breach.js` llama a `pipMult`/`calcPnl`). Devuelve valores **raw**; el `toFixed(2)/parseFloat` se queda en la frontera impura (push a `trades` + payload de insert), donde ya vive. Así la equivalencia es bit-idéntica sobre los raw y el redondeo no entra al productor.
- `priceFromPips` es de **una sola pierna**: SL leg → largo resta / corto suma; TP leg → largo suma / corto resta; `Δ = pips/pipMult(pair)`. Los sitios market y placement la llaman dos veces (SL+TP); los sitios de modificación, una.

### §3.2 — Se queda IMPURO en `_SessionInner.js`

Todo `cr.priceLines` (L1454-1586), `closePosition` (Supabase+state, refs, `setBalance/setTick`), `openPosition`, placement L2498, cancelación L1586, construcción de `newPos` (ensamblado de estado), payloads de `sim_trades` insert, y `PositionOverlay` (L2856+). Del cierre, **solo** la matemática (`pnl/rrReal/result`) sale al productor; el payload, el push a `trades`, los efectos y la persistencia se quedan.

### §3.3 — Nota sobre `isFilled`

Valor de dedup **bajo**: un solo call site (L1580), no elimina duplicación. Aporta solo testabilidad aislada del predicado y saca una regla de trading del componente. Recomendación CTO: incluirla en `orders.js` por coherencia y para su harness, pero es **deferible** si en 3b su cableado añadiera riesgo sin pago. No es la razón de ser del corte.

---

## §4 — TENSIONES

### §4.1 — TA · Cierre parcial (RECOMENDACIÓN FIRME)

**Recomendación firme: un solo núcleo `realizePnl` con `lots` como parámetro libre**, que cubre cierre total (`lots = pos.lots`) y parcial (`lots = lotsToClose`) sin bifurcar la matemática.

Justificación: el inventario (§2) probó que las dos rutas son **idénticas al byte salvo `lots`**. Un núcleo parametrizado en `lots` reproduce ambas exactamente y elimina la duplicación que es el motivo principal del corte. La bifurcación total/parcial (cuánto se cierra, qué pasa con el remanente `pos.lots − lotsToClose`, los dos caminos de insert) **se queda impura** en el componente: `realizePnl` solo entrega `{pnl, rrReal, result}` para el `lots` que se le pase; quién decide el `lots` y qué hace con el remanente no es asunto del productor.

> **Alternativa documentada (descartada):** dos núcleos separados (`realizePnlFull` / `realizePnlPartial`). Trade-off: duplica deliberadamente una matemática que ya es idéntica, contradice el inventario y multiplica la superficie de harness sin ganancia. Se descarta. Se deja registrada para que la ratificación de s55 sea informada.

### §4.2 — TB · Derivación de `result`/`rrReal` (CERRADA)

Cerrada en el inventario: ambas rutas derivan `result` y `rrReal` con fórmula idéntica (§2). `result` (string `WIN`/`LOSS`/`BREAKEVEN`) y `rrReal` (con el fallback `initialSlPips ?? slPips` del FIX BUG C) entran en `realizePnl`. Sin ambigüedad.

### §4.3 — TC · Equivalencia (estrategia)

Mismo método que el Corte 2, dos capas:
- **Capa-1 (sandbox CTO):** harness viejo-vs-nuevo. Oráculo = transcripción literal de los bytes inline; comparación `Object.is` sobre la tupla devuelta. Corre en el sandbox V8 (mismo motor que el cliente Next), NO en la zsh de Ramón (`orders.js` es ESM; §15). Import extensionless vía resolve hook (`module.register`), sin tocar los bytes a shippar.
- **Capa-2 (smoke prod):** abrir/cerrar/parcial en navegador real, JPY + no-JPY.

Cierre bicapa por **identidad de bytes**: el sandbox prueba que ESTOS bytes ≡ inline; `md5` en disco prueba que el disco tiene ESTOS bytes.

### §4.4 — TD · Normalización de dirección (RECOMENDACIÓN FIRME)

Los call sites pasan el lado en dos sabores: market (`'BUY'`/`'SELL'`) y limit (`'BUY_LIMIT'`/`'SELL_LIMIT'`), tratando largo ≡ {BUY, BUY_LIMIT}. **Recomendación firme:** los productores `priceFromPips`/`isFilled` reciben `isLong: boolean`; la conversión `side→isLong` ocurre en la **frontera impura** vía un helper trivial `isLongSide(side) = side==='BUY' || side==='BUY_LIMIT'`. Esto saca el string-matching del núcleo y evita deriva si el naming cambia. `isLongSide` es puro y trivial: candidato a export de `orders.js` para reúso, o inline en cada boundary. (`realizePnl` NO necesita normalización: recibe `pos.side ∈ {BUY,SELL}` — el lado ya está normalizado al fill, L1589 — y lo pasa a `calcPnl`.)

> **Alternativa:** productores que aceptan el string crudo y normalizan dentro. Trade-off: acopla el productor al naming de sides. Descartada a favor de `isLong` en la frontera.

### §4.5 — TE · Frontera de redondeo (CERRADA)

`realizePnl` devuelve raw; el `parseFloat(x.toFixed(2))` permanece en el push a `trades` y en el payload del insert, exactamente donde está hoy. El harness valida raw → equivalencia exacta sin que el redondeo entre al productor.

---

## §5 — ITEMS ABIERTOS QUE EXIGEN INVENTARIO ANTES DE DISEÑAR

Estos NO se diseñan a ciegas. Cada uno abre con su sondeo read-only en s55:

1. **T2 — doble pasada de `floatingOtherPairs`.** En s54 solo está inventariada la pasada del breach (L1652/L1660/L1691, input de `resolveBreach`). La **segunda** pasada (probablemente en el cómputo de equity/unrealized mostrado, p.ej. cerca de `unrealized` L1855) NO está mapeada. **3c abre con un sondeo de la segunda pasada** antes de fijar su frontera y su estrategia de dedup. Disciplina de fase: T2 se cierra aquí, pero su diseño concreto espera al inventario.

2. **`*10` hardcoded en `rrReal`** (`pnl/(slPipsForRr*lots*10)`). Pregunta de HECHO, no de diseño: parece pip-value implícito (~$10/pip/lote estándar), pero hay que verificar si es correcto en JPY y si debería derivarse de `pipMult`/un pip-value en `pricing.js`. **No entra "arreglado" al núcleo:** `realizePnl` reproduce el `*10` verbatim (conducta-neutral). Corregirlo, si resultara incorrecto, es trabajo de su propia fase, no de este refactor (§13). Sondeo de confirmación recomendado en s55 antes de 3a, pero no bloquea la extracción.

---

## §6 — NOMBRES VÍRGENES (§56 — VERIFICAR EN PASO 0 DE S55)

Nombres PROPUESTOS, a confirmar con cero colisión por `grep -c` (recordatorio §2.6: `grep -c` cuenta líneas; para ocurrencias `grep -o "patrón" archivo | wc -l`):

- `orders.js` (archivo en `lib/trading/`)
- `realizePnl`, `priceFromPips`, `isFilled`, `isLongSide` (identificadores)

Señal preliminar favorable: el predicado inline usa `hit` (L1580), no `isFilled` — sin colisión aparente. **A verificar en bytes, no asumir.**

---

## §7 — ORDEN DE SUB-CORTES Y GATES

Mismo patrón productor→harness→cableado→push→smoke del Corte 2, con el cableado **desglosado por función** (Corte 3 tiene más superficie que el breach; cada cableado debe ser pequeño y reversible):

- **PASO 0 (s55):** baseline bicapa real + verificación de nombres vírgenes (§6) + sondeo `*10` (§5.2).
- **3a — productor + harness.** Escribir `orders.js` (`realizePnl` + `priceFromPips` + `isFilled` + `isLongSide`), extracción verbatim de los inline. Harness capa-1 sandbox con las tres matrices (§8), `Object.is`, 0 fails. Entregable descargable, `md5` disco = sandbox. Commit (código muerto — `orders.js` aún no importado — runtime intacto).
- **3b — cableado, por función, un paso por mensaje:**
  - **3b.1** `realizePnl` en las dos rutas de cierre (L1347-1370 y L2515-2541). Verificar en bytes: wc, órfanos del núcleo viejo 0, conteos, `next build --no-lint` PASS. Commit.
  - **3b.2** `priceFromPips` en los 5 sitios (L1336-38, L1440-41, L1525, L1534) + `isLongSide` en las fronteras. Verificar. Commit.
  - **3b.3** `isFilled` en L1580 (o diferir, §3.3). Verificar. Commit.
- **3c — T2 (`floatingOtherPairs`):** sondeo de la segunda pasada → diseño de dedup → cableado. Su propio paso, con verificación bicapa.
- **Push (gate §3.1, OK NOMINAL).** Deploy verificado en bytes (§38, Vercel).
- **Smoke capa-2** (§8.2).

Cada commit cierra bicapa (shell de Ramón + output de Claude Code coinciden) antes del siguiente paso. Edits vía Claude Code con OK **"opción 1 manual"** explícito, nunca "allow all".

---

## §8 — ESTRATEGIA DE EQUIVALENCIA (detalle)

### §8.1 — Capa-1 (harness sandbox)

Oráculo por función = transcripción literal de los bytes inline. Comparación `Object.is`.

| Función | Ejes de la matriz | Tupla comparada |
|---|---|---|
| `realizePnl` | side {BUY,SELL} × zona-result {WIN,LOSS,BE} × par {JPY,noJPY} × lots {total,parcial} × `initialSlPips` {presente, null→fallback} × `slPipsForRr` {>0, =0→guard} × valores numéricos | `{pnl, rrReal, result}` raw |
| `priceFromPips` | `isLong` {T,F} × `leg` {SL,TP} × par {JPY,noJPY} × entry/pips variados | `precio` |
| `isFilled` | `isLong` {T,F} × low {≤entry, >entry} × high {≥entry, <entry} | `boolean` |

Cobertura obligatoria: ambas ramas direccionales SL/TP, el guard `slPipsForRr=0`, el fallback `initialSlPips ?? slPips`, y el ×100 de JPY a través de `pipMult`/`calcPnl`. Conteo de casos a fijar en s55 (orden de magnitud Corte 2: decenas de miles).

### §8.2 — Capa-2 (smoke prod, discriminante)

En navegador real, JPY + no-JPY:
- Abrir market, cerrar manual total → `pnl/rr/result` correctos, insert en `sim_trades`.
- Abrir y **cerrar parcial** → remanente correcto, dos trades coherentes (parcial `PARTIAL` + lo que reste).
- Colocar LIMIT, dejar que rellene (vela cruza entry) → posición creada con SL/TP correctos.
- Verificar que el JPY respeta `pipMult ×100` en SL/TP y P&L en runtime real.

---

## §9 — INVARIANTES Y DISCIPLINA

- **Invariantes fase 4 intactas:** en `_SessionInner.js` → `cr.series.setData|update`=0, `computePhantomsNeeded`=3, header §1.7 de `chartViewport.js` verbatim.
- **Baseline de conteos al cierre s53 (NO re-derivar):** `pipMult`=8, `calcPnl`=7, `resolveBreach`=2, `pipSize`=0, imports pricing+breach=1/1. Tras 3b, `pipMult`/`calcPnl` MOVERÁN (migran a `orders.js`/quedan vía productor); fijar el nuevo baseline EN BYTES, no estimar (§43/§52). Aparecerán nuevos: `realizePnl`/`priceFromPips`/`isFilled` con sus conteos.
- **Nota de baseline (corrección s54):** `.eq('pair'` cae en disco en **L352/L375** (la doc de s53 anotó 351/374, +1 desfasada; md5 idéntico confirma que el byte no cambió). Per-par es Corte B, ajeno a este corte; se anota para que el PASO 0 de s55 use números de disco.
- **§15 ESM:** `orders.js` no se ejecuta en la zsh de Ramón (ESM vs CommonJS). Verificación viejo-vs-nuevo en sandbox; identidad en disco por `md5`.
- **zsh:** bloques empiezan con `cd …`; sin comentarios `#`; commits con `!`/`` ` ``/`$`/`#` en comillas SIMPLES; `§`→`s` en el texto del commit.
- **No arrastrar alcance (§13):** el `*10` se reproduce, no se corrige; nada fuera de §1.
- **Conducta-neutral:** el Corte 3, como el Corte 2, es reescritura con extracción de parámetros — equivalencia verificada, no movimiento de bytes.

---

— CTO (diseño s54, para ejecución s55)
