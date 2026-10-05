# Se carga con «. pruebas/aislar.sh» desde tanda.sh y fase1.sh (H01, auditoria
# del arnes 4-oct-2026). Deja en AISLA el prefijo que corta la red A NIVEL DE
# SISTEMA para la prueba y todo lo que lance (subprocesos node o no, binarios
# nativos, descargas de herramientas). La capa JS (sin-red.mjs) no basta sola.
#   macOS: sandbox-exec con pruebas/sin-red.sb (red denegada salvo sockets Unix)
#   Linux: unshare -rn (un espacio de red vacio)
#   ninguno: NO se corre, salvo PRUEBAS_SIN_AISLAMIENTO=1 (y se avisa)
if command -v sandbox-exec >/dev/null 2>&1; then
  AISLA_MODO=sandbox-exec; AISLA="sandbox-exec -f $PWD/pruebas/sin-red.sb"
elif command -v unshare >/dev/null 2>&1 && unshare -rn true 2>/dev/null; then
  AISLA_MODO=unshare; AISLA="unshare -rn"
elif [ "${PRUEBAS_SIN_AISLAMIENTO:-}" = 1 ]; then
  AISLA_MODO=ninguno; AISLA=""
  echo "⚠️  SIN AISLAMIENTO DE RED DEL SISTEMA (PRUEBAS_SIN_AISLAMIENTO=1): solo la capa JS corta la red"
else
  echo "✗ No hay sandbox-exec ni unshare: no se corren las pruebas sin red cortada por el sistema."
  echo "  (Para forzarlo, sabiendo lo que se pierde: PRUEBAS_SIN_AISLAMIENTO=1)"
  exit 2
fi
# los hijos node tambien cargan sin-red.mjs (los workers heredan el --import)
NODE_OPTS_RED="--import $PWD/pruebas/sin-red.mjs"
