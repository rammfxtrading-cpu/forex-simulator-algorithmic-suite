// Los tiradores del dibujo de posicion (largo/corto) como en TradingView (ordenes 1-105 y 1-110 del CTO, pedido de
// Ramon). El plugin (vendor/lightweight-charts-line-tools-long-short-position) traia TRES tiradores: la entrada en el
// extremo izquierdo de su linea y el SL y el TP en el extremo DERECHO; los de la entrada y el SL movian precio y ancho a
// la vez. Ahora, CUATRO:
//   0 · circulo, extremo izquierdo de la entrada: SOLO ensancha (mueve el borde izquierdo); el precio queda bloqueado
//       aunque la mano se mueva en vertical.
//   1 · extremo izquierdo del SL: SOLO vertical (precio del SL); nada horizontal.
//   2 · extremo izquierdo del TP: SOLO vertical (precio del TP); nada horizontal.
//   3 · cuadrado, extremo derecho de la entrada: precio de entrada en vertical Y ancho (borde derecho) a la vez.
// Igual en largo y en corto. Nada mas cambia: los puntos guardados siguen siendo los mismos tres (entrada en el borde
// izquierdo, SL y TP en el derecho), asi que los dibujos ya guardados se abren igual; las cajas, los textos (pips y
// RR, que el plugin recalcula de los precios), el giro largo/corto y el 3R de la creacion son los del plugin.
// El tirador 3 no es un punto guardado: el arrastre llega con su indice (el del tirador pintado) a setPoint, y aqui se
// traduce a los puntos de verdad. maxAnchorIndex sigue en 2: mover la caja entera (y en grupo) solo copia los tres.
// AnchorPoint y PaneCursorType llegan del core que ya carga useDrawingTools (el de vendor/, por el alias de next.config.js)

export const TIRADOR = { ENTRADA_ANCHO: 0, SL: 1, TP: 2, ENTRADA: 3 }
// px: por debajo, el circulo y el cuadrado de la entrada se pisan
const SOLAPE = 8

export function clasePosicion(Base, { AnchorPoint, PaneCursorType }) {
  return class PosicionTradingView extends Base {
    constructor(...args) {
      super(...args)
      const vista = this._paneViews?.[0]
      if (vista) vista._addAnchors = function (renderer) { tiradores(this, renderer, AnchorPoint, PaneCursorType) }
    }
    setPoint(index, point) {
      const p = this._points
      if (p.length < 3 || !point) return super.setPoint(index, point)
      const izq = p[0].timestamp, der = p[1].timestamp
      // el borde que se mueve no cruza al otro (la caja nunca se da la vuelta en horizontal)
      if (index === TIRADOR.ENTRADA_ANCHO) {
        if (!(Number(point.timestamp) < Number(der))) return
        return super.setPoint(0, { timestamp: point.timestamp, price: p[0].price })
      }
      if (index === TIRADOR.SL) return super.setPoint(1, { timestamp: der, price: point.price })
      if (index === TIRADOR.TP) return super.setPoint(2, { timestamp: der, price: point.price })
      if (index === TIRADOR.ENTRADA) {
        super.setPoint(0, { timestamp: izq, price: point.price })
        if (Number(point.timestamp) > Number(izq)) super.setPoint(1, { timestamp: point.timestamp, price: this._points[1].price })
        return
      }
      return super.setPoint(index, point)
    }
    // Shift: el SL y el TP ya son solo verticales y el circulo solo horizontal (sin esto, el Shift del plugin bloquearia
    // el precio del SL). El cuadrado no tiene nada propio con Shift: el core no le aplica restriccion (no es un punto guardado)
    getShiftConstrainedPoint(pointIndex, rawScreenPoint, phase, originalLogicalPoint, all) {
      if (pointIndex === TIRADOR.SL || pointIndex === TIRADOR.TP || pointIndex === TIRADOR.ENTRADA_ANCHO) return { point: rawScreenPoint, snapAxis: 'none' }
      return super.getShiftConstrainedPoint(pointIndex, rawScreenPoint, phase, originalLogicalPoint, all)
    }
  }
}

// los cuatro tiradores, en pantalla: [0] entrada/izquierda, [1] SL/derecha, [2] TP/derecha son los puntos del plugin
export function tiradores(vista, renderer, AnchorPoint, PaneCursorType) {
  const pts = vista._points
  if (!pts || pts.length < 3) return
  const [e, s, t] = pts
  const a = (x, y, i, cuadrado, cursor) => new AnchorPoint(x, y, i, cuadrado, cursor)
  const anclas = [
    a(e.x, e.y, TIRADOR.ENTRADA_ANCHO, false, PaneCursorType.HorizontalResize),
    a(e.x, s.y, TIRADOR.SL, false, PaneCursorType.VerticalResize),
    a(e.x, t.y, TIRADOR.TP, false, PaneCursorType.VerticalResize),
    a(s.x, e.y, TIRADOR.ENTRADA, true, PaneCursorType.Move),
  ]
  // orden 1-132: un dibujo que ya se quedo sin ancho (o casi) tiene el circulo y el cuadrado en el mismo sitio, y el
  // circulo, primero en la lista, se quedaba el clic: solo ensancha hacia la izquierda y hacia la derecha no se movia.
  // Ahi gana el cuadrado, que ensancha hacia la derecha; el circulo sigue donde asoma
  if (Math.abs(s.x - e.x) < SOLAPE) anclas.unshift(anclas.pop())
  renderer.append(vista.createLineAnchor({ points: anclas, defaultAnchorHoverCursor: PaneCursorType.VerticalResize, defaultAnchorDragCursor: PaneCursorType.VerticalResize }, 0))
}
