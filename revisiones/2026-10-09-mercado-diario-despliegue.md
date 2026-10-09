# Mercado diario: orden de despliegue (9-oct-2026)

Rama `mercado-diario` (desde main 6ab5ba9). **Nada de esto se ejecuta sin autorización
expresa del CTO.** Ningún paso borra nada en Storage.

## Qué cambia al desplegar

- **Un solo formato** (CTO 9-oct):
  - Todos los lectores (`/api/candles`, actualizador, recuperar, restore, importar-csv,
    copia-mercado) leen `{PAR}/M1/{AÑO}.json.gz` y, si no existe, `{AÑO}.json`.
  - Todos los escritores publican `.json.gz`.
  - `MERCADO_GZIP` ya no decide nada.
- **Workflow manual** (`actualizar-velas.yml`): sin `unset MERCADO_GZIP`; recuperar
  publica `.json.gz`. El resto, igual.
- **Workflow diario nuevo** (`mercado-diario.yml`):
  - cron `17 3 * * *` (03:17 UTC); los 9 pares en secuencia, uno por paso;
  - 120 s de pausa entre pares, corte total ante un 429 y un reintento final de los 2;
  - tope de 45.000.000 bytes por ejecución, que la variable del repo
    `MERCADO_TOPE_BYTES` puede sobrescribir;
  - caché de Actions con los ficheros anuales.
  - **El cron solo se dispara desde la rama por defecto: en cuanto el fichero llega a
    main, queda programado.**

## Orden

1. **Lectores (y escritores) en main, comprobados, SIN el workflow diario.**
   - Se lleva a main todo lo de la rama **salvo** `.github/workflows/mercado-diario.yml`,
     que entra en el paso 3. Si entrara aquí, el cron de las 03:17 podría correr antes
     del arranque y gastaría el tope en los `.json` (unos 29 MB por par).
   - Comprobación, cuando Vercel sirva el commit:
     - el gráfico de un par carga igual que antes. Todavía no hay ningún `.gz`, así que
       `/api/candles` cae al `.json`;
     - en los logs de la API no aparece ningún error de lectura.
   - A partir de aquí, cualquier escritura (recuperar a mano incluido) ya es `.json.gz`.
2. **Arranque desde el Mac, una sola vez** (unos 264 MB de descarga, autorizados por el
   CTO):
   - `node scripts/arranque-gzip.js` en seco: solo hace consultas de información y dice
     qué migraría y el tamaño de cada `.json`.
   - `node scripts/arranque-gzip.js --subir`: por par, baja el `.json` y publica el
     `.json.gz` con el publicador común (cerrojo y verificación por metadatos). Comprueba
     que son exactamente las mismas velas. Si un par ya tiene `.gz`, lo salta.
   - Se espera código 0 y «Transferencia: 9 descarga(s), ≈ 264 MB».
   - Comprobación: `/api/candles` sirve el mismo número de velas que antes, ahora leídas
     del `.gz`.
3. **El cron, antes de su primera hora:** se lleva a main `mercado-diario.yml` antes de
   las 03:17 UTC del día en que deba correr por primera vez.
   - La primera ejecución tiene la caché vacía y baja los 9 `.gz`, unos 38,5 MB: cabe en
     el tope de 45 MB.
   - Las siguientes bajan 0 bytes de ficheros anuales mientras la huella coincida.

## Cifras (medidas el 9-oct sobre la copia local del 5-oct; no medidas desde Actions)

Compresión con zlib nivel 6, el mismo nivel que `gzipSync` por defecto:

| Par | .json (bytes) | .json.gz (bytes) |
|---|---|---|
| EURUSD | 29.475.726 | 4.209.004 |
| GBPUSD | 29.419.992 | 4.372.439 |
| USDJPY | 29.521.759 | 4.480.881 |
| USDCHF | 29.479.462 | 4.187.357 |
| AUDUSD | 28.895.708 | 4.194.089 |
| USDCAD | 29.357.166 | 4.169.096 |
| NZDUSD | 29.432.176 | 4.139.586 |
| AUDCAD | 29.333.903 | 4.163.569 |
| GBPJPY | 29.396.834 | 4.538.420 |
| **Total** | **264.312.726** | **38.454.441** |

Los ficheros de hoy tienen algunos días más que esa copia: serán algo más grandes.

## Después (no en esta tarea)

- **Borrar los `.json` de 2026.** Es un paso aparte y revisado, con la copia local
  verificada.
