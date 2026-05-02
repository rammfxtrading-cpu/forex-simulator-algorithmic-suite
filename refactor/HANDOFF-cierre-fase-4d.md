# HANDOFF — cierre sub-fase 4d (housekeeping post-fase-4 + fix bug del play TF bajo + speed máx)

> Fecha: 2 mayo 2026, sesión "simulador 12".
> Autor: Claude Opus 4.7 (CTO/revisor) + Claude Code (driver técnico) + Ramón Tarinas (pegamento humano).
> Estado al redactar: rama `fix/limit-desaparece-al-play` con 4 commits sobre `main` HEAD `cc361e5`. Working tree limpio. Build verde local. Smoke manual del fix OK. Sin push, sin merge a main todavía.

---

## §1 — Resumen ejecutivo (lenguaje llano)

Hoy hemos cerrado las 3 deudas de housekeeping que dejó la fase 4 del refactor (4.1, 4.2, 4.3 del HANDOFF anterior) y, **lo más importante**, hemos arreglado el bug que Luis llevaba reportando: el LongShortPosition se descolocaba durante el play en TF bajo + velocidad máxima cuando los SL/TP del drawing apuntaban más allá de las phantoms.

**Diagnóstico al carácter del bug** (ya cerrado): la función que regenera las phantoms cuando entra una vela TF nueva durante play estaba leyendo el número de phantoms del ciclo anterior (default 10) en vez de calcular cuántas hacen falta mirando los drawings actuales. Solo el flujo del cambio de TF sabía recalcular ese número, y durante un play en TF fijo ese flujo nunca se dispara. Resultado: las phantoms cubrían solo 10 minutos por delante en M1, y cualquier drawing con extremo más lejano se descolocaba.

**Solución**: extraer el cálculo a un helper único (`computePhantomsNeeded`) y llamarlo desde los 2 sitios que lo necesitan (cambio de TF + vela TF nueva durante play). Single source of truth, asimetría eliminada, bug cerrado.

**Verificación visual al carácter**: drawing con TP 4.8 pips arriba, SL 1.6 pips abajo, RR 3.00. Pre-fix se volvía gigante en segundos durante play. Post-fix mantiene dimensiones tras ~2h de simulación a velocidad máxima. Confirmado al carácter por Ramón con 2 capturas de pantalla comparativas.

**Coste de la sesión**: ~3.5h de bicapa estricta. 4 ops aplicados al carácter, 4 commits atómicos, 2 errores §9.4 míos detectados y corregidos en vivo (sampler lateral mal escrito, predicciones de delta sin `wc -l` previo).

---

## §2 — Estado al carácter (verificable desde shell)

### §2.1 Git

- Rama activa: `fix/limit-desaparece-al-play`.
- HEAD = `e9f460b` (commit del fix del bug).
- `main` local = `origin/main` = `cc361e5` (intacto, sin cambios desde cierre fase 4).
- Working tree limpio.

### §2.2 Historial de la rama (4 commits sobre `main`)

```
e9f460b  fix(fase-4d): recalcular phantoms necesarias en cada vela TF nueva durante play (deuda 4.4)
33aa48a  refactor(fase-4d): actualizar JSDoc de restoreOnNewBar a la realidad post-fase-4 (deuda 4.2)
4f14657  refactor(fase-4d): limpiar setSeriesData huérfano en fallbackCtx de restoreOnNewBar (deuda 4.1)
4948f0d  refactor(fase-4d): eliminar import huérfano updateSeriesAt en _SessionInner.js (deuda 4.3)
cc361e5  docs(fase-4): cerrar fase 4 render layer con HANDOFF
```

### §2.3 Archivos tocados

| Archivo | Antes (cc361e5) | Después (e9f460b) | Delta neto |
|---|---|---|---|
| `components/_SessionInner.js` | 2953 líneas | 2962 líneas | +9 |
| `lib/chartViewport.js` | 204 líneas | 202 líneas | -2 |

**Cero archivos nuevos. Cero deps npm. Cero migraciones Supabase.**

### §2.4 Hitos invariantes verificables

Todos verificables desde shell zsh nativo:

```bash
# HITO 1: cero cr.series.setData fuera del render layer
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"
# → debe devolver VACÍO

# HITO 2: cero cr.series.update fuera del render layer
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"
# → debe devolver VACÍO

# HITO 3: cero updateSeriesAt fuera del data layer y render layer (deuda 4.3 cerrada)
grep -rn "updateSeriesAt" components/ pages/ lib/ | grep -v "lib/chartRender.js" | grep -v "lib/sessionData.js"
# → debe devolver VACÍO (antes devolvía 1 línea, el import L13)

# HITO 4: helper computePhantomsNeeded existe y se usa desde 2 sitios
grep -n "computePhantomsNeeded" components/_SessionInner.js
# → debe devolver 3 líneas: definición + 2 call sites
```

---

## §3 — Op 4d-1 — eliminar import huérfano `updateSeriesAt`

**Commit:** `4948f0d` · **Archivo:** `components/_SessionInner.js` · **Delta:** 1 línea modificada.

**Cambio:** L13 del import de `lib/sessionData` — eliminado el identificador `updateSeriesAt` (que ya no se usaba en el cuerpo del archivo tras Op 4b-3 de fase 4).

**Verificación previa al carácter:** `grep -n "updateSeriesAt" components/_SessionInner.js` devolvió 1 sola línea, la del import. Cero usos en cuerpo. Eliminación segura.

**Por qué importa:** cierra HITO 3 al 100%. `updateSeriesAt` ahora solo vive donde debe (`lib/sessionData.js` lo exporta, `lib/chartRender.js` lo consume).

---

## §4 — Op 4d-2 — limpiar `setSeriesData` huérfano en `fallbackCtx`

**Commit:** `4f14657` · **Archivos:** `lib/chartViewport.js` + `components/_SessionInner.js` · **Delta:** 1 inserción, 3 eliminaciones.

**3 cambios coherentes:**
- `lib/chartViewport.js` L132: línea JSDoc del param `fallbackCtx.setSeriesData` eliminada.
- `lib/chartViewport.js` L150: destructuring `const { agg, mkPhantom, lastT, tfS2, setSeriesData } = fallbackCtx` → `const { agg, mkPhantom, lastT, tfS2 } = fallbackCtx`.
- `components/_SessionInner.js` L1112: literal pasado a `restoreOnNewBar` — eliminada la propiedad `setSeriesData,`.

**Razón:** eco huérfano de Op 4a-6 de fase 4 (Camino X §0.2.A). El catch fallback dejó de usar `setSeriesData` directo cuando se delegó a `applyFullRender` (que ya lo invoca internamente).

**Decisión §9.4 documentada:** el HANDOFF fase 4 §4.1 sugería que `mkPhantom`, `lastT`, `tfS2` también podrían simplificarse. **Esta sugerencia es FALSA según inventario al carácter de Claude Code**: los 3 sí se usan en L151 para regenerar las phantoms ANTES de pasar `cr.phantom` ya regenerado a `applyFullRender`. Eliminarlos requeriría mover la regeneración de phantoms a otra capa (refactor estructural fase 5+, no housekeeping de 4d). **El HANDOFF §4.1 contiene una sobre-extensión que conviene corregir en la próxima edición de ese documento.**

---

## §5 — Op 4d-3 — actualizar JSDoc de `restoreOnNewBar` a la realidad post-fase-4

**Commit:** `33aa48a` · **Archivo:** `lib/chartViewport.js` · **Delta:** 6 inserciones, 8 eliminaciones (204 → 202 líneas).

**4 cambios JSDoc en la cabecera de `restoreOnNewBar`** (Opción A del plan — mínimo invasivo, sin re-redacción del bloque):

- L110: el callback ya no es "cr.series.update + bucle phantoms + DEBUG TEMP"; ahora es "callback que aplica el update al render layer".
- L116: el catch fallback ya no hace "setData con velas + phantoms regeneradas"; ahora "Llama applyFullRender(cr, agg, cr.phantom) con phantoms regeneradas".
- L119-L123 (5 líneas → 3 líneas): la frase "callback applyUpdates encapsula código que NO se mueve a esta API... [DEBUG TEMP] que sigue inline en _SessionInner.js" era cierta antes de Op 4c-3 y falsa después. Reemplazada por descripción de la realidad: el bloque vive en `applyNewBarUpdate` dentro de `lib/chartRender.js`, gateado por `window.__algSuiteDebugLS`.
- L126: param doc de `applyUpdates` actualizado en línea con L110.

**Cero código ejecutable tocado.** JSDoc puro.

---

## §6 — Op 4d-4 — fix del bug del play TF bajo + speed máx

**Commit:** `e9f460b` · **Archivo:** `components/_SessionInner.js` · **Delta:** 25 inserciones, 15 eliminaciones (2953 → 2962 líneas, neto +10).

### §6.1 Diagnóstico al carácter (verificado con bytes en disco)

Asimetría descubierta entre las 2 ramas que regeneran phantoms en `updateChart`:

| Rama | Línea (pre-fix) | Cómo calculaba `_phN` |
|---|---|---|
| Full rebuild (`if(full \|\| curr!==prev+1)`) | L1081 | `cr._phantomsNeeded \|\| 10` |
| Vela TF nueva (`else if(curr===prev+1)`) | L1102 | `cr.phantom?.length \|\| 10` |

`cr._phantomsNeeded` solo se calculaba en el `useEffect` del cambio de TF (L1149-L1170), mirando los timestamps de los drawings via `exportTools()`. El `useEffect` consume el valor y lo nullifica en la siguiente vela TF nueva.

**Cadena causal del bug:**
1. Usuario crea LongShortPosition en TF M1 sin cambio de TF previo → `cr._phantomsNeeded` queda en `null`.
2. Pulsa play. Cada vela TF nueva entra en rama L1091-L1112.
3. `_phN = cr.phantom?.length || 10` → siempre 10 (heredado del init/full).
4. Las phantoms cubren 10 minutos por delante en M1.
5. SL/TP del drawing está más allá → `phantom_last_t < t(SL/TP)` → plugin LWC pierde la referencia → drawing se descoloca.

**Snapshot real capturado durante reproducción del bug:**
```
last_real_t:     2026-01-12T09:37:00Z
phantom_count:   10
phantom_first_t: 2026-01-12T09:38:00Z
phantom_last_t:  2026-01-12T09:47:00Z
```

10 minutos de cobertura. Insuficiente para drawings con horizonte mayor.

### §6.2 Solución aplicada

**3 Edits en commit atómico:**

**Edit 1** — Helper a nivel de módulo (insertado entre `calcPnl` L111 y consts de `TfInputModal`):

```javascript
// Default 10 phantoms (mínimo visual). Si algún drawing tiene un point.timestamp
// más allá de lastT, añade ceil((maxTs - lastT) / tfSecs) + 10 de colchón
// para que el plugin LWC pueda mapear ese timestamp a logical index.
function computePhantomsNeeded(tools, lastT, tfSecs){
  let maxTs = lastT
  tools.forEach(tool => {
    (tool.points || []).forEach(p => {
      if (typeof p?.timestamp === 'number' && p.timestamp > maxTs) {
        maxTs = p.timestamp
      }
    })
  })
  if (maxTs > lastT) return Math.ceil((maxTs - lastT) / tfSecs) + 10
  return 10
}
```

**Edit 2** — Refactor del `useEffect` TF change (cuerpo del try L1149-L1170, de 23 líneas a 11):

```javascript
let phantomsNeeded = 10  // mínimo por defecto
try {
  const TF_SECS = {M1:60, M3:180, M5:300, M15:900, M30:1800, H1:3600, H4:14400, D1:86400}
  const newSecs = TF_SECS[newTf] || 3600
  const newAgg = ps.engine.getAggregated(newTf)
  const newLastReal = newAgg.length ? newAgg[newAgg.length-1].time : null
  if (newLastReal) {
    const tools = JSON.parse(exportTools() || '[]')
    phantomsNeeded = computePhantomsNeeded(tools, newLastReal, newSecs)
  }
} catch(e){ /* swallow — fallback al default 10 */ }
```

**Edit 3** — Fix del bug en rama vela TF nueva (L1102, de 1 línea a 7):

```javascript
let _phN
try {
  const tools = JSON.parse(exportTools() || '[]')
  _phN = computePhantomsNeeded(tools, _lastT, _tfS2)
} catch {
  _phN = cr.phantom?.length || 10
}
```

**Fallback defensivo dentro del catch** preservado (`cr.phantom?.length || 10`): si `exportTools()` lanza durante play, conservamos comportamiento previo (no degradamos respecto al estado anterior al fix).

### §6.3 Decisión consciente de scope

**NO se toca la rama full rebuild (L1081)**. Sigue con `cr._phantomsNeeded || 10 + nullify one-shot`. Razón: esa rama ya recibe el valor correcto del `useEffect` TF change (que ahora usa el helper). Cambiar la rama full rebuild podría introducir regresiones en flujos de seek/init/full que no están cubiertos por la prueba manual de hoy. Asimetría intencional, justificada y documentada.

### §6.4 Coste de performance aceptado

`exportTools() + JSON.parse + forEach` se ejecuta en cada vela TF nueva durante play. Para sesión típica (N=5-10 drawings, K=4 puntos por drawing) son ~40 ops por vela. A 50 velas/seg en M1+∞ son ~2000 ops/seg. Aceptable.

**Mitigación futura (out of scope hoy):** cache invalidado por evento del plugin LWC (suscripción al `AfterEdit`). Si en el futuro hay sesiones con muchos drawings y se nota degradación, abrir sub-fase de cache. Encaja arquitectónicamente en fase 5 (drawings lifecycle).

### §6.5 Verificación manual al carácter

**Pre-fix (capturas 17:59:16 vs 18:01:18):**
- 17:59: drawing recién creado, compacto, TP 4.8 pips / SL 1.6 pips / RR 3.00, altura ~6 pips.
- 18:01: tras play breve, drawing **gigantemente expandido** ocupando media pantalla.

**Post-fix (capturas 19:40:23 vs 19:40:31):**
- 19:40:23: drawing recién creado, mismas dimensiones que en pre-fix.
- 19:40:31: tras play con avance de ~2h de simulación (`13 ene 23:44` → `14 ene 01:59`), drawing **mantiene exactamente las mismas dimensiones** (TP 4.8 / SL 1.6 / RR 3.00).

Bug resuelto al carácter.

---

## §7 — Lecciones §9.4 (para futuras sesiones bicapa)

### §7.1 Mi error — sampler lateral mal escrito (instrumentación rota)

Durante la captura de logs en frío, redacté un sampler con `Object.keys(window.__chartMap)[0]` asumiendo que `__chartMap` era el mapa directo. En realidad es una React ref con única clave `'current'`, y el mapa real vive en `chartMap.current[pair]`. El sampler abandonaba sin capturar nada porque `cr.phantom` era `undefined` en el wrapper equivocado.

**Lección:** antes de instrumentar, verificar la **estructura real** del objeto target con un `Object.keys()` exploratorio. No inferir desde memoria de `project_knowledge_search` (que puede reflejar estado anterior del repo).

### §7.2 Mi error — predicciones de delta sin `wc -l` previo

En Op 4d-2 predije delta de líneas asumiendo baseline equivocada (asumí 2952 cuando seguía siendo 2953). El error fue +1 línea, no bloqueante, pero refleja que prediqué sin contar primero.

**Lección registrada por Claude Code y aplicada a partir de Op 4d-3:** `wc -l` obligatorio antes de cualquier predicción de delta absoluto.

### §7.3 Disciplina §9.4 aplicada por Claude Code (digno de apuntar como lección positiva)

En Op 4d-2, Claude Code **rechazó** la sobre-sugerencia del HANDOFF fase 4 §4.1 (eliminar también `mkPhantom/lastT/tfS2`) tras inventario al carácter. Auditó que esos 3 identificadores SÍ se usan en L151. Su criterio fue más riguroso que el mío (yo redacté el HANDOFF §4.1 con la sobre-sugerencia desde memoria sin verificar). Disciplina §9.4 aplicada en su forma más estricta: ningún análisis cuenta como verificado si los bytes no han pasado por el shell de la sesión actual.

### §7.4 Hallazgo paralelo — `__algSuiteExportTools` no está registrado

Durante la activación del bloque `[DEBUG TEMP]` original (en `lib/chartRender.js`), descubrimos que `window.__algSuiteExportTools` **no está registrado en `window`** durante el flujo normal del simulador. La instrumentación migrada en Op 4c-1 de fase 4 depende de ese global pero nunca se dispara porque la condición `typeof window.__algSuiteExportTools === 'function'` siempre es false. **El bloque [DEBUG TEMP] de `applyNewBarUpdate` nunca emite logs.** No es regresión de fase 4 — es deuda nueva descubierta hoy.

**Implicación:** o bien se registra el global en algún punto del lifecycle, o bien el bloque [DEBUG TEMP] se reescribe para usar otra fuente (probablemente vía la función `exportTools` que sí está disponible en el scope de `_SessionInner.js`, o via `chartMap.current[pair]` directamente). Esta deuda queda apuntada como **deuda 4.5** para futura sesión.

### §7.5 Patrón consolidado — wrapper de captura en consola del navegador

Para diagnósticos del bug del play (o similares) usamos un patrón de wrapper sobre `console.log` + `setInterval` de muestreo cada 100ms con dedup por `last_real_t`. Es un patrón replicable para futuras instrumentaciones laterales sin tener que tocar código en disco. Se podría plantillar en `refactor/instrumentation-snippets.md` si se vuelve recurrente.

---

## §8 — Decisiones técnicas tomadas (referenciar antes de re-litigar)

### §8.1 Helper local en `_SessionInner.js`, NO módulo nuevo

**Alternativa rechazada:** crear `lib/phantomBudget.js`. **Razón:** abrir capa nueva en una sub-fase de fix es scope creep. Si en el futuro el helper crece o se reutiliza desde otros módulos, se promueve a `lib/` en su día.

### §8.2 Asimetría intencional: rama full rebuild vs rama vela TF nueva

**Alternativa rechazada:** simetrizar ambas ramas para que las dos llamen al helper. **Razón:** la rama full rebuild se alimenta del `useEffect` TF change (que ya usa el helper) — su patrón one-shot consumer es correcto para su flujo. Tocar la rama full rebuild podría introducir regresiones en seek/init no testeadas. Mínimo cambio que resuelve el bug reportado.

### §8.3 `TF_SECS` permanece local al `useEffect`

**Alternativa rechazada:** subir `TF_SECS` a constante de módulo. **Razón:** solo se usa en 1 sitio. Subirla al módulo sería cambio de scope sin beneficio inmediato. Si otro consumidor lo necesita en el futuro, se promueve.

### §8.4 Fallback defensivo en `catch` del Edit 3

**Alternativa rechazada:** `_phN = 10` directo en el catch. **Razón:** preservar `cr.phantom?.length || 10` mantiene el comportamiento previo al fix si `exportTools()` lanza inesperadamente. No degradamos respecto al estado anterior, ni siquiera en errores.

---

## §9 — Pruebas validadas

### §9.1 Build local

`npm run build` verde tras cada Op (4d-1, 4d-2, 4d-3, 4d-4). Cero errores. Cero warnings nuevos. Bundle `/dashboard` 12.6 kB / 220 kB — idéntico a baseline pre-fase-4d.

### §9.2 Smoke local navegador

Recarga forzada (Cmd+Shift+R) tras los 4 commits. Sesión EUR/USD M1 cargada limpiamente. LongShortPosition creado y visible. Play + speed máx ejecutado durante ~2h de simulación: drawing mantiene dimensiones, sin descolocar.

### §9.3 Hitos invariantes fase 4 vivos

Los 4 HITOs verificados al carácter desde shell zsh nativo. Cero regresiones del aislamiento del render layer.

### §9.4 Bugs pre-existentes confirmados (NO regresiones)

- **B5** — `POST /session_drawings 409 Conflict` al crear primer LongShortPosition. Backlog conocido.
- **Warning React `borderColor` shorthand** — pre-existente desde fase 1. Cosmético.
- **Bug nuevo (deuda 4.5)** — `window.__algSuiteExportTools` no registrado. Hace que el `[DEBUG TEMP]` original no emita logs. Documentado en §7.4.

---

## §10 — Stack y entorno

Sin cambios respecto a HANDOFF-cierre-fase-4 §10:

- Next.js 14.2.35 (pages router).
- React 18.
- Supabase (auth + Postgres). Sin cambios de schema en esta sesión.
- Vercel deploy. Sin push hoy → producción sigue intacta en `cc361e5`.
- Mac iMac, macOS, terminal zsh nativa + Claude Code en otra terminal.
- Email cuenta Claude: `rammglobalinvestment@gmail.com`.

---

## §11 — Procedimiento de cierre (próximos pasos en orden estricto)

### §11.1 Inmediatos (esta sesión, post-redacción del HANDOFF)

1. Mover este documento a `refactor/HANDOFF-cierre-fase-4d.md` en el repo.
2. `git add refactor/HANDOFF-cierre-fase-4d.md` (comando separado).
3. `git commit -m "docs(fase-4d): cerrar sub-fase 4d con HANDOFF"` (comando separado).
4. Verificar `git log --oneline -6` — debe mostrar 5 commits sobre `cc361e5`.

### §11.2 Merge a main

5. `git checkout main` (comando separado).
6. `git merge fix/limit-desaparece-al-play` (comando separado). Espera fast-forward o merge commit limpio.
7. `git log --oneline -7` — verificar historia.

### §11.3 Push

8. `git push origin main`. Vercel auto-deploya.

### §11.4 Smoke producción

9. Esperar ~2-3 min al deploy de Vercel.
10. Abrir `simulator.algorithmicsuite.com`, login, sesión practice EUR/USD M1.
11. Crear LongShortPosition con SL/TP a la derecha. Play breve a velocidad media. Confirmar que el drawing no se descoloca.
12. Si OK: cerrar sesión. Si KO: `git revert` del merge en main + push del revert + investigar.

### §11.5 Backlog post-cierre

- **Deuda 4.5 (nueva)** — `__algSuiteExportTools` no registrado, `[DEBUG TEMP]` no emite logs. Decisión: registrar global o reescribir bloque con fuente alternativa.
- **Cache invalidado por evento para `computePhantomsNeeded`** — si sesiones con muchos drawings notan degradación. Encaja en fase 5.
- **B5** — race condition `session_drawings` 409. Backlog.
- **Warning React `borderColor` shorthand** — cosmético, baja prioridad.
- **Fase 5 — drawings lifecycle** — encaje natural para Opción E del análisis (instrumentar `create/edit/delete` del plugin LWC).
- **Limpieza de globales auxiliares** (`__chartMap`, `__algSuiteDebugLS`, `__algSuiteExportTools`) — fase de limpieza separada post-fase-7.

---

## §12 — Métrica de la sesión

- **Inicio:** ~17:00 (2 may 2026) — sesión "simulador 12" arranca con PASO 0 documental.
- **PASO 0:** lectura de 4 documentos del proyecto (CLAUDE.md, core-analysis.md, HANDOFF-cierre-fase-4.md, HANDOFF-cierre-fase-3.md). Verificación de bytes en disco con greps + sed.
- **Diagnóstico bug del play:** ~17:30-18:35. Reproducción visual + snapshot lateral en consola + identificación de asimetría L1081 vs L1102.
- **Sub-fase 4d ejecutada:** ~18:50-19:40.
  - 4d-1 (`4948f0d`) — import huérfano `updateSeriesAt`.
  - 4d-2 (`4f14657`) — `setSeriesData` huérfano en `fallbackCtx`.
  - 4d-3 (`33aa48a`) — JSDoc obsoleto de `restoreOnNewBar`.
  - 4d-4 (`e9f460b`) — fix del bug del play.
- **Smoke manual del fix:** ~19:40. Confirmación visual al carácter.
- **HANDOFF redactado:** post-19:40.
- **Total sesión:** ~3.5 horas de bicapa estricta + redacción de HANDOFF.

---

## §13 — Cierre

Sub-fase 4d cerrada al carácter. Cumple los 4 criterios de cierre:

✓ **3 deudas housekeeping cerradas** (4.1, 4.2, 4.3) con commits atómicos.
✓ **Bug del play TF bajo + speed máx resuelto** con verificación manual al carácter.
✓ **Build verde** + invariantes fase 4 vivos.
✓ **Cero regresiones funcionales** detectadas durante smoke.

**Nueva deuda apuntada para futura sesión:** 4.5 (`__algSuiteExportTools` no registrado).

**Pendiente de OK Ramón para:** comitear este HANDOFF en la rama feature → merge a main → push → smoke producción.

---

*Fin del HANDOFF de cierre sub-fase 4d.*
