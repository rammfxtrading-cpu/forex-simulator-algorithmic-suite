# HANDOFF v3 — Refactor del core de backtesting (sub-fase 1c en curso, código aplicado SIN comitear)

> Fecha de generación: 28 abril 2026 (segunda sesión del día — relevo por límite de contexto)
> Para: el siguiente chat conmigo (Claude Opus 4.7) o cualquier instancia que retome este trabajo
> De: Ramón (rammglobalinvestment@gmail.com), trader/mentor, no desarrollador
> Versión: 3 — sustituye al HANDOFF.md v2 del 28 abr (sub-fase 1a). Este archivo NO se commitea, queda untracked.

---

## 0. Resumen rápido (30 segundos)

Soy Ramón. Estoy refactorizando el core de backtesting de mi simulador forex (`forex-simulator-algorithmic-suite`) con ayuda de Claude Code (Opus 4.7) corriendo en mi Mac. Tú (chat web Opus 4.7) eres mi asesor estratégico y QA.

**Punto exacto donde paramos:** sub-fase 1a comiteada (`6f7d829`), sub-fase 1b comiteada (`0f644f8`), sub-fase 1c **con las 5 operaciones de código YA APLICADAS al working tree pero AÚN NO COMITEADAS**. HEAD apunta a `cc65fef` (último commit de docs). Greps automáticos verificados (cero matches). Pendiente: `npm run build`, mini-comprobación en navegador con baseline post-1c, y solo entonces `git add` + `git commit`.

**Próximo paso al retomar:** ejecutar `npm run build` (con dev parado, regla §8.1) → si OK, relanzar dev y Ramón hace mini-comprobación con snippet de 7 valores → si baseline post-1c cuadra al carácter con pre-1c → commit final con mensaje del plan §3.3.

---

## 1. ⚠️ ESTADO CRÍTICO ACTUAL

### Rama y commits

- Rama: `refactor/fase-1-data-layer`, **11 commits sobre `main`, sin push**.
- HEAD: **`cc65fef`** (commit docs, último comiteado).

### ⚠️ 5 OPERACIONES DE CÓDIGO YA APLICADAS pero NO COMITEADAS

El working tree tiene cambios sin commitear que implementan la sub-fase 1c entera:

- **Op A**: append a `lib/sessionData.js` con `setMasterTime` + `clearCurrentTime` (+24 líneas). Función `updateSeriesAt` preservada intacta.
- **Op B**: import unificado en `_SessionInner.js` L13. Antes: `import { fetchSessionCandles, setSeriesData, updateSeriesAt } from '../lib/sessionData'`. Ahora: `import { fetchSessionCandles, setSeriesData, updateSeriesAt, setMasterTime, clearCurrentTime } from '../lib/sessionData'`.
- **Op #1**: L528 → `clearCurrentTime()` (4 esp). Reemplaza `if(typeof window!=='undefined') window.__algSuiteCurrentTime = null` (reset null en session load). Comentarios L525-L527 preservados.
- **Op #2**: L772 → `setMasterTime(engine.currentTime)` (10 esp). Reemplaza el guard de `engine.onTick`. **L770 `setCurrentTime(engine.currentTime)` (setter React state) preservado literal** (asimetría intencional).
- **Op #3**: L1225 → cirugía sobre línea compuesta, 3ª sentencia → `setMasterTime(ps.engine.currentTime)` (6 esp). Las 2 primeras sentencias (`setCurrentPrice(agg.slice(-1)[0]?.close??null)` y `setDataReady(true)`) preservadas literales.

### Working tree

```
On branch refactor/fase-1-data-layer
Untracked files:
  HANDOFF.md   (este archivo, v3 — no se comitea)

Modified:
  components/_SessionInner.js
  lib/sessionData.js
```

Stats del diff sin comitear: 2 archivos, **-4 / +28 = +24 líneas netas**, 5 hunks (4 en `_SessionInner.js` + 1 en `lib/sessionData.js`).

### Verificaciones ya realizadas

- **Greps automáticos del §3.3 sobre `_SessionInner.js`** ✅ todos cero matches:
  - `grep -nE "window\.__algSuiteCurrentTime\s*=" components/_SessionInner.js` → 0 matches
- **Diff visual revisado al carácter en 2 chunks** (commit aprobado por Ramón).

### Pendiente (en orden estricto)

1. `npm run build` — esperado: exit 0, cero warnings, hashes idénticos a post-1b.
2. Relanzar dev como daemon.
3. Ramón en navegador: Cmd+R, sesión "test code", TF M1, sin play, snippet de 7 valores.
4. Comparar contra baseline pre-1c: los 7 valores deben cuadrar al carácter.
5. Mini-comprobación 5/5 (incluyendo punto 5: cambio par EUR/USD ↔ GBP/USD para validar sync de engines).
6. Si todo OK → `git add lib/sessionData.js components/_SessionInner.js` + `git commit` con heredoc del plan §3.3.

---

## 2. Lista de 11 commits (orden cronológico inverso)

```
cc65fef docs(refactor): renombrar setCurrentTime → setMasterTime en plan §2.2/§3.3   ← HEAD
c8f8765 docs(refactor): expandir §3.3 con plan detallado de sub-fase 1c
1ff95ea docs(refactor): actualizar inventario plan 1c post-1b (líneas verificadas)
0f644f8 refactor(fase-1b): centralizar escritura de __algSuiteSeriesData/RealDataLen
3baefe6 docs(refactor): expandir §3.2 con plan detallado de sub-fase 1b
1316c22 docs(refactor): actualizar inventario plan 1b post-1a (líneas verificadas)
de873d6 docs(refactor): añadir lecciones operativas al fase-1-plan
6f7d829 refactor(fase-1a): extraer fetch+filter a lib/sessionData.js
0180b6f docs(refactor): añadir fase-1-plan.md
3ec573f docs(refactor): añadir core-analysis.md
059cdfd docs: añadir CLAUDE.md
```

Base sobre `main` (commit `c5a5e26`). Sin push a GitHub. Producción Vercel intacta en `c5a5e26`.

---

## 3. Las 5 operaciones aplicadas en el working tree (detalle exacto)

### Archivo `lib/sessionData.js` (de 118 → 142 líneas, +24)

Tras la función `updateSeriesAt` (línea 118 cierre `}`), se añaden estas 24 líneas (línea blanca + 12 setMasterTime + línea blanca + 11 clearCurrentTime):

```js

/**
 * Escribe el global __algSuiteCurrentTime con el timestamp actual del replay.
 * Usado por engine.onTick y por el effect de cambio de activePair.
 * Guard interno SSR (typeof window check).
 *
 * @param {number} t - Timestamp UNIX en segundos del momento actual del replay.
 *                     Equivale a engine.currentTime de ReplayEngine.
 */
export function setMasterTime(t) {
  if (typeof window === 'undefined') return
  window.__algSuiteCurrentTime = t
}

/**
 * Resetea el global __algSuiteCurrentTime a null.
 * Usado en session load (efecto inicial del componente) para asegurar
 * que el global no persiste entre navegaciones SPA con valor stale.
 * Guard interno SSR (typeof window check).
 */
export function clearCurrentTime() {
  if (typeof window === 'undefined') return
  window.__algSuiteCurrentTime = null
}
```

### Archivo `components/_SessionInner.js` (4 hunks, 0 neto)

#### Hunk 1 — L13 (Op B, import unificado)

Antes:
```js
import { fetchSessionCandles, setSeriesData, updateSeriesAt } from '../lib/sessionData'
```

Después:
```js
import { fetchSessionCandles, setSeriesData, updateSeriesAt, setMasterTime, clearCurrentTime } from '../lib/sessionData'
```

#### Hunk 2 — L528 (Op #1, reset null en session load, 4 esp)

Antes:
```js
    // anterior, porque resumeReal la prioriza sobre date_from.
    if(typeof window!=='undefined') window.__algSuiteCurrentTime = null
    supabase.from('sim_sessions').select('*').eq('id',id).maybeSingle().then(async ({data})=>{
```

Después:
```js
    // anterior, porque resumeReal la prioriza sobre date_from.
    clearCurrentTime()
    supabase.from('sim_sessions').select('*').eq('id',id).maybeSingle().then(async ({data})=>{
```

#### Hunk 3 — L772 (Op #2, engine.onTick, 10 esp)

Antes:
```js
          setCurrentTime(engine.currentTime)
          setProgress(Math.round(engine.progress*100))
          if(typeof window!=='undefined') window.__algSuiteCurrentTime=engine.currentTime
```

Después:
```js
          setCurrentTime(engine.currentTime)
          setProgress(Math.round(engine.progress*100))
          setMasterTime(engine.currentTime)
```

⚠️ **L770 (`setCurrentTime(engine.currentTime)`) es el SETTER REACT STATE existente** (declarado en L178 `const [currentTime, setCurrentTime] = useState(null)`). NO es la función nueva. Asimetría intencional.

#### Hunk 4 — L1225 (Op #3, línea compuesta, cirugía, 6 esp)

Antes (línea entera con 3 sentencias separadas por `;`):
```js
      setCurrentPrice(agg.slice(-1)[0]?.close??null);setDataReady(true);if(typeof window!=='undefined') window.__algSuiteCurrentTime=ps.engine.currentTime
```

Después (1ª y 2ª sentencias preservadas literalmente, solo la 3ª cambia):
```js
      setCurrentPrice(agg.slice(-1)[0]?.close??null);setDataReady(true);setMasterTime(ps.engine.currentTime)
```

---

## 4. Baselines registrados

### Pre-1a (commit base `c5a5e26`, sesión "test code" EUR/USD)

Dataset Supabase crudo después de fetch + filter weekend:

```
598105 velas M1
first: 2024-08-23T00:00:00.000Z (timestamp 1724371200)
last:  2026-04-14T21:59:00.000Z
```

Validado al carácter contra post-1a.

### Pre-1b / Post-1b (commit `0f644f8`, mismo entorno: sesión "test code", TF M1, sin play, Cmd+R fresco)

Snippet de 6 valores:

```
seriesDataLen:  175433
realDataLen:    175423
phantomCount:   10
firstTime:      1724371200   (2024-08-23 00:00 UTC)
lastRealTime:   1739923200   (2025-02-19 00:00 UTC)
lastTotalTime:  1739923800   (2025-02-19 00:10 UTC)
```

Validado al carácter pre-1b ↔ post-1b.

### Pre-1c (HEAD `cc65fef`, mismo entorno)

Snippet de 7 valores:

```
seriesDataLen:  175433       ← idéntico post-1b ✓
realDataLen:    175423       ← idéntico post-1b ✓
phantomCount:   10           ← idéntico post-1b ✓
firstTime:      1724371200   ← idéntico post-1b ✓
lastRealTime:   1739923200   ← idéntico post-1b ✓
lastTotalTime:  1739923800   ← idéntico post-1b ✓
currentTime:    null         ← esperado tras Cmd+R sin play (L528 reset inicial)
```

**Tras aplicar 1c (operaciones ya aplicadas, pendiente validación), los 7 valores deben cuadrar al carácter con este pre-1c.**

---

## 5. Próximos pasos para retomar (ORDEN ESTRICTO)

> ⚠️ **NO comitear nada todavía.** Las 5 operaciones están en working tree dirty pero pendientes de validación. Si la mini-comprobación falla, revertir.

### Paso 1 — Verificar dev server

```bash
ps aux | grep "next dev" | grep -v grep
```

Esperado: probablemente vacío (la sesión anterior matamos el dev al final del PASO C de auditoría). Si hay PID, ir a paso 2. Si no, omitir paso 2.

### Paso 2 — (condicional) Matar dev

```bash
kill <PID>
```

### Paso 3 — Limpiar `.next/` (regla §8.1)

```bash
rm -rf .next/
```

### Paso 4 — Build prod

```bash
npm run build
```

**Esperado:**
- exit 0
- cero warnings entre "Linting and checking validity of types ..." y "✓ Compiled successfully"
- 6/6 páginas estáticas generadas
- `framework-*.js` y `main-*.js` con hashes idénticos a builds anteriores (post-1b: `framework-64ad27b21261a9ce.js` 44.9 kB y `main-fc56ac81e639fb5e.js` 33.9 kB)

**Si build falla:** NO intentar arreglar automáticamente. Pegar error literal a Ramón y decidir juntos (revertir las 5 operaciones con `git restore` o pulir).

### Paso 5 — Relanzar dev

```bash
nohup npm run dev > /tmp/forex-dev.log 2>&1 &
disown
```

Esperar 6 segundos:

```bash
sleep 6
tail -20 /tmp/forex-dev.log
```

Esperado: `▲ Next.js 14.2.35` + `Local: http://localhost:3000` + `✓ Ready in Xms`.

### Paso 6 — Mini-comprobación de Ramón en navegador

Ramón abre `http://localhost:3000`, navega a la sesión "test code", **Cmd+R completo (hard reload)**, espera carga, **NO toca play**, en TF M1.

Abre DevTools → Console y ejecuta el snippet de 7 valores:

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

**Comparar contra pre-1c:**
- Los 6 primeros valores **deben cuadrar al carácter** con post-1b.
- `currentTime: null` (idéntico al pre-1c, porque Cmd+R sin play y `clearCurrentTime()` se ejecuta al cargar la sesión).

### Paso 7 — Mini-comprobación 5/5 funcional

1. Sesión "test code" carga, chart visible, cero errores rojos en consola.
2. Baseline post-1c (snippet anterior) **cuadra al carácter** con pre-1c.
3. Cambio TF M1 → H1: chart se redibuja sin huecos.
4. Cambio TF H1 → M1: vuelve a M1 sin descolocar nada.
5. **ESPECÍFICO DE 1c**: cambio de par durante la sesión (EUR/USD ↔ GBP/USD si están ambos disponibles, o entre 2 pares cualesquiera de la sesión). Verificar que el segundo par carga sin saltar de fecha (sync engine via `seekToTime(masterTime)`).

### Paso 8 — Si TODO OK → commit final

```bash
git add lib/sessionData.js components/_SessionInner.js
```

Después:

```bash
git commit -m "$(cat <<'EOF'
refactor(fase-1c): centralizar escritura de __algSuiteCurrentTime

- lib/sessionData.js expone setMasterTime(t) y clearCurrentTime() —
  ambos con guard SSR interno
- _SessionInner.js delega las 3 escrituras a la nueva API:
  · L528 → clearCurrentTime() (session load)
  · L772 → setMasterTime(engine.currentTime) (engine.onTick)
  · L1225 (3ª sentencia de línea compuesta) → setMasterTime(ps.engine.currentTime) (activePair effect)
- Lecturas siguen direct (L568 fallback challenge, L753 rawMaster, L1218 masterTime sync engine) — fase 2
- Sin cambios funcionales: global escrito con valores idénticos al
  pre-refactor (validado por baseline al carácter en sesión 'test code',
  7 valores incluyendo currentTime)
EOF
)"
```

Después:

```bash
git status
git log --oneline -3
```

### Paso 9 — Si NO cuadra el baseline → revertir

```bash
git restore lib/sessionData.js components/_SessionInner.js
```

Volver al estado HEAD `cc65fef` y diagnosticar antes de reintentar.

---

## 6. Conflicto resuelto en commit `cc65fef`

El plan §3.3 original proponía exportar la nueva función como `setCurrentTime(t)`. Durante PASO C (auditoría Reads pre-edit) detectamos:

- **`_SessionInner.js:L178`** declara `const [currentTime, setCurrentTime] = useState(null)` → setter React state.
- **`_SessionInner.js:L770/L783/L1222/L1257/L2159`** usan ese setter React.

Importar una función llamada igual desde `lib/sessionData.js` habría generado `SyntaxError: Identifier 'setCurrentTime' has already been declared`.

**Solución aplicada** (commit `cc65fef` con `replace_all: true` sobre `fase-1-plan.md`):
- Función nueva renombrada a `setMasterTime` (alineada con vocabulario `rawMaster L753` / `masterTime L1218`).
- 17 sustituciones en el plan (16 líneas + L662 con 2 ocurrencias).
- `clearCurrentTime` no tiene conflicto, mantiene el nombre.

**Archivos NO tocados en el renombrado:**
- `core-analysis.md` — sus 8 menciones de `setCurrentTime` se refieren al setter React state existente, no a la API nueva. Renombrarlas habría desincronizado el análisis con la realidad del código.
- `_SessionInner.js` — el setter React state se mantiene. Solo se renombra la función EXPORTADA por `lib/sessionData.js`.

---

## 7. Reglas absolutas (sin cambios desde v2)

1. **NO push** sin OK explícito de Ramón. Vercel auto-deploya en push a `main`, por eso producción se mantiene intacta hasta validar fase 1 entera.
2. **NO migraciones Supabase** (apunta a producción).
3. **NO tocar otros repos** (`algorithmic-suite-hub`, `journal-algorithmic-suite`).
4. **NO dependencias npm nuevas** sin avisar.
5. **Aprobación opción 1 manual SIEMPRE.** NUNCA opción 2 "allow all".
6. **Comandos git separados, no encadenados con `&&`.** Excepción explícita: leer-y-volcar a archivo (`git diff > /tmp/file.txt && cat /tmp/file.txt`) es OK porque no es destructivo.
7. **Antes de tareas grandes (>100 líneas o >2 archivos):** plan primero, espera OK.
8. **Producción** en `simulator.algorithmicsuite.com` debe permanecer intacta hasta el merge final a `main` con fase 1 entera validada.

---

## 8. Progreso fase 1

| Sub-fase | Estado | Commit |
|---|---|---|
| 1a (fetch + filter weekend) | ✅ comiteada | `6f7d829` |
| 1b (centralizar `__algSuiteSeriesData/RealDataLen`) | ✅ comiteada | `0f644f8` |
| 1c (centralizar `__algSuiteCurrentTime`) | ⚠️ **EN CURSO** — código aplicado al working tree, pendiente build + comprobación + commit | (pendiente) |
| 11 pruebas manuales del §3.1 | pendiente (al final, post-1c) | — |

Tras 1c comiteada, fase 1 estará completa. Antes del merge a `main`, ejecutar las 11 pruebas exhaustivas del §3.1 del plan (validan 1a en casuísticas distintas).

---

## 9. Lecturas pendientes en §2.3 NO actualizadas (sin grep verificado)

Las siguientes líneas en `fase-1-plan.md §2.3` siguen apuntando a números pre-1a desfasados. NO se han verificado con grep en este round de 1c (alcance fuera del cluster `__algSuiteCurrentTime`):

- `_SessionInner.js` L858 (`__chartMap`) — fuera del cluster `__algSuite*`. Plan ya nota "fuera de alcance".
- `_SessionInner.js` L1138 (`__algSuiteDebugLS / __algSuiteExportTools`) — debug muerto, fase de limpieza.
- `_SessionInner.js` L144 (`__chartMap = chartMap` write) — antes del bloque borrado en 1a, no se desplaza.

→ Estas se actualizarán en el commit que aplique fase de limpieza o en fase 2 (donde se eliminen los globales). NO bloqueante para 1c.

---

## 10. Lecciones operativas ya plasmadas en plan (commit `de873d6`)

`fase-1-plan.md §8` incluye:

- **§8.1**: NUNCA `npm run build` con `npm run dev` corriendo sobre el mismo `.next/`. Protocolo en 6 pasos para validación pre-commit.
- **§8.2**: Inventario de variables huérfanas ANTES de mover bloques entre módulos. Protocolo: listar variables, grep cada una, decidir.
- **§8.2.1**: Aplicación a sub-fase 1b (8 greps específicos). Aplicada y verificada en commit `0f644f8`.
- **§8.3**: macOS no tiene `timeout` por defecto. Usar `gtimeout` (brew install coreutils) o workaround bash.
- **§8.4**: Comandos git como operaciones SEPARADAS, no encadenadas con `&&`. Granularidad de control.

---

## 11. Stack y entorno

- Next.js 14.2.35 (pages router, NO app router).
- React 18.
- Supabase (auth + Postgres).
- lightweight-charts (con plugin de line tools custom: `lightweight-charts-line-tools-core.js`, `-lines.js`, `-long-short-position.js`).
- Vercel deploy.
- Mac iMac, macOS, terminal zsh.
- Email cuenta Claude: `rammglobalinvestment@gmail.com` (plan Claude Max).

### Sesión Supabase usada en baseline

Sesión "test code" — `session_id = 550b7e67-955a-45dc-b64b-74fd2b362cec`, par EUR/USD, `date_from = 2024-08-23`, `date_to = 2025-02-19`.

### Estado de procesos al cierre de esta sesión

- Dev server: **probablemente parado** (no se relanzó tras la auditoría del PASO C). Verificar con `ps aux | grep "next dev" | grep -v grep`. Si está parado, hay que relanzarlo en el paso 5 del retomado.
- `caffeinate`: probablemente cerrado al cerrar Claude Code.

---

## 12. Documentos clave del repo (orden de lectura)

Todos en `/Users/principal/Desktop/forex-simulator-algorithmic-suite/`:

### 12.1 `CLAUDE.md` (raíz, commit `059cdfd`)

Brief y reglas absolutas para Claude Code. Léelo entero al retomar.

### 12.2 `refactor/core-analysis.md` (commit `3ec573f`)

Análisis técnico del core en 8 secciones. Lectura recomendada.

### 12.3 `refactor/fase-1-plan.md` (commit `cc65fef`, post-renombrado)

Plan táctico de la fase 1. **Lectura obligatoria al retomar:**
- §2.2 sub-fase 1c (líneas verificadas L528/L772/L1225).
- §2.3 (con RulerOverlay añadido en commit `1316c22`, lecturas `__algSuiteCurrentTime` actualizadas en `1ff95ea`).
- §3.3 (plan detallado de 1c, ya con `setMasterTime`).
- §8 lecciones operativas.

### 12.4 Código del 28/4 (commits `6f7d829` y `0f644f8`)

- `lib/sessionData.js` (118 líneas comiteadas, 142 en working tree post-1c sin comitear): `fetchSessionCandles`, `filterWeekends`, `setSeriesData`, `updateSeriesAt`, `setMasterTime` (working tree), `clearCurrentTime` (working tree).
- `components/_SessionInner.js`: 5 escrituras de globals centralizadas (4 de cluster series + 1 de cluster currentTime), 3 escrituras de currentTime ya delegadas (en working tree).

---

## 13. Cómo arrancar el siguiente chat

### Mensaje sugerido para copiar/pegar al chat nuevo

```
Hola. Retomamos el desarrollo del simulador forex.

Estamos en MITAD de sub-fase 1c. Las 5 operaciones de código están
APLICADAS al working tree pero NO COMITEADAS. HEAD está en cc65fef
(último commit de docs). El próximo paso es validar con npm run build,
mini-comprobación en navegador con baseline post-1c (snippet de 7
valores), y si todo cuadra, hacer git add + git commit.

Te paso adjuntos:
1. HANDOFF.md v3 (este documento) — léelo entero antes de proponer nada.
2. fase-1-plan.md del repo (post commit cc65fef, ~824 líneas).
3. core-analysis.md del repo.
4. CLAUDE.md del repo.

Soy Ramón, trader/mentor, no dev. Reglas absolutas en HANDOFF §7.

Cuando hayas leído todo, dime:
1. Qué entendiste del estado actual en una frase.
2. Qué paso del retomado §5 propones empezar.
3. Dudas que tengas.

NO empezar a tocar nada hasta que yo apruebe.
```

### Verificaciones que el chat nuevo debe hacer al arrancar

Antes de proponer plan, el chat nuevo debe:

1. Confirmar que entendió:
   - Yo soy trader, no dev.
   - 5 operaciones aplicadas SIN comitear → no comitear todavía.
   - HEAD está en `cc65fef`, working tree dirty.
   - `setCurrentTime` en `_SessionInner.js` es setter React state, NO la función nueva (que se llama `setMasterTime`).

2. Verificar `git status` y `git log --oneline -5` antes de cualquier acción.

3. Verificar que `lib/sessionData.js` tiene 142 líneas (118 + 24 de Op A) y que `_SessionInner.js` tiene los 4 hunks de Op B + #1 + #2 + #3. Si no es así, el working tree fue alterado entre sesiones — diagnosticar antes de seguir.

4. Tener presente que su project knowledge puede estar desactualizado vs filesystem real. Cuando dude, exigir Read del archivo de disco.

---

## 14. Contacto y entorno

- **Email Ramón**: `rammglobalinvestment@gmail.com` (cuenta Claude Max).
- **Mac**: iMac, macOS, terminal zsh.
- **Carpeta proyecto**: `/Users/principal/Desktop/forex-simulator-algorithmic-suite`.
- **Servidor dev** (al relanzar): `npm run dev` en `localhost:3000`.
- **Logs dev**: `/tmp/forex-dev.log`.

---

**Fin del HANDOFF v3.**

Suerte mañana o cuando retomes. El refactor está cerca de cerrar fase 1 — solo falta validar 1c y hacer las 11 pruebas exhaustivas del §3.1 del plan.
