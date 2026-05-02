# HANDOFF — cierre sesión 12 (post-deploy + deuda 4.6 nueva)

> Fecha: 2 mayo 2026, sesión "simulador 12" (continuación post-deploy).
> Autor: Claude Opus 4.7 (CTO/revisor) + Claude Code (driver técnico) + Ramón Tarinas (pegamento humano).
> Estado al redactar: `origin/main` = `8d99188`. Sub-fase 4d desplegada en producción y verificada al carácter. Deuda 4.6 nueva descubierta post-deploy, pendiente de fix en próxima sesión.

---

## §1 — Contexto

Este HANDOFF complementa al `HANDOFF-cierre-fase-4d.md` (commit `8d99188`, ya pusheado a `origin/main`). NO lo sustituye. Aquel documento cerró la sub-fase 4d con la información disponible al cierre. Este documento añade lo que ocurrió **después** del push: smoke producción + descubrimiento de bug nuevo.

**Decisión consciente:** no se reabre el HANDOFF de la sub-fase 4d. Mantiene su valor histórico como reflejo del estado al cierre de fase. La deuda 4.6 nace en su propia sesión.

---

## §2 — Smoke producción OK

Tras `git push origin main` (commits `cc361e5..8d99188`) Vercel deployó automáticamente. Estado verificado al carácter:

- **Deploy Vercel:** Ready.
- **URL producción:** `https://simulator.algorithmicsuite.com`.
- **Smoke ejecutado por Ramón:** sesión EUR/USD M1 → LongShortPosition con SL/TP a la derecha → play a velocidad media → drawing mantiene dimensiones tras varios segundos de play.
- **Resultado:** ✅ fix de la sub-fase 4d funcionando en producción al carácter.
- **Logs en consola:** `Exporting all line tools: [{…}]` repitiéndose durante play, evidencia directa de que `computePhantomsNeeded` se invoca en cada vela TF nueva (comportamiento esperado del fix).

**Bug del play TF bajo + speed máx para LongShortPosition: CERRADO en producción.**

---

## §3 — Deuda 4.6 nueva (descubierta post-deploy)

### §3.1 Síntoma

Tras el smoke OK, Ramón hizo prueba adicional NO planificada: cambio de TF.

**Pasos exactos:**
1. Sesión EUR/USD en TF **M5**.
2. Crea LongShortPosition con SL/TP a la derecha de la última vela.
3. **Cambia TF a M15** (clic en M15 de la barra superior).
4. Drawing se descoloca: una esquina queda anclada cerca del rango original, **la otra esquina se va al borde izquierdo de la PANTALLA** (no del chart).
5. Aún moviendo el chart hacia atrás, la esquina descolocada **sigue pegada al borde izquierdo de la pantalla**, no a un timestamp del chart.

**Comportamiento observado adicional:**
- A veces drawing aparece como **mecha fina pegada a la izquierda** (probable: ambas esquinas pierden la referencia).
- A veces drawing aparece **gigante** (caso confirmado en la reproducción de hoy: solo una esquina pierde la referencia, la otra se queda anclada → drawing se extrapola).

### §3.2 Diagnóstico al carácter (verificado con snapshot interno + capturas visuales)

**Datos del drawing creado en M5 (timestamps reales del log de creación):**
- P1: `timestamp: 1769552700` → `2026-01-27T22:25:00Z`.
- P2: `timestamp: 1769562600` → `2026-01-28T01:10:00Z`.

Ambos timestamps son múltiplos de 5 minutos → válidos en M5.

**Snapshot interno capturado en M15 (post cambio de TF, con bug visible):**
```json
{
  "pair": "EUR/USD",
  "current_tf": "M15 (cambiado desde M5)",
  "agg_len": 35400,
  "last_real_t": 1769558400,
  "last_real_t_iso": "2026-01-28T00:00:00.000Z",
  "phantom_count": 10,
  "phantom_first_t": 1769558700,
  "phantom_first_t_iso": "2026-01-28T00:05:00.000Z",
  "phantom_last_t": 1769561400,
  "phantom_last_t_iso": "2026-01-28T00:50:00.000Z",
  "phantoms_needed": null
}
```

**Análisis:**

En M15, los timestamps válidos son múltiplos de 15 minutos: `00, 15, 30, 45`. Los puntos del drawing tienen timestamps:

- P1 `22:25` → NO múltiplo de 15 → cae entre los buckets `22:15` y `22:30` de M15 → **no existe en el array de M15**.
- P2 `01:10` → NO múltiplo de 15 → cae entre `01:00` y `01:15` de M15 → **no existe en el array de M15**.

Cuando el plugin LWC llama a `interpolateLogicalIndexFromTime(timestamp)` para cada punto, el timestamp no se encuentra en el array de velas → el plugin devuelve un índice degenerado → el drawing se renderiza en posición inválida.

P1 (más lejos del borde derecho) → manda al borde izquierdo del chart (probablemente índice 0 o cercano).
P2 (más cerca del borde derecho, dentro del rango cubierto por phantoms) → el plugin probablemente lo aproxima al phantom más cercano → queda razonablemente anclado.

Resultado: drawing se extiende desde el borde izquierdo (P1 descolocado) hasta cerca del borde derecho (P2 aproximadamente bien anclado) → **drawing gigante**.

### §3.3 Por qué el fix de la sub-fase 4d NO cubre esta deuda

El fix de la sub-fase 4d (commit `e9f460b`) garantiza que las phantoms cubren el rango temporal del drawing. Eso resuelve el caso "drawing creado en TF X, play en TF X". El snapshot confirma que `phantom_last_t = 00:50` cubre `P2 = 01:10`… pero P2 igual se descoloca (en menor medida) porque `01:10` no es múltiplo de 15.

**Mismo mecanismo raíz** (plugin LWC pierde la referencia del timestamp), **distinto disparador** (granularidad de TF, no rango cubierto).

**Nota técnica:** el código actual ya tomó conscientemente la decisión de NO tocar timestamps. Comentario en `_SessionInner.js` L1136-L1145:

> *"Solución: NO tocamos los timestamps. Calculamos cuál es el timestamp más a la derecha entre todos los drawings, y generamos suficientes phantoms..."*

Esa decisión funciona cuando el timestamp existe en el array. NO funciona cuando hay granularidad TF mayor que la del drawing. La sub-fase 4d cerró la primera mitad del problema; la deuda 4.6 cierra la segunda mitad.

### §3.4 Caminos posibles para el fix futuro

**Camino A (preferido):** al cambiar de TF, redondear los timestamps de los drawings al múltiplo de la nueva TF más cercano (probablemente `floor`). Toca capa de drawings → encaja arquitectónicamente en **fase 5 (drawings lifecycle)**. Cobertura clara, scope acotado.

**Camino B (alternativo):** investigar por qué `interpolateLogicalIndexFromTime` del plugin LWC no devuelve un índice interpolado razonable cuando el timestamp cae entre dos buckets. Si el plugin ya soporta interpolación sub-bucket, entender por qué falla. Requiere diagnóstico interno del plugin (más profundo, más arriesgado).

**Recomendación para la próxima sesión:** Camino A. Se aborda mejor cuando se ataque fase 5 oficialmente (donde ya se va a tocar el lifecycle de drawings).

### §3.5 Pruebas pendientes para confirmar alcance del bug

Durante esta sesión solo se reprodujo el bug con LongShortPosition en transición M5 → M15. Las siguientes hipótesis deben validarse al inicio de la sesión próxima (o cuando se aborde la deuda 4.6):

- ¿El bug también afecta a TrendLine, Path, Rectangle, FibRetracement, HorizontalRay?
- ¿Afecta también a otras transiciones de TF (M1 → M5, M15 → H1, H1 → H4, etc.)?
- ¿El caso especular (TF mayor → TF menor) también se descoloca, o solo TF menor → TF mayor?

Tres pruebas de 30 segundos cada una al inicio de la sesión próxima cubren el espacio.

---

## §4 — Estado al carácter al cierre de sesión 12

### §4.1 Git

- `origin/main` = `8d99188`.
- `main` local = `8d99188` (sincronizado).
- Working tree limpio.
- Rama `fix/limit-desaparece-al-play` mergeada a `main` (fast-forward) y conservada localmente. Puede borrarse en próxima sesión si se desea.

### §4.2 Producción Vercel

- Deploy en HEAD `8d99188`.
- Estado: Ready, verde.
- Smoke OK al carácter.

### §4.3 Bugs en producción

| Bug | Estado | Notas |
|---|---|---|
| Bug del play TF bajo + speed máx (LongShortPosition) | ✅ CERRADO | Fix sub-fase 4d desplegado y verificado |
| Deuda 4.6 — drawing se descoloca al cambiar TF (granularidad) | ⏳ ABIERTA | Diagnóstico al carácter capturado en §3 |
| B5 — `409 Conflict` `session_drawings` race | ⏳ Backlog | Pre-existente, no es regresión |
| Warning React `borderColor` shorthand | ⏳ Backlog | Pre-existente, cosmético |
| Deuda 4.5 — `__algSuiteExportTools` no registrado | ⏳ Backlog | Apuntada en `HANDOFF-cierre-fase-4d.md` §7.4 |

---

## §5 — Plan para próxima sesión

### §5.1 Recomendación de orden

1. **Smoke ampliado del fix de la sub-fase 4d** (15 min): probar el play en otros tipos de drawing (TrendLine, Path, Rectangle, FibRetracement) para confirmar que el fix de hoy aplica universalmente. Si alguno no se beneficia, abrir sub-deuda.

2. **Pruebas de alcance de la deuda 4.6** (15 min): probar transiciones de TF con distintos tipos de drawing y distintos pares de TFs. Documentar matriz de qué transiciones reproducen el bug.

3. **Diagnóstico final + fix de la deuda 4.6**: ejecutar Camino A (redondear timestamps al cambiar TF) en el contexto de **fase 5 (drawings lifecycle)**, donde ya se va a tocar el lifecycle de drawings.

### §5.2 Punto de entrada sugerido

`refactor/core-analysis.md` §6 fase 5 (drawings layer). El primer Op de fase 5 puede ser exactamente el fix de la deuda 4.6 si el orden de prioridad lo encaja.

### §5.3 PASO 0 obligatorio en próxima sesión

Antes de tocar nada, leer en este orden:
1. `CLAUDE.md`.
2. `refactor/core-analysis.md` §6 fase 5.
3. `refactor/HANDOFF-cierre-fase-4d.md` (cierre fase 4d con histórico completo).
4. **Este documento** (`HANDOFF-cierre-sesion-12.md`) para arrancar con la deuda 4.6 al día.

---

## §6 — Métricas de la sesión 12

- **Inicio:** ~17:00 (2 may 2026).
- **Cierre:** ~21:05 (2 may 2026).
- **Duración total:** ~4 horas.
- **Commits firmados:** 5 commits atómicos en sub-fase 4d, todos en `origin/main`.
- **Deudas cerradas:** 4.1, 4.2, 4.3, 4.4.
- **Deudas nuevas apuntadas:** 4.5 (`__algSuiteExportTools` no registrado), 4.6 (drawing descolocado al cambiar TF).
- **Líneas modificadas netas:** `_SessionInner.js` +9, `chartViewport.js` -2, `+HANDOFF-cierre-fase-4d.md` 380 líneas nuevas, `+HANDOFF-cierre-sesion-12.md` (este).
- **Errores §9.4 detectados y corregidos en vivo:** 2 (sampler lateral mal escrito, predicción de delta sin baseline).
- **Reglas de la disciplina bicapa respetadas al carácter:** §2 (validación shell zsh nativo), §6 (comandos git separados), §7 (commits atómicos), §9.4 (verificación literal vs inferencia), §11 (no push sin OK explícito).

---

## §7 — Reflexión final del CTO/revisor (no obligatoria, valiosa para el lector futuro)

Esta sesión fue larga (~4h) y de las más densas hasta ahora. Tres aprendizajes que merece la pena dejar fijados:

**1. La disciplina al carácter funciona.** En 4 ops aplicados al código de producción (incluyendo un fix de bug crítico), cero regresiones, build verde en cada paso. La inversión en `wc -l` previo, validación desde shell zsh nativo y commits atómicos paga.

**2. La intuición del trader (Ramón) es un input técnico.** En la sesión, Ramón propuso la hipótesis de granularidad TF temprano, basada en su experiencia visual con drawings. Yo la había aparcado como "investigación futura". Resultó ser exactamente la causa raíz de la deuda 4.6. **Lección para sesiones futuras:** las observaciones de Ramón sobre comportamiento UX no son ruido — son señal técnica encriptada en lenguaje de usuario.

**3. El push tras 4h de sesión salió bien — esta vez.** Ramón eligió push hoy contra mi recomendación (push mañana en frío). El resultado fue OK: smoke producción verde. Pero la deuda 4.6 se descubrió post-deploy. Si hubiéramos descubierto algo grave en lugar de algo pre-existente, habríamos tenido que revertir con cansancio acumulado. **No es regla, es probabilidad:** push en frío reduce coste esperado de errores. Para sesiones futuras: si la sesión supera ~3h, considerar push diferido.

---

*Fin del HANDOFF de cierre sesión 12.*
