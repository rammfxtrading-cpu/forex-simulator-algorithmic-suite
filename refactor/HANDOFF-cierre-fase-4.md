# HANDOFF — cierre fase 4 render layer

> Fecha: 2 mayo 2026, sesión "simulador 11".
> Autor: Claude Opus 4.7 (CTO/revisor) + Claude Code (driver técnico) + Ramón Tarinas (pegamento humano).
> Estado al cerrar: `main` HEAD = `a7c5f1f` (merge fase 4 desplegado en producción Vercel). Working tree limpio. Smoke check producción OK. Cero regresiones detectadas.

---

## §1 — Resumen ejecutivo (lenguaje llano)

Fase 4 del refactor data-layer **cerrada y desplegada**. El simulador ahora tiene un módulo nuevo (`lib/chartRender.js`) que es el único sitio del proyecto donde se le dice al chart de lightweight-charts qué velas dibujar. Antes, esa lógica estaba dispersa en 6 sitios distintos del archivo `_SessionInner.js` (que tiene casi 3000 líneas). Ahora vive en 3 funciones bien documentadas (172 líneas en total), y `_SessionInner.js` adelgazó 35 líneas netas.

**Por qué esto importa:** el bug "salta al play TF bajo + speed máxima" que Luis reporta es probablemente un problema de cómo el chart re-aplica las phantoms cuando llega una vela nueva. Antes, ese código estaba mezclado con todo lo demás y era casi imposible aislar dónde fallaba. Ahora está aislado en una función llamada `applyNewBarUpdate` con su bloque de debug ya integrado y gateado por una flag (`window.__algSuiteDebugLS`). Activarla desde la consola del navegador escupe logs estructurados con timestamps de phantoms y posiciones de drawings — material exacto para diagnosticar el bug en la próxima sesión.

**Coste de la fase:** ~3h de sesión bicapa estricta. 6 ops sub-fase 4a + 3 ops sub-fase 4b + 3 ops sub-fase 4c. Cada op auditado al carácter por Claude Opus 4.7 web antes de ejecutar. 2 errores de auditoría detectados y corregidos en vivo (transcripción inferida en plan v1, relectura apresurada en Op 4b-1) — ambos cazados por Claude Code, lecciones documentadas.

---

## §2 — Estado al carácter (verificable desde shell)

### §2.1 Git

- Rama activa: `main` (la rama feature `refactor/fase-4-render-layer` se merge-ó y se puede borrar).
- HEAD = `a7c5f1f` (commit de merge).
- origin/main sincronizado con local main.
- Working tree limpio.

### §2.2 Historial relevante (post-fase-4 sobre pre-fase-4)

```
a7c5f1f  Merge branch 'refactor/fase-4-render-layer'
1baf6e4  refactor(fase-4c): migrar rama una-vela-TF-nueva a applyNewBarUpdate (incluye bloque DEBUG TEMP gateado por flag)
803a2a9  refactor(fase-4b): migrar rama within-bucket a applyTickUpdate
caf0bbc  refactor(fase-4a): crear chartRender y migrar full rebuild (init/full + within-bucket catch + chartViewport fallback)
66b3764  docs(fase-4): refinar plan tras inventario PASO 0 con bytes literales
d45c8da  docs(fase-4): redactar plan táctico fase-4-plan.md
aad131b  docs(fase-3): cerrar fase 3 viewport layer con HANDOFF
```

### §2.3 Archivos tocados

| Archivo | Antes | Después | Delta neto |
|---|---|---|---|
| `lib/chartRender.js` | no existía | 172 líneas | nuevo (+172) |
| `components/_SessionInner.js` | 2988 líneas | 2953 líneas | -35 |
| `lib/chartViewport.js` | (post-fase-3) | +1 línea | +1 |
| `refactor/fase-4-plan.md` | no existía | 672 líneas (v2) | nuevo |

### §2.4 Hitos invariantes verificables

Todos verificables desde shell zsh nativo en cualquier momento:

```bash
# HITO 1: cero cr.series.setData fuera del render layer
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"
# → debe devolver VACÍO

# HITO 2: cero cr.series.update fuera del render layer (excluyendo chartViewport, que NO escribe — solo recibe callback)
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"
# → debe devolver VACÍO

# HITO 3: cero updateSeriesAt fuera del data layer (sessionData) y render layer (chartRender)
grep -rn "updateSeriesAt" components/ pages/ lib/ | grep -v "lib/chartRender.js" | grep -v "lib/sessionData.js"
# → debe devolver SOLO la línea de import en _SessionInner.js (deuda menor, ver §4.3)

# HITO 4: bloque [DEBUG TEMP] migrado dentro del render layer
grep -rn "DEBUG TEMP\|LS-DEBUG\|__algSuiteDebugLS" components/ pages/ lib/
# → debe devolver SOLO matches en lib/chartRender.js + comentarios JSDoc obsoletos en lib/chartViewport.js (deuda menor, ver §4.3)
```

---

## §3 — API del render layer (lib/chartRender.js)

3 funciones públicas exportadas. Ningún archivo fuera del render layer debe llamar a `cr.series.setData` o `cr.series.update` directamente.

### §3.1 `applyFullRender(cr, agg, phantoms)`

Full rebuild del chart — reemplaza todas las velas (reales + phantoms).

**Usado en:**
- Rama init/full de `updateChart` (`_SessionInner.js`).
- Fallback del catch de la rama within-bucket (interno a `applyTickUpdate`).
- Fallback de `restoreOnNewBar` desde `chartViewport.js` (Camino X §0.2.A).

**No tiene try/catch** — si LWC falla aquí queremos que el error suba al caller (mismo comportamiento que pre-fase-4).

### §3.2 `applyTickUpdate(cr, agg, phantoms, lastClose)`

Rama within-bucket — actualiza la última vela y muta phantoms in-place si `_lastC` cambió.

**Usado en:**
- Rama `else` (within-bucket) de `updateChart` (`_SessionInner.js`).

**Catch interno** cae a `applyFullRender` si el update incremental falla.

**Mutación in-place** de phantoms aceptada (§0.2.C plan v2). Era el bloque histórico `ALGSUITE_PHANTOM_REFRESH` — crítico en TFs grandes donde una vela tarda mucho en cerrar.

### §3.3 `applyNewBarUpdate(cr, agg, phantoms, debugCtx)`

Rama "una vela TF nueva" — actualiza última vela y re-aplica phantoms al chart, **incluye bloque [DEBUG TEMP] gateado**.

**Usado en:**
- Callback de `restoreOnNewBar` en la rama `curr === prev+1` (`_SessionInner.js`).

**Sin try/catch principal** — el catch de `restoreOnNewBar` (en `chartViewport.js`) es el fallback global que cae a full rebuild con phantoms regeneradas.

**Bloque [DEBUG TEMP]** envuelto en su propio try/catch para no romper el render si la flag está activa pero el export de drawings falla. Performance neutral cuando `window.__algSuiteDebugLS` es falsy.

---

## §4 — Deuda asignada (NO atacar en próximas fases sin decisión explícita)

### §4.1 Sub-fase 4d condicional — limpieza de `fallbackCtx`

`lib/chartViewport.js` L150 destructura `setSeriesData` desde `fallbackCtx` pero ya no lo usa (Op 4a-6 migró el catch a `applyFullRender` que invoca `setSeriesData` internamente). Mismo patrón aplicable a otros campos: `mkPhantom`, `lastT`, `tfS2` también podrían simplificarse si chartViewport.js solo necesita pasar `agg` a `applyFullRender`.

**Coste:** ~30 min de trabajo bicapa.
**Beneficio:** simplificar firma de `restoreOnNewBar` y reducir acoplamiento.
**Decisión:** abrir 4d antes de fase 5 (drawings lifecycle) si toca tocar chartViewport. Si no, posponer.

### §4.2 JSDoc obsoleto en `chartViewport.js`

L110 + L121 del JSDoc de `restoreOnNewBar` mencionan que el callback `applyUpdates()` contiene "DEBUG TEMP" inline en `_SessionInner.js`. Tras Op 4c-3 esa documentación es falsa — todo el bloque vive en `applyNewBarUpdate` dentro de chartRender.

**Coste:** 2 líneas de JSDoc.
**Decisión:** limpiar como parte de sub-fase 4d condicional.

### §4.3 Import `updateSeriesAt` sin uso en `_SessionInner.js`

L13 importa `updateSeriesAt` desde `sessionData` pero ya no se usa fuera del render layer (Op 4b-3 fue la última invocación, migrada a `applyTickUpdate`). El import sigue presente porque otros identificadores de la misma línea (`setSeriesData`, `setMasterTime`, `clearCurrentTime`, `getMasterTime`, `getSeriesData`, `getRealLen`) sí se usan.

**Coste:** modificar línea de import.
**Decisión:** limpiar como parte de sub-fase 4d condicional.

### §4.4 Bug del play TF bajo + speed máxima (Luis)

Bug pre-existente NO causado por fase 4. Hipótesis del plan v2 §6: timestamps de phantoms desincronizados con `LongShortPosition` cuando la vela TF nueva entra a alta velocidad. El bloque [DEBUG TEMP] de `applyNewBarUpdate` está diseñado específicamente para diagnosticar esto.

**Próxima sesión:** activar `window.__algSuiteDebugLS = true` desde consola, reproducir bug, capturar logs, diagnosticar.

### §4.5 Otros bugs en backlog (NO tocados en fase 4)

- **B2** — drawings descolocadas en Review. Probable cierre tras fase 5.
- **B3** — TF reset al entrar Review. Verificar con Luis si fase 3 lo cerró.
- **B5** — POST `/session_drawings` 409 Conflict (race). Backlog.
- **B6** — drawings se pegan al cambiar TF. Probable cierre tras fase 5.
- Saneamiento histórico **B4** — decisión separada.

### §4.6 Warning React `borderColor` shorthand vs non-shorthand

Pre-existente, NO regresión de fase 4 (verificado con `git stash` durante validación 4a). Aparece en algún botón de `_SessionInner.js:449`. Ruido marginal.

---

## §5 — Decisiones técnicas tomadas (referenciar antes de re-litigar)

### §5.1 Camino X (§0.2.A plan v2)

`chartViewport.js` llama a `applyFullRender` desde su catch fallback. Render layer queda 100% aislado — ninguna escritura al chart fuera de chartRender. Decisión sólida, validada en producción.

### §5.2 Bloque [DEBUG TEMP] migra dentro de `applyNewBarUpdate` con flag (Opción B §0.2.B)

Alternativa rechazada: dejar [DEBUG TEMP] inline en `_SessionInner.js`. Razón: queríamos `_SessionInner.js` lo más limpio posible, y la instrumentación del bug del play encaja semánticamente en la función nueva (es donde aplica el evento "vela nueva").

### §5.3 Mutación in-place de `cr.phantom` aceptada (§0.2.C)

El bucle de `applyTickUpdate` muta los OHLC de las phantoms cuando `lastClose` cambia. Alternativa rechazada: crear array nuevo cada tick. Razón: rendimiento (evita allocations en loop hot path) y preservar comportamiento histórico `ALGSUITE_PHANTOM_REFRESH`.

### §5.4 Política de imports §3.3 plan v2

Cada Op importa solo lo que su función nueva usa. `setSeriesData` entra en Op 4a-1; `updateSeriesAt` en Op 4b-1; sin nuevos imports en Op 4c-1. Disciplina para minimizar warnings de unused-import durante estados intermedios.

### §5.5 Try/catch envoltorio del log [DEBUG TEMP]

`applyNewBarUpdate` envuelve TODO el bloque de debug en su propio try/catch para que un fallo del log nunca rompa el render. Alternativa rechazada: dejar que excepciones del log propaguen al catch global de `restoreOnNewBar` (que haría full rebuild). Razón: el log es instrumentación, no debe afectar render aunque la flag esté activa.

### §5.6 Comentarios WHY in-situ en sustituciones (Op 4a-4 + 4b-3)

Tras sustituir bloques inline por llamadas a funciones del render layer, preservamos un comentario WHY corto en el sitio de la llamada (apuntando al JSDoc de la función). Alternativa rechazada: eliminar todos los comentarios WHY duplicados con JSDoc. Razón: lector de `_SessionInner.js` ve marca semántica del sitio sin saltar archivos.

---

## §6 — Pruebas validadas

### §6.1 Build local

`npm run build` verde tras cada sub-fase (4a, 4b, 4c). Cero errores, cero warnings nuevos. Bundle size `/dashboard` 12.6 kB / 220 kB First Load — idéntico a baseline pre-fase-4 (cero impacto).

### §6.2 Smoke local navegador

Tras cada sub-fase, 4 pruebas manuales en `localhost:3000`:
1. Cargar par EURUSD.
2. Cambiar TF (M5 → H1 → M15).
3. Click en barra de progreso (seek).
4. Play breve a velocidad media.

Las 4 pasaron en cada iteración. Cero regresiones detectadas en consola.

### §6.3 Smoke producción Vercel

Tras push de fase 4 completa, smoke en URL pública de Vercel. Las mismas 4 pruebas + creación de drawings (LongShortPosition) + edición + borrado: todo OK. Logs de consola limpios — solo el warning `borderColor` pre-existente y un `409 Conflict` en `session_drawings` que es bug B5 conocido de backlog.

---

## §7 — Lecciones de proceso (para futuras sesiones bicapa)

### §7.1 Disciplina §9.4 — distinguir verificado de inferido

Claude Opus 4.7 web cometió 2 errores de auditoría durante la fase:

**Error 1 — plan v1 (números de línea inferidos).** Tabla §0.1 del plan v1 listaba números de línea aproximados (extrapolados, no verificados con `cat -n` real del estado post-fase-3). Cuando Claude Code lanzó el grep verificador de Op 4a, detectó desfase +25 en 4 entradas. Plan v2 corrigió la tabla con bytes literales.

**Error 2 — relectura apresurada Op 4b-1.** Auditoría inicial sostuvo que el guard `if (!cr || !cr.series || !agg?.length) return` faltaba en la propuesta de `applyTickUpdate`. Claude Code respondió señalando que el guard SÍ estaba en la línea 2 del cuerpo. Verificación literal confirmó que mi auditoría era errónea — había leído el JSDoc largo de 25 líneas y saltado el cuerpo sin scrollear.

**Patrón común:** ambos errores son del mismo tipo — "transcripción inferida" en vez de verificación literal. Lección: la disciplina de auditar al carácter requiere abrir el archivo, leer las líneas exactas, no asumir contenido por contexto. Cuando el auditor (yo) duda, releer antes de pedir cambios.

### §7.2 Bicapa funcional en ambos sentidos

Los 2 errores anteriores los detectó Claude Code al pegármelos sin filtrar — la bicapa funciona cuando ambas capas se permiten contradecir a la otra con argumentos. Cuando Claude Code respondió "discrepo, el guard ya está en mi propuesta original", su respuesta fue lo que cerró el error rápidamente (yo confirmé "Posibilidad A — relectura accidental por mi parte").

### §7.3 Pegado limpio de bytes desde shell zsh

Validación al carácter desde shell nativo (no desde la output de Claude Code, que colapsa con `+N lines`) detectó:
- Estados intermedios consistentes en cada Op.
- Hitos cumplidos en cada cierre de sub-fase.
- Cero contexto sucio en diffs.

Patrón heredado de fase 3, mantenido y reforzado en fase 4.

### §7.4 Aprobación Op manual previene regresiones silenciosas

Cada Op fue propuesto, auditado, aprobado verbalmente, ejecutado, verificado. Cero Op ejecutado en automático. Cero regresión silenciosa en el Diff comiteado.

### §7.5 Conflicto build/dev — gotcha persistente

Lanzar `npm run build` con `npm run dev` corriendo simultáneamente produce 404s en chunks porque el dev server sirve del `.next/` viejo mientras build regenera. Pasa cada vez. Workaround: parar dev, lanzar build, relanzar dev, recargar navegador con Cmd+Shift+R. Documentado aquí para futuras sesiones.

---

## §8 — Próxima sesión (post-fase-4 inmediata)

### §8.1 Objetivo

Diagnosticar bug del play TF bajo + speed máxima (Luis). Hipótesis: timestamps de phantoms desincronizados con `LongShortPosition` cuando la vela TF nueva entra a alta velocidad.

### §8.2 Procedimiento sugerido

1. Activar flag de debug desde consola del navegador:
   ```javascript
   window.__algSuiteDebugLS = true
   ```
2. Reproducir bug: TF M1 + speed máxima + replay corriendo + LongShortPosition activo.
3. Capturar logs `[LS-DEBUG] new candle` con sus timestamps de phantoms y `ls_points`.
4. Comparar timestamps: si `phantom_first_t` difiere de la timestamp esperada por `ls_points`, hipótesis confirmada.
5. Diseñar fix mínimo (probablemente en `_mkPhantom` o en cómo se calcula `_phN` cuando la TF cambia).
6. Sub-fase de fix con sus propios commits atómicos.

### §8.3 Estimación

~1.5-2h. Fix probablemente sea de 5-15 líneas. La complejidad está en el diagnóstico, no en el código.

---

## §9 — Comandos de verificación rápida (cualquier sesión futura)

```bash
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite

# Verificar estado limpio
git status
git log --oneline -5

# Verificar invariantes fase 4
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"

# Verificar build
npm run build
```

Si los 2 greps devuelven VACÍO + build verde: invariante fase 4 sigue vivo. Si alguno falla: alguien rompió la disciplina del render layer y hay que diagnosticar antes de seguir.

---

**Fin del HANDOFF cierre fase 4.**

Render layer aislado al carácter. Producción estable. Próxima sesión: bug del play.
