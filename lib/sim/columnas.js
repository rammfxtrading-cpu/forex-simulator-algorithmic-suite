// Las columnas de sim_sessions que lee el cliente (diseño sim-004 S4-07, h.11): todas
// MENOS `estado` y `escritor`. El estado confirmado de una sesion v1 se lee en el
// servidor (/api/sim/estado). Cada nombre existe en el catalogo vigente (s04 + sim-003 +
// sim-004a-preparatoria): lo comprueba pruebas/servidor-estado-borrar.mjs contra el
// montaje literal. Una columna que no existiera romperia la lectura entera (PostgREST).
export const COLUMNAS_SESION = 'id, user_id, name, pair, timeframe, date_from, date_to, capital, balance, status, created_at, last_timestamp, challenge_type, challenge_phase, challenge_parent_id, motor_version, epoca, version, terminal, legado, legado_snapshot, mercado, creada_por_rpc, rev_saldo'
