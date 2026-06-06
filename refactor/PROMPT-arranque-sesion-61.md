# PROMPT ARRANQUE SESIÓN 61 — forex-simulator-algorithmic-suite

## 0. Contexto fijo (no cambia)
- CTO/revisor = chat web (razona y verifica en sandbox propio); Ramón Tarinas (trader, NO dev) ejecuta en zsh de su iMac. Bytes en disco = única verdad. Español, tono CTO, UN paso por mensaje corto.
- Repo: /Users/principal/Desktop/forex-simulator-algorithmic-suite · Prod: simulator.algorithmicsuite.com (Vercel, deploy on push a main) · BD Supabase epxoxxadclhfnwfuwoyx.
- macOS: `md5` / `md5 -q` (no md5sum). Git siempre con `| cat`. Heredoc SIEMPRE quoted ('EOF').
- Gate §3.1: ejecutar `git push` ES el OK nominal de Ramón; smoke de producción tras cada push.
- Disciplina de parche: python con assert md5 base + unicidad de anclas; ABORT sin escribir si algo difiere. Guard de transporte: `test "$(md5 -q /tmp/parcheX.py)" = "<md5>" && python3 ... || echo NO_EJECUTADO`.
- REGLAS vigentes (s59 + s60): (1) heredoc SIEMPRE transcrito del view del archivo del sandbox; (2) transcripción AL CARÁCTER incluidas secuencias de escape; (3) ningún byte de un assert ni md5 de transporte nace del ojo del CTO — sandbox-first sin excepciones (el guard cazó 1 md5 inventado en s60: NO_EJECUTADO, cero daño); (4) smokes en cuarto limpio (reiniciar dev + recarga dura; "Object is disposed" con dev vivo = artefacto); (5) tests destructivos, también los NEGATIVOS, solo sobre cuentas sacrificables (en s60 un test negativo se hizo sobre el modal de Luis: salió bien, pero se prohíbe); (6) cada paste de Ramón abre terminal nueva en ~: TODO bloque lleva el cd embebido.

## 1. Estado al cierre de s60 (mañana 6-jun-2026)
- **s60 cerró 3 frentes:** mini-fase destructiva admin-wipe (BLOQUEANTE, prod `7f80353`) + mini-corte H pantalla de carga (prod `25678d9`) + saneo BD. Runtime producción = `25678d9`; encima va el commit docs de cierre (tick PLAN MAESTRO + este prompt) — PASO 0 debe verificar ese delta como solo-docs.
- Archivos clave: _SessionInner.js **1501** / `d3120feb` · admin.js **1134** / `925c6d7f` · AntimatterLoader.js **376** / `f64335ba` (nuevo) · pages/api/admin/wipe-simulador.js **112** / `dc59f4de` (nuevo) · dashboard.js 620 / `6c1ed51c` · PLAN-MAESTRO `988222fb`.
- **Admin-wipe:** POST /api/admin/wipe-simulador, confirmación dura = email exacto, auto-protección admin, borra 5 tablas por user_id (sim_trades, session_drawings, session_chart_config, sim_drawing_templates, sim_sessions la última para que su CASCADE arrastre) + simulador_activo=false en el mismo acto. UI: botón rojo + modal en detalle de alumno. Smoke bicapa local (negativo 400 cero filas / positivo cuenta de pruebas) + negativo en prod PASS. Doctrina producto: perfil del hub y journal JAMÁS se tocan; re-suscripción = desde 0.
- **Mini-corte H:** AntimatterLoader (orbe canvas: núcleo respirando, 3 anillos 3D con cometas, 340 partículas densidad-núcleo, sonar, fugaces serenas 8-12s) + 22 consejos R.A.M.M.FX congelados ("Vamos pa´encima!" fijo de apertura, sabatina solo en sábado, duración proporcional). Corte fino everReadyRef: primera carga de datos = orbe en RAÍZ del JSX (fuera de chartWrap z0, gana a barras/pill z20-25); cambio de par posterior = mini-overlay intacto. Lección: chartWrap crea contexto de apilamiento (diagnóstico cruzado con revisión read-only de Claude Code, coincidente).
- **BD baseline s60:** trades **154** · tagueados **0** · sesiones **25** · drawings **22** · plantillas **14** · backup_s57 **154** · chart_config ~3 (re-verificar). Cuadre auditado: Ramón borró su Challenge de madrugada y creó uno nuevo (05:22) durante smokes — CASCADE se llevó sus 6 trades y 1 drawing. FK duplicada `fk_session` ELIMINADA (quedan session_id_fkey + user_id_fkey) · backups s45/s48 DROP · plantillas huérfanas 0.
- Cuenta de pruebas: `ramon test` (ramon1506mm@gmail.com, id 359d1786) quedó wipeada y simulador_activo=false; reutilizable como sacrificable reactivándola. Admin propio (rammfxtrading@) con simulador_activo=false a mano: bypass admin de useAuth verificado en bytes, no le bloquea nada.
- Observación nueva s60: ECONNRESET y un 401 de 34s contra /api/candles durante cargas (red/endpoint, no UI). "Object is disposed" sigue siendo deuda conocida solo-dev.
- Errores CTO s60: **4** ("out_of_session" afirmado desde el plan s57 y no desde bytes; aritmética de predicción de líneas ×2; md5 de transporte inventado sin pasar por sandbox — parado por el guard). Racha: 3→2→4→4. Los guards pararon TODO antes de tocar disco.

## 2. Agenda s61 (orden propuesto)
1. **PASO 0** bicapa: repo (wc/md5 de la tabla de §1; HEAD = docs encima de `25678d9`, delta solo refactor/) + BD vs baseline (incluir chart_config y plantillas).
2. **Pasada de muertos** (heredada, con derivación de call-sites en bytes, NUNCA asumir): imports de _SessionInner posiblemente muertos tras E/F (fetchSessionCandles, setSeriesData, ReplayEngine, chartViewport parcial, chartRender, realizePnl…), EquityCurve + selectedSession + vars del memo en dashboard tras G, warning dev borderColor/border en botones del pill, duplicate key borderRadius del objeto s del dashboard.
3. **Deudas si hay hueco:** DROP backup_s57 (gate, ya cumplió su sesión de gracia), *10 yenes (ojo de trader), asimetría lastBreachIdx, investigar ECONNRESET/401 de /api/candles.
4. Tras "todo bien" de Luis + Giancarlo post-F7 → card PDFs/videos → **apertura**.

## 3. Cortes futuros anotados (no urgentes)
- E2 chart-mount: extraer mountPairRef (233 líneas, entrelazado con dibujos/SL-TP/text tool/drag) + efecto TF.
- Limpieza profunda dashboard (memo y estado huérfanos) cuando se toque esa página por otra razón.
