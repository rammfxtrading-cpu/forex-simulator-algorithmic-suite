# Simulador · fase 1: reproducción de la auditoría de Astra

**Fecha:** 4-oct-2026 · **Rama:** `auditoria-simulador` (desde `main` = `c470c8f`) · **Nada en `main`.**
**Auditoría reproducida:** `~/Desktop/revisiones-suite/2026-10-04-astra-simulador.md` (40 hallazgos; aquí, los 23 altos).
**Sin arreglar nada.** Todo lo de este documento son pruebas en rojo, una consulta de solo lectura y dos diseños.

## Resumen

- **Producción sirve `c470c8f`.** Los 7 chunks de página de `simulator.algorithmicsuite.com` son idénticos a un build local de `c470c8f` salvo ids de módulo, las dos variables públicas y nombres del minificador.
- **Los 23 hallazgos altos se reproducen, y ninguno queda parcial.** Hay 65 oráculos en rojo y 0 controles rotos. Las cifras coinciden con las de Astra en todos los casos que ella midió.
- **Diferencias con Astra:**
  - **Un caso peor en D04.** Si Storage no deja leer el fichero, el handler pisa el año bueno, de 10.000 velas a 1.440.
  - **O01 y M05 ejecutados.** Astra no ejecutó `restore-2026.js` (O01): aquí se ejecuta y se confirma. M05 se ejecuta entero sobre la página real.
  - **Dos dependencias de la base real.** D06-C y parte de D06-A dependen de las cascadas reales, que da la consulta s04.
- **La consulta del esquema está lista:** `sql/consultas/s04-esquema-simulador.sql` (solo SELECT), ensayada en PostgreSQL 17. **La ejecuta Ramón.**
- **Primero, sin esquema:** mitigaciones baratas y el motor puro.
- **Después, con s04:**
  - la cartera durable (SQL nuevo, ver § 7);
  - el reto, sobre la cartera;
  - el borrado transaccional.

## 1. Qué commit sirve producción

Es el método del journal: comparar chunks de página, no marcadores sueltos.

1. Se pidieron, en solo lectura, `/`, `/dashboard`, `/analytics`, `/admin`, `/operativas` y una `/session/…` inexistente.
   - Todas devuelven `buildId` `Nw_q75aBd28eJByUngkyz`.
   - Cabeceras: `x-vercel-cache: HIT` y `age` 200.302 s (unos 2,3 días en caché a las 13:59 del 4-oct).
2. Se compiló `c470c8f` en una copia `git archive` en el scratchpad:
   - `node_modules` enlazado;
   - `sin-red.mjs` delante;
   - variables públicas falsas;
   - sin telemetría.
3. Se compararon los 7 chunks de `pages/`: `_app`, `index`, `admin`, `analytics`, `dashboard`, `operativas` y `session/[id]`.
   - **Tras normalizar los ids numéricos de módulo** (dependen de la ruta de build), `_app`, `admin`, `analytics`, `operativas` y `session/[id]` son **idénticos**.
   - `index` y `dashboard` solo difieren en dos cosas. La primera, la URL y la clave publicable de Supabase, públicas por diseño, que el build local tiene falsas. La segunda, el renombrado de variables del minificador (`w↔F`, `B↔W`, `_↔z`), con la misma estructura.
4. **Marcador discriminante.** `c470c8f` es el commit que sube a 16 px el selector de sesión de `/analytics`. El chunk servido contiene `sessionFilter:{…fontSize:16…}`; su padre `2a4ffd9` tenía 12. `origin/main` = `c470c8f`, y las otras dos ramas remotas son antiguas.

**Límite:** esto certifica el código de cliente servido. Las funciones `/api/*` no se pueden comparar desde fuera sin llamarlas, y no se han llamado.

## 2. La consulta del esquema (S04)

- **Fichero:** `sql/consultas/s04-esquema-simulador.sql` · 144 líneas · sha256 `bb9aee948988519c39541be2a93817aa22d440964c5c4839ed67fb4ae783dee7`.
- **Forma:** una sola SELECT, que acaba en `FIN | s04 | consulta`. No trae filas de datos, solo catálogo.
- **Qué devuelve**, para `profiles`, `messages`, `sim_sessions`, `sim_trades`, `session_drawings`, `session_chart_config`, `sim_drawing_templates`, `user_chart_config` y `user_tool_config`:
  1. las tablas pedidas que **no existen** (fila `FALTA`);
  2. dueño y RLS;
  3. columnas con tipo, NOT NULL, default, identity y generadas;
  4. constraints, incluidas las **FK de otras tablas que apuntan a estas** (cascadas que llegan de fuera);
  5. índices;
  6. triggers;
  7. políticas;
  8. grants por tabla y por columna;
  9. funciones: las de los triggers, las de `public` que nombran las políticas (también las de Storage), `is_admin()` y `handle_new_user()`, con firma literal, dueño, SECURITY DEFINER, search_path, ACL y definición;
  10. el bucket `forex-data`: público, límite de tamaño y tipos admitidos, o «NO EXISTE»;
  11. el RLS de `storage.objects` y **todas** sus políticas, marcando cuáles nombran `forex-data`, porque una que no lo nombra también le aplica.
- **Ensayo:** `pruebas/s04-consulta.mjs`. Corre en PostgreSQL 17 local desechable, dentro de `BEGIN READ ONLY`, con un esquema stub inventado (el simulador no tiene SQL versionado). Pasa 19 controles. Entre ellos:
  - la escritura de control falla en esa transacción;
  - un dato centinela de una fila NO aparece en la salida;
  - sin el bucket, lo dice.
  - **No prueba el editor de Supabase**, aunque una SELECT sola no depende del manejo de sesión.

**Para Ramón:** pegarla entera en el editor SQL de Supabase y devolver el resultado completo.

## 3. El arnés

`pruebas/` es nuevo. Toma el patrón del journal, adaptado. Reglas:

- **Sin red:** `sin-red.mjs` corta fetch, http, https, net y dns. Lo comprueba `pruebas/arnes.mjs`, con controles positivos.
- **Sin secretos:** `env -i`. Ningún `.env` se lee; los scripts CommonJS corren con un `.env.local` falso en una carpeta temporal, y un espía de `fs`, con control positivo, comprueba que no se abre ninguno real.
- **Cero escrituras:** Supabase y Dukascopy son dobles en memoria.
- **El doble es perezoso como PostgREST:** un builder sin `then` no ejecuta. D01 depende de esto, y el arnés lo comprueba, con control positivo.
- **Datos inventados:** ningún dato de alumnos.

**Qué se ejecuta de verdad:**

- **Los handlers reales** de `pages/api`.
- **Los hooks reales:** `usePairData`, `useTradingActions`, `useChallengeFlow` y `useAuth`. Corren a través de `pruebas/banco-motor.mjs`, que los cablea como `_SessionInner`, con `loadPair` pidiendo velas al `/api/candles` real sobre el Storage falso.
- **Las páginas reales,** en un React mínimo:
  - `pages/dashboard.js`, `pages/analytics.js` y `pages/admin.js`;
  - **`components/_SessionInner.js` entero**, sin gráfico: los refs de callback no se modelan, así que lightweight-charts nunca se crea. El `OrderModal` se carga por el `next/dynamic` falso, que importa el módulo de verdad.
- **Los dos scripts** `scripts/actualizar-diario.js` y `scripts/restore-2026.js`. Se ejecutan con su `require` interceptado, el reloj fijo y las esperas instantáneas.

**Cómo leer cada prueba:**

- `ver()` es un **control**; si falla, la prueba no vale (código 2).
- `oraculo()` es lo que el producto **debería** hacer, con el número calculado a mano en la cabecera del fichero; en rojo, código 1, que es lo esperado hoy.
- Una excepción no capturada sale con código 3. Así no puede pasar por «reproducido».
- **Guiones:**
  - `sh pruebas/fase1.sh` corre las reproducciones (hoy en rojo a propósito).
  - `sh pruebas/tanda.sh` es la tanda de regresión (arnés y ensayo de la s04): en verde.

**Errores míos que cazaron los controles durante el trabajo,** todos corregidos con su control:

- **El código de salida.** El guion contaba un fallo de la prueba como «reproducido»: una excepción sale con 1, el mismo código que el rojo. Ahora sale con 3; control positivo: una prueba que revienta sale «CONTROL ROTO».
- **El buscador de U01** tomaba el resultado `BREAKEVEN` por la opción. Ahora tiene un control negativo.
- **Un control vacío en M05,** un `&& true`. Ahora es un espía del `currentPrice` que recibe el modal.
- **El React falso repintaba siempre desde la raíz.** Así fabricaba un bucle infinito en `PositionOverlay` que React real no tiene. Ahora repinta desde el componente que cambió (bailout por elemento), como React. Ningún resultado cambió al corregirlo.
- **Lecturas de texto pegado** del tipo «0.001 POS» o «+500.001». Ahora se lee el nodo.
- **La caché en memoria de `/api/candles`** (D05) sirvió velas de un escenario anterior en mis propias pruebas. Cada escenario usa ahora su propio par. Es evidencia a favor de D05.

## 4. Reproducción, hallazgo por hallazgo

R = reproducido · P = parcial · N = no se reproduce.

| Hallazgo | ¿? | Prueba | Lo medido | Frente a Astra |
|---|---|---|---|---|
| **S01** permiso de producto | R | `s01-permiso-de-producto` | Cuenta del hub sin `simulador_activo`: `GET /api/candles` 200 (sirve velas), `challenge/create` 200 (inserta), `status` 200, `advance` 200 (update + insert, `phase_passed`). Cero lecturas de `profiles`. Controles: sin token 401; con permiso 200. | Igual. Añado `advance` y las escrituras que hace. |
| **S02** identidad | R | `s02-identidad` | Cookie compartida pasa a B y vuelve la pestaña: user A + perfil B. Sesión cerrada en el hub: siguen A/B y `hasAccess` true. `SIGNED_OUT` en la misma pestaña: siguen los datos de A. | Igual. |
| **S03** coste de velas | R | `s03-coste-de-velas` | 12 peticiones simultáneas del mismo año con caché fría: **12 descargas** al proveedor. POST → 200. | Igual. |
| **M01** valor del pip | R | `m01-valor-del-pip` | 1 % de 100.000, SL 10 pips: el modal da 10 lotes y anuncia −1.000 en todos; al tocar el SL: EURUSD −1.000 (control), USDJPY **−625**, EURGBP **−1.335**, USDCHF **−1.265**. USDJPY 150→151 1 lote: **625** (oráculo 662,251656). EURGBP: tabla fija 13,35 (con GBPUSD 1,25 serían 12,50). | Cifras idénticas. |
| **M02** vela ambigua | R | `m02-vela-ambigua` | Vela que toca TP y SL: **TP +100**, sin marca. Control: vela solo TP → +100. | Igual. |
| **M03** hueco | R | `m03-hueco` | Abre en 1,0950 con SL 1,0990: sale a **1,0990, −100** (oráculo 1,0950, −500). | Igual. |
| **M04** limit + SL en la vela | R | `m04-limit-y-stop` | Con otra posición abierta, la limit llenada sigue **abierta**. Control: sin otra posición, −100. Go to a NY AM: paso a paso −100 (control), con el salto **sigue abierta**. | Igual. Uso enero para no depender de M13 (DST). **Ampliado el 5-oct (H03, `369e7c1`):** mirando tras un solo paso, la protección llega **una vela tarde también sin otra posición** (el «control» de dos pasos lo ocultaba). Se arregla con el motor nuevo (especificación v2, § 3.3; A03). |
| **M05** precio de mercado viejo | R | `m05-precio-de-mercado` | **Página real:** modal abierto a 1,10100, el replay avanza 5 velas (ArrowRight), el modal sigue en 1,10100, y al confirmar la posición nace con **Float +500,00** con el precio en 1,10600. | Astra, por lectura; aquí, ejecutado entero. |
| **M06** breach intravela | R | `m06-breach-intravela` | Estado del reto del `/api/challenge/status` real. A (+3.000 hoy, flotante −6.000): **cierre forzado −5.005 a 1,14995**, y el evaluador sigue «active». B (−3.000/+3.000, flotante −2.500): **−2.005**. | Cifras idénticas. |
| **M07** pérdida diaria | R | `m07-perdida-diaria` | 2F, día 1 +3.000, día 2 −5.100: tope **5.150**, estado **active** (FTMO: tope 5.000, equity 97.900 < 98.000 → quemado). | Igual. ⚠️ Decisión de producto: aplicar FTMO o dejar de llamarlo FTMO. |
| **M09** última vela y pausa | R | `m09-ultima-vela-y-pausa` | SL solo en la última de 3 velas: llega al final y la posición **sigue abierta**. 20 M1/s, frame de 250 ms, pausa en el primer paso: acaba en **índice 5** (onTick 1..5). | Igual. |
| **D01** recargar | R | `d01-recargar` | **Página real:** saldo guardado 0 → enseña **$10000.00**. Una compra por Buy + OrderModal → «1 POS». Al salir: **0 escrituras** de `sim_sessions` (control: la misma limpieza sí guarda dibujos). Al volver: **0 POS**. Nada lee posiciones ni pendientes. | Igual, ejecutado en la página. |
| **D02** cierre no atómico | R | `d02-cierre-no-atomico` | `closePosition` real persistiendo. Falla el insert: base con saldo 10.100 y 0 trades; pantalla con la posición quitada y +100. Falla el update: trade +100 con saldo 10.000. | Igual. |
| **D03** histórico parcial | R | `d03-historico-parcial` | Un solo lunes para todo 2025: **se sube al bucket** y se sirve 200 con 1.440 velas. Cliente con 2025 en 500: devuelve 3 velas de contexto, **0 de la sesión**, sin aviso. | Igual. |
| **D04** antidegradación | R | `d04-antidegradacion` | Lectura transitoria fallida, bucket con 10.000: **sirve y cachea 1.440**. **Storage ilegible: pisa el bucket, 10.000 → 1.440.** Upload con error: registra «Saved». | **Peor que Astra:** el caso ilegible sobrescribe el año bueno (`candles.js:184`: con error de lectura, `if (!dlError && existingBlob)` no compara y deja `shouldUpload = true`). |
| **D05** actualizador y caché | R | `d05-actualizador-y-cache` | Último día a medias (720 velas): pide solo el día siguiente; el 30-sep queda en 720. Día interior vacío: la pasada siguiente no lo pide. Caché caliente: tras añadir el 1-oct, sirve 1.440 y **0 lecturas** de Storage. | Igual. |
| **D06** borrado | R | `d06-borrado` | A) Cuatro deletes en error: la tarjeta **desaparece** sin aviso. A2) Borrado correcto: las métricas siguen en **2 trades, +$400.00**. B) El wipe falla en dibujos: trades **0 de 2** y acceso **activo**. C) Wipe correcto: quedan `user_chart_config` 1 y `user_tool_config` 1. | Igual. ⚠️ El doble no tiene cascadas: C y parte de A dependen de las FK reales (s04). |
| **D07** avance de fase | R | `d07-avance-de-fase` | A) Insert y rollback fallan: responde «se ha revertido» con el padre en **passed_phase sin hija**. B) Respuesta del insert perdida: padre **active con hija**. | Igual. |
| **C01** dos cargas | R | `c01-dos-cargas` | Segunda carga retenida, posición abierta sobre la primera, se suelta: **el motor 1 sustituido por el 2, 0 posiciones**. | Igual. |
| **C02** métricas | R | `c02-metricas` | Páginas reales, mismos datos: expectativa del admin **−$33.33**; R:R alumno **1.00** / mentor **0.00R**; capital de partida alumno **60000** / admin **10000**. | Cifras idénticas. |
| **P01** tick incremental | R | `p01-tick-incremental` | `updateChart` real con el guard de LWC 5.1.0 modelado: 3 ticks en la misma vela H1 dan **3 setData** de toda la serie y 3 rechazos «Cannot update oldest data». La vela nueva: 1 setData. | Igual (el mismo tipo de doble que Astra; el guard es el de la línea 11366 de la librería instalada). Sin FPS medidos. |
| **U01** auto break-even | R | `u01-auto-break-even` | El interruptor se activa (se ve), pero el payload no lo lleva y nada fuera del modal lo lee. El buscador tiene control positivo y negativo. | Igual. |
| **O01** restaurar y año nuevo | R | `o01-restaurar-y-anio-nuevo` | `restore-2026.js` **ejecutado** con el proveedor vacío: EURUSD 2026 pasa de **100 a 0** velas, borra **los dos** 2023, acaba en «Done.» con código 0. `actualizar-diario.js` el 2-ene-2027 sin fichero 2027: «no se pudo leer», **0 días pedidos**. | Astra no ejecutó el restore; aquí se confirma. |

**Lo que no se ha podido medir con esto:**

- RLS, grants, constraints, triggers y cascadas reales (los da la s04);
- el comportamiento del gráfico real y de los plugins;
- el navegador: rendimiento, foco, táctil;
- la red real.

## 5. Diseño A · un motor de eventos puro y determinista

**Módulo nuevo `lib/motor/`, sin React, sin red y sin reloj.** No llama a `Date.now` ni a `Math.random`, y los ids vienen del comando. Una función hace todo el trabajo:

```
avanza(estado, mercado, hasta) → { estado', eventos[] }
aplica(estado, comando, mercado) → { estado', eventos[] } | { error }
```

**El estado:** `{ saldo, posiciones[], ordenes[], cerrados[], cursor, seq, motor_version }`. El `cursor` es el tiempo de la **última vela ejecutada**, no la que se ve.

**Los comandos:**

- `orden{ clave, tipo: mercado|limit|stop, lado, precio?, sl, tp, lotes, cotizadoEn }`
- `modifica`, `cancela`, `cierra{ lotes? }`

`clave` es un UUID del cliente: la idempotencia empieza aquí.

**Las reglas:**

1. **Instrumento explícito.** Una tabla `{ par, base, cotizada, pip (0,0001 | 0,01), contrato 100.000, lotes mínimo y paso, dígitos }` sustituye a `isJpy`/`pipMult`. Un lote no representable se rechaza (M11).
2. **P&L en la divisa cotizada; conversión a la de la cuenta (USD) con el precio de ese momento:**
   - par cotizado en USD: 1;
   - USD como base (USDJPY): `1 / precio` del propio par en el cierre;
   - cruces: el par que convierte (GBPUSD para EURGBP, USDJPY para EURJPY, USDCAD para AUDCAD), con la última vela con tiempo ≤ el del evento: sin mirar al futuro.
   - Todos están en el bucket: EURGBP y EURJPY convierten con GBPUSD y USDJPY.
   - **El sizing del modal usa la misma función** que el cierre, así que el riesgo anunciado es el ejecutado (M01).
3. **Mercado al precio vigente.**
   - El comando lleva `cotizadoEn` (el cursor con el que se cotizó). Si el cursor avanzó, `aplica` devuelve `{ error: 'precio_cambiado', precio }` y la UI vuelve a cotizar.
   - Se llena al cierre de la última vela ejecutada, más medio spread (M05).
4. **Cada vela, en orden fijo:**
   - **a) Apertura.** Todo lo que la apertura atraviesa se llena **a la apertura**: un stop o un SL saltados por un hueco salen al open, peor que su precio (M03). Una limit o un TP saltados, al open, que es mejor o igual.
   - **b) Recorrido intravela.** Con OHLC no se sabe el orden.
     - **Política «stop primero»:** si una vela toca un SL y un TP (o una stop de entrada y una limit), se ejecuta lo adverso.
     - El evento lleva **`ambigua: true`** (M02).
   - **c) Lo que se llena en esta vela queda protegido en esta misma vela.** Su SL se evalúa en lo que queda del recorrido compatible con el fill: una BUY LIMIT llenada al bajar sigue bajando hasta su SL sin ambigüedad. Un TP en la vela del fill solo cuenta si no es ambiguo (M04).
   - **d) Equity peor-caso de la vela** para el reto, con la misma política. El reto devuelve un evento `breach` y `avanza` **para en esa vela** (M06, M09).
5. **El mismo resultado paso a paso que con salto.**
   - `avanza` recorre **todas** las velas entre `cursor+1` y `hasta`, una a una; el Go to es `avanza(hasta = destino)`.
   - Propiedad que se prueba: `avanza(avanza(e, t1), t2) === avanza(e, t2)` para cualquier `t1` (M04-Go to).
6. **La última vela se ejecuta.** El fin de datos es un evento después de procesarla (M09).
7. **La pausa vive fuera del motor.** El bucle de reproducción llama a `avanza` vela a vela y mira la pausa **entre velas**; un `breach` o una pausa cortan el lote (M09).
8. **Costes configurables, declarados en la sesión:**
   - spread por par (fijo; luego histórico si hay datos);
   - comisión por lote ida y vuelta;
   - deslizamiento en stops.
   - Modo por defecto «sin costes», escrito como tal en la pantalla y en el recibo.
9. **Aritmética.** Los precios van en puntos enteros (precio × 10^dígitos) y el dinero en céntimos, con el redondeo en un solo sitio.
10. **Recibo por evento:** precios, secuencia, costes, conversión aplicada, `ambigua`, `motor_version` y versión de datos de mercado. Con eso se explica cada fill.

**Pruebas del motor:**

- las oráculos de esta fase (M01–M05, M09, M04-Go to);
- la propiedad paso/salto;
- huecos en los dos sentidos, ambigüedad marcada, conversión JPY y cruces, lote mínimo.
- Las de `pruebas/fase1/m0*` pasan a la tanda, en verde, cuando el motor esté.

## 6. Diseño B · cartera durable

**Fuente de verdad en la base.** Dos piezas:

1. **Un registro de eventos.** `sim_eventos`: solo crece; `unique (session_id, seq)` y `unique (session_id, clave)`.
2. **Un estado materializado en la sesión.** `sim_sessions.estado jsonb` lleva posiciones, pendientes, saldo, cursor, seq y `motor_version`, más `version bigint` para la comparación optimista.

**Una sola escritura por comando:** la RPC `sim_guardar(p_session, p_version_esperada, p_eventos, p_estado)`, en una transacción, hace siete cosas:

1. Comprueba que la sesión es del usuario **y que tiene el simulador activo** (S01 también en la base).
2. Si todas las `clave` ya están, devuelve el estado actual. Es **idempotente**: un reintento tras una respuesta perdida no duplica nada.
3. Compara `version` con la esperada. Si no coincide (otra pestaña), devuelve conflicto con el estado vigente.
4. Inserta los eventos.
5. Inserta en `sim_trades` una fila por cada cierre, con `evento_id unique`: el libro de cerrados sigue siendo `sim_trades`, para analytics y para el hub.
6. Actualiza `estado`, `balance` (columna que lee el hub, ahora derivada del estado), `last_timestamp` y `version + 1`.
7. Todo o nada (D02).

**El cliente:**

- **Una cola de salida** (localStorage) de comandos con su `clave`, en tres estados: pendiente, confirmado o error, con reintento con la misma clave. Un cierre no confirmado se ve como **pendiente**, no como hecho.
- **Al cargar,** se lee `estado` del servidor (posiciones, pendientes, saldo, cursor), se reaplica la cola no confirmada, y el motor sigue desde `cursor` (D01). El guardado de salida deja de hacer falta: cada comando ya está guardado.
- **La cartera es de la sesión, no de la carga de un par.** Los datos de mercado se cargan por par con generación y descarte de respuestas viejas; una carga nunca escribe la cartera (C01).
- **Confianza.** El cliente calcula los fills con el motor puro. El servidor guarda atómicamente y **re-evalúa el reto desde los eventos** (el mismo evaluador, ver § 8). Más adelante, un verificador puede re-ejecutar los eventos contra los datos de mercado versionados.
  - Hoy recalcular cada fill en el servidor obliga a cargar años de M1 (37 MB por año) por comando. Eso no compensa en un simulador de práctica.

**Migración de las sesiones ya guardadas** (nada se reescribe en silencio):

| Qué hay | Qué se hace |
|---|---|
| Posiciones abiertas y limit pendientes | **No existen en la base**: nunca se guardaron (D01). No hay nada que migrar; se pierden hoy al recargar. |
| `sim_sessions` existentes | **Estado inicial al primer acceso, cuando `estado` es null:** saldo = `balance` (null → capital; **0 se queda en 0**), sin posiciones ni pendientes, cursor = `last_timestamp`, seq = número de `sim_trades`, `motor_version = 0` («legado»). |
| `sim_trades` existentes | Se quedan como están, marcados `motor_version = 0`. Su P&L se calculó con el valor del pip fijo (M01) y sin política de huecos ni ambigüedad: **no se recalculan** sin decisión del CTO; se puede ofrecer un informe de «P&L con el motor nuevo» aparte. |
| Saldos incoherentes (D02 histórico) | Una **consulta de solo lectura** lista las sesiones con `balance ≠ capital + Σ pnl`, y las de `balance = 0`. Ramón decide caso a caso. |
| Retos (`challenge_*`) | Los cerrados conservan su estado, con `reglas_version = 0`. Si se adopta la regla FTMO (M07), solo se aplica a retos nuevos; re-evaluar los activos es decisión del CTO. |
| Hub | Lee `sim_sessions`. Añadir columnas no rompe sus lecturas, pero **CLAUDE.md exige aprobación de Ramón y aviso al hub** para cualquier cambio de esquema de `sim_sessions`. |

## 7. Qué se conserva del código actual

**Se conserva, con cambios acotados:**

- **`lib/replayEngine.js`:** la agregación incremental y la búsqueda binaria de `currentIndex`, como reloj de visualización. Se le quita la ejecución de órdenes (M09: última vela y pausa entre velas).
- **`lib/challengeEngine.js`:** evaluador puro, por día de Madrid. Se amplía a eventos de equity y a la regla diaria declarada (M07).
- **`lib/trading/pricing.js` y `orders.js`:** `calcPnl`, `realizePnl`, `priceFromPips`. Pasan a usar la tabla de instrumentos y la conversión.
- **`lib/trading/breach.js`:** la solución lineal del precio de breach es correcta como idea; cambia la base diaria (M06).
- **`lib/sessionData.js`:** deduplicado, orden y filtro de fin de semana. Se le añade la comprobación del estado HTTP por año y la cobertura (D03).
- **`lib/killzonesDomain.js`:** `nextSessionOpen` para el Go to (M13 aparte).
- **La guarda «no ejecutar velas anteriores a la apertura»** (`useTradingActions.js:191,214`), que pasa a regla del motor.
- **Las guardas de servidor:** JWT con `getUser`, admin en servidor, ownership de los retos, whitelist de updates. Más el aviso honesto de wipe incompleto.
- **`useTradingActions`, `usePairData` y `useChallengeFlow`** quedan como **adaptadores de UI** del motor y de la cartera: dejan de mutar `pairState` a mano.

**Se sustituye:**

- la ejecución de órdenes dentro de `checkSLTP` / `checkLimitOrders`;
- el `pairState` como dueño de la cartera;
- las escrituras sueltas a `sim_trades` / `sim_sessions`;
- el guardado de salida.

## 8. Orden de trabajo, con dependencias

| # | Trabajo | Hallazgos | Depende de | SQL |
|---:|---|---|---|---|
| 0 | **Ramón ejecuta la s04**; versionar `sql/simulador-000-baseline.sql` desde su salida | S04 | — | consulta (hecha) |
| 1 | **Mitigaciones sin esquema**, ya: retirar AUTO BE; permiso de producto en las 4 APIs; GET-only + una descarga en vuelo por par/año; `/api/candles` no pisa lo ilegible, no sirve peor, mira el `{error}` del upload; `restore-2026.js` con guardas; el dashboard mira los `{error}` | U01, S01, S03, D04 | — | no |
| 2 | **Identidad:** `onAuthStateChange` + revalidación que compara `user.id`; estado de página con clave por usuario (como el journal) | S02 | — | no |
| 3 | **Motor puro** (§ 5) + tabla de instrumentos + conversión + costes en modo declarado | M01–M05, M09 (M08, M10–M12) | 1 (U01 retirado) | no |
| 4 | **Cartera durable** (§ 6) + generación de cargas | D01, D02, C01 | **0** (esquema real) y **3** (eventos del motor); aprobación de Ramón y aviso al hub | **sí** |
| 5 | **Reto** sobre eventos: un solo evaluador de equity diaria; avance de fase transaccional e idempotente | M06, M07, D07 | 3, 4; **decisión del CTO sobre la regla FTMO** | **sí** |
| 6 | **Datos de mercado:** manifiesto versionado con cobertura; reconciliar días incompletos; caché por versión; bootstrap anual | D03, D05, O01 | 1 | **sí** (manifiesto) |
| 7 | **Borrado transaccional** (sesión y alumno, revocando primero, las 7 tablas) | D06 | **0** (cascadas reales) | **sí** |
| 8 | **Métricas** compartidas alumno/mentor (definición única, orden de cierre) | C02 | 4 (libro de cerrados definitivo) | no |
| 9 | **Render incremental** (`update` con `historicalUpdate` o futuro fuera de la serie) | P01 | — | no |
| 10 | **CI** con `tanda.sh`; cada prueba de `fase1/` pasa a la tanda en verde con su arreglo | Q01 | cada uno de los anteriores | no |

Los trabajos 1, 2, 3, 6 y 9 no se esperan entre sí; el 4 es el cuello de botella.

## 9. SQL nuevo que haría falta (no escrito: espera a la s04)

1. **`simulador-000-baseline.sql`.** Reconstrucción versionada del esquema real, sin cambios, desde la salida de la s04.
2. **`simulador-001-permisos.sql`.** Si la s04 confirma que el cliente escribe `sim_*` directamente, las políticas exigen `simulador_activo` o admin (S01 también fuera de la API). Pruebas A/B/admin/sin permiso en el PostgreSQL de ensayo.
3. **`simulador-002-cartera.sql`.** Seis piezas:
   - la tabla `sim_eventos`;
   - las columnas `estado jsonb`, `version bigint`, `motor_version int` y `reglas_version int` en `sim_sessions`;
   - `motor_version` y `evento_id unique` en `sim_trades`;
   - la RPC `sim_guardar` (atómica, idempotente, con comparación de versión);
   - RLS y grants;
   - `revoke` del update directo de `balance` desde el cliente.
4. **`simulador-003-reto.sql`.** La RPC `sim_avanzar_fase` transaccional, más un índice único parcial en `challenge_parent_id`.
5. **`simulador-004-borrado.sql`.** Las RPC `sim_borrar_sesion` y `sim_borrar_alumno`, transaccionales, que revocan primero y cubren las 7 tablas, o bien FK con `ON DELETE CASCADE` si la s04 dice que faltan.
6. **`simulador-005-mercado.sql`.** La tabla `sim_mercado`: par, año, versión, sha256, velas, días completos, días incompletos, `generado_en` y `publicado`.
7. **Consulta de reconciliación,** solo lectura: saldos incoherentes, saldos 0, retos cuyo estado no coincide con el evaluador.

**Cada fichero** sigue el patrón del hub:

- un DO atómico con errores prefijados;
- informe de solo lectura que acaba en `FIN | …`;
- ensayo previo en el PostgreSQL local;
- `APLICADOS.md` con las firmas literales.

## 10. Decisiones que no son mías

1. **M07:** ¿regla diaria FTMO (5 % del capital inicial desde el saldo de inicio del día) o dejar de llamarlo FTMO?
2. **Política intravela:** «stop primero + marca» es lo pedido. ¿Se enseña la marca al alumno en el recibo y en el historial?
3. **Migración:** ¿se ofrece recalcular los trades legados con el motor nuevo (informe aparte) o se dejan como «legado»?
4. **Esquema de `sim_sessions`:** las columnas nuevas necesitan la aprobación de Ramón y aviso al hub (CLAUDE.md § 2).
5. **C02:** ¿«todas las sesiones» parte de la suma de capitales o de otra definición? Hoy alumno y mentor ven 60.000 y 10.000.
