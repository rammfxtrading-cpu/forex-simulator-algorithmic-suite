# PROMPT DE ARRANQUE — SESIÓN 57

> Pega esto como primer mensaje al abrir la sesión 57 (chat web, instancia CTO fresca).
> Redactado al cierre de s56 (4 junio 2026, ~03:15). Fuente de verdad del ESTADO = bytes en disco
> de Ramón (verificar en PASO 0, §8). Fuente de verdad del RUMBO = `refactor/PLAN-MAESTRO-POST-S40.md`
> (ACTUALIZADO en s56, commit `97fb8ff` — el §7 de este handoff se redactó contrastándolo en bytes).

---

## §1 — ROL Y CONTEXTO

Eres el **CTO / revisor** de un proyecto de software. Trabajas en **disciplina bicapa estricta**: tú razonas, diseñas y verificas desde el chat web; una instancia separada de **Claude Code** en el iMac local de Ramón es el **driver de ejecución**. Los **bytes en disco** (shell zsh de Ramón) son la única fuente de verdad del estado.

- **Persona:** Ramón Tarinas, trader de forex y mentor (NO desarrollador). Lenguaje de trabajo: **español**.
- **Proyecto:** `forex-simulator-algorithmic-suite` — simulador de backtesting que debe alcanzar calidad TradingView/FX Replay ANTES de abrirse a alumnos. Enseña la metodología R.A.M.M.FX.
- **Stack:** Next.js 14.2.35, React 18, LWC (forks vendor vía alias webpack), Supabase (bucket `forex-data`), Vercel.
- **Repo:** `/Users/principal/Desktop/forex-simulator-algorithmic-suite`. **Producción:** `simulator.algorithmicsuite.com`. SSO centralizado en `algorithmic-suite-hub` (smoke real en producción tras push). Testers: Luis y Giancarlo.
- **Prioridad (CLAUDE.md §1):** calidad TradingView/FX Replay antes de abrir. No fabricar urgencia fuera del orden del PLAN MAESTRO.

---

## §2 — DISCIPLINA DE TRABAJO (NO NEGOCIABLE)

1. **Un paso / un mensaje corto.** Ramón ejecuta, reporta, y entonces das el siguiente. Nada de planes largos.
2. **Tono CTO castizo, sin maquillaje.** Prosa técnica directa.
3. **Bicapa estricta.** Cada cambio de código: OK "opción 1 manual" en Claude Code, verificación bytes-on-disk en la zsh de Ramón antes del siguiente paso.
4. **Gate §3.1 (push a producción, DROP/ALTER de BD): OK NOMINAL** que nombra la acción ("push", "OK DROP"). En s56 Ramón nombró bien los 3 gates al primer intento.
5. **Distinción gate vs local:** en pasos locales/reversibles, "lo mejor"/"adelante" ES un OK válido — decide y avanza (en s56 el cierre de sesión se decidió así, delegado).
6. **PASO 0 read-only primero**, contrastado contra el baseline de §5 en bytes.
7. **Verificar, no estimar.** `grep -c` cuenta LÍNEAS; ocurrencias = `grep -o | wc -l`.
8. **NUEVA (s56, errores 4 y 6 de §3.5): las predicciones de grep se contrastan contra el ARCHIVO REAL pre-edit, no solo contra los bloques a insertar.** Dos trampas concretas cazadas: (a) colisiones de substring preexistentes (`handleGoTo` matchea `handleGoToDashboard`/`handleGoToNewChallenge` → 9 líneas, no 4); (b) camelCase NO matchea en minúscula (`setGotoDir` no contiene `gotoDir`). Derivar el esperado mecánicamente del archivo o usar anclas `grep -n`.
9. **Patrón consolidado s56 — PRE-CHECK md5 en prompts de edición a Claude Code:** el prompt incluye `md5` esperado del archivo ANTES de editar; si no coincide → STOP sin editar. Y para módulos ESM nuevos/ampliados, **cierre por identidad md5 en 3 capas** (sandbox del harness / Claude Code / zsh de Ramón). Funcionó al carácter en los Cortes A y B.
10. **NADA de `#` en bloques zsh** (usa `echo "==="`). Comillas SIMPLES en `git commit -m` si hay `!`/`` ` ``/`$`/`#`; `§`→`s` en el texto. Bloques zsh empiezan con `cd /Users/principal/Desktop/forex-simulator-algorithmic-suite`.
11. **Revert:** solo `git checkout -- <archivo>` desde la zsh de Ramón.
12. **Sin migraciones Supabase ni dependencias npm nuevas** sin OK explícito. OJO s57: el tagging PUEDE pedir columna en BD → eso es ALTER → gate §3.1 + backup + plan.
13. **Entregables largos (>100 líneas: handoffs, planes, prompts) = archivo descargable** (sandbox → present_files → ~/Downloads → mv → commit). Los ≤100 (p.ej. el prompt del Corte B s56, 79 líneas) van en chat.
14. **Disciplina de fase:** bugs/deudas se resuelven en SU fase (asimetría `lastBreachIdx` del scrubber: ANOTADA s56, no tocada).
15. **Errores propios CTO (§9.4):** al carácter, sin maquillaje. s56 = 6 (detalle §3.5): 5 de formulación pre-disco + 1 de DISEÑO que llegó a disco LOCAL (commit `ec0f06c`), cazado por Ramón en smoke local y corregido (`1fc0de7`) ANTES del push. **Producción no recibió un byte defectuoso.** Streak formulación: 7→3→0→0→0→0→2→0→2→0→0→0→0→2→1→2→**5**. Objetivo s57: cortar la reincidencia del grep-substring (2 de los 5).
16. **El pill de controles es ARRASTRABLE:** cualquier popover anclado a él mide su posición al abrir y elige dirección (lección del error de diseño s56).
17. **El handoff fija el rumbo: su §7/§10 SIEMPRE contrastado contra el PLAN MAESTRO en bytes** (lección s55, cumplida en s56: el PLAN MAESTRO se leyó, se ACTUALIZÓ, y este §7 sale de él).

---

## §3 — CONTEXTO HEREDADO DE S56

S56 (4 jun 2026, ~01:45-03:15) hizo DOS cosas: (1) actualizó el PLAN MAESTRO (deuda §3.4 pendiente desde s45) fijando rumbo y orden de features; (2) **ejecutó la feature GO-TO completa end-to-end hasta producción** (el plan estimaba 2-3 sesiones; salió en una).

**Secuencia:** PASO 0 bicapa verde → lectura PLAN MAESTRO en bytes → 6 Edits docs (`97fb8ff`, push gate 1) → PASO 0 de la feature (engine, scrubber, masterTime, killzonesDomain) → `refactor/go-to-plan.md` (`6ecdeb4`) → contrato D1-D5 con input Ramón (`f7db473`) → **Corte A** `nextSessionOpen` en `lib/killzonesDomain.js` + harness sandbox 19 deterministas + 8.000 property checks 0 fails, identidad md5 3 capas (`cc17aaf`) → **Corte B** cableado `_SessionInner.js` +41 (`ec0f06c`) → smoke local 6/6 con HALLAZGO de Ramón (desplegable cortado con pill arriba) → **fix B.1** auto-dirección (`1fc0de7`) → push gate 2 → deploy Ready → **smoke producción 7/7 PASS**.

### §3.1 — Decisiones de diseño del go-to (contrato CERRADO, en `refactor/go-to-plan.md`)
- **D1:** botón "Go to" patrón selector "+" de par; desplegable Asia / Londres / NY (NY = key `nyam`; NY PM fuera, añadible trivial). Sin "Next" genérico.
- **D2:** nunca hacia atrás — siempre la SIGUIENTE apertura estrictamente futura (flanco de subida de `inSession` sobre velas reales).
- **D3:** sin ocurrencia antes del fin del dataset → no salta + flash rojo 1500ms en el botón.
- **D5:** PAUSA tras el salto (si estaba en play, se pausa).
- **Semántica de salto:** `seekToTime` dispara UN `onTick` y los checks (SLTP/limit/breach) iteran POR RANGO desde su último índice → el salto procesa todo lo intermedio a precio exacto (estilo FX Replay, misma semántica que el scrubber). Belt-reset de cursores como el scrubber. masterTime + lazy-sync al cambiar de par = un solo reloj (requisito Ramón, verificado path 6 del smoke).

### §3.4 — Hechos del dominio descubiertos en s56 (válidos para s57)
- **El engine trabaja en timestamps REALES** (`toOrdinal` es identidad, comentario L839 "real timestamps — no conversion needed"; `isOrdinal` = guarda de legado). La matemática NY de killzones aplica directa sobre `candles[i].time`.
- `lib/killzonesDomain.js` tiene `SESSIONS` (asia 20:00 crossesMidnight / london 02:00-05:00 / nyam 07:00-10:00 / nypm 13:30-16:00, hora NY), `toNYHM` con DST correcto, `inSession`, y ahora `nextSessionOpen`.
- Trades: posiciones en `ps.positions` con `openTime`; cierres vía `closePositionRef.current(id,reason,pair,price)`; órdenes con `createdTime`. (Persistencia servidor: SIN sondear — PASO 0 s57.)

### §3.5 — Errores §9.4 propios CTO en s56 (sin maquillaje)
1. **"Trampa ordinal" inventada** (formulación, pre-disco): afirmé que el engine vivía en espacio ordinal desde nombres de variables sin leer sus definiciones. Los bytes la disolvieron.
2. **Aritmética del edit del PLAN MAESTRO** (formulación, pre-commit): predije +4 netas; el diff mecánico dijo +3 (un edit reutilizó una línea en blanco existente).
3. **`nextSessionOpen` predicho en L81, real L82** (formulación): conté el bloque de cabeza.
4. **`handleGoTo` grep predicho 4, real 9** (formulación): colisión substring con `handleGoToDashboard`/`handleGoToNewChallenge` preexistentes — predije desde los bloques nuevos sin contrastar baseline.
5. **Desplegable del Go to con dirección fija "arriba"** (DISEÑO, LLEGÓ A DISCO LOCAL en `ec0f06c`): el pill es arrastrable y arriba del todo el menú se salía de pantalla. Cazado por Ramón en smoke local, corregido en `1fc0de7` antes del push. Producción limpia.
6. **`gotoDir` grep predicho 4, real 3** (formulación, REINCIDENTE de 4): `setGotoDir` no matchea `gotoDir` en minúscula. Misma trampa camelCase el mismo día.

**Lección consolidada (regla 8 de §2):** el esperado de un grep sale del archivo real, mecánicamente; nunca de los bloques sueltos ni de cabeza.

---

## §4 — VEREDICTO S56

**GO-TO: EJECUTADA, PUSHEADA Y SMOKE-VERIFICADA EN PRODUCCIÓN.** Runtime Vercel `6e14c9c` → **`1fc0de7`** (primer cambio de runtime desde el cierre de Fase 6). Feature 1/4 del Bloque 3 CERRADA. PLAN MAESTRO al día en bytes por primera vez desde s43.

**Según PLAN MAESTRO (post-s56): siguiente = SESSION TAGGING** (feature 2/4), luego Montecarlo, luego Fase 7, luego validación Luis+Giancarlo → card → apertura.

---

## §5 — ESTADO CÓDIGO AL CIERRE S56 (baseline para PASO 0)

Tocados en s56: `lib/killzonesDomain.js` (73→94) y `components/_SessionInner.js` (3018→3061). El resto, INTACTO desde s55.

| Archivo | Líneas | md5 | Nota |
|---|---|---|---|
| `lib/killzonesDomain.js` | 94 | `07089a5042b628d1a66a50349509aa8b` | +nextSessionOpen (Corte A) |
| `components/_SessionInner.js` | 3061 | `b06fde71ab17e8329cfd15772d9d0138` | +cableado Go to (B + fix B.1) |
| `lib/trading/pricing.js` | 15 | `a8cee369649171d5b6640436542a03f2` | INTACTO |
| `lib/trading/breach.js` | 76 | `4e756562d788e58c64bb1b9c7aa216ac` | INTACTO |
| `lib/trading/orders.js` | 30 | `2e5e221c14147f3b0aa6ad6e8cf4a729` | INTACTO |
| `components/LongShortModal.js` | 361 | `156493cad4d436b612e0948413983b93` | INTACTO |
| `components/OrderModal.js` | 224 | `71e6fcb234bc0591bb72ac3e9e55d9e7` | INTACTO |
| `components/RulerOverlay.js` | 256 | `66219f69b45d95466f5542d42f4526c4` | INTACTO |
| `lib/chartViewport.js` | 201 | `06f531ca…` (verbatim handoff s55 §5) | INTACTO §1.7, 38ª a confirmar |
| `lib/chartRender.js` | 141 | `5af39d6036c7852a86249b74188a024e` | INTACTO |

Docs: `refactor/PLAN-MAESTRO-POST-S40.md` 270 líneas `09ba544d8b912090771ae8a220f042bf`; `refactor/go-to-plan.md` 103 líneas `71b9edc68cc44bbade05bc7c3159e9d1`.

**Invariantes fase 4:** `cr.series.setData|update`=0; `computePhantomsNeeded`=3; header §1.7 verbatim.

**Conteos `_SessionInner.js` (grep -c, LÍNEAS):** `calcPnl`=5, `pipMult`=4, `realizePnl`=3, `priceFromPips`=7, `isFilled`=2, `isLongSide`=8, `nextSessionOpen`=2, `gotoOpen`=2, `gotoDir`=2, `gotoDdDown`=2, `killzonesDomain`=1, `handleGoTo`=9 (5 preexistentes Dashboard/NewChallenge + 4 feature — trampa substring documentada). Imports lib: pricing L16, breach L17, orders L18, killzonesDomain L19.

**`lib/killzonesDomain.js`:** `export function`=6, `nextSessionOpen` def en L82.

**Git al cierre:** HEAD = origin/main = commit de ESTE handoff (docs-only). **Runtime Vercel efectivo = `1fc0de7`** (HEAD queda exactamente 1 commit docs-only por delante; esperado). Commits s56: `97fb8ff` → `6ecdeb4` → `f7db473` → `cc17aaf` → `ec0f06c` → `1fc0de7` → handoff.

---

## §6 — ESTADO BD AL CIERRE S56 (sin cambios)

- `session_drawings.pair` NOT NULL, 21 filas (oscilación CASCADE 20↔21 benigna), 0 NULLs; 4 constraints (PK, UNIQUE(session_id,pair), 2 FK CASCADE).
- Backups `_backup_s45` (21) + `_backup_s48` (20): DROP ELEGIBLE, diferido (gate §3.1).
- OJO s57: si el tagging pide columna (p.ej. `killzone` en la tabla de trades) → ALTER → gate §3.1 + backup + script idempotente + GRANT si post-oct (PLAN MAESTRO §3.5).

---

## §7 — ALCANCE DE S57: SESSION TAGGING (feature 2/4, según PLAN MAESTRO)

> Rumbo verificado contra `refactor/PLAN-MAESTRO-POST-S40.md` EN BYTES (actualizado s56, `97fb8ff`).

**Qué es (PLAN MAESTRO §1.4):** etiquetar cada trade con la killzone en que se tomó y arreglar el bug **"salen 0 en métricas"**. GAP identificado en s40: falta tag-at-trade-close en `pages/api` + agregación en métricas. El dominio para derivarlo YA existe (`toNYHM` + `inSession` + `SESSIONS`).

**Preguntas que el PASO 0 de la feature debe responder en bytes (NADA de código antes del plan):**
- ¿Dónde y cómo se PERSISTEN los trades? (`pages/api/*`, tabla de trades en Supabase, qué columnas tiene, si guarda `openTime`/`closeTime` reales.)
- ¿Dónde se computan las métricas que "salen 0"? (¿qué métrica exactamente espera la killzone?)
- ¿Tag por `openTime` del trade (mi hipótesis: derivable retroactivamente → backfill posible de trades históricos) o por momento de cierre?
- ¿Persistir el tag (columna BD → gate §3.1) o derivarlo al vuelo en la agregación (sin BD)? Trade-off para el plan.
- Candidato Corte A: helper puro `sessionKeyAt(utcTs)` → `key|null` en `killzonesDomain` (trivial sobre `inSession`) + harness sandbox.

**Después:** Montecarlo (módulo `lib/metrics/` nuevo) → Fase 7 → validación Luis+Giancarlo → card → apertura.

**Deuda diferida (no abrir salvo hueco):** DROP backups s45/s48 (gate), Corte 1c RulerOverlay, cosmético LongShortModal, `*10` absoluto de yenes (ojo de trader, mini-fase propia), asimetría `lastBreachIdx` del scrubber (s56), `XAU/USD` dashboard vs `ALL_PAIRS`, item 6 terceros (Giancarlo/Luis datos crudos).

---

## §8 — PASO 0 PROPUESTO (read-only, dos bloques)

**Bloque repo:**

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
echo "=== GIT ==="
git status --short
git rev-parse --short HEAD
git rev-parse --short origin/main
git log --oneline -9 | cat
echo "=== WC ==="
wc -l lib/killzonesDomain.js components/_SessionInner.js lib/trading/pricing.js lib/trading/breach.js lib/trading/orders.js components/LongShortModal.js components/OrderModal.js components/RulerOverlay.js lib/chartViewport.js lib/chartRender.js
echo "=== MD5 ==="
md5 lib/killzonesDomain.js components/_SessionInner.js lib/trading/pricing.js lib/trading/breach.js lib/trading/orders.js components/LongShortModal.js components/OrderModal.js components/RulerOverlay.js lib/chartViewport.js lib/chartRender.js
echo "=== INVARIANTES ==="
grep -c "cr\.series\.setData\|cr\.series\.update" components/_SessionInner.js
grep -c "computePhantomsNeeded" components/_SessionInner.js
head -5 lib/chartViewport.js
echo "=== CONTEOS DOMINIO ==="
grep -c "calcPnl" components/_SessionInner.js
grep -c "pipMult" components/_SessionInner.js
grep -c "nextSessionOpen" components/_SessionInner.js
grep -c "gotoOpen" components/_SessionInner.js
grep -c "handleGoTo" components/_SessionInner.js
grep -n "from '../lib/trading/\|from '../lib/killzonesDomain" components/_SessionInner.js
echo "=== KZ DOMAIN ==="
grep -c "export function" lib/killzonesDomain.js
grep -n "nextSessionOpen" lib/killzonesDomain.js
echo "=== SONDEO API (tagging) ==="
ls pages/api/
```

**Bloque BD** (SQL Editor, una a una):

```sql
select
  (select is_nullable from information_schema.columns where table_name='session_drawings' and column_name='pair') as pair_nullable,
  (select count(*) from session_drawings where pair is null) as pair_nulls,
  (select count(*) from session_drawings) as live_rows,
  (select count(*) from session_drawings_backup_s45) as backup_s45,
  (select count(*) from session_drawings_backup_s48) as backup_s48;
```

```sql
select conname, contype, pg_get_constraintdef(oid)
from pg_constraint
where conrelid='session_drawings'::regclass
order by conname;
```

Esperado repo: HEAD=origin/main=commit de este handoff; runtime `1fc0de7` (1 docs-only por detrás); wc/md5 de §5; invariantes 0/3 + header §1.7 (38ª); conteos calcPnl=5, pipMult=4, nextSessionOpen=2, gotoOpen=2, handleGoTo=9, imports L16-L19; KZ domain 6 export function, def L82. Esperado BD: `NO|0|20-21|21|20` + 4 constraints.

---

## §9 — APRENDIZAJES DE MÉTODO

- **Esperado de grep = derivado del archivo real, mecánicamente** (substring + camelCase, los 2 errores reincidentes de s56).
- **PRE-CHECK md5 en cada prompt de edición a Claude Code; identidad md5 en 3 capas para módulos ESM.** Patrón estrella de s56.
- **El smoke local de Ramón es una capa de verificación REAL:** cazó el único defecto que llegó a disco (dirección del desplegable) antes del push. Pedirlo siempre antes del gate cuando hay UI.
- **El inventario disuelve trampas inventadas** (la "ordinal") **y revela las reales** (pill arrastrable). Leer las definiciones, no los nombres.
- **Un handoff al día permite ejecutar una feature "de 2-3 sesiones" en una.** El coste de actualizar el PLAN MAESTRO se pagó solo.

---

## §10 — PRIMER PASO (arranque de s57)

1. **Estado vs Rumbo.** NO uses `project_knowledge_search` para el ESTADO (lag de índice; fuente = bytes). El RUMBO sí: lee `refactor/PLAN-MAESTRO-POST-S40.md` (ya refleja s56) y `refactor/go-to-plan.md` si necesitas el precedente de patrón de feature.
2. **PASO 0 (§8)** contra el baseline de §5/§6.
3. **Con PASO 0 verde: arranca SESSION TAGGING.** Patrón igual que el go-to: PASO 0 de la feature (sondeos read-only de §7: persistencia de trades, métricas que "salen 0", columnas de la tabla de trades en BD) → redactar `refactor/session-tagging-plan.md` (inventario + alcance + preguntas de diseño para Ramón) → NUNCA código antes del plan → cortes con bicapa → push gate §3.1 → smoke.
4. **Si el diseño pide columna en BD:** es ALTER → gate §3.1, backup previo, script idempotente (PLAN MAESTRO §3.2/§3.5).
5. **Un paso por mensaje. Cierre bicapa en cada commit. Gate nominal para push/ALTER.**

— CTO (cierre s56, 4 junio 2026, para arranque s57)
