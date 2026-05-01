# HANDOFF — Saneamiento histórico B1 (cierre del cabo suelto §3.X)

> Fecha: 2 mayo 2026, sesión "simulador 10" con Claude Opus 4.7 (chat web).
> De: Ramón + Claude (chat web actuando de CTO/revisor).
> Para: el siguiente chat / próxima sesión / referencia histórica.
> Estado al cierre: working tree limpio en `main` HEAD `0cfa9f1`. Cero código tocado. 1 DELETE + 1 UPDATE quirúrgicos sobre BD producción (1 trade + 1 balance), validados al carácter con RETURNING. Sesión abierta — continúa con fase 3 viewport layer.

---

## 0. TL;DR (para futuro Claude — leer primero)

- Saneamiento histórico cerrado. Cabo suelto que dejaba `HANDOFF-cierre-b1.md §13.2` resuelto al carácter.
- Discovery con 2 queries SQL (solo lectura, sin mutación) sobre `sim_sessions` × `sim_trades` cruzando `challenge_parent_id` con `MAX(closed_at)` de la madre.
- Resultado: 2 sesiones hijas históricas con patrón B1 pre-fix (trade abierto en madre, cerrado en hija).
- Sesión 1: cadena A1 (Luis Delis, 29 abr). Documentada como evidencia auditable en HANDOFF-cierre-b4 §4.9. NO se toca.
- Sesión 2: cadena adicional de Luis Delis (26-29 abr), Fase 3 (`914c0c1d`) con BUY 3.64L heredado +$757,12. Luis estaba activo en esa Fase 3 (cursor de replay avanzado a 31 dic 2025) pero no había abierto trades nuevos.
- Decisión Ramón: comunicar a Luis + saneamiento puntual quirúrgico T1 (DELETE trade + UPDATE balance a virgen $200K). Luis confirmado al tanto antes de la mutación.
- Mutación ejecutada al carácter: 1 trade borrado con RETURNING * (datos preservados en este HANDOFF), 1 balance restaurado de $200.757,12 a $200.000,00 con guard defensivo `AND balance = 200757.12`. Verificación post-update confirmó Fase 3 virgen (0 trades, $200K balance, capital $200K, cursor intacto).
- Saneamiento histórico de B4 (last_timestamp desalineado en sesiones cerradas pre-fix B4): NO se ataca. Coherencia con `HANDOFF-cierre-b4.md §8`.
- Sesión NO se cierra. Continúa con fase 3 del refactor (viewport layer) tras este HANDOFF.

---

## 1. Resumen ejecutivo

### 1.1 Contexto de partida

`HANDOFF-cierre-b1.md §13.2` dejó pendiente: *"Saneamiento histórico (decisión separada §3.X): SELECT muestreado a `sim_sessions` con `challenge_phase >= 2` para confirmar/refutar la hipótesis de que el histórico está limpio. Si limpio → cerrar tema. Si no → sesión dedicada de saneamiento con backup explícito + dry-run."*

Cabo suelto desde el cierre de B1 el 1 may. Hoy 2 may (simulador 10) Ramón decide arrancar la sesión por aquí antes de fase 3. Decisión: saneamiento primero (corto, lectura), fase 3 después (largo, refactor).

### 1.2 Plan de la sesión

- PASO 0: query SQL de discovery sobre BD producción (solo lectura) para detectar hijas pre-fix con trades de patrón B1.
- Análisis del output → decidir si limpio, pocas afectadas, o muchas.
- Si toca: SQL de mutación quirúrgica con guards defensivos.
- HANDOFF corto. Cero código tocado.
- Continuar con fase 3 viewport layer en la misma sesión.

### 1.3 Resultado

2 sesiones hijas afectadas en histórico, ambas del mismo alumno (Luis Delis, único alumno con acceso al simulador además del propio Ramón). Cadena A1 (29 abr) preservada como evidencia. Cadena adicional (Fase 3 active) saneada quirúrgicamente con consentimiento previo del alumno.

---

## 2. Discovery — 2 queries SQL (solo lectura)

### 2.1 Query 1 — Discovery v1 (con falsos positivos)

**Hipótesis inicial:** trade en sesión hija con `opened_at < created_at` de la propia hija indica posición heredada.

```sql
SELECT
  s.id AS hija_id, s.name AS hija_name, s.challenge_phase AS hija_phase,
  s.challenge_parent_id AS madre_id, s.created_at AS hija_created_at,
  s.status AS hija_status,
  t.id AS trade_id, t.pair, t.side, t.lots,
  t.opened_at AS trade_opened_at, t.closed_at AS trade_closed_at,
  t.pnl, t.result,
  EXTRACT(EPOCH FROM (s.created_at - t.opened_at)) / 60 AS minutos_anterior
FROM sim_sessions s
JOIN sim_trades t ON t.session_id = s.id
WHERE s.challenge_parent_id IS NOT NULL
  AND s.challenge_phase >= 2
  AND t.opened_at < s.created_at
ORDER BY s.created_at DESC, t.opened_at ASC;
```

**Output:** 15 filas en 4 sesiones hijas distintas.

**Hallazgo metodológico (lección operativa):** la hipótesis era errónea. Los trades del simulador llevan `opened_at` con timestamps del replay histórico (octubre/diciembre 2025), no del tiempo real del ordenador. La columna `created_at` de la sesión sí es tiempo real (abril 2026). La diferencia da valores absurdos como ~259.000 minutos = ~180 días. La query devuelve TODOS los trades de hijas (no distingue heredados de uso normal del replay).

13 de las 15 filas son uso normal del simulador (Luis haciendo replay de oct-dic 2025 dentro de su Fase 2 creada en abril 2026). 2 filas son patrón B1 real, pero quedaron mezcladas con el ruido.

Lección: cuando un campo `opened_at` en un simulador puede llevar tiempo histórico (replay), `< s.created_at` no discrimina nada. **Hace falta un proxy temporal interno al replay.**

### 2.2 Query 2 — Discovery v2 (afilada con MAX closed_at de la madre)

**Hipótesis afilada:** trade en sesión hija con `opened_at < MAX(closed_at)` de los trades de la madre indica posición que estaba abierta cuando la madre cerró → heredada.

```sql
WITH madre_max_close AS (
  SELECT session_id AS madre_id, MAX(closed_at) AS madre_last_close
  FROM sim_trades
  WHERE closed_at IS NOT NULL
  GROUP BY session_id
)
SELECT
  s.id AS hija_id, s.name AS hija_name, s.challenge_phase AS hija_phase,
  s.challenge_parent_id AS madre_id, s.created_at AS hija_created_at,
  s.status AS hija_status,
  m.madre_last_close,
  t.id AS trade_id, t.pair, t.side, t.lots,
  t.opened_at AS trade_opened_at, t.closed_at AS trade_closed_at,
  t.pnl, t.result
FROM sim_sessions s
JOIN sim_trades t ON t.session_id = s.id
JOIN madre_max_close m ON m.madre_id = s.challenge_parent_id
WHERE s.challenge_parent_id IS NOT NULL
  AND t.opened_at < m.madre_last_close
ORDER BY s.created_at DESC, t.opened_at ASC;
```

**Output:** 2 filas en 2 sesiones hijas distintas.

| hija_id | phase | hija_status | madre_last_close | trade lots | opened_at | closed_at | pnl |
|---|---|---|---|---|---|---|---|
| `26c17a6c` | 3 | active | 2025-10-31 13:07 | SELL 4.54 | 2025-10-31 00:32 | 2025-10-31 13:07 | +1141.93 |
| `914c0c1d` | 3 | active | 2025-12-19 14:18 | BUY 3.64 | 2025-12-19 13:45 | 2025-12-19 14:18 | +757.12 |

Filtró 13 falsos positivos. Las 2 filas restantes son patrón B1 real al carácter:

- Caso `26c17a6c`: SELL 4.54L = 10% del 45.45 original (40.91 cerró el 90% disparando passed_phase + 4.54 heredado). Documentado en HANDOFF-verificacion-A1 §7 B1.
- Caso `914c0c1d`: BUY 3.64L = 10% del 36.36 original (32.72 cerró el 90% disparando passed_phase + 3.64 heredado). Patrón espejo del primero.

### 2.3 Query 3 — Autoría de la cadena adicional

```sql
SELECT id, user_id, name, challenge_phase, challenge_parent_id, status, created_at
FROM sim_sessions
WHERE id IN (
  '76e31b94-6f57-4a46-84a1-82eba9b33062',
  '914c0c1d-ceed-4fe1-bd8a-92f1ac984fc9',
  'a6715506-2d18-46e7-9320-7166e5eb2c9c'
)
ORDER BY created_at ASC;
```

**Output:** las 3 sesiones de la cadena pertenecen a `user_id = 4171ff26-df4e-45a3-b718-f9420afbf449`.

| id (corto) | phase | status | created_at |
|---|---|---|---|
| `a6715506` | 1 | passed_phase | 2026-04-26 23:46 |
| `76e31b94` | 2 | passed_phase | 2026-04-27 00:39 |
| `914c0c1d` | 3 | active | 2026-04-29 02:35 |

### 2.4 Query 4 — Identificación del usuario

```sql
SELECT id, email, nombre, rol_global, simulador_activo
FROM profiles
WHERE id = '4171ff26-df4e-45a3-b718-f9420afbf449';
```

**Output:** Luis Delis (`luisdeliscp22@gmail.com`), rol `user`, simulador activo. **Es el alumno reportador de B4** según HANDOFF-verificacion-A1 §1. Único alumno con acceso al simulador además de Ramón.

### 2.5 Query 5 — Inventario completo de Fase 3 de Luis

```sql
SELECT id AS trade_id, pair, side, lots, entry_price, exit_price, pnl, result,
       opened_at, closed_at, created_at
FROM sim_trades
WHERE session_id = '914c0c1d-ceed-4fe1-bd8a-92f1ac984fc9'
ORDER BY opened_at ASC;
```

**Output:** 1 sola fila. Trade `270ef475` (BUY 3.64L, +$757.12 WIN, opened 19 dic 13:45, closed 19 dic 14:18). El único trade en su Fase 3 era el heredado.

### 2.6 Query 6 — Estado de la sesión

```sql
SELECT id, name, status, balance, capital, last_timestamp, created_at
FROM sim_sessions
WHERE id = '914c0c1d-ceed-4fe1-bd8a-92f1ac984fc9';
```

**Output:** balance $200.757,12 (capital $200K + WIN heredado $757.12), `last_timestamp = 1767100320` = 31 dic 2025 03:12 UTC en mundo replay. Luis avanzó el cursor 12 días post-cierre del trade heredado pero no abrió trades nuevos.

---

## 3. Decisiones tomadas

### 3.1 Comunicar a Luis: SÍ

Razones:
- Es el alumno de confianza que reportó B4. Merece feedback loop completo del diagnóstico→fix→saneamiento.
- Su sesión activa lleva residuos de B1 pre-fix.
- Pedagógicamente coherente: él reportó, Ramón diagnosticó, fixeó, sanea.

Mensaje enviado por Ramón antes de la mutación, con confirmación previa de Luis.

### 3.2 Saneamiento puntual T1 quirúrgico: SÍ

Opciones consideradas:
- **T0 — No tocar:** Fase 3 sigue con $200.757,12. Cuando Luis cierre Fase 3 (pass o fail) o `passed_all`, el balance final tendrá sesgo no-doctrinal de $757,12. Descartado.
- **T1 — DELETE trade heredado + UPDATE balance a $200K virgen:** mínimo invasivo, reversible (RETURNING preserva datos), 1 fila DELETE + 1 fila UPDATE. **Adoptado.**
- **T2 — Reset completo Fase 3:** descartado. Aunque el único trade actual era el heredado, T1 es más quirúrgico y respeta cualquier estado mental que Luis tenga sobre su Fase 3.

### 3.3 NO tocar `last_timestamp` de Fase 3

Cursor del replay (1767100320 = 31 dic 2025) refleja "donde Luis dejó su replay", no "donde el bug se manifestó". Mantenerlo respeta su tiempo invertido haciendo play. Fase 3 queda virgen ($200K, 0 trades) pero con cursor avanzado donde Luis lo dejó.

### 3.4 NO tocar cadena A1 (Luis, 29 abr — sesiones `ab39d9d7` / `e8285529` / `26c17a6c`)

Coherencia con `HANDOFF-cierre-b4.md §4.9`: *"Las 4 sesiones del histórico verificación A1 (29 abr) NO se tocaron — siguen en BD como evidencia auditable del bug pre-fix."* Decisión registrada y mantenida.

### 3.5 NO sanear B4 histórico (last_timestamp desalineado en sesiones cerradas pre-fix B4)

Coherencia con `HANDOFF-cierre-b4.md §8` (saneamiento histórico B4 separado, no se ejecuta). Las Fases 1 y 2 cerradas de Luis (`a6715506`, `76e31b94`) tienen `last_timestamp` desalineado pre-fix B4. Si Luis hace Review Session sobre ellas verá síntoma original B4. Aceptado como deuda histórica documentada.

---

## 4. Mutación ejecutada al carácter

### 4.1 Paso 1 — DELETE con RETURNING

```sql
DELETE FROM sim_trades
WHERE id = '270ef475-6891-4165-a0d9-f426e00716a4'
RETURNING *;
```

**Output (1 fila devuelta — datos preservados aquí para reversión si fuera necesaria):**

| campo | valor |
|---|---|
| `id` | `270ef475-6891-4165-a0d9-f426e00716a4` |
| `session_id` | `914c0c1d-ceed-4fe1-bd8a-92f1ac984fc9` |
| `user_id` | `4171ff26-df4e-45a3-b718-f9420afbf449` |
| `pair` | EURUSD |
| `side` | BUY |
| `entry_price` | 1.17133 |
| `exit_price` | 1.17341 |
| `sl_price` | 1.17146 |
| `tp_price` | 1.17358 |
| `lots` | 3.64 |
| `risk_percent` | null |
| `risk_amount` | null |
| `rr` | 1.89 |
| `pnl` | 757.12 |
| `result` | WIN |
| `session_type` | null |
| `tags` | null |
| `notes` | null |
| `opened_at` | 2025-12-19 13:45:00+00 |
| `closed_at` | 2025-12-19 14:18:00+00 |
| `created_at` | 2026-04-29 02:38:06.762112+00 |

Validado al carácter: id correcto, session_id correcto (Fase 3 Luis), user_id correcto (Luis Delis), lots/pnl coherentes con análisis de query 2.

### 4.2 Paso 2 — UPDATE balance con guard defensivo

```sql
UPDATE sim_sessions
SET balance = 200000.00
WHERE id = '914c0c1d-ceed-4fe1-bd8a-92f1ac984fc9'
  AND balance = 200757.12
RETURNING id, name, balance, capital, last_timestamp, status;
```

**Output (1 fila devuelta):**

| campo | valor |
|---|---|
| `id` | `914c0c1d-ceed-4fe1-bd8a-92f1ac984fc9` |
| `name` | Challenge 3 Fases · $200K · EURUSD · Fase 3 |
| `balance` | 200000.00 |
| `capital` | 200000 |
| `last_timestamp` | 1767100320 |
| `status` | active |

Guard `AND balance = 200757.12` confirmado: el balance era el esperado, mutación procedió.

### 4.3 Paso 3 — Verificación final

```sql
SELECT
  s.id, s.balance, s.capital,
  COUNT(t.id) AS trades_count,
  COALESCE(SUM(t.pnl), 0) AS sum_pnl
FROM sim_sessions s
LEFT JOIN sim_trades t ON t.session_id = s.id
WHERE s.id = '914c0c1d-ceed-4fe1-bd8a-92f1ac984fc9'
GROUP BY s.id;
```

**Output (1 fila):** `balance = 200000.00, capital = 200000, trades_count = 0, sum_pnl = 0`. Doctrina al carácter: Fase 3 virgen como FTMO real.

---

## 5. Estado del repo al cierre

### 5.1 Git

```
Rama activa:        main
HEAD local:         0cfa9f1 docs(b1): cerrar B1 con HANDOFF-cierre-b1.md
HEAD origin/main:   0cfa9f1 (sin cambios desde 1 may, en sync)
Diferencia:         0 commits pendientes (HANDOFF de hoy aún no comiteado)
Working tree:       limpio salvo HANDOFF-cierre-saneamiento-historico.md untracked
```

### 5.2 Archivos modificados durante saneamiento

- **Cero código tocado** en components/, pages/, lib/.
- **Cero commits funcionales.**
- **2 mutaciones quirúrgicas en BD producción** (1 DELETE + 1 UPDATE) con guards defensivos y RETURNING.
- **1 archivo nuevo:** `HANDOFF-cierre-saneamiento-historico.md` (este documento, pendiente de commit).

### 5.3 Producción Vercel

- Deploy intacto en `bb63bfd` (B1 fix). Sin cambios.
- BD producción: 1 fila menos en `sim_trades`, 1 fila modificada en `sim_sessions`. Resto intacto.

---

## 6. Bugs y observaciones de la sesión

Ningún bug nuevo. Cero regresiones (cero código tocado).

Bugs conocidos que la query 2 confirmó como NO afectados a más alumnos:
- B1 pre-fix: confirmado limitado a 2 cadenas, ambas de Luis Delis. Saneamiento puntual ejecutado en una; otra preservada como evidencia.
- B4 histórico: `last_timestamp` desalineado en sesiones cerradas pre-fix B4 sigue presente. NO se ataca. Coherencia con HANDOFF-cierre-b4 §8.

---

## 7. Lecciones operativas

### 7.1 Hipótesis de query mal calibrada al primer intento

Query 1 asumía `opened_at < s.created_at` como síntoma de herencia. Falso: `opened_at` lleva tiempo replay (histórico), no tiempo real. La query devolvió 15 filas con 13 falsos positivos. Se afiló con Query 2 usando `MAX(closed_at)` de la madre como proxy temporal interno al replay. Filtró 13 ruidos. Lección: **cuando un campo temporal puede llevar dos relojes distintos (real y replay), las comparaciones temporales deben hacerse contra otro campo del mismo reloj.**

### 7.2 Validación al carácter antes de cada mutación

Cada SQL de mutación se ejecutó SOLO después de validar al carácter el output del paso previo. Patrón aplicado:

1. SELECT de inventario → validar → DELETE.
2. DELETE con RETURNING → validar fila devuelta al carácter (id, session_id, user_id, pnl) → UPDATE.
3. UPDATE con guard defensivo `AND balance = 200757.12` → validar nueva fila devuelta → SELECT verificación.
4. SELECT verificación → cierre.

Cero mutaciones a ciegas. Cero comandos encadenados. Aprobación explícita Ramón en cada paso.

### 7.3 Comunicación previa al alumno antes de mutación

Ramón comunicó a Luis ANTES del DELETE, no después. Esto preservó:
- Transparencia con el alumno (sabe qué se le va a tocar y por qué).
- Posibilidad de Luis de objetar antes (no objetó).
- Coherencia ética (su balance se modifica con su consentimiento previo, aunque sea para corregir un bug).

### 7.4 Disciplina "una cosa cada vez" mantenida

Saneamiento histórico era el cabo suelto de B1. Atacarlo primero (corto, lectura, mutación quirúrgica) antes de fase 3 (largo, refactor) cumple disciplina §1.4 de HANDOFF-verificacion-A1: cerrar lo abierto antes de abrir lo siguiente.

---

## 8. Reglas absolutas (sin cambios respecto a HANDOFF.md v3 §7)

1. **NO push** sin OK explícito de Ramón. (Cumplido — push pendiente con HANDOFF.)
2. **NO migraciones Supabase**. (Cumplido — DELETE + UPDATE NO son DDL, son DML quirúrgicas con guards. Schema intacto.)
3. **NO tocar otros repos**. (Cumplido.)
4. **NO dependencias npm nuevas**. (Cumplido — `package.json` intacto.)
5. **Aprobación opción 1 manual SIEMPRE** en Claude Code. (n/a — no hubo Claude Code en esta tarea, solo SQL editor de Supabase.)
6. **Comandos git separados, no encadenados con `&&`.** (n/a por ahora — git pendiente para commit del HANDOFF.)
7. **Antes de tareas grandes (>100 líneas o >2 archivos):** plan primero, espera OK. (Cumplido — cada SQL aprobado explícitamente antes de ejecución.)
8. **Producción** intacta hasta merge a `main` con cambios validados. (Cumplido — código producción intacto en `bb63bfd`. Solo BD tocada con guards defensivos.)

---

## 9. Métricas de la sesión

- **Duración aproximada:** ~1 hora.
- **Queries SQL ejecutadas:** 6 (4 SELECT + 1 DELETE + 1 UPDATE).
- **Mutaciones BD:** 2 (1 fila borrada, 1 fila modificada).
- **Líneas de código tocadas:** 0.
- **Commits creados:** 0 (commit del HANDOFF pendiente).
- **Push a producción:** 0.
- **Archivos nuevos:** 1 (este HANDOFF).
- **Sesiones afectadas en histórico:** 1 saneada (`914c0c1d`), 3 preservadas como evidencia (cadena A1).
- **Alumnos afectados:** 1 (Luis Delis), comunicado y consentido antes de mutación.
- **Cuestiones de método cumplidas:**
  - Discovery antes de mutación ✓
  - Validación al carácter en cada paso ✓
  - Comunicación previa al alumno ✓
  - Guards defensivos en UPDATE ✓
  - RETURNING preservado para reversión ✓
  - Verificación post-mutación ✓
  - HANDOFF antes de siguiente tarea ✓

---

## 10. Próximos pasos

### 10.1 Inmediatos (esta sesión, post-HANDOFF)

1. Mover este `HANDOFF-cierre-saneamiento-historico.md` a la raíz del repo.
2. `git add HANDOFF-cierre-saneamiento-historico.md`.
3. `git commit -m "docs(saneamiento): cerrar saneamiento histórico B1 con HANDOFF"`.
4. `git push origin main`. Vercel re-deploya (cambio docs, sin impacto funcional).
5. **Continuar con fase 3 viewport layer** — la sesión NO se cierra aquí.

### 10.2 Fase 3 — viewport layer (siguiente tarea de la sesión)

Plan táctico a redactar siguiendo estructura de `fase-2-plan.md` / `b1-plan.md` / `b4-plan.md`:
- PASO 0 inventario con grep recursivo sobre llamadas a `chart.timeScale().setVisibleLogicalRange/scrollToPosition` en `_SessionInner.js` y otros consumers.
- Análisis arquitectónico Opción A/B/C.
- Sub-fases con baselines pre/post.
- Validación al carácter en cada Edit.
- Commits atómicos con aprobación explícita.
- Pruebas manuales en local + smoke producción.

Bugs candidatos a atacar implícitamente:
- B3 (TF reset al entrar Review) — alta probabilidad.
- B2 (drawings descolocadas en Review) — depende de si la causa es viewport o drawings.

Referencias: `core-analysis.md §6 Fase 3` + plantillas estructurales `fase-2-plan.md`, `b1-plan.md`, `b4-plan.md`.

### 10.3 Backlog post fase 3 (sin orden estricto, decisión Ramón)

- Fase 4 — render layer (`RenderScheduler` con frame budget para bug #2 freeze M1).
- Fase 5 — drawings lifecycle (probable atacar B6 + bug nuevo limit-desaparece-al-play del 1 may).
- Fase 6 — trading domain.
- Fase 7 — reducir `_SessionInner.js`.
- B5 (409 session_drawings) — race condition aislada, backlog.
- Limpieza de globales auxiliares (`__chartMap`, `__algSuiteDebugLS`, `__algSuiteExportTools`).

---

Fin del HANDOFF de saneamiento histórico.

Cuando se retome el siguiente chat, este documento queda como referencia de:
- Que el cabo suelto de B1 §13.2 quedó cerrado al carácter.
- Que histórico tenía 2 cadenas afectadas, ambas de Luis Delis (único alumno).
- Que cadena A1 se preservó como evidencia auditable, cadena adicional se saneó quirúrgicamente con consentimiento previo del alumno.
- Que B4 histórico sigue documentado como deuda separada en HANDOFF-cierre-b4 §8.
- Que la sesión continuó hacia fase 3 sin cierre.
- Que la disciplina del método (discovery antes de mutación, validación al carácter, guards defensivos, comunicación previa, RETURNING para reversión) se mantuvo durante toda la tarea.
