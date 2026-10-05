#!/bin/sh
# ============================================================================
# REPRODUCCIONES HISTORICAS CONTRA EL CODIGO AUDITADO (H04, revision de Astra
# del 4-oct-2026).
#
#   sh pruebas/historicas.sh
#
# Extrae el commit auditado (c470c8f, el que servia produccion) con git archive
# dentro de .pruebas/ (ignorado por git), le pone el ARNES ACTUAL y corre ahi:
#   · pruebas/historicas/*.mjs  las reproducciones ORIGINALES (commit 467f7c8)
#     de los hallazgos ya arreglados o cuyas pruebas se endurecieron. Sus
#     controles describen el codigo de entonces: solo valen contra el.
#   · pruebas/aceptacion/*.mjs  los contratos de lo ya arreglado. Contra el
#     codigo auditado TIENEN que salir en rojo: si alguna sale en verde, esa
#     prueba de aceptacion aprueba en vacio (no detecta el defecto que cierra).
# Mismas reglas que la tanda: env -i, sin red (sistema y JS), dobles.
# Codigo 0 solo si TODAS salen en rojo (codigo 1) y ningun control esta roto.
# ============================================================================
cd "$(dirname "$0")/.." || exit 2
. pruebas/aislar.sh
AUDITADO=c470c8f
DIR=.pruebas/auditado-$AUDITADO
rm -rf "$DIR" && mkdir -p "$DIR" || exit 2
git archive "$AUDITADO" | tar -x -C "$DIR" || exit 2
rm -rf "$DIR/pruebas"; mkdir -p "$DIR/pruebas"
cp pruebas/*.mjs pruebas/*.cjs pruebas/*.sb "$DIR/pruebas/" && cp -R pruebas/historicas pruebas/aceptacion "$DIR/pruebas/" || exit 2
ln -s "$PWD/node_modules" "$DIR/node_modules"
cd "$DIR" || exit 2
mkdir -p .pruebas
LOG=.pruebas/historicas.log
: > "$LOG"; : > .pruebas/fase1.jsonl
NODE_OPTS_RED="--import $PWD/pruebas/sin-red.mjs"
NODO="node --import ./pruebas/sin-red.mjs --import ./pruebas/registro.mjs"
mal=""
echo "contra $AUDITADO:"
for f in pruebas/historicas/*.mjs pruebas/aceptacion/*.mjs; do
  nombre="$(basename "$(dirname "$f")")/$(basename "$f" .mjs)"
  printf '\n######## %s\n' "$nombre" >> "$LOG"
  env -i PATH="$PATH" HOME="$HOME" TZ="Europe/Madrid" NODE_OPTIONS="$NODE_OPTS_RED" PRUEBAS_AISLADO="$AISLA_MODO" perl -e 'alarm shift; exec @ARGV' 300 $AISLA $NODO "$f" < /dev/null >> "$LOG" 2>&1
  case $? in
    1) echo "  🔴 $nombre   reproduce" ;;
    0) echo "  🟢 $nombre   NO REPRODUCE: aprueba el codigo auditado"; mal="$mal $nombre" ;;
    *) echo "  ✗ $nombre   CONTROL ROTO o fallo (ver $DIR/$LOG)"; mal="$mal $nombre" ;;
  esac
done
[ -z "$mal" ] && { printf '\ntodas reproducen contra %s\n' "$AUDITADO"; exit 0; }
printf '\nNO VALEN:%s\n' "$mal"; exit 1
