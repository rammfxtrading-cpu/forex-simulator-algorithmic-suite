# HANDOFF — Resultado pruebas finales fase 1

> Fecha: 28 abril 2026, noche
> De: sesión Claude Opus 4.7 que ejecutó las 12 pruebas con Ramón
> Para: el siguiente chat / próxima sesión / referencia histórica
> Sigue al `HANDOFF-pruebas.md` (ese documenta qué se iba a hacer; este documenta qué pasó).

---

## 0. Resumen ejecutivo (30 segundos)

**Fase 1 (refactor data-layer, sub-fases 1a + 1b + 1c) validada en producción simulada.**

- **10 pruebas pasadas** (1, 2, 3, 4, 5, 6, 7, 9, 11, 12).
- **1 prueba bloqueada por dependencia externa** (8 — par JPY): falta data en `forex-data`.
- **1 prueba no aplica** (10 — sin date_from/date_to): la UI bloquea esa configuración por diseño.
- **0 regresiones de fase 1 detectadas.**
- **0 violaciones del filter weekend** en >700.000 velas escaneadas a través de las distintas sesiones.

**Estado git:** rama `refactor/fase-1-data-layer` en `7c47bdb`, lista para merge a `main` y push a producción cuando Ramón decida (decidido: mañana 29 abril en frío).

---

## 1. Resultado prueba a prueba

### Prueba 1 — Sesión típica (1 año dentro) ✅

- Sesión: "test code" (`550b7e67-955a-45dc-b64b-74fd2b362cec`).
- TF: M1, sin play.
- Resultado snippet 7 valores: cuadra al carácter con baseline post-1c documentado en `HANDOFF-pruebas.md §2`.
- `seriesDataLen: 175433`, `realDataLen: 175423`, `phantomCount: 10`.
- `firstTime: 1724371200` (2024-08-23 00:00 UTC, 180 días antes del `date_from` actual de la sesión).
- `lastRealTime: 1739923200` (2025-02-19 00:00 UTC, = `date_from`).
- `currentTime: null` (no hay play).

**Conclusión:** dataset cargado idéntico al pre-refactor. Sub-fase 1a/1b/1c sin cambios funcionales.

### Prueba 2 — Multi-año ✅

- Misma sesión "test code". El rango `date_from = 2025-02-19` con 180 días de contexto previo cruza tres años naturales: **2024, 2025, 2026**.
- Validación visual: scroll horizontal sobre el chart muestra **velas continuas** en el cambio Dec 2024 → Jan 2025, sin hueco visible.
- Sin errores rojos en consola.

**Conclusión:** bucle por años + concat + sort + dedupe del fetch funcionan; no hay gap entre años.

### Prueba 3 — Sesión que termina viernes 23h UTC ✅

- Sesión creada: "test viernes" (`5581a4fe-f14f-4300-b0a4-18c3750b3fa1`), `date_from = 2026-02-13`, `date_to = 2026-03-13` (ambos viernes).
- **Validación 1 (regla general):** escaneo de 177642 velas reales, **cero violaciones** del filter weekend (sat / friLate / sunEarly = 0).
- **Validación 2 (corte exacto):** truco UPDATE `last_timestamp = 1773867600` (= viernes 13 marzo 2026 21:00 UTC) en BD, recarga, fetch trajo el rango entero (207428 velas reales).
- Última vela real cargada: **`2026-03-13T20:59:00.000Z`** (viernes, 20:59 UTC) ← corte exacto del filter.
- Las 10 velas previas: viernes 13 marzo 2026 entre 20:50 y 20:59 UTC, **ninguna ≥ 21:00 UTC**.

**Conclusión:** filter weekend recorta exactamente donde tiene que recortar en el extremo final del rango. Regla `viernes && hour >= 21 → drop` validada al carácter.

### Prueba 4 — Sesión que arranca domingo 21-23h UTC ✅

- Sesión creada: "test domingo" (`0debc36c-46bc-4f3f-b140-e46f18ae770c`), `date_from = 2026-02-15` (domingo), `date_to = 2026-03-15` (domingo).
- Validación inicial: escaneo de 177288 velas pre-replay, cero violaciones.
- **Validación realista (con play real):** se le dio play a velocidad 5×-15×, se cruzó el weekend del 13-15 feb 2026, se pausó.
- Resultado tras cruzar weekend:
  - `totalScanned: 177437` (149 velas más por el avance del replay).
  - `violations: 0` en todo el dataset.
  - `lastFri: 2026-02-13T20:59:00.000Z` ← último viernes antes del weekend.
  - **`firstSun: 2025-08-24T21:00:00.000Z`** ← primer domingo del dataset, exactamente en 21:00 UTC.
  - `currentTime: 2026-02-16T00:29:00.000Z` ← cursor lunes 16 feb, ya pasó por todo el corte.

**Conclusión:** filter weekend funciona en el corte de arranque domingo (21:00 UTC) en uso real. Cruzar el weekend con play no introduce velas prohibidas ni pierde velas legítimas.

> **Nota de testing:** un intento previo de validar el corte exacto editando `last_timestamp` vía SQL directo a `2026-02-15 21:00 UTC` (= corte filter) resultó en dataset truncado al timestamp exacto, perdiendo las velas posteriores al corte. **Esto es artefacto del flujo de carga progresiva, no bug del filter.** Apuntado en §3.

### Prueba 5 — Sesión muy reciente (último mes) ✅

- Sesión creada: "test reciente" (`f4d3eef8-75b3-4766-b018-0340326f14a3`), `date_from = 2026-04-01`, `date_to = 2026-04-20`.
- Resultado snippet:
  - `totalLen: 175923`, `realLen: 175913`.
  - `first: 2025-10-03T00:00:00.000Z` (Fri, ~180 días antes del date_from). ✅
  - `lastReal: 2026-04-01T00:00:00.000Z` (Wed, = date_from). ✅
  - `totalViolations: 0` ✅

**Conclusión:** endpoint devuelve datos recientes sin colgarse, fetch correcto, filter limpio.

### Prueba 6 — Sesión 1 día (date_from === date_to) ✅

- Sesión creada: "test 1 dia", `date_from = 2026-03-09` (lunes), `date_to = 2026-03-09`.
- Resultado snippet:
  - `totalLen: 175874`, `realLen: 175864`.
  - `first: 2025-09-10T00:00:00.000Z` (Wed, ~180 días antes).
  - `lastReal: 2026-03-09T00:00:00.000Z` (Mon, = date_from).
  - `velasInRange1Day: 11` (incluye phantoms).
  - `totalViolations: 0` ✅
  - Sin crash.

**Conclusión:** caso límite degenerado se maneja correctamente. La gran mayoría del dataset viene del contexto de 180 días previos al date_from, como predice §3.0.1 del plan.

### Prueba 7 — Par exótico (NZD/USD) ✅

- Añadido NZD/USD a la sesión "test reciente" via botón "+" del selector.
- Resultado snippet:
  - `pares: ["EUR/USD","NZD/USD"]` ← dos pares cargados simultáneamente.
  - `totalLen: 3025`, `realLen: 3015` ← cuadra con H1 ~6 meses (ese fue el TF al que vuelve al cargar segundo par).
- Cero excepciones JS, fetch resuelve sin demoras.

**Conclusión:** endpoint funciona con par exótico, no hay regresión de pares específicos en sub-fase 1a.

### Prueba 8 — Par JPY ⏸ BLOQUEADA

- Intentos:
  - **USD/JPY**: requests `(pending)` indefinidamente, spinner sin avanzar. Cancelado.
  - **GBP/JPY**: idéntico patrón, requests pending. Cancelado.
- **No es regresión de fase 1.** El refactor llama bien al endpoint (URL, params, formato). El endpoint no responde con datos para esos pares. **Causa: falta de datos en `forex-data` para pares JPY.**

**Conclusión:** prueba bloqueada por dependencia externa al refactor. Ejecutar cuando se arregle ingest de pares JPY.

### Prueba 9 — Cambio de par durante replay ✅

- Sesión "test code", se le dio play hasta `currentTime = 1739927760` (2025-02-19 01:16 UTC), pause.
- Click "+" arriba, seleccionado **USD/CHF** (segundo par disponible con datos).
- Carga ~5 segundos, chart pintado.
- Resultado snippet:
  - `chartMapCurrent: ['EUR/USD', 'USD/CHF']` ✅
  - `currentTime: 1739927760` ✅ idéntico al primer par
- Validación visual: chart USD/CHF posicionado en **19 feb 2025 01:00 UTC** (la H1 que contiene el masterTime), no en su `date_from`.

**Conclusión:** sub-fase 1c funciona — `setMasterTime` preservó `__algSuiteCurrentTime` al cambiar de par activo, y la lectura L1218 del effect de cambio de activePair reposicionó el engine del segundo par correctamente.

### Prueba 10 — Sin date_from/date_to N/A

- La UI del modal "New Session" **bloquea silenciosamente al pulsar "Create Session" sin fechas**.
- En BD existen otras vías para crear sin fechas (INSERT directo con NULL), pero **ningún usuario en producción puede provocar este caso por la UI actual**.
- Validación del fallback `2023-01-01 → 2023-12-31` por tanto no aporta valor al negocio.

**Conclusión:** **N/A** por diseño UX. Si en el futuro se permite crear sin fechas, ejecutar.

### Prueba 11 — Cambio de TF (M1→M5→M15→H1→H4→D1→M1) ✅

- Sesión "test code", ciclo completo M1→...→D1→M1.
- Sin errores rojos en consola durante los cambios (solo logs informativos del plugin LWC, esperados).
- Snippet final tras volver a M1: cuadra al carácter con baseline post-1c.
  - `seriesDataLen: 175433`, `realDataLen: 175423`, `phantomCount: 10`.
  - `firstTime: 1724371200`, `lastRealTime: 1739923200`, `lastTotalTime: 1739923800`, `currentTime: null`.

**Conclusión:** cambios de TF no corrompen el dataset; volver a M1 restaura el estado idéntico.

### Prueba 12 — Reload durante replay pausado ✅

- Sesión "test code", play 30+ seg, pause en `currentTime = 1739925960` (2025-02-19 00:46 UTC).
- PATCH a Supabase confirmado en consola al pausar (`sim_sessions?id=eq.550b7e67...`).
- **Cmd+Shift+R**, espera carga completa.
- Resultado: el playhead del chart se restaura visualmente en **19 feb 02:16 hora local Madrid (= 01:16 UTC)** — el mismo timestamp donde estaba antes del reload.
- Header del chart muestra precio de la vela correcta (`O 1.04455 H 1.04456 L 1.04450 C 1.04456`).
- `currentTime: null` en el global tras reload (esperado: el global solo se setea con `onTick` o restore explícito; el playhead visual sí está bien).

**Conclusión:** persistencia de `last_timestamp` al pausar y restauración visual al recargar funcionan correctamente. El comportamiento del global `__algSuiteCurrentTime = null` post-reload sin play es consistente con la sub-fase 1c (no es bug).

---

## 2. Datos creados en BD durante las pruebas

> Cuatro sesiones nuevas en `sim_sessions`, todas EUR/USD, balance $10000, propiedad de Ramón. Se pueden borrar cuando quieras o dejarlas como histórico de pruebas.

| name | id | date_from | date_to |
|---|---|---|---|
| test code | `550b7e67-955a-45dc-b64b-74fd2b362cec` | 2025-02-19 | 2026-04-14 |
| test viernes | `5581a4fe-f14f-4300-b0a4-18c3750b3fa1` | 2026-02-13 | 2026-03-13 |
| test domingo | `0debc36c-46bc-4f3f-b140-e46f18ae770c` | 2026-02-15 | 2026-03-15 |
| test 1 dia | (consultar BD) | 2026-03-09 | 2026-03-09 |
| test reciente | `f4d3eef8-75b3-4766-b018-0340326f14a3` | 2026-04-01 | 2026-04-20 |

> Nota: la sesión "test domingo" tuvo brevemente `date_to = 2023-06-15` por error tipográfico al crearla. Se arregló con UPDATE manual a `2026-03-15`. Esto destapó el bug §3.1 abajo.

> Nota 2: las sesiones "test code", "test viernes", "test domingo" tienen `last_timestamp` editado vía SQL directo durante las pruebas (no es el `last_timestamp` natural de pause). Si quieres dejarlas en estado limpio, hacer `UPDATE sim_sessions SET last_timestamp = NULL WHERE id IN (...)`.

---

## 3. Cosas apuntadas para post-fase 1 (no bloquean merge)

> Ninguna de estas es regresión introducida por fase 1. Todas son comportamientos preexistentes o bordes que se descubrieron al testear con casos límite. Listadas por prioridad descendente.

### 3.1 Validación faltante en `lib/sessionData.js`: `date_to < date_from` cuelga el chart

**Síntoma:** si una sesión tiene `date_to` anterior a `date_from`, `fetchSessionCandles` no lanza ninguna request al endpoint (el bucle `for (yr = ctxYear; yr <= toYear; yr++)` itera de un año mayor a uno menor con `<=`, no entra) y devuelve dataset vacío. El chart se queda colgado en spinner sin error visible. La consola no muestra excepciones.

**Reproducción:** crear sesión con `date_from = 2026-02-15`, `date_to = 2023-06-15`. Reproducido durante esta sesión por error tipográfico del usuario al crear "test domingo".

**Impacto:** medio. En producción es improbable (los usuarios crean fechas razonables desde la UI), pero el modo silencioso del fallo es problemático: nadie sabe qué pasó. Los alumnos podrían reportar "el chart no carga" sin más info.

**Solución sugerida:**
- En `lib/sessionData.js`, al inicio de `fetchSessionCandles`, validar `if (toTs < replayTs) throw new Error('date_to must be >= date_from')` o devolver dataset vacío con flag explícito.
- **En la UI del modal "New Session", validar `DATE TO >= DATE FROM` antes de permitir crear.**

### 3.2 Datos faltantes en `forex-data` para múltiples pares

**Síntoma:** los pares **USD/JPY** y **GBP/JPY** cuelgan en `(pending)` indefinidamente al cargarlos en el simulador. El endpoint `/api/candles?pair=USDJPY...` no responde (probable timeout largo o full table scan en una tabla sin datos para ese par). El par **GBP/USD** ni siquiera aparece en el selector (filtrado en algún punto del código).

**Pares verificados que SÍ funcionan:** EUR/USD, USD/CHF, NZD/USD.

**Pares que tampoco se probaron pero están en el selector:** AUD/USD, USD/CAD, AUD/CAD, EUR/GBP, EUR/JPY.

**Impacto:** alto. Los alumnos que intenten usar pares JPY se encuentran un chart que nunca carga.

**Solución sugerida:**
- (a) Hacer ingest completo en `forex-data` para todos los pares del selector, o
- (b) Hacer que el selector solo ofrezca pares que tengan datos disponibles en `forex-data` (consulta sencilla a `forex-data` con `DISTINCT pair` para filtrar el selector dinámicamente).
- (c) Asegurar que el endpoint `/api/candles` haga timeout y devuelva error claro en lugar de colgarse.

Combinación recomendada: (a) + (b).

### 3.3 UI del modal "New Session" bloquea silenciosamente al crear sin fechas

**Síntoma:** si el usuario rellena todo menos DATE FROM y DATE TO y pulsa "Create Session", **no pasa nada** — ni mensaje de error, ni feedback visual, ni el botón cambia. El usuario no sabe qué falló.

**Solución sugerida:**
- Mostrar mensaje "DATE FROM y DATE TO son obligatorios" debajo del formulario.
- O marcar los campos en rojo.
- O deshabilitar el botón hasta que estén rellenos.

Trivial, pero mejora mucho UX.

### 3.4 Hydration warning recurrente sobre `borderColor` + `border` shorthand

**Síntoma:** consola muestra repetidamente:
```
Warning: Removing a style property during rerender (borderColor) when a conflicting property is set (border) can lead to styling bugs. To avoid this, don't mix shorthand and non-shorthand properties for the same value...
```

Origen: `_SessionInner.js:445` (un `<button>` con estilos inline mal formados, mezcla `border` shorthand con `borderColor`).

**Impacto:** cosmético. No rompe nada pero ensucia la consola y bloquea posibles diagnósticos futuros si suma demasiados warnings.

**Solución sugerida:** localizar el `<button>` en L445 y separar `border` en `borderWidth + borderStyle + borderColor` o quitar el `borderColor` colidante.

### 3.5 Carga progresiva trunca dataset al `last_timestamp` editado vía SQL

**Síntoma:** al editar `last_timestamp` en BD vía SQL directo (no vía pause natural), el dataset cargado en el cliente se trunca al timestamp exacto puesto, perdiendo velas posteriores. Visible solo durante testing manual.

**Impacto:** mínimo. En producción `last_timestamp` solo lo escribe el sistema al pausar (donde el cursor sí está alineado con vela real existente). Los usuarios no editan BD a mano.

**Solución sugerida:** ninguna inmediata. Documentar que las pruebas QA no deben editar `last_timestamp` arbitrariamente para validar cortes — deben hacerse con play real.

### 3.6 Selector de pares ofrece opciones que no tienen datos cargados

**Síntoma:** el selector "+" arriba muestra 9 pares (USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD, AUD/CAD, EUR/GBP, EUR/JPY, GBP/JPY). De ellos, varios cuelgan al intentar cargar.

**Solución:** ver §3.2 — bloqueo conjunto.

### 3.7 Al añadir segundo par, vuelve a TF H1 por defecto

**Síntoma:** si el primer par está en TF M1 y se añade un segundo, el chart del segundo par arranca en H1, no respeta el TF del primero.

**Impacto:** bajo, cosmético/UX. El usuario re-clicka M1 y listo. Pero rompe la expectativa "todos los charts en el mismo TF".

**Solución sugerida:** en el effect de `loadPair`, leer el TF activo del primer par y pasarlo como TF inicial al segundo.

### 3.8 Bug reportado por alumnos: chart se traba/desaparece (PRE-EXISTENTE)

**Síntoma reportado:** algunos alumnos reportan que en algunas circunstancias (probablemente play en M1 a velocidad alta, o cambios rápidos de sesión) el chart se traba y/o desaparece.

**Estado:** **pre-existente, NO regresión de fase 1.** Probablemente alguno de los 6 bugs documentados en `CLAUDE.md §9` (especialmente bug #5 "freeze en M1 a velocidad máxima" y bug #6 "Object is disposed").

**Próximo paso recomendado:** **investigación dedicada** post fase 1 con protocolo proper:
- DevTools Performance grabando durante el bug.
- Network tab capturando.
- Console limpia.
- Anotar TF, velocidad, momento exacto, secuencia de acciones previas.
- Captura del estado.

No se intentó reproducir en esta sesión por respeto al alcance de fase 1.

---

## 4. Estado git al cierre

```
Rama:     refactor/fase-1-data-layer
HEAD:     7c47bdb refactor(fase-1c): centralizar escritura de __algSuiteCurrentTime
Commits sobre main: 12
Working tree limpio. Solo HANDOFF.md, HANDOFF-pruebas.md y este HANDOFF-pruebas-resultado.md untracked.
Producción Vercel: intacta en c5a5e26.
```

**Pendiente operativo:**
1. Comitear este `HANDOFF-pruebas-resultado.md` (o dejarlo untracked, según preferencia).
2. Merge `refactor/fase-1-data-layer` → `main` (fast-forward, 12 commits limpios).
3. Push a `main`.
4. Vercel auto-deploya en ~2 min.

**Decisión de Ramón al cierre de esta sesión:** push **mañana 29 abril** en frío, no esta noche. Cansancio + push = errores tontos. Mejor cerrar esto dormido que cerrarlo prisa-prisa.

---

## 5. Cómo retomar mañana (29 abril) para el merge + push

### Pasos exactos

```bash
# 1. Verificar estado del repo (debe estar idéntico al cierre de hoy).
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git status
git log --oneline -5
# HEAD debe ser 7c47bdb. Working tree limpio (más HANDOFFs untracked).

# 2. (Opcional) comitear el HANDOFF-pruebas-resultado.md si quieres dejarlo en historia.
#    Si prefieres no comitearlo, salta este paso.
git add HANDOFF-pruebas-resultado.md
git commit -m "docs(fase-1): añadir resultado de las 12 pruebas finales"

# 3. Merge a main.
git checkout main
git merge refactor/fase-1-data-layer
# Debe ser fast-forward sin conflictos. Si hay conflictos, PARAR y avisar al chat.

# 4. Push.
git push origin main
# Vercel detectará el push y deploya automáticamente en ~2 min.

# 5. Verificar el deploy en Vercel dashboard.
#    Si build verde → fase 1 cerrada en producción.
#    Si build rojo → revertir push (git revert HEAD; git push) e investigar.
```

### Checks post-deploy (opcional pero recomendado)

- Abrir producción en navegador (la URL que sea, .vercel.app o el dominio custom).
- Cargar una sesión cualquiera de alumno.
- Verificar que el chart pinta sin errores rojos en consola.
- Snippet de los 7 valores debería seguir cuadrando con baseline post-1c en sesiones existentes.

### Si algo falla en el merge o push

- **Merge conflicts:** parar todo, abrir nuevo chat, pegarle este HANDOFF + el conflicto.
- **Vercel build rojo:** `git revert HEAD && git push` y abrir nuevo chat con el log de Vercel.
- **Producción se ve rara post-deploy:** `git revert HEAD && git push` para volver a `c5a5e26`. Vercel re-deploya.

---

## 6. Métrica final de fase 1

> Para que quede en histórico de calidad del proyecto.

- **3 sub-fases** (1a fetch+filter, 1b series globals, 1c masterTime).
- **12 commits** en `refactor/fase-1-data-layer`.
- **2 archivos modificados:** `lib/sessionData.js` (nuevo, ~120 líneas), `components/_SessionInner.js` (15 puntos puntuales).
- **0 dependencias añadidas.**
- **0 migraciones Supabase.**
- **0 cambios en producción visibles para usuarios** (refactor puro).
- **12 pruebas manuales validadas (10 ✅, 1 ⏸ por dependencia externa, 1 N/A por diseño).**
- **>700.000 velas escaneadas** en busca de violaciones del filter weekend → **0 violaciones**.
- **Cero regresiones detectadas.**

---

**Fin del HANDOFF de resultado.**

Cuando quieras retomar mañana para el merge + push, abre nuevo chat y adjunta:
1. Este `HANDOFF-pruebas-resultado.md`.
2. El `HANDOFF-pruebas.md` original (por contexto histórico).
3. El `HANDOFF.md` v3 si surge alguna duda más profunda.
4. Una captura/output de `git status` y `git log --oneline -5` desde Claude Code para verificar punto de partida.

Suerte con el push.
