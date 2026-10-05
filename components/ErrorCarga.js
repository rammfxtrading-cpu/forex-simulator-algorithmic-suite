// Pantalla de error de carga (auditoria C04, 4-oct-2026): cuando algo no se ha
// podido leer, se dice y se ofrece reintentar, en vez de enseñar ceros, «sin
// sesiones», «sin acceso» o un cargador infinito.
export default function ErrorCarga({ mensaje, enlace = null }) {
  return (
    <div role="alert" style={{ minHeight: '100vh', background: '#000', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', fontFamily: 'Montserrat,sans-serif' }}>
      <div style={{ fontSize: 15, maxWidth: 520, lineHeight: 1.5 }}>{mensaje}</div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => window.location.reload()} style={{ background: '#2d7ef7', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Reintentar</button>
        {enlace && <a href={enlace.href} style={{ color: '#9ec5ff', alignSelf: 'center', fontSize: 14 }}>{enlace.texto}</a>}
      </div>
    </div>
  )
}
