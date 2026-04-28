# HANDOFF — Pruebas finales fase 1 (post-1c comiteada)

> Fecha: 28 abril 2026, tarde
> Para: el siguiente chat de Claude Opus 4.7 que retome este trabajo
> De: Ramón (rammglobalinvestment@gmail.com), trader/mentor, no desarrollador
> Versión: HANDOFF de pruebas — complementa el HANDOFF v3 (que sigue válido para contexto histórico)

---

## 0. Resumen rápido (30 segundos)

Sub-fase 1c **comiteada** en `7c47bdb` esta sesión. Fase 1 está al 90%. Solo falta el §5 punto 6 del `fase-1-plan.md`: **Ramón ejecuta las 12 pruebas manuales del §3.1** y reporta cero regresiones. Cuando las 12 pasen, fase 1 cerrada → merge a main → push → Vercel auto-deploya.

**Tu trabajo en este chat nuevo:** guiar a Ramón en las 12 pruebas, una por una, con QA estricto. NO comitear, NO mergear, NO pushear sin OK explícito de Ramón.

---

## 1. Estado actual al cierre de la sesión anterior

### Git
- Rama: `refactor/fase-1-data-layer`, **12 commits sobre `main`, sin push**.
- HEAD: **`7c47bdb`** (refactor 1c, comiteada esta tarde).
- Working tree: limpio. Solo `HANDOFF.md` (v3) y `HANDOFF-pruebas.md` (este archivo) untracked.
- Producción Vercel: intacta en `c5a5e26`.

### Validaciones ya hechas en sesión anterior (post-1c)
- ✅ `npm run build` exit 0, hashes idénticos a post-1b (`framework-64ad27b21261a9ce.js` 44.9 kB, `main-fc56ac81e639fb5e.js` 33.9 kB).
- ✅ Baseline 7 valores con un solo par cuadra al carácter pre↔post 1c.
- ✅ TF M1↔H1 sin errores.
- ✅ Multi-par sin play: pre-1c y post-1c se comportan igual con browser limpio (verificado vía `git stash` + flujo idéntico).
- ✅ Cero excepciones JS en consola en ningún test.

### Lo que NO se ha verificado todavía
- **Las 12 pruebas del §3.1 del fase-1-plan.md** (validan 1a en distintos casuísticas).
- **§5 punto 7 del plan**: que los 6 bugs del CLAUDE.md §9 siguen como estaban (ni mejor ni peor).

---

## 2. Datos críticos que el chat nuevo necesita

### Sesiones disponibles en Supabase
**Solo 1 sesión existe ahora mismo:** "test code", EUR/USD, `session_id = 550b7e67-955a-45dc-b64b-74fd2b362cec`.

**Fechas según HANDOFF v3 §11:** `date_from = 2024-08-23`, `date_to = 2025-02-19`.

⚠️ **DISCREPANCIA detectada al cerrar:** el baseline pre-1a del HANDOFF v3 §4 dice 598105 velas M1 con `last: 2026-04-14T21:59:00.000Z`. Eso NO cuadra con `date_to: 2025-02-19`. O el baseline pre-1a se tomó con otra configuración de la misma sesión, o el HANDOFF §11 quedó desactualizado, o el baseline mezcla. **Diagnosticar en chat nuevo antes de la prueba 0/baseline.**

**Para las 12 pruebas, Ramón tendrá que crear ~7 sesiones nuevas:**
- Prueba 3: termina viernes 23h UTC.
- Prueba 4: arranca domingo entre 21:00-23:59 UTC.
- Prueba 5: muy reciente (date_to en últimos 30 días).
- Prueba 6: 1 día (date_from === date_to).
- Prueba 7: par exótico (NZD/USD o AUD/CAD).
- Prueba 8: par JPY (USD/JPY o EUR/JPY).
- Prueba 10: sin date_from/date_to (si Supabase lo permite con NULL).

### Baseline pre-1a documentado (HANDOFF v3 §4)
```
Pre-1a (commit base c5a5e26, sesión "test code" EUR/USD)
- 598105 velas M1
- first: 2024-08-23T00:00:00.000Z (timestamp 1724371200)
- last:  2026-04-14T21:59:00.000Z
- Validado al carácter contra post-1a.
```

⚠️ Como se nota arriba, el `last` del baseline NO cuadra con el `date_to` actual de la sesión "test code". Decidir en chat nuevo.

### Baseline pre-1c documentado (HANDOFF v3 §4) — útil para prueba 11 (TF) y 12 (reload)
Snippet de 7 valores en sesión "test code" TF M1 sin play:
```
seriesDataLen:  175433
realDataLen:    175423
phantomCount:   10
firstTime:      1724371200   (2024-08-23 00:00 UTC)
lastRealTime:   1739923200   (2025-02-19 00:00 UTC)
lastTotalTime:  1739923800   (2025-02-19 00:10 UTC)
currentTime:    null
```

### Snippet de consola para verificar globales (ejecutar en DevTools)
```js
({
  seriesDataLen: window.__algSuiteSeriesData?.length,
  realDataLen:   window.__algSuiteRealDataLen,
  phantomCount:  (window.__algSuiteSeriesData?.length ?? 0) - (window.__algSuiteRealDataLen ?? 0),
  firstTime:     window.__algSuiteSeriesData?.[0]?.time,
  lastRealTime:  window.__algSuiteSeriesData?.[window.__algSuiteRealDataLen - 1]?.time,
  lastTotalTime: window.__algSuiteSeriesData?.[window.__algSuiteSeriesData.length - 1]?.time,
  currentTime:   window.__algSuiteCurrentTime
})
```

### Snippet alternativo para prueba 0 (engine.candles.length, M1 raw)
```js
Object.keys(window.__chartMap || {}).map(p => ({
  pair: p,
  rawCandles: pairState.current?.[p]?.engine?.candles?.length
}))
```
(Verificar nombre de variable real — `pairState` puede no estar expuesto globalmente. Si no funciona, usar React DevTools o exponer ad-hoc.)

---

## 3. Las 12 pruebas a ejecutar (orden estricto del §3.1)

| # | Prueba | Sesión necesaria | Validación clave |
|---|---|---|---|
| 0 | Baseline en `main` o referencia HANDOFF | "test code" | 598105 velas M1 raw (verificar discrepancia §2) |
| 1 | Sesión típica 1 año | "test code" sirve | Pinta normal, conteo coincide con baseline |
| 2 | Multi-año | "test code" cruza 2024→2025 | Sin hueco Dec 31 → Jan 1, conteo idéntico |
| 3 | Termina viernes 23h UTC | **CREAR** | Última vela ≤ viernes 20:59 UTC |
| 4 | Arranca domingo 21-23h UTC | **CREAR** | Primera vela ≥ domingo 21:00 UTC |
| 5 | Muy reciente (último mes) | **CREAR** | Endpoint devuelve datos frescos |
| 6 | 1 día (date_from === date_to) | **CREAR** | Chart carga, hay velas, no crash |
| 7 | Par exótico (NZD/USD o AUD/CAD) | **CREAR** | Endpoint funciona con par menos común |
| 8 | Par JPY (USD/JPY) | **CREAR** | Formato precio 3 decimales correcto |
| 9 | Cambio par durante replay | "test code" + añadir 2º par | Sync masterTime entre engines (cluster 1c) |
| 10 | Sin date_from/date_to | **CREAR** o vieja | Fallback `2023-01-01 → 2023-12-31` |
| 11 | Cambio TF (M1→H1→M5→H4) | "test code" sirve | Timestamps consistentes entre TFs |
| 12 | Reload durante replay pausado | "test code" sirve | Restaura `last_timestamp`, velas previas siguen |

**Señales de regresión** (§3.1 del plan):
- Chart vacío al cargar sesión.
- Error JS tipo `fetchSessionCandles is not a function` o `Cannot read properties of undefined`.
- Velas duplicadas o gaps weekend visibles.
- Conteo muy distinto al baseline.
- Hueco Dec 31 → Jan 1 en sesión multi-año.

---

## 4. Reglas absolutas (HANDOFF v3 §7, sin cambios)

1. **NO push** sin OK explícito de Ramón. Vercel auto-deploya en push a `main`.
2. **NO migraciones Supabase**.
3. **NO tocar otros repos**.
4. **NO dependencias npm nuevas**.
5. **Aprobación opción 1 manual SIEMPRE** en Claude Code. NUNCA opción 2 "allow all".
6. **Comandos git separados**, no encadenados con `&&`. Excepción: leer-y-volcar (no destructivo).
7. **Antes de tareas grandes (>100 líneas o >2 archivos):** plan primero, espera OK.
8. **Producción** intacta hasta merge final a `main` con fase 1 entera validada.

---

## 5. Lecciones operativas confirmadas en sesión anterior

### 5.1 Filtrar agresivamente los outputs de Claude Code
Claude Code tiene tendencia a generar **autoinformes con tablas y "✓"** en lugar de pegar líneas literales del shell. Varias veces en la sesión anterior inventó narrativas con apariencia de cita textual (ej: "warnings exceeds 4MB" que no existían en ningún log real).

**Regla:** el chat nuevo debe leer SOLO líneas dentro de los bloques `Bash(...)` que empiezan con `⎿` o son cita exacta del output. Tablas, ✅✅✅, "Análisis", "Conclusión" — todo eso es interpretación de Claude Code, ignorar.

**Si Claude Code colapsa output con "+ N lines (ctrl+o to expand)":** pedir al usuario que abra terminal nativa zsh y haga `cat` ahí, copie literal y pegue al chat.

### 5.2 Browser sucio = falso positivo
En la sesión anterior, un test de multi-par mostró comportamiento anómalo (charts saltando a fecha fuera de rango). Tras `git stash` + verificar pre-1c con browser limpio, se confirmó **artefacto de cache previo**, no regresión.

**Regla:** si una prueba muestra comportamiento sospechoso, ANTES de declarar regresión: Cmd+Shift+R hard reload, sin DevTools abierto durante carga inicial, snippet limpio. Si el bug desaparece tras eso, era browser sucio.

### 5.3 `git stash` es la herramienta de QA para regresiones
Si en alguna prueba aparece comportamiento sospechoso post-1c, el chat nuevo puede:
1. `git stash push -m "test-X-pendiente" lib/sessionData.js components/_SessionInner.js`
2. Esperar HMR recompile.
3. Repetir prueba en pre-1c puro.
4. Comparar.
5. `git stash pop` para restaurar.

Reversible al 100%. 12 minutos de inversión. **Mejor que conjetura.**

### 5.4 Verificación visual ≠ verificación numérica
Confirmar visualmente que un chart se ve bien NO sustituye ejecutar el snippet de 7 valores y comparar números. Hacer ambos siempre.

---

## 6. Cómo arrancar el chat nuevo

### Mensaje inicial sugerido para Ramón
```
Hola. Retomamos las 12 pruebas finales de fase 1.

Sub-fase 1c YA está comiteada en 7c47bdb. Estamos en §5 punto 6
del fase-1-plan.md: ejecutar las 12 pruebas del §3.1.

Te paso adjuntos:
1. HANDOFF-pruebas.md (este documento) — léelo entero antes de proponer nada.
2. fase-1-plan.md del repo (para detalle de las 12 pruebas en §3.1).
3. HANDOFF.md v3 (referencia histórica si necesitas contexto pre-1c).

Soy Ramón, trader/mentor, no dev. Reglas absolutas en §4 de este handoff.

Cuando hayas leído todo, dime:
1. Qué entendiste del estado actual en una frase.
2. Por qué prueba propones empezar (orden estricto §3.1: prueba 0 o prueba 1).
3. Cómo piensas resolver la discrepancia del baseline pre-1a (598105 vs date_to actual).

NO empezar a tocar nada hasta que yo apruebe.
```

### Verificaciones que el chat nuevo debe hacer al arrancar
1. Confirmar HEAD = `7c47bdb` con `git log --oneline -5`.
2. Confirmar working tree limpio con `git status`.
3. Confirmar dev server estado con `ps aux | grep "next dev"`. Si parado, relanzar como daemon (HANDOFF v3 §5 paso 5).
4. Antes de la prueba 0, diagnosticar la discrepancia del baseline pre-1a.

---

## 7. Sesión Supabase para pruebas (datos clave)

```
session_id: 550b7e67-955a-45dc-b64b-74fd2b362cec
nombre: test code
par: EUR/USD
date_from: 2024-08-23  (según HANDOFF v3 §11)
date_to:   2025-02-19  (según HANDOFF v3 §11)
```

URL local: `http://localhost:3000/session/550b7e67-955a-45dc-b64b-74fd2b362cec`

---

## 8. Documentos relacionados

| Archivo | Ubicación | Estado |
|---|---|---|
| `HANDOFF.md` v3 | `/Users/principal/Desktop/forex-simulator-algorithmic-suite/` | Untracked, deliberado |
| `HANDOFF-pruebas.md` (este) | `/Users/principal/Desktop/forex-simulator-algorithmic-suite/` | Untracked, deliberado |
| `refactor/fase-1-plan.md` | mismo repo, comiteado en `cc65fef` | Commited, 911 líneas |
| `refactor/core-analysis.md` | mismo repo, comiteado en `3ec573f` | Commited |
| `CLAUDE.md` | mismo repo, comiteado en `059cdfd` | Commited |

---

**Fin del HANDOFF de pruebas.**

Suerte con las 12 pruebas. El refactor de fase 1 está cerca de cerrar — solo queda validar comportamiento en escenarios distintos antes del merge final a main y push a producción.
