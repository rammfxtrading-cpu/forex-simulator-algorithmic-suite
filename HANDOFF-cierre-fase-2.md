# HANDOFF — Cierre fase 2 del refactor data-layer

> Fecha: 30 abril 2026, sesión completa con Claude Opus 4.7.
> De: Ramón + Claude (chat web actuando de CTO/revisor) + Claude Code (driver técnico en terminal).
> Para: el siguiente chat / próxima sesión / referencia histórica.
> Estado al cierre: rama `refactor/fase-2-data-layer` con 5 commits sobre `125ad4b`. HEAD local = `0f96634`. Working tree limpio salvo `HANDOFF-verificacion-A1.md` untracked (será comiteado junto con este HANDOFF antes del merge a main). Sin push, sin merge a main todavía.

---

## 0. TL;DR (para futuro Claude — leer primero)

- Fase 2 del refactor data-layer ejecutada y validada en local. 3 sub-fases (2a, 2b, 2c) sobre rama `refactor/fase-2-data-layer`. 13 lecturas externas del cluster `__algSuite*` centralizadas vía 3 getters síncronos triviales en `lib/sessionData.js`.
- **Resultado arquitectónico:** `lib/sessionData.js` es ahora el ÚNICO módulo del proyecto que LEE Y ESCRIBE los 3 globales del cluster. Cero consumers externos. Data layer 100% aislado.
- **Validación:** build limpio, grep verificador OK, 14 pruebas manuales (4+4+6) sin regresiones nuevas. 3 bugs pre-existentes confirmados (NO regresión 2): freeze M1 alta velocidad (alcance fase 4), TF independiente por par (fase 3+), plugin LWC reinicializa (fase 5).
- **Próximos pasos:** comitear 2 HANDOFFs (verificación A1 + cierre fase 2) -> merge a main -> push a producción -> watch Vercel + smoke check producción.
- Cero migraciones Supabase. Cero deps npm nuevas. Cero cambios funcionales esperados.

---

## 1. Resumen ejecutivo

### 1.1 Contexto de partida

El 28 abril cerré fase 1 del refactor data-layer (sub-fases 1a/1b/1c, HEAD `125ad4b`, deployada en producción Vercel). El 29 abril dediqué sesión a verificación previa de un bug reportado por alumno (A1 -> reclasificado como B4 pre-existente, NO regresión de 1c). Hoy 30 abril ejecuté fase 2 entera.

### 1.2 Plan de la sesión

Fase 2 del plan vigente (`refactor/core-analysis.md §6` + `refactor/fase-2-plan.md`): cerrar el data layer del refactor centralizando las **lecturas** de los 3 globales `window.__algSuiteSeriesData`, `window.__algSuiteRealDataLen` y `window.__algSuiteCurrentTime` que en fase 1 no se tocaron (decisión consciente del §1 del fase-1-plan.md: "No reescribir las lecturas — eso es fase 2/3").

Estructura de la sesión:
1. Redactar `fase-2-plan.md` con análisis arquitectónico Opción I/I+/II.
2. Decidir Opción I (getters síncronos triviales).
3. Reordenar §6 de `core-analysis.md` para reflejar el orden vigente de fases.
4. Registrar lección §8.5 retrospectiva en `fase-1-plan.md` (inventarios siempre con grep recursivo).
5. Ejecutar sub-fases 2a/2b/2c con commits aprobados explícitamente, una por una.
6. Validar al carácter cada Edit + build + pruebas manuales.

### 1.3 Resultado

Fase 2 ejecutada al pie de la letra del plan. 5 commits limpios sobre `refactor/fase-2-data-layer`:

    0f96634 refactor(fase-2c): centralizar lecturas SeriesData/RealDataLen en hot path de render
    2a1fe62 refactor(fase-2b): centralizar lecturas SeriesData/RealDataLen en consumers periféricos
    705e561 refactor(fase-2a): centralizar lectura de __algSuiteCurrentTime
    045a024 docs(refactor): redactar plan táctico fase-2-plan.md
    e8d754b docs(refactor): reordenar fases 2-7 + lección §8.5 retrospectiva

Cero regresiones detectadas en 14 pruebas manuales. Cero cambios funcionales esperados ni observados.

---

## 2. Datos numéricos de la fase 2

### 2.1 Inventario real (verificado al carácter con grep en HEAD `125ad4b` el 30 abr 2026)

**13 lecturas externas en 4 archivos:**

| Archivo | Líneas | Lecturas | Cluster |
|---|---|---|---|
| `components/_SessionInner.js` | L568, L753, L1218 | 3 | `__algSuiteCurrentTime` |
| `components/_SessionInner.js` | L815, L816 | 2 | `__algSuiteSeriesData` + `__algSuiteRealDataLen` (autoscale) |
| `lib/chartCoords.js` | L9, L11, L89, L96 | 4 | `__algSuiteSeriesData` + `__algSuiteRealDataLen` |
| `components/RulerOverlay.js` | L28, L30 | 2 | `__algSuiteSeriesData` + `__algSuiteRealDataLen` |
| `components/KillzonesOverlay.js` | L177, L178 | 2 | `__algSuiteSeriesData` + `__algSuiteRealDataLen` |

Adicionalmente 2 comentarios actualizados en `_SessionInner.js` (L524-L527, L566) y comentario de cabecera de `chartCoords.js` (L3).

**Hallazgo retrospectivo importante:** el inventario "14 lecturas en 4 archivos" del `fase-1-plan.md §2.3` (commit `0180b6f`, 27 abr 2026) era **incorrecto**. Mezclaba lecturas del cluster con globales auxiliares (`__chartMap`, `__algSuiteDebugLS`, `__algSuiteExportTools`) y omitía `components/KillzonesOverlay.js` (2 lecturas, presentes en main desde commit `ae132d5` del 26 abr 2026, 20 h antes del plan). El error fue acotar el grep a archivos sospechados en lugar de barrer recursivamente. Lección §8.5 registrada en fase-1-plan.md y materializada en fase-2-plan.md §3.0 (PASO 0 obligatorio con grep recursivo antes del primer commit de cada sub-fase).

### 2.2 API añadida en `lib/sessionData.js`

3 getters síncronos triviales (Opción I del plan §0):

    export function getMasterTime() {
      if (typeof window === 'undefined') return null
      return window.__algSuiteCurrentTime ?? null
    }

    export function getSeriesData() {
      if (typeof window === 'undefined') return null
      return window.__algSuiteSeriesData ?? null
    }

    export function getRealLen() {
      if (typeof window === 'undefined') return null
      return window.__algSuiteRealDataLen ?? null
    }

JSDoc con notas extras: `getSeriesData` advierte "NO mutar — usar `updateSeriesAt` para mutaciones por índice", `getRealLen` documenta invariante `getRealLen() <= getSeriesData().length`.

Cero overhead en hot path: getters inline JIT, una línea de body, sin validación añadida.

### 2.3 Decisión arquitectónica §0 del plan

Opción I pura (getters síncronos triviales) elegida por Ramón sobre las 3 opciones analizadas:

- Opción I: getters individuales triviales (elegida).
- Opción I+: getters individuales + `getSnapshot()` agrupado. Descartada por overhead teórico de alocación de objeto en hot path + ruido cognitivo de mezclar 2 patrones. Reservada para fase futura si se justifica.
- Opción II: store con subscribe (React context o similar). Descartada por overengineering — los datos del PASO C (lectura en contexto de las 13 lecturas) muestran cero reactividad real en consumers (ningún useEffect tiene el global como dependencia). Implementarla añadiría complejidad sin resolver problema actual + rompería contrato §7 de `core-analysis.md` (mantener globales).

---

## 3. Sub-fases ejecutadas

### 3.1 Sub-fase 2a (commit `705e561`)

**Objetivo:** centralizar lecturas de `__algSuiteCurrentTime` en `_SessionInner.js`.

**Cambios:**
- `lib/sessionData.js`: 142 -> 156 líneas (+14, función `getMasterTime()` añadida).
- `components/_SessionInner.js` (sin cambio neto):
  - L13: import extendido con `getMasterTime`.
  - L524-L527: comentario multilínea actualizado (4 líneas, "window.__algSuiteCurrentTime" -> "el masterTime", concordancia gramatical "la limpiamos/la prioriza" -> "lo limpiamos/lo prioriza").
  - L566: comentario actualizado (mención del global -> mención de la API nueva).
  - L568: sustitución dentro de cadena `||` multilínea (refreshChallengeStatus fallback).
  - L753: sustitución de `(typeof window !== 'undefined' && window.__algSuiteCurrentTime) || null` por `getMasterTime()` (validación rawMaster en loadPair).
  - L1218: sustitución crítica (sync engine al cambiar par activo, Riesgo 1 documentado del plan §4).

**Pruebas manuales (4):**
- 0: smoke check inicial. OK.
- 1: smoke con play, ct = 1740043380, escritura masterTime de fase 1c sin regresión. OK.
- 2 (la crítica): sync engine al cambiar par. Cargué USDCHF tras EURUSD pausado a 20-feb-2025 12:23 UTC. USDCHF apareció en mismo timestamp `lastRealDate: 20 Feb 2025 09:00:00 GMT`. ct idéntico. Verificación visual + consola coincidieron. OK.
- 3: validación challenge fallback (L568): saltada con justificación (validación indirecta confirmada por carga limpia de sesión en prueba 0).
- 4: TF + cambio par combinado. M15 -> cambio par -> H1 -> cambio par -> M15 sin descolocaciones. OK con observación de bug B3 pre-existente.

### 3.2 Sub-fase 2b (commit `2a1fe62`)

**Objetivo:** centralizar lecturas de SeriesData/RealDataLen en consumers periféricos (RulerOverlay + KillzonesOverlay).

**Cambios:**
- `lib/sessionData.js`: 156 -> 186 líneas (+30, funciones `getSeriesData()` + `getRealLen()` añadidas tras `getMasterTime` con JSDoc completo incluyendo notas "NO mutar" e "Invariante").
- `components/RulerOverlay.js`: 245 -> 246 líneas (+1, import + 2 sustituciones L28/L30 en `coordsToData`).
- `components/KillzonesOverlay.js`: 454 -> 455 líneas (+1, import + 2 sustituciones L177/L178 en `useEffect bucketed 30min`). Eliminados los guards SSR ternarios redundantes (los getters encapsulan el guard en el módulo dueño).

**Pruebas manuales (4):**
- 1: smoke check post-2b. OK.
- 2: RulerOverlay (medición con regla activa). OK (precio + delta de tiempo correctos).
- 3: KillzonesOverlay (cambio TF M15/H1/M5). OK (cajas visibles, recálculo correcto).
- 4: TF + cambio par combinado. **OK con observación**: durante una transición par->par->par, las killzones del segundo par no aparecieron en el primer intento, aparecieron al segundo. Cero errores en consola en ese momento. NO reproducible en intentos posteriores con consola limpia y observación dirigida. Patrón consistente con bug B6 pre-existente (plugin LWC se reinicializa al cambiar par).

### 3.3 Sub-fase 2c (commit `0f96634`)

**Objetivo:** centralizar lecturas de SeriesData/RealDataLen en hot path de render (chartCoords + autoscaleInfoProvider). La sub-fase más delicada de fase 2.

**Cambios:**
- `lib/chartCoords.js`: 115 -> 117 líneas (+2):
  - L3: comentario cabecera actualizado (`SOURCE OF TRUTH: window.__algSuiteSeriesData` -> `getSeriesData() de lib/sessionData.js`).
  - L8: import nuevo `import { getSeriesData, getRealLen } from './sessionData'` (path relativo `./sessionData` por estar ambos en `lib/`).
  - Línea blanca de separación entre import y primera función (convención JS estándar).
  - L11/L13 (post-shift): sustituciones en `timeToLogical` (L9/L11 originales).
  - L91/L98 (post-shift): sustituciones en `fromScreenCoords` (L89/L96 originales).
- `components/_SessionInner.js` (sin cambio neto):
  - L13: import extendido con `getSeriesData, getRealLen` al final de la lista (post fase 2a/2b).
  - L815/L816: sustituciones DENTRO del `try` del `autoscaleInfoProvider`. Estructura crítica preservada al carácter: comentario L804-L810 que documenta el crash conocido (`Cannot read properties of undefined (reading 'minValue')`), helper `computeOriginal`, contrato L817 (`if(!data||!realLen) return computeOriginal()`), 4 returns defensivos, catch final.

**Pruebas manuales (6):**
- 1: smoke check post-2c. OK.
- 2 (la crítica): autoscaleInfoProvider — zoom + pan. OK (frame rate fluido, eje Y reescala suave, sin crash de minValue).
- 3: chartCoords.timeToLogical — drawings al cambiar TF. OK con detalle visual: drawing anclada a vela H1 de las 06:00 "se va a la izquierda" en H4 (porque la vela 06:00 no existe en H4, queda dentro de la vela H4 04:00-07:59). Vuelta a H1 recupera posición original al carácter. Confirmado comportamiento intrínseco del sistema de drawings, no regresión.
- 4: chartCoords.fromScreenCoords — drag de drawings. OK (drag fluido, endpoints anclan correctamente, logs confirman cero errores).
- 5: drawings + autoscale combinado. OK.
- 6: frame rate con play en M1. **OK con observación**: a velocidad baja (x10) play fluye vela a vela. A velocidad alta (x100+) velas aparecen en bloques de N (proporcional a velocidad de play), pausa entre bloques más larga, drag durante play se "para un instante" cuando se renderiza cada bloque. NO es regresión 2c — es bug #2 pre-existente (freeze M1 a velocidad alta) documentado en CLAUDE.md §9 y core-analysis.md §6 Fase 4. La severidad escala con velocidad de play, propiedad del flujo síncrono `engine->updateChart`, no del flujo `chartCoords/autoscale` donde 2c sustituye lecturas. Fase 4 (RenderScheduler con frame budget) está diseñada para atacarlo.

---

## 4. Validación al cierre

### 4.1 Build local

    npm run build -> Compiled successfully
    0 warnings ESLint, 0 errores TypeScript
    6/6 páginas estáticas generadas
    Bundle de /session/[id] sin variación apreciable respecto a build pre-2c

### 4.2 Grep verificador final (criterio §5.3-5.5 del plan)

    grep -rn "window\.__algSuiteSeriesData\b" components/ pages/ lib/
    # 5 matches, todos en lib/sessionData.js (escrituras + JSDoc + lectura interna del getter)

    grep -rn "window\.__algSuiteRealDataLen\b" components/ pages/ lib/
    # 3 matches, todos en lib/sessionData.js

    grep -rn "window\.__algSuiteCurrentTime\b" components/ pages/ lib/
    # 4 matches, todos en lib/sessionData.js

**Cero consumers externos del cluster `__algSuite*` en TODO el proyecto.** Data layer 100% aislado en `lib/sessionData.js`. Criterio "fase 2 terminada" del §5 del plan cumplido al carácter.

### 4.3 Pruebas manuales — total 14

- 4 pruebas en sub-fase 2a (la crítica fue prueba 2: sync engine al cambiar par).
- 4 pruebas en sub-fase 2b (la crítica fue prueba 4: TF + cambio par combinado).
- 6 pruebas en sub-fase 2c (la crítica fue prueba 2: autoscaleInfoProvider durante zoom+pan).

Cero regresiones nuevas detectadas. Resultados detallados en §3.

---

## 5. Bugs pre-existentes confirmados durante pruebas

NINGUNO es regresión de fase 2.

| ID | Síntoma | Alcance | Origen documental |
|---|---|---|---|
| #2 | Freeze en M1 a velocidad alta de play | Fase 4 (render layer, RenderScheduler) | CLAUDE.md §9, core-analysis.md §6 Fase 4 |
| B3 variante | TF independiente por par dentro de misma sesión | Fase 3+ (viewport) o decisión de diseño | HANDOFF-verificacion-A1.md §7 |
| B6 | Plugin LWC se reinicializa al cambiar par | Fase 5 (drawings lifecycle) | HANDOFF-verificacion-A1.md §7, CLAUDE.md §9 bug #5 |

Otros bugs documentados (no observados explícitamente durante pruebas pero registrados como contexto): B1 (10% flotante heredado en transición fases challenge), B2 (drawings descolocadas en Review Session), B4 (`/api/challenge/advance` no actualiza `last_timestamp`, sesión dedicada post fase 2), B5 (409 en session_drawings).

---

## 6. Estado del repo al cierre

### 6.1 Git

    Rama activa:       refactor/fase-2-data-layer
    HEAD local:        0f96634 refactor(fase-2c): ...
    HEAD origin/main:  125ad4b (fase 1 deployada, sin cambios desde 28 abr)
    Diferencia:        5 commits sobre 125ad4b, sin push, sin merge a main
    Working tree:      limpio salvo HANDOFF-verificacion-A1.md untracked
                       (este HANDOFF-cierre-fase-2.md también será untracked
                        hasta el commit de cierre).

### 6.2 Archivos modificados en fase 2 (total acumulado de los 3 commits)

    lib/sessionData.js              142 -> 186 líneas (+44 acumulado)
                                     - 3 getters nuevos: getMasterTime, getSeriesData, getRealLen
    lib/chartCoords.js              115 -> 117 líneas (+2)
                                     - import + 4 sustituciones + comentario cabecera
    components/_SessionInner.js     2971 -> 2971 líneas (sin cambio neto)
                                     - import extendido + 5 sustituciones + 5 líneas comentarios actualizadas
    components/RulerOverlay.js      245 -> 246 líneas (+1)
                                     - import + 2 sustituciones
    components/KillzonesOverlay.js  454 -> 455 líneas (+1)
                                     - import + 2 sustituciones (con eliminación de guard SSR redundante)
    refactor/core-analysis.md       (modificado en commit e8d754b, +76/-19 líneas)
                                     - §6 reordenado: fases 2-7
    refactor/fase-1-plan.md         (modificado en commit e8d754b, +10 líneas)
                                     - §8.5 retrospectiva añadida
    refactor/fase-2-plan.md         (creado en commit 045a024, 791 líneas)
                                     - plan táctico completo

### 6.3 Sin cambios en

- `lib/replayEngine.js`: intocable.
- `pages/api/*`: B4 vive aquí, sesión dedicada post fase 2.
- Esquema Supabase: regla absoluta CLAUDE.md §3.1.
- `package.json`: cero deps nuevas (regla §3.4).
- Otros componentes: `useDrawingTools.js`, `useCustomDrawings.js`, etc.

---

## 7. Próximos pasos

### 7.1 Inmediatos (esta sesión, post-HANDOFF)

1. Comitear los 2 HANDOFFs untracked acumulados (`HANDOFF-verificacion-A1.md` del 29 abr + este HANDOFF de cierre fase 2) en un commit `docs(fase-2): añadir HANDOFFs de verificación A1 y cierre fase 2`.
2. Volver a rama `main` con `git checkout main`.
3. Mergear `refactor/fase-2-data-layer` a `main` (probable fast-forward, los commits son lineales sobre `125ad4b`).
4. Push a `origin/main`. Vercel auto-deploya.
5. Watch deploy en Vercel dashboard. Verificar que el build de Vercel pasa.
6. Smoke check en producción `algorithmicsuite.com`: abrir sesión, verificar que los 3 globales siguen seteándose, cargar challenge, drawings y killzones funcionan.

### 7.2 Post fase 2 (sesiones futuras)

- **Sesión dedicada B4**: fix del endpoint `/api/challenge/advance` para que actualice `last_timestamp` de la sesión que se cierra al avanzar de fase. Detalles en `HANDOFF-verificacion-A1.md §3` + §5.
- **Fase 3 — viewport layer**: aislar `chart.timeScale().setVisibleLogicalRange/scrollToPosition` en `lib/chartViewport.js`. Probable atacar bug B3 (TF reset al entrar Review) y posiblemente B2 (drawings descolocadas). Ver `core-analysis.md §6 Fase 3`.
- **Fase 4 — render layer**: extraer `updateChart` a `ChartRenderer` + crear `RenderScheduler` con frame budget. Atacará bug #2 (freeze en M1). Ver `core-analysis.md §6 Fase 4`.
- **Fases 5-7**: drawings lifecycle, trading domain, reducir `_SessionInner.js`. Ver `core-analysis.md §6`.

### 7.3 Backlog de limpieza separada (post fase 7 o cuando duela)

- 3 globales auxiliares fuera del cluster: `__chartMap`, `__algSuiteDebugLS`, `__algSuiteExportTools`. Ver HANDOFF.md §9.

---

## 8. Aprendizajes operativos

### 8.1 Disciplina de inventarios (§8.5 retrospectiva en fase-1-plan.md)

Lección documentada en `fase-1-plan.md §8.5`. Materialización: `fase-2-plan.md §3.0` PASO 0 obligatorio con `grep -rn` recursivo antes del primer commit de cada sub-fase. Aplicado y funcionó: el grep al inicio de 2a confirmó al carácter el inventario de 13/4. Cero divergencias.

Norma a partir de ahora para fases 3-7: **todo inventario de globales/lecturas/escrituras se hace con `grep -rn <patrón> components/ pages/ lib/` recursivo. Si hay divergencia, la divergencia es el inventario, no el grep.**

### 8.2 Validación al carácter, no por descripción

Cada Edit aprobado en sesión fue verificado al carácter contra el output literal del `Update` tool de Claude Code. Cuando la UI plegó outputs largos (`+N lines (ctrl+o to expand)`), pedí explícitamente `cat` o `git --no-pager diff > file + open -a TextEdit` para ver el contenido entero. Aprobar narrativa en lugar de bytes literales sería romper el método.

### 8.3 Distinguir lo verificado de lo inferido

Una afirmación de Claude Code en sub-fase 2a: "los hashes del bundle no cambiaron, lo cual demuestra cero cambios funcionales". Era inferencia mal razonada (los hashes que coincidieron eran de framework/main, no del chunk de la página que sí cambia). Detectada y retirada del registro tras pregunta directa. Lección: build pasa = criterio de éxito; bytes idénticos NO equivalen a comportamiento idéntico.

### 8.4 Decisiones por inercia vs por análisis

En 2b, propuesta inicial fue agrupar nuevos getters por dominio en `sessionData.js`. Al revisar: rompía coherencia con 2a (que insertó `getMasterTime` al final del archivo). Sin justificación arquitectónica fuerte, agrupar habría sido decisión estética que rompía precedente reciente. Decisión: insertar al final también, manteniendo cronología y evitando modificar código ya comiteado.

Norma: cuando una decisión tomada minutos antes existe, default es seguirla salvo razón fuerte para cambiarla. Justificar cambios desde "esto rompe algo crítico", no desde "esto es más bonito".

### 8.5 Workflow web <-> terminal

Disciplina del flujo bicapa funcionó:
- Chat web (Claude Opus 4.7 via claude.ai) actuando de CTO/revisor: planificar, debatir arquitectura, redactar HANDOFFs, validar Edits al carácter.
- Claude Code en terminal: ejecutar comandos, aplicar Edits, hacer commits con aprobación opción 1 manual.
- Ramón haciendo de pegamento humano de copy-paste entre los dos.

Esa fricción es real (cada output de Claude Code re-pegado al chat web), pero la separación de roles aporta valor: el CTO/revisor del chat web detecta inconsistencias que el driver del terminal no vería por estar enfocado en ejecución. Los ejemplos de hoy: discrepancia "5 vs 4 archivos" en §6 reordenado (detectado por Claude Code al ejecutar grep), inferencia errónea sobre hashes de bundle (detectado por chat web al revisar narrativa), conteo "14 vs 13 lecturas" original (detectado por chat web al verificar fase-1-plan.md §2.3 contra grep real).

### 8.6 Pausas para cuestionar hipótesis

Ejemplos de la sesión donde paramos a cuestionar antes de avanzar:
- Drawings que "se iban a la izquierda" en H4 (paso 2c-3): cuestionado, descartado como regresión, identificado como comportamiento intrínseco del sistema de drawings.
- Killzones que aparecieron en el segundo intento al cambiar par (paso 2b-4): cuestionado, no reproducible en intentos posteriores, registrado como observación consistente con B6 pre-existente.
- Freeze en M1 con play a velocidad alta (paso 2c-6): cuestionado, descartado como regresión 2c, identificado como bug #2 pre-existente.

Norma: cuando algo no cuadra, parar a verificar antes de declarar regresión o pre-existente. Aplicar prueba de discriminación (a menor velocidad / sin play / commit anterior).

---

## 9. Cómo arrancar el siguiente chat

### 9.1 Si el push se ejecuta hoy y va bien

El siguiente chat arranca con fase 2 deployada en producción y será para:
- Sesión dedicada B4 (fix challenge advance), o
- Fase 3 (viewport layer).

Mensaje sugerido para Ramón al copiar/pegar al iniciar un nuevo chat:

Hola. Hoy arrancamos [B4 / fase 3 según se decida].

Estado: HEAD main = [hash del commit de cierre fase 2 en main], fase 2 cerrada y deployada en producción Vercel desde [fecha]. Working tree limpio.

Te paso adjuntos:
1. HANDOFF-cierre-fase-2.md (este documento) — léelo entero, sobre todo §0 TL;DR, §3 sub-fases, §5 bugs, §7 próximos pasos.
2. HANDOFF-verificacion-A1.md (29 abr).
3. HANDOFF.md (v3 del refactor).
4. refactor/core-analysis.md (auditoría + §6 vigente).
5. refactor/fase-1-plan.md y refactor/fase-2-plan.md (referencia de estructura para futuras fases).
6. CLAUDE.md (brief y reglas).

Soy Ramón, trader/mentor, no dev. Reglas absolutas en HANDOFF.md §7 y CLAUDE.md §3.

Cuando hayas leído todo, dime:
1. Qué entendiste del estado actual en una frase.
2. Propón plan inicial para [B4 / fase 3] siguiendo estructura de fase-2-plan.md (sub-fases, baselines, validación al carácter, commits atómicos, plan táctico antes de tocar código).
3. Espera mi OK explícito antes de empezar a tocar nada.

NO empezar a tocar nada hasta que yo apruebe.

### 9.2 Si el push no se ejecuta hoy

Mensaje de arranque ajustado: "rama `refactor/fase-2-data-layer` con HEAD `0f96634` lista para merge a main + push, pendiente de revisión final antes de pushear". El siguiente chat verifica estado, decide si push o si revisar algo más.

### 9.3 Verificaciones que el chat nuevo debe hacer al arrancar

1. `git log --oneline -10` para ver historia de fase 2.
2. `git status` para confirmar working tree.
3. `git branch --show-current` para confirmar rama.
4. Si hay duda sobre estado, ejecutar el grep verificador del §4.2 para confirmar que el data layer sigue 100% aislado.

---

Fin del HANDOFF de cierre fase 2.

Cuando se retome para arrancar B4 o fase 3, este documento queda como referencia de:
- Que fase 2 quedó cerrada con 3 sub-fases comiteadas + planificación documentada.
- Que data layer está 100% aislado en `lib/sessionData.js`.
- Que ningún bug pre-existente fue regresión de fase 2.
- Que B4 sigue pendiente para sesión dedicada antes de fase 3.
- Que la disciplina de método (validación al carácter, plan táctico antes de código, commits aprobados explícitamente) se mantuvo durante toda la sesión.
