# PROMPT ARRANQUE SESIÓN 60 — forex-simulator-algorithmic-suite

## 0. Contexto fijo (no cambia)
- CTO/revisor = chat web (razona y verifica en sandbox propio); Ramón Tarinas (trader, NO dev) ejecuta en zsh de su iMac. Bytes en disco = única verdad. Español, tono CTO, UN paso por mensaje corto.
- Repo: /Users/principal/Desktop/forex-simulator-algorithmic-suite · Prod: simulator.algorithmicsuite.com (Vercel, deploy on push a main) · BD Supabase epxoxxadclhfnwfuwoyx.
- macOS: `md5` / `md5 -q` (no md5sum). Git siempre con `| cat`. Heredoc SIEMPRE quoted ('EOF').
- Gate §3.1: ejecutar `git push` ES el OK nominal de Ramón; smoke de producción tras cada push.
- Disciplina de parche: python con assert md5 base + regiones verificadas + unicidad de piezas; ABORT sin escribir si algo difiere. Guard de transporte: `test "$(md5 -q /tmp/parcheX.py)" = "<md5>" && python3 ... || echo NO EJECUTADO`.
- REGLAS s59 (vigentes): (1) el heredoc del parche se transcribe SIEMPRE del view del archivo del sandbox; (2) transcripción AL CARÁCTER, incluidas secuencias de escape (\u2500 NO se normaliza a ─); (3) ningún byte de un assert nace del ojo del CTO — todo derivado de paste/sonda o estructural (líneas de guiones: assert prefijo + set(resto)=={'─'}); (4) smokes en cuarto limpio: reiniciar dev server + recarga dura antes de testear (los errores "Object is disposed"/"Maximum update depth" con dev vivo durante parcheo son artefactos de Fast Refresh).

## 1. Estado al cierre de s59 (madrugada 6-jun-2026)
- **FASE 7 CERRADA. Contrato A-G completo en una sesión.** Producción = HEAD = origin = `62c0d9a`.
- _SessionInner.js: 3063 → **1496** (−51%), md5 `455c0a79`. pages/dashboard.js: 777 → **620**, md5 `6c1ed51c`.
- Nuevos s59: lib/sessionUi.js (7213fdf1) · components/TfInputModal.js (f22afef5) · sessionStyles.js (ce80cd15) · Spin.js (8d3fe388) · CloseModal.js (f8f09062) · PositionOverlay.js (6510748c) · SessionTopBar.js (75003ba0) · ReplayPill.js (6ddd3de2) · SessionBottomBar.js (d9341a43) · SessionPanels.js (19fb8a86) · useChallengeFlow.js 429 (1088a21f) · usePairData.js 170 (db548669) · useTradingActions.js 245 (7dacdccc).
- Muertos eliminados con lápida: LOT_PRESETS/RR_PRESETS (A), openPosition+tpPips (F), bloque Analytics inalcanzable del dashboard (G).
- Mini-cambio producto (Ramón): barra de progreso del replay = solo indicador (seek por clic eliminado: ver futuro = trampa).
- PLAN MAESTRO tickeado: refactor/PLAN-MAESTRO-POST-S40.md md5 `c5c3a46e` (líneas 54 y 245, diana ≤~1000 explicada: mountPairRef + efecto TF diferidos como cortes E2 futuros por entrelazamiento).
- BD baseline s59 (re-verificar en PASO 0): trades 154 · tagueados 0 · sesiones 24 · drawings 21 · backup_s57 154. El borrado de cuenta del 5-jun (c58eb5d1) fue legítimo de Ramón; la rutina de borrado toca 4 TABLAS incl. session_chart_config.
- Errores CTO s59: 4 (esperado de grep estimado; heredoc de memoria; escapes normalizados; guiones a ojo ×2 intentos). Racha: 5→3→2→4. Los guards pararon TODOS antes de tocar disco.

## 2. Agenda s60 (orden propuesto)
1. **PASO 0** baseline bicapa: repo clavado vs `62c0d9a` (wc/md5 de _SessionInner 1496/455c0a79 y dashboard 620/6c1ed51c) + conteos BD vs baseline.
2. **[BLOQUEANTE APERTURA] Mini-fase destructiva POST-F7**: botón de borrado admin. Diseño con confirmación dura, la rutina debe cubrir las 4 tablas (sim_trades, sim_sessions, session_drawings, session_chart_config), smoke SOLO con cuenta de pruebas.
3. **Mini-corte H** (toca Spin.js): pantalla de carga animación "antimateria" Algorithmic Suite + rotación de consejos de trading/mentalidad R.A.M.M.FX estilo TradingView. Pedir a Ramón su lista de consejos o proponerle una.
4. **Pasada de limpieza de muertos** (con derivación de call-sites, NUNCA asumir): imports de _SessionInner posiblemente muertos tras E/F (fetchSessionCandles, setSeriesData, ReplayEngine, chartViewport parcial, chartRender, realizePnl…), EquityCurve + selectedSession + vars del memo en dashboard tras G, warning dev borderColor/border en botones del pill, duplicate key borderRadius en objeto s del dashboard.
5. **Deudas BD** (si hay hueco): FK duplicada session_id · DROP backups s45/s48/s57 · *10 yenes · asimetría lastBreachIdx.
6. Tras "todo bien" de Luis + Giancarlo post-F7 → card PDFs/videos → **apertura**.

## 3. Cortes futuros anotados (no urgentes)
- E2 chart-mount: extraer mountPairRef (233 líneas, entrelazado con dibujos/SL-TP/text tool/drag) + efecto TF.
- Limpieza profunda dashboard (memo y estado huérfanos) cuando se toque esa página por otra razón.
