import { useEffect, useState } from 'react'

/**
 * EL MEDIDOR DE FPS · solo existe si la URL lleva `?fps=1`.
 *
 * ⭐ Es la unica forma de que Ramon mida en SU movil. Los fps del arnes son de
 *    Chrome headless con WebGL por software (SwiftShader): capacidad de
 *    calculo de este Mac, no fluidez en un telefono. El «60» de ahi no dice
 *    nada de un iPhone con 22.000 particulas.
 *
 * ── LO QUE ENSEÑA ─────────────────────────────────────────────────────────
 *   58 fps · peor 41
 *   webgl · dpr 1.75
 *     · fps   -> cuadros del ultimo segundo
 *     · peor  -> el peor segundo desde que se abrio (el que se nota)
 *     · modo  -> lo que pinta la galaxia: webgl | repuesto | apagado. Si en el
 *                movil sale «repuesto», no hay WebGL y se esta viendo el 2D.
 *     · dpr   -> la densidad con la que pinta el lienzo (topada a 1,75)
 *
 * ⚠️ Dos lineas y no una: en una sola medía 255 px de ancho, dos tercios de
 *    un telefono de 390 (medido el 18-sep). Discreto es poco.
 *
 * ⛔ SIN EL PARAMETRO NO EXISTE: no se pinta, no hay nodo en el DOM, no corre
 *    ningun bucle. `pruebas/en-el-navegador.mjs` lo comprueba por los dos lados.
 *
 * En el hub las variables de Forex Killer no existen en :root: van con su
 * valor de alli como respaldo, y nada mas cambia.
 *
 * El segundo en que la pestaña estuvo oculta no cuenta: el navegador para el
 * requestAnimationFrame y ese «0» seria del navegador, no de la pagina.
 */
export default function Fps() {
  const [activo, setActivo] = useState(false)
  const [texto, setTexto] = useState(['… fps', ''])

  useEffect(() => {
    setActivo(new URLSearchParams(window.location.search).get('fps') === '1')
  }, [])

  useEffect(() => {
    if (!activo) return
    let id = 0, cuadros = 0, t0 = performance.now(), peor = Infinity
    const tic = ahora => {
      cuadros++
      if (ahora - t0 >= 1000) {
        const fps = Math.round(cuadros * 1000 / (ahora - t0))
        peor = Math.min(peor, fps)
        const c = document.getElementById('campo')
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
        setTexto([fps + ' fps · peor ' + peor, (c ? c.dataset.modo || '—' : 'sin lienzo') + ' · dpr ' + dpr.toFixed(2)])
        cuadros = 0; t0 = ahora
      }
      id = requestAnimationFrame(tic)
    }
    const alVolver = () => { cuadros = 0; t0 = performance.now() }
    document.addEventListener('visibilitychange', alVolver)
    id = requestAnimationFrame(tic)
    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [activo])

  if (!activo) return null
  return (
    <div data-fps="" aria-hidden="true" style={{
      position: 'fixed', right: 8, bottom: 8, zIndex: 50,
      pointerEvents: 'none',
      fontFamily: 'var(--f-mono, "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 10, lineHeight: 1.35,
      fontVariantNumeric: 'tabular-nums',
      color: 'var(--dim, #8a93a8)', background: 'rgba(4,5,10,.72)',
      border: '1px solid var(--line, #161c2b)', borderRadius: 6, padding: '3px 6px',
    }}>{texto[0]}<br />{texto[1]}</div>
  )
}
