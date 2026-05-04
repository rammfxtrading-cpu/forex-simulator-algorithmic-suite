# HANDOFF — cierre sesión 15 (deuda 5.2 cerrada en producción)

> Fecha: 4 mayo 2026, sesión "simulador 15".
> Autor: Claude Opus 4.7 (CTO/revisor) + Ramón Tarinas (pegamento humano).
> Estado al redactar: `origin/main` = `89e36ee`, `main` local = `3f1da59` (commit corrección CLAUDE.md pendiente de push). Deuda 5.2 cerrada al carácter en producción Vercel desde ~18:20.

---

## §0 — TL;DR (para arrancar sesión 16 leyendo solo esto)

Sesión densa con resultado limpio: **deuda 5.2 (pipeline datos históricos no robusto + 4 días faltantes EUR/USD enero 2026) cerrada al carácter en producción en una única sesión.**

- **Producción Vercel** sirve nuevo `pages/api/candles.js` con validación + retry + protección anti-degradación desde ~18:18.
- **Bucket Supabase Storage** `forex-data/EURUSD/M1/2026.json` sustituido al carácter por versión completa (12.47 MB, 124.541 velas) que recupera 3 de los 4 días faltantes (2 ene, 8 ene, 9 ene) y refleja al carácter el bajo volumen real del 1 ene 2026 (festivo internacional, 116 velas reales).
- **Smoke test producción al carácter:** Ramón verificó que el play de EUR/USD enero 2026 ahora recorre 1, 2, 8, 9 ene sin saltos.
- **CLAUDE.md §2 corregido al carácter:** `forex-data` documentado como bucket Supabase Storage (no tabla Postgres).

**Decisión arquitectónica de la sesión:** se eligió camino largo (todo bien de raíz hoy) sobre camino corto (parchear hoy + código mañana) tras pregunta explícita de Ramón: *"a ver... kiero k todo kede bien de un principio... no sabia que habia que tocar el codigo.."*. La explicación honesta del flujo `Dukascopy → /api/candles → Supabase → Simulador` (vs el modelo mental de Ramón de `Dukascopy → Supabase → Simulador`) motivó la decisión correcta.

---

## §1 — Estado al carácter al cierre

### §1.1 Git

- `origin/main` = `89e36ee` (fix deuda 5.2 pusheado y deployado).
- `main` local = `3f1da59` (1 commit adelante de origin: corrección CLAUDE.md).
- Working tree limpio.
- Rama feature `fix/deuda-5.2-pipeline-datos` mergeada a main por fast-forward, conservada localmente.

### §1.2 Commits de la sesión 15 sobre `0fe5fbc`

```
3f1da59 (HEAD -> main) docs(deuda-5.2): corregir CLAUDE.md §2 - forex-data es bucket Storage, no tabla
89e36ee (origin/main, fix/deuda-5.2-pipeline-datos) fix(deuda-5.2): pipeline robusto de descarga de datos historicos
0fe5fbc docs(sesion-14): cerrar sesion 14 con deuda 4.6 cerrada en produccion
```

### §1.3 Producción Vercel

- Deploy en HEAD `89e36ee` (Ready, smoke OK al carácter).
- Endpoint `/api/candles` ahora con validación + retry + protección anti-degradación.
- Bucket `forex-data/EURUSD/M1/2026.json` con archivo bueno (12.47 MB).

### §1.4 Backups locales en `~/Desktop/forex-backups/`

| Archivo | Tamaño | Origen |
|---|---|---|
| `2026.json` | 13.080.925 bytes | Versión bueno descargado hoy (idéntico a `eurusd-2026-bueno.json`). Es el que se subió al bucket. |
| `eurusd-2026-bueno.json` | 13.080.925 bytes | Backup del bueno. |
| `eurusd-2026-MALO-bucket-original.json` | 11.106.984 bytes | Backup del archivo malo del bucket antes de borrarlo. Retiene los 4 días faltantes históricos. Mantener por trazabilidad forense. |

---

## §2 — Las 4 sub-Ops ejecutadas en la sesión

### §2.1 Sub-Op B — Diseño funciones de robustez (chat web, ~17:30)

Auditoría comparada al carácter `pages/api/candles.js` vs `scripts/restore-2026.js`:

- `restore-2026.js` ya tenía retry de 3 intentos + espera 5s, pero solo se invoca manualmente, no desde el endpoint.
- `pages/api/candles.js` no tenía validación, ni retry, ni protección anti-degradación. Sobrescribía bucket con `upsert: true` sin condiciones.

4 decisiones de diseño firmadas por Ramón:

1. **Scope:** solo `/api/candles` (no endurecer también `restore-2026.js`).
2. **Endpoint admin diagnose-data:** NO en esta deuda. Helper interno suficiente.
3. **Umbrales día completo:** tabla por día de la semana. Domingo ≥50, Lun-Jue ≥1200, Viernes ≥1000, Sábado =0.
4. **Backup pre-sobreescritura:** comparador relativo (no permitir nueva versión < 95% velas que existente). Sin archivo `.backup` en bucket.

### §2.2 Sub-Op C — Diagnóstico inocuo + implementación (Claude Code + chat web, ~17:45-18:10)

**Op 1 — Script de diagnóstico inocuo `scripts/test-redownload-2026.js`** (137 líneas).
- Descarga EUR/USD 2026 a `/tmp/`. NO toca Supabase.
- Cuenta velas día a día y reporta agujeros con tabla.
- Resultado al carácter:
  - 124.541 velas en 38.9s.
  - 2 días detectados como agujeros: **1 ene** (116 velas, festivo) y **4 may** (900 velas, día actual parcial).
  - **3 de los 4 días críticos recuperados:** 2 ene (1319 velas), 8 ene (1433 velas), 9 ene (1317 velas).
  - 1 ene tiene 116 velas reales (Dukascopy SÍ tiene datos del día, no es agujero del pipeline).

**Op 2 — Refactor `pages/api/candles.js`** (originalmente 116 líneas, final 282 líneas).
Cambios al carácter:
- Constante `THRESHOLD_BY_WEEKDAY` con umbrales por día de semana.
- 2 helpers nuevos: `countCandlesPerDay`, `detectGaps`.
- Función nueva `fetchFromDukascopyWithRetry` con bucle de 3 intentos + validación post-descarga + espera 5s entre fallos.
- `fetchFromDukascopy` reescrita: usa el wrapper, lee versión existente del bucket antes de subir, compara ratio y aborta si < 95%.
- Handler sin cambios funcionales (solo ajuste de mensaje de log).

Build verde local (`✓ Compiled successfully`, 0 warnings).
Greps invariantes fase 4 vacíos (no se rompió nada del refactor anterior).

### §2.3 Sub-Op D — Operación quirúrgica de sustitución del archivo (panel Supabase + git, ~18:00-18:20)

**Plan ejecutado al carácter:**

1. Backup local del archivo malo descargándolo desde el panel Supabase a `~/Desktop/forex-backups/eurusd-2026-MALO-bucket-original.json` (11.106.984 bytes).
2. **Borrar** `EURUSD/M1/2026.json` del bucket (mensaje: "Successfully deleted 1 file(s)").
3. Renombrar local `eurusd-2026-bueno.json` a `2026.json` antes de subir.
4. **Subir** `2026.json` al bucket vía panel "Upload files" (12.47 MB, 124.541 velas).
5. Verificación visual al carácter del panel: `Added on 4/5/2026, 18:13:57`, `application/json - 12.47 MB`. ✅
6. Commit `89e36ee` (rama feature) → merge fast-forward a main → `git push origin main`.
7. Vercel auto-deploya.
8. Smoke producción Ramón al carácter: cargar EUR/USD enero 2026, dar play, ver que recorre 1, 2, 8, 9 ene sin saltos. **Confirmado al carácter.**

### §2.4 Sub-Op E — Corregir CLAUDE.md §2 (chat web + git, ~18:20-19:15)

Sustitución completa del archivo `CLAUDE.md` (originalmente 211 líneas, final 229 líneas).

Cambios al carácter:

- **§2 "Tablas del simulador":** quitada la línea `- forex-data — velas históricas`.
- **§2 nuevo bloque "Storage del simulador":** documenta al carácter `forex-data` como bucket Supabase Storage con estructura `{PAIR}/M1/{YEAR}.json`, comportamiento del endpoint `/api/candles` con validación + retries + protección, referencia al commit `89e36ee`.
- **§6 "Stack técnico":** "Supabase (auth + Postgres)" → "Supabase (auth + Postgres + Storage)". Era omisión histórica.
- **Pie de archivo:** última actualización a 4 mayo 2026 sesión 15.

Commit `3f1da59` con mensaje detallado. **Pendiente de push** al carácter al cierre de esta redacción.

---

## §3 — Errores §9.4 detectados, asumidos, corregidos en vivo

5 errores del CTO/revisor capturados explícitamente durante la sesión.

### §3.1 HANDOFFs sesiones 13 y 14 NO indexados en project_knowledge al arrancar

Patrón idéntico al error §9.4 nº4 capturado en sesión 14. Implicación operativa: durante toda la sesión 15, el contenido del HANDOFF sesión 14 fue tratado como **inferencia documentada del prompt**, no como verificación al carácter. Eso fue lo correcto. Pero confirma que la indexación de project_knowledge tiene lag temporal y NO se puede asumir disponibilidad de los HANDOFFs más recientes al arrancar sesión.

**Mitigación adoptada:** ningún Op se apoyó en datos del HANDOFF sesión 14 sin verificación previa al carácter desde el shell de Ramón.

### §3.2 Cambio de recomendación CTO al detectar el modelo mental incorrecto de Ramón

Tras Sub-Op A/B, mi recomendación inicial fue Camino Corto (parchear bucket hoy + código robusto otro día). Cuando Ramón preguntó *"...no sabia que habia que tocar el codigo.. pork? tenia entendido k dukascopy metia a supabase y supabase al simulador..."*, detecté que mi recomendación corta no estaba alineada con su objetivo real *"todo bien de un principio"*. Cambié recomendación a Camino Largo (todo de raíz hoy).

**Lección capturada:** las recomendaciones CTO basadas en *"reducir scope para acabar antes"* son legítimas en muchos casos, pero deben re-evaluarse cuando salen a la luz aspectos del modelo mental del usuario que cambian la ecuación. Aquí Ramón pensaba que el código no había que tocarlo. Al ver que sí, su preferencia obvia fue tocarlo bien.

### §3.3 Predicción de líneas de `pages/api/candles.js` ligeramente fuera de rango

Predije "+120 a +160 líneas" en `pages/api/candles.js`. Realidad: candles.js +208 / -31, lo que da +177 netas. Ligeramente por encima del rango alto. La razón: subestimé las líneas del bloque de comentarios documentando umbrales y JSDoc-style comments en helpers. No fue grave (build verde, lógica correcta), pero la predicción fue optimista.

**Lección:** cuando se añade un módulo nuevo con varias funciones públicas, contar **al menos 30-40% más** de las líneas estimadas puro código, en concepto de comentarios/documentación inline.

### §3.4 No advertí proactivamente el bug del cliente con `.md` antes del Sub-Op E

El prompt de arranque sesión 15 §10 explicitaba el bug del cliente que autoformatea `nombre.md` a `[nombre.md](http://nombre.md)`. Lo conocía. Al guiar Sub-Op E, le pasé a Ramón comandos con `.md` literales sin recordarle el bug por adelantado. Resultado: el primer `mv` de Ramón usó el patrón autoformateado y dejó el archivo en disco con un nombre desastroso. Tuvimos que reconstruir el escape (`mv CLAUDE* TEMP-FILE`, luego `mv TEMP-FILE "CLAUDE"".md"`).

**Tiempo perdido:** ~5 min, sin daño material (el contenido del archivo siempre estuvo bien). Pero evitable.

**Lección operativa:** cuando se redacten comandos para Ramón que toquen archivos `.md`, **siempre** redactar primero con wildcards (`CLAUDE*`) o con técnicas de escape (`"CLAUDE"".md"`). NUNCA escribir `.md` literal en bloques de comandos copiables del chat web.

### §3.5 Subestimación del tamaño total de la sesión

Al cerrar Sub-Op B (~17:30) ofrecí estimación "~2-3h" para sesión completa. Realidad: ~4h hasta cierre completo (Sub-Op E + HANDOFF). El error fue no contar el tiempo de redacción del HANDOFF (~30 min) ni la operación quirúrgica del bucket (~20 min), ni la fricción del bug del cliente con `.md` (~5 min adicional).

**Lección:** sumar siempre **45-60 min de overhead** a toda estimación de sesión que incluya operación en producción + cierre documentado.

---

## §4 — Métricas de la sesión 15

- **Inicio:** ~13:20 (4 may 2026).
- **Cierre operativo (push deuda 5.2):** ~18:20.
- **Cierre documental (HANDOFF redactado):** ~19:25.
- **Duración total:** ~6 horas.
- **Commits firmados:** 2 (1 fix `89e36ee`, 1 docs `3f1da59`).
- **Deudas cerradas:** 5.2.
- **Líneas modificadas netas:**
  - `pages/api/candles.js` +177 (final 282 líneas, antes 116).
  - `scripts/test-redownload-2026.js` +137 (archivo nuevo).
  - `CLAUDE.md` +13 / -3 (final 229 líneas, antes ~211).
  - `HANDOFF-cierre-sesion-15.md` (este documento).
- **Errores §9.4 detectados y corregidos en vivo:** 5.
- **Reglas de la disciplina bicapa respetadas al carácter:** §1 (NO Edit sin OK), §2 (validación shell zsh nativo), §3 (NO push sin OK), §4 (verificación literal vs inferencia), §5 (commits atómicos por Op), §6 (comandos git separados), §7 (aprobación opción 1 manual cuando se usó Claude Code... aunque en sesión 15 se trabajó mayormente desde TextEdit + shell directo, no Claude Code), §10 (bug cliente con `.md` — error capturado §3.4), §11 (no sugerir parar por cansancio sin que Ramón lo pida — respetado al carácter; se ofreció pausa una vez post-Op 3, Ramón pidió seguir, no se volvió a sugerir).

---

## §5 — Decisiones tomadas durante la sesión

1. **Camino Largo vs Camino Corto:** elegido Camino Largo tras pregunta de Ramón sobre el modelo mental del flujo de datos. Ver §3.2.
2. **Manual upload vs programmatic upload:** elegido manual (panel Supabase) sobre programático (adaptar `restore-2026.js`). Razón: menos cosas tocando producción a la vez, más trazable.
3. **Comparador pre-upsert vs backup `.backup` en bucket:** elegido comparador relativo (95% threshold). Más simple, automático, no acumula basura.
4. **Endpoint admin diagnose-data:** descartado en esta deuda. Si en futuro se necesita auditar otros pares/años manualmente, montamos script ad-hoc puntual.
5. **Push tras 4h de sesión:** Ramón no pidió diferir. CTO ofreció pausa una vez (al cierre de Op 3 antes del HANDOFF). Ramón eligió seguir con *"prioricemos la calidad, sigamos"*. Decisión respetada al carácter, no se volvió a sugerir parar.

---

## §6 — Bugs en producción al cierre de sesión 15

| Bug | Estado | Notas |
|---|---|---|
| Deuda 5.2 — pipeline datos no robusto + 4 días faltantes EUR/USD 2026 | ✅ **CERRADO** en producción al carácter desde sesión 15 |
| Deuda 4.6 — drawing se descoloca al cambiar TF (granularidad) | ✅ Cerrado en sesión 14 (`2851ef7`) |
| Bug del play TF bajo + speed máx (LongShortPosition) | ✅ Cerrado en sesión 12 (`8d99188`) |
| Deuda 4.5 — `__algSuiteExportTools` no registrado | ⏳ Backlog |
| Warning lifecycle plugin LWC al borrar drawings | ⏳ Backlog |
| B5 — `409 Conflict` `session_drawings` race | ⏳ Backlog |
| Warning React `borderColor` shorthand | ⏳ Backlog |
| Limpieza ramas locales acumuladas (8 ramas viejas) | ⏳ Sesión corta puntual |
| **Quota Supabase Free excedida — periodo de gracia hasta 24 may 2026** | ⚠️ **Nueva deuda apuntada en sesión 15** |

---

## §7 — Deuda nueva apuntada — Plan Supabase Free excedido

Durante Sub-Op D Ramón vio en el panel Supabase un aviso amarillo persistente:

> "Organization plan has exceeded its quota. You have been given a grace period until 24 May, 2026."

No es bloqueante para la operación de hoy ni para los próximos 20 días, pero **requiere decisión antes del 24 may 2026**. Opciones:

- **Opción A:** subir de plan Supabase (Pro plan, ~$25/mes). Permite seguir creciendo sin límites duros.
- **Opción B:** auditar y limpiar storage. Probable: el bucket `forex-data` con M1 de varios años + varios pares acumula gigas. Ver si hay archivos huérfanos o si se puede comprimir/archivar.
- **Opción C:** mover datos históricos antiguos (2024) a almacenamiento más barato (S3 propio, R2 de Cloudflare).

Recomendación CTO no firmada todavía: probable Opción A si el coste es asumible. Es la solución más simple y evita riesgo de romper el flujo `/api/candles`.

**Apuntada como deuda nueva separada de la 5.2.** Decidir en sesión dedicada antes del 24 may.

---

## §8 — Plan para sesión 16

### §8.1 Recomendación de orden

1. **Primero el push pendiente del cierre sesión 15:**
   - Mover este HANDOFF al repo.
   - Comitearlo en main.
   - Push de los 2 commits pendientes (`3f1da59` corrección CLAUDE + commit del HANDOFF).
2. **Decisión Ramón sobre próxima deuda a atacar.** Candidatos (no excluyentes):

   **Opción A — Decisión sobre quota Supabase** (sesión corta, 30-60 min). Antes del 24 may 2026.

   **Opción B — Limpieza ramas locales acumuladas** (sesión corta, 30 min). Higiene del repo.

   **Opción C — Fase 5 (drawings lifecycle, refactor mayor)**. Es el bloque grande del refactor. Ver `refactor/core-analysis.md §6 fase 5` y `refactor/HANDOFF-cierre-sesion-12.md §3.4` (Camino A para fix definitivo de la deuda 4.6 si reaparece, aunque ya está cerrada en producción).

   **Opción D — Verificación opcional de los demás pares 2026.** ~10-15 min. Adaptar `scripts/test-redownload-2026.js` para 6 pares × año 2026 y reportar agujeros. Si todos limpios → tranquilidad total. Si alguno tiene huecos → operación quirúrgica equivalente a sub-Op D pero con ese par.

### §8.2 Mi recomendación profesional para sesión 16

**Opción D primero (15 min de tranquilidad)** + **Opción A después (decisión quota antes del 24 may)**. Después seguir con fase 5 o backlog según prioridad de Ramón.

Razón Opción D primera: el código nuevo de `/api/candles` solo se activa cuando un alumno abre un par/año que NO existe en bucket. Los archivos que YA están en bucket no se revalidan automáticamente. Si AUDUSD 2026, GBPUSD 2026, etc. tienen agujeros similares, no se detectarán hasta que un alumno se queje. Mejor proactivamente.

Razón Opción A después: deadline 24 may forzoso.

### §8.3 PASO 0 obligatorio en sesión 16

Antes de tocar nada, leer en este orden:
1. `CLAUDE.md` (raíz del repo) — corregido en sesión 15 sub-Op E.
2. **`refactor/HANDOFF-cierre-sesion-15.md`** (este documento) — único punto de entrada al estado actual.
3. `refactor/HANDOFF-cierre-sesion-14.md` si necesita contexto de la deuda 4.6 que hereda en producción.
4. `pages/api/candles.js` — código actual del endpoint (post-fix deuda 5.2).
5. `scripts/test-redownload-2026.js` — script de diagnóstico, plantilla para Opción D.

### §8.4 Verificaciones de arranque sesión 16

```bash
git status
git log --oneline -10
git branch --show-current
```

Esperado: rama `main`, working tree limpio, HEAD = commit del HANDOFF sesión 15 (hash a determinar al comitear esta redacción).

Invariantes fase 4 vivos:

```bash
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"
grep -n "computePhantomsNeeded" components/_SessionInner.js
```

Esperado: los 2 primeros vacíos, el tercero con 3 matches.

---

## §9 — Reflexión final del CTO/revisor

Esta sesión fue una de las más limpias hasta la fecha en términos de relación coste-beneficio. Tres aprendizajes que merece la pena dejar fijados:

**1. La pregunta correcta de Ramón cambia el plan correcto.** Mi recomendación inicial Camino Corto era técnicamente legítima pero no maximizaba lo que Ramón realmente quería. La pregunta *"...no sabia que habia que tocar el codigo.. pork?"* destapó el desalineamiento. **Lección reforzada:** cuando Ramón hace preguntas básicas sobre el flujo técnico, no son pérdida de tiempo — son señales de que mi modelo mental del proyecto y el suyo están en distintos lugares y eso afecta a la decisión arquitectónica.

**2. El bug del cliente con `.md` es un boss técnico recurrente.** El prompt de arranque sesión 15 §10 ya advertía. Aun así caímos en él porque no apliqué la mitigación proactiva (wildcards y escapes) en los comandos del Sub-Op E. **Lección operativa:** crear plantilla mental para todos los comandos shell que toquen archivos `.md`: nunca escribir `.md` literal en bloques copiables del chat. Usar siempre wildcard o escape.

**3. La operación quirúrgica del bucket fue una pieza de ingeniería conservadora bien aplicada.** Bajamos el archivo malo a backup forense **antes** de borrarlo. Subimos el bueno. Verificamos al carácter en el panel antes de ningún push de código. Push del código robusto reinició la caché del servidor de Vercel "gratis" como efecto colateral. Cero ventana de error visible para alumnos. Cero downtime. Es la disciplina §11 del prompt sesión 15 ("acciones destructivas en producción: NUNCA tocar producción sin backup explícito + plan de rollback verificado al carácter") aplicada al carácter.

---

*Fin del HANDOFF de cierre sesión 15.*
