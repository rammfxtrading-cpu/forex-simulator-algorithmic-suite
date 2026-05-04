# CLAUDE.md — Forex Simulator (Algorithmic Suite)

> Brief de contexto y reglas para Claude Code.
> Lee este archivo entero al inicio de cada sesión antes de tocar código.

---

## 1. Quién soy y qué quiero

Soy Ramón, trader y mentor. **No soy desarrollador.** Tengo claro qué quiere hacer este producto y por qué, pero no escribo código. Tú eres el desarrollador senior. Yo soy quien decide qué se construye.

**Mi prioridad absoluta ahora mismo:** dejar el **core de backtesting** del simulador a la calidad de TradingView (drawings) y FX Replay (replay engine). Nada más importa hasta que esto esté sólido.

---

## 2. Qué es Algorithmic Suite (contexto del ecosistema)

Algorithmic Suite es una plataforma para traders. Tiene 3 productos en repos separados:

- **algorithmic-suite-hub** — el portal principal, login, dashboard del usuario, mensajería, gestión de accesos. **No vives aquí.**
- **forex-simulator-algorithmic-suite** — el simulador de backtesting. **Aquí vives tú.**
- **journal-algorithmic-suite** — diario de trades. **No vives aquí.**

Los 3 comparten **un único proyecto Supabase**.

### Qué tablas son de cada producto (importante)

**Tablas del simulador (las puedes tocar):**
- `sim_sessions` — sesiones de simulación
- `sim_trades` — trades cerrados
- `session_chart_config` — config visual del chart por sesión
- `session_drawings` — dibujos por sesión
- `sim_drawing_templates` — plantillas de dibujos
- `user_chart_config` — config global del chart por usuario
- `user_tool_config` — config de herramientas de dibujo por usuario

**Storage del simulador (Supabase Storage, NO es una tabla Postgres):**
- `forex-data` — bucket de Storage con velas históricas M1 por par y año.
  Estructura: `{PAIR}/M1/{YEAR}.json` (ej: `EURUSD/M1/2026.json`, ~12 MB con
  ~125k velas M1 por año). El endpoint `pages/api/candles.js` primero busca
  en este bucket; si el archivo no existe, descarga automáticamente de
  Dukascopy (vía paquete `dukascopy-node`), valida completitud (umbrales
  por día de la semana), reintenta 3 veces si hay agujeros, y guarda al
  bucket con protección anti-degradación (no sobreescribe si la nueva
  versión tiene < 95% velas que la existente). Documentación del fix
  pipeline robusto: deuda 5.2 cerrada en sesión 15 (commit `89e36ee`).

**Tablas de OTROS productos (NO tocar):**
- `profiles` — perfil del usuario, compartida con hub y journal. **Solo lectura.**
- `messages` — del hub. **No tocar.**
- `screenshots` — del hub y journal. **No tocar.**
- `notas`, `trades` — del journal. **No tocar.**

⚠️ **Importante**: el hub LEE `sim_sessions` para mostrar métricas en su dashboard. Si cambias el esquema de `sim_sessions`, rompes el hub. Cualquier cambio de esquema en `sim_sessions` requiere mi aprobación explícita y avisar al hub.

---

## 3. Reglas absolutas — no negociables

1. **NUNCA hagas migraciones de Supabase ni cambios de esquema sin que yo lo apruebe explícitamente.** No `CREATE TABLE`, no `ALTER TABLE`, no `DROP`, no `DELETE` masivos. Si necesitas cambiar el esquema, **PARA y pregúntame**.

2. **NUNCA hagas push a GitHub sin que yo lo apruebe.** Puedes hacer commits locales (eso lo hablamos abajo), pero `git push` solo cuando yo te diga.

3. **NUNCA toques los repos del hub o del journal.** Trabajas exclusivamente dentro de `forex-simulator-algorithmic-suite`. Si una refactorización requiere cambios en el hub, **PARA y pregúntame**.

4. **NUNCA introduzcas dependencias nuevas sin avisarme primero.** Si necesitas instalar un paquete npm, **PARA y dime qué paquete y por qué**, y yo decido.

5. **Trabajo solo en producción de Supabase.** No tengo Supabase local. Eso significa que el código que ejecutes con `npm run dev` apunta a la BD real. **Sé extremadamente cuidadoso con cualquier query que modifique datos.** Mejor: durante el refactor, si una operación destructiva no es estrictamente necesaria, no la hagas.

6. **Antes de empezar cualquier tarea grande, propón un plan y espera mi OK.** No te lances a refactorizar 1000 líneas sin que yo confirme primero qué vas a hacer y por qué.

---

## 4. El objetivo del refactor del core

### 4.1 Qué es "el core" en este proyecto

El core de backtesting está formado por estos módulos, hoy mezclados en `_SessionInner.js` (3000+ líneas) y archivos sueltos:

- **Replay engine** — `lib/replayEngine.js`. Avance de velas, play/pause, speed.
- **Sistema de coordenadas** — `lib/chartCoords.js`. Conversión time/price ↔ pixel.
- **Drawing tools (LWC plugin)** — `components/useDrawingTools.js`. TrendLine, Rectangle, Fib, LongShortPosition.
- **Custom drawings (propios)** — `components/useCustomDrawings.js`. Dibujos no soportados por el plugin.
- **Render del chart** — disperso en `_SessionInner.js`. setData, setVisibleRange, etc.
- **Estado de la sesión** — disperso en `_SessionInner.js`. positions, orders, balance, currentTime.

### 4.2 Cómo debería estar (objetivo)

Quiero una arquitectura por capas, con **un único source of truth por dominio**:

1. **Source of truth de datos** — un único modelo de candles. Todo deriva de ahí.
2. **Replay engine aislado** — solo expone `currentIndex` / `currentTime`. No toca viewport ni drawings.
3. **Viewport engine aislado** — calcula visible range. No toca datos ni drawings.
4. **Drawings engine aislado** — drawings se persisten siempre como `{timestamp, price}`, **nunca como píxeles**. Convertir a píxel es responsabilidad del render, en cada frame.
5. **Render layer** — convierte estado a píxel.

### 4.3 Comportamiento esperado (los criterios de "está hecho")

El simulador está terminado cuando se cumplen TODOS estos comportamientos sin excepción:

- Dibujo una línea, cambio de TF 70 veces seguidas, la línea se queda **EXACTAMENTE** en el mismo timestamp y precio. **No se mueve ni un píxel**.
- Le doy play en M1 a velocidad máxima, el chart no se freezea ni se entrecorta.
- Cierro un par mientras el replay corre, no aparece ningún error en consola.
- Pulso Delete con una tool seleccionada, se borra solo esa, no rompe nada.
- Cambio de par durante un replay, las posiciones del par anterior siguen ahí cuando vuelvo.
- Hago zoom y pan sin que las drawings se descoloquen.
- Recargo la página, las drawings y posiciones están exactamente como las dejé.
- No aparecen errores tipo `Series not attached to tool ...` ni `Object is disposed` en consola, en ningún flujo.

**Inspiración de calidad:**
- **Replay engine** → como FX Replay (Advanced Charts). Fluido, sin tirones.
- **Drawings** → como TradingView clásico. Sólidos, no se mueven, se editan bien, persisten.

### 4.4 Lo que NO es prioridad ahora

- Sistema de challenges (modal "Has pasado la fase", review, bloqueos). Ya funciona en el flujo normal desde dashboard. **No tocar a menos que el refactor del core lo exija.**
- Panel de admin del hub. **No vivimos en ese repo.**
- Journaling. **Otro producto.**
- Diseño visual / UX. **Después del core.**

---

## 5. Cómo trabajamos juntos (Ramón ↔ Claude Code)

### 5.1 Mi nivel técnico

No programo. Sigo instrucciones. Cuando me digas algo:
- Si me pides ejecutar un comando → dámelo en un bloque para copiar y pegar
- Si me pides "verifica X" → dime qué tengo que mirar exactamente y qué resultado esperar
- Si propones una decisión técnica → explícame en lenguaje llano por qué (no me importa entrar en detalles, pero quiero entender el porqué)

### 5.2 Antes de grandes cambios — siempre plan primero

Si una tarea va a tocar más de 100 líneas o más de 2 archivos, **antes de tocar nada**:

1. Léeme el código relevante
2. Explícame qué vas a hacer y por qué
3. Espera mi OK
4. Solo entonces implementa

Si algo no funciona como esperabas a mitad de tarea, **PARA y pregúntame**. No improvises.

### 5.3 Commits

Política de commits:
- Cada tarea acabada y probada → propón un commit con mensaje claro
- Te enseñas el `git diff` o un resumen de qué hace el commit
- Yo digo "ok, haz commit" o "espera, antes prueba X"
- **Nunca push a GitHub sin que yo lo diga.** Aunque hayas hecho 10 commits locales.

Si vas a hacer una serie de cambios que pueden romper algo → **antes** propón crear una rama nueva (`fix/...` o `refactor/...`) para no contaminar `main`.

### 5.4 Pruebas

No tengo tests automáticos en este proyecto. La forma de probar es **manual con `npm run dev`**:
1. Tú aplicas el cambio
2. Yo lanzo `npm run dev` en otra terminal y pruebo el flujo concreto
3. Yo te reporto qué veo (errores en consola, comportamiento raro, etc)
4. Iteramos

Si propones añadir tests automáticos para alguna pieza nueva, **avísame primero** — depende del momento del refactor.

---

## 6. Stack técnico (resumen para que lo tengas claro)

- **Next.js 14** (`pages/` router, no `app/`)
- **React 18**
- **Supabase** (auth + Postgres + Storage)
- **lightweight-charts** + plugins de line-tools (`lightweight-charts-line-tools-core`, `-lines`, `-rectangle`, `-fib-retracement`, `-long-short-position`, `-path`)
- **Vercel** para deploy automático (push a `main` → producción)
- Sin TypeScript (`.js` plano)
- Sin tests automáticos
- Sin linter estricto

Importante: el plugin `lightweight-charts-line-tools-core` **viene de un fork en GitHub**, no de npm oficial. Si necesitas modificarlo, hay que usar `patch-package` (ya está en devDependencies).

---

## 7. Glosario rápido

- **Sesión** — una sim_session en BD. Una "partida" del simulador con un par y un rango de fechas.
- **Replay** — el motor que avanza velas en el tiempo, simulando que va pasando.
- **Drawings** — herramientas de dibujo sobre el chart (líneas, rectángulos, fib, etc.)
- **LWC** — Lightweight Charts, la librería del chart.
- **Phantom** — vela ficticia que se añade temporalmente al final del chart durante el replay.
- **TF** — timeframe (M1, M5, H1, etc.)
- **Killzones** — sesiones de mercado (Asia, Londres, NY) sombreadas en el chart.

---

## 8. Reglas de comunicación

- Responde siempre en **español de España**.
- Si dudas entre varias opciones técnicas, **enséñame las opciones** con pros y contras antes de decidir.
- No me adules ni me digas "buena pregunta". Ve directo al grano.
- Si te pido algo que es mala idea técnica, **dímelo claramente** y propón alternativa.
- Si encuentras un bug que no te he pedido arreglar, **avísame, no lo arregles solo**. Quizá tiene contexto que no conoces.

---

## 9. Estado actual conocido (lo que sabemos que está roto)

A día de hoy, el simulador tiene estos comportamientos **incorrectos** confirmados por uso real:

1. Drawings desaparecen / se descolocan al cambiar de TF varias veces
2. Replay se freeze en M1 a velocidad máxima
3. Posiciones se descolocan al hacer drag
4. Cambiar TF + play rompe cosas
5. Error `Series not attached to tool ...` aparece en consola al cerrar pares con drawings
6. Error `Object is disposed` aparece al cambiar de sesión rápidamente

Estos NO son fallos a parchear uno a uno. Son síntomas del acoplamiento del core. **El refactor por capas es la solución de raíz.**

---

## 10. Cómo arrancamos cada sesión

Al inicio de cada sesión nueva conmigo:

1. Lee este archivo entero
2. Lee el último commit (`git log -1`)
3. Lee `git status` para saber el estado del working tree
4. Resúmeme en 3-5 líneas: dónde estamos del refactor, qué fue lo último que hicimos, qué es lo siguiente
5. Espera mi confirmación antes de empezar

---

*Última actualización: 4 mayo 2026 — sesión 15. Sub-Op E de deuda 5.2: corregir §2 (forex-data es bucket Storage, no tabla Postgres).*
