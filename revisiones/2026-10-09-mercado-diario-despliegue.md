# Mercado diario: orden de despliegue (9-oct-2026; revisado tras Astra MD-01..MD-05 y sus cierres del 10-oct)

Rama `mercado-diario` (desde main 6ab5ba9). **Nada de esto se ejecuta sin autorización
expresa del CTO.** Ningún paso borra datos en Storage; ningún cerrojo se borra sin la
comprobación humana del paso 1.

## Qué cambia al desplegar

- **Un solo formato** (CTO 9-oct):
  - Todos los lectores (`/api/candles`, actualizador, recuperar, restore, importar-csv,
    copia-mercado) leen `{PAR}/M1/{AÑO}.json.gz` y, si no existe, `{AÑO}.json`.
  - Todos los escritores publican `.json.gz`, y `MERCADO_GZIP` ya no decide nada.
  - Un escritor del código nuevo que fuera a escribir `.json` donde ya hay `.json.gz` se
    niega.
  - **Un escritor del código ANTERIOR (6ab5ba9 o antes) no tiene esa guarda.** Si
    publica un `.json` después del arranque, su mejora queda oculta detrás del `.gz`
    (Astra MD-02, demostrado). Por eso existe el paso 1.
- **Workflow manual** (`actualizar-velas.yml`): sin `unset MERCADO_GZIP`; recuperar
  publica `.json.gz`. El resto, igual.
- **Workflow diario nuevo** (`mercado-diario.yml`):
  - cron `17 3 * * *` (03:17 UTC); los 9 pares en secuencia, uno por paso, con 120 s
    de pausa;
  - **cualquier 429, también con `Retry-After`, corta todo** (MD-03), y hay un
    reintento final para los que salen con 2;
  - tope de 45.000.000 bytes por ejecución, que la variable del repo
    `MERCADO_TOPE_BYTES` puede sobrescribir;
  - cada descarga va atada a su consulta de información y se corta al pasar del
    tamaño (MD-01);
  - el sha256 de cada descarga se compara con el de los metadatos (MD-05);
  - caché de Actions por proyecto y bucket.
  - **El cron solo se dispara desde la rama por defecto: en cuanto el fichero llega a
    main, queda programado.**

## Orden

1. **Congelar todos los escritores**, antes de tocar main.
   - Ninguna ejecución manual en curso del workflow `actualizar-velas` (Actions →
     ejecuciones en curso: ninguna) y ninguna nueva hasta terminar el paso 5.
   - **Las ejecuciones ya encoladas también cuentan como congeladas.** Una ejecución en
     cola («Queued» o «Waiting»: el grupo de concurrencia la retiene) arrancaría dentro
     de la ventana con el código de su commit. Se cancelan, o se espera a que terminen,
     antes de seguir. En la lista de ejecuciones del workflow no puede quedar ninguna en
     curso ni en cola.
   - Ningún proceso de escritura en el Mac ni en otro checkout: `actualizar-diario`,
     `restore-2026`, `importar-csv` o `arranque-gzip`.
     - Comprobación en cada equipo: `ps aux | grep -E "actualizar-diario|restore-2026|importar-csv|arranque-gzip" | grep -v grep`
       tiene que salir vacío.
     - Ningún terminal con uno de ellos abierto.
   - Cerrojos inventariados: para cada uno de los 9 pares,
     `node scripts/liberar-cerrojo.js PAR_2026`, **sin `--confirmo`**. Así solo enseña
     quién lo tiene y desde cuándo; no borra.
   - Cerrojos reconciliados:
     - un cerrojo puesto se explica: qué proceso lo tomó y si su subida terminó;
     - solo cuando consta que ese proceso ya no existe y que no queda ninguna subida en
       curso, una persona lo libera con `--confirmo`.
     - **Nunca se borra un cerrojo por antigüedad**, ni a ciegas, ni desde un
       workflow.
   - Desde aquí, solo se ejecutan escritores del commit nuevo.
2. **Lectores y escritores nuevos en main, SIN `mercado-diario.yml`.**
   - Se lleva a main todo lo de la rama **salvo** `.github/workflows/mercado-diario.yml`,
     que entra en el paso 7. Si entrara aquí, el cron de las 03:17 podría correr antes
     del arranque y gastar el tope en los `.json`, unos 29 MB por par.
   - Comprobación, cuando Vercel sirva el commit:
     - el gráfico de un par carga igual que antes. Todavía no hay ningún `.gz`, así que
       `/api/candles` cae al `.json`;
     - en los logs de la API no aparece ningún error de lectura.
   - Desde este momento queda prohibido ejecutar revisiones anteriores de los scripts
     (ni del Mac ni de otro checkout).
3. **Inventario en seco** con el commit fijado: `node scripts/arranque-gzip.js`, sin
   `--subir`.
   - Solo hace consultas de información y lee las fichas de cerrojo; no descarga
     ficheros anuales.
   - Por par, dice si migraría el `.json` (con su tamaño) o si ya hay `.json.gz`.
   - Un cerrojo hace que pare con **código 5**: se vuelve al paso 1.
   - Se revisa cualquier `.json.gz` que ya exista: el paso 4 lo certificará, no lo
     saltará.
   - Se confirman la copia de respaldo y el presupuesto del paso 4. Son unos 264 MB de
     `.json`, más los `.gz` que ya existan y el `.json` de esos pares. Pueden sumarse
     relecturas si algo cambia durante el arranque, que no tiene tope en bytes: está
     autorizado aparte.
4. **Arranque desde el Mac, una sola vez:** `node scripts/arranque-gzip.js --subir`, sin
   ningún otro escritor.
   - Por par:
     - mira el cerrojo; con uno puesto, para con código 5 y no lo libera;
     - si hay `.json`, lo baja y publica el `.json.gz` con el publicador común (cerrojo
       y verificación por metadatos), comprueba que son exactamente las mismas velas y
       que el cerrojo quedó suelto;
     - si ya hay `.json.gz`, lo certifica: lo baja, lo descomprime, lo valida y
       comprueba que no tiene menos velas por día que el `.json`.
   - Se espera código 0.
   - Con código 1 o 5, o con cualquier incertidumbre, no se pasa al paso 7:
     - los `.gz` correctos ya convertidos pueden quedarse;
     - se reconcilia según el paso 1 y se repite el arranque solo cuando consta que no
       queda ninguna subida en curso.
5. **Verificación de los nueve pares, uno a uno.** Un `.gz` presente o un código 0 no
   bastan; por cada par:
   - su línea del arranque: «✓ … verificado», con las velas y los bytes, o «✓ …
     certificado»;
   - `node scripts/arranque-gzip.js` en seco otra vez: los 9 pares con «ya hay .json.gz»
     y ningún cerrojo (código 0);
   - el gráfico del par en la web carga con la última fecha esperada y sin días que
     antes estaban y ahora no;
   - ningún cerrojo pendiente: `node scripts/liberar-cerrojo.js PAR_2026`, sin
     `--confirmo`.
6. **Contrato de la descarga limitada, en una lectura acotada.** Script aprobado y
   escrito (CTO 10-oct, prueba MC04); no ejecutado contra Storage.
   - **Por qué hace falta:**
     - el arranque y el gráfico no pasan por `fetchConTope`;
     - que la etag del GET de Supabase llegue y coincida con la de `info()`, que llegue
       el tamaño y que existan los metadatos (`sha256`, `velas`) no está comprobado
       contra producción;
     - si algo de eso no cuadra, el primer diario saldría con 3 en todos los pares.
   - **Cómo:** el script de solo lectura `node scripts/comprueba-descarga.js EURUSD`
     (lógica en `lib/mercado/comprueba.mjs`). Lo ejecuta una vez desde el Mac una
     persona autorizada, para UN par y su año, sin publicar nada y sin pedir nada al
     proveedor. Hace:
     1. `infoVigente`; dice si trae etag y en qué forma (con comillas, con `W/`), el
        tamaño y qué claves de metadatos llegan (sin imprimir la URL);
     2. una descarga atada por el camino limitado (`fetchConTope` sobre
        `fetchConLimite`, como el diario), con el tope igual al tamaño. Dice si el GET
        trajo etag, si coincide con la de `info()`, los bytes recibidos y si el sha256
        del cuerpo es el de los metadatos;
     3. código 0 si el diario funcionaría (con aviso si el GET no trae etag pero el
        sha256 la sustituye, o si faltan los metadatos); 3 si el diario saldría con 3
        (sin objeto, sin tamaño, etag distinta o ausente sin sha256); 1 si el sha256 no
        cuadra; 4 si el par no es válido.
   - **Gasto:** un `.json.gz` (unos 4,1–4,5 MB), no los nueve años.
   - **Resultado:** se apunta en este documento. Si no da 0, no se pasa al paso 7: se
     revisa el contrato de cabeceras antes de activar el cron.
   - **Alternativas peores:**
     - el actualizador en seco también pasa por el camino limitado, pero puede pedir
       días al proveedor;
     - el propio cron ya publicaría.
7. **Solo entonces, el workflow diario.** Se lleva a main `mercado-diario.yml` antes de
   las 03:17 UTC del día en que deba correr por primera vez.
   - La primera ejecución tiene la caché vacía y baja los 9 `.gz`, unos 38,5 MB: cabe en
     el tope de 45 MB.
   - Las siguientes bajan 0 bytes de ficheros anuales mientras la huella coincida.
   - Se supervisan la primera ejecución y la siguiente:
     - nueve resultados explícitos;
     - el consumo real frente al tope;
     - la caché guardada y restaurada;
     - la cobertura por día;
     - ningún cerrojo pendiente.
   - Ante 429, el corte; ante 1, 3 o 4, no suponer que todo está al día.

## Rollback

- **Nunca a lectores anteriores al gzip** una vez que el commit nuevo está en main
  (paso 2).
  - Desde ese momento cualquier escritura es `.json.gz`, y un lector de 6ab5ba9
    volvería al `.json` antiguo: la web serviría datos más viejos sin avisar.
  - Volver atrás significa revertir a un commit que conserve la lectura `.gz` → `.json`,
    el de este despliegue o uno posterior.
  - Para parar el diario se quita `mercado-diario.yml` de main, no se revierte lo demás.

## Límites que conviene saber

- **El tope (MD-01) corta la descarga al recibir más de lo autorizado,** pero el trozo
  que pasa del máximo ya se ha recibido, y lo que la red tenga en vuelo también se
  factura. Con Storage real ese margen no está medido.
- **La identidad de la descarga se ata a la `etag` de la consulta de información.** Que
  la `etag` del GET de Supabase coincida en formato con la de esa consulta no está
  comprobado contra producción. Si no coincidiera, cada descarga se rechazaría con
  código 3 de forma visible; no se descargaría nada de más.

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

- **Las cifras son de los ficheros anuales, no de toda la transferencia.**
  - Los ficheros de hoy tienen algunos días más que esa copia y serán algo más grandes.
  - Solo cuentan los cuerpos anuales de Storage. Quedan fuera las consultas de
    información, las fichas de cerrojo, las subidas, las descargas del proveedor y el
    tráfico de la caché de Actions.

## Después (no en esta tarea)

- **Borrar los `.json` de 2026.** Es un paso aparte y revisado, con la copia local
  verificada.
