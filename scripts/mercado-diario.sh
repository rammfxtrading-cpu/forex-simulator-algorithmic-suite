#!/bin/sh
# ============================================================================
# ACTUALIZACION DIARIA DE LOS NUEVE PARES (CTO 9-oct-2026, mercado diario,
# punto 3). La llama .github/workflows/mercado-diario.yml, UN PAR POR PASO:
#
#   sh scripts/mercado-diario.sh paso PAR    un par (actualizar-diario.js --subir --pares PAR)
#   sh scripts/mercado-diario.sh reintento   un reintento final de los que dieron 2
#   sh scripts/mercado-diario.sh resumen     tabla, bytes y codigo de la ejecucion
#
# Reglas:
#   · entre par y par, PAUSA_ENTRE_PARES_S (120 s); no antes del primero;
#   · un 429 del proveedor («PROVEEDOR LIMITA (HTTP 429)» en el log del par)
#     corta TODO: los pasos siguientes y los reintentos no piden nada;
#   · UN reintento final, con su pausa, de cada par que salio con 2 (proveedor
#     no disponible: 503, red o plazo). Los codigos 1, 3 y 4 no se reintentan;
#   · tope de descarga de la ejecucion: MERCADO_TOPE_BYTES (bytes de objetos
#     anuales). Cada par recibe en MERCADO_TOPE_BYTES lo que queda, segun la
#     linea «Transferencia» de los anteriores; si un par no la imprime, no se
#     sabe lo que descargo y los siguientes reciben 0 (solo la cache).
#   · codigo del resumen: con 429, 2 (1 si un par salio con 1: una publicacion
#     fallida no se oculta, CTO 7-oct); sin 429, manda 1, 4, 3, 2 y si no, 0.
#     Un par sin linea en el estado (paso cortado o no ejecutado) cuenta como 4.
# Cada paso sale con 0 (salvo uso incorrecto, 4): el codigo de la ejecucion lo
# da el resumen. Estado en MERCADO_ESTADO (por defecto $RUNNER_TEMP/mercado-diario).
# Para las pruebas: MERCADO_NODE (node) y MERCADO_ESPERA (sleep).
# ============================================================================
cd "$(dirname "$0")/.." || exit 4
EST="${MERCADO_ESTADO:-${RUNNER_TEMP:-/tmp}/mercado-diario}"
NODO="${MERCADO_NODE:-node}"
ESPERA="${MERCADO_ESPERA:-sleep}"
PAUSA="${PAUSA_ENTRE_PARES_S:-120}"
PARES="${MERCADO_PARES:-EURUSD GBPUSD USDJPY USDCHF AUDUSD USDCAD NZDUSD AUDCAD GBPJPY}"
TOPE="${MERCADO_TOPE_BYTES:-}"
mkdir -p "$EST" || exit 4
touch "$EST/pares"

case "$TOPE" in ''|*[!0-9]*) [ -n "$TOPE" ] && { echo "MERCADO_TOPE_BYTES no valido: un entero de bytes"; exit 4; } ;; esac
case "$PAUSA" in ''|*[!0-9]*) echo "PAUSA_ENTRE_PARES_S no valido: un entero de segundos"; exit 4 ;; esac

consumido() { awk '$3 ~ /^[0-9]+$/ { s += $3 } END { print s + 0 }' "$EST/pares"; }
hubo_par() { awk '$2 ~ /^[0-9]+$/ { n++ } END { exit n ? 0 : 1 }' "$EST/pares"; }

# corre_par PAR FASE (paso | reintento)
corre_par() {
  par=$1; fase=$2; log="$EST/log_${par}_$fase"
  if [ -n "$TOPE" ]; then
    if [ -f "$EST/agotado" ]; then queda=0; else queda=$((TOPE - $(consumido))); [ "$queda" -lt 0 ] && queda=0; fi
    echo "== $par ($fase): tope que queda $queda de $TOPE bytes"
    MERCADO_TOPE_BYTES=$queda "$NODO" scripts/actualizar-diario.js --subir --pares "$par" > "$log" 2>&1
    c=$?
  else
    echo "== $par ($fase): sin tope"
    ( unset MERCADO_TOPE_BYTES; "$NODO" scripts/actualizar-diario.js --subir --pares "$par" ) > "$log" 2>&1
    c=$?
  fi
  cat "$log"
  bytes=$(sed -n 's/.*Transferencia (objetos anuales leidos del bucket): [0-9]* descarga(s), \([0-9]*\) bytes.*/\1/p' "$log" | tail -n 1)
  if [ -z "$bytes" ]; then
    bytes='?'
    touch "$EST/agotado"
    echo "== $par: el log no dice lo descargado; los pares siguientes no descargan (tope agotado)"
  fi
  if grep -q 'PROVEEDOR LIMITA (HTTP 429)' "$log"; then
    echo "$par $fase codigo $c" > "$EST/corte"
    echo "== $par: el proveedor limita (HTTP 429): corte total, no se pide nada mas"
  fi
  echo "$par $c $bytes $fase" >> "$EST/pares"
  echo "== $par ($fase): codigo $c, $bytes bytes descargados"
}

case "$1" in
  paso)
    par=$2
    case "$par" in [A-Z][A-Z][A-Z][A-Z][A-Z][A-Z]) ;; *) echo "paso: hace falta UN par (p. ej. EURUSD)"; exit 4 ;; esac
    if [ -f "$EST/corte" ]; then
      echo "== $par: NO EMPEZADO: el proveedor limito antes ($(cat "$EST/corte"))"
      echo "$par no-empezado - paso" >> "$EST/pares"
      exit 0
    fi
    if hubo_par; then echo "== pausa de $PAUSA s"; "$ESPERA" "$PAUSA"; fi
    corre_par "$par" paso
    exit 0
    ;;
  reintento)
    if [ -f "$EST/corte" ]; then echo "== sin reintentos: el proveedor limito ($(cat "$EST/corte"))"; exit 0; fi
    lista=$(awk '$4 == "paso" && $2 == "2" { print $1 }' "$EST/pares")
    [ -z "$lista" ] && { echo "== nada que reintentar"; exit 0; }
    for par in $lista; do
      if [ -f "$EST/corte" ]; then echo "== $par: sin reintento: el proveedor limito"; continue; fi
      echo "== pausa de $PAUSA s"; "$ESPERA" "$PAUSA"
      corre_par "$par" reintento
    done
    exit 0
    ;;
  resumen)
    echo ""
    echo "=== ACTUALIZACION DIARIA: RESUMEN ==="
    final=0; hay1=0; hay4=0; hay3=0; hay2=0
    for par in $PARES; do
      linea=$(awk -v p="$par" '$1 == p' "$EST/pares" | tail -n 1)
      if [ -z "$linea" ]; then echo "  $par  ✗ sin ejecutar (paso cortado o no corrido)"; hay4=1; continue; fi
      set -- $linea
      intentos=$(awk -v p="$par" '$1 == p && $2 ~ /^[0-9]+$/' "$EST/pares" | wc -l | tr -d ' ')
      case "$2" in
        no-empezado) echo "  $par  — no empezado (corte por HTTP 429)" ;;
        0) echo "  $par  ✓ codigo 0 · $3 bytes · $intentos intento(s)" ;;
        1) echo "  $par  ✗ codigo 1 · $3 bytes · $intentos intento(s)"; hay1=1 ;;
        2) echo "  $par  ✗ codigo 2 · $3 bytes · $intentos intento(s)"; hay2=1 ;;
        3) echo "  $par  ✗ codigo 3 · $3 bytes · $intentos intento(s)"; hay3=1 ;;
        *) echo "  $par  ✗ codigo $2 · $3 bytes · $intentos intento(s)"; hay4=1 ;;
      esac
    done
    total=$(consumido)
    if [ -f "$EST/agotado" ]; then total="$total (+ desconocido)"; fi
    echo "  Total descargado (objetos anuales): $total bytes${TOPE:+ · tope $TOPE bytes}"
    if [ -f "$EST/corte" ]; then
      echo "  ✗ Corte por HTTP 429: $(cat "$EST/corte")"
      [ $hay1 = 1 ] && final=1 || final=2
    elif [ $hay1 = 1 ]; then final=1
    elif [ $hay4 = 1 ]; then final=4
    elif [ $hay3 = 1 ]; then final=3
    elif [ $hay2 = 1 ]; then final=2
    fi
    echo "=== codigo $final ==="
    exit $final
    ;;
  *)
    echo "uso: sh scripts/mercado-diario.sh paso PAR | reintento | resumen"
    exit 4
    ;;
esac
