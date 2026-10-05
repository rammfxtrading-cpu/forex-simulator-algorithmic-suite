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
