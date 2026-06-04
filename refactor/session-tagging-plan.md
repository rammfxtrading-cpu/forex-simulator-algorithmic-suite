# PLAN Feature SESSION TAGGING — Bloque 3, feature 2/4

> Redactado sesión 57, 4 junio 2026. PLAN MAESTRO §1.4 / §2.3.
> Inventario PASO 0 s57 cerrado en bytes (repo) + SQL Editor (BD). CERO código escrito.
> Disciplina: bicapa estricta, cortes con cierre md5, NADA de UPDATE/push sin gate nominal.

---

## §0 — Objetivo

Etiquetar cada trade con la killzone en que se tomó y arreglar el bug **"salen 0"** de
las métricas por sesión en `/analytics`. Tras esto: Montecarlo (feature 3/4).

---

## §1 — Inventario PASO 0 s57 (verificado en bytes / BD)

### §1.1 Productor — los trades los escribe el CLIENTE

Dos inserts directos a Supabase en `components/_SessionInner.js` (3061 líneas, md5 `b06fde71`):

| Insert | Línea | Caso |
|---|---|---|
| 1 | L1382 | cierre total (`closePosition`: MANUAL/SL/TP/breach) |
| 2 | L2567 | cierre PARCIAL (rama `lotsToClose < pos.lots`) |

Payload idéntico en ambos: `user_id, session_id, pair, side, lots, entry_price,
exit_price, sl_price, tp_price, rr, pnl, result, notes, opened_at, closed_at`.
**`session_type` NO se escribe.** Ningún endpoint de `pages/api/` escribe trades
(solo select en challenge/status, challenge/advance, admin/*).

`opened_at` = ISO real desde `pos.openTime` (unix). Fallback si no es real:
`new Date()` (reloj de pared) — vector de suciedad, ver §5.

### §1.2 Tabla `sim_trades` (BD, 4 jun 2026)

21 columnas. Las relevantes:

- **`session_type` text, nullable — YA EXISTE. 0/155 filas pobladas.**
- `tags` ARRAY nullable — existe, sin uso (fuera de alcance).
- `opened_at` timestamptz **NOT NULL** — 0 nulls, rango 2025-10-23 → 2026-01-30.
- 155 filas totales.

**Consecuencia mayor: NO hace falta ALTER.** El gate §3.1 de DDL no aplica. El único
toque a BD sería el backfill (UPDATE de datos, §4 Corte D): backup + OK nominal.

### §1.3 Consumidor — `pages/analytics.js` (418 líneas)

- L86: `select('*')` de `sim_trades` por `user_id`.
- **L128-133: `sessionStats` filtra por `t.session_type`** con valores
  `'london' | 'new_york' | 'asia' | 'out_of_session'`.
- L348-351: render de los 4 buckets (London/New York/Asia/Out of Session).

**Diagnóstico del bug "salen 0": el consumidor filtra por una columna que el productor
nunca pobló.** 0/155 → los 4 buckets dan `[]` siempre. Causa única, carácter cerrado.

Pre-check obligatorio del Corte B/C (§43 paths exhaustivos): `grep -rn "session_type"`
global para enumerar TODOS los consumidores (dashboard.js hace `select('*')`; no
verificado aún si lee la columna).

### §1.4 Dominio — `lib/killzonesDomain.js` (94 líneas, md5 `07089a50`)

Ya existe todo lo necesario: `SESSIONS` (asia 20:00 NY crossesMidnight / london
02:00-05:00 / nyam 07:00-10:00 / nypm 13:30-16:00 — fin exacto de asia a confirmar en
bytes en el PASO 0 del Corte A), `toNYHM` (DST correcto), `inSession(ts, key)`,
`nextSessionOpen`. El engine trabaja en timestamps REALES (hecho s56) → la derivación
aplica directa sobre `opened_at`.

---

## §2 — Decisión de arquitectura: persistir, no derivar al vuelo

Pregunta del handoff §7: ¿columna en BD o derivación on-the-fly en la agregación?

**Decisión CTO: PERSISTIR en `session_type`.** Razones:
1. La columna ya existe y el consumidor ya la espera — derivar al vuelo obligaría a
   reescribir analytics y duplicar el dominio NY/DST en el cliente de métricas.
2. Histórico backfilleable: `opened_at` es real → derivable retroactivamente (155 filas).
3. Coste de escritura: 1 campo más en 2 inserts existentes. Cero round-trips extra.

La derivación vive en UN sitio (`killzonesDomain`), el dato viaja con el trade.

---

## §3 — Preguntas de diseño para Ramón (cierran el contrato; NADA de código antes)

- **D1 — Momento del tag.** Propongo: killzone del momento de APERTURA (`opened_at`),
  que es la lectura estándar del trader ("tomé el trade en Londres"). Alternativa:
  momento de cierre. ¿Apertura?
- **D2 — Vocabulario en BD.** Dos opciones:
  - **(a) Vocabulario del consumidor actual** (`london`/`new_york`/`asia`/`out_of_session`):
    analytics queda INTACTO; se pierde la distinción NY AM vs NY PM en el dato.
  - **(b) Vocabulario del dominio** (`asia`/`london`/`nyam`/`nypm`, null = fuera):
    dato más rico (separa NY AM de NY PM, valioso para mentoría), exige edit pequeño
    en analytics (L128-133 + L348-351) y decidir presentación de nypm.
  Recomendación CTO: (b), el edit es trivial y unifica vocabulario proyecto. Decide tú
  como trader: ¿quieres NY AM y NY PM separados en métricas?
- **D3 — NY PM (13:30-16:00 NY).** Si D2=(a): ¿nypm cuenta como `new_york` o como
  `out_of_session`? Si D2=(b): ¿bucket propio en analytics o agrupado bajo NY?
- **D4 — Backfill de las 155 históricas.** Propongo SÍ: backup `sim_trades_backup_s57`
  previo + UPDATE idempotente (`where session_type is null`) + OK nominal. Alternativa:
  solo trades nuevos (los buckets históricos seguirían a 0).

---

## §4 — Cortes (patrón go-to s56: dominio puro → cableado → BD → gate → smoke)

- **Corte A — `sessionKeyAt(utcTs)` en `killzonesDomain.js`.** Función pura:
  timestamp unix → key de sesión (`'asia'|'london'|'nyam'|'nypm'`) o `null`. Wrapper
  fino sobre `SESSIONS`+`inSession` (sin candles, a diferencia de `nextSessionOpen`).
  PASO 0 del corte: leer en bytes la semántica de bordes de `inSession`
  ([start,end) vs [start,end]) y el fin de asia; replicarla, no inventarla.
  Harness capa-1 sandbox: deterministas (4 zonas, bordes exactos de ventana, DST
  primavera/otoño, asia crossesMidnight, null fuera de sesión) + property checks
  (consistencia con inSession). PRE-CHECK md5 + cierre identidad md5 3 capas.
- **Corte B — Productor.** Añadir `session_type: <map(sessionKeyAt(openTime))>` a los
  DOS inserts (L1382 y L2567), mapeo según D2. Si `openTime` no es real (fallback
  wall-clock): `session_type: null` — no contaminar con reloj de pared. Pre-check
  grep global `session_type` (§1.3). Invariantes fase 4 + build PASS.
- **Corte C — Consumidor (solo si D2=(b)).** Edit `analytics.js` L128-133 keys +
  L348-351 labels/colores según D3.
- **Corte D — Backfill (solo si D4=SÍ).** Backup `create table sim_trades_backup_s57
  as select * from sim_trades` → UPDATE idempotente derivando con
  `opened_at AT TIME ZONE 'America/New_York'` (Postgres maneja DST nativo; ventanas
  duplicadas del Corte A trasladadas a SQL y contrastadas contra `sessionKeyAt` en una
  muestra antes de ejecutar) → verificación conteos por bucket. **Gate nominal "OK
  UPDATE"** aunque no sea DDL: mutación masiva de datos.
- **Corte E — Push gate §3.1 + smoke producción.** Smoke con la feature go-to recién
  estrenada: saltar a apertura de Asia/Londres/NY, abrir y cerrar 1 trade en cada una,
  verificar `session_type` en BD y buckets en `/analytics` ≠ 0. Path extra: trade
  fuera de sesión → bucket out/null correcto. Cierre parcial → mismo tag.

---

## §5 — Riesgos anotados

1. **`opened_at` sucio** (fallback `new Date()` del productor): si alguna de las 155
   tiene reloj de pared, su tag de backfill será coherente con el dato guardado pero
   no con la vela simulada. Asumible (datos de testers); anotado, sin sanity complejo.
2. **Vocabulario divergente** dominio↔consumidor: queda cerrado por D2/D3 ANTES de
   escribir una línea.
3. **DST en SQL** (Corte D): no replicar a mano la matemática de `toNYHM`; usar
   `AT TIME ZONE` y contrastar muestra contra `sessionKeyAt` (capa Node) pre-UPDATE.
4. **Consumidores no enumerados** de `session_type`: pre-check grep global en Corte B.

---

## §6 — Criterio de cierre de la feature

- `sessionKeyAt` en dominio con harness 0 fails + identidad md5 3 capas.
- 2 inserts escriben `session_type` (build PASS, invariantes fase 4 intactas).
- Backfill ejecutado (si D4=SÍ) con backup previo y conteos verificados.
- Smoke producción: buckets de `/analytics` ≠ 0 con trades reales en ≥3 zonas.
- PLAN MAESTRO actualizado (feature 2/4 cerrada) en el handoff de cierre.

— CTO, s57

---

## §7 — CONTRATO CERRADO (s57, input Ramón)

- **D1 = APERTURA.** El trade cuenta en la sesión en que se ABRE (`opened_at`).
- **D2 = (b) vocabulario del dominio.** `session_type` toma `asia|london|nyam|nypm`,
  `null` = fuera de sesión. Analytics se adapta (Corte C).
- **D3 = NY AM y NY PM como buckets SEPARADOS** en las métricas.
- **D4 = NO backfill. Corte D CANCELADO.** Los 155 históricos se BORRARÁN antes de la
  apertura a alumnos (decisión Ramón: todo a 0 en el arranque) — etiquetarlos no
  aporta. Quedan sin tag hasta ese borrado (operación futura, gate propio).

**Ampliación de alcance (Ramón):** las métricas por sesión deben ser visibles también
desde el panel de ADMIN (vista por alumno). `admin/alumno-sim/[id].js` ya devuelve los
trades del alumno ("todos los campos que usa /analytics") — verificar en bytes en el
Corte C si la vista admin reutiliza la agregación o necesita edit propio.

**Pendiente NUEVO fuera de esta feature (al handoff):** acción admin "Eliminar perfil"
— borrar acceso + datos del simulador del alumno (sesiones, trades, drawings) SIN
tocar su cuenta del ecosistema (hub/journal). Complementa "Desactivar" (existente).
Mini-fase propia: borrado de datos exige backup + doble confirmación + gate.

Cortes vigentes tras el contrato: **A (dominio) → B (productor) → C (consumidor
analytics + admin) → E (push gate §3.1 + smoke producción)**.
