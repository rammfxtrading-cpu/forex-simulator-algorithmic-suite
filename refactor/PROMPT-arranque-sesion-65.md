# PROMPT ARRANQUE SESIÓN 65 — forex-simulator-algorithmic-suite

## 0. Contexto fijo (no cambia)
- CTO/revisor = chat web (razona y verifica en sandbox propio); Ramón Tarinas (trader, NO dev) ejecuta en zsh de su iMac. Bytes en disco = única verdad. Español, tono CTO, UN paso por mensaje corto.
- Repo: /Users/principal/Desktop/forex-simulator-algorithmic-suite · Prod: simulator.algorithmicsuite.com (Vercel, deploy on push a main) · BD Supabase epxoxxadclhfnwfuwoyx.
- macOS: `md5` / `md5 -q` (no md5sum). Git siempre con `| cat`. Heredoc SIEMPRE quoted ('EOF').
- Gate §3.1: ejecutar `git push` ES el OK nominal de Ramón; smoke de producción tras cada push. Build encadenado al push con `&&` (si build falla, no se pushea). TRAS lanzar build+push, ESPERAR el prompt `%` antes de leer output: el build tarda 30-60 s y Ramón a veces pega antes de tiempo (pasó 3+ veces en s64).
- Disciplina de parche: python con assert md5 base + unicidad de anclas; ABORT sin escribir si algo difiere. Guard de transporte: test md5 del /tmp/parcheX.py antes de ejecutar.
- REGLAS vigentes (s59-s63): (1) heredoc SIEMPRE transcrito del view del archivo del sandbox; (2) transcripción AL CARÁCTER incluidas secuencias de escape; (3) ningún byte de un assert ni md5 de transporte nace del ojo del CTO — sandbox-first sin excepciones; (4) smokes en cuarto limpio (reiniciar dev + recarga dura; tras cambiar node_modules además rm -rf .next; tras componente nuevo también rm -rf .next); (5) tests destructivos solo sobre cuentas/sesiones sacrificables; (6) cada paste abre terminal nueva en ~: TODO bloque lleva el cd embebido; (7) otro agente (Claude Code) solo read-only, su informe se contrasta contra bytes; (8) grep de constantes numéricas SIEMPRE tolerante a espacios; (9) grep de identificadores tolerante a sintaxis JS moderna; (10) anclas de parche SIEMPRE en subcadenas ASCII puras — unicode SIEMPRE dentro del payload base64+zlib, código del parche ASCII de punta a punta.
- REGLA NUEVA s64-bis (raíz: el override que tumbó la estética): cuando un cambio de ESTILO "no se ve" pese a tener el CSS correcto, SIEMPRE buscar overrides inline en el JSX (`style={{...base,prop:...}}`) ANTES de tocar la regla base — un override inline pisa la clase. Y para estilos inline (objeto JS), los `:hover`/`@keyframes` NO funcionan: requieren regla CSS en un bloque `<style>` + className.
- META-REGLA s64 (calidad CTO): NO meter md5 de fixture de sandbox en cuerpos de commit ni en mensajes — el md5 real solo lo canta el disco de Ramón tras ejecutar; esperar a ese. Y NO escribir asserts de conteo con subcadenas ambiguas (case-sensitivity, sufijos): usar la cadena distintiva completa. Ambos fallos se repitieron en s64.

## 1. Estado al cierre de s64 (8-jun-2026, tarde)
- **Sesión 100% estética (9 parches A→I en producción, ~12 deploys). CERO avance en el camino de apertura.** Lo construido:
  - `8a456e2` enciende la card «Operativa» del dashboard → `router.push('/operativas')` (deja de ser huérfana; su gate `useAuth('simulador_activo')`+NoAccess intacto desde día uno).
  - `f4e8de0` fondo NetworkBg (estrellas + fugaces, copia 1:1 del hub) reemplaza la red de puntos en /operativas + liquid glass en `.opv-card` y `.opv-rcard`.
  - título card a «Operativa R.A.M.M.FX TRADING™» bicolor: «Operativa» blanco `#fff` + marca azul `#1E90FF` (parches 15+D+E).
  - `71a1b71` dashboard unificado: NetworkBg (sin tocar el canvas del LOGO, logoCanvasRef intacto) + liquid glass en `.ctaCard`.
  - `42df07e` `.ctaCard` adopta degradado/borde/radio/sombra/animación de operativas + `@keyframes ctaRise`.
  - `5fdb8a1` (HEAD) **la pieza de verdad**: las 3 cards (Practice/Challenge/Operativa) llevaban override inline `{borderColor:'#1E90FF60',background:'rgba(0,20,60,0.35)'}` que PISABA el degradado; quitado en las 3 → heredan `.ctaCard` limpio + hover `.ctaCardHover:hover` (clon de `.opv-card:hover`: translateY(-4px)+borde azul .75+sombra azul) vía regla CSS + className.
- **componente NUEVO:** `components/NetworkBg.js` (md5 `927c5e92`, copia 1:1 del hub `algorithmic-suite-hub`): campo de estrellas (titileo + conexiones azules) + fugaces cada 7-13s con estela. Autónomo, sin acoplar a auth/Supabase, teardown limpio.
- **Git HEAD cierre s64:** `5fdb8a1`, sincronizado con origin, árbol limpio.
- **md5 archivos clave:** dashboard.js `b7ba93f690f882d3c6e30d9aa03e4055` · operativas.js `ff59a6ebee0312f9ed0386f03df11d82` · components/NetworkBg.js `927c5e92d88c5e8b6a1bbabe1c11859a`.
- **BD baseline cierre s64:** sim_trades **0** · sim_sessions **0** · session_drawings **0** · sim_drawing_templates **10** · session_chart_config **2** · user_chart_config **3** · sin tablas backup. (0/0/0 = correcto: Ramón borró a Luis+Giancarlo+sí mismo perfil-por-perfil con el botón admin por-usuario en el PASO 0 de s64; mecanismo de borrado CERTIFICADO por-usuario, listo para borrar alumnos de pago sin afectar a otros.)
- **Errores CTO s64: sesión floja, alta racha.** 2 erratas de md5 en cuerpos de commit (metí md5 de fixture en vez del real, 2 veces; no afecta código ni deploy, pero ensucia el log). 3 tropiezos de aserción en sandbox (count de backdrop-filter por sufijo webkit; indentación 12 vs 14; count case-sensitive Webkit/backdrop) — TODOS cazados en sandbox, cero a disco de Ramón. 1 `</parameter>` colado en un comando (zsh parse error, sin daño). Diagnóstico LENTO del fallo estético: perseguí borde/radio/degradado cuando la causa era el override inline + ausencia de hover — alargó la fase varios parches. Racha histórica: 3→2→4→4→2→2→3→7→(s64 alta).

## 2. Agenda s65 (LA fase que desbloquea cobrar — orden propuesto)
1. **PASO 0 bicapa:** repo (HEAD `5fdb8a1`, md5 de §1, delta solo si Ramón tocó algo) + BD vs 0/0/0/10/2/3.
2. **FASE PLANES/LÍMITES (objetivo: dejar listo para cobrar; que solo falten vídeos+capturas):**
   - **Sub-fase 0 — PASO 0 propio en bytes:** leer cómo es HOY (a) la tabla/lista de alumnos en `pages/admin.js` (la "con acceso"), (b) el endpoint `/api/admin/toggle-acceso-sim` y familia `/api/admin/*` (vistos en rutas de build s64), (c) **dónde y cómo se crean las sesiones** (productor: `/api/...` o cliente; buscar el insert a sim_sessions). El plan de la fase NACE de ese PASO 0, no se asume.
   - **Campo `plan` (Basic|Extra):** migración Supabase (columna en profiles o tabla de acceso; decidir dónde vive el acceso actual). INDEPENDIENTE del acceso, conservado al revocar.
   - **Toggle Basic|Extra** en la lista "con acceso" de admin.
   - **Límite derivado del plan:** Básico → 6 sesiones · Extra → 12.
   - **GATE SERVER-SIDE de creación de sesiones (LO CRÍTICO, va ANTES del primer alumno de pago):** el límite DEBE imponerse en el servidor (`/api/...`), no en el cliente. Sin esto el límite es decorativo y un alumno listo lo salta. Precios: Básico 21 €/6 sesiones · Extra 36 €/12.
   - **Landing de pago** en subdominio.
3. **Deudas dev si hay hueco:** asimetría lastBreachIdx · ECONNRESET/401 de /api/candles.

## 3. Cortes/pendientes anotados (no urgentes)
- **Pulido estético aparcado (post-apertura):** el PILL de las cards del dashboard (operativas tiene «LONDON KILLZONE» etc.; dashboard NO; meterlo es tocar JSX + decidir textos) — fuera de alcance a propósito en s64. Reglas CSS huérfanas tras s64: `.opv-stars` (L35 operativas) y `s.bgCanvas` (objeto s del dashboard) — inofensivas, sin consumidores, no tocadas.
- /operativas fase blindaje: persistencia de la hoja de ruta por alumno en Supabase (hoy localStorage `rammfx_ruta_<user.id>`) · vídeo con streaming firmado y embed bloqueado a dominio · watermark con email. **CONTENIDO pendiente de Ramón: vídeos + capturas a los huecos `opv-ex`/`opv-video` de los 3 modales** (es lo único que debe quedar tras s65).
- E2 chart-mount: extraer mountPairRef + efecto TF. · s61-A finde (fork e9a6328) · feed salta vie~20:45→dom22:00 · anclar 6 plugins line-tools a SHA (supply-chain) · pip-value exacto con feed · dibujos long-short viejos en JPP x100 en session_drawings.
- Observación s62 vigente: `Object is disposed` aislado en teardown del chart, solo-dev, no reproducido.
