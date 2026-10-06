// DIAS CORTOS ACEPTADOS (CTO, 6-oct-2026): { par, fecha, velas, motivo }.
// Fichero versionado: SOLO CAMBIA POR COMMIT (no hay variable ni opcion que lo
// sustituya). Lo validan y usan lib/mercado/aceptados.mjs (el actualizador) y
// el aviso de cobertura de la sesion (lib/sessionData.js). Es .mjs, y no .json,
// para que lo cargue tambien el navegador sin leer ficheros.
export default [
  { par: 'NZDUSD', fecha: '2024-03-29', velas: 973, motivo: 'Viernes Santo: el proveedor solo tiene 973 velas (00:01 a 20:59 UTC; copia del 5-oct-2026)' },
]
