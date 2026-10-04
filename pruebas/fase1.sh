#!/bin/sh
# ============================================================================
# FASE 1 DE LA AUDITORIA DEL SIMULADOR: reproducir los hallazgos altos de Astra
# (revisiones-suite/2026-10-04-astra-simulador.md) sin arreglar nada.
#
#   sh pruebas/fase1.sh            (todas)
#   sh pruebas/fase1.sh m01 d01    (solo esas)
#
# ⛔ SIN RED, SIN SECRETOS, SIN SUPABASE NI DUKASCOPY. Cada prueba corre con
#    `env -i` (ni una variable del entorno, tampoco las de .env.local) y con
#    sin-red.mjs delante. Supabase y el proveedor de velas son dobles en memoria
#    (ver pruebas/cargador.mjs). Cero escrituras en la base.
#
# Cada prueba tiene CONTROLES y ORACULOS (ver pruebas/lib.mjs):
#   codigo 1 = algun oraculo en rojo: el hallazgo SE REPRODUCE (lo esperado hoy)
#   codigo 0 = todos los oraculos en verde: el hallazgo NO se reproduce
#   codigo 2 u otro = un CONTROL roto o un fallo del arnes: la prueba no vale
# Este guion sale con 0 solo si ningun control esta roto; el resumen dice que
# se reproduce y que no.
# ============================================================================
cd "$(dirname "$0")/.." || exit 2
mkdir -p .pruebas
LOG=.pruebas/fase1.log
: > "$LOG"; : > .pruebas/fase1.jsonl
rotos=""
NODO="node --import ./pruebas/sin-red.mjs --import ./pruebas/registro.mjs"
for f in pruebas/arnes.mjs pruebas/fase1/*.mjs; do
  base=$(basename "$f" .mjs)
  if [ $# -gt 0 ] && [ "$base" != arnes ]; then
    quiere=""; for q in "$@"; do case "$base" in "$q"*) quiere=1 ;; esac; done
    [ -z "$quiere" ] && continue
  fi
  printf '\n######## %s\n' "$base" >> "$LOG"
  env -i PATH="$PATH" HOME="$HOME" TZ="Europe/Madrid" perl -e 'alarm shift; exec @ARGV' 300 $NODO "$f" >> "$LOG" 2>&1
  c=$?
  if [ "$base" = arnes ]; then
    if [ $c -eq 0 ]; then echo "  ✓ arnes"; else echo "  ✗ ARNES ROTO (ver $LOG)"; exit 2; fi
    continue
  fi
  case $c in
    1) echo "  🔴 $base   reproducido" ;;
    0) echo "  🟢 $base   NO se reproduce" ;;
    *) echo "  ✗ $base   CONTROL ROTO o fallo del arnes (codigo $c, ver $LOG)"; rotos="$rotos $base" ;;
  esac
done
echo
node -e '
const l = require("fs").readFileSync(".pruebas/fase1.jsonl", "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
for (const v of l) console.log(`${v.id.padEnd(4)} ${v.reproducido ? "ROJO " : "verde"}  ${v.desc}${v.cifras ? "  · " + v.cifras : ""}`)'
[ -z "$rotos" ] && { printf '\ncontroles en verde\n'; exit 0; }
printf '\nCONTROLES ROTOS:%s\n' "$rotos"; exit 2
