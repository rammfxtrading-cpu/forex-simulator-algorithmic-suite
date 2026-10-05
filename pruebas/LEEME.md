# Pruebas del simulador

Sin red (cortada por el sistema y en JS; ver `aislar.sh`, `sin-red.cjs`), sin secretos (`env -i`), con Supabase, proveedor de velas y React **dobles** (ver «Límites de los dobles»). Cero escrituras en la base.

| Carpeta / guion | Qué es | Qué se espera |
|---|---|---|
| `pruebas/*.mjs` · `tanda.sh` | arnés y ensayos de SQL (PostgreSQL local desechable) | verde |
| `pruebas/aceptacion/` · `tanda.sh` | **contratos** de lo ya arreglado: oráculos del comportamiento correcto, controles que no dependen del código viejo | verde (la tanda falla si no) |
| `pruebas/fase1/` · `fase1.sh` | reproducciones de lo que **sigue roto** en HEAD | rojo (código 1) hasta su arreglo |
| `pruebas/historicas/` · `historicas.sh` | reproducciones **originales** (commit `467f7c8`) de hallazgos ya arreglados o cuyas pruebas se endurecieron; sus controles describen el código de entonces | rojo contra `c470c8f` |

`historicas.sh` corre también `aceptacion/` contra el código auditado: ahí **tienen que salir en rojo**. Una prueba de aceptación que sale verde contra el código viejo aprueba en vacío.

**Cuando se arregla un hallazgo:** la prueba de `fase1/` se convierte en contrato (o se escribe uno nuevo) en `aceptacion/`; la original, si sus controles fijaban el comportamiento viejo, se copia tal cual a `historicas/`. Nunca se convierte a verde un control que describe el código defectuoso: el contrato se escribe aparte.

Códigos de salida de cada prueba: `1` algún oráculo en rojo · `0` todos en verde · `2` control roto · `3` excepción (fallo de la prueba). Un `2` o un `3` nunca cuentan como reproducción.
