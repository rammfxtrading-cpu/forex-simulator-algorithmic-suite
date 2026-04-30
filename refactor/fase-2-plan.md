# Plan táctico — Fase 2 (cerrar data layer: lecturas)

> Documento operativo. Ramón debe leer §0, §1 y §3 mínimo.
> Trabajamos en la rama `refactor/fase-2-data-layer` (a crear desde `main` en HEAD `125ad4b` cuando se apruebe el plan).
> Cada sub-fase = un commit aislado, mergeable sola dentro de la rama.

---

## 0. Decisión arquitectónica: Opción I vs I+ vs II

> Esta sección no estaba en el `fase-1-plan.md` porque fase 1 solo movía escrituras y la API era forzosa (3 setters). Fase 2 introduce **API de lectura nueva** y hay decisión real que tomar.

### 0.1 Las 3 opciones sobre la mesa

**Opción I — Getters síncronos triviales.**
- API: `getSeriesData()`, `getRealLen()`, `getMasterTime()`.
- Implementación: `() => window.__X` literal, una línea por función.
- Cada consumer hace 1 llamada por valor. Si necesita data + realLen, hace 2 llamadas separadas.

**Opción I+ — Getters individuales + `getSeriesSnapshot()` agrupado.**
- Igual que I, más una función extra `getSeriesSnapshot()` que devuelve `{ data, realLen }` en un solo objeto literal.
- Reduce 12 lecturas a 6 llamadas en los 6 sitios con patrón "2 globals coordinados" (autoscaleInfoProvider, timeToLogical, fromScreenCoords, RulerOverlay.coordsToData, KillzonesOverlay useEffect — el sitio doble en chartCoords se cuenta como 2).
- Mantiene los getters individuales para los casos que solo usan uno (CurrentTime).

**Opción II — Store con subscribe (React context o similar).**
- Eliminar globales como source of truth. Publicar datos vía un store reactivo.
- Consumers leen vía hook `useSeriesData()` o `useContext()`.
- Re-render automático cuando los datos cambian.

### 0.2 Análisis honesto contra los datos del PASO C

El PASO C (lectura en contexto de las 13 lecturas) deja una observación dura:

> **Ningún consumer reacciona al global como dependencia de un useEffect.** Todos leen el snapshot puntual cuando lo necesitan. Los 2 consumers que están dentro de useEffect (KillzonesOverlay L172, _SessionInner L1213) NO incluyen el global en sus deps — se re-disparan por otras señales (`tick`, `activePair`, `ctBucket`).

Eso es la prueba dura contra Opción II. No hay caso de uso real de "subscríbeme cuando esto cambie". Implementar un store reactivo añade complejidad (hooks, providers, SSR-safety, lifecycle de subscripción) sin resolver ningún problema actual.

Adicionalmente, la decisión de Ramón en `core-analysis.md §7` (auditoría original) fija el contrato: **los globales se mantienen** en fase 2. Opción II los elimina, lo cual estaría fuera de alcance aprobado.

### 0.3 Tabla comparativa

| Eje | Opción I | Opción I+ | Opción II |
|---|---|---|---|
| Líneas API nuevas en `sessionData.js` | ~15 (3 getters con JSDoc) | ~22 (3 getters + getSnapshot) | ~80–120 (store + provider + hook + SSR guard) |
| Sustituciones consumer | 13 lecturas → 13 llamadas (1:1) | 13 lecturas → 7 llamadas (3 individuales + 4 snapshot) | 4 archivos rewrite con hooks/contexts |
| Compatibilidad SSR | Trivial (guard en getter) | Trivial (guard en getter) | Requiere diseño explícito |
| Overhead hot path | 0 (función inline JIT) | 0 en getters individuales / **alocación objeto literal** en getSnapshot por cada llamada (autoscale, drawings → posible presión GC, no medido) | Re-render React + reconciliación + re-eval hooks por cada update |
| Patrones distintos en codebase | 1 | 2 (mezcla individual + snapshot) | 1 |
| Resuelve "2 globals descoordinados" | NO (no es bug en JS single-thread, es claridad de intención) | SÍ | SÍ (vía objeto store) |
| Compatibilidad fases 3-7 | Total (cambiar body del getter no rompe consumers) | Total | Total (pero con más superficie a migrar si fase futura quiere quitar el store) |
| Coherencia con fase 1 | Alta (fase 1 declara "API muerta no se exporta hasta que haga falta", `fase-1-plan.md §3.2`) | Media (getSnapshot es ergonomía, no necesidad) | Baja (rompe contrato §7 de mantener globales) |
| Coste si nos equivocamos | Bajo (sustituciones 1:1 reversibles con grep + sed inverso) | Medio (mezcla de patrones a desentrañar) | Alto (rewrite consumer-side) |

### 0.4 Mi recomendación

**Opción I pura.**

Razones, en orden de peso:

1. **0 overhead en hot path crítico.** Los 3 caminos críticos identificados (autoscaleInfoProvider, chartCoords.timeToLogical, chartCoords.fromScreenCoords) corren en cada frame durante zoom/pan/play/drag. Una función inline JIT-eada cuesta 0 ciclos extra. `getSnapshot()` cuesta 1 alocación de objeto + 2 escrituras de propiedad por llamada. No tengo medida real, pero es preocupación honesta y evitarla cuesta nada.

2. **1 patrón único en toda la base.** Mezclar getters individuales + getSnapshot introduce dos formas de hacer lo mismo. Carga cognitiva permanente para cada futuro lector. La "ergonomía" de `getSnapshot` es cosmética: en JS single-thread, dos lecturas consecutivas de globals nunca dan resultados distintos (no hay otro thread escribiendo entre medias).

3. **Coherencia con la disciplina de fase 1.** `fase-1-plan.md §3.2` ya estableció el principio: "API muerta = no se exporta. Si fase posterior la pide, se añade entonces". Opción I+ exporta `getSnapshot` por una conveniencia que se puede medir cuando duela. Opción I la deja para fase futura si los datos lo justifican.

4. **Coste reversible.** Si en una fase futura (3+) detectamos que `getSnapshot` aporta valor real (porque, por ejemplo, fase 3 introduce viewport y necesita coordinar varios reads atómicamente), añadirlo entonces es trivial: 5 líneas más + sustituciones quirúrgicas en los 6 sitios donde aporta. Hacerlo ahora preventivamente es premature factoring.

**Opción II queda descartada** por overengineering: resuelve un problema (reactividad) que el codebase no tiene, rompe el contrato §7 (mantener globales) y multiplica por ~5 las líneas de código nuevo sin beneficio observable.

**Opción I+ queda en reserva** para cuando una fase futura demuestre necesidad real, no por simetría estética con Opción II.

### 0.5 Decisión final pendiente de Ramón

Ramón decide. Si confirma Opción I, el resto del plan (§1–§8) la asume implementada y se ejecuta tal cual. Si elige I+ o II, el plan se reescribe parcialmente (§2.2, §3.1, §3.2, §3.3 cambian).

---

## 1. Objetivo de la fase 2 (afilado)

> **Cerrar el círculo abierto en fase 1.** Hoy `lib/sessionData.js` es el único módulo que **escribe** los 3 globales `__algSuiteSeriesData / __algSuiteRealDataLen / __algSuiteCurrentTime`, pero 13 consumers en 4 archivos los **leen** directamente. Tras fase 2, también será el único módulo que expone las **lecturas**, vía 3 getters síncronos triviales. El data layer queda totalmente aislado en un único archivo.

**Importante:** los globales **se mantienen** como almacén físico (decisión Ramón en `core-analysis.md §7`, ratificada en `fase-1-plan.md §1`). La fase 2 NO los elimina — solo prohíbe que ningún consumer fuera de `sessionData.js` los toque directamente.

**Lo que NO es el objetivo:**
- No eliminar los globales `window.__algSuite*`. Eso sería decisión Ramón posterior, no fase 2.
- No tocar el viewport, el render layer, los drawings, ni el dominio trading. Esas son fases 3–7 según `core-analysis.md §6` (orden vigente post 29-abr-2026).
- No introducir reactividad / store / hooks. Ver §0.4 — descartado.
- No atacar los bugs B2/B3/B4/B5/B6 documentados en `HANDOFF-verificacion-A1.md §7`. Ninguno vive en data layer.
- No tocar la lectura interna `lib/sessionData.js:L116` — es del propio módulo dueño y no entra en alcance (ver §6).

---

## 2. Inventario exhaustivo de puntos a tocar

### 2.1 Archivos NUEVOS

Ninguno. Se extiende `lib/sessionData.js` con 3 getters nuevos (~15 líneas con JSDoc). Coherente con `fase-1-plan.md §3.2` (un único módulo "data layer", no se divide hasta que algo lo justifique).

### 2.2 Modificaciones por sub-fase

**Sub-fase 2a — `getMasterTime()` + lecturas en `_SessionInner.js`:**

| # | Línea | Qué hay hoy | Qué pasa a haber |
|---|---|---|---|
| 1 | L568 | `\|\| (typeof window !== 'undefined' && window.__algSuiteCurrentTime)` | `\|\| getMasterTime()` |
| 2 | L753 | `const rawMaster = (typeof window !== 'undefined' && window.__algSuiteCurrentTime) \|\| null` | `const rawMaster = getMasterTime()` |
| 3 | L1218 | `const masterTime = window.__algSuiteCurrentTime` | `const masterTime = getMasterTime()` |
| 4 | L524 (comentario) | `window.__algSuiteCurrentTime persiste entre navegaciones SPA…` | `el masterTime persiste entre navegaciones SPA…` (sin mencionar global por nombre) |
| 5 | L566 (comentario) | `Fallback adicional a window.__algSuiteCurrentTime por si acaso.` | `Fallback adicional a getMasterTime() por si acaso.` |

**Sub-fase 2b — `getSeriesData()` + `getRealLen()` + lecturas periféricas:**

| # | Archivo:Línea | Qué hay hoy | Qué pasa a haber |
|---|---|---|---|
| 6 | RulerOverlay.js:L28 | `const data = window.__algSuiteSeriesData` | `const data = getSeriesData()` |
| 7 | RulerOverlay.js:L30 | `const realLen = window.__algSuiteRealDataLen \|\| data.length` | `const realLen = getRealLen() \|\| data.length` |
| 8 | KillzonesOverlay.js:L177 | `const allData = typeof window !== 'undefined' ? window.__algSuiteSeriesData : null` | `const allData = getSeriesData()` |
| 9 | KillzonesOverlay.js:L178 | `const realLen = typeof window !== 'undefined' ? window.__algSuiteRealDataLen : null` | `const realLen = getRealLen()` |

**Sub-fase 2c — Lecturas en hot path de render (`chartCoords.js` + autoscaleInfoProvider):**

| # | Archivo:Línea | Qué hay hoy | Qué pasa a haber |
|---|---|---|---|
| 10 | chartCoords.js:L9 | `const allData = window.__algSuiteSeriesData` | `const allData = getSeriesData()` |
| 11 | chartCoords.js:L11 | `const realLen = window.__algSuiteRealDataLen \|\| allData.length` | `const realLen = getRealLen() \|\| allData.length` |
| 12 | chartCoords.js:L89 | `const data = window.__algSuiteSeriesData` | `const data = getSeriesData()` |
| 13 | chartCoords.js:L96 | `const realLen = window.__algSuiteRealDataLen \|\| data.length` | `const realLen = getRealLen() \|\| data.length` |
| 14 | _SessionInner.js:L815 | `const data = window.__algSuiteSeriesData` | `const data = getSeriesData()` |
| 15 | _SessionInner.js:L816 | `const realLen = window.__algSuiteRealDataLen` | `const realLen = getRealLen()` |

Adicionalmente, `lib/chartCoords.js:L3` (comentario de cabecera del archivo: `SOURCE OF TRUTH: window.__algSuiteSeriesData (real + phantom candles)`) se puede actualizar a `SOURCE OF TRUTH: getSeriesData() de lib/sessionData.js (real + phantom candles)` en 2c — coste cero, coherencia documental.

### 2.3 Lecturas que NO se tocan en fase 2 (lista explícita)

> Estas lecturas seguirán leyendo `window.__algSuite*` directo. NO son alcance fase 2.

| Archivo:Línea | Qué lee | Razón de exclusión |
|---|---|---|
| `lib/sessionData.js:L116` | `if (!window.__algSuiteSeriesData) return` | Lectura **interna del módulo dueño**. Defensa dentro de `updateSeriesAt`. Sustituirla por un getter sería ceremonia sin valor — el módulo puede leer su propio almacén directamente. |
| `lib/sessionData.js:L117` | `window.__algSuiteSeriesData[index] = candle` | **Escritura por índice** dentro de `updateSeriesAt`, ya migrada en fase 1b. NO es lectura. Listada aquí solo para evitar confusión. |
| `_SessionInner.js:L819` | `window.__chartMap?.current?.[pair]` | Global **auxiliar**, no del cluster `__algSuite*`. Fuera de alcance — fase de limpieza separada (`HANDOFF.md §9`). |
| `_SessionInner.js:L1138` (zona) | `window.__algSuiteDebugLS` y `window.__algSuiteExportTools` | Globales **auxiliares de debug**, código muerto. Fuera de alcance — fase de limpieza separada. |

### 2.4 Archivos que NO se tocan en TODA la fase 2

```
lib/replayEngine.js                  ← intocable (sigue siendo intocable, fase 1 lo respetó)
components/useDrawingTools.js        ← fase 5 (drawings lifecycle)
components/useCustomDrawings.js      ← fase 5
components/CustomDrawingsOverlay.jsx ← fase 5
components/ChartConfigPanel.js       ← no relacionado
components/DrawingToolbarV2.jsx      ← no relacionado
components/Hotbar.js                 ← no relacionado
pages/api/candles.js                 ← API server, fuera de scope
pages/api/challenge/*.js             ← B4 vive aquí, sesión dedicada post fase 2
Esquema Supabase                     ← regla absoluta CLAUDE.md §3.1
package.json                         ← no se añaden deps (regla §3.4)
```

---

## 3. Plan paso a paso

> **Nota sobre desarrollo en local (HMR):** misma observación que `fase-1-plan.md §3 intro` — durante la fase 2, cada vez que edite `_SessionInner.js` o cualquier consumer, Next.js puede mostrar errores tipo `Object is disposed` o `Series not attached to tool ...`. **NO son regresiones de la fase 2**: son los bugs #5 y #6 del `CLAUDE.md §9`, preexistentes, expuestos por el HMR. Cmd+R (hard reload) entre cambios para baseline limpio. Solo errores que persistan tras Cmd+R cuentan como rotura.

### 3.0 Verificación previa pre-arranque (PASO 0)

> ⚠️ **Obligatorio antes del primer commit de sub-fase 2a, NO antes de aprobar el plan.**
> Razón: `main` puede haber recibido cambios entre la redacción del plan (30 abr 2026) y el arranque del primer commit. La lección §8.5 dice literalmente "Inventarios siempre con grep recursivo". Aplicarla al arranque de cada fase es la materialización operativa de esa lección.

Ejecutar los 3 greps recursivos sobre los 3 globales del cluster `__algSuite*`:

```bash
grep -rn "window\.__algSuiteSeriesData\b" components/ pages/ lib/
grep -rn "window\.__algSuiteRealDataLen\b" components/ pages/ lib/
grep -rn "window\.__algSuiteCurrentTime\b" components/ pages/ lib/
```

**Esperado:** los matches incluyen lecturas externas + escrituras + comentarios. Lo crítico para arrancar fase 2 es contar **lecturas externas** (descontando escrituras de sessionData.js, descontando comentarios, descontando la lectura interna L116):

- `__algSuiteSeriesData`: 5 lecturas externas (en _SessionInner, KillzonesOverlay, RulerOverlay, chartCoords ×2)
- `__algSuiteRealDataLen`: 5 lecturas externas (en _SessionInner, KillzonesOverlay, RulerOverlay, chartCoords ×2)
- `__algSuiteCurrentTime`: 3 lecturas externas (en _SessionInner ×3)

**Total lecturas externas: 5 + 5 + 3 = 13 lecturas en 4 archivos** (`_SessionInner.js`, `chartCoords.js`, `RulerOverlay.js`, `KillzonesOverlay.js`).

**Si el grep devuelve cifras distintas a 13/4 lecturas externas:**

- Si hay **más lecturas externas** que las 13 esperadas → un consumer nuevo apareció en main entre 30 abr (redacción del plan) y el arranque del primer commit. PARAR. Identificar el consumer nuevo, decidir si entra en alcance fase 2 (probable que sí, igual que pasó con KillzonesOverlay en 30 abr) o se aparca. Actualizar §2.2 y §3.1/3.2/3.3 antes de empezar a tocar código.

- Si hay **menos lecturas externas** que las 13 esperadas → alguien borró/movió código entre 30 abr y el arranque. PARAR. Diagnosticar antes de seguir (probable: refactor inadvertido, consumer eliminado, archivo movido).

- Si las 13 lecturas están en archivos distintos a los esperados (no coinciden _SessionInner / chartCoords / RulerOverlay / KillzonesOverlay) → reorganización del repo. PARAR. Actualizar §2.2 con los archivos reales antes de tocar nada.

- Si el inventario coincide al carácter (13 lecturas externas en los 4 archivos esperados) → adelante con sub-fase 2a.

### 3.1 Sub-fase 2a — `getMasterTime()` + 3 lecturas en `_SessionInner.js`

**Tamaño:** ~3 líneas tocadas en `_SessionInner.js` (3 sustituciones 1:1 + 2 comentarios) + ~10 añadidas en `lib/sessionData.js`. **Total +10 líneas netas.** **Sesiones:** 0.5. **Riesgo:** bajo-medio.

**Por qué bajo-medio:**
- 3 lecturas todas en el mismo archivo, mismo patrón (lectura puntual de masterTime), trivialmente sustituibles.
- L1218 toca el sync entre engines de pares distintos (fue zona delicada en fase 1c también). Si el getter devuelve algo distinto al global por error de implementación, el par recién activado arranca en su `currentTime` antiguo en lugar del masterTime → se rompe el sync entre pares (síntoma idéntico al que la fase 1c arregló).
- Es la sub-fase pequeña de calentamiento. Valida que la API funciona en frío antes de tocar el cluster series (más grande y más caliente).

#### Decisión: extender `lib/sessionData.js`, NO crear archivo nuevo

Mismo razonamiento que `fase-1-plan.md §3.2 / §3.3` ya aplicó. Justificación heredada:

- Plan §2.1 declara "0 archivos nuevos". Crear módulo aparte por 3 funciones rompería el principio "1 módulo data layer, todo dentro".
- Las 3 funciones suman ~15 líneas con JSDoc. Premature factoring si se separan.
- Si fase futura (eliminación de globales) lo requiere, separar entonces.

#### API expuesta en 2a (1 función)

```js
/**
 * Devuelve el timestamp UNIX en segundos del momento actual del replay,
 * o null si no hay sesión activa (CmdR fresco, sin play).
 *
 * Equivale al global window.__algSuiteCurrentTime escrito por setMasterTime/clearCurrentTime.
 * Guard interno SSR (typeof window check).
 *
 * @returns {number|null} Timestamp UNIX en segundos, o null si no hay master time.
 */
export function getMasterTime() {
  if (typeof window === 'undefined') return null
  return window.__algSuiteCurrentTime ?? null
}
```

**Nota sobre `?? null`:** los 3 consumers actuales esperan `null`/falsy cuando el global no está seteado (lecturas L568, L753, L1218 todas tienen fallback con `||`). Devolver `?? null` en lugar de devolver `undefined` cuando el global está sin setear es defensa explícita de tipos — equivalente al `|| null` del L753 actual. Coste: cero. Beneficio: contrato explícito de la API.

#### Las 3 sustituciones a aplicar (líneas reales pre-2a verificadas con grep en PASO 0)

> ⚠️ Antes de cada `str_replace`, ejecutar `Read` del fichero con rango ±10 líneas alrededor de la línea a tocar. Pegar output literal a Ramón. Esperar OK explícito antes del Edit.

| # | Línea | Indentación | Contenido actual exacto | Sustitución propuesta |
|---|---|---|---|---|
| 1 | L568 | 8 esp (dentro de cadena `\|\|`) | `\|\| (typeof window !== 'undefined' && window.__algSuiteCurrentTime)` | `\|\| getMasterTime()` |
| 2 | L753 | 6 esp | `const rawMaster = (typeof window !== 'undefined' && window.__algSuiteCurrentTime) \|\| null` | `const rawMaster = getMasterTime()` |
| 3 | L1218 | 6 esp | `const masterTime = window.__algSuiteCurrentTime` | `const masterTime = getMasterTime()` |

**Cambio neto en `_SessionInner.js`:** 0 líneas (3 sustituciones 1:1 + 1 modificación de import).

#### Las 2 actualizaciones de comentarios (coste cero, coherencia documental)

| # | Línea | Indentación | Comentario actual | Comentario nuevo |
|---|---|---|---|---|
| 4 | L524 | 4 esp | `// window.__algSuiteCurrentTime persiste entre navegaciones SPA (Next.js no` | `// el masterTime persiste entre navegaciones SPA (Next.js no` |
| 5 | L566 | 6 esp | `// Fallback adicional a window.__algSuiteCurrentTime por si acaso.` | `// Fallback adicional a getMasterTime() por si acaso.` |

#### Modificación de import en `_SessionInner.js`

Antes (línea de import existente, post-1c):
```js
import { fetchSessionCandles, setSeriesData, updateSeriesAt, setMasterTime, clearCurrentTime } from '../lib/sessionData'
```

Después:
```js
import { fetchSessionCandles, setSeriesData, updateSeriesAt, setMasterTime, clearCurrentTime, getMasterTime } from '../lib/sessionData'
```

#### Lecturas que NO se tocan en 2a — justificación

Las 10 lecturas restantes del cluster `__algSuite*` (5 SeriesData + 5 RealDataLen) **se quedan tal cual** leyendo `window.__algSuite*` directamente. Se atacan en 2b y 2c.

- **Alcance del plan:** §2.2 reparte explícitamente las lecturas en sub-fases 2a / 2b / 2c. Mezclarlas rompería "sub-fase mergeable sola" del §3.2.
- **Es seguro:** `getMasterTime()` devuelve el mismo valor que la lectura directa del global. Cero cambio observable para los consumers no migrados.
- **Es necesario para validar la API:** sub-fase 2a es la prueba de que el patrón de getters triviales funciona en producción. 2b/2c se aplican con la API ya respaldada.

#### Cuidado clave (orden de operaciones)

A diferencia de fase 1b, las lecturas de 2a NO viven dentro de `updateChart` ni en hot path de render. Se ejecutan en lugares aislados (refreshChallengeStatus, loadPair, useEffect de cambio de activePair). La única invariante: el getter debe devolver el mismo valor que la lectura directa en cada uno de esos 3 momentos. JS single-thread garantiza esto siempre que el body del getter sea trivial (`return window.__X ?? null`).

#### Pruebas manuales (Ramón)

> Cada prueba: `npm run dev` con dev server limpio + Cmd+R para consola desde cero (ver nota HMR §3 intro).

0. **Baseline pre-2a (antes de tocar nada):** abrir sesión "test code", Cmd+R fresco, snippet en consola:
```js
({
  ct1: window.__algSuiteCurrentTime,                                 // null esperado, sin play
  ct2: (typeof window !== 'undefined' && window.__algSuiteCurrentTime) || null  // mismo
})
```
   Anotar valores.

1. **Smoke post-2a sin play:** misma sesión, Cmd+R, snippet:
```js
({
  ct: window.__algSuiteCurrentTime,
  ctViaApi: (await import('/lib/sessionData')).getMasterTime?.()  // si import dinámico no se permite por dev, omitir
})
```
   Esperado: `ct: null`, `ctViaApi: null`. Si `ctViaApi` no es `null` ↔ `ct`, parar.

2. **Sync engine al cambiar par (test específico de L1218):** cargar EUR/USD, dar play hasta avanzar 50+ velas, pause, cambiar al segundo par disponible (USD/CHF en producción según `HANDOFF-pruebas-resultado.md §1.9`). El segundo par debe posicionarse en el mismo timestamp que el primero (aprox: la H1 que contiene el masterTime). Si arranca en su `date_from` o en el `last_timestamp` saved, **regresión de 2a** — la sustitución de L1218 está fallando.

3. **Validación challenge fallback (test específico de L568):** sesión challenge ad-hoc, abrir, hacer un trade y cerrarlo. Post-cierre, en consola buscar log de `refreshChallengeStatus` o monitor de Network: la query a `/api/challenge/status` debe llevar `current_time=<timestamp>` (no vacío). Si va sin `current_time`, **regresión** — el fallback `|| getMasterTime()` no está retornando el masterTime cuando `currentTimeRef.current` es null.

4. **Validación masterTime al cargar par (test específico de L753):** sesión multi-par. Abrir, dar play en par 1, cambiar a par 2 que ya estaba cargado en sesión anterior (con `last_timestamp` propio en BD distinto al masterTime actual). El par 2 debe arrancar al masterTime, no a su `last_timestamp` propio. Validación: `pairState.current[par2].engine.currentTime` ≈ masterTime al primer render del par 2.

5. **Cambio de TF post-cambio de par:** secuencia M1 → cambio par → H1 → cambio par. Verificar que ningún cambio descoloca el sync.

#### Señales de que algo se rompió

- Error en consola: `getMasterTime is not a function` → import roto.
- Par 2 arranca en su `date_from` al cambiar desde par 1 con replay activo → L1218 substitution rota.
- Query `/api/challenge/status` se manda sin `current_time` cuando había replay activo → L568 substitution rota.
- Cualquier "Cannot read properties of null/undefined" nuevo en lugares que antes funcionaban → desambiguar con stack trace.

#### Rollback

`git revert <hash-2a>` o, si nada se ha mergeado encima, `git reset --hard refactor/fase-2-data-layer~1`. Como toca solo 2 archivos (`lib/sessionData.js` y `components/_SessionInner.js`), el revert es quirúrgico.

#### Validación final antes del commit

1. Yo ejecuto `npm run build` con dev parado (regla `fase-1-plan.md §8.1`). Si falla, no propongo commit.
2. Yo ejecuto `git diff` y se lo enseño a Ramón al completo.
3. Espero **OK explícito** de Ramón.
4. Solo entonces ejecuto `git add lib/sessionData.js components/_SessionInner.js` (separado del commit).
5. Solo entonces ejecuto `git commit` (separado del add).

#### Commit message sugerido

```
refactor(fase-2a): centralizar lectura de __algSuiteCurrentTime

- lib/sessionData.js expone getMasterTime() — getter trivial con guard
  SSR interno y normalización ?? null
- _SessionInner.js delega las 3 lecturas a la nueva API:
  · L568 → getMasterTime() (refreshChallengeStatus fallback)
  · L753 → getMasterTime() (validación rawMaster en loadPair)
  · L1218 → getMasterTime() (sync engine al cambiar activePair)
- 2 comentarios actualizados (L524, L566) para no mencionar el global
  por nombre desde código consumer
- Escrituras siguen como están (setMasterTime/clearCurrentTime de fase 1c)
- Lecturas de SeriesData/RealDataLen siguen direct (alcance 2b/2c)
- Sin cambios funcionales: getter devuelve el mismo valor que la lectura
  directa del global (validado por baseline pre/post)
```

---

### 3.2 Sub-fase 2b — `getSeriesData()` + `getRealLen()` + lecturas periféricas

**Tamaño:** ~4 líneas tocadas (4 sustituciones 1:1) + ~12 añadidas en `lib/sessionData.js`. **Total +12 líneas netas.** **Sesiones:** 0.5. **Riesgo:** bajo.

**Por qué bajo:**
- 4 lecturas en 2 archivos consumer (RulerOverlay 2 + KillzonesOverlay 2). Ninguno es frame-loop crítico.
- RulerOverlay solo activo cuando el usuario tiene la regla en uso (modo medición manual, baja frecuencia).
- KillzonesOverlay useEffect dispara solo al cambiar bucket de 30min de replay o al cambiar TF/par/cfg. NO frame-loop.
- 2 funciones nuevas (`getSeriesData`, `getRealLen`) ya validadas conceptualmente por `getMasterTime()` de 2a.

#### Decisión heredada: extender `lib/sessionData.js`

Mismo razonamiento que 2a. Las 2 funciones nuevas suman ~12 líneas con JSDoc. Mantener el módulo único.

#### API expuesta en 2b (2 funciones)

```js
/**
 * Devuelve el array completo de candles (real + phantom) que actualmente
 * está renderizado en el chart, o null si no hay sesión cargada.
 *
 * El array se devuelve por referencia. NO mutar — la mutación rompe el
 * source of truth para autoscaleInfoProvider, drawings y overlays.
 * Para mutar un candle individual, usar updateSeriesAt(index, candle).
 *
 * Equivale al global window.__algSuiteSeriesData escrito por setSeriesData.
 * Guard interno SSR (typeof window check).
 *
 * @returns {Object[]|null} Array de candles, o null si no hay datos cargados.
 */
export function getSeriesData() {
  if (typeof window === 'undefined') return null
  return window.__algSuiteSeriesData ?? null
}

/**
 * Devuelve la longitud de la parte REAL del array de candles (sin phantoms),
 * o null si no hay sesión cargada.
 *
 * Invariante: si hay datos, getRealLen() <= getSeriesData().length.
 * Equivale al global window.__algSuiteRealDataLen escrito por setSeriesData.
 * Guard interno SSR (typeof window check).
 *
 * @returns {number|null} Longitud real, o null si no hay datos cargados.
 */
export function getRealLen() {
  if (typeof window === 'undefined') return null
  return window.__algSuiteRealDataLen ?? null
}
```

**Nota sobre `?? null`:** los consumers actuales esperan `null`/falsy cuando los globals no están seteados (KillzonesOverlay L179: `if (!allData || !realLen)`; RulerOverlay L29: `!data?.length`). Devolver `?? null` mantiene el contrato. Coste: cero.

#### Las 4 sustituciones a aplicar

> ⚠️ Antes de cada `str_replace`, `Read` del fichero ±10 líneas. Output literal a Ramón. OK explícito.

| # | Archivo:Línea | Indentación | Contenido actual exacto | Sustitución propuesta |
|---|---|---|---|---|
| 6 | RulerOverlay.js:L28 | 6 esp | `const data    = window.__algSuiteSeriesData` | `const data    = getSeriesData()` |
| 7 | RulerOverlay.js:L30 | 6 esp | `const realLen = window.__algSuiteRealDataLen \|\| data.length` | `const realLen = getRealLen() \|\| data.length` |
| 8 | KillzonesOverlay.js:L177 | 4 esp | `const allData = typeof window !== 'undefined' ? window.__algSuiteSeriesData : null` | `const allData = getSeriesData()` |
| 9 | KillzonesOverlay.js:L178 | 4 esp | `const realLen = typeof window !== 'undefined' ? window.__algSuiteRealDataLen : null` | `const realLen = getRealLen()` |

**Cambio neto en consumers:** 0 líneas (4 sustituciones 1:1).

#### Imports nuevos a añadir

**En `components/RulerOverlay.js`:**

Añadir import al bloque de imports existente (probable cabecera del archivo):
```js
import { getSeriesData, getRealLen } from '../lib/sessionData'
```

**En `components/KillzonesOverlay.js`:**

Mismo import:
```js
import { getSeriesData, getRealLen } from '../lib/sessionData'
```

> Verificar el path relativo correcto en cada archivo con `Read` antes del Edit (RulerOverlay y KillzonesOverlay están en `components/`, sessionData está en `lib/` → path `../lib/sessionData` para ambos).

#### Lecturas que NO se tocan en 2b — justificación

Las 6 lecturas de SeriesData/RealDataLen restantes (4 en chartCoords + 2 en _SessionInner autoscaleInfoProvider) **se quedan tal cual**. Se atacan en 2c.

- **Alcance del plan:** §2.2 separa explícitamente 2b (consumers periféricos) de 2c (hot path de render). Esa separación es por riesgo: 2c concentra los caminos críticos de cada frame.
- **Es seguro:** `getSeriesData()` y `getRealLen()` devuelven los mismos valores que la lectura directa. Cero cambio observable para consumers no migrados.
- **Es la separación correcta de blast radius:** si 2b rompe algo, el síntoma queda confinado a las 2 overlays (regla y killzones). Si 2b va bien, 2c entra con la API ya respaldada en producción.

#### Cuidado clave (orden de operaciones)

Ningún consumer de 2b está en frame-loop. RulerOverlay se invoca por evento de pointer (decenas/centenares por segundo solo si el usuario mueve el ratón con la regla activa). KillzonesOverlay useEffect dispara por deps explícitas (`tick`, `ctBucket`, `cfg`, `tfAllowed`, `dataReady`, `activePair`). Ninguno requiere optimización.

Patrón a respetar: las lecturas de SeriesData y RealDataLen siempre se hacen en pareja, validadas con `if (!data || !realLen)` o equivalente. Mantener ese patrón con los getters.

#### Pruebas manuales (Ramón)

> Cada prueba: dev limpio + Cmd+R + consola limpia.

0. **Baseline pre-2b (antes de tocar nada):** sesión "test code", H1, Cmd+R fresco. Snippet:
```js
({
  serLen: window.__algSuiteSeriesData?.length,
  realLen: window.__algSuiteRealDataLen,
  firstTime: window.__algSuiteSeriesData?.[0]?.time,
  lastRealTime: window.__algSuiteSeriesData?.[window.__algSuiteRealDataLen - 1]?.time
})
```
   Anotar 4 valores.

1. **Smoke post-2b:** misma sesión, mismo snippet. Los 4 valores **deben cuadrar al carácter** con baseline. Si difieren, regresión inmediata — un getter está devolviendo distinto que la lectura directa.

2. **RulerOverlay (test específico L28/L30):** activar la herramienta regla (modo medición) en el chart. Hacer click+drag para medir un rango. Verificar:
   - El display de la regla muestra precio correcto y delta de tiempo correcto.
   - No hay crash al iniciar/terminar la medición.
   - Si el ratón sale del chart o llega al final del dataset, la regla no rompe (zonas donde `realLen` está al límite).

3. **KillzonesOverlay (test específico L177/L178):** sesión con killzones activadas (Asia/Londres/NY visibles). Verificar:
   - Las cajas de killzones aparecen en posiciones esperadas según `cfg`.
   - Al cambiar TF (M1 → H1 → M5), las killzones se recalculan sin descolocarse.
   - Al avanzar el replay y cruzar un bucket de 30min, el useEffect dispara y la killzone actual se actualiza.
   - Al cambiar par, las killzones se recalculan para el nuevo par.

4. **Cambio de par + cambio de TF combinado:** sesión multi-par + multi-killzone. Cambiar entre pares con killzones visibles y entre TFs distintos. Validar que ni la regla ni las killzones desaparecen ni se descolocan.

#### Señales de que algo se rompió

- Snippet de baseline post-2b devuelve valores distintos a pre-2b → un getter está roto.
- Error en consola: `getSeriesData is not a function` → import roto en RulerOverlay o KillzonesOverlay.
- Regla muestra precio/tiempo wrong en medición → L28/L30 substitution rota.
- Killzones aparecen en posición wrong, parpadean, o desaparecen al cambiar TF → L177/L178 substitution rota.
- "Cannot read properties of null (reading 'length')" en RulerOverlay → falta el guard `data?.length` o `getSeriesData()` está devolviendo `undefined` cuando debería devolver `null`.

#### Rollback

`git revert <hash-2b>`. Toca 3 archivos (`lib/sessionData.js`, `components/RulerOverlay.js`, `components/KillzonesOverlay.js`). Revert quirúrgico.

#### Validación final antes del commit

Mismo protocolo que 2a (build + diff + OK Ramón + add + commit, todos separados).

#### Commit message sugerido

```
refactor(fase-2b): centralizar lectura de SeriesData/RealDataLen en RulerOverlay y KillzonesOverlay

- lib/sessionData.js expone getSeriesData() y getRealLen() — getters
  triviales con guard SSR interno y normalización ?? null
- RulerOverlay.js (coordsToData): L28/L30 leen vía getters
- KillzonesOverlay.js (useEffect bucketed 30min): L177/L178 leen vía getters
- Imports añadidos a ambos consumers
- Sin cambios funcionales: baseline 4-valores cuadra al carácter
- Lecturas en chartCoords + autoscaleInfoProvider siguen direct (alcance 2c)
```

---

### 3.3 Sub-fase 2c — Lecturas en hot path de render (`chartCoords.js` + autoscaleInfoProvider)

**Tamaño:** ~6 líneas tocadas (6 sustituciones 1:1) + 0 nuevas en `lib/sessionData.js` (la API ya existe post-2b). **Total 0 líneas netas.** **Sesiones:** 1. **Riesgo:** medio-alto.

**Por qué medio-alto:**
- 4 lecturas en `chartCoords.js` se invocan en cada redraw de drawings personalizadas (RAF loop, hover, cada frame durante zoom/pan/play).
- 2 lecturas en `_SessionInner.js:L815/L816` están en `autoscaleInfoProvider` — callback que LWC ejecuta en cada cálculo del eje Y (zoom, pan, scroll, drag, cada frame durante drag).
- El comentario L804–L810 documenta un crash conocido (`Cannot read properties of undefined (reading 'minValue')`) si el contrato `if(!data||!realLen) return computeOriginal()` se rompe. Cualquier cambio en este block debe respetar ese contrato.
- Si `getSeriesData()` o `getRealLen()` introducen overhead no esperado (por ejemplo, si Ramón pide cambiar el body del getter por algo no trivial), el frame rate cae.

#### Decisión heredada: extender `lib/sessionData.js`

Ya extendido en 2b. 2c solo importa las funciones existentes en los 2 archivos restantes.

#### API expuesta en 2c

Ninguna nueva. Se usan `getSeriesData()` y `getRealLen()` ya validadas en 2b.

#### Las 6 sustituciones a aplicar

> ⚠️ Antes de cada `str_replace`, `Read` del fichero ±10 líneas. Output literal a Ramón. OK explícito.
> ⚠️ El bloque autoscaleInfoProvider (`_SessionInner.js:L803–L833 aprox`) tiene comentario crítico explicando un crash. NO modificar el comentario ni la estructura del `try/catch` ni el contrato `if(!data||!realLen) return computeOriginal()`. Solo sustituir las 2 lecturas L815/L816.

| # | Archivo:Línea | Indentación | Contenido actual exacto | Sustitución propuesta |
|---|---|---|---|---|
| 10 | chartCoords.js:L9 | 2 esp | `const allData = window.__algSuiteSeriesData` | `const allData = getSeriesData()` |
| 11 | chartCoords.js:L11 | 2 esp | `const realLen = window.__algSuiteRealDataLen \|\| allData.length` | `const realLen = getRealLen() \|\| allData.length` |
| 12 | chartCoords.js:L89 | 4 esp | `const data = window.__algSuiteSeriesData` | `const data = getSeriesData()` |
| 13 | chartCoords.js:L96 | 4 esp | `const realLen = window.__algSuiteRealDataLen \|\| data.length` | `const realLen = getRealLen() \|\| data.length` |
| 14 | _SessionInner.js:L815 | 10 esp | `const data = window.__algSuiteSeriesData` | `const data = getSeriesData()` |
| 15 | _SessionInner.js:L816 | 10 esp | `const realLen = window.__algSuiteRealDataLen` | `const realLen = getRealLen()` |

**Cambio neto:** 0 líneas (6 sustituciones 1:1).

#### Imports nuevos a añadir

**En `lib/chartCoords.js`:**

Añadir import al inicio del archivo (probable que actualmente no tenga ningún import desde `lib/`):
```js
import { getSeriesData, getRealLen } from './sessionData'
```

> Path relativo: `chartCoords.js` está en `lib/`, `sessionData.js` también → `./sessionData`.

**En `components/_SessionInner.js`:**

`getSeriesData` y `getRealLen` se añaden al import existente (post-2a):

Antes (post-2a):
```js
import { fetchSessionCandles, setSeriesData, updateSeriesAt, setMasterTime, clearCurrentTime, getMasterTime } from '../lib/sessionData'
```

Después (post-2c):
```js
import { fetchSessionCandles, setSeriesData, updateSeriesAt, setMasterTime, clearCurrentTime, getMasterTime, getSeriesData, getRealLen } from '../lib/sessionData'
```

#### Actualización del comentario de cabecera de `chartCoords.js` (coste cero)

| # | Línea | Comentario actual | Comentario nuevo |
|---|---|---|---|
| 16 | L3 | ` * SOURCE OF TRUTH: window.__algSuiteSeriesData (real + phantom candles)` | ` * SOURCE OF TRUTH: getSeriesData() de lib/sessionData.js (real + phantom candles)` |

#### Lecturas que NO se tocan en 2c

Tras 2c, **no quedan lecturas de `__algSuite*` fuera de `lib/sessionData.js`**. Las únicas lecturas que persisten son:
- `lib/sessionData.js:L116` (lectura interna del módulo dueño, fuera de alcance — ver §6).
- Globales auxiliares `__chartMap`, `__algSuiteDebugLS`, `__algSuiteExportTools` (NO son cluster `__algSuite*` propiamente dicho — fase de limpieza separada).

#### Cuidado clave (orden de operaciones)

**chartCoords.js es función pura** invocada en hot path. Las 4 lecturas no tienen orden estricto entre sí (cada función `timeToLogical` y `fromScreenCoords` lee data + realLen una vez por invocación). La sustitución es 1:1 sin riesgo de orden.

**autoscaleInfoProvider** es callback síncrono pasado a LWC. El bloque L803–L833 tiene un `try/catch` deliberado con varios `return computeOriginal()` defensivos. NO tocar la estructura del bloque — solo sustituir las 2 lecturas dentro del `try` (L815/L816).

**Performance check post-2c (no obligatorio, recomendado):** durante las pruebas, abrir DevTools → Performance, grabar 5 segundos durante zoom/pan/play en M1, comparar contra el mismo flujo pre-2c. Esperado: 0 diferencia de frame rate (los getters son inline JIT). Si hay diferencia significativa (> 5%), investigar.

#### Pruebas manuales (Ramón)

> Cada prueba: dev limpio + Cmd+R + consola limpia.

0. **Baseline pre-2c (antes de tocar nada):** sesión "test code", H1, Cmd+R fresco. Snippet:
```js
({
  serLen: window.__algSuiteSeriesData?.length,
  realLen: window.__algSuiteRealDataLen,
  firstTime: window.__algSuiteSeriesData?.[0]?.time,
  lastRealTime: window.__algSuiteSeriesData?.[window.__algSuiteRealDataLen - 1]?.time,
  ct: window.__algSuiteCurrentTime
})
```
   Anotar 5 valores.

1. **Smoke post-2c:** misma sesión, mismo snippet. Los 5 valores **deben cuadrar al carácter** con baseline.

2. **autoscaleInfoProvider (test específico L815/L816):** Cmd+R fresco, zoom in/out con rueda del ratón en distintas zonas del chart, pan horizontal. Verificar:
   - El eje Y reescala suavemente sin crash.
   - No aparece el error `Cannot read properties of undefined (reading 'minValue')` que el comentario L807–L810 documenta como contrato roto.
   - El frame rate del zoom/pan es subjetivamente igual al pre-2c (sin tirones nuevos).

3. **chartCoords.timeToLogical (test específico L9/L11):** crear una drawing custom (ej. línea o rectángulo) en el chart. La drawing debe quedar anclada al timestamp donde se dibujó. Cambiar TF (M1 → H1 → M15 → H4 → M1). La drawing debe quedarse en el mismo timestamp/precio en cada cambio. Si se descoloca, **regresión de 2c** — la conversión `time → logical` está rota.

4. **chartCoords.fromScreenCoords (test específico L89/L96):** drag de un endpoint de una drawing custom existente. La drawing debe seguir el ratón sin saltos. Soltar en una vela visible: el endpoint debe quedar anclado a la vela exacta (no entre velas, no en el último real cuando hay phantoms al final).

5. **Drawings + autoscale combinado:** sesión con 5+ drawings dibujadas. Zoom + pan + cambio TF + cambio par. Las drawings deben mantenerse en posición correcta y el autoscale debe seguir funcionando sin errores.

6. **Performance subjetiva (no medida):** dar play en M1 a velocidad media-alta (×100 aprox). El chart debe avanzar fluido, sin tirones nuevos respecto a pre-2c. Si se nota más lento, posible overhead de los getters — investigar (revisar que el body sigue siendo trivial).

#### Señales de que algo se rompió

- Snippet baseline post-2c devuelve valores distintos a pre-2c → getter roto.
- Error nuevo: `Cannot read properties of undefined (reading 'minValue')` o similar en autoscale → contrato del block L815–L817 roto.
- Drawings se descolocan al cambiar TF (no se quedan en su timestamp/precio) → chartCoords.timeToLogical rota.
- Drawings drag salta o ancla en lugar incorrecto → chartCoords.fromScreenCoords rota.
- Frame rate subjetivamente peor durante zoom/pan/play → posible overhead inesperado de los getters (revisar body).
- Cualquier "Cannot read properties of null (reading 'length')" nuevo → guard `?? null` sin pasar a `|| data.length` correctamente.

#### Rollback

`git revert <hash-2c>`. Toca 2 archivos (`lib/chartCoords.js`, `components/_SessionInner.js`). Revert quirúrgico.

Si 2c falla de forma inesperada y 2a/2b ya están en main, el rollback de SOLO 2c es seguro: `getSeriesData`/`getRealLen` siguen exportadas y siendo usadas por RulerOverlay/KillzonesOverlay sin problema.

#### Validación final antes del commit

Mismo protocolo que 2a/2b.

#### Commit message sugerido

```
refactor(fase-2c): centralizar lectura de SeriesData/RealDataLen en hot path de render

- chartCoords.js: 4 lecturas (timeToLogical L9/L11, fromScreenCoords L89/L96)
  delegadas a getSeriesData()/getRealLen()
- _SessionInner.js: 2 lecturas en autoscaleInfoProvider (L815/L816)
  delegadas. Estructura del try/catch y comentario crítico preservados.
- Comentario de cabecera de chartCoords.js actualizado: SOURCE OF TRUTH
  pasa a getSeriesData() (no más mención del global por nombre desde
  consumers).
- Imports añadidos en chartCoords.js (nuevo) y extendidos en _SessionInner.js
- Sin cambios funcionales: baseline 5-valores cuadra al carácter, frame
  rate subjetivamente idéntico en zoom/pan/play.
- Tras 2c, lib/sessionData.js es el ÚNICO módulo que lee/escribe
  __algSuiteSeriesData / __algSuiteRealDataLen / __algSuiteCurrentTime
  (data layer cerrado).
```

---

## 4. Riesgos identificados y mitigaciones

> Ordenados por gravedad descendente.

### Riesgo 1 — Sustitución de L1218 (sub-fase 2a) rompe sync entre engines de pares distintos

**Síntoma:** al cambiar de par activo durante un replay, el par nuevo arranca en su `currentTime` antiguo en vez del masterTime → desincronización visible (chart del par nuevo en fecha distinta al chart del par anterior).

**Mitigación:** body de `getMasterTime()` es trivial (`return window.__algSuiteCurrentTime ?? null`), idéntico semánticamente a la lectura directa. La normalización `?? null` es idempotente con el patrón actual del L1218 (`const masterTime = window.__algSuiteCurrentTime` ya devuelve `undefined` si no hay valor; el código siguiente `if(masterTime && ...)` ya filtra falsy). Validación: prueba 2 de §3.1.

**Señal a Ramón:** par 2 arranca en su `date_from` o en `last_timestamp` propio en vez de seguir al par 1.

### Riesgo 2 — Overhead inesperado de getters en hot path (sub-fase 2c)

**Síntoma:** zoom/pan/play visibly más lento tras 2c. Posible aumento de presión GC.

**Mitigación:** body de los 3 getters debe ser **trivial** — una línea, sin validación añadida, sin logs, sin copia defensiva. Si Ramón en algún momento pide añadir lógica al body, evaluar si va a hot path o no.

**Señal a Ramón:** frame rate subjetivamente peor durante zoom/pan/play (prueba 6 de §3.3). Si se sospecha, abrir DevTools → Performance y comparar grabación pre-2c vs post-2c.

### Riesgo 3 — Olvidarse de cubrir alguna lectura

**Síntoma:** una lectura sigue accediendo a `window.__algSuite*` directamente tras 2c. Inconsistencia silenciosa: si el global se renombra o cambia de body en una fase futura, el consumer olvidado rompe.

**Mitigación:** después de la última edición de 2c, ejecutar:
```bash
grep -rn "window\.__algSuiteSeriesData\b" components/ pages/ lib/
grep -rn "window\.__algSuiteRealDataLen\b" components/ pages/ lib/
grep -rn "window\.__algSuiteCurrentTime\b" components/ pages/ lib/
```
Solo deben aparecer matches en `lib/sessionData.js` (escrituras + 1 lectura interna en L116). Cualquier otro match = consumer olvidado.

### Riesgo 4 — Romper el contrato del autoscaleInfoProvider (sub-fase 2c, L815/L816)

**Síntoma:** crash documentado en el comentario L807–L810: `Cannot read properties of undefined (reading 'minValue')`. Reproducible al BAJAR de TF: el realLen aún no está actualizado en el primer render.

**Mitigación:** sub-fase 2c sustituye SOLO las 2 lecturas (L815, L816). El contrato `if(!data||!realLen) return computeOriginal()` (L817) se mantiene idéntico. Los getters devuelven `null` en lugar de `undefined`, lo cual sigue cayendo en el `!data || !realLen` check (`!null` es `true`).

**Señal a Ramón:** error `Cannot read properties of undefined` nuevo al cambiar TF.

### Riesgo 5 — Imports circulares

**Síntoma:** `Cannot access 'X' before initialization` en runtime.

**Mitigación:** `lib/sessionData.js` no importa de `components/`. `lib/chartCoords.js` importa solo de `lib/sessionData.js` (otra pieza `lib/`, sin ciclo). Verificar con `npm run build` antes de cada commit.

### Riesgo 6 — Romper Vercel build

**Síntoma:** `npm run build` falla.

**Mitigación:** `npm run build` local antes del commit final de cada sub-fase (regla `fase-1-plan.md §8.1`).

### Riesgo 7 — Tocar inadvertidamente bugs B2/B3/B4/B5/B6

**Síntoma:** un bug pre-existente (drawings descolocadas en Review, TF reset al entrar Review, B4 challenge advance, 409 en session_drawings, plugin LWC se reinicializa) cambia de comportamiento.

**Mitigación:** alcance fase 2 es ESTRICTAMENTE lecturas del cluster `__algSuite*`. Ninguna sustitución debería afectar a esos bugs. Si Ramón observa cambio de comportamiento (mejor o peor) en cualquiera de B2–B6 durante las pruebas, **anotarlo** en `core-analysis.md §5` para fase 3+, sin intentar arreglarlo en fase 2.

---

## 5. Criterio de "fase 2 terminada"

La fase 2 está completa cuando se cumplen TODAS estas condiciones:

1. ✅ Sub-fases 2a, 2b y 2c comiteadas en `refactor/fase-2-data-layer`.
2. ✅ `lib/sessionData.js` exporta `getMasterTime()`, `getSeriesData()`, `getRealLen()` con bodies triviales y guards SSR.
3. ✅ `grep -rn "window\.__algSuiteSeriesData\b" components/ pages/ lib/` devuelve **solo** matches dentro de `lib/sessionData.js` (2 escrituras + 1 lectura interna L116, + 1 comentario en L3 de `lib/chartCoords.js` actualizado o eliminado en 2c).
4. ✅ Lo mismo con `__algSuiteRealDataLen` (solo 1 escritura en `lib/sessionData.js`, ningún consumer externo).
5. ✅ Lo mismo con `__algSuiteCurrentTime` (solo 2 escrituras en `lib/sessionData.js`, ningún consumer externo, ningún comentario externo lo menciona por nombre).
6. ✅ `npm run build` pasa.
7. ✅ Ramón ha probado manualmente las 3 sub-fases y reporta cero regresiones nuevas.
8. ✅ Los bugs B1–B6 (`HANDOFF-verificacion-A1.md §7`) y los 6 bugs del `CLAUDE.md §9` siguen exactamente como estaban (la fase 2 NO los pretende arreglar).
9. ✅ El data layer queda totalmente aislado en `lib/sessionData.js`. Ningún otro archivo del proyecto lee directamente del cluster `__algSuite*`.

---

## 6. Lista de NO HACER en la fase 2

> Cosas que es tentador tocar pero rompen el alcance. Si me veo haciéndolas, paro y aviso.

1. **NO** eliminar los globales `window.__algSuite*`. Decisión Ramón en `core-analysis.md §7`. Fase 2 mantiene el almacén global; solo prohíbe que consumers externos lo lean directamente.
2. **NO** tocar la lectura interna `lib/sessionData.js:L116` (`if (!window.__algSuiteSeriesData) return` dentro de `updateSeriesAt`). Es del módulo dueño del global; sustituirla por un getter sería ceremonia sin valor. Las lecturas internas dentro de `sessionData.js` son legítimas.
3. **NO** tocar los 3 globales auxiliares: `window.__chartMap`, `window.__algSuiteDebugLS`, `window.__algSuiteExportTools`. Catalogados como fase de limpieza separada en `HANDOFF.md §9`. NO cluster `__algSuite*` propiamente dicho.
4. **NO** introducir `getSeriesSnapshot()` (Opción I+) ni store reactivo (Opción II). Decisión §0.4. Si fase futura lo justifica, se añade entonces.
5. **NO** añadir validación, logs, ni copia defensiva al body de los getters. Deben quedar triviales (`() => window.__X ?? null`). Riesgo 2.
6. **NO** modificar la estructura del bloque autoscaleInfoProvider (`_SessionInner.js:L803–L833`). Solo sustituir las 2 lecturas L815/L816 dentro del `try`. NO tocar el `try/catch`, NO tocar los `return computeOriginal()` defensivos, NO tocar el comentario L804–L810 (excepto si Ramón lo pide explícitamente, no es el alcance por defecto).
7. **NO** atacar bugs B1–B6 ni los 6 bugs del `CLAUDE.md §9`. Ninguno vive en data layer. Si se observa cambio de comportamiento durante pruebas, anotar en `core-analysis.md §5` sin intentar arreglar.
8. **NO** tocar `lib/replayEngine.js`. Sigue intocable.
9. **NO** tocar drawings (`useDrawingTools.js`, `useCustomDrawings.js`, plugin LWC). Fase 5.
10. **NO** tocar viewport (gestión de visible range, `_savedRange`, `userScrolled`). Fase 3.
11. **NO** tocar render layer (`updateChart` lógica de phantoms, ramas de TF). Fase 4.
12. **NO** tocar el dominio trading (positions, orders, checks). Fase 6.
13. **NO** añadir tests automáticos. Decisión Ramón en `CLAUDE.md §5.4` — depende del momento, no es ahora.
14. **NO** introducir TypeScript ni cambiar a `app/` router.
15. **NO** instalar dependencias nuevas. Regla absoluta `CLAUDE.md §3.4`.
16. **NO** hacer migraciones de Supabase. Regla absoluta `CLAUDE.md §3.1`.
17. **NO** mergear nada a `main` durante la fase. Solo commits en `refactor/fase-2-data-layer`.
18. **NO** hacer push a GitHub. Regla absoluta `CLAUDE.md §3.2`.
19. **NO** documentar/comentar código que ya funciona "porque ya estoy aquí". Solo cambios funcionales necesarios + las 2 actualizaciones de comentarios L524/L566 que ya están listadas en §2.2 (y la cabecera L3 de chartCoords.js si se decide actualizar).
20. **NO** acoplar el plan a B4 (challenge advance) — fix B4 es sesión dedicada post fase 2 (`HANDOFF-verificacion-A1.md §5`).

---

## 7. Resumen ejecutivo (para que Ramón decida en 30 s)

- **3 sub-fases**, ~2 sesiones de trabajo, mergeables sueltas dentro de la rama.
- **0 archivos nuevos**: se extiende `lib/sessionData.js` con 3 getters triviales (~15 líneas con JSDoc).
- **5 archivos modificados**: `lib/sessionData.js`, `components/_SessionInner.js` (5 líneas: 3 lecturas + 2 comentarios), `lib/chartCoords.js` (4 lecturas + comentario cabecera), `components/RulerOverlay.js` (2 lecturas), `components/KillzonesOverlay.js` (2 lecturas).
- **0 cambios funcionales esperados**: los getters devuelven los mismos valores que las lecturas directas. Sistema debe verse y comportarse exactamente igual.
- **Decisión arquitectónica §0**: Opción I (getters triviales). Opción I+ y II descartadas. **Pendiente OK Ramón** antes de empezar.
- **Validación**: Ramón prueba manualmente cada sub-fase antes de pasar a la siguiente. **Antes de cada commit, le enseño el `git diff` completo y espero OK explícito**.
- **Rama**: `refactor/fase-2-data-layer`. A crear desde `main` HEAD `125ad4b` cuando el plan se apruebe. Sin push.
- **Cierre**: tras 2c, el data layer queda totalmente aislado en `lib/sessionData.js`. Fase 3 (viewport) puede arrancar limpia, sin acoplamiento residual al data layer.

---

## 8. Lecciones operativas (heredadas de fase 1 + nuevas)

Las lecciones §8.1, §8.2, §8.3, §8.4 del `fase-1-plan.md` aplican igual a fase 2 sin cambios. Se referencian aquí por completitud:

- **§8.1**: NUNCA `npm run build` con `npm run dev` corriendo sobre el mismo `.next/`. Protocolo en 6 pasos para validación pre-commit. Ver `fase-1-plan.md §8.1` para detalles. Aplica a las 3 sub-fases de fase 2.
- **§8.2**: Inventario de variables huérfanas ANTES de mover bloques entre módulos. **Aplicabilidad reducida a fase 2**: no hay movimiento de bloques, solo sustitución 1:1. NO se mueven variables. Lección registrada por completitud.
- **§8.3**: macOS no tiene `timeout` por defecto. `gtimeout` (brew install coreutils) o workaround bash. Aplica a fase 2 si se usa timeout en algún script de validación.
- **§8.4**: Comandos git como operaciones SEPARADAS, no encadenadas con `&&`. Granularidad de control. Aplica estrictamente a fase 2 — `git add` aparte, `git commit` aparte, `git log` aparte.

### 8.5 Inventarios siempre con grep -rn recursivo, nunca acotado a archivos esperados

> Lección retrospectiva añadida 30 abr 2026, originada en error del propio `fase-1-plan.md §2.3`.

El inventario "14 lecturas en 4 archivos" del `fase-1-plan.md §2.3` (commit `0180b6f`, 27 abr 2026) omitió `components/KillzonesOverlay.js`, que tenía 2 lecturas de `__algSuite*` en L177–L178 desde el commit `ae132d5` (26 abr 2026, 20 h antes del plan). El error fue acotar el grep a los archivos que ya se sospechaban, en lugar de barrer `components/ pages/ lib/` recursivamente. Resultado: KillzonesOverlay quedó fuera del alcance declarado de fase 2 hasta que la verificación previa al `fase-2-plan.md` (30 abr 2026) lo destapó.

**Norma:** todo inventario de globales/lecturas/escrituras se hace con `grep -rn <patrón> components/ pages/ lib/` (o equivalente recursivo) y se compara con cualquier listado existente. Si hay divergencia, **la divergencia es el inventario, no el grep.**

**Materialización operativa en fase 2:** §3.0 PASO 0 obliga a re-ejecutar los 3 greps recursivos justo antes del primer commit de sub-fase 2a, no antes de la aprobación del plan. Razón: `main` puede haber cambiado entre redacción del plan y arranque del primer commit; el grep es la única fuente de verdad en el momento del cambio.
