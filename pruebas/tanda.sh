#!/bin/sh
# ============================================================================
# LA TANDA COMPLETA DEL SIMULADOR. Antes de cada commit, entera.
#
#   sh pruebas/tanda.sh
#
# ⛔ SIN RED, SIN SECRETOS, SIN SUPABASE NI DUKASCOPY. Cada prueba corre con
#    `env -i` (ni una variable del entorno, tampoco las de .env.local) y con
#    sin-red.mjs delante. Supabase y el proveedor de velas son dobles en memoria
#    (ver pruebas/cargador.mjs). Cero escrituras en la base.
#
# Orden: el arnes primero (si el arnes miente, todo lo demas tambien), luego
# las pruebas de pruebas/*.mjs, y despues las de ACEPTACION de lo ya arreglado
# (pruebas/aceptacion/), que tienen que salir en verde: codigo 0, ningun
# oraculo en rojo, y al menos los oraculos de pruebas/aceptacion/minimos.json
# (H04). Al final, OBLIGATORIO (H04, bloque D 5-oct): el contraste historico
# (pruebas/historicas.sh): cada aceptacion tiene que salir en ROJO contra el
# codigo auditado, o aprueba en vacio. Aparte (ver pruebas/LEEME.md):
#   sh pruebas/fase1.sh       lo que sigue roto (en rojo a proposito)
#
# Salida: el detalle va a .pruebas/tanda.log; en pantalla, una linea por
# prueba. Codigo 0 solo si TODO esta en verde. Se juzga por el codigo de
# salida, nunca por lo que diga una tuberia.
# ============================================================================
cd "$(dirname "$0")/.." || exit 2
. pruebas/aislar.sh
mkdir -p .pruebas
LOG=.pruebas/tanda.log
: > "$LOG"
fallos=""
n=0

corre() {  # corre ETIQUETA COMANDO...
  etiqueta=$1; shift
  n=$((n + 1))
  printf '\n######## %s\n' "$etiqueta" >> "$LOG"
  # perl alarm: macOS no trae `timeout`
  if env -i PATH="$PATH" HOME="$HOME" TZ="Europe/Madrid" NODE_OPTIONS="$NODE_OPTS_RED" PRUEBAS_AISLADO="$AISLA_MODO" \
       perl -e 'alarm shift; exec @ARGV' 300 $AISLA "$@" < /dev/null >> "$LOG" 2>&1; then
    echo "  ✓ $etiqueta"
  else
    echo "  ✗ $etiqueta   (ver $LOG)"
    fallos="$fallos $etiqueta"
  fi
}

NODO="node --import ./pruebas/sin-red.mjs --import ./pruebas/registro.mjs"

echo "pruebas/"
corre arnes $NODO pruebas/arnes.mjs
for f in pruebas/*.mjs; do
  case "$(basename "$f")" in
    arnes.mjs|lib.mjs|cargador.mjs|registro.mjs|sin-red.mjs|entorno.mjs|supabase-falso.mjs|react-falso.mjs|next-falso.mjs|decorado-falso.mjs|proveedor-falso.mjs|pg-ensayo.mjs|banco-motor.mjs|script-falso.mjs|estado-s04.mjs) continue ;;
  esac
  corre "$(basename "$f" .mjs)" $NODO "$f"
done

echo "pruebas/aceptacion/"
for f in pruebas/aceptacion/*.mjs; do
  [ -f "$f" ] || continue
  corre "aceptacion/$(basename "$f" .mjs)" $NODO "$f"
done

echo "pruebas/motor/"
for f in pruebas/motor/*.mjs; do
  [ -f "$f" ] || continue
  corre "motor/$(basename "$f" .mjs)" $NODO "$f"
done

echo "contraste historico (obligatorio):"
n=$((n + 1))
printf '\n######## historicas\n' >> "$LOG"
if sh pruebas/historicas.sh >> "$LOG" 2>&1; then
  echo "  ✓ historicas (todas en rojo contra el codigo auditado)"
else
  echo "  ✗ historicas   (ver $LOG y .pruebas/auditado-*/.pruebas/historicas.log)"
  fallos="$fallos historicas"
fi

if [ -z "$fallos" ]; then
  printf '\ntodo verde · %s pruebas\n' "$n"
  exit 0
fi
printf '\nEN ROJO:%s\n' "$fallos"
exit 1
