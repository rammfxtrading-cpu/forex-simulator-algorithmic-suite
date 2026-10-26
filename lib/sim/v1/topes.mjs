// LOS TOPES DE TAMAÑO DEL AVANCE (orden 1-125 f del CTO), compartidos por el servidor (lib/servidor/comando.mjs, que
// corta el calculo y lo declara en resumen.minutos), el cliente (lib/sim/v1/avance.js, que nunca pide un lote mayor) y
// la base (sql/sim-006-tope-de-pasos.sql, que rechaza un paso o un play que declare mas: los numeros van alli como
// literales y pruebas/sim-006.mjs comprueba que son estos).
// Unidad: el MINUTO DE MERCADO (el calendario de lib/mercado/calidad.mjs, minutoCerrado; el de los tramos de S4-08). Una
// vela M1 es un minuto de mercado; los minutos con el mercado cerrado (fin de semana) no cuentan.
//   · paso: 1. El Step es una vela; un Go to marcado «paso» avanza 1 minuto, asi que ya no se salta los 5 s del goto.
//   · play: LOTE_PLAY_MAX = 100. Con el tope de sim-006 (10 avances paso/play por segundo y alumno), el Play llega como
//     mucho a 10 × lote velas/s: a la velocidad maxima de hoy (500 velas/s, lib/sessionUi.js) el lote tiene que ser
//     ≥ 50. Se elige 100 por lo medido en local (etapa2/pieza4/medida-local.log, 26-oct): con lote 50 el Play llega
//     justo a 521 velas/s y ya topa (un 429); con 100, 3.136 velas/s sin 429, comando p99 21,6 ms, y la mitad de
//     segundos de funcion por hora a 500 velas/s (490 s frente a 1.105). Mas de 100 apenas ahorra (250: 208 s) y deja
//     mas velas confirmadas por delante de lo que el alumno ve. Son cifras LOCALES (PostgreSQL desechable, no Vercel
//     ni Supabase).
// El goto y el checkpoint no tienen este tope (el goto tiene los suyos: LIMITES de comando.mjs y sus 5 s).
export const TOPE_PASO = 1
export const LOTE_PLAY_MAX = 100
export const TOPE_AVANCE = Object.freeze({ paso: TOPE_PASO, play: LOTE_PLAY_MAX })
