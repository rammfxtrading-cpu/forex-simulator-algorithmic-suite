# HANDOFF — cierre sesión 16

> Fecha: 4 mayo 2026, sesión "simulador 16" (~3.5h).
> Autor: Claude Opus 4.7 (CTO/revisor) + Claude Code (driver técnico) + Ramón Tarinas (pegamento humano).
> Estado al redactar: `origin/main` = `1d5865d` (script de auditoría) sobre `5cef4e7` (HANDOFF sesión 15). Working tree limpio salvo este HANDOFF untracked.

---

## §1 — Contexto y resumen ejecutivo

Sesión 16 con dos objetivos planificados al arranque (plan §11 prompt sesión 16):

- **Opción A:** verificación de los 6 pares × año 2026 frente a Dukascopy para descartar patrón sistemático del bug 5.2.
- **Opción C:** deuda 5.1 (UX viewport — mantener vista al cambiar TF + atajo Opt+R/Alt+R), petición explícita de Ramón al cierre de sesión 15.

**Resultado:**

- ✅ **Opción A cerrada limpiamente.** Los 6 pares 2026 limpios en Dukascopy. Bug 5.2 confirmado como específico de EUR/USD, no patrón sistemático. Script de auditoría `scripts/audit-pares-2026.js` comiteado a `main` como patrimonio reutilizable (commit `1d5865d`).
- ❌ **Opción C abierta sin cerrar — regresión nueva detectada.** El fix implementado (3 funciones nuevas en `lib/chartViewport.js` + integración en handler de cambio de TF en `_SessionInner.js`) cumplió el objetivo principal (vista se mantiene al cambiar TF estilo TradingView) pero **introdujo regresión en el render de Killzones** durante el cambio de TF. Revertido al carácter desde shell de Ramón. Estado de `main` idéntico al pre-sesión-C salvo el commit del script de auditoría.

**Estado de runtime en producción:** intacto. El push de hoy (`1d5865d`) es script standalone que no entra en webpack ni se ejecuta en runtime. Vercel re-deployará idempotentemente (cero cambios en `pages/`, `lib/`, `components/`). Smoke producción NO requerido.

---

## §2 — Lo que se hizo (técnico)

### §2.1 Sub-Op A — Verificación pares 2026 ✅ CERRADA

**Sub-Op A.0 — Inventario al carácter del script existente:** `cat scripts/test-redownload-2026.js` reveló script inocuo de 136 líneas creado en sesión 15 para diagnosticar deuda 5.2. Funciones reutilizables: `downloadWithRetry`, `countCandlesPerDay`, `detectGaps`, tabla `THRESHOLD_BY_WEEKDAY` con umbrales por día calibrados.

**Sub-Op A.1 — Decisión de scope:** Ramón eligió **A1 (descargar Dukascopy fresco a `/tmp/` para los 6 pares × 2026, sin tocar Supabase)**. Coherente con prompt §11. CTO había propuesto opciones A1/A2/A3; Ramón razonó correctamente que A1 cubre el 100% del caso de decisión: si Dukascopy limpio para los 6, tenemos candidatos a sustitución bucket cuando decidamos; si tiene huecos, agujero de fuente y decisión separada. A2 (leer bucket) y A3 (comparar) descartadas como scope creep.

**Sub-Op A.2 — Diseño:** adaptación a 6 pares con loop secuencial, try/catch por par, output individual a `/tmp/<pair>-2026-test.json` y resumen consolidado a `/tmp/audit-pares-2026-summary.json`. Predicción CTO: ~155 líneas. Real: 174 líneas. Error §9.4 mío: subestimé tamaño en ~12%.

**Sub-Op A.3 — Implementación:** Edit con Claude Code (Write directo a archivo), aprobación opción 1 manual de Ramón. `wc -l` = 174 ✓. `head -20` confirmó cabecera, imports, constantes. `grep "supabase"` confirmó cero referencias en código (solo 2 hits en comentarios/strings de log).

**Sub-Op A.4 — Ejecución:** `node scripts/audit-pares-2026.js` corrió secuencialmente los 6 pares, ~40s/par, total ~4 min. Cero errores, cero retries activados.

**Sub-Op A.5 — Resultado consolidado al carácter:**

| Par | Velas | Días | "Agujeros" | Estado real |
|---|---|---|---|---|
| EURUSD | 124 721 | 124 | 2 | Limpio (1 ene festivo + 4 may día parcial) |
| GBPUSD | 124 552 | 124 | 2 | Limpio (idem) |
| AUDUSD | 124 627 | 124 | 2 | Limpio (idem) |
| NZDUSD | 124 533 | 124 | 2 | Limpio (idem) |
| USDCAD | 124 583 | 124 | 2 | Limpio (idem) |
| USDCHF | 124 411 | 124 | 2 | Limpio (idem) |

Los 2 "agujeros" detectados por par son **falsos positivos esperados** (no datos faltantes):

1. `2026-01-01` (jueves) ~104-119 velas / umbral 1200 → festivo de Año Nuevo, mercado forex prácticamente cerrado. Idéntico al patrón EUR/USD 2026 documentado en sesión 15.
2. `2026-05-04` (lunes) 1078-1080 velas / umbral 1200 → día parcial actual cuando se ejecutó el script (~19:00 UTC). Mañana desaparece del informe.

**Coherencia entre pares:** volúmenes alineados (124k-125k velas/par, 12.4-12.6 MB/par). Cero divergencias estructurales. Dukascopy entregó datasets coherentes para los 6.

**Decisión:** ningún par requiere cirugía quirúrgica. Sub-Op A.5 cerrada en LIMPIO. Bug 5.2 confirmado específico de EUR/USD 2026, no patrón sistemático.

**Commit:** `1d5865d chore(audit): script de auditoria de 6 pares 2026 desde Dukascopy` (1 archivo, +174 líneas, push aprobado).

### §2.2 Sub-Op C — Deuda 5.1 UX viewport ❌ ABIERTA (revertida)

**Sub-Op C.A — PASO 0 inventario al carácter:**

`wc -l lib/chartViewport.js components/_SessionInner.js` → 202 / 2962 líneas.

`grep` de viewport en `chartViewport.js` confirmó: 1 lectura `getVisibleLogicalRange` (L46), 4 escrituras `setVisibleLogicalRange` (L73, L97, L139, L155), 1 escritura `scrollToPosition` (L180). Todas trabajan con **logical range (índices)**, ninguna con timestamps temporales.

`grep` de cambio TF en `_SessionInner.js` confirmó handler en L1154-L1192 usando `prevTfRef`, `deselectAll`, `computePhantomsNeeded` (L1178), `updateChart`, `setTfKey`, **`scrollToTail(cr, 8, () => setChartTick(t => t+1))` en L1189**. Esa última línea identificada como **causa raíz** del síntoma reportado por Ramón ("al cambiar TF el gráfico se va lejos") — `scrollToTail` fuerza scroll al final independientemente del rango temporal previo.

**Sub-Op C.B — Diseño API (3 funciones nuevas en `lib/chartViewport.js`):**

1. `captureSavedTimeRange(cr)` → devuelve `{from, to}` timestamps Unix vía `getVisibleRange()` (no Logical). Equivalente temporal de `captureSavedRange` existente.
2. `restoreSavedTimeRange(cr, savedTimeRange)` → `setVisibleRange(savedTimeRange)` con patrón doble rAF + flag `isAutoSettingRange`. Degradación segura si `savedTimeRange` es `null`.
3. `resetViewportToDefault(cr, tf, aggLength)` → wrapper sobre `initVisibleRange` por claridad semántica del call site del atajo Opt+R (sub-Op D pendiente).

**Decisión Ramón sobre comportamiento:** **A — TradingView puro** (mantener rango temporal idéntico al cambiar TF, asumiendo caso esquina M1→D1 con 0-1 velas visibles, mitigado por atajo Opt+R en sub-Op D futura).

**Sub-Op C.C — Implementación de API en `chartViewport.js`:**

Edit aplicado con Claude Code (opción 1 manual). `wc -l` = 257 ✓. Build verde ✓. Las 3 funciones nuevas fueron auditadas al carácter pre-aprobación.

**Sub-Op C.D — Integración en `_SessionInner.js`:**

3 Edits aplicados con Claude Code (opción 1 manual):
- Edit A: import de `captureSavedTimeRange`, `restoreSavedTimeRange` en L14 (no se importó `resetViewportToDefault` — generaría warning unused-vars hasta sub-Op D).
- Edit B: insertar `const _savedTimeRange = captureSavedTimeRange(cr)` antes del bloque `deselectAll` (con comentario explicativo).
- Edit C: sustituir `scrollToTail(cr, 8, () => setChartTick(t => t+1))` (L1189) por `requestAnimationFrame(() => restoreSavedTimeRange(cr, _savedTimeRange))` + `setChartTick(t => t+1)` (con comentario explicativo del doble rAF preventivo).

`wc -l` post-Edit = 2975 ✓. Build verde ✓.

**Sub-Op C.E — Smoke local (`npm run dev`):**

✅ **Objetivo principal cumplido al carácter:** vista se mantiene al cambiar TF (M5 → M15, M1 → H1, etc.). Captura de pantalla de Ramón confirma EUR/USD M5 sobre rango 31 dic 2025 → 6 ene 2026 con vista correcta.

❌ **Regresión nueva detectada por Ramón en la captura:** rectángulos de Killzones aparecen **descolocados** en la zona izquierda del chart. Múltiples Killzones con anclaje de coordenadas roto. Ramón verificó al carácter que **NO ocurría en producción** (`5cef4e7`, sin fix). Causalidad confirmada por test producción vs local.

**Hipótesis técnica del bug Killzones (no verificada al carácter, pendiente de diagnóstico en sesión 17):** las Killzones son overlay HTML que se posicionan leyendo viewport actual del chart vía `chartTick`. En el código original, `setChartTick(t => t+1)` se disparaba **dentro del callback del 2º rAF de `scrollToTail`** — Killzones recalculaban con viewport ya estable. El fix nuevo dispara `setChartTick` **inmediatamente fuera del rAF** mientras `restoreSavedTimeRange` aún no aplicó el viewport → Killzones recalculan con viewport intermedio (autoreposicionamiento de LWC tras `setData`) → quedan ancladas a viewport que se sustituirá 2 frames después → descolocadas.

**Mitigación candidata (NO aplicada hoy, pendiente verificación al carácter en sesión 17):** mover `setChartTick(t => t+1)` dentro del rAF, después del restore. Patrón:

```js
requestAnimationFrame(() => {
  restoreSavedTimeRange(cr, _savedTimeRange)
  setChartTick(t => t+1)
})
```

**Decisión cierre Sub-Op C:** Ramón eligió revertir y dejar deuda 5.1 abierta para sesión 17 con cabeza fresca. Decisión profesional asumida por CTO — debugging en frío al final de 3h+ de sesión es alto coste, bajo rendimiento.

**Sub-Op C.F — Revert al carácter:**

Tras intento fallido de revert vía Claude Code (Claude Code esperaba "opción 1" explícita que no le di con suficiente claridad — error §9.4 de comunicación CTO, ver §3.4), revert ejecutado directamente desde shell de Ramón:

1. `git checkout -- components/_SessionInner.js` → `_SessionInner.js` = 2962 ✓ idéntico a HEAD.
2. `git checkout -- lib/chartViewport.js` → `chartViewport.js` = 202 ✓ idéntico a HEAD.

`git status` final: working tree clean salvo `scripts/audit-pares-2026.js` untracked. `git diff --stat` vacío salvo el script untracked.

**Camino 3 elegido (revert total) sobre camino 1 (comitear código muerto) y camino 2 (stash):** mejor profesional porque la regresión Killzones puede requerir API rediseñada en sesión 17 (quizá función combinada `restoreAndTickKillzones`, quizá parámetro extra para coordinar con chartTick). Guardar las 3 funciones actuales como deuda mental ("¿valen tal cual o las rehago?") es ruido. Pizarra limpia para sesión 17 informada por el bug Killzones.

---

## §3 — Errores §9.4 detectados en vivo durante sesión 16

### §3.1 — HANDOFFs sesiones 13, 14, 15 NO indexados en project_knowledge al arrancar

Confirmado al carácter en los 3 `project_knowledge_search` ejecutados al inicio. Patrón recurrente (lección §9.4 nº1 de sesión 15). CTO trabajó con la información del prompt de arranque como punto de partida y verificó al carácter desde shell de Ramón los hashes, contadores y bloques relevantes.

**Mitigación adoptada desde sesión 16:** asumido como invariante. Trabajar con el prompt de arranque como narrativa, verificar al carácter cada dato técnico (`wc -l`, `git log`, `grep`) desde shell de Ramón.

### §3.2 — Versión de `pages/api/candles.js` indexada en project_knowledge era PRE-sesión-15

Project_knowledge devolvió la versión de 115 líneas (pre-`89e36ee`) sin las funciones `countCandlesPerDay`, `detectGaps`, `fetchFromDukascopyWithRetry`. Identificado al instante porque el prompt declaraba 282 líneas. Verificado al carácter con `wc -l` desde shell de Ramón: 282 ✓.

**Lección:** project_knowledge en este proyecto puede llevar 1+ sesiones de retraso para archivos modificados recientemente. Cualquier dato sobre archivos tocados en últimas 1-2 sesiones se trata como inferencia hasta verificar bytes en disco.

### §3.3 — Predicción de tamaño del script de auditoría: 155 líneas → real 174 líneas (+12%)

Subestimación de líneas en blanco entre funciones. No bloqueante (script funcionó al carácter), pero patrón a corregir.

**Mitigación:** desde sesión 17, predicciones de delta absoluto SOLO con `wc -l` previo + análisis al carácter de líneas en blanco/separadores. Ramón ya lo había anotado como regla en lección §9.4 nº3 de sesión 15.

### §3.4 — Ambigüedad en mensaje de revert que llevó a Claude Code a no aplicar reverts

CTO redactó instrucción a Claude Code para revertir 3 Edits sobre `_SessionInner.js`. Claude Code preparó `old_string`/`new_string` correctos pero esperó "opción 1" explícita antes de aplicar. Mi mensaje siguiente decía "ok" pero también mencionaba comandos de verificación (`wc -l`, `git diff --stat`, `npm run build`) — Ramón ejecutó esos comandos directamente en su shell sin pasar el "ok" a Claude Code.

Resultado: Ramón vio `_SessionInner.js` = 2975 con los cambios todavía aplicados, asumió que el revert había fallado. Diagnóstico al carácter del estado real (vía `git diff`) reveló que Claude Code simplemente no había recibido la luz verde de aplicar.

**Mitigación adoptada en vivo:** revert ejecutado directamente desde shell de Ramón con `git checkout -- <file>`. Más rápido, más seguro, una decisión menos.

**Lección operativa:** cuando el cierre de un Op requiere acción de Claude Code Y verificación de Ramón en su shell, **separar los dos turnos**. Primero: "Ramón, pásale opción 1 a Claude Code". Después de output: "Ramón, ahora ejecuta esto en tu shell para verificar".

### §3.5 — Ambigüedad en localización del Edit ("después de scrollToTail")

CTO escribió en Sub-Op C.C "Las 3 funciones se añaden DESPUÉS de la última función existente (`scrollToTail`)". `scrollToTail` NO era la última (la última era `markUserScrollIfReal`). Claude Code detectó la ambigüedad, paró antes de tocar nada, presentó las dos interpretaciones posibles. CTO eligió Opción B (al final real del archivo). Cero daño, ~5 min perdidos.

**Lección:** las localizaciones para Edit deben ser absolutas (línea exacta, "al final del archivo", "después de la última función") y no relativas a una función nombrada que CTO no haya verificado al carácter como la última.

### §3.6 — Falsa alarma sobre `})` extra en preview de Claude Code

CTO interpretó el render visual del preview de Claude Code (con wrap por columna estrecha) como bug de sintaxis (3 `})` en vez de 2). Pidió aclaración. Claude Code verificó al carácter con tabla de indentación y confirmó que el `new_string` real tenía 2 `})` + 1 `}` correctos. Falsa alarma del render del chat web. Apuntado para futuros previews de cierres anidados: pedir desglose con tabla de indentación desde el inicio.

---

## §4 — Métricas de la sesión 16

- **Inicio:** ~19:00 (4 may 2026).
- **Cierre redacción HANDOFF:** ~22:30 (4 may 2026).
- **Duración total:** ~3.5h.
- **Commits firmados:** 1 (`1d5865d`, push a `origin/main`).
- **Deudas cerradas:** Verificación pares 2026 (Opción A) — descarta patrón sistemático bug 5.2.
- **Deudas abiertas/movidas:** 5.1 (UX viewport — fix candidato identificado, regresión Killzones nueva descubierta a diagnosticar).
- **Líneas modificadas netas:**
  - `scripts/audit-pares-2026.js` +174 líneas (commit `1d5865d`).
  - `lib/chartViewport.js` y `components/_SessionInner.js`: cero netos tras revert.
  - `refactor/HANDOFF-cierre-sesion-16.md`: este documento (untracked al cierre).
- **Errores §9.4 detectados en vivo:** 6 (ver §3).
- **Reglas disciplina bicapa respetadas al carácter:** §2 (validación shell zsh nativo en cada paso), §6 (comandos git separados), §7 (commits atómicos), §9.4 (verificación literal vs inferencia, especialmente pre-Edit), §10 (wildcards/escapes en `.md`), §11 (no push sin OK explícito), §12 (revert sin tocar producción).

---

## §5 — Estado al carácter al cierre de sesión 16

### §5.1 Git

- `origin/main` = `1d5865d` chore(audit): script de auditoria de 6 pares 2026 desde Dukascopy.
- `main` local = `1d5865d` (en sync).
- Working tree limpio salvo este `HANDOFF-cierre-sesion-16.md` untracked (pendiente de comitear post-redacción).
- Cadena reciente: `1d5865d ← 5cef4e7 ← 3f1da59 ← 89e36ee ← 0fe5fbc`.

### §5.2 Producción Vercel

- Deploy actual: `1d5865d` (Vercel re-deployará al detectar push, idempotente — script standalone fuera de webpack).
- Runtime efectivo: idéntico a `5cef4e7` (no hay cambios en `pages/`, `lib/`, `components/`).
- Smoke producción **NO requerido** — push idempotente.

### §5.3 Bugs y deudas

| ID | Descripción | Estado al cierre 16 |
|---|---|---|
| Quota Supabase | Plan Free excedido — gracia hasta 24 may 2026 | ⏳ Abierta — decisión arquitectónica para sesión 17/18 |
| Verificación pares 2026 | 6 pares × 2026 desde Dukascopy | ✅ Cerrada en sesión 16 (Opción A) |
| Deuda 5.1 — UX viewport | Mantener vista al cambiar TF + atajo Opt+R/Alt+R | ⏳ ABIERTA — fix candidato identificado, regresión Killzones nueva descubierta |
| **Regresión Killzones (nueva, sesión 16)** | Killzones se descolocan al cambiar TF si el viewport se restaura post-setData. **Solo en local con fix 5.1, NO en producción.** | ⏳ ABIERTA — diagnóstico pendiente sesión 17 |
| 4.5 | `__algSuiteExportTools` no registrado | ⏳ Backlog (post-fase-5) |
| Warning lifecycle plugin LWC | `_requestUpdate is not set` al destruir tool | ⏳ Backlog (probable fase 5) |
| B5 | `409 Conflict` race `session_drawings` | ⏳ Backlog |
| Warning React `borderColor` shorthand | Cosmético | ⏳ Backlog |
| Limpieza ramas locales (~10 viejas) | Higiene git | ⏳ Backlog (sesión corta puntual) |

---

## §6 — Plan para sesión 17

### §6.1 Recomendación de orden

**Opción 1 (recomendada CTO) — Reabrir deuda 5.1 con diagnóstico Killzones primero:**

1. **PASO 0 inventario Killzones (~30 min):**
   - `grep -rn "Killzones\|KillzonesOverlay\|chartTick" components/ lib/` para localizar el componente y sus dependencias.
   - Leer al carácter `KillzonesOverlay.js` (o equivalente).
   - Identificar exactamente qué prop dispara recálculo de posiciones y cómo se relaciona con `chartTick`.

2. **Aplicar mitigación candidata (Edit pequeño, ~15 min):**
   - Re-aplicar Edits A/B/C de sesión 16 (las 3 funciones nuevas en `chartViewport.js` + integración en `_SessionInner.js`).
   - Cambio crítico vs sesión 16: mover `setChartTick(t => t+1)` **dentro del rAF**, después del restore. Patrón `requestAnimationFrame(() => { restoreSavedTimeRange(cr, _savedTimeRange); setChartTick(t => t+1) })`.

3. **Smoke local (~30 min):**
   - Test 1: cambio TF M5 → M15 sobre rango pasado. Vista se mantiene + Killzones bien colocadas.
   - Test 2: cambio TF durante play.
   - Test 3: cambio extremo M1 → H1.
   - Test 4: cambio TF en zona phantoms.

4. **Si los 4 tests verde:** sub-Op D (atajo Opt+R / Alt+R) en la misma sesión o diferida a sesión 18.

5. **Si Killzones siguen rotas:** diagnóstico más profundo del orden de eventos React — quizá necesitemos `flushSync` o un `useLayoutEffect` para forzar sincronización entre setData de LWC y recálculo de Killzones.

**Opción 2 — Atacar quota Supabase primero:**

Deadline 24 may. Sesión dedicada para auditar uso del bucket `forex-data` desde panel Supabase, decidir entre Pro plan (~$25/mes), limpiar storage o migrar a R2/S3. Aplicar decisión.

**Mi recomendación: Opción 1.** Razones:
- Deuda 5.1 está casi cerrada (~80% del trabajo hecho en sesión 16, fix candidato identificado).
- Killzones es bug nuevo descubierto pero hipótesis técnica clara → atacable con cabeza fresca en ~1.5h.
- Quota Supabase tiene 20 días de margen, decisión arquitectónica que merece sesión propia post-Killzones.

### §6.2 Punto de entrada sugerido

`refactor/HANDOFF-cierre-sesion-16.md` (este documento) — único punto de entrada al estado actual. Cubre Opción A cerrada + Opción C abierta + bug Killzones nuevo.

Material adicional reutilizable de sesión 16:
- `scripts/audit-pares-2026.js` ya en `main` — base para futuras auditorías.
- Datos de los 6 pares 2026 en `/tmp/<pair>-2026-test.json` (~75 MB total) — útiles si más adelante decidimos cirugía bucket-side de los 5 pares restantes (datos buenos ya descargados y validados). `/tmp/` se autolimpia al reiniciar iMac, así que estos archivos pueden no estar en sesión 17 — re-descargables en ~4 min.

### §6.3 PASO 0 obligatorio en sesión 17

Antes de tocar nada, leer en este orden:

1. `CLAUDE.md` (raíz repo) — instrucciones generales (sin cambios desde sesión 15).
2. **`refactor/HANDOFF-cierre-sesion-16.md`** (este documento, comiteado en sesión 16) — único punto de entrada.
3. `lib/chartViewport.js` — código actual del módulo (202 líneas, 6 funciones existentes).
4. `components/_SessionInner.js` L1154-L1192 — handler actual de cambio de TF (con `scrollToTail` original, deuda 5.1 sin fix).
5. **Localizar componente Killzones** (no lo hicimos al carácter en sesión 16) — `grep -rn "Killzones" components/` o similar.

Verificación de estado del repo en shell de Ramón:

```bash
cd ~/Desktop/forex-simulator-algorithmic-suite
git status
git log --oneline -10
git branch --show-current
```

Esperado: rama `main`, working tree limpio (o con HANDOFF sesión 17 untracked en redacción), HEAD = `1d5865d` o más reciente si hay HANDOFF de sesión 16 comiteado.

---

## §7 — Reflexión final del CTO/revisor

Sesión 16 fue **mixta en resultado pero limpia en proceso**.

**Lo bueno:**

- Disciplina bicapa al carácter en cada paso. Cero pushes sin OK explícito. Cero edits sin verificación shell de Ramón. Cero acciones destructivas en producción.
- Detección temprana de la regresión Killzones (Ramón comparó local vs producción en menos de 30 segundos tras smoke fallido). Lección sesión 12 §7.2 aplicada al carácter: **las observaciones UX de Ramón son input técnico encriptado** — Ramón vio una captura, identificó al instante "esto no pasaba en producción", y eso bastó para distinguir bug pre-existente vs regresión nueva. Sin esa intervención habríamos buscado en el sitio equivocado.
- Decisión profesional de revert (Camino 3) sobre tentación de comitear código muerto (Camino 1). `main` queda exactamente como debe.
- Opción A cerrada limpiamente con script reutilizable. Patrimonio para auditorías futuras.

**Lo mejorable:**

- 6 errores §9.4 detectados en una sesión es alto. Patrones recurrentes: predicción sin verificación previa (§3.3), ambigüedad en instrucciones a Claude Code (§3.4, §3.5), falsa alarma por render del chat (§3.6). Mitigaciones propuestas en cada subsección.
- Duración estimada inicial: 2-2.5h. Real: ~3.5h. Subestimación recurrente — sumar 30-60 min de overhead a estimaciones que incluyan smoke local + revert + HANDOFF.

**Tres aprendizajes para fijar:**

1. **Smoke local con Killzones es test crítico para CUALQUIER cambio en viewport o cambio de TF.** Killzones son overlay sensible al timing del `chartTick` — cualquier modificación al orden de eventos en el handler de cambio de TF puede romperlas. Añadir prueba "Killzones bien colocadas tras cambio TF" al checklist de smoke de Sub-Op C/D futura y de fase 5.
2. **`git checkout -- <file>` es la herramienta de revert por defecto en este proyecto, no Claude Code.** Más atómico, más seguro, una decisión menos. Reservar Claude Code Edits revert solo para cuando los cambios estén interleavados con otros que NO se quieren revertir.
3. **El handler de cambio de TF en `_SessionInner.js` L1154-L1192 es nodo crítico de coordinación.** Toca: phantoms, viewport, drawings, Killzones, overlays, tick. Cualquier cambio aquí necesita PASO 0 inventario al carácter de TODOS los consumers del `chartTick` (no solo del viewport). Para sesión 17: identificar y enumerar antes del primer Edit.

---

*Fin del HANDOFF de cierre sesión 16.*
