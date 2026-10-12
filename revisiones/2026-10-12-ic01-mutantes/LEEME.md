# ic01 · mutantes del importador (etapa 0, CTO 12-oct-2026)

La prueba `pruebas/aceptacion/ic01-importar-csv.mjs`, con las rutas reales de `lib/mercado/ficheros.mjs`:
- `rutaEscritura`, `.json.gz`, para «pasa»;
- cero llamadas de subida en los rechazos y en seco;
- en los 4 casos del cerrojo, exactamente una subida a `rutaCerrojo`.

Se ha corrido contra el script correcto y contra cuatro mutantes de `scripts/importar-csv.js`. Cada mutante sube, en todo caso que **no** publica (el `catch` de los rechazos, el final con código ≠ 0, y en seco):

| Mutante | Qué sube | Resultado |
|---|---|---|
| a | `EURUSD/M1/2026.json.gz` (datos) | 35 rojos · 12 verdes · código 1 |
| b | `EURUSD/M1/2026.json` (datos) | 35 rojos · 12 verdes · código 1 |
| c | `_cerrojos/EURUSD_2026.json.gz` (dentro de `_cerrojos/`, no es la ficha) | 35 rojos · 12 verdes · código 1 |
| d | `_cerrojos/EURUSD_2026.json`, la ficha, otra vez (en los casos del cerrojo, dos veces) | 35 rojos · 12 verdes · código 1 |

- **En los cuatro**, las 25 comprobaciones de «cero subidas» o «solo la ficha del cerrojo» están en rojo. Contadas con los bucles, son 15 sitios del código, incluidos los 4 del cerrojo.
- **Los 12 verdes** son los mismos en los cuatro mutantes: solo los casos que publican, y el de timeout.
- **Script correcto** (`ic01-script-correcto.log`): 47 verdes, código 0.

**Antes de esta corrección**, la prueba contaba solo las subidas a `EURUSD/M1/2026.json`. Desde el gzip de `main` el script sube `.json.gz`, así que los 14 oráculos de «cero subidas» aprobaban sin comprobar nada: el mutante a los habría pasado en verde.

Ficheros:
- `mutante-*.diff`: el parche de cada mutante sobre `scripts/importar-csv.js`;
- `mutante-*.log`: su salida entera.
