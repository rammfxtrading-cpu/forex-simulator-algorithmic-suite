# PROMPT ARRANQUE SESIÓN 62 — forex-simulator-algorithmic-suite

## 0. Contexto fijo (no cambia)
- CTO/revisor = chat web (razona y verifica en sandbox propio); Ramón Tarinas (trader, NO dev) ejecuta en zsh de su iMac. Bytes en disco = única verdad. Español, tono CTO, UN paso por mensaje corto.
- Repo: /Users/principal/Desktop/forex-simulator-algorithmic-suite · Prod: simulator.algorithmicsuite.com (Vercel, deploy on push a main) · BD Supabase epxoxxadclhfnwfuwoyx.
- macOS: `md5` / `md5 -q` (no md5sum). Git siempre con `| cat`. Heredoc SIEMPRE quoted ('EOF').
- Gate §3.1: ejecutar `git push` ES el OK nominal de Ramón; smoke de producción tras cada push.
- Disciplina de parche: python con assert md5 base + unicidad de anclas; ABORT sin escribir si algo difiere. Guard de transporte: `test "$(md5 -q /tmp/parcheX.py)" = "<md5>" && python3 ... || echo NO_EJECUTADO`.
- REGLAS vigentes (s59+s60+s61): (1) heredoc SIEMPRE transcrito del view del archivo del sandbox; (2) transcripción AL CARÁCTER incluidas secuencias de escape; (3) ningún byte de un assert ni md5 de transporte nace del ojo del CTO — sandbox-first sin excepciones; (4) smokes en cuarto limpio (reiniciar dev + recarga dura; tras cambiar node_modules además `rm -rf .next`); (5) tests destructivos, también los NEGATIVOS, solo sobre cuentas/sesiones sacrificables; (6) cada paste de Ramón abre terminal nueva en ~: TODO bloque lleva el cd embebido; (7) otro agente (Claude Code) puede diagnosticar en read-only pero NUNCA escribe en el repo — su informe se contrasta contra bytes antes de darlo por acta.

## 1. Estado al cierre de s61 (noche 6-jun-2026)
- **s61 cerró 4 frentes:** PASO 0 bicapa PASS (desviación −1 sesión/−1 drawing auditada = borrado de Ramón) · poda de 14 imports muertos en _SessionInner (prod `050ffb4`, build + smoke local y prod PASS) · diagnóstico completo y aparcado de s61-A/B · DROP backup_s57. Runtime producción = `050ffb4`; encima va el commit docs de cierre — PASO 0 debe verificar ese delta como solo-docs.
- Archivos clave: _SessionInner.js **1499** / `c6c4d714` · admin.js 1134 / `925c6d7f` · AntimatterLoader.js 376 / `f64335ba` · wipe-simulador.js 112 / `dc59f4de` · dashboard.js 620 / `6c1ed51c` · PLAN-MAESTRO con md5 nuevo impreso por el parche3 de cierre.
- **s61-A (APARCADO por decisión de producto):** positions con borde en horas de finde colapsan a línea ~1 vela y cuestan de seleccionar. Raíz en bytes: interpolateLogicalIndexFromTime/interpolateTimeFromLogicalIndex (core difurious) extrapolan lineal con el intervalo de las 2 PRIMERAS velas + nuestra serie NO rellena el finde con velas (FX Replay sí). BD sana: puntos persistidos correctos, daño solo-render. Fix gap-aware (binaria + interpolación local) construido, compilado y publicado en fork `rammfxtrading-cpu/lightweight-charts-line-tools-core` rama fix/gap-aware-interpolation SHA `e9a6328` (geometry.ts 1080→1125, 9a892687→c1b906f4, rollup PASS); revertido del simulador SIN llegar a prod. Camino correcto si un día se quiere calidad FX Replay: rellenar el finde en la serie/phantoms (usePairData) y reevaluar entonces si el fix del fork suma. Mitigación de selección anotada: hit-test de positions solo por borde (hitTestBackground:false en rects + showAutoText:false en useDrawingTools L112).
- **s61-B (mismo paraguas, no urge):** el feed/render salta de vie ~20:45 (M15) a dom 22:00 — preexistente en prod, investigar feed /api/candles si se abre la mejora.
- **Riesgo supply-chain anotado:** los 6 plugins line-tools instalan de github:difurious SIN SHA (master mutable en cada deploy de Vercel) y el core corre `prepare` (rollup) en cada install. Pasada futura: anclar a SHA o forks propios.
- **BD baseline cierre s61:** trades **154** · tagueados **0** · sesiones **25** · drawings **22** · plantillas **14** · chart_config **3** · backup_s57 **ELIMINADA** (no esperarla). Incluye la sesión-repro sacrificable de Ramón (Challenge ~16:59 con 1 position drawing): si la borra antes de s62, esperar 24/21.
- Claude Code en s61: diagnóstico read-only de s61-A; informe contrastado contra bytes (núcleo confirmado; 1 afirmación desmentida: patch-package NO estaba en package.json). Intentó escribir su informe en el repo: rechazado (regla 7).
- Errores CTO s61: **2** (paso 6 del repro vendido como "dato oro" cuando era ambiguo por determinismo del render; no detectar que el caso de prueba del repro era degenerado — lo reencuadró el dato de Ramón sobre FX Replay). Racha: 3→2→4→4→2. Cero NO_EJECUTADO; predicción de líneas del parche1 exacta.

## 2. Agenda s62 (orden propuesto)
1. **PASO 0** bicapa: repo (wc/md5 de §1; HEAD = docs encima de `050ffb4`, delta solo refactor/) + BD vs baseline (sin backup_s57; condicional sesión-repro).
2. **Pasada de muertos dashboard** (heredada, derivación en bytes): EquityCurve + selectedSession + vars del memo tras G, warning dev borderColor/border en botones del pill, duplicate key borderRadius del objeto s.
3. **Deudas si hay hueco:** *10 yenes (ojo de trader), asimetría lastBreachIdx, ECONNRESET/401 de /api/candles.
4. Tras "todo bien" de Luis + Giancarlo post-F7 → card PDFs/videos → **fase planes/límites** (Básico 21 €/6 huecos · Extra 36 €/12 · gate server-side de creación de sesiones + landing de pago en subdominio) → **apertura**.

## 3. Cortes futuros anotados (no urgentes)
- E2 chart-mount: extraer mountPairRef + efecto TF.
- Limpieza profunda dashboard cuando se toque por otra razón.
- Mejora finde calidad FX Replay (serie con relleno + fork e9a6328) · anclar los 6 plugins a SHA.
