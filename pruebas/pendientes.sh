#!/bin/sh
# ============================================================================
# PRUEBAS PENDIENTES DE LA PIEZA 7 (en rojo a proposito hasta implementarla).
#
#   sh pruebas/pendientes.sh
#
# Fixtures escritos ANTES que el codigo (orden de Astra, diseño-4 § F). La
# tanda (pruebas/tanda.sh) no los corre: una prueba en rojo a proposito no
# puede ir en la tanda, que tiene que salir en verde antes de cada commit.
# Cuando una parte de la pieza 7 los pone en verde, su fichero pasa de
# pruebas/motor-pendiente/ a pruebas/motor/ (y entra en la tanda, con su
# minimo en pruebas/motor/minimos.json).
# Mismo aislamiento que la tanda: env -i y sin red. Codigo 1 = algun oraculo
# en rojo (lo esperado mientras esten aqui); 2 = control roto o fallo del arnes.
# ============================================================================
cd "$(dirname "$0")/.." || exit 2
. pruebas/aislar.sh
mkdir -p .pruebas
LOG=.pruebas/pendientes.log
: > "$LOG"
peor=0
for f in pruebas/motor-pendiente/*.mjs; do
  [ -f "$f" ] || continue
  printf '\n######## %s\n' "$f" >> "$LOG"
  env -i PATH="$PATH" HOME="$HOME" TZ="Europe/Madrid" NODE_OPTIONS="$NODE_OPTS_RED" PRUEBAS_AISLADO="$AISLA_MODO" perl -e 'alarm shift; exec @ARGV' 300 $AISLA node --import ./pruebas/sin-red.mjs --import ./pruebas/registro.mjs "$f" < /dev/null >> "$LOG" 2>&1
  c=$?
  resumen=$(grep -E 'en rojo · ' "$LOG" | tail -1)
  case $c in 0) echo "  ✓ $f   $resumen" ;; 1) echo "  ● $f   (en rojo a proposito) $resumen" ;; *) echo "  ✗ $f   codigo $c: control roto o fallo (ver $LOG)"; peor=2 ;; esac
done
exit $peor
