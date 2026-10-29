// El rectangulo con Shift en una esquina, como TradingView (orden 1-164, punto 9; pedido de Ramon). El plugin
// (lightweight-charts-line-tools-rectangle) bloqueaba con Shift la Y de la esquina («Y-Axis Lock»): solo ensanchaba.
// Ahora, arrastrando una esquina (tiradores 0-3) con Shift, la esquina opuesta queda fija y el rectangulo sale CUADRADO
// en pixeles de pantalla: lado = el mayor de |dx| y |dy| (desde la esquina opuesta hasta la mano), con los signos del
// arrastre. La conversion pixeles -> hora/precio la hace el core con las escalas del grafico (screenPointToLineToolPoint).
// La hora va a velas (el core redondea el indice logico a la vela mas cercana): el ancho solo puede ser un numero entero
// de velas. Para que ancho = alto en pantalla, el lado se lleva a la vela mas cercana (ida y vuelta por las mismas
// conversiones de la herramienta) y el alto toma ese mismo lado; el precio es continuo.
// Solo ese gesto: sin Shift, los bordes (4-7), el cuerpo y la creacion siguen como en el plugin.
// El core llama a getShiftConstrainedPoint SOLO con Shift pulsado (InteractionManager, _isShiftKeyDown, que desde la
// orden 1-142 copia el e.shiftKey de cada evento del raton); en la edicion usa el punto devuelto e ignora snapAxis.
// Que esquina queda fija sale de setPoint del plugin: 0 mueve el punto 0 (fija el 1) y 1 al reves; 2 mueve la hora del
// punto 0 y el precio del 1 (fija hora del 1 y precio del 0); 3 mueve el precio del 0 y la hora del 1 (fija el resto).
// InteractionPhase y Point llegan del core que ya carga useDrawingTools (el de vendor/, por el alias de next.config.js)

export function claseRectangulo(Base, { InteractionPhase, Point }) {
  return class RectanguloTradingView extends Base {
    getShiftConstrainedPoint(pointIndex, rawScreenPoint, phase, originalLogicalPoint, all) {
      const esquina = pointIndex >= 0 && pointIndex <= 3
      const [a, b] = all || []
      if (phase !== InteractionPhase.Editing || !esquina || !a || !b || !rawScreenPoint) {
        return super.getShiftConstrainedPoint(pointIndex, rawScreenPoint, phase, originalLogicalPoint, all)
      }
      const fija = pointIndex === 0 ? b
        : pointIndex === 1 ? a
        : pointIndex === 2 ? { timestamp: b.timestamp, price: a.price }
        : { timestamp: a.timestamp, price: b.price }
      const o = this.pointToScreenPoint(fija)
      const antes = this.pointToScreenPoint(originalLogicalPoint)
      if (!o) return super.getShiftConstrainedPoint(pointIndex, rawScreenPoint, phase, originalLogicalPoint, all)
      const dx = rawScreenPoint.x - o.x, dy = rawScreenPoint.y - o.y
      const lado = Math.max(Math.abs(dx), Math.abs(dy))
      // con la mano justo en la linea de la esquina fija, el signo de donde estaba la esquina (no se aplasta a cero)
      const sx = Math.sign(dx) || Math.sign((antes?.x ?? o.x + 1) - o.x) || 1
      const sy = Math.sign(dy) || Math.sign((antes?.y ?? o.y + 1) - o.y) || 1
      // el borde vertical, en la vela mas cercana: el x que pintara el plugin tras convertir a hora
      const q = this.screenPointToPoint(new Point(o.x + sx * lado, o.y))
      const enVela = q ? this.pointToScreenPoint(q) : null
      const ladoX = enVela && Math.abs(enVela.x - o.x) > 0 ? Math.abs(enVela.x - o.x) : lado
      return { point: new Point(o.x + sx * ladoX, o.y + sy * ladoX), snapAxis: 'none' }
    }
  }
}
