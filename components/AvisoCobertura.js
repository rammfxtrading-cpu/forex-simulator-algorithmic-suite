// Aviso de cobertura del par activo (bloque D, punto 4; G5; D1): «datos
// hasta…» y los dias incompletos de la sesion. Ramon (produccion, bd0d0aa):
// quedaba fijo y no se podia cerrar. CTO, 6-oct-2026: se muestra 10 s al
// cargar el par y se desvanece solo, sin dejar indicador, marca ni icono.
// Vuelve a salir cada vez que cambia el estado del par que se pinta: una carga
// nueva (usePairData crea un estado nuevo en cada carga) u otro par activo.
// No recibe el raton: no tapa controles. Que dias nombra lo decide
// lib/sessionData.js; aqui solo cuanto tiempo se ve.
import { useEffect, useState } from 'react'

export const AVISO_MS = 10000
const DESVANECE_MS = 600

export default function AvisoCobertura({ estadoPar }) {
  const texto = estadoPar?.avisoDatos || ''
  const [fase, setFase] = useState(texto ? 'visible' : 'oculto')   // visible | saliendo | oculto
  useEffect(() => {
    if (!texto) { setFase('oculto'); return }
    setFase('visible')
    const sale = setTimeout(() => setFase('saliendo'), AVISO_MS - DESVANECE_MS)
    const fin = setTimeout(() => setFase('oculto'), AVISO_MS)
    return () => { clearTimeout(sale); clearTimeout(fin) }
  }, [estadoPar, texto])
  if (!texto || fase === 'oculto') return null
  return (
    <div role="status" style={{position:'absolute',top:8,left:'50%',transform:'translateX(-50%)',zIndex:30,
      background:'rgba(4,10,24,0.85)',border:'1px solid rgba(45,126,247,0.45)',borderRadius:6,padding:'4px 10px',
      color:'#cfe0ff',fontSize:12,fontFamily:"'Montserrat',sans-serif",pointerEvents:'none',maxWidth:'calc(100% - 32px)',textAlign:'center',
      opacity:fase === 'saliendo' ? 0 : 1,transition:`opacity ${DESVANECE_MS}ms ease`}}>
      {texto}
    </div>
  )
}
