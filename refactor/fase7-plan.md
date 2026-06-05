# PLAN FASE 7 — reducción de _SessionInner.js (Bloque 5 del PLAN MAESTRO)

> Redactado sesión 59, 5 junio 2026. PLAN MAESTRO §2.5: diana ≤ ~1000-1200 líneas.
> Estado al redactar: _SessionInner.js 3063 líneas, md5 4c628d05, mapa PASO 0 s59 cerrado en bytes. CERO código escrito.
> Disciplina: SIN cambios de comportamiento (refactor puro de estructura), bicapa estricta por corte, esbuild + next build --no-lint + smoke local antes de cada commit, push SOLO en checkpoints con gate §3.1.

## §0 — Qué es y para qué sirve

_SessionInner.js es el monolito del simulador: la página de sesión entera (chart, replay, trading, drawings, challenge) vive en un archivo de 3063 líneas. Las fases 3-6 ya sacaron viewport, render y matemática de trading a lib/; esta fase saca lo que queda de extraíble (componentes de UI, estilos, helpers y la orquestación en custom hooks) hasta dejar _SessionInner como orquestador de ≤ ~1200 líneas. Incluye enterrar la pestaña gemela 'analytics' del dashboard (decisión s58).

Regla de oro: NINGÚN corte cambia comportamiento. Solo se mueve código de sitio. Cualquier mejora funcional que apetezca por el camino se anota como deuda y NO se hace aquí.

## §1 — Mapa en bytes (PASO 0 s59, cerrado)

| Tramo | Líneas | Contenido |
|---|---|---|
| L1-34 | 34 | imports |
| L36-157 | ~122 | constantes (TF/SPEED/LOT/RR/ALL_PAIRS), normPair, chartOpts L47-110, formatters fmtPx/fmtPnl/pnlColor/fmtTs, computePhantomsNeeded L122, TF_VALID/TF_OPTS, TfInputModal L137-157 |
| L159-1875 | ~1717 | cuerpo de SessionPage: 52 useState + 32 useRef + 34 useEffect + 31 useCallback, 0 useMemo |
| L1876-2628 | ~753 | JSX del return (14 bloques comentados) |
| L2630-2729 | ~100 | estilos: glass, glassBorder, const s, css |
| L2730-2741 | ~12 | Spin + StatBadge |
| L2742-2886 | ~145 | CloseModal |
| L2888-3063 | ~176 | PositionOverlay (4 efectos + update + onLineMouseDown propios) |

Dominios del cuerpo (línea de arranque):
- Drawings/herramientas: onTextPillMouseDown 297, saveSessionDrawings 330 + ~15 efectos de refs/teclado L295-580.
- Challenge: challengeLocked 285, refreshChallengeStatus 619, collectOpenPositions 737, callChallengeAdvance 759, handleChallengePass/Fail/Cta/GoTo* 788-824, checkChallengeBreach 1631-1769, modales JSX L2595-2628.
- Datos/chart por par: loadPair 825 (~288 líneas), mountPair 1113, updateChart 1116, efectos 1196/1289/1306.
- Replay: eng 1309, saveProgress 1310, handlePlayPause 1315, handleStep 1333, handleSpeed 1334, handleGoTo 1335.
- Trading UI: openPosition 1352, closePosition 1365, líneas de posición 1437-1448, preview/limit 1449-1548, handlePositionDragEnd 1478, checkSLTP 1549, checkLimitOrders 1576-1630.
- Pares: addPair 1770, removePair 1777 + efectos de cierre 1786/1798/1848.

dashboard.js (777, md5 2020c41a): conserva la copia gemela de métricas+journal de la vista interna 'analytics', muerta de facto desde el Corte D de s58 (el item del sidebar ya navega a /analytics). Recon propio en su corte.

## §2 — Contrato de cortes propuesto (orden frío → caliente)

Cada corte: recon en bytes de su tramo → extracción 1:1 → esbuild PASS → next build --no-lint PASS → smoke local → commit con identidad md5. Push SOLO en los 3 checkpoints, con gate §3.1 y smoke de producción inmediato.

- **Corte A — cabeza fría.** chartOpts + formatters + computePhantomsNeeded + constantes TF/pares/presets + normPair → lib/sessionUi.js (módulo puro, sin React). TfInputModal → components/TfInputModal.js. Estimado: −~110 → ~2950.
- **Corte B — estilos + cola fría.** glass/glassBorder/s/css → components/sessionStyles.js. Spin/StatBadge/CloseModal/PositionOverlay → archivos propios en components/ importando estilos y helpers. Estimado: −~420 → ~2530.
- **Corte C — paneles JSX.** Bloques presentacionales del return a componentes con props explícitas y cero lógica nueva: ReplayPill, BottomBar, PositionsPanel, PendingOrdersPanel, TradesJournal, SessionContextMenu (TopBar/TFBar solo si rinden). Estimado: −~300-400 → ~2150. **CHECKPOINT PUSH 1.**
- **Corte D — hook challenge.** Estado+efectos+callbacks del challenge (285, 619-824, 1631-1769) → components/useChallengeFlow.js (convención useDrawingTools/useCustomDrawings). Estimado: −~330 → ~1820.
- **Corte E — hook datos/chart.** loadPair + mountPair + updateChart + efectos asociados → components/usePairData.js. El corte más gordo y delicado (closures sobre refs compartidas). Estimado: −~440 → ~1380.
- **Corte F — hook trading UI.** openPosition→checkLimitOrders + líneas de posición → components/useTradingActions.js. Estimado: −~260 → ~1120. **CHECKPOINT PUSH 2.**
- **Corte G — enterrar pestaña gemela del dashboard.** Recon en bytes de dashboard.js → eliminar la vista interna 'analytics' (copia de métricas+journal) y el estado/imports que solo ella usa. Estimado: dashboard 777 → ~600. **CHECKPOINT PUSH 3** + tick PLAN MAESTRO.

## §3 — Reglas específicas de la fase

- Cambio de comportamiento = BUG de la fase. Las extracciones son movimientos 1:1; si un movimiento exige reescritura, se para y se decide con Ramón.
- Invariantes fase 4 se RE-BASELINAN explícitamente cuando un corte mueve sus símbolos (computePhantomsNeeded en A: queda import + 2 usos = 3 líneas, mismo conteo; cr.series sigue en 0). Cada corte declara sus conteos esperados pre/post derivados del archivo REAL.
- Canales de bytes (reglas 11-13): archivos NUEVOS por heredoc; ediciones sobre _SessionInner por parche python con assert de md5 base + unicidad de anclas; NADA de código por el prompt de Claude Code.
- Smoke local mínimo por corte: cargar sesión, replay play/pause/step/speed, abrir+cerrar trade (market y limit), drawing básico, paneles posiciones/órdenes/journal, modal de cierre. En D-F se añade flujo challenge completo con sesión de prueba.
- Los testers viven en producción: cada checkpoint de push va precedido de build+smoke local limpio y seguido de smoke prod inmediato.

## §4 — Riesgos

- **Closures y orden de declaración** al extraer hooks: estado/refs compartidos entre dominios (p.ej. updateChart lo usan replay y trading). Mitigación: D-F de uno en uno, contrato de entrada/salida del hook escrito en el recon del corte, smoke completo.
- **Prop-drilling en paneles** (Corte C): el ahorro neto baja por el cableado de props. Si un panel rinde < ~25 líneas netas, se queda dentro.
- **El archivo es el corazón del producto**: una regresión aquí rompe el simulador entero. De ahí el orden frío→caliente y los push solo en checkpoints smoke-verificados.
- Las estimaciones de líneas son aproximadas (§52): cada corte fija sus números en su recon, derivados del archivo real pre-edit.

## §5 — Criterio de cierre de fase

_SessionInner.js ≤ ~1200 líneas (diana ~1000-1100) con build y smoke prod PASS, pestaña gemela enterrada, invariantes re-baselinadas y documentadas, PLAN MAESTRO con tick de Fase 7.
