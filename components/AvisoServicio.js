// Avisos y bloqueos del cliente de la etapa 1 (diseño sim-004, o.5–o.7):
//   mantenimiento  pantalla de mantenimiento encima de todo
//   version        sin posiciones ni ordenes abiertas → recarga sola; con alguna,
//                  aviso fijo con boton «Recargar ya» (o.6)
//   sin_estado     aviso fijo (solo si la lectura FALLO, no mientras carga)
//   incierto       aviso fijo: no se sabe si el ultimo cierre se guardo
// Y la lista de avisos de lib/sim/avisos.js, con boton para quitarlos.
import { useEffect, useState } from 'react'
import { TEXTO_BLOQUEO, recarga } from '../lib/sim/servicio'
import { avisos, quitaAviso, suscribeAvisos } from '../lib/sim/avisos'

// Una recarga por version, como mucho, cada 60 s: si el despliegue aun sirve el
// cliente viejo, no se entra en un bucle de recargas (se queda el aviso fijo).
function recargaPorVersion() {
  try {
    const ss = globalThis.sessionStorage
    const ultima = Number(ss?.getItem('simRecargaVersion') || 0)
    if (Date.now() - ultima < 60000) return false
    ss?.setItem('simRecargaVersion', String(Date.now()))
  } catch {}
  recarga()
  return true
}

const caja = { position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 10000, maxWidth: 560, width: 'calc(100% - 32px)',
  padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.4, fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }
const fijo = { ...caja, top: 12, background: '#3a2a00', color: '#ffd27a', border: '1px solid #8a6a1a' }
const boton = { marginLeft: 10, padding: '3px 10px', borderRadius: 4, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12 }

export default function AvisoServicio({ estado, hayAbiertas = () => false }) {
  const [lista, setLista] = useState(avisos())
  const [sinRecarga, setSinRecarga] = useState(false)
  useEffect(() => suscribeAvisos(setLista), [])
  const motivo = estado?.motivo ?? null
  useEffect(() => {
    if (motivo === 'version' && !hayAbiertas()) { if (!recargaPorVersion()) setSinRecarga(true) }
  }, [motivo])
  return (
    <>
      {motivo === 'mantenimiento' && (
        <div data-aviso="mantenimiento" style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(6,10,18,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 480, textAlign: 'center', color: '#e8eefc', fontSize: 15, lineHeight: 1.5 }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Simulador en mantenimiento</div>
            {TEXTO_BLOQUEO.mantenimiento}
          </div>
        </div>
      )}
      {motivo === 'version' && (hayAbiertas() || sinRecarga) && (
        <div data-aviso="version" style={fijo}>{TEXTO_BLOQUEO.version}
          <button style={boton} onClick={() => recarga()}>Recargar ya</button>
        </div>
      )}
      {motivo === 'sin_estado' && estado?.falloLectura && <div data-aviso="sin_estado" style={fijo}>{TEXTO_BLOQUEO.sin_estado}</div>}
      {motivo === 'incierto' && (
        <div data-aviso="incierto" style={fijo}>{TEXTO_BLOQUEO.incierto}
          <button style={boton} onClick={() => recarga()}>Recargar</button>
        </div>
      )}
      {lista.length > 0 && (
        <div style={{ ...caja, top: 'auto', bottom: 16, background: '#3a0f12', color: '#ffb4b4', border: '1px solid #8a2a30' }}>
          {lista.map(a => (
            <div key={a.id} data-aviso="aviso" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>{a.texto}</span>
              <button style={boton} onClick={() => quitaAviso(a.id)}>×</button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
