# HANDOFF — Calendario Económico (forex-simulator-algorithmic-suite)
Estado: alcance CERRADO, listo para construir en sesión dedicada.

## ALCANCE DEFINITIVO (decidido por Ramon)
- Desplegable dentro de la sesión de trading (estilo Forex Factory).
- Vista configurable: día simulado actual / semana completa.
- USO ESTRELLA: proyección semanal — un lunes, ver los fundamentales de TODA la
  semana (CPI, NFP, tipos...) con forecast + previous, para planificar el trading.
- El valor "actual" (lo que salió):
  * Se MUESTRA si el DÍA del evento ya pasó en el tiempo simulado.
  * Se OCULTA si el día del evento aún no ha llegado.
  * Granularidad = DÍA, no minuto. (Se descartó el revelado al minuto exacto
    porque exigía horas perfectas que el dataset gratuito no tiene.)
- Filtros: por divisa (la del par operado) y por impacto (alto/medio/bajo).
- SIN presupuesto para datos de pago → se usa fuente gratuita.

## CONTEXTO TÉCNICO
- Referencia horaria: UTC. Las velas tienen time = segundos Unix (UTC).
- Velas viven en Supabase Storage, bucket "forex-data", ruta {PAR}/M1/{AÑO}.json.
  Cobertura de velas: 2024, 2025, 2026.
- Los datos de noticias vivirán en Supabase DATABASE (tabla nueva).
  Holgura confirmada: Database al 6% de 0,5 GB. Espacio de sobra.
  (Storage al 68% de 1 GB — NO tocar, ahí están las velas.)

## FUENTE DE DATOS: dataset gratuito de Hugging Face
Ehsanrs2/Forex_Factory_Calendar (descargado en ~/Desktop/noticias-forex/forexfactory.csv)
- Columnas: DateTime(+03:30 Teherán), Currency, Impact, Event, Actual, Forecast,
  Previous, Detail.
- Ya procesado: ~/Desktop/noticias-forex/noticias_utc_2024_2026.csv
  (script preparar.py: convierte Teherán→UTC, filtra 2024-2026, normaliza impacto
  a high/medium/low/holiday, añade timestamp Unix "ts" y "datetime_utc").
  Resultado: 6195 filas, rango 2024-01-01 a 2025-04-07.

## DOS PENDIENTES ACOTADOS (resolver antes o durante la construcción)
1. HUECO abril 2025 → hoy (jul 2026): el dataset se corta en 2025-04-07, pero las
   velas llegan a 2026. Faltan ~15 meses de noticias. Opciones: scrape propio solo
   de ese tramo, u otro dataset más reciente que complete.
2. EVENTOS SIN HORA: 31,4% de eventos 2024-2025 vienen a 00:00:00 (hora perdida en
   el scraping original). A nivel de DÍA no rompen nada (el alcance es por día).
   Decidir presentación: mostrarlos como "durante el día" sin hora, o rellenar las
   horas fijas conocidas de los grandes (NFP 8:30 ET, CPI 8:30 ET, FOMC 14:00 ET).
   NOTA: como el alcance final es por día, esto es cosmético, no bloqueante.

## POR QUÉ NO SE USA EL CALENDARIO DE TRADINGVIEW
FX Replay muestra las "bolitas" de noticias en el gráfico porque usa la PLATAFORMA
TradingView completa (de pago), que trae calendario nativo. Este proyecto usa
lightweight-charts (librería gratuita/open-source de TradingView) = solo el motor
de dibujo, SIN feed de datos económicos. Por eso hay que montar los datos aparte.

## PLAN DE CONSTRUCCIÓN (sesión dedicada, local-first, paso a paso)
1. Resolver el hueco 2025→hoy (conseguir datos que completen hasta la fecha actual).
2. Consolidar CSV final (2024 → hoy, UTC, columnas limpias).
3. Crear tabla nueva en Supabase Database + importar el CSV.
4. Endpoint/API interna para leer eventos filtrando por rango de fechas + divisa + impacto.
5. UI: desplegable en la sesión, vista día/semana, con lógica de ocultar "actual"
   de días futuros al tiempo simulado (currentTime de la sesión).
