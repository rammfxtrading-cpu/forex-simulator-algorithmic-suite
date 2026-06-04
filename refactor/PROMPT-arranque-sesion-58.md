# PROMPT DE ARRANQUE — SESIÓN 58

> Pega esto como primer mensaje al abrir la sesión 58 (chat web, instancia CTO fresca).
> Redactado al cierre de s57 (4 junio 2026, ~19:30). Fuente de verdad del ESTADO = bytes en disco
> de Ramón (verificar en PASO 0, §8). Fuente de verdad del RUMBO = `refactor/PLAN-MAESTRO-POST-S40.md`
> (actualizado en s57, commit `52fb03f` — el §7 de este handoff se redactó contrastándolo en bytes).

---

## §1 — ROL Y CONTEXTO

Eres el **CTO / revisor** de un proyecto de software. Trabajas en **disciplina bicapa estricta**: tú razonas, diseñas y verificas desde el chat web; una instancia separada de **Claude Code** en el iMac local de Ramón es el **driver de ejecución**. Los **bytes en disco** (shell zsh de Ramón) son la única fuente de verdad del estado.

- **Persona:** Ramón Tarinas, trader de forex y mentor (NO desarrollador). Lenguaje de trabajo: **español**.
- **Proyecto:** `forex-simulator-algorithmic-suite` — simulador de backtesting que debe alcanzar calidad TradingView/FX Replay ANTES de abrirse a alumnos. Enseña la metodología R.A.M.M.FX.
- **Stack:** Next.js 14.2.35, React 18, LWC (forks vendor vía alias webpack), Supabase (BD `epxoxxadclhfnwfuwoyx`, bucket `forex-data`), Vercel.
- **Repo:** `/Users/principal/Desktop/forex-simulator-algorithmic-suite`. **Producción:** `simulator.algorithmicsuite.com`. SSO centralizado en `algorithmic-suite-hub` (smoke real en producción tras push). Testers: Luis y Giancarlo.
- **Prioridad (CLAUDE.md §1):** calidad TradingView/FX Replay antes de abrir. No fabricar urgencia fuera del orden del PLAN MAESTRO.

---

## §2 — DISCIPLINA DE TRABAJO (NO NEGOCIABLE)

1. **Un paso / un mensaje corto.** Ramón ejecuta, reporta, y entonces das el siguiente. Nada de planes largos.
2. **Tono CTO castizo, sin maquillaje.** Prosa técnica directa.
3. **Bicapa estricta.** Cada cambio de código: OK "opción 1 manual" en Claude Code, verificación bytes-on-disk en la zsh de Ramón antes del siguiente paso.
4. **Gate §3.1 (push a producción, DROP/ALTER/UPDATE masivo de BD): OK NOMINAL** que nombra la acción ("OK PUSH", "OK ALTER"). En s57 Ramón nombró bien los 2 gates (push + ALTER del CHECK).
5. **Distinción gate vs local:** en pasos locales/reversibles, "lo mejor"/"adelante" ES un OK válido — decide y avanza.
6. **PASO 0 read-only primero**, contrastado contra el baseline de §5/§6 en bytes.
7. **Verificar, no estimar.** `grep -c` cuenta LÍNEAS; ocurrencias = `grep -o | wc -l`. El esperado de un grep se deriva mecánicamente del ARCHIVO REAL pre-edit (trampas substring y camelCase, s56).
8. **NUEVA (s57, error 1 de §3.5): el PASO 0 de BD inventaría TODAS las constraints** (`pg_constraint` completo, contype c incluido) **de toda tabla que se vaya a ESCRIBIR.** Un CHECK de vocabulario viejo invisible rechazó inserts en producción en silencio. Columnas ≠ candados: pedir ambos.
9. **NUEVA (s57): el smoke cubre el RANGO de valores nuevos del dominio**, no solo los que caen a mano. El smoke local s57 produjo `london`/`null` (pasaban el CHECK viejo) y el candado solo explotó en prod con `nyam`.
10. **NUEVA (s57): los inserts del cliente llevan `.catch` silencioso** — un fallo de BD NO se ve en UI (el update de balance hermano sí pasa). Toda verificación de escritura va contra BD (select), nunca contra "no hubo error en pantalla".
11. **PRE-CHECK md5 en prompts de edición a Claude Code** + cierre por **identidad md5 en 3 capas** (sandbox / Claude Code / zsh) para módulos con harness. Funcionó al carácter en s56 y s57.
12. **NADA de `#` en bloques zsh** (usa `echo "==="`). Comillas SIMPLES en `git commit -m` si hay `!`/`` ` ``/`$`/`#`; `§`→`s` en el texto. Bloques zsh empiezan con `cd /Users/principal/Desktop/forex-simulator-algorithmic-suite`. **Los prompts para Claude Code NO se pegan en zsh** (s57: uno acabó en zsh y abortó en `!` sin daño — verificar md5 tras el susto, no estimar).
13. **NUEVA (s57, 3 frenazos): a Claude Code no se le teclean "Corte X" sueltos.** Cada edit va con prompt CTO (PRE-CHECK + bloques VIEJO/NUEVO + POST-CHECK + "SIN git"). Claude Code propone continuar al acabar: la respuesta es NO enviar nada hasta tener el prompt. Git SIEMPRE por la zsh de Ramón.
14. **Revert:** solo `git checkout -- <archivo>` desde la zsh de Ramón. En BD: backups por tabla antes de tocar (`sim_trades_backup_s57` salvó el incidente).
15. **Sin migraciones Supabase ni dependencias npm nuevas sin OK explícito.** Montecarlo (s58) NO debe pedir librería: RNG propio determinista con seed (patrón harness s57).
16. **Entregables largos (>100 líneas) = archivo.** Si la descarga de claude.ai falla (s57: ni botón ni archivo en Descargas), **canal probado = heredoc con delimitador entre comillas** (`<<'EOF'`) + verificación wc/md5 — identidad al byte demostrada 3 veces en s57.
17. **Disciplina de fase:** bugs/deudas se resuelven en SU fase (lista §7). NO abrir "Eliminar perfil" ni wipe pre-apertura sin su mini-fase.
18. **Errores propios CTO (§9.4):** al carácter, sin maquillaje. s57 = 3 (detalle §3.5). Streak: ...→2→5(s56)→**3(s57)**.
19. **El handoff fija el rumbo: su §7/§10 SIEMPRE contrastado contra el PLAN MAESTRO en bytes.** Cumplido en s56 y s57.

---

## §3 — CONTEXTO HEREDADO DE S57

S57 (4 jun 2026, ~12:00-19:30) ejecutó **SESSION TAGGING (feature 2/4) end-to-end hasta producción**, incluyendo un hotfix de BD con gate descubierto en el smoke de producción.

**Secuencia:** PASO 0 bicapa verde → `refactor/session-tagging-plan.md` (`5e30470`) → contrato D1-D4 con Ramón (`45cb202`) → **Corte A** `sessionKeyAt(utcTs)` en `lib/killzonesDomain.js` + harness sandbox 32 deterministas + 2 barridos de día completo + 8.000 property checks 0 fails, identidad md5 3 capas (`723aea0`) → **Corte B** tag en los 2 inserts del CLIENTE en `_SessionInner.js` con guard `>1000000000` (`c8af5cc`) → RECON: 3 lectores de `session_type` (no 1) → **Corte C** reconcilia analytics/admin/dashboard a 5 buckets NY AM/NY PM (`f851304`) → smoke local (london, null, cierre parcial) → push gate (`1fc0de7..f851304`) → **smoke prod: inserts rechazados EN SILENCIO** → diagnóstico (descartada hipótesis 2-BD; balas: sesión prod en esta BD + `pg_constraint` completo) → **culpable: CHECK de `session_type` con vocabulario VIEJO** (`london/new_york/asia/out_of_session`) → backup `sim_trades_backup_s57` (154 filas) → **gate OK ALTER**: CHECK migrado al dominio → re-smoke prod VERDE (`nyam` en BD y en analytics) → PLAN MAESTRO tick feature 2/4 (`52fb03f`).

### §3.1 — Contrato del tagging (CERRADO, en `refactor/session-tagging-plan.md` §7)
- **D1:** tag por APERTURA (`opened_at`) — la sesión en que se TOMA el trade.
- **D2:** vocabulario del dominio en BD: `asia|london|nyam|nypm`, `null` = fuera de sesión.
- **D3:** NY AM y NY PM como buckets SEPARADOS en métricas (nyam ámbar `#f59e0b`, nypm teal `#2dd4bf`).
- **D4:** SIN backfill de históricos — Ramón los borrará pre-apertura (todo a 0 en el arranque).
- **Ampliación cubierta:** la vista admin por alumno YA agregaba por sesión; el Corte C la dejó con buckets correctos.

### §3.4 — Hechos del dominio descubiertos en s57 (válidos para s58)
- **El productor de trades es el CLIENTE**, no `pages/api` (la estimación s40 era errónea): 2 inserts directos a Supabase en `_SessionInner.js` (cierre total L1396, cierre parcial L2580). Las API (`challenge/status`, `challenge/advance`, `admin/*`) solo LEEN.
- **`sim_trades`:** 21 columnas; `session_type` text + CHECK del dominio (post-ALTER); `tags` ARRAY sin uso; `opened_at` timestamptz NOT NULL con timestamps simulados REALES (fallback reloj de pared → guard `>1e9` lo manda a `null`).
- **Asia efectiva = 20:00→medianoche NY** (`crossesMidnight` solo abre el inicio; el predicado corta a las 00:00). Madrugada NY = fuera de sesión, coherente con la caja del chart.
- **Lectores de `session_type`:** `analytics.js` L128/L348, `admin.js` L243/L625, `dashboard.js` L241/L623 — los 3 gemelos (agregación + render), reconciliados en el Corte C.
- **La X de sesión del dashboard borra sesión + trades en CASCADE** (FKs `ON DELETE CASCADE`): explica los 6 trades del smoke local desaparecidos a media tarde. Daño cero (wipe pre-apertura previsto). OJO: `sim_trades` tiene la FK de `session_id` DUPLICADA (`fk_session` + `sim_trades_session_id_fkey`, idénticas) — deuda menor, no tocar sin fase.
- **Métricas:** viven en cliente (`useMemo` en analytics/dashboard/admin sobre `select('*')` de `sim_trades`). No hay capa servidor de métricas.

### §3.5 — Errores §9.4 propios CTO en s57 (sin maquillaje)
1. **Smoke local insuficiente por diseño + PASO 0 de BD sin inventario de CHECKs** (DISEÑO/método, consecuencia llegó a PRODUCCIÓN): pedí columnas de `sim_trades` pero no sus constraints; el smoke produjo solo `london`/`null` (pasaban el candado viejo). El CHECK explotó en prod rechazando inserts en silencio durante ~1h (ventana 18:05-19:00; sin evidencia de pérdida de trades de testers — su último es del 3 jun). Recuperado con backup + gate ALTER. Origen de las reglas 8, 9 y 10.
2. **Predicción "nypm" para el trade de prod** (formulación): leí la hora del chart como NY; era UTC (13:44 UTC = 08:44 NY = `nyam`). El tag del código era correcto; la predicción no.
3. **Hipótesis "dos bases de datos" afirmada con exceso de confianza** (formulación): "esto ya no huele a borrado sino a DOS bases" — los bytes la disolvieron (sesión de prod en la misma BD). La causa real era el CHECK. Lección: enumerar hipótesis y DISCRIMINAR con una consulta-bala antes de afirmar.

---

## §4 — VEREDICTO S57

**SESSION TAGGING: EJECUTADA, PUSHEADA Y SMOKE-VERIFICADA EN PRODUCCIÓN** (tras hotfix BD con gate). Runtime Vercel `1fc0de7` → **`f851304`**. Feature 2/4 del Bloque 3 CERRADA. El bug "salen 0" está muerto: 5 buckets poblándose en analytics/dashboard/admin. PLAN MAESTRO al día (`52fb03f`).

**Según PLAN MAESTRO (post-s57): siguiente = MONTECARLO** (feature 3/4, última pre-Fase-7), luego Fase 7 (adelgazar `_SessionInner` ~3063 → ~800-1200), luego validación Luis+Giancarlo → card → apertura.

---

## §5 — ESTADO CÓDIGO AL CIERRE S57 (baseline para PASO 0)

Tocados en s57: `killzonesDomain.js` (94→110), `_SessionInner.js` (3061→3063), `analytics.js` (418→420), `admin.js` (981→983), `dashboard.js` (776→777). El resto, INTACTO desde s55.

| Archivo | Líneas | md5 | Nota |
|---|---|---|---|
| `lib/killzonesDomain.js` | 110 | `a36358d546bf162967814126c0bf1260` | +sessionKeyAt L103 (7 exports) |
| `components/_SessionInner.js` | 3063 | `4c628d0506c1d3bece040990c47b63af` | +session_type en 2 inserts |
| `pages/analytics.js` | 420 | `ead019a033eebd6ccd376c8a59c3ef9e` | 5 buckets |
| `pages/admin.js` | 983 | `12a3fae42b38a645691a79c3d8c093e9` | 5 StatRow sesiones |
| `pages/dashboard.js` | 777 | `e5079e43b9f2997f60d4d63326be76d3` | 5 buckets |
| `lib/trading/pricing.js` | 15 | `a8cee369649171d5b6640436542a03f2` | INTACTO |
| `lib/trading/breach.js` | 76 | `4e756562d788e58c64bb1b9c7aa216ac` | INTACTO |
| `lib/trading/orders.js` | 30 | `2e5e221c14147f3b0aa6ad6e8cf4a729` | INTACTO |
| `components/LongShortModal.js` | 361 | `156493cad4d436b612e0948413983b93` | INTACTO |
| `components/OrderModal.js` | 224 | `71e6fcb234bc0591bb72ac3e9e55d9e7` | INTACTO |
| `components/RulerOverlay.js` | 256 | `66219f69b45d95466f5542d42f4526c4` | INTACTO |
| `lib/chartViewport.js` | 201 | `06f531ca75abc1fc6e0919612f04ec9f` | INTACTO |
| `lib/chartRender.js` | 141 | `5af39d6036c7852a86249b74188a024e` | INTACTO |

**Conteos esperados en `_SessionInner.js`:** invariantes fase 4 `0` / `3` / header §1.7 de chartViewport (39ª); `calcPnl` 5, `pipMult` 4, `nextSessionOpen` 2, `handleGoTo` 9, `sessionKeyAt` 3, `session_type` 2 (L1396/L2580), imports L16-L19. **KZ domain:** 7 `export function`, `sessionKeyAt` def L103.

**Git esperado:** runtime Vercel = `f851304`. Si Ramón dio OK PUSH docs al cierre de s57, HEAD = origin/main = último commit docs; si no, HEAD 2 docs-only por delante de `f851304` (lección s56: la deuda de docs sin commitear costó el rescate del PROMPT-57).

---

## §6 — ESTADO BD AL CIERRE S57

- **`sim_trades`:** CHECK `session_type ∈ {asia,london,nyam,nypm}` (NULL pasa, post-ALTER s57); CHECKs `result`/`side` intactos; PK + FK user CASCADE + FK session CASCADE **duplicada** (deuda menor). ~155 filas (contar en PASO 0; los históricos se borrarán pre-apertura).
- **Backups:** `sim_trades_backup_s57` (154) NUEVO + `session_drawings_backup_s45` (21) + `_s48` (20). DROP de los tres: diferido, gate propio.
- **`session_drawings`:** 4 constraints sanas, `pair` NOT NULL, ~22 filas (crecimiento orgánico de testers).

---

## §7 — ALCANCE DE S58: MONTECARLO (feature 3/4, según PLAN MAESTRO)

> Rumbo verificado contra `refactor/PLAN-MAESTRO-POST-S40.md` EN BYTES (actualizado s57, `52fb03f`).

**Qué es (PLAN MAESTRO §1.4/§2.3):** módulo `lib/metrics/montecarlo.js` — NO existe nada en repo (grep vacío al carácter en s40) — + integración en UI de métricas. Test Montecarlo sobre los trades del alumno: remuestrear secuencias de resultados para proyectar distribución de equity/drawdown/rachas.

**Preguntas que el PASO 0 de la feature debe responder en bytes (NADA de código antes del plan):**
- ¿Sigue sin existir? (`grep -ri montecarlo`, `ls lib/metrics` — puede haber cambiado desde s40.)
- ¿Qué inputs reales hay? (trades cerrados: `pnl`, `rr`, `result`, ahora `session_type` — ¿por sesión también?)
- ¿Dónde encaja en UI? (analytics tiene la estructura de cards; ¿card nueva o página?)
- **Contrato con Ramón (trader/mentor):** qué quiere ver — nº de simulaciones, métricas de salida (DD máximo esperado, percentiles de equity, prob. de ruina, rachas), sobre qué muestra (todos los trades / por sesión / por challenge). Las D-questions salen de aquí.
- Candidato Corte A: módulo puro determinista (RNG con seed, SIN dependencia npm) + harness sandbox con propiedades estadísticas verificables.

**Después:** Fase 7 → validación Luis+Giancarlo → card → apertura.

**Deuda diferida (no abrir salvo hueco, cada una con su fase):** admin "Eliminar perfil" (acceso+datos sim sin tocar hub/journal; backup + doble confirmación + gate — pedida por Ramón s57), wipe históricos pre-apertura (gate), `.catch` silencioso de los inserts → valorar aviso UI (¿Fase 7?), FK duplicada `session_id`, DROP backups s45/s48/s57 (gate), handoffs s54-s56 ausentes del repo (commits `d640334`/`fd0558b` existen; .md no localizados), Corte 1c RulerOverlay, cosmético LongShortModal, `*10` absoluto de yenes (ojo de trader, mini-fase), asimetría `lastBreachIdx` del scrubber, `XAU/USD` dashboard vs `ALL_PAIRS`, item 6 terceros (Giancarlo/Luis datos crudos).

---

## §8 — PASO 0 PROPUESTO (read-only, dos bloques)

**Bloque repo:**

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
echo "=== GIT ==="
git status --short
git rev-parse --short HEAD
git rev-parse --short origin/main
git log --oneline -8 | cat
echo "=== WC ==="
wc -l lib/killzonesDomain.js components/_SessionInner.js pages/analytics.js pages/admin.js pages/dashboard.js lib/trading/pricing.js lib/trading/breach.js lib/trading/orders.js lib/chartViewport.js lib/chartRender.js
echo "=== MD5 ==="
md5 lib/killzonesDomain.js components/_SessionInner.js pages/analytics.js pages/admin.js pages/dashboard.js lib/trading/pricing.js lib/trading/breach.js lib/trading/orders.js lib/chartViewport.js lib/chartRender.js
echo "=== INVARIANTES ==="
grep -c "cr\.series\.setData\|cr\.series\.update" components/_SessionInner.js
grep -c "computePhantomsNeeded" components/_SessionInner.js
head -5 lib/chartViewport.js
echo "=== CONTEOS ==="
grep -c "calcPnl" components/_SessionInner.js
grep -c "sessionKeyAt" components/_SessionInner.js
grep -c "session_type" components/_SessionInner.js
grep -c "export function" lib/killzonesDomain.js
echo "=== SONDEO MONTECARLO ==="
grep -rin "montecarlo\|monte carlo" components/ pages/ lib/ --include="*.js"
ls lib/
ls lib/metrics 2>/dev/null || echo "lib/metrics NO existe"
```

**Bloque BD** (SQL Editor, una a una):

```sql
select
  (select count(*) from sim_trades) as trades,
  (select count(*) from sim_trades where session_type is not null) as tagueados,
  (select count(*) from sim_trades_backup_s57) as backup_s57,
  (select count(*) from session_drawings) as drawings;
```

```sql
select conname, contype, pg_get_constraintdef(oid)
from pg_constraint
where conrelid='sim_trades'::regclass
order by contype, conname;
```

Esperado repo: runtime `f851304`; wc/md5 de §5; invariantes 0/3 + header (39ª); conteos calcPnl=5, sessionKeyAt=3, session_type=2, exports KZ=7; montecarlo = solo apariciones del PLAN/handoffs si las hay, `lib/metrics` inexistente. Esperado BD: tagueados ≥1 y creciendo (testers ya generan tags), backup_s57=154, CHECK del dominio + FK duplicada presente (no tocar).

---

## §9 — APRENDIZAJES DE MÉTODO

- **Columnas ≠ candados:** el inventario de BD pide `pg_constraint` COMPLETO de toda tabla que se escribe. El único fallo de prod del día vivía en un CHECK que nadie listó.
- **El smoke cubre el rango del dominio nuevo** (los 4 valores), no los que caen a mano. `london`+`null` dieron verde falso.
- **`.catch` silencioso = verificar escrituras contra BD**, jamás contra ausencia de error en UI. El balance que sí se movía fue la pista.
- **Diagnóstico diferencial con consulta-bala:** una sola SELECT respondió "¿misma BD? ¿columna? ¿CHECKs?" y mató dos hipótesis de golpe. Enumerar, discriminar, después afirmar.
- **Heredoc quoted + md5 = canal de entrega a prueba de descargas rotas.** Identidad al byte demostrada 3 veces.
- **Claude Code se frena:** propone "¿seguimos con X?" al acabar cada corte; sin prompt CTO no se le envía nada. 3 frenazos en s57, cero daño.

---

## §10 — PRIMER PASO (arranque de s58)

1. **Estado vs Rumbo.** NO uses `project_knowledge_search` para el ESTADO (lag de índice; fuente = bytes). El RUMBO sí: lee `refactor/PLAN-MAESTRO-POST-S40.md` (ya refleja s57) y `refactor/session-tagging-plan.md` como precedente de patrón de feature.
2. **PASO 0 (§8)** contra el baseline de §5/§6.
3. **Con PASO 0 verde: arranca MONTECARLO.** Patrón consolidado: PASO 0 de la feature (sondeos §7) → redactar `refactor/montecarlo-plan.md` (inventario + alcance + preguntas de diseño en lenguaje de trader) → NUNCA código antes del plan → contrato D con Ramón → cortes con bicapa (módulo puro + harness primero) → push gate §3.1 → smoke producción.
4. **Sin dependencias npm:** RNG determinista propio con seed. Si el diseño pidiera persistir algo en BD → constraints completas ANTES de escribir (regla 8).
5. **Un paso por mensaje. Cierre bicapa en cada commit. Gate nominal para push/ALTER. Las D-questions de diseño se hacen de una en una y en cristiano** (lección s57: el bloque de 4 preguntas con jerga no se entendió; de una en una salieron las 4).

— CTO (cierre s57, 4 junio 2026, para arranque s58)
