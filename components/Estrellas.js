import { useEffect, useRef } from 'react'

/**
 * LAS ESTRELLAS · el cielo de `vidrio.html`, en WebGL, encima de NetworkBg.
 * ENSAYO en la rama `fondo-galaxia` (21-sep-2026).
 *
 * ⭐ La referencia ya no es la landing de Forex Killer: es el generador de
 *    vidrio.html, la demo que Ramon eligio con los ojos en la ventana de
 *    Chrome de su iMac, con sus mandos en 2.000 estrellas para unos
 *    1.000×950 px. De ahi, TAL CUAL:
 *      · densidad: 1 estrella por cada 480 px² de ventana, topada en 22.000
 *      · mezcla: 60 % lejanas, 2 % grandes (sorteos independientes)
 *      · radio VISTO: grandes 1,6–2,8 px · lejanas 0,35–0,85 · el resto 0,6–1,5
 *        y en las grandes una cruz de ±5 radios, 0,8 px de grueso, a .35
 *      · velocidad: 3–8 px/s, las lejanas a la mitad, rumbo al azar
 *      · alfa: lejanas .55, el resto .95 · parpadeo .7 + .3·sen(.9 t + fase)
 *      · tonos: los 8 de base, por igual, sin variacion
 *      · un disco nitido, no un sprite con halo; mezcla «source-over», como el
 *        globalAlpha del canvas de la demo
 *    Sin fugaces: las pone NetworkBg, que sigue debajo.
 *
 * ⚠️ La demo es PLANA: sin z, sin perspectiva, sin deriva de yaw/pitch, sin
 *    respiracion. Se quitan aqui tambien, porque cualquiera de ellas cambia
 *    el radio y la velocidad VISTOS, que son justo lo que hay que igualar.
 *
 * Lo que se queda de antes:
 *   · el lienzo: JUSTO DESPUES de <NetworkBg /> en cada pagina, mismo
 *     position y z-index, transparente, pointer-events:none, id `campo` (lo
 *     lee Fps.js). ⛔ components/NetworkBg.js NO SE TOCA: es el contrato de
 *     tres repos.
 *   · EL CIELO VIVE EN EL MODULO: semilla y datos, reloj, escala y
 *     nacimiento. Al cambiar de pagina el cielo es el mismo, sigue su rumbo y
 *     no se vuelve a fundir (fundido de 1,2 s solo al nacer).
 *   · el `mod` en el vertex shader: la que sale por un lado entra por el
 *     opuesto, con MARGEN px fuera de la ventana para que ni la cruz de una
 *     grande (14 px) aparezca de golpe.
 *   · prefers-reduced-motion: quietas y sin parpadeo, como en la demo.
 *   · la limpieza completa (parche F), loseContext incluido.
 *
 * Solo en desarrollo: ?brillo=0.4 … 1 (multiplica el alfa) y ?estrellas=0.5 … 2
 * (multiplica la densidad). En produccion `process.env.NODE_ENV` los quita.
 */

/* Una estrella por cada 480 px², como la demo con sus mandos (2.000 en ~1.000×950). */
const PX2_POR_ESTRELLA = 480
const TOPE = 22000
/* Px de caja por fuera de la ventana: la cruz de la mayor grande mide 14 px de brazo. */
const MARGEN = 16
/* La demo pinta el alfa tal cual: en desarrollo, ?brillo lo multiplica. */
const BRILLO = 1
/* Los 8 tonos de la demo, por igual. ⛔ El dorado es de Agoge: aqui no entra. */
const TONOS = [[216,230,255],[255,255,255],[186,206,255],[208,202,255],[190,232,255],[96,160,255],[255,230,206],[255,202,150]]

function parametro(nombre, min, max, porDefecto) {
  if (process.env.NODE_ENV === 'production') return porDefecto
  const v = parseFloat(new URLSearchParams(window.location.search).get(nombre))
  return v >= min && v <= max ? v : porDefecto
}

/* ── el cielo, a nivel de modulo ─────────────────────────────────────────
   Una pestaña, un cielo: lo crea el primer montaje y lo heredan los demas. */
let cielo = null   // { datos, cuantas, t0, esc: [1 / cajaAncho0, 1 / cajaAlto0] }
const FL = 11      // floats: base x y (0–1 de la caja) · vel x y (px/s) · radio · r g b · fase · alfa · grande

/* Semilla fija y generacion secuencial: las primeras K estrellas son las
   mismas pidas las que pidas; una pantalla mayor solo añade. */
function generar(cuantas) {
  let semilla = 6713;
  const az = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; };
  const datos = new Float32Array(cuantas * FL);
  for (let i = 0; i < cuantas; i++){
    // el generador de la demo, en su orden
    const grande = az() < .02, lejana = az() < .6;
    const a = az() * 6.2832, v = (3 + az() * 5) * (lejana ? .5 : 1);       // px/s
    const x = az(), y = az();
    const r = grande ? 1.6 + az() * 1.2 : lejana ? .35 + az() * .5 : .6 + az() * .9;
    const c = TONOS[Math.floor(az() * TONOS.length)];
    datos.set([x, y, Math.cos(a) * v, Math.sin(a) * v, r, c[0] / 255, c[1] / 255, c[2] / 255,
               az() * 6.28, lejana ? .55 : .95, grande ? 1 : 0], i * FL);
  }
  return datos;
}

/* Cuantas hacen falta en la caja (ventana + MARGEN por lado) para que en la
   ventana caiga una por cada 480 px². */
const cuantasPara = (W, H, multiplica) =>
  Math.min(TOPE, Math.round((W + 2 * MARGEN) * (H + 2 * MARGEN) / PX2_POR_ESTRELLA * multiplica));

function nacer(cuantas, W, H) {
  if (!cielo) {
    /* La velocidad es px/s, pero el recorrido se guarda en fraccion de la
       caja con la que nacio el cielo: si luego cambia el alto (la barra del
       navegador en el movil) el cielo se estira, no salta. */
    cielo = { datos: null, cuantas: 0, t0: performance.now(), esc: [1 / (W + 2 * MARGEN), 1 / (H + 2 * MARGEN)] };
  }
  if (cielo.cuantas < cuantas) { cielo.datos = generar(cuantas); cielo.cuantas = cuantas; }
  return cielo;
}

export default function Estrellas() {
  const cajaRef = useRef(null)

  useEffect(() => {
    const caja = cajaRef.current;
    if (!caja) return;

    // PARCHE A · un lienzo por montaje. El estilo, el del <canvas> de NetworkBg.
    // El id sigue siendo `campo`: es lo que busca Fps.js.
    const lienzo = document.createElement("canvas");
    lienzo.id = "campo";
    lienzo.setAttribute("aria-hidden", "true");
    Object.assign(lienzo.style, {
      position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
      zIndex: "0", pointerEvents: "none"
    });
    caja.appendChild(lienzo);

    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nivel = parametro('brillo', .4, 1, BRILLO);
    const multiplica = parametro('estrellas', .5, 2, 1);
    const { t0, esc } = nacer(cuantasPara(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight), multiplica),
                              Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));

    /* ── WebGL ── */
    let gl = lienzo.getContext("webgl", { alpha:true, antialias:false, premultipliedAlpha:true, powerPreference:"low-power" });
    let prog, U = {}, ctx2d = null, maxPunto = 64;

    const VS = `
      precision highp float;
      attribute vec2 aBase, aVel;
      attribute vec3 aColor;
      attribute float aRadio, aFase, aAlfa, aGrande;
      uniform vec2  uCaja, uEsc, uRes;
      uniform float uDpr, uT, uMov, uEntrada, uAtenua, uMargen, uMaxPunto;
      varying vec3  vColor;
      varying float vAlfa, vGrande, vRadio, vLado, vDpr;

      void main(){
        float t = uT * uMov;
        /* rumbo: linea recta; lo que sale por un lado de la caja entra por el opuesto */
        vec2 q  = fract(aBase + aVel * t * uEsc);
        vec2 px = q * uCaja - uMargen;                       /* px CSS desde arriba a la izquierda */
        gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);

        /* el sprite cubre el disco, o la cruz si es grande, con 1 px de orla para el suavizado */
        float alcance = aGrande > .5 ? aRadio * 5.0 : aRadio;
        gl_PointSize = min(2.0 * (alcance + 1.0) * uDpr, uMaxPunto);
        vLado = gl_PointSize;
        vRadio = aRadio * uDpr;
        vDpr = uDpr;

        float parp = uMov > .5 ? .7 + .3 * sin(uT * .9 + aFase) : 1.0;
        vColor  = aColor;
        vAlfa   = aAlfa * parp * uEntrada * uAtenua;
        vGrande = aGrande;
      }`;

    const FS = `
      precision mediump float;
      varying vec3  vColor;
      varying float vAlfa, vGrande, vRadio, vLado, vDpr;
      void main(){
        vec2 d = (gl_PointCoord - .5) * vLado;               /* px de dispositivo desde el centro */
        /* el disco de la demo (arc + fill), con el borde suavizado medio px */
        float disco = clamp(vRadio - length(d) + .5, 0.0, 1.0);
        /* la cruz de las grandes: dos rectangulos de 10 radios × 0,8 px, a .35 */
        float grueso = .4 * vDpr, brazo = 5.0 * vRadio;
        float h = clamp(grueso - abs(d.y) + .5, 0.0, 1.0) * clamp(brazo - abs(d.x) + .5, 0.0, 1.0);
        float v = clamp(grueso - abs(d.x) + .5, 0.0, 1.0) * clamp(brazo - abs(d.y) + .5, 0.0, 1.0);
        float cruz = vGrande * max(h, v) * .35;
        /* la cruz se pinta ENCIMA del disco en la demo: source-over */
        float a = (disco + cruz * (1.0 - disco)) * vAlfa;
        if (a <= 0.0) discard;
        gl_FragColor = vec4(vColor * a, a);
      }`;

    function compilar(tipo, src){
      const s = gl.createShader(tipo);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }

    function montar(){
      prog = gl.createProgram();
      gl.attachShader(prog, compilar(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compilar(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, cielo.datos, gl.STATIC_DRAW);
      [["aBase",2,0],["aVel",2,2],["aRadio",1,4],["aColor",3,5],["aFase",1,8],["aAlfa",1,9],["aGrande",1,10]].forEach(([n, k, off]) => {
        const a = gl.getAttribLocation(prog, n);
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, k, gl.FLOAT, false, FL * 4, off * 4);
      });
      ["uCaja","uEsc","uRes","uDpr","uT","uMov","uEntrada","uAtenua","uMargen","uMaxPunto"]
        .forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
      maxPunto = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   /* source-over, premultiplicado */
      gl.clearColor(0, 0, 0, 0);
    }

    if (gl){ try { montar(); } catch (e){ console.error("estrellas:", e); gl = null; } }
    if (!gl){ ctx2d = lienzo.getContext("2d"); }

    /* ── estado ── */
    let W = 1, H = 1, dpr = 1, N = 0;
    let cuadroId = 0, perdido = false;

    function medir(){
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      W = Math.max(1, window.innerWidth);
      H = Math.max(1, window.innerHeight);
      lienzo.width = Math.round(W * dpr);
      lienzo.height = Math.round(H * dpr);
      if (gl) gl.viewport(0, 0, lienzo.width, lienzo.height);
      N = cuantasPara(W, H, multiplica);
      if (N > cielo.cuantas) {
        // pantalla mayor que cuando nacio: se amplia el cielo (el prefijo no cambia)
        nacer(Math.min(TOPE, Math.ceil(N * 1.25)), W, H);
        if (gl) gl.bufferData(gl.ARRAY_BUFFER, cielo.datos, gl.STATIC_DRAW);
      }
    }

    function cuadro(ahora){
      cuadroId = 0;
      // el reloj es el del cielo, no el del montaje: al cambiar de pagina sigue
      const t = (ahora - t0) / 1000;
      const mov = quieto ? 0 : 1;
      /* fundido de 1,2 s desde que nacio el cielo: una pagina nueva no lo repite */
      const entrada = quieto ? 1 : Math.min(t / 1.2, 1);

      if (gl){
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(U.uCaja, W + 2 * MARGEN, H + 2 * MARGEN);
        gl.uniform2f(U.uEsc, esc[0], esc[1]);
        gl.uniform2f(U.uRes, W, H);
        gl.uniform1f(U.uDpr, dpr);
        gl.uniform1f(U.uT, t);
        gl.uniform1f(U.uMov, mov);
        gl.uniform1f(U.uEntrada, entrada);
        gl.uniform1f(U.uAtenua, nivel);
        gl.uniform1f(U.uMargen, MARGEN);
        gl.uniform1f(U.uMaxPunto, maxPunto);
        gl.drawArrays(gl.POINTS, 0, N);
      } else {
        /* repuesto 2D: el dibujo de la demo, con las mismas N */
        const c = ctx2d, tm = t * mov, d = cielo.datos, cw = W + 2 * MARGEN, ch = H + 2 * MARGEN;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, W, H);
        for (let i = 0; i < N; i++){
          const o = i * FL;
          const fx = d[o] + d[o + 2] * tm * esc[0], fy = d[o + 1] + d[o + 3] * tm * esc[1];
          const x = (fx - Math.floor(fx)) * cw - MARGEN, y = (fy - Math.floor(fy)) * ch - MARGEN, r = d[o + 4];
          const p = mov ? .7 + .3 * Math.sin(t * .9 + d[o + 8]) : 1;
          c.globalAlpha = d[o + 9] * p * entrada * nivel;
          c.fillStyle = "rgb(" + (d[o+5]*255|0) + "," + (d[o+6]*255|0) + "," + (d[o+7]*255|0) + ")";
          c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
          if (d[o + 10] > .5){ c.globalAlpha *= .35; c.fillRect(x - r * 5, y - .4, r * 10, .8); c.fillRect(x - .4, y - r * 5, .8, r * 10); }
        }
        c.globalAlpha = 1;
      }

      if (!document.hidden) cuadroId = requestAnimationFrame(cuadro);
    }

    function reanudar(){ if (!cuadroId && !document.hidden && !perdido && lienzo.dataset.modo !== "apagado") cuadroId = requestAnimationFrame(cuadro); }

    const alRedimensionar = () => { medir(); };
    const alPerder = e => { e.preventDefault(); perdido = true; cancelAnimationFrame(cuadroId); cuadroId = 0; };
    const alRecuperar = () => {
      try { montar(); } catch (e){ console.error("estrellas:", e); return; }
      perdido = false; medir(); reanudar();
    };

    window.addEventListener("resize", alRedimensionar, { passive:true });
    document.addEventListener("visibilitychange", reanudar);
    lienzo.addEventListener("webglcontextlost", alPerder);
    lienzo.addEventListener("webglcontextrestored", alRecuperar);

    medir();

    /* PARCHES C y E. C · si WebGL existia pero montar() fallo, el lienzo ya
       es de WebGL y el contexto 2D sale null: se queda apagado y el cielo del
       hub sigue. E · `data-modo` lo leen el medidor de fps y las pruebas. */
    lienzo.dataset.modo = gl ? "webgl" : (ctx2d ? "repuesto" : "apagado");
    reanudar();

    return () => {
      // PARCHE F · primero los listeners (asi el `webglcontextlost` que
      // dispara loseContext ya no encuentra a nadie), luego el bucle, luego
      // el contexto y el lienzo. El cielo del modulo se queda: es de la pestaña.
      window.removeEventListener("resize", alRedimensionar);
      document.removeEventListener("visibilitychange", reanudar);
      lienzo.removeEventListener("webglcontextlost", alPerder);
      lienzo.removeEventListener("webglcontextrestored", alRecuperar);
      if (cuadroId) cancelAnimationFrame(cuadroId);
      cuadroId = 0;
      /* ⛔ Liberar el contexto NO es opcional. Chrome admite un numero pequeño
         de contextos WebGL vivos por pagina y tira el mas viejo al pasarse;
         con StrictMode montando dos veces, y una pagina nueva en cada
         navegacion, sin esto se acumulan. */
      if (gl){
        const ext = gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
        gl = null;
      }
      lienzo.remove();
    }
  }, [])

  return <div ref={cajaRef} style={{ display: 'contents' }} />
}
