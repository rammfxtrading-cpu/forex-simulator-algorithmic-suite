# HANDOFF — Pipeline de Datos de Velas (forex-simulator-algorithmic-suite)
Estado: FASE 1 COMPLETA (datos al día). FASE 2 (automatización) PENDIENTE.

## CONTEXTO
- Las velas viven en Supabase Storage, bucket "forex-data", ruta {PAR}/M1/{AÑO}.json.
- Formato: array JSON de {time (segundos Unix UTC), open, high, low, close, volume}.
- Fuente: Dukascopy vía librería dukascopy-node (gratis, sin API key).
- 9 pares: AUDCAD, AUDUSD, EURUSD, GBPJPY, GBPUSD, NZDUSD, USDCAD, USDCHF, USDJPY.
- Años: 2024, 2025, 2026.
- El simulador lee vía pages/api/candles.js (descarga el JSON, cachea, agrega a otros TF).

## FASE 1 — COMPLETADA (sesión de hoy)
Problema detectado: los datos llevaban SIN ACTUALIZAR desde ~4 mayo 2026. Faltaba
may-jul 2026 en todos los pares. Además AUDCAD solo tenía 2025 y GBPJPY le faltaba 2024.
Resuelto: descargados y subidos los 27 archivos (9 pares × 3 años), completos hasta hoy.
Verificado en Supabase y en el simulador en producción (sesión jun/jul 2026 carga OK).

## HALLAZGO CLAVE (crítico para la Fase 2)
Dukascopy FALLA con peticiones de rango grande (año o mes completo): devuelve
"Unknown error" o "fetch failed" de forma intermitente. Es un problema conocido
(issue #184 del repo dukascopy-node): pasa al pedir rangos grandes / muchas llamadas.
SOLUCIÓN: descargar DÍA A DÍA (peticiones de ~1 día ≈ 1400 velas NUNCA fallan).
+ usar SIEMPRE retryOnEmpty:true (Dukascopy a veces devuelve vacío sin error).
Esto es la base de todo: peticiones pequeñas = fiable.

## SCRIPTS (en /scripts, ya en el repo, commit bcd8a01)
- descargar-por-dias.js: descarga día a día con retryOnEmpty, cachea cada día en
  descarga-2026/dias/, valida por mes, reejecutable (solo baja lo que falta).
  Uso: node scripts/descargar-por-dias.js
- subir-a-supabase.js: sube archivos locales a forex-data con upsert POR ARCHIVO.
  NUNCA borra el bucket. Seco por defecto; con --subir sube de verdad.
- listar-bucket.js: inventario del bucket (qué pares/años hay). Solo lectura.
- ver-huecos.js: detecta días laborables sin datos en un archivo local.
- ELIMINADO migrate-to-dukascopy.js: borraba el bucket ENTERO antes de bajar
  (peligrosísimo en prod). No recrear ese patrón. Usar los seguros de arriba.
- descarga-2026/ está en .gitignore (datos temporales pesados, ~1GB, NO subir a git).

## FASE 2 — PENDIENTE: automatización diaria
DECIDIDO: correr en GitHub Actions (gratis, tiempo de sobra, el código ya está en GitHub).
Frecuencia: DIARIA (cada noche).
Diseño previsto:
- Cada noche bajar SOLO el día anterior de cada par (1 petición pequeña por par =
  el caso que nunca falla). Actualizar el {AÑO}.json correspondiente de forma
  INCREMENTAL (leer el actual, añadir el día nuevo, re-subir con upsert).
- NUNCA borrar el bucket. Validar antes de subir.
- Credenciales: meter NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY como
  secretos de GitHub Actions (NO en el código; .env.local está en .gitignore).
- Manejo de fallos: reintentar; si un día no está disponible aún, reintentar en la
  siguiente ejecución (el día anterior siempre acaba estando disponible).
Pendiente de decidir en la sesión de Fase 2:
- Hora exacta del cron (considerar que Dukascopy publica con cierto retraso).
- Si actualizar solo 2026.json o también validar que no haya huecos viejos.
- Aviso/log si algo falla varias noches seguidas.

## PENDIENTE DE VERIFICAR
- Storage de Supabase tras la subida de hoy (~950MB): estaba al 68% de 1GB antes.
  Comprobar Settings > Usage > Storage Size. Si cerca del límite, gestionar
  (plan gratis = 1GB). NOTA: la subida sobrescribe (upsert), no suma, pero los
  2026 nuevos son mayores y AUDCAD ganó 2 años, así que el uso sube algo.

## LIMPIEZA PENDIENTE (local, cuando se confirme todo OK)
- Borrar la carpeta descarga-2026/ del Mac (~1GB de JSONs temporales, ya en Supabase).
  Está en ~/Desktop/forex-simulator-algorithmic-suite/descarga-2026/

## AVISO STORAGE (revisar 1º en próxima sesión)
Tras la subida de hoy el contador de Storage aún marcaba 68% (0,681/1GB) porque
Supabase tarda ~1h en refrescar. El uso REAL subirá (2026 más grandes + AUDCAD
ganó 2 años). REVISAR el número ya refrescado: Settings > Usage > Storage Size.
Si cerca de 1GB, resolver ANTES de montar la automatización diaria (añadir datos
cada noche sobre storage lleno = riesgo de 402/servicio restringido).
Opciones si lleno: plan de pago, o comprimir el formato de las velas.

## STORAGE VERIFICADO (21 jul) — RESUELTO
Tras refrescar, Storage quedó en 0,682/1GB (68%) — prácticamente igual que antes
(0,681). El upsert sobrescribió sin sumar. HAY HOLGURA DE SOBRA (32% libre).
No hay problema de límite. La automatización diaria (añade solo KB/día) no afecta.
Vía libre para la Fase 2 sin condiciones.

## FASE 2 — COMPLETADA (21 jul) ✓ AUTOMATIZACIÓN ACTIVA
GitHub Actions montado y VERIFICADO (ejecución manual #1 en verde, 2m33s).
- Workflow: .github/workflows/actualizar-velas.yml — cron 0 6 * * * (06:00 UTC) + workflow_dispatch.
- Script: scripts/actualizar-diario.js (incremental, día a día, upsert, nunca borra).
- Secretos configurados en GitHub Actions: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
- Verificado: los 9 pares leídos OK, "TODO OK", concluye al día correctamente.
CADA NOCHE a las 06:00 UTC se actualiza solo. Problema de datos parados RESUELTO.

PENDIENTE MENOR:
- Confirmar que el cron automático se dispara solo (mirar Actions al día siguiente:
  debe aparecer ejecución "Scheduled"). Si no saltara, revisar (a veces GitHub tarda
  o desactiva crons en repos inactivos >60 días; se reactiva con un commit).
- Aviso de GitHub: Node 20 se deprecia (corre con Node 24). Actualizar node-version
  a 22 o 24 en el workflow en algún momento. Sin urgencia, no afecta.

## INCIDENTE RESUELTO (22 jul) — primer cron nocturno fallo
El cron SI se disparo solo la primera noche (automatizacion viva), pero fallo:
"Invalid Compact JWS" en los 9 pares al SUBIR (la lectura si funcionaba).
CAUSA: el secreto SUPABASE_SERVICE_ROLE_KEY se habia pegado mal en GitHub —
llegaba con 38 caracteres en vez de 41; se perdieron los guiones bajos al copiar
(en GitHub aparecia como "sbsecretIF..." en vez de "sb_secret_IF...").
DIAGNOSTICO: se anadio al script un modo DIAG_CREDS=1 que imprime longitudes
(nunca el valor); comparando 38 vs 41 se localizo el problema en un intento.
SOLUCION: repegado del secreto copiandolo con pbcopy directo desde .env.local
(evita el copiado manual que se comia caracteres) + .trim() defensivo permanente
en el script para URL y key.
VERIFICADO: ejecuciones #5 y #6 en verde. DIAG_CREDS ya retirado del workflow.

LECCION: al pegar secretos en GitHub, copiar SIEMPRE con pbcopy desde terminal,
nunca seleccionando texto a mano. Y si algo falla con credenciales, comparar
longitudes es la via mas rapida de diagnostico (sin exponer el valor).
