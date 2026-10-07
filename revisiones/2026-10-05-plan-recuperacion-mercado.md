# Simulador · plan de recuperación del mercado y presupuesto de transferencia

**Fecha:** 5-oct-2026 · **Estado:** plan, **sin autorizar** (el CTO espera el informe de Astra) · Rama `auditoria-simulador`.

**Regla del CTO (5-oct):** hasta el **2-nov-2026** no se descarga ningún objeto anual del bucket sin su autorización expresa. Las publicaciones se verifican con **metadatos** (tamaño, versión) y la **copia local**, no con una descarga completa.

## 1. Qué hay que recuperar (diagnóstico del 5-oct)

Copia local verificada de los 27 objetos en `~/copias-suite/2026-10-05-mercado` (sha256 por fichero; resúmenes por año).

| Par 2026 | Falta |
|---|---|
| AUDUSD | 28, 29, 30-sep y 1-oct (0/1.200) y 2-oct (0/1.000); última vela 25-sep 20:59 UTC |
| GBPUSD | 2-oct (0/1.000); última vela 1-oct 23:59 UTC |
| Los 9 | 20-jul cortado: acaba a las 14:59 (EURUSD, GBPUSD, AUDUSD, AUDCAD, GBPJPY), 15:59 (USDJPY, USDCHF, USDCAD) o 16:59 UTC (NZDUSD) |

2024 y 2025 completos (salvo NZDUSD 29-mar-2024, Viernes Santo, 973/1.000: festivo, no se toca).

## 2. Transferencia: lo que ya se gasta cada día, sin recuperar nada

Tamaños reales de los 9 objetos de 2026 (copia del 5-oct): **264,3 MB** en total (28,9–29,5 MB cada uno).

| Quién | Descargas anuales por ejecución | Por ejecución | Al día (06:00 y 14:00) |
|---|---|---|---|
| **Actualizador de producción** (`c470c8f`) | 2 por par: leer lo pendiente (`scripts/actualizar-diario.js:62`) y «estado de los datos» (`:151`) | **≈ 529 MB** | **≈ 1,06 GB** |
| Actualizador de la rama, tal como está | hasta 4 por par con algo que publicar: leer, releer bajo cerrojo, verificar, estado | hasta ≈ 1,06 GB | hasta ≈ 2,1 GB |

**Calculado, no medido** (el consumo real está en el panel de Supabase). Con el plan gratuito (5 GB/mes de transferencia) el actualizador de producción solo agotaría el mes en unos 5 días. **Decisión del CTO**, no mía: qué hacer con el cron de producción mientras rija el presupuesto (no lo he tocado).

`/api/candles` también baja el objeto anual completo la primera vez que una instancia pide un par y año (luego, solo metadatos: `e07b849`, `a0f97d7`).

## 3. Cuánto consumiría la recuperación

**Con el código de la rama tal como está** (`node scripts/actualizar-diario.js --subir`, los 9 pares, porque todos tienen el 20-jul pendiente):

| Paso | Descargas anuales | Transferencia |
|---|---|---|
| Leer lo pendiente | 9 | 264 MB |
| Releer bajo cerrojo antes de subir (`publicarAnio`) | 9 | 264 MB |
| Verificar después de subir (`publicarAnio`) | 9 | 264 MB |
| «Estado de los datos» al final | 9 | 264 MB |
| **Total** | **36** | **≈ 1,06 GB** |
| Si antes se corre en seco (leer + estado) | +18 | +529 MB |

Las subidas (≈ 265 MB) son entrada, no salida. Las descargas del proveedor (Dukascopy) no cuentan para Supabase.

**Con los cambios propuestos (§ 4): ≈ 0 MB de objetos anuales**, solo llamadas de metadatos (del orden de KB).

## 4. Cómo recuperar y verificar sin volver a bajar los 9 ficheros (propuesta, sin programar)

1. **Componer desde la copia local verificada.** El actualizador acepta una carpeta base (`--base ~/copias-suite/2026-10-05-mercado`): lee de ahí el año en vez de bajarlo. Antes, comprueba con **metadatos** (`info()`: tamaño y versión/etag) que el objeto del bucket sigue siendo el de la copia. Si no coincide, para y no publica.
2. **Releer bajo cerrojo por versión, no por contenido.** Bajo el cerrojo, `info()` otra vez. Si la versión es la misma que al empezar, lo compuesto sigue siendo válido; si cambió, para (sin descargar).
3. **Verificar después de subir por metadatos.** El tamaño del objeto tiene que ser el de lo subido y la versión tiene que haber cambiado. Si el etag resulta ser el MD5 del contenido, se compara además con el MD5 de lo subido.
4. **Estado final sin descarga.** La última vela de cada par sale de lo que se acaba de componer o de la copia local, no de releer el bucket.
5. **Verificación de la recuperación:** se compara lo publicado con la copia local, día a día: ningún día con menos velas; la última vela es la de ayer; el 20-jul y la cola de AUDUSD/GBPUSD completos. Se hace sobre lo compuesto en local, más tamaño y versión del bucket, sin bajar nada.

**Por verificar antes (sin bajar objetos):** si el etag de Supabase Storage es el MD5 del contenido para subidas de una pieza. Se compara el `info()` de un objeto con el MD5 de su copia local: una sola llamada de metadatos, **que pido autorizar**. Si no lo es, el paso 3 se queda en tamaño + versión nueva.

**Orden propuesto** cuando el CTO autorice:
1. Programar 1–4 (prueba en rojo antes, como siempre).
2. Desactivar el cron de producción mientras dure la recuperación: escribe sin cerrojo.
3. Seco con base local.
4. Real con base local.
5. Verificación por metadatos y contra la copia.
6. Decidir qué cron vuelve.

## 5. Lo programado en el bloque G (6-oct): `--pares` y dos descargas por par como mucho

El CTO pidió (G11) la opción `--pares` y verificar la publicación por metadatos más hash local, de modo que cada par descargue su año **como mucho dos veces**. La carpeta base local de § 4 **no** se ha programado; lo programado es esto:

| Paso de una pasada que publica | Descargas del año | Cómo |
|---|---|---|
| Lectura inicial | 1 | `info()` (firma: versión, etag, tamaño) y la descarga |
| Relectura bajo cerrojo | 0, o 1 si la firma cambió | `info()`; si la firma es la misma, se usa lo leído |
| Verificación | 0 | `info()`: el sha256 del cuerpo, calculado en local, viaja en los metadatos de la subida; se compara con él y con el tamaño |
| Respaldo de la verificación | 0, o 1 solo si `info()` no trae metadatos **y** aún no se descargó dos veces | si no queda, «no verificado» (código 1) |
| Estado final | 0 | lo que el par ya leyó o verificó (G10) |

El job imprime al final la transferencia que hizo: «Transferencia (objetos anuales leídos del bucket): N descarga(s), B bytes».

**Transferencia de recuperar solo AUDUSD y GBPUSD** (`node scripts/actualizar-diario.js --subir --pares AUDUSD,GBPUSD`), con los tamaños de la copia del 5-oct (`stat`: AUDUSD_2026.json 28.895.708 bytes; GBPUSD_2026.json 29.419.992 bytes):

| Caso | Descargas | Bytes |
|---|---|---|
| Normal: nadie cambia el objeto entre la lectura y el cerrojo, e `info()` trae metadatos | 2 (una por par) | **58.315.700** (≈ 58,3 MB) |
| Peor caso: la firma cambia bajo el cerrojo o `info()` no trae metadatos | 4 (dos por par) | **116.631.400** (≈ 116,6 MB) |
| Un seco antes (`--pares AUDUSD,GBPUSD` sin `--subir`) | +2 | +58.315.700 |

Más las fichas del cerrojo y las llamadas `info()` (del orden de KB). Las subidas son entrada, no salida; el proveedor no cuenta. Antes de G10 y G11 la misma recuperación eran 8 descargas (≈ 233,3 MB).

**Lo que puede cambiar estas cifras:** son los tamaños del 5-oct. El cron de producción (`c470c8f`) sigue corriendo dos veces al día y puede haber añadido velas a esos objetos; el tamaño real es el del momento de la ejecución, y el job lo imprime. En la misma pasada se piden también los días interiores pendientes de esos dos pares, entre ellos su 20-jul.

**Llamada a `info()` contra producción (autorizada por el CTO, 6-oct; una sola, sin descargar el objeto, sobre `forex-data/AUDUSD/M1/2026.json`).** Campos y tipos devueltos: `archivedAt` null · `bucketId` string · `cacheControl` string · `contentType` string · `createdAt` string · `etag` string · `id` string · `isDeleteMarker` boolean · `isVersioned` boolean · `lastModified` string · `metadata` object (vacío en este objeto, que se subió sin metadatos de usuario) · `name` string · `size` number · `version` string. La firma (version, etag, size) tiene todo lo que usa. Que una subida con `metadata: { sha256 }` aparezca en `metadata` **no está comprobado**: se verá en la primera publicación real; si no aparece, el código verifica descargando dentro de las dos descargas, o dice «no verificado».

**Sigue pendiente de autorización:** la recuperación.


## 6. Recuperación por etapas (6-oct-2026, autorizada por el CTO)

**Copia del 5-oct:** intacta antes de empezar (los 27 ficheros coinciden con su sha256).

**Etapa 1** (`node scripts/actualizar-diario.js --subir --pares AUDUSD,GBPUSD`, desde `main` = `21ec65d`, workflow desactivado, sin `MERCADO_GZIP`; 22:47:18–22:52:00 CEST): **código 1**. Transferencia 58.315.700 bytes (2 descargas); Storage: lectura máx 8,7 s, subida 2,6 s, info 0,6 s, cerrojo 0,2 s. `_cerrojos/` vacío después.
- **GBPUSD: recuperado hasta el 5-oct** (279.103 → 281.968 velas; 2-oct, 4-oct y 5-oct publicados y verificados por el job, sin descargar el año: verificación por metadatos). **El 20-jul sigue pendiente** (900 velas). Decisión del CTO: vale la verificación del job, no se descarga el año para compararlo con la copia.
- **AUDUSD: sin cambios** (última vela el 25-sep; 20-jul en 900). El domingo 27-sep no se pudo bajar y cortó la cola.
- **19 peticiones al proveedor: 3 con datos (GBPUSD 2-oct al 2.º intento, 4-oct y 5-oct) y 16 fallos `UND_ERR_CONNECT_TIMEOUT`** (la conexión no se establece): AUDUSD 20-jul ×5 y 27-sep ×5, GBPUSD 20-jul ×5 y 2-oct ×1. *Corrección: en el informe de la etapa dije «25 fallos»; contados en el log son 16.*

**Sonda 1** (`scripts/sonda-proveedor.js`, `9094bf5`; 23:12:21–23:20:58 CEST; solo proveedor, sin Storage): el 20-jul en los nueve pares y AUDUSD del 27-sep al 2-oct, 15 días con 5 intentos cada uno. **75 peticiones en 8 min 37 s: 69 con HTTP 429** (respuesta en 40–250 ms; en los 15 días, fechas antiguas y recientes, todos los pares) **y 6 `UND_ERR_CONNECT_TIMEOUT` al final** (AUDUSD 1-oct, último intento, y 2-oct ×5; 10,5 s cada uno). 15 de 15 no disponibles.

**Lectura de los hechos (CTO):** el 429 es un límite de volumen del proveedor, no un fallo del día ni del par. La sonda 2, programada para las 00:21, se canceló a las 23:29 sin hacer ninguna petición; esa noche no hay más peticiones al proveedor. Al día siguiente, no antes de las 09:00, una sola sonda educada de tres días, y la recuperación espera el OK del CTO (queda anulada la autorización de recuperar cuando la sonda dé disponible).

**Sonda educada** (7-oct-2026, 09:41:32–09:41:33 CEST; `scripts/sonda-proveedor.js` de `2131f39`, un intento por día, pausa 30 s; solo proveedor): AUDUSD 2026-07-20 → **HTTP 429 a la primera petición** (423 ms, 0 bytes, **sin Retry-After**), tras más de 10 horas sin peticiones desde este equipo; la sonda se detuvo y AUDUSD 2026-09-27 y EURUSD 2026-07-20 quedaron sin pedir. No es un límite de corto plazo; con una sola petición no se distingue una cuota diaria de un bloqueo de la IP. **Decisión del CTO:** ninguna petición más al proveedor desde este equipo hasta nuevo aviso; probar desde GitHub Actions (otra IP de salida), con el workflow en modo manual (sonda | recuperar, un par por ejecución).

**Sonda desde GitHub Actions** (run 37595931051, 7-oct-2026 08:47 UTC; workflow manual de `b65f193`, modo sonda; datos transcritos por el CTO): EURUSD 2026-07-20, un intento, **HTTP 429 sin Retry-After**, 614 ms. Con otra IP de salida, el mismo resultado que desde este equipo. Las dos sondas del día (casa y Actions) pedían el 20-jul; las únicas peticiones con datos fueron de días recientes (2, 4 y 5-oct, la noche del 6-oct).
