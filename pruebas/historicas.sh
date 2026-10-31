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
# las velas reales de las pruebas de propiedad (sg05, orden 1-083): datos, no codigo
mkdir -p "$DIR/pruebas/fixtures" && cp -R pruebas/fixtures/velas "$DIR/pruebas/fixtures/" || exit 2
ln -s "$PWD/node_modules" "$DIR/node_modules"
cd "$DIR" || exit 2
mkdir -p .pruebas
LOG=.pruebas/historicas.log
: > "$LOG"; : > .pruebas/fase1.jsonl
NODE_OPTS_RED="--import $PWD/pruebas/sin-red.mjs"
NODO="node --import ./pruebas/sin-red.mjs --import ./pruebas/registro.mjs"
mal=""
# FUERA DEL CONTRASTE contra c470c8f (orden 1-167 del CTO), DECLARADAS: aceptaciones que no pueden correr sobre el codigo
# auditado porque les falta lo que prueban; alli mueren con codigo 2 (fallo de la prueba), no con un rojo (1). Siguen en la
# tanda contra esta rama; aqui no aprueban ni reproducen nada. Medido en la tanda del 29-oct (rama paquete-simulador-motor):
#   af01-advance-end-timestamp   importa lib/sim/avisos.js (etapa 1, 324b429): no existe en c470c8f (ERR_MODULE_NOT_FOUND)
#   srk01-clave-servidor         el codigo de c470c8f lee el .env.local del repo y la guarda de .env de las pruebas lo
#                                deniega con una excepcion («LECTURA DE .env DENEGADA»): nunca llega a sus oraculos
#   v1c01..v1c05, v1c07..v1c10   el motor v1: leen sql/sim-002-lectura-estable.sql (y lib/sim/v1/), que no existen en
#                                c470c8f (ENOENT). v1c06 si corre alli y reproduce: se queda
#   v1c11, v1c12 (orden 1-175)   PSIMM1-01/02 de la pantalla v1: en c470c8f no hay lib/sim/v1/pantalla.js; alli saldrian en
#                                rojo solo por AUSENCIA (no es una reproduccion). Su rojo semantico es contra d3fa792
#                                (revisiones-suite/2026-10-30-psimm1-r2-evidencias/rojo-*.log)
#   v1c13 (orden 1-176)          igual (R2-5/R2-6/R2-7); su rojo semantico es contra 042976f (rojo-v1c13-huecos-r2-042976f.log)
#   v1c14 (orden 1-177)          igual; es una declaracion (verde ya en 16ccc74): lo vivo se ve y se cancela sin su dibujo
#   v1c15, v1c16, cv02           (orden 1-179) el rango publicado al crear, el grafico v1 del mercado v1, una carga por par
#                                y el plazo de las velas: leen lib/servidor/ y lib/sim/v1/ (no existen en c470c8f) o el
#                                banco de hoy. Su rojo semantico es contra f54e987 (revisiones-suite/2026-10-30-simulador-r3-evidencias/)
#   v1c17 (orden 1-180)          PSIMM2-01/02 de la pantalla v1 (como v1c11–v1c14); rojo semantico contra f54e987
#   v1c18, v1c19, cv04 (1-182)   PSIMM3-01/02/03: la pantalla v1, la huella generativa y el contexto v0 del banco de hoy;
#                                rojo semantico contra 2e1edc1 (revisiones-suite/2026-10-30-simulador-r4-evidencias/)
#   v1c20, cv05, pg01 (1-183)    la huella del sobre, el contexto v1 y los PostgreSQL huerfanos del arnes: leen lib/sim/v1/ y
#                                montaje-v1 (no existen en c470c8f); rojo semantico contra c5f2ac0 (mismas evidencias)
#   pg02, cv06 (1-185)           el barrido de huerfanos y la generativa del contexto (v1 y v0 del banco de hoy); rojo contra 8227506
NO_CONTRA_AUDITADO="af01-advance-end-timestamp srk01-clave-servidor v1c01-cliente-comandos v1c02-vista-y-ordenes v1c03-ocultos-breach-reto v1c04-step-play-goto v1c05-pantalla-v1 v1c07-como-hoy v1c08-spread-a-la-vista v1c09-lote-pausa-autopausa v1c10-comision-y-pausa v1c11-ack-sin-relectura v1c12-aperturas-solapadas v1c13-huecos-r2 v1c14-huerfana-visible v1c15-rango-publicado v1c16-grafico-del-mercado-v1 cv02-una-carga-sin-espera-infinita v1c17-psimm2 v1c18-psimm3 v1c19-huella-generativa cv04-contexto-v0-rechazo v1c20-huella-sobre cv05-contexto-v1 pg01-sin-huerfanos pg02-barrido-huerfanos cv06-contexto-generativa"
fuera=0
echo "contra $AUDITADO:"
for f in pruebas/historicas/*.mjs pruebas/aceptacion/*.mjs; do
  nombre="$(basename "$(dirname "$f")")/$(basename "$f" .mjs)"
  case " $NO_CONTRA_AUDITADO " in *" $(basename "$f" .mjs) "*) [ "$(basename "$(dirname "$f")")" = aceptacion ] && { echo "  ⚪ $nombre   fuera del contraste (declarada en historicas.sh: no puede correr contra $AUDITADO)"; fuera=$((fuera + 1)); continue; } ;; esac
  printf '\n######## %s\n' "$nombre" >> "$LOG"
  env -i PATH="$PATH" HOME="$HOME" TZ="Europe/Madrid" NODE_OPTIONS="$NODE_OPTS_RED" PRUEBAS_AISLADO="$AISLA_MODO" perl -e 'alarm shift; exec @ARGV' 300 $AISLA $NODO "$f" < /dev/null >> "$LOG" 2>&1
  case $? in
    1) echo "  🔴 $nombre   reproduce" ;;
    0) echo "  🟢 $nombre   NO REPRODUCE: aprueba el codigo auditado"; mal="$mal $nombre" ;;
    *) echo "  ✗ $nombre   CONTROL ROTO o fallo (ver $DIR/$LOG)"; mal="$mal $nombre" ;;
  esac
done
[ -z "$mal" ] && { printf '\ntodas reproducen contra %s (%s fuera del contraste, declaradas)\n' "$AUDITADO" "$fuera"; exit 0; }
printf '\nNO VALEN:%s\n' "$mal"; exit 1
