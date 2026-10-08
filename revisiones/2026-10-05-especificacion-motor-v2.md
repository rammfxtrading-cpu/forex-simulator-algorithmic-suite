# Simulador · especificación del motor y de la cartera, v2.1

**Fecha:** 5-oct-2026 · **Rama:** `auditoria-simulador` · **Solo especificación:** no hay código de motor ni de cartera.

**v2.1 (5-oct-2026, tarde):** decisiones del CTO tras la segunda revisión de Astra (`~/Desktop/revisiones-suite/2026-10-05-astra-simulador-diseno-2.md`, V2-01 a V2-08). Están en el **§ 12**. Lo que contradecía a la v2 se ha corregido en su sitio y lo señala «(v2.1)». Las cifras nuevas de A01, A03, A06, A10 y A11 están calculadas con aritmética exacta (fracciones), no a mano.

Responde uno a uno a la revisión de Astra del diseño (`~/Desktop/revisiones-suite/2026-10-04-astra-simulador-diseno.md`, E01–E11, CD01–CD07, G01–G05), con las decisiones del CTO del 4 y 5 de octubre. Lo que no se puede cerrar con lo decidido va marcado **PENDIENTE** y no se inventa.

**Alcance:** este simulador, el que está en uso. Nada se diseña para otros productos.

---

## 0. Decisiones del CTO que esta especificación da por cerradas

| Tema | Decisión |
|---|---|
| Autoridad | El navegador envía **comandos e intención de avance**; el servidor ejecuta el **mismo motor puro** sobre mercado versionado y confirma; el navegador solo proyecta. **Un protocolo** para práctica y reto. |
| Durabilidad | Recibo por (sesión, `command_id`) con digest; eventos (`command_id`, ordinal); bloqueo o CAS real por sesión; reconciliar recibos antes de proyectar la cola; un solo escritor por sesión, el resto en lectura. |
| Vela ambigua | Un recorrido común por instrumento, **el peor para la equity de la cartera**, con desempate estable y marca (visible para el alumno, discreta, en la operación). Fills, protección y equity como eventos por tramo; breach irreversible con punto interno guardado. |
| Reloj | Reloj de sesión y valoración conjunta multipar; conversión con la cotización ya disponible en el evento; estado «no valorable». |
| Precios | Se declara el lado de las velas del proveedor; bid/ask con spread fijo por par; sin deslizamiento salvo hueco en la apertura. |
| Costes | Comisión de 3 USD por lote, entera al abrir y prorrateada en los recibos de cierre; precisión interna en micro-USD; sin doble cobro en parciales. Swap cero, explícito. |
| Margen | Admisión con apalancamiento 1:100; sin stop-out propio. |
| Reto | FTMO 2-Step versionado, `Europe/Prague`, reset de medianoche como evento. |
| Migración | Sesiones antiguas en solo lectura, como legado, sin recalcular. Las nuevas nacen en v1. Corte con época que bloquea a los clientes antiguos. Las sesiones legado no cuentan para el cupo. Trades legado sin mezclarse con nuevos sin indicarlo. |
| Mercado | Inmutable y versionado en trozos, con manifiesto y hash, **antes de la primera sesión v1**, en el proyecto actual ya en Supabase Pro (plan anunciado para dentro de unos dos meses). Hasta nuevo aviso no se añaden pares ni años. |
| Pares | Los 9 del bucket: EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD, AUDCAD, GBPJPY. EUR/GBP, EUR/JPY y XAU/USD retirados (`e232b1d`). |
| Métricas | Un único módulo (`lib/metricas.js`, `50c5084`); «todas las sesiones» = suma de capitales incluidos. |

---

## 1. Autoridad del servidor y protocolo (CD01, CD02, CD03, CD04, CD05, CD06, CD07)

### 1.1 Qué hace cada parte

- **Navegador:** pinta, recoge intenciones y **proyecta** el resultado probable con el mismo motor puro (para fluidez). Nunca escribe estado económico.
- **Servidor** (`/api/sim/comando`, Next, Node): autentica, comprueba el permiso de producto (`requireSimulador`), toma el bloqueo de la sesión, ejecuta el comando con el motor puro sobre el mercado versionado de esa sesión y confirma todo en una transacción.
- **Base:** guarda recibos, eventos, snapshot y libro. El alumno solo **lee** lo suyo. Las escrituras económicas van exclusivamente por una RPC que solo puede invocar `service_role` (ver § 9).

Práctica y reto usan **el mismo** protocolo: un reto es una sesión con un módulo de reglas activo, no otra vía.

### 1.2 Los comandos

| Comando | Carga | Efecto |
|---|---|---|
| `abrir` | instrumento, lado, tipo (`mercado`/`limit`/`stop`), precio (limit/stop), lotes, sl, tp, `cotizadoEn` (cursor con el que se cotizó, solo mercado) | orden o posición |
| `modificar` | id de orden o posición, nuevos sl/tp/precio | — |
| `cancelar` | id de orden | — |
| `cerrar` | id de posición, lotes (parcial u opcional) | cierre al precio vigente |
| `avanzar` | `hasta` (tiempo de mercado destino), `motivo` (`paso`, `play`, `goto`) | ejecuta todas las velas M1 de todos los pares de la sesión hasta `hasta` |
| `checkpoint` | — | caso particular de `avanzar` sin velas nuevas; persiste el cursor visto |

**Cada comando lleva:** `session_id`, `command_id` (UUID del cliente), `epoca` (la de su cliente), `version_esperada`, el token de arrendamiento y el payload normalizado. El servidor calcula el digest sobre el **sobre canónico**, que incluye el **tipo de comando** (v2.1, § 12.4): `cancelar` y `cerrar` con la misma carga no colisionan.

### 1.3 Recibo, idempotencia y eventos (CD03)

- **Tabla `sim_recibos`:** `unique (session_id, command_id)`, con digest, versión de partida y versión resultante, resultado (`aceptado`, `rechazado` y su motivo, `conflicto`), resumen económico y momento.
  - **Misma clave y mismo digest:** devuelve el recibo original, sin volver a ejecutar, aunque después hayan entrado más comandos.
  - **Misma clave y digest distinto:** `409 clave_reutilizada`. Nunca éxito.
  - **Un comando sin eventos** (un `avanzar` sin fills) también tiene recibo y cambia el cursor.
- **Tabla `sim_eventos`:** `unique (session_id, command_id, ordinal)` y `unique (session_id, seq)`. `seq` lo asigna el servidor, consecutivo por sesión. Tipos: `orden_creada`, `orden_modificada`, `orden_cancelada`, `fill`, `proteccion_activada`, `cierre`, `comision`, `reset_diario`, `breach`, `fin_de_datos`, `no_valorable`.
- **Atomicidad:** un comando es atómico entero (recibo + eventos + snapshot + libro + reto). No hay medias aceptaciones. Un lote de comandos no existe: cada comando es su propia transacción.

### 1.4 Un solo escritor y CAS real (CD04)

- **Escritor:** cada sesión tiene un escritor activo (la pestaña que tiene el **arrendamiento**, `sim_sessions.escritor = {cliente_id, hasta}`). Las demás pestañas abren en **solo lectura** y lo dicen. El arrendamiento se renueva con cada comando y caduca a los 60 s sin actividad. Otra pestaña puede tomarlo explícitamente («Usar aquí»).
- **En la base (v2.1, § 12.4):** el servidor calcula **fuera de bloqueo** y confirma con **una sola RPC final breve** que bloquea la sesión, verifica versión, época, token de arrendamiento, acceso y `terminal`, resuelve la idempotencia y escribe todo junto (CAS). El perdedor recibe `409 conflicto` con la versión confirmada y **sin efectos económicos**; su cálculo se descarta, nunca se recotiza en silencio.
- **Orden de bloqueos:** sesión, después reto padre. El borrado bloquea primero la sesión.

### 1.5 Reconciliación antes de proyectar (CD05, CD06)

- **El cliente guarda** dos cosas separadas: el **estado confirmado** (versión N) y una **cola de comandos pendientes** con su `command_id`. La cola vive en `localStorage`, con clave `usuario/sesión/época`.
- **Al cargar o reconectar,** antes de proyectar nada, pide al servidor los recibos de los `command_id` de la cola:
  - los ya confirmados salen de la cola y se aplica su resultado;
  - solo los que no tienen recibo se reenvían, **con el mismo `command_id`**;
  - después se proyecta lo pendiente.
- **Respuestas viejas:** cada respuesta trae usuario, sesión, época, versión y `command_id`. Una respuesta con versión menor que la conocida se ignora. Una de otra sesión, usuario o época, también.
- **Conflicto en un comando económico:** no se convierte en otro precio ni en otro tamaño. Se recotiza y se pide confirmación explícita.
- **Avance:** `avanzar` es durable como cualquier comando. La interfaz enseña el **horizonte confirmado** (hasta dónde está guardado) y el proyectado. Con más de 30 minutos de mercado sin confirmar, o 20 comandos pendientes, la reproducción se pausa.
- **Identidad:** al cambiar o perder la identidad se descarta la cola de esa clave sin enviarla. Nunca se proyecta la cola de A a B. Si `localStorage` falla, se avisa y se trabaja sin cola: cada comando espera a su confirmación.
- **«Guardado»** solo se enseña con recibo remoto.

### 1.6 Borrado y revocación (CD07)

- **Barrera:** borrar una sesión o revocar el acceso toman el bloqueo de la sesión y la marcan `terminal` (`borrada` / `revocada`) en la misma transacción. La RPC de comandos rechaza `terminal` después de bloquear, así que un comando que pasó el guard antes de la revocación se serializa y la ve.
- **Reintentos:** uno de una sesión borrada devuelve `410 sesion_borrada` y no la recrea.
- **FK y borrado** incluyen `sim_recibos`, `sim_eventos` y snapshots (CASCADE desde `sim_sessions`). El wipe de alumno ya revoca primero (`077b061`).

### 1.7 Cómo se sirve el mercado al servidor sin cargar el año

- **Trozos inmutables por par y día UTC** (`mercado/v1/<PAR>/<AAAA>/<MM>/<DD>.<hash>.bin.br`), en el formato binario de § 7.
- **Lectura:** para un `avanzar` de *d* días sobre *p* pares (más los de conversión), el servidor lee como mucho *d × (p + c)* trozos, con una caché LRU en memoria por instancia (límite de 64 MB).
- **Coste por comando, medido sobre la muestra de § 7.2:**
  - un día M1 de un par ocupa unos 1.440 × 24 B ≈ **35 KB** sin comprimir y ≈ **9 KB** en binario + brotli;
  - un `paso` o un `avanzar` dentro del mismo día con 2 pares y 1 de conversión, con la caché caliente: **0 lecturas**; en frío, 3 lecturas de ~9 KB (≈ 27 KB de transferencia);
  - un `goto` de una semana: ≤ 5 × 3 = 15 trozos (≈ 135 KB);
  - **el actual:** ~37,5 MB por año y par en cada carga en frío.
- **CPU:** decodificar un día son ~1.440 registros fijos, del orden de un milisegundo (**PENDIENTE:** medir en la función de Vercel). El motor recorre como mucho 1.440 velas por par y día avanzado.
- **Límite por comando:** un `avanzar` no recorre más de 7 días de mercado; un destino más lejano se trocea en comandos sucesivos con su recibo. Así el comando queda acotado en tiempo y memoria.
- **(v2.1, § 12.7)** El avance se agrupa (un comando cada varios segundos o antes de cualquier orden), los recibos de avance tienen retención, y una sesión admite como mucho **50 posiciones + órdenes**. La v1 no se habilita sin Supabase Pro.

---

## 2. El mercado: lado, tiempo, instrumentos, spreads (E05, E06, E09)

### 2.1 Lado de las velas: **BID**

- **Lo descargado:** los que bajan velas (`scripts/actualizar-diario.js`, `scripts/restore-2026.js`; `pages/api/candles.js` ya no descarga desde el bloque D, `f85ce6f`) llaman a `getHistoricalRates` **sin `priceType`**. En `dukascopy-node` 1.46.4 el valor por defecto es `priceType: "bid"` (`node_modules/dukascopy-node/dist/index.js:1712`), y la URL pide `BID_candles_min_1.bi5` (`:16468`). **Todo el bucket son velas bid.**
- **Contrato:** `bid = vela`; `ask = bid + spread(par)`.
  - BUY abre a ask y cierra a bid; SELL abre a bid y cierra a ask.
  - BUY LIMIT se activa con ask ≤ límite; SELL LIMIT con bid ≥ límite.
  - BUY STOP se activa con ask ≥ stop; SELL STOP con bid ≤ stop.
  - SL y TP de un largo se evalúan en bid; los de un corto, en ask.
- **Consecuencia:** con velas bid, el spread se **suma** una sola vez al lado ask. No hay doble conteo.

### 2.2 Tiempo (E05)

- `time` de la vela = **apertura** del minuto, en segundos UTC. **PENDIENTE (menor):** `dukascopy-node` construye el timestamp con el desfase en segundos del registro (`dist/index.js:16745`); que sea la apertura es la convención de Dukascopy. Se valida con un minuto conocido antes de publicar v1.
- **Cada vela tiene** `barOpen = time` y `availableAt = time + 60`. El estado guarda el `cursor`: la última vela **consumida** completa.
- **Una orden manual** se crea en `cursor + 60` (al cierre de la vela consumida). Nunca usa el máximo o el mínimo de una vela ya consumida.
- **Hora de los eventos intravela:** la hora modelada se registra como `instante_modelado = barOpen + fracción` y lleva `modelado: true`. Nunca se presenta como un tick observado.

### 2.3 Instrumentos

| Par | Cotizada | Pip | Dígitos | Contrato | Lote mín. · paso | Conversión a USD |
|---|---|---|---|---|---|---|
| EURUSD, GBPUSD, AUDUSD, NZDUSD | USD | 0,0001 | 5 | 100.000 | 0,01 · 0,01 | 1 |
| USDJPY | JPY | 0,01 | 3 | 100.000 | 0,01 · 0,01 | ÷ USDJPY |
| USDCHF | CHF | 0,0001 | 5 | 100.000 | 0,01 · 0,01 | ÷ USDCHF |
| USDCAD | CAD | 0,0001 | 5 | 100.000 | 0,01 · 0,01 | ÷ USDCAD |
| AUDCAD | CAD | 0,0001 | 5 | 100.000 | 0,01 · 0,01 | ÷ USDCAD |
| GBPJPY | JPY | 0,01 | 3 | 100.000 | 0,01 · 0,01 | ÷ USDJPY |

Los 9 pares tienen su par de conversión dentro de los 9.

### 2.4 Spreads fijos por par: **`costes@1`, APROBADA** (Ramón, 5-oct-2026)

Spreads de una cuenta con comisión, constantes por sesión y versionados. Ramón los aprobó tal como se propusieron: son la **versión 1 de la tabla de costes** (`costes@1`), con comisión **3 USD por lote** y **swap 0**. Son configuración: una versión nueva no edita la 1.

| Par | Spread (pips) | Coste del spread por lote |
|---|---|---|
| EURUSD | 0,3 | 3,00 USD |
| USDJPY | 0,4 | 4 × 100.000 × 0,001 / precio JPY (≈ 2,67 USD a 150) |
| GBPUSD | 0,6 | 6,00 USD |
| AUDUSD | 0,5 | 5,00 USD |
| USDCHF | 0,7 | según USDCHF |
| USDCAD | 0,7 | según USDCAD |
| NZDUSD | 0,8 | 8,00 USD |
| AUDCAD | 1,2 | según USDCAD |
| GBPJPY | 1,4 | según USDJPY |

### 2.5 Deslizamiento

Cero, salvo en un **hueco en la apertura** de la vela: una orden atravesada se ejecuta al precio de apertura del lado ejecutable. No se suma ninguna regla adversa adicional.

### 2.6 Riesgo estimado (E09)

- **Al dimensionar:** el modal calcula el volumen con la **misma** función de P&L del motor, al SL, con el cambio de conversión disponible en el cursor y con los costes. Redondea el volumen **hacia abajo** al paso de 0,01.
- **Lo que enseña:** «riesgo estimado: X USD (cambio GBPUSD 1,2500 a las 10:00; incluye spread y comisión)». No es una pérdida máxima garantizada.
- **El recibo del cierre** explica la diferencia entre lo estimado y lo realizado: conversión, hueco y costes.
- **Validación:** precio, SL, TP y lotes finitos, positivos, en paso y tick; SL y TP del lado correcto respecto al precio ejecutable; si no, `rechazado: precio_invalido`.

---

## 3. El motor: estado, recorrido intravela, eventos (E01, E02, E03, E04, E07, E11)

### 3.1 El estado serializable completo

Todo lo que el motor necesita para continuar va aquí. Nada vive en hooks.

```json
{
  "esquema": "sim-estado@1",
  "versiones": { "motor": "motor@1", "instrumentos": "instr@1", "costes": "costes@1", "reglas": "ftmo-2step@2026-10-05 | null", "mercado": { "EURUSD": "v1:sha256…", "GBPUSD": "…" } },
  "sesion": { "id": "…", "epoca": 1, "version": 42, "moneda": "USD", "capital_inicial_µ": 100000000000, "apalancamiento": 100, "zona_reto": "Europe/Prague" },
  "reloj": { "cursor": 1741168740, "fin_de_datos_emitido": false, "ultimo_reset_diario": "2025-03-05" },
  "saldo_µ": 100250000000,
  "remanente_µ": 0,
  "posiciones": [{ "id": "p17", "seq_apertura": 17, "par": "EURUSD", "lado": "BUY", "lotes_iniciales": 1.00, "lotes_restantes": 0.75,
                   "precio_entrada": 1.10010, "sl": 1.09900, "tp": 1.10500, "abierta_en": 1741168500,
                   "proteccion_activa_desde": 1741168500, "comision_devengada_µ": 3000000, "comision_asignada_µ": 750000,
                   "cierres": ["c20"] }],
  "ordenes": [{ "id": "o18", "seq": 18, "par": "GBPUSD", "lado": "SELL", "tipo": "limit", "precio": 1.25100, "sl": 1.25300, "tp": 1.24800,
                "lotes": 0.50, "creada_en": 1741168560, "activa_desde": 1741168560 }],
  "cotizaciones": { "EURUSD": { "bid": 1.10200, "en": 1741168740 }, "USDJPY": { "bid": 150.123, "en": 1741168740 } },
  "reto": { "fase": 1, "saldo_medianoche_µ": 100000000000, "dia_reto": "2025-03-05", "dias_con_apertura": ["2025-03-03", "2025-03-05"],
            "estado": "activo | objetivo | breach", "breach": null },
  "no_valorable": null
}
```

- **Dinero en micro-USD enteros (µ).**
- **Precios** en el número de dígitos del instrumento.
- **Fuera del estado** (se paginan): cerrados e historial, que viven en `sim_trades` y `sim_eventos` (Astra, § 6: no arrastrar `cerrados[]` en cada comando).
- **`breach`,** cuando ocurre: `{ "instrumento", "minuto", "tramo", "precio", "equity_µ", "limite_µ", "regla" }`. Es el punto interno guardado.

### 3.2 Recorrido intravela común por instrumento (E01)

**Los dos caminos.** Para cada vela de un instrumento hay dos caminos OHLC canónicos: **A** = O→H→L→C y **B** = O→L→H→C. Cada uno tiene tres tramos monótonos.

**Cuándo una vela es ambigua.** Cuando A y B producen **conjuntos distintos de eventos** (fills, protecciones, cierres, breach) para las órdenes y posiciones vivas de **ese instrumento**.

**Elección: el peor para la propia cartera del par (v2.1).** Se simula la vela con A y con B, partiendo del mismo estado. Cada par elige su recorrido **por su propia cartera** (sus posiciones y órdenes); **no se promete un óptimo global** entre pares: las combinaciones de caminos de varios pares no se exploran (Astra, V2-01). Se elige por este orden:
1. el camino cuya **equity mínima** de esa cartera en la vela sea menor;
2. a igualdad, el de menor equity al cierre de la vela;
3. a igualdad, **B** (mínimo primero): desempate estable, que no depende del orden de ningún array.

**Marca.** Si la vela es ambigua, todos sus eventos llevan `ambigua: true` y `causa_ambiguedad` (p. ej. «la vela toca el SL y el TP de p17; se aplica O→L→H→C, el peor para la cartera»), además de la política (`recorrido@1`). Es el contrato que la prueba endurecida de M02 ya exige (`5c6c910`).

**Libro entero, no ticket a ticket.** El ejemplo de E01 (BUY y SELL opuestos a 1,1000 con SL y TP a 10 pips, vela que toca 1,0990 y 1,1010) da un SL y un TP: bruto 0, neto −6 en comisiones. Nunca −200.

### 3.3 Eventos por tramo (E02)

Dentro de un tramo monótono:
1. Se buscan todos los niveles cruzados en ese tramo (activaciones de órdenes y SL/TP de posiciones **activas**), en el orden en que el precio los alcanza.
2. **A igual precio,** van primero las protecciones de posiciones existentes (por `seq_apertura`) y después las órdenes (por `seq`).
3. **Cada fill** crea la posición con `proteccion_activa_desde = instante del fill`. Su SL y su TP participan **en el resto del mismo tramo y en los siguientes** de esa vela.
4. **Órdenes independientes:** un BUY STOP y un BUY LIMIT independientes pueden llenarse los dos (no hay OCO).
5. **Hueco (v2.1, § 12.3):** una orden atravesada en la apertura se llena en el **lado ejecutable** (BUY a ask, SELL a bid); si ese precio ya está más allá de su SL o TP, la protección se ejecuta **en el acto al lado de salida** (BUY sale a bid, SELL a ask), marcada como hueco. No se rechaza a posteriori una orden que era válida al crearse. Ejemplo de Astra: BUY LIMIT 1,10000, SL 1,09900, abre bid 1,09000 con spread 0,3 pips → fill 1,09003, protección 1,09000: bruto **−3**, neto **−6**.
6. **Modificar o cancelar** «en el mismo instante» no existe: los comandos se aplican en `cursor + 60`, antes de la vela siguiente.
7. **Órdenes que ya se pueden ejecutar al crearse:** un **limit** mejor que el precio se llena al precio vigente del lado ejecutable, igual o mejor que el límite. Un **stop de entrada** ya ejecutable al crearse **se rechaza** (`rechazado: stop_ejecutable`) (v2.1).
8. **Margen al fill (v2.1):** se revalida en cada fill, por orden de creación, sin reserva previa. Si no cabe, la orden se **cancela** con su evento (`orden_cancelada`, motivo `margen_insuficiente`).

### 3.4 Equity y límites durante cada tramo (E03, E07)

**Cuándo se evalúa la equity.** Equity = saldo + flotante de todas las posiciones − nada más (la comisión ya está en el saldo). Se evalúa:
- en cada evento;
- en los dos extremos de cada tramo;
- en cada `reset_diario`.

**El breach.** El primer instante en que la equity queda **por debajo** del límite es el breach. Es irreversible:
- se emite el evento `breach` con el punto interno;
- se cancelan las órdenes;
- se liquidan las posiciones;
- la sesión queda en `breach` y el motor no procesa más velas de ningún par.

**Sobre qué se compara (v2.1):** sobre el **libro ya redondeado** (saldo en µ y flotante redondeado al µ como si se cerrara ahí, § 12.5), con comparación estricta en µ enteros.

**Precio de liquidación** (solver coherente, E07):
- en el tramo, el primer precio, en ticks del instrumento, con el que la equity de la cartera queda por debajo del límite;
- la equity es exacta en función del precio, con el factor de conversión vigente: racional, no lineal, cuando el par cotiza contra la propia moneda base (USDJPY);
- si el tramo empieza ya por debajo (hueco), al primer precio disponible;
- sin empujes de medio pip.

### 3.5 Reloj de sesión y valoración conjunta (E04) — v2.1

**Sustituye** el orden alfabético de la v2, que podía disparar un breach antes de incorporar la ganancia de otro par (Astra, V2-01). Lo decide el § 12.1:

- **Un reloj común por minuto, en cuatro fases** para todos los pares de la sesión:
  1. todas las **aperturas**;
  2. el **primer extremo** del camino elegido de cada par;
  3. el **segundo extremo**;
  4. todos los **cierres**.
- En cada fase **se actualizan todas las cotizaciones antes de valorar**. El snapshot de equity de la fase usa la misma instantánea para todos: la imagen de E04 (+4.000 y −6.000 en la misma fase) da 98.000 se llamen como se llamen los pares.
- **Mercado cerrado esperado** (calendario por instrumento: fin de semana, cierre diario) **no es dato obsoleto**: se valora al último precio. `no_valorable` solo si falta dato **en horario de mercado**, y entonces el cursor queda **sin consumir** (el minuto se reintenta entero).
- **Fin de semana:** no se generan velas; el reloj salta al siguiente minuto con datos de cualquier par de la sesión. `reset_diario` se emite igual (§ 5), valorado al último precio.

### 3.6 Conversión (E05, A09) — v2.1

- **Fases 1 a 3:** el P&L en la cotizada se convierte con la **apertura** del par de conversión en ese minuto (ya disponible en la fase 1, porque todas las aperturas van primero).
- **Fase 4:** con su **cierre**.
- **Lo que guarda el evento:** el origen (par, minuto, fase, valor).
- **Cotización inversa:** USD como base, ÷ precio.
- **Sin dato en horario de mercado:** `no_valorable` (§ 3.5).

### 3.7 Costes, margen y swap (E08)

- **Comisión:**
  - 3 USD por lote completo, cobrada **entera al abrir** (`lotes × 3.000.000 µ`), una sola vez por posición;
  - los cierres parciales no cobran;
  - el recibo de cada cierre **asigna** la parte proporcional (`comision_devengada_µ × lotes_cerrados / lotes_iniciales`, redondeada hacia abajo al µ), y el remanente va al último cierre. La suma asignada es exactamente lo cobrado;
  - un reintento no vuelve a devengar (es idempotente por `command_id`).
- **P&L en enteros (v2.1, § 12.5):** precio en ticks, lotes en centésimas, P&L racional redondeado al µUSD con **residuo por posición**: los parciales suman exactamente lo mismo que el cierre completo.
- **Swap:** `swap_µ = 0` en todos los cálculos, con `costes@1.swap = 0` en el snapshot y en cada recibo.
- **Margen 1:100 (admisión):**
  - margen requerido = nocional USD / 100;
  - nocional: USD base → `lotes × 100.000`; USD cotizada → `lotes × 100.000 × precio`; cruce → `lotes × 100.000 × (base→USD)`;
  - se admite solo si margen libre = equity − margen usado ≥ margen requerido; si no, `rechazado: margen_insuficiente`;
  - **(v2.1)** una orden pendiente se revalida **en su fill** (§ 3.3, punto 8), no al crearse;
  - sin stop-out ni margin call propios: el único cierre forzado es el breach del reto.

### 3.8 Paso, salto, reanudación y última vela (E11)

- **Equivalencia:** con los mismos comandos y mercado, `avanzar(e, t2)` ≡ `avanzar(avanzar(e, t1), t2)` para todo *t1*, y lo mismo cortando en cualquier frontera de persistencia. Se exige igualdad del estado **y** de la concatenación de eventos económicos (`fill`, `cierre`, `comision`, `reset_diario`, `breach`); los recibos administrativos pueden diferir en número.
- **Última vela y fin de datos:** la última vela se ejecuta; `fin_de_datos` se emite **una vez**; un `avanzar` posterior no cambia nada.
- **Pausa:** corta entre minutos confirmables, nunca dentro de un lote.
- **Sin retroceso económico:** mover el gráfico atrás no rebobina el libro. Una «rama de práctica» desde un punto anterior sería otra sesión, identificada (**PENDIENTE**: no pedida).
- **Cambiar de marco** solo cambia la vista.

---

## 4. Cartera durable: tablas y libro

- **`sim_sessions`** (columnas nuevas, aprobadas en principio por el CTO; el hub no lee esta tabla, `c25f28d`): `motor_version`, `epoca`, `version`, `estado jsonb` (§ 3.1), `escritor jsonb`, `terminal text`, `legado boolean`.
- **`sim_recibos`, `sim_eventos`:** las de § 1.3.
- **`sim_trades`:** sigue siendo el libro de cerrados, con estas columnas nuevas:
  - `evento_id unique`, `motor_version` (0 = legado, 1 = v1);
  - `comision_µ`, `spread_µ`, `swap_µ` (0), `conversion jsonb`;
  - `ambigua`, `causa_ambiguedad`;
  - `bruto_µ`, `neto_µ`;
  - las columnas actuales (`pnl` = neto en USD) se mantienen para las pantallas.
- **Snapshot:** se guarda en `sim_sessions.estado` en cada comando confirmado. El historial no va en el snapshot.

---

## 5. Reto FTMO 2-Step (E10)

**Fuente:** https://ftmo.com/en/trading-objectives/ (consultada el 5-oct-2026). Texto oficial:
- **Objetivo:** «The Profit Target is calculated as a percentage of your Initial Simulated Capital: 10% for the FTMO Challenge … 5% for the Verification». Ejemplo de 100.000: 110.000 y 105.000 de balance.
- **Pérdida diaria:** «The Maximum Daily Loss Limit is recalculated daily at 00:00 CE(S)T as the difference between: the account balance recorded at 00:00 CE(S)T of the current day and the Maximum Daily Loss Amount, which is 5% of the Initial Simulated Capital.» Se aplica a la **equity** = «Balance + Open Positions P/L ± Swaps – Commissions».
- **Pérdida máxima:** «The Maximum Loss rule establishes a static limit (the Maximum Loss Limit) below which your account equity cannot drop … the Initial Simulated Capital and the Maximum Loss Amount, which is 10% of the Initial Simulated Capital.»
- **Días mínimos:** «at least 4 Trading Days. A Trading Day is defined as any day – measured from 00:00:00 to 23:59:59 CE(S)T – during which at least one position is opened.»

**El módulo `ftmo-2step@2026-10-05`** (`lib/reglas/ftmo-2step.js`, puro y versionado; las versiones nunca se editan):
- **Calendario:** zona `Europe/Prague` (CE(S)T, con su horario de verano).
- **Reset de medianoche:** `reset_diario` es un **evento del reloj**. Se emite a las 00:00 de Praga aunque no llegue ninguna vela (fines de semana, huecos, cambio de hora) y antes de cualquier vela con `barOpen ≥` esa medianoche. Fija `saldo_medianoche = saldo` (balance cerrado, comisiones ya descontadas) y recalcula el límite diario. Evalúa la equity en ese instante.
- **Límites:** diario `= saldo_medianoche − 5 % × capital_inicial`; total `= 90 % × capital_inicial`.
- **Breach:** equity **estrictamente menor** que cualquier límite, en µUSD exactos. 98.000,000000 no incumple; 97.999,99 sí.
- **Objetivo:** saldo (cerrado) ≥ capital × (1 + objetivo), **sin posiciones abiertas**, ≥ 4 días de Praga con al menos una apertura y sin breach. El flotante no cuenta para el objetivo.
- **Fase 2:** nueva sesión enlazada, con el mismo capital inicial, la misma versión de reglas, el reloj donde lo dejó la fase 1 y sin posiciones heredadas. Creada por la misma RPC transaccional, con `unique` de transición (D07).
- **Evaluación y liquidación,** separadas: el evaluador dice «breach en el punto P»; la liquidación es su propio evento. Un trade posterior al breach no existe: el motor ya no procesa.

**PENDIENTE:** el texto de FTMO no dice qué precio de la vela de medianoche usar si el reset cae entre dos velas. La especificación usa las cotizaciones disponibles a las 00:00 (§ 3.5), igual que para cualquier evento.

**(v2.1)** Un reset con el mercado cerrado (sábado 00:00 de Praga) valora al último precio: un cierre esperado no es dato obsoleto (§ 3.5). Un evento exactamente a medianoche va **después** del `reset_diario` de esa medianoche.

---

## 6. Migración de los 5 alumnos (G01, G02, G03, G05)

1. **Antes del corte:**
   - se aplica sim-001b y se versiona el baseline;
   - se publica el mercado v1 (§ 7);
   - se ensaya el corte en PostgreSQL de ensayo con cinco identidades ficticias (saldo 0, saldo null, saldo incoherente, sesión con posiciones en cliente, reto en fase intermedia) (A25).
2. **Aviso a los cinco** con fecha y hora: «a las HH:MM, las sesiones actuales pasan a solo lectura; cierra tus posiciones abiertas antes si quieres que cuenten». Sus posiciones en memoria **no se importan**: no tienen autoridad (G01).
3. **Corte** (una transacción, bajo bloqueo de cada sesión):
   - `epoca = 1`, `legado = true`, `motor_version = 0` en todas las sesiones existentes;
   - **snapshot de legado inmutable** creado una sola vez, con origen, `saldo` tal cual (0 sigue siendo 0, null se registra como null y no se convierte), `last_timestamp` y watermark = número de `sim_trades` en ese instante;
   - sin recalcular ni tocar ningún trade.
   - Si una sesión no cuadra (`balance ≠ capital + Σ pnl`), igualmente pasa a legado en solo lectura con la incoherencia anotada. No se corrige: decide Ramón (G02).
4. **Desde el corte:**
   - el servidor rechaza cualquier escritura de época 0 (`426 actualizar_cliente`) y el cliente antiguo lo enseña;
   - las sesiones legado no admiten comandos;
   - las nuevas nacen en v1 y **no cuentan legado en el cupo** de sesiones.
5. **Retos activos legado:** quedan en solo lectura con sus reglas antiguas. Si el alumno quiere seguir, empieza uno nuevo v1. No se recalifica ningún resultado anterior (G03).
6. **Métricas:** `lib/metricas.js` separa legado de v1 por `motor_version`. Una vista que sume los dos lo dice («incluye N operaciones legado, sin costes»).
7. **Rollback (v2.1, § 12.6):** a **modo mantenimiento / solo lectura**, sin presentación económica falsa. Volver al código anterior no lee el estado v1 (reconstruye desde trades y balance), así que no es un rollback económico; no borra eventos v1.
8. **Corte (v2.1, § 12.6):** antes del corte se despliega una versión del cliente que **entiende la época**; el SQL impide las escrituras legado desde cualquier cliente (un 426 en `/api/sim/comando` no alcanza a `useTradingActions`, que inserta directo).
9. **G05 (v2.1):** **baseline SQL completo y reconstruible en una base vacía** (§ 12.6). Lo pendiente de la s04 está en `sql/APLICADOS.md`.

---

## 7. Mercado inmutable y versionado; almacenamiento y compresión (G04)

### 7.1 Medición de hoy (solo lectura, sin descargar ficheros)

Fuente: listado de metadatos de Storage de la copia `2026-10-04_122719` (4-oct 12:27). No es contenido.

| Concepto | Valor |
|---|---|
| Objetos | 27 (9 pares × 2024, 2025, 2026), un JSON por par y año |
| Total | **967.999.678 bytes (923,2 MiB)** — ojo: MiB, no MB decimales (Astra) |
| Año cerrado (2024, 2025) | 36,9–37,7 MiB por par; media 39,2 MB |
| Año en curso (2026) | 27,3–28,1 MiB por par |
| Crecimiento con el actualizador | **≈ 104 KB/día natural por par → ≈ 0,96 MB/día los 9 → ≈ 351 MB/año** (cuadra con un año cerrado: 9 × 39,2 = 353 MB) |
| 1 GB = 10⁹ bytes | hoy al 96,8 %; faltan 32,0 MB → **≈ 6-nov-2026** |
| 1 GiB = 2³⁰ bytes | hoy al 90,2 %; faltan 105,7 MB → **≈ 22-ene-2027** |

- **Cuál de los dos aplica:** Supabase no lo dice en su página de precios. El «95 %» que citó el CTO encaja con 10⁹. **PENDIENTE:** confirmarlo en el panel del proyecto.
- **El cambio a Pro llega tarde para la primera fecha:** está anunciado para dentro de unos dos meses (≈ principios de diciembre) y el límite de 10⁹ bytes cae hacia el 6 de noviembre. Lo resuelve la compresión de § 7.4.
- **Observación del listado del 4-oct 12:27, verificada el 5-oct.** El listado guardó **`updated_at`** (lo genera `~/Desktop/copias-suite/copia.mjs:135`: `actualizado: o.updated_at`; `storage-js` 2.102.1 instalado: `FileObject` trae `updated_at`, `created_at` y `last_accessed_at`; comprobado leyendo código, sin red). Según ese campo, EURUSD, AUDUSD, AUDCAD y GBPJPY 2026 llevaban sin modificarse desde el 26-27 de septiembre **a las 12:27 del 4-oct**: la hipótesis era cierta en ese momento. Después tres se pusieron al día: el tamaño del objeto creció entre el listado y la copia del 5-oct (EURUSD 28.713.498 → 29.475.726 B; AUDCAD 28.582.641 → 29.333.903; GBPJPY 28.634.714 → 29.396.834: ≈ +760 KB, unos 5 días de M1) y el job del 5-oct da su última vela el 2-oct. **AUDUSD no**: mismo tamaño (28.895.708 B) y última vela real 2026-09-25 20:59 (copia del 5-oct). GBPUSD, sin cambio de tamaño, última vela 2026-10-01 23:59. *(Este párrafo sustituye la corrección del 5-oct por la mañana, `7d08d28`, que suponía `created_at` sin comprobarlo: era falso.)*

### 7.2 Compresión medida

Muestra: las velas **reales** que hay en el repo, `data/<PAR>/H1/2023.json` (8 pares, 45.848 velas H1), reescritas con el formato exacto del bucket. Es H1 como sustituto de M1: en M1 las diferencias entre velas consecutivas son menores, así que lo esperable es igual o mejor; **se confirma con el primer fichero migrado**.

| Formato | Respecto al JSON actual | Bytes/vela | 923 MB de hoy pasarían a | Crecimiento anual (353 MB) |
|---|---|---|---|---|
| JSON (actual) | 100 % | 90,8 | 923 MB | 353 MB |
| JSON + gzip -9 | 18,9 % | 17,2 | **≈ 183 MB = 174,5 MiB** | ≈ 67 MB |
| JSON + brotli 11 | 12,6 % | 11,4 | **≈ 116 MB** | ≈ 44 MB |
| binario (24 B/vela) | 26,4 % | 24,0 | ≈ 244 MB | ≈ 93 MB |
| binario + gzip | 9,5 % | 8,6 | **≈ 88 MB** | ≈ 34 MB |
| binario + brotli | 6,5 % | 5,9 | **≈ 63 MB = 60,0 MiB** | ≈ 23 MB |

**El binario (v2.1, § 12.5): un trozo diario con cabecera** —versión, escala de precio, ancla de tiempo y de precio absolutos— para decodificarse solo, sin el día anterior. Por vela, diferencias enteras respecto al ancla o a la vela anterior **del mismo trozo**, y el **volumen sin pérdida** (float64: el SDK lo entrega con decimales; un uint32 truncaba 0,25 a 0, Astra V2-04). La medición de la tabla es con la variante sin cabecera y volumen uint32; se repite con el formato definitivo.

### 7.3 Mercado v1 en Pro: cuánto exige

- **Trozos inmutables por par y día** en binario + brotli, con su sha256 en el nombre, y un **manifiesto** por par y versión: lista de días, hash, número de velas, cobertura y `availableAt` del último minuto. Una corrección publica una versión nueva del día; la sesión fija las versiones de **todos** sus pares (operados y de conversión) en el snapshot (A26).
- **Tamaño con los mismos 2,75 años y 9 pares:**
  - ≈ 60 MB comprimido (≈ 244 MB sin comprimir en binario);
  - crece ≈ 23 MB/año comprimido;
  - manifiestos, despreciables (≈ 1.000 entradas por par: un día natural cada una).
- **Con el JSON actual conservado** mientras haya lectores legado: 923 MB + 0,96 MB/día. Con la compresión de § 7.4: 116–175 MB.
- **En Pro** (100 GB incluidos) cualquiera de las opciones ocupa menos del 1,5 %.
- **Transferencia:** Pro incluye 250 GB/mes. Con trozos de ~9 KB, por debajo del 1 %.

### 7.4 Propuesta de compresión de los ficheros actuales (sin aplicar)

**Formato:** JSON + **gzip** (`<PAR>/M1/<AAAA>.json.gz`, `contentType: application/gzip`).
- Ahorra ≈ 81 % (923 MB → ≈ 175 MB) sin cambiar la estructura de los datos.
- `zlib` viene con Node: no añade dependencias (CLAUDE.md § 3.4).
- Brotli ahorraría más (≈ 87 %), pero comprime mucho más lento en el actualizador, que corre en GitHub Actions. El paso grande lo da el binario v1 (§ 7.3).

**Código (hecho en la rama, sin desplegar):** lectores de las dos extensiones y escritores de `.json.gz` (`7342403`); desde el bloque D, **un solo camino de escritura** (`lib/mercado/ficheros.mjs` `publicarAnio`, `f85ce6f`): solo el actualizador y restore, con cerrojo por par y año, relectura justo antes de subir y verificación después; `/api/candles` ya no escribe; `scripts/subir-a-supabase.js` retirado. Responde a V2-08: la migración no puede usar otro camino que `publicarAnio` (cerrojo y verificación), y el borrado del `.json` solo procede si lo vigente sigue siendo lo migrado.

**Migración sin cortar el servicio ni perder histórico:**
1. **Lectores primero:** se despliega `candles.js` leyendo las dos extensiones (prefiere `.gz`). No cambia ningún dato.
2. **Copia local:** el script de migración, en seco por defecto y con `--subir` como los demás, descarga cada objeto a `~/Desktop/copias-suite/<fecha>-mercado/`. Así existe la copia completa que hoy no hay: la de ayer solo lista.
3. **Fichero a fichero,** empezando por los años cerrados:
   - comprime y verifica que el gunzip es idéntico byte a byte;
   - sube el `.json.gz`, lo vuelve a bajar y compara sha256;
   - **solo entonces** borra el `.json`.
   - El pico de ocupación es +7 MB por fichero, que cabe en los 32 MB libres de hoy.
4. **Escritores después:** con todos los cerrados migrados, se despliega el actualizador escribiendo `.gz` y se migra el año en curso entre dos pasadas del cron (06:00 y 14:00 UTC).
5. **Comprobación final:** 27 objetos `.json.gz`, 0 `.json`, y una sesión de cada par carga.

**Caché de `/api/candles`: resuelto.** Decisión del CTO: versión por metadatos (`info`: etag) antes de releer, sin caducidad corta (`e07b849`); nunca sirve menos que la versión vigente (`0f280a3`).

---

## 8. Respuestas a la revisión, una por una

| ID | Respuesta | Dónde |
|---|---|---|
| E01 | Recorrido común por instrumento, el peor para la equity de la cartera, desempate O→L→H→C, marca con causa. | § 3.2 |
| E02 | Tramos monótonos, siguiente nivel alcanzable, protección activa desde el fill, prioridad a igual precio, sin OCO, hueco en la apertura. | § 3.3 |
| E03 | Equity en cada evento, extremo de tramo y reset; breach irreversible con punto interno; pendientes canceladas; liquidación al primer precio que incumple. | § 3.4 |
| E04 | Reloj único, calendario combinado, snapshot conjunto, `no_valorable` con antigüedad máxima de 5 min. | § 3.5 |
| E05 | `barOpen`/`availableAt`/cursor; conversión con la cotización disponible; hora modelada marcada. Timestamp = apertura: **pendiente menor** de validar. | § 2.2, § 3.6 |
| E06 | Velas **bid** (verificado en `dukascopy-node`); ask = bid + spread; reglas de activación por lado; hueco en la apertura; sin deslizamiento. | § 2.1, § 2.5 |
| E07 | Solver exacto en ticks con conversión racional; sin medio pip. | § 3.4 |
| E08 | µUSD; 3 USD por lote al abrir; asignación proporcional con remanente al último cierre; idempotente; swap 0 explícito. | § 3.7 |
| E09 | Riesgo **estimado**, con el cambio y su hora; volumen hacia abajo; el recibo explica diferencias; validación de entradas. | § 2.6 |
| E10 | FTMO 2-Step citado, versionado, Praga, reset como evento, comparación estricta en µ, objetivo sin flotante ni posiciones abiertas, 4 días por aperturas. | § 5 |
| E11 | Estado serializable completo; igualdad de estado y de eventos económicos por cortes; EOF una vez; sin retroceso económico. | § 3.1, § 3.8 |
| CD01 | El servidor ejecuta el motor; el cliente proyecta; los fills del navegador nunca son resultado. | § 1.1 |
| CD02 | Matriz por rol, tabla, columna y RPC. | § 9 |
| CD03 | Recibo por (sesión, comando) con digest; eventos (comando, ordinal); `seq` del servidor; comando vacío con recibo; atómico. | § 1.3 |
| CD04 | `for update` + CAS con fila afectada; un escritor por sesión (arrendamiento); conflicto sin efectos. | § 1.4 |
| CD05 | Reconciliar recibos antes de proyectar; nunca bajar de versión; recotizar ante conflicto. | § 1.5 |
| CD06 | `avanzar`/`checkpoint` durables; horizonte confirmado; cola por usuario, sesión y época; límites de lo no confirmado. | § 1.5 |
| CD07 | Barrera `terminal` bajo bloqueo; 410 a reintentos; FK y CASCADE de las tablas nuevas. | § 1.6 |
| G01 | Aviso y corte; las posiciones en memoria no se importan. | § 6 |
| G02 | Snapshot de legado creado una vez bajo bloqueo; 0 ≠ null; las incoherencias se anotan, no se corrigen. | § 6 |
| G03 | Legado en solo lectura; v1 nuevo; retos legado no se recalifican; métricas separadas. | § 6 |
| G04 | Mercado v1 inmutable y versionado **antes** de la primera sesión v1; versiones fijadas por sesión. | § 7.3 |
| G05 | Baseline por dependencias y ACL; ensayo de corte con cinco identidades ficticias. | § 6 |

---

## 9. Matriz de permisos (CD02)

Roles: `anon`, alumno (`authenticated`, dueño), alumno ajeno, alumno revocado (`simulador_activo = false`), admin (`authenticated` con `rol_global = admin`) y `service_role` (servidor).

| Objeto | anon | Alumno dueño | Alumno ajeno | Revocado | Admin (navegador) | service_role (servidor) |
|---|---|---|---|---|---|---|
| `sim_sessions` (fila) | — | SELECT las suyas | — | SELECT las suyas | — (ve por API admin) | todo |
| `sim_sessions` (columnas no económicas: `name`) | — | UPDATE `name` (lista cerrada) | — | — | — | todo |
| `sim_sessions` (`estado`, `balance`, `capital`, `version`, `epoca`, `challenge_*`, `last_timestamp`, `escritor`, `terminal`) | — | — | — | — | — | solo vía RPC |
| `sim_trades`, `sim_eventos`, `sim_recibos` | — | SELECT las suyas | — | SELECT las suyas | — | INSERT vía RPC; DELETE vía borrado |
| `session_drawings`, `session_chart_config`, `sim_drawing_templates`, `user_chart_config`, `user_tool_config` | — | CRUD lo suyo (no económico) | — | SELECT | — | todo |
| RPC `sim_comando(...)` | — | — (la llama el servidor) | — | — | — | EXECUTE (SECURITY DEFINER, `search_path` fijo, objetos calificados; comprueba dueño, acceso vigente, época y `terminal`) |
| RPC `sim_borrar_sesion`, `sim_borrar_alumno`, `sim_avanzar_fase` | — | — | — | — | — | EXECUTE |
| Storage `forex-data` (y `mercado/v1`) | — | — | — | — | — | lectura/escritura (bucket **privado**, decisión del CTO) |

**Reglas de la matriz:**
- Ninguna escritura económica directa desde el navegador.
- Un evento no puede apuntar a una sesión de otro alumno: la RPC deriva `user_id` de la sesión bloqueada, no del payload.
- Los ajustes de admin, si se piden, serían un comando `ajuste` con su recibo (**PENDIENTE**: no pedido).
- Se prueba en PostgreSQL real aislado (A28), no con el doble.

---

## 10. Pruebas de aceptación A01–A28

Son contratos por escribir como pruebas en `pruebas/aceptacion/` cuando se implemente cada pieza.

- **Todos los importes** con 9 pares, spreads de § 2.4 (salvo que se diga «sin costes» para aislar una propiedad), comisión 3 USD/lote y capital 100.000.
- **Velas bid.**

| # | Entrada | Resultado exigido |
|---|---|---|
| A01 (v2.1) | EURUSD, spread 0,3 pips = 0,00003 (bid de referencia 1,10000, ask 1,10003), 1 lote. Matriz: **(a)** BUY mercado → 1,10003; SELL mercado → 1,10000. **(b)** BUY LIMIT 1,09900, vela O 1,09950 H 1,09960 L 1,09880 C 1,09900 → fill **1,09900**; con hueco favorable (abre bid 1,09800) → **1,09803**. **(c)** SELL LIMIT 1,10100, vela que llega a 1,10120 → **1,10100**; hueco (abre 1,10200) → **1,10200**. **(d)** BUY STOP 1,10100 → **1,10100**; hueco adverso (abre bid 1,10200) → **1,10203**. **(e)** SELL STOP 1,09900 → **1,09900**; hueco (abre 1,09800) → **1,09800**. **(f)** Ya ejecutable al crearse: BUY LIMIT 1,10100 → **1,10003**; SELL LIMIT 1,09900 → **1,10000**; BUY STOP 1,09900 → **rechazado `stop_ejecutable`**. **(g)** Hueco con protección (V2-03): BUY LIMIT 1,10000, SL 1,09900, abre bid 1,09000. | Un limit nunca se llena peor que su precio; un stop saltado, en la apertura del lado ejecutable. (g): fill **1,09003**, protección en el acto a **1,09000**: bruto **−3**, neto **−6**, marcado como hueco. |
| A02 | EURUSD bid 1,10000 inmóvil, spread **1 pip** (aislado), 1 lote. | BUY: entra 1,10010 (ask), sale 1,10000 → bruto **−10**, neto **−13**. SELL: entra 1,10000, sale 1,10010 → **−10 / −13**. El recibo enseña ambos lados y 3 USD. |
| A03 (v2.1) | Sin spread (aislado), 1 lote EURUSD. **(a)** BUY LIMIT 1,10000, SL 1,09900, TP 1,10500; vela O 1,10100 H 1,10150 L 1,09800 C 1,09900 (la de M04). **(b)** BUY STOP 1,10100, SL 1,09900; vela O 1,10000 H 1,10150 L 1,09850 C 1,10050. **(c)** SELL STOP 1,09900, SL 1,10000; vela O 1,09950 H 1,09980 L 1,09850 C 1,09870. **(d)** El hueco con protección inmediata de A01 (g). | (a) Llena en 1,10000 y cierra en el SL **tras un paso**: bruto **−100**, neto **−103**; los dos caminos coinciden (no ambigua); el segundo paso no duplica (`369e7c1`). (b) En el camino B (mínimo primero) el mínimo **anterior al fill no dispara** el SL: posición abierta, flotante **−50** al cierre. En A: fill y SL, bruto **−200**. Ambigua → se elige **A** (equity mínima −200 < −50): neto **−203**, `ambigua === true` con causa. (c) Fill 1,09900, sin SL en ningún camino; flotante al cierre **+30** (ask 1,09870). |
| A04 | BUY y SELL de 1 lote a 1,1000, SL y TP a 10 pips, vela H 1,1010 L 1,0990, sin spread. | Un SL y un TP: bruto **0**, neto **−6**. Permutar arrays o trocear el avance no cambia nada. |
| A05 | Vela que toca SL y TP. | Política conservadora; `ambigua === true` con `causa_ambiguedad`; false, ausente o «sin ambigüedad» no pasan (`5c6c910`). |
| A06 (v2.1) | Capital inicial 100.000; BUY 1 lote EURUSD **ejecutado** a 1,20000 (sin spread, aislado; bid = ask); comisión 3 ya debitada → saldo **99.997**; suelo diario 95.000; SL 1,10000, TP 1,25000; vela O 1,20000 H 1,26000 L 1,14000 C 1,20000. | Camino peor: el mínimo primero (B). Equity = 99.997 + (bid − 1,20000) × 100.000. En **1,15003**, 95.000 exacto: **no** incumple. Primer tick que incumple: **1,15002**, equity **94.999** → breach y liquidación ahí (saldo 94.999); TP nunca alcanzado; pendientes canceladas. Al mínimo 1,14000 se habría llegado a 93.997 (la v2 decía 94.000: omitía la comisión). |
| A07 (v2.1) | Saldo ya neto 100.000, suelo 95.000; en el mismo minuto, AUDUSD −6.000 y EURUSD +4.000, los dos en el **primer extremo** (fase 2) de sus caminos. | Equity **98.000** en la valoración de la fase 2, sin breach; **intercambiar los nombres** (ganancia y pérdida) no cambia nada. Sin dato en horario de mercado, `no_valorable` con el cursor sin consumir. |
| A08 | USDJPY BUY 1 lote a 150,000 (sin spread, aislado). | 150→151: **+662,251656** USD bruto. Umbral bruto −5.000 en **142,857142857**. Con 3 USD de comisión, umbral neto **142,861224606**: primer tick con neto < −5.000, **142,861** (neto −5.000,1651); 142,862 no incumple (−4.999,4301). Con pip fijo, 142,50 perdía 5.263,16. |
| A09 (v2.1) | AUDCAD (decisión del CTO): 100 CAD de P&L en un evento de las fases 1–3 del minuto de las 10:00; USDCAD abre **1,25000** y cierra **1,40000**. | **80 USD** = 100 / 1,25 (apertura, conversión inversa ÷ USDCAD); nunca 71,43 (100 / 1,40, el cierre). En la fase 4 se usaría el cierre. Sin dato de USDCAD en horario de mercado → `no_valorable` con el cursor sin consumir. |
| A10 (v2.1) | GBPJPY (universo admitido; conversión ÷ USDJPY). BUY a **ask 190,000**, SL **189,500** (0,5 JPY); presupuesto de riesgo **500 USD**; USDJPY **150,000** al dimensionar; comisión 3 USD/lote. Al cerrar: hueco, GBPJPY abre bid **189,300**; USDJPY **155,000**. | Riesgo por lote = 50.000 JPY / 150 + 3 = **336,333…** USD → volumen **1,48** (1,49 daría 501,14 > 500); riesgo estimado **497,77**. Liquidado: (190,000 − 189,300) × 148.000 = 103.600 JPY / 155 = **668,387097** USD + comisión 4,44 = **−672,827097**. La UI enseña estimado y liquidado por separado y el recibo explica hueco y cambio. |
| A11 (v2.1) | **(a)** BUY 1 lote EURUSD a 1,10010 (ask), cierre a bid 1,10200: completo frente a 0,25 + 0,75. **(b)** Residuo con fracciones de µ: USDJPY BUY 1 lote a 150,000, cierre a 150,001, completo frente a 0,25 + 0,75. | (a) **190 bruto, 187 neto** en los dos casos (`sim_trades.pnl` es neto: 190 **no** se llama P&L neto); parciales 47,50 + 142,50 bruto; comisión total **3,00** cobrada al abrir, asignada 0,75 + 2,25; un reintento idéntico no cambia nada. (b) Exacto: 666.662,22 µ (0,25: 166.665,56 µ). Redondeando cada parcial por separado saldría 166.666 + 499.997 = **666.663 µ**; con el residuo por posición: **166.666 + 499.996 = 666.662 µ**, igual que el cierre completo. |
| A12 | 0,01 lote. | Comisión **30.000 µUSD = 0,03**, no 0,04; remanente idéntico antes y después de serializar. |
| A13 | Saldo 103.000 a medianoche de Praga, flotante −6.000. | Límite **98.000**; equity 97.000 → breach en el evento `reset_diario`, sin precio nuevo. Equity exacta 98.000,000000 no incumple; 97.999,99 sí. |
| A14 | Medianoches de marzo y octubre (cambio de hora en Praga); fin de semana sin velas; días con apertura frente a días con cierre. | El reset se emite a la hora de Praga correcta; sin velas inventadas; los días se cuentan por aperturas; con posiciones abiertas no hay objetivo. |
| A15 | Mismos comandos y mercado: paso, salto y cortes en cada frontera de persistencia. | Mismo estado y misma secuencia de eventos económicos. |
| A16 | SL en la última M1. | Se ejecuta; `fin_de_datos` una vez; un avance posterior no duplica; la pausa corta entre minutos. |
| A17 | Modal abierto, el cursor avanza, confirmar. | `precio_cambiado` y recotización; nunca un fill al precio viejo (M05). |
| A18 | Caída antes del commit, después del commit y antes del ACK. | El mismo `command_id` devuelve el recibo original; una sola comisión y una sola fila económica. |
| A19 | Dos pestañas desde v10 cierran el mismo lote. | Una confirma; la otra, conflicto o el mismo recibo; nunca volumen negativo ni sobrescritura. |
| A20 | v12 aplicada antes de recibir v11; respuesta de otra sesión, usuario o época. | Se queda en v12; las otras se ignoran. |
| A21 | Misma clave con otro payload; un comando con varios eventos; comando sin eventos. | 409; no colisiona; tiene recibo. |
| A22 | Parcial de 0,5 confirmado con el ACK perdido y recarga; A sale y entra B. | Se conservan 0,5 lotes; nada de A se muestra ni se reenvía a B; un fallo de `localStorage` se ve. |
| A23 | El alumno fabrica beneficio, cambia costes o versión de mercado, salta el cursor, o hace INSERT/UPDATE/DELETE económico directo; la RPC de A apunta a la sesión de B. | Ningún resultado verificado; denegado. |
| A24 | Guardado en vuelo + borrado + reintento de la cola. | No resucita nada; 410. |
| A25 | Cinco perfiles ficticios de § 6. | Trades legado idénticos byte a byte; inicialización una sola vez en concurrencia; 0 ≠ null; legado y v1 identificables. |
| A26 | Publicar una versión nueva del mercado; hash incorrecto; cobertura insuficiente. | La sesión fijada no cambia; el avance se detiene con error. |
| A27 | El mismo libro neto, ordenado por cierre. | Las mismas expectativa, R:R, drawdown y agregado para alumno y mentor (`50c5084` ya lo hace para el legado); legado etiquetado. |
| A28 | PostgreSQL de ensayo: anon, A, B, revocado y admin contra la matriz de § 9; SECURITY DEFINER; la migración dos veces y un fallo a mitad. | Todo como la matriz; idempotente; atómico. |

---

## 11. Pendiente

1. ~~Spreads de § 2.4~~ **Resuelto:** aprobados por Ramón como `costes@1` (5-oct).
2. **Unidad del GB** que cuenta Supabase en este proyecto (10⁹ o 2³⁰): decide si el límite cae hacia el 6-nov-2026 o hacia el 22-ene-2027.
3. **Compresión (§ 7.4):** aprobada; el código de lectores y escritores está en la rama (`7342403`, `f85ce6f`). La migración de ficheros no empieza hasta que los lectores estén desplegados y el CTO lo diga. Hay que hacerla **antes del 6-nov** si el límite es 10⁹ y Pro llega en diciembre.
4. **Caché de `/api/candles`:** resuelto (`e07b849`, `0f280a3`).
5. **Timestamp de Dukascopy** = apertura del minuto: validar con un minuto conocido (§ 2.2).
6. **Pares retrasados (verificado el 5-oct, § 7.1):** a las 12:27 del 4-oct, EURUSD, AUDUSD, AUDCAD y GBPJPY llevaban sin actualizarse desde el 26-27 de septiembre (`updated_at`); EURUSD, AUDCAD y GBPJPY se recuperaron después; **AUDUSD sigue con última vela 2026-09-25** y GBPUSD 2026-10-01. Además, **el 20-jul-2026 está cortado en los 9 pares** (acaba a las 14:59, 15:59 o 16:59 UTC según el par: copia del 5-oct). Causa de los fallos del job: descargas del proveedor («Unknown error», «fetch failed»); el actualizador es de todo o nada por par (bloque F).
7. **No pedidos, no diseñados:**
   - una rama de práctica desde un punto anterior (§ 3.8);
   - ajustes manuales de admin (§ 9).
8. **Instante de medianoche entre velas:** se usa la cotización disponible a las 00:00, que es una decisión de esta especificación, no del texto de FTMO (§ 5).
9. ~~Modo de redondeo~~ **Resuelto (CTO, 5-oct):** al µ más cercano; **mitades exactas al par**.
10. ~~A09~~ **Resuelto (CTO, 5-oct):** AUDCAD con conversión por USDCAD (§ 10).
11. ~~Calendario~~ **Resuelto (CTO, 5-oct):** § 12.10.

---

## 12. v2.1 — decisiones del CTO (5-oct-2026, tras la segunda revisión de Astra)

Cada punto cita el hallazgo de Astra al que responde (`2026-10-05-astra-simulador-diseno-2.md`).

### 12.1 Reloj común por minuto (V2-01, E04)
- Cuatro fases por minuto para todos los pares: **(1)** todas las aperturas, **(2)** el primer extremo de cada par, **(3)** el segundo extremo, **(4)** todos los cierres. Se actualizan **todas** las cotizaciones de la fase antes de valorar.
- Cada par elige su recorrido (A o B) **por su propia cartera**. **No se promete un óptimo global** entre pares.
- Conversión: con la **apertura** en las fases 1 a 3 y con el **cierre** en la 4.

### 12.2 Mercado cerrado frente a dato obsoleto (V2-02, E10)
- Un cierre **esperado** (calendario por instrumento) no es dato obsoleto: se valora al último precio.
- `no_valorable` solo si falta dato **en horario de mercado**, y con el **cursor sin consumir**.

### 12.3 Hueco, protección y margen (V2-03)
- Fill al **lado ejecutable**; protección **inmediata** al **lado de salida**. La intención (SL y TP del lado correcto, etc.) se valida **al crear o modificar**, no al fill.
- Un **stop de entrada ya ejecutable** al crearse **se rechaza**.
- **Margen revalidado en cada fill,** por orden de creación, **sin reserva**. Si no cabe, la orden **se cancela** con su evento.

### 12.4 Confirmación (V2-05, V2-06, V2-07)
- **Cálculo fuera de bloqueo y una sola RPC final breve con CAS** de versión, época y **token de arrendamiento**.
- **Una petición en vuelo por sesión.** El **ACK confirma la cola** aunque su snapshot sea viejo: el comando sale de la cola por su recibo, sin rebajar el snapshot.
- Un **conflicto económico exige una nueva decisión del alumno** (nueva clave); no se reintenta con la misma.
- **Sobre canónico con tipo de comando** para el digest.
- **Equivalencia** definida sobre la **proyección económica** (precios, tiempos modelados, cantidades, comisiones, reglas, orden y causalidad), no sobre ids de transporte.
- El **acceso se comprueba en cada comando dentro de la RPC**. Crear sesión y pasar de fase usan una **barrera por usuario**. Borrado con **lápida** y **410**.

### 12.5 Enteros y mercado binario (V2-04)
- **Precio en ticks; lotes en centésimas.**
- **P&L racional redondeado a micro-USD con residuo por posición**: los parciales suman exactamente lo mismo que el cierre completo (A11 b).
- Los **límites se comparan sobre el libro ya redondeado**.
- **Binario diario con cabecera** (versión, escala, ancla) y **volumen sin pérdida**.

### 12.6 Corte, rollback y baseline (V2-08, G01, G05)
- Antes del corte, una **versión del cliente que entienda la época**.
- **SQL que impide escrituras legado** desde cualquier cliente.
- **Rollback a modo mantenimiento** (solo lectura, sin presentación económica falsa).
- **Baseline SQL completo** y reconstruible en una base vacía.

### 12.7 Avance y capacidad
- **Avance agrupado:** un comando cada varios segundos o ante cualquier orden.
- **Retención de los recibos de avance.**
- **Tope de 50 posiciones + órdenes por sesión.**
- **La v1 no se habilita sin Supabase Pro.**

### 12.8 Correcciones de oráculos
- **A06:** con la comisión: igualdad en 1,15003, primer tick infractor **1,15002**, equity **94.999** (§ 10).
- **A11:** **190 bruto, 187 neto**; más el caso de residuo (§ 10).
- **A01, A03 y A10** completados con cifras (§ 10).

### 12.10 Horario de mercado y redondeo (CTO, 5-oct-2026)
- **Horario, igual para los 9 pares:** abre el **domingo a las 17:00** y cierra el **viernes a las 17:00**, hora de **America/New_York** (con su horario de verano).
- **Festivos:** no hay tabla. Un día es «cierre esperado» **solo si el manifiesto del mercado publicado lo marca como cerrado**. Cualquier otra ausencia de dato en horario de mercado es `no_valorable`.
- **Redondeo al µ:** al más cercano; **mitades exactas al par**.
- **Costes:** `costes@1` = los spreads de § 2.4, 3 USD por lote, swap 0 (aprobados por Ramón).

### 12.9 Qué se puede programar ya (orden del CTO)
En `lib/motor/` y sin tocar nada en uso: **1)** contratos puros (instrumentos, bid/ask, costes, P&L, redondeo, estado serializable, comparador); **2)** motor de un solo instrumento con **A01–A06, A08, A11, A12, A16 y A17** en verde. Nada de multipar, base ni interfaz todavía. Antes, la tabla de spreads en pantalla.

---

## 13. v2.3 — multipar (decisiones del CTO, 7 y 8-oct-2026, tras Astra cierres-8 y diseño-3)

**v2.2 (7-oct):** sección nueva; concreta lo que § 3.2, § 3.4, § 3.5, § 3.7 y § 12.1 dejaban abierto para varios pares.
**v2.3.1 (8-oct, tras `2026-10-08-astra-simulador-diseno-4.md`):** P-23a decidido (orden completo de § 13.2), marca de sincronización acumulada en el estado (V4-02, § 13.4), A36 con variaciones de equity netas (V4-04).
**v2.3 (8-oct, tras `2026-10-08-astra-simulador-diseno-3.md`):** V3-02 (límites tras cada cierre y cada fill, **regla literal**: cambia el motor aprobado, § 13.9), V3-03 (evaluación en las fronteras de fase y conversión con bid), V3-08 (margen fijado proporcional y versionado), V3-09 (marca de sincronización modelada), fixtures de A36, subconjunto de A37 y los ocho oráculos de Astra (A38–A45).

Las cifras de los casos están hechas a mano y comprobadas con aritmética exacta, independiente del motor. **Sin código de motor hasta que Astra revise la v2.3** (orden del CTO).

### 13.1 El camino sincronizado dentro de una fase

Por cada minuto, los pares de la sesión con vela en ese minuto tienen su vela bid (O, H, L, C) en ticks y su camino elegido (§ 13.4): A = O→H→L→C o B = O→L→H→C. Los puntos del camino de un par son P0 = O, P1, P2, P3 = C. Un par **sin vela** porque su mercado está cerrado (calendario o manifiesto, § 12.2, § 12.10) se queda en su último precio en todo el minuto; uno sin vela **en horario de mercado** deja el minuto entero sin consumir (`no_valorable`, § 3.5).

**Fases** (§ 12.1): fase 1 = apertura; fase 2 = tramo P0→P1; fase 3 = tramo P1→P2; fase 4 = tramo P2→P3.

**Fase 1 (apertura).** Un solo punto: todos los pares pasan a la vez de su última cotización a su O (con `hueco` si cambia), y después se aplican los eventos de § 13.2.

**Fases 2 a 4 (tramos).** Para cada par *i*, su tramo va del tick *aᵢ* al tick *bᵢ*; *nᵢ* = |*bᵢ* − *aᵢ*|; σᵢ = signo(*bᵢ* − *aᵢ*). La fracción *s* es un **racional** de [0, 1].
- **El par *i* da su tick *j*** (j = 1…*nᵢ*) en la fracción *s* = *j* / *nᵢ*.
- **Su precio en cualquier fracción *s*** es *pᵢ*(*s*) = *aᵢ* + σᵢ · ⌊*nᵢ* · *s*⌋ (con *nᵢ* = 0, *pᵢ*(*s*) = *aᵢ*). Es decir: un precio no se alcanza hasta su fracción; el redondeo a tick es hacia el punto de partida del tramo.
- **Puntos de evaluación de la fase:** el punto **obligatorio *s* = 0** de cada fase (V3-03) y la unión, sin repetidos, de las fracciones *j* / *nᵢ* de **todos** los pares de la sesión, ordenada como racionales (se compara *j*/*n* con *k*/*m* por *j*·*m* frente a *k*·*n*, en enteros). No se construye una rejilla común (mínimo común múltiplo): los flujos de fracciones de cada par se fusionan en orden.
- **El punto *s* = 0 de cada fase** se evalúa **aunque todos los tramos tengan *n* = 0**: es donde cambia el régimen de conversión (de la apertura al **cierre** del par de conversión al empezar la fase 4) sin que ningún precio operativo dé un tick. En las fases 2 a 4, *s* = 0 no mueve ningún precio (son los de *s* = 1 de la fase anterior): **solo evalúa** límites (§ 13.2); no repite ni duplica eventos. En la fase 1, *s* = 0 es la apertura.
- **Un par que solo convierte** (sin posiciones ni órdenes, p. ej. USDJPY para un GBPJPY) **sí cuenta para la equity**: su apertura y su cierre del minuto fijan la conversión. No aporta puntos de tick (la conversión no sigue su camino), pero su cambio de régimen en la frontera de la fase 4 se evalúa en ese *s* = 0. Un par sin posiciones, sin órdenes y que no convierte ninguna posición no cambia ni la equity ni los eventos.

### 13.2 Qué pasa en cada punto (v2.3.1: V3-02 regla literal y P-23a, decididos)

En cada punto *s*, en este orden (el de Astra, diseño-4, apartado C):

1. **Precios y conversión.** Se actualizan **todos** los precios de los pares a *pᵢ*(*s*) y, si es el *s* = 0 de una fase, el régimen de conversión de esa fase. Todo lo de esa fracción se aplica **antes** de evaluar nada (dos fracciones iguales escritas distinto, 1/2 y 2/4, son el mismo punto).
2. **Protecciones,** una a una por `seq` de apertura (un único contador de `seq` para la cartera), las alcanzadas a esos precios en todas las posiciones de todos los pares. **Después de cada cierre:**
   - a. **límites** con la equity del conjunto a los precios del punto. Si hay **breach**, se liquida todo (§ abajo) y **no se ejecuta nada más**: ni las demás protecciones de esa misma fracción (sus posiciones se cierran por `breach`, no por su SL/TP), ni órdenes;
   - b. solo si la cuenta sigue viva, **objetivo del reto**; si se cumple (sin posiciones, saldo ≥ objetivo, días), la fase se concede, se anulan las pendientes (`orden_cancelada`, motivo `objetivo`) y **no se ejecuta nada más**.
3. **Límites antes de la primera apertura (P-23a, decidido por el CTO):** si la cuenta sigue activa, se evalúan los límites **aunque no haya habido ningún cierre**. Con breach, ninguna orden se llena: la cuenta queda rota en ese instante.
4. **Órdenes,** una a una por `seq`, las ejecutables en ese punto:
   - a. se revalida el margen del conjunto (§ 13.3); si no cabe, `orden_cancelada` (`margen_insuficiente`) y se sigue con la siguiente;
   - b. **fill** y su comisión (y el spread, por el precio de ejecución);
   - c. **límites inmediatamente después del fill.** Con breach no se ejecuta nada más, y **la posición recién abierta se cierra por `breach`** (no por su protección inmediata, aunque su SL/TP ya esté alcanzado);
   - d. sin breach, la **protección inmediata** de esa posición si su SL/TP está alcanzado a este precio; tras ese cierre, **límites** y, si sigue viva, **objetivo**;
   - e. solo entonces, la orden siguiente.
5. **Fin del punto:** límites, si el estado vigente aún no se ha evaluado con estos precios (un punto sin eventos, o el *s* = 0 obligatorio de una fase aunque nada se mueva). Evaluar dos veces el mismo estado no duplica efectos: el breach es irreversible y se emite una vez.

**Equity del conjunto** = saldo + flotante redondeado de todas las posiciones a sus precios de salida (§ 12.5). **Breach** si queda **por debajo** de un límite (estricto, en µ).

**Liquidación por breach:** todas las posiciones de **todos** los pares se cierran a su precio en esa fracción (*pᵢ*(*s*), al lado de salida); se cancelan todas las órdenes (motivo `breach`); el evento `breach` guarda la fase, la fracción *s* (racional), los precios de todos los pares y la política (`camino-sincronizado@1`). El motor no procesa más velas de ningún par (§ 3.4).

**Conversión a USD (V3-03):** **siempre con el bid** del par de conversión. En las fases 1 a 3, su bid de **apertura** del minuto; en la fase 4, su bid de **cierre**. Un par que se convierte con su **propio** precio (USDJPY, USDCHF, USDCAD) usa su **bid** en el punto, *pᵢ*(*s*), **también en un SELL**. Se declaran aparte:
- **precio de ejecución** (lado de la operación: BUY abre a ask y sale a bid; SELL abre a bid y sale a ask, § 2.1);
- **precio de conversión** (bid, siempre).

Es lo que ya hace el motor aprobado (`lib/motor/motor.mjs`: `conversion(e, bid)`). La frase de la v2.2 «al lado de salida» para la conversión era un error y queda sustituida.

**Paso, salto y reanudación** (§ 3.8): los cortes de persistencia van entre minutos, nunca dentro de una fase, así que el camino sincronizado no cambia la equivalencia. Un `no_valorable` deja **el minuto entero** sin consumir: no hay consumo parcial de fases.

### 13.3 Margen de la cartera (1:100)

- **Margen requerido de una posición:** nocional en USD / 100.
  - **USD como base** (USDJPY, USDCHF, USDCAD): nocional = lotes × 100.000.
  - **Base distinta de USD** (EURUSD, GBPUSD, AUDUSD, NZDUSD, AUDCAD, GBPJPY): nocional = lotes × 100.000 × **bid del par base→USD en el cursor del comando** (EURUSD, GBPUSD, AUDUSD, NZDUSD; para AUDCAD, AUDUSD; para GBPJPY, GBPUSD).
  - Se **fija en la apertura**: el margen usado de una posición no se recalcula después con precios nuevos.
  - **Cierres parciales (V3-08):** la posición guarda su margen fijado inicial `margen_fijado_µ` y sus lotes iniciales; el margen usado es el **proporcional a los lotes restantes**. Cada cierre parcial libera ⌊`margen_fijado_µ` × lotes cerrados / lotes iniciales⌋, y el **residuo de redondeo va al último cierre** (como la comisión, § 3.7). Con las fórmulas de § 13.3 el margen por centésima de lote es siempre un número entero de µUSD (lotes en centésimas × bid en ticks × 100 en los pares de 5 dígitos, o × 10.000.000 con USD como base), así que hoy el residuo es 0; la regla queda para cualquier política futura.
  - **La política de margen lleva versión en el estado** (V3-08): `versiones.margen = "margen@2"` (bid base→USD, P-13a/P-13b, proporcional). `margen@1` es la del motor aprobado (precio de entrada).
  - **Sin dato** del par base→USD en ese minuto en horario de mercado: el comando se rechaza con `margen_sin_cotizacion`. No se estima.
- **Admisión:** margen libre = equity del conjunto − Σ margen usado de todas las posiciones de todos los pares; se admite si margen libre ≥ margen requerido (§ 3.7).
- **La sesión carga** los datos de los pares operados, de los de conversión (§ 3.6) y de los base→USD de sus cruces (AUDUSD para AUDCAD, GBPUSD para GBPJPY), y fija la versión de todos en `versiones.mercado` (§ 3.1, A26).

**P-13a (decidido, CTO 7-oct):** el **fill de una pendiente** no ocurre en el cursor de un comando, sino dentro de una vela: su margen se fija con el **bid del par base→USD en la apertura de ese minuto** (el mismo instante que la conversión de las fases 1–3, § 3.6). Sin vela del par base→USD en ese minuto en horario de mercado, el minuto queda sin consumir (`no_valorable`, § 3.5), como cualquier dato que falta.

**P-13b (decidido, CTO 7-oct): una sola regla, el bid, también en los pares con USD cotizado** (EURUSD, GBPUSD, AUDUSD, NZDUSD), cuyo par base→USD es el propio par: a mercado, su bid en el cursor del comando; una pendiente, su bid en la apertura del minuto del fill (P-13a).

**Cambio sobre una pieza aprobada (para Astra).** El motor de un instrumento (pieza 2, `lib/motor/motor.mjs`, `margen_µ`) calcula hoy el nocional de esos pares con el **precio de entrada** (ask en un BUY, bid en un SELL; en una pendiente, el precio de su fill) y recalcula el margen usado desde la entrada de cada posición. Con P-13b:
- el nocional usa el **bid** (en el cursor, o en la apertura del minuto del fill);
- cada posición **guarda su margen fijado** (`margen_µ`) al abrirse: el bid de ese instante no se puede reconstruir desde la entrada;
- USD como base (USDJPY, USDCHF, USDCAD): sin cambio (lotes × 100.000).

| Caso (`costes@1`, 1 lote, apalancamiento 100) | Hoy | Con P-13b |
|---|---|---|
| EURUSD BUY a mercado; bid 1,10000, ask 1,10003 | 100.000 × 1,10003 / 100 = **1.100,03** USD | 100.000 × 1,10000 / 100 = **1.100,00** USD |
| EURUSD SELL a mercado; bid 1,10000 | **1.100,00** (entrada = bid) | **1.100,00** (sin cambio) |
| EURUSD BUY LIMIT 1,09900 llenada en la vela O 1,09950 H 1,09960 L 1,09880 C 1,09900 (A01 b: fill al ask 1,09900) | 100.000 × 1,09900 / 100 = **1.099,00** | bid de apertura del minuto 1,09950 → **1.099,50** |
| USDJPY BUY 1 | **1.000,00** | **1.000,00** (sin cambio) |

La diferencia en un BUY a mercado es el spread por lote (3 USD de nocional, 0,03 de margen en EURUSD); en una pendiente, la distancia entre la apertura del minuto y el fill. **Ningún oráculo aprobado depende de esas cifras** (buscado en `pruebas/motor/` y en § 10): el único con margen insuficiente (C6-07, 1.000 de capital frente a unos 1.100) da lo mismo con las dos reglas. **Se exigirá como prueba (A37)** que una cartera de un solo par dé exactamente lo mismo que el motor de un par ya ajustado.

### 13.4 Elección del camino de cada par (aproximación declarada)

- Para cada par con posiciones u órdenes vivas, se simula su vela por A y por B **con los demás pares quietos en la apertura del minuto** (los precios de la fase 1), con la regla de un par (§ 3.2): menor equity mínima; a igualdad, menor equity al cierre; a igualdad, B. La equity es la del conjunto, con los demás pares fijos.
- Después se ejecuta el minuto entero, sincronizado (§ 13.1–13.2), con los caminos ya elegidos.
- La marca de ambigüedad de un par sale de su simulación aislada: si A y B dan conjuntos de eventos distintos para ese par.
- **Es una aproximación declarada (V3-09):** no se exploran las combinaciones de caminos entre pares (§ 12.1), y la ejecución conjunta puede dar eventos distintos de los de la simulación aislada (por ejemplo, una orden que en la simulación aislada cabía de margen y en la conjunta no). Manda la ejecución conjunta. **No es el peor escenario global ni tiene una cota de error**: otra combinación de caminos compatible con las mismas velas puede dar otro veredicto del reto (A45). No se promete ni se publica una cota.
- **Marca visible de sincronización modelada (V3-09):** en un minuto en que **más de un par con exposición** (posiciones u órdenes vivas) se mueve, todos los eventos económicos de ese minuto llevan `sincronizacion: "modelada"`, la política `camino-sincronizado@1` y los pares que se movieron. La interfaz lo enseña de forma discreta en la operación, como la marca de ambigüedad. Es independiente de `ambigua` (que sigue siendo por par): un minuto puede estar modelado sin que ningún par sea ambiguo por sí solo.
- **Marca acumulada en el estado (V4-02, CTO 8-oct):** como un minuto modelado puede no tener ningún evento (A45), la marca se guarda también **en el estado canónico**, y sobrevive a serializar y reanudar:
  - **por posición:** `sincronizacion_modelada: true` en cada posición abierta (o pendiente) que tenía exposición en un minuto modelado; su `cierre`, sea cuando sea y aunque ese minuto sea plano, lleva `sincronizacion: "modelada"`;
  - **por sesión/reto:** `sincronizacion = { politica: "camino-sincronizado@1", minutos: n, primero: t, ultimo: t }` acumulado; el resultado del reto (`fase_superada`, `breach`) y el resumen de la sesión lo llevan si `minutos > 0`.
  - Es solo procedencia: no cambia ninguna cifra. Un minuto con un solo par con exposición moviéndose no marca nada (control negativo).
- **Si la ejecución conjunta difiere de la aislada,** `causa_ambiguedad` lo dice: qué evento de la simulación aislada no ocurrió (o cuál nuevo apareció) y por qué (margen, breach, objetivo).

### 13.5 Tope de la cartera

Posiciones abiertas + órdenes pendientes de todos los pares ≤ **50** (§ 12.7). Se comprueba **al crear**: un `abrir` (a mercado o pendiente) que haría 51 se rechaza con `tope_alcanzado`, **sin efectos**: no consume `seq` ni id y no cambia el estado ni la versión (rechazo puro). El fill de una pendiente no cambia la cuenta (una orden pasa a ser una posición; puede cancelarse por margen, pero eso es otra regla). **Un cierre parcial no baja la cuenta** (V3-08): la posición sigue abierta. Un cierre total o una cancelación la bajan.

### 13.6 Casos de aceptación (A29–A37)

Salvo que se diga: capital 100.000; **sin spread y sin comisión** (aislado), 1 lote = 1 USD por tick en los pares con USD cotizado y 5 dígitos; el reto con suelo diario = saldo de medianoche − 5.000.

| # | Entrada | Resultado exigido |
|---|---|---|
| **A29** — A06 en multipar | A06 tal cual (sin spread, comisión 3 debitada: saldo **99.997**; EURUSD BUY 1 a 1,20000; suelo 95.000; vela O 1,20000 H 1,26000 L 1,14000 C 1,20000, camino B) y, en el mismo minuto, GBPUSD con una BUY LIMIT 1,20000 pendiente que no se alcanza y vela O 1,30000 H 1,30000 L 1,29000 C 1,29000 (camino B: baja 1.000 ticks en la fase 2). | La fase 2 tiene los puntos *j*/6.000 (EURUSD) y *k*/1.000 (GBPUSD). Primer punto con equity < 95.000: *s* = 4.998/6.000; EURUSD **1,15002**, equity **94.999** (en 1,15003, 95.000 exacto: no incumple). GBPUSD en esa fracción: ⌊1.000 · 4.998/6.000⌋ = 833 ticks → **1,29167**. Liquidación de EURUSD en 1,15002; la orden de GBPUSD, cancelada por breach. Los puntos de GBPUSD no adelantan ni atrasan el breach: **igual que A06**. |
| **A30** — A07 en multipar | Saldo 100.000, suelo 95.000. AUDUSD BUY 1 a 0,70000, vela O 0,70000 H 0,70000 L 0,64000 C 0,64000. EURUSD SELL 1 a 1,10000, vela O 1,10000 H 1,10000 L 1,06000 C 1,06000. Los dos eligen B (empate en mínimo y cierre), y los dos se mueven en la **fase 2**: AUDUSD −6.000 (6.000 ticks), EURUSD +4.000 (4.000 ticks). | En el punto *s*, equity = 100.000 − ⌊6.000 *s*⌋ + ⌊4.000 *s*⌋. Mínimo de la fase 2: **98.000**, en *s* = 1 (y en *s* = 5.999/6.000). **Sin breach.** Intercambiar los nombres de los pares (o el orden de creación) no cambia nada. |
| **A31** — el orden secuencial daría otro resultado | A30 con el mismo suelo, 95.000. | Sincronizado: **sin breach** (A30). Como contraste, lo que **no** debe pasar: procesando AUDUSD entero antes que EURUSD, breach en AUDUSD **0,64999** (tick 5.001), equity **94.999**; procesando EURUSD primero, sin breach (98.000). El resultado no puede depender del nombre ni del orden de los pares. |
| **A32** — breach dentro del camino sincronizado | A30 con suelo **98.500**. | Los puntos de la fase 2 son *m*/12.000 con *m* par (AUDUSD) o múltiplo de 3 (EURUSD). Primer punto con equity < 98.500: *m* = 9.002, *s* = **4.501/6.000**: AUDUSD **0,65499** (4.501 ticks), EURUSD **1,07000** (⌊4.000 · 4.501/6.000⌋ = 3.000 ticks); equity **98.499**. Liquidación de los dos en esos precios: −4.501 y +3.000; saldo **98.499**. (En *m* = 9.000, 98.500 exacto: no incumple.) Secuencial, en contraste: AUDUSD primero, breach en AUDUSD 0,68499 con EURUSD en 1,10000; EURUSD primero, breach en AUDUSD 0,64499 con EURUSD en 1,06000. Tres puntos distintos: solo el sincronizado vale. |
| **A33** — breach frente a objetivo entre dos pares | Reto: saldo de medianoche **120.000** (suelo **115.000**), objetivo 110.000, con el cuarto día ya contado por estas aperturas. GBPUSD BUY **2** lotes a 1,30000, SL 1,26000 (2 USD por tick); vela O 1,30000 H 1,30000 L 1,18000 C 1,18000 (B: 12.000 ticks en la fase 2; el SL sería el tick 4.000). EURUSD SELL 1 a 1,10000, TP 1,06000; vela O 1,10000 H 1,10000 L 1,02000 C 1,02000 (B: 8.000 ticks; el TP sería el tick 4.000). | Puntos *m*/24.000 (*m* par: GBPUSD; múltiplo de 3: EURUSD). Equity = 120.000 − 2·⌊*m*/2⌋ + ⌊*m*/3⌋. Primer punto < 115.000: *m* = 7.502, *s* = **3.751/12.000**: GBPUSD **1,26249**, EURUSD **1,07500**; equity **114.998** → **breach `perdida_diaria`**, antes del SL y del TP; liquidación en esos precios, saldo **114.998**; **sin fase superada**. (En *m* = 7.500, 115.000 exacto: no incumple.) Contraste secuencial: EURUSD primero → TP (+4.000), después SL (−8.000), saldo 116.000 sin posiciones ≥ suelo: **concedería la fase**; GBPUSD primero → breach en 1,27499 con equity 114.998. |
| **A34** — tope de 50 | 30 posiciones abiertas en 3 pares y 20 pendientes. | Un `abrir` más (a mercado o pendiente): `tope_alcanzado`, sin efectos. El fill de una de las 20 pendientes deja la cuenta en 50 y no rechaza nada. Tras cerrar una posición, un `abrir` se admite. |
| **A35** — margen de cruces | Bid en el cursor: AUDUSD **0,65000**, GBPUSD **1,25000**. Capital 100.000 sin posiciones. | AUDCAD BUY 1: margen **650,00** USD (100.000 × 0,65 / 100). GBPJPY BUY 1: **1.250,00**. USDJPY BUY 1: **1.000,00**. EURUSD BUY 1 con bid 1,10000 (ask 1,10003): **1.100,00** (P-13b: el bid, no la entrada). El margen usado no cambia aunque AUDUSD se mueva después. Sin vela de AUDUSD en ese minuto en horario de mercado: el `abrir` de AUDCAD se rechaza con `margen_sin_cotizacion`, sin efectos. |
| **A36** — elección del camino aislada (fixture completo, V3-09) | Práctica (sin límites de reto), sin spread, comisión 3 USD/lote. Saldo **100.000**, ya neto de la comisión de GBPUSD. **GBPUSD** BUY 1 abierto antes a 1,30000, sin SL ni TP; vela O 1,30000 H 1,30500 L 1,29800 C 1,30200. **EURUSD** BUY STOP 1,10100, 1 lote, SL 1,09900, creada después (`seq` mayor); vela O 1,10000 H 1,10150 L 1,09850 C 1,10050 (A03 b). Margen de sobra. | **Elección aislada:** EURUSD, **A**: con la comisión del fill (3), la variación de equity mínima es **−203** por A (saldo tras el fill 99.997 y SL bruto −200: mínimo **99.797**) frente a **−53** por B (flotante mínimo −50: mínimo **99.947**); A es la de menor mínimo (V4-04: −200 y −50 eran el P&L bruto); `ambigua`, con causa; **igual con o sin** la posición de GBPUSD; GBPUSD, **B** (mínimo −200 y cierre +200 por los dos caminos: empate → B). **Ejecución conjunta:** fase 2: EURUSD 1,10000→1,10150 (150 ticks), GBPUSD 1,30000→1,29800 (200 ticks); el stop se llena en 1,10100 en *s* = 100/150 = **2/3**. Fase 3: EURUSD 1,10150→1,09850 (300 ticks), GBPUSD 1,29800→1,30500 (700); el SL salta en 1,09900 en *s* = 250/300 = **5/6**: bruto **−200**, neto **−203**. Fase 4: EURUSD sin posición; GBPUSD 1,30500→1,30200. Al cierre: saldo **99.797**, flotante de GBPUSD **+200**, equity **99.997**. Los eventos del minuto llevan `sincronizacion: "modelada"` (dos pares con exposición se movieron). |
| **A37** — una cartera de un solo par = el motor de un par **ajustado** (motor@2, § 13.9) | El subconjunto **real** de casos de un solo par: de `pruebas/motor/un-instrumento.mjs`, A01 (a)–(g), A02, A03 (a)–(d), A04, A05, A06, A08, A11, A12, A16, A17 y C6-07; de `pruebas/motor/reto.mjs`, A13, A14, C6-02, C6-05 y C7-01 (con su integración de cierres-8). **No** entran A07 (dos pares), A09 y A10 (cruces con su par de conversión): son casos de cartera y van por separado (A30–A33, A35, A39, A42). | Ejecutados por la cartera multipar con un solo par: mismo estado (proyección económica, § 12.4) y misma secuencia de eventos económicos que el motor de un par ajustado (motor@2: V3-02 literal y margen@2), comando a comando. Margen: EURUSD BUY a mercado **1.100,00**; la BUY LIMIT de A01 b **1.099,50**. Además, los oráculos de frontera de A43 comparan **cifras**, no solo los dos motores (podrían equivocarse igual). |

### 13.7 Pendientes

- ~~P-13a~~, ~~P-13b~~: decididos (7-oct, § 13.3).
- ~~**P-23a**~~ **decidido por el CTO (8-oct)** en el sentido de la propuesta: límites también antes de la primera apertura de cada punto, después de las protecciones (§ 13.2, paso 3). Texto original de la pregunta: V3-02 manda evaluar los límites **tras cada cierre y tras cada fill**. Queda un caso sin regla: en un punto **sin ningún cierre**, la equity puede estar ya por debajo del límite al actualizar los precios y, aun así, la regla deja que **se llene una orden** en ese precio (cobra comisión y spread) antes del primer «tras cada fill». «La cuenta queda rota en ese instante» (CTO, 8-oct) y «el primer instante en que la equity queda por debajo» (§ 3.4) apuntan a evaluar antes. **Propuesta:** evaluar los límites **también antes de la primera apertura de cada punto** (después de las protecciones, para no cambiar la etiqueta `SL`/`TP` de los cierres de los oráculos aprobados, C7-01 incluido). La alternativa, evaluar nada más actualizar los precios, antes incluso de las protecciones, convertiría el `SL` del hueco de C7-01 en un `cierre` por `breach` (mismo dinero, otra etiqueta).

### 13.8 Los ocho oráculos de Astra (diseño-3, A38–A45)

Sin spread ni comisión salvo que se diga; reto con suelo = saldo de medianoche − 5.000 y objetivo 110.000, con los cuatro días ya contados cuando se dice «objetivo posible».

| # | Entrada | Resultado exigido |
|---|---|---|
| **A38** — objetivo y pendiente en la misma fracción (V3-02) | **(a) Un par:** saldo 100.000, objetivo posible; EURUSD BUY 1 a 1,10000 con TP 1,20000 y un BUY STOP 1,20000 pendiente (creado después). Tramo que llega a 1,20000. **(b) Dos pares:** EURUSD BUY 1 a 1,10000, TP 1,20000, tramo 1,10000→1,30000 (20.000 ticks: el TP en *s* = 1/2); GBPUSD BUY STOP 1,30500, tramo 1,30000→1,31000 (1.000 ticks: el stop en *s* = 1/2). **(c) Breach que prevalece:** saldo de medianoche 120.000 (suelo 115.000), objetivo posible; EURUSD BUY 1 a 1,10000 con TP 1,12000 y GBPUSD BUY 2 a 1,30000 con SL 1,26500 (`seq` de EURUSD menor); la vela abre en hueco: EURUSD en 1,12000 y GBPUSD en 1,26499. | (a) El TP deja **110.000** sin posiciones → límites (sin breach) → **fase superada**; el stop se anula (`objetivo`); **ningún fill**. (b) A igual fracción, primero la protección: el TP de EURUSD → **fase superada**; el stop de GBPUSD se anula; ningún fill. (c) Precios actualizados a la vez; primero el TP de EURUSD (+2.000) → límites con GBPUSD ya en 1,26499: equity = 122.000 − 7.002 = **114.998** < 115.000 → **breach** → GBPUSD liquidado en 1,26499 (cierre por `breach`, no por SL); saldo **114.998**; **sin fase**, aunque el saldo final ≥ objetivo y sin posiciones. |
| **A39** — frontera de fase 3→4 sin ticks (V3-03) | Saldo **100.000**; suelo **100.480** (medianoche 105.480). GBPJPY BUY 1 a 190,000; vela plana a **190,700** (flotante **+70.000 JPY**; todos los tramos *n* = 0). USDJPY (solo convierte) O 140,000 H 155,000 L 140,000 C 155,000. **Repetir** con un EURUSD sin posiciones y vela plana añadido. | Fases 1–3, conversión con la apertura (140): flotante **500,000000**, equity **100.500**: válida. En el ***s* = 0 de la fase 4**, conversión con el cierre (155): flotante **451,612903**, equity **100.451,612903** < 100.480 → **breach** ahí, sin que ningún precio dé un tick. Liquidación de GBPJPY en 190,700 convertido a 155: saldo **100.451,612903**. Con el EURUSD añadido: **lo mismo**. |
| **A40** — fracciones iguales escritas distinto, margen justo, `seq` (§ 13.2) | Práctica. Saldo **2.400** sin posiciones. EURUSD vela O 1,10002 H 1,10002 L 1,10000 C 1,10000 (B: *n* = 2, el tick 1 en *s* = 1/2); BUY LIMIT 1 lote a 1,10001. GBPUSD vela O 1,30004 H 1,30004 L 1,30000 C 1,30000 (B: *n* = 4, el tick 2 en *s* = 2/4); BUY LIMIT 1 lote a 1,30002. La de GBPUSD con `seq` menor. Margen de una pendiente: bid de apertura del minuto (P-13a): EURUSD **1.100,02**, GBPUSD **1.300,04**. | En *s* = 1/2 = 2/4 se actualizan **los dos** precios antes de nada. Por `seq`: GBPUSD se llena (1.300,04 ≤ 2.400); EURUSD ya no cabe (libre 1.099,96 < 1.100,02) → `orden_cancelada`, `margen_insuficiente`. Con los `seq` al revés: se llena EURUSD (1.100,02) y GBPUSD se cancela (libre 1.299,98 < 1.300,04). Permutar los arrays o los nombres de los pares no cambia nada. |
| **A41** — *n* = 0, fracciones que no coinciden y precio que baja (§ 13.1) | EURUSD tramo 1,10003→1,10000 (*n* = 3) con un SELL STOP 1,10001; GBPUSD tramo 1,30000→1,30002 (*n* = 2); USDCHF con vela plana (*n* = 0). | Puntos: 1/3, 1/2, 2/3, 1 (y el *s* = 0 obligatorio). En *s* = 1/2, EURUSD está en 1,10003 − ⌊3 · 1/2⌋ = **1,10002** (no 1,10001: el redondeo es hacia el inicio del tramo, no al más cercano) y GBPUSD en **1,30001**. El SELL STOP 1,10001 se llena en ***s* = 2/3**, no en 1/2. USDCHF no aporta puntos. |
| **A42** — ejecución y conversión separadas (V3-03) | **(a)** `costes@1`: USDJPY SELL 1 a bid **150,000**; se cierra con bid **151,000** (ask 151,004). **(b)** Sin costes: GBPJPY con +70.000 JPY cerrado por TP en la fase 2 o en la fase 4 del minuto en que USDJPY abre en 140,000 y cierra en 155,000. | (a) Sale al **ask 151,004**: bruto (150,000 − 151,004) × 100.000 = **−100.400 JPY**, convertido con el **bid 151,000**: **−664,900662 USD** (no −664,883049, que sería con el ask); neto con 3 USD de comisión **−667,900662**. (b) TP en la fase 2: **+500,000000 USD** (apertura 140); en la fase 4: **+451,612903 USD** (cierre 155). |
| **A43** — margen a los dos lados de P-13b; parciales (V3-08) | **(a)** `costes@1`, saldo **1.100,01** sin posiciones: EURUSD BUY 1 a mercado con bid 1,10000 / ask 1,10003. **(b)** Libre **1.099,25**: la BUY LIMIT 1,09900 de A01 b se llena. **(c)** Pendiente de AUDCAD que se llena en la **fase 4** del minuto en que AUDUSD abre en 0,65000 y cierra en 0,66000. **(d)** AUDCAD 1 lote con margen fijado **650,00**; cerrar 0,25 y después 0,75; serializar y reanudar entre medias. | (a) margen@2: **1.100,00** ≤ 1.100,01 → **se admite** (con margen@1, 1.100,03: se rechazaba). (b) margen@2: **1.099,50** > 1.099,25 → `orden_cancelada`, `margen_insuficiente` (con margen@1, 1.099,00: se llenaba). (c) Margen con la **apertura** de AUDUSD: **650,00** (no 660,00), aunque su P&L de fase 4 convierta con el cierre. (d) Tras 0,25: libera **162,50**, queda **487,50**; tras 0,75: libera **487,50**, queda 0. Igual sin y con serialización. |
| **A44** — tope en varios pares (§ 13.5) | 30 posiciones y 19 pendientes en 3 pares (49). | `abrir` → 50, se admite. Otro `abrir` → `tope_alcanzado`, sin consumir `seq` ni id y sin cambiar estado ni versión (el siguiente `abrir` admitido recibe el `seq` que habría recibido). Un fill de una pendiente → sigue en 50. Un cierre parcial → sigue en 50 y otro `abrir` se rechaza. Un cierre total → 49, y un `abrir` se admite. |
| **A45** — B/B frente a B/A (V3-09) | Saldo **100.000**, suelo **95.000**, sin costes. EURUSD BUY 1 a 1,10000, vela O = C = 1,10000, H 1,13000, L 1,07000. GBPUSD SELL 1 a 1,30000, vela O = C = 1,30000, H 1,33000, L 1,27000. Sin SL, TP ni pendientes. | Aislados: cada par tiene mínimo **97.000** y cierre **100.000** por A y por B → los dos eligen **B**. Sincronizados B/B: en cada punto las dos posiciones se compensan exactamente: equity **100.000** constante, **sin breach**, con `sincronizacion: "modelada"`. **Para la marca, no como resultado exigible:** B/A (otra combinación compatible con las mismas velas) liquidaría en **94.998**; la política no la explora y no promete cota (§ 13.4). |

Paso, salto y reanudación (§ 3.8) se comparan en **todos** estos casos (estado y eventos económicos), incluido un `no_valorable` que deja el minuto entero sin consumir.

### 13.9 Cambios sobre lo aprobado (para Astra)

**V3-02, regla literal (CTO 8-oct): cambia el motor de un instrumento aprobado** (`lib/motor/motor.mjs`, `enPrecio`). Hoy, tras un cierre, los límites solo se miran si se cumpliría el objetivo (C7-01); si no, al final del precio, **después** de las órdenes. Con la v2.3, **tras cada cierre y tras cada fill, siempre**, y con breach no se ejecuta nada más en ese precio. Lo fiel a un bróker: la cuenta queda rota en ese instante.

Medido con el motor aprobado (`costes@1`, suelo 95.000): BUY 1 lote cerrado por SL que deja la equity en **94.994**, y una BUY LIMIT que se llena en el mismo precio.

| | Eventos | Saldo final |
|---|---|---|
| Motor aprobado (motor@1) | `cierre SL` → `fill` → `breach` → `cierre breach` de la posición nueva | **94.988** |
| v2.3 (motor@2) | `cierre SL` → `breach` (la orden se cancela, motivo `breach`) | **94.994** |

Diferencia: **6 USD** (comisión 3 + spread 0,3 pips de un lote, del fill que ya no existe).

- **Versiones:** el motor pasa a **`motor@2`** (orden de límites de V3-02 y margen@2 de P-13b/V3-08); el estado lo dice en `versiones.motor` y `versiones.margen`. No hay sesiones v1 en uso que recalcular.
- **A37** compara la cartera de un solo par con el motor de un par **ya ajustado** a motor@2, no con motor@1.
- Por lectura de las pruebas aprobadas (`pruebas/motor/`), ningún oráculo aprobado depende del orden cambiado (en C7-01, el SL cierra y el breach llega con ese mismo cierre: igual con las dos reglas); se comprobará al implementar.
