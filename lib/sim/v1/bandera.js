// EL ENCENDIDO DE LA PANTALLA V1 (etapa 2 del motor, pieza 6; orden 1-125 del CTO). Dos llaves:
//   · en el servidor, SIM_V1_ENDPOINTS=encendido (lib/servidor/http.mjs): sin ella, /api/sim/* responde 503 apagado;
//   · en el navegador, NEXT_PUBLIC_SIM_V1_PANTALLA=encendido. Next la copia en el codigo AL CONSTRUIR (como
//     NEXT_PUBLIC_COBERTURA_ESTRICTA): cambiarla en Vercel exige un despliegue nuevo. Por eso va escrita literal, sin
//     pasar process.env por una variable. Ausente o cualquier otro valor: apagada.
// Modo v1 = la bandera de cliente + una sesion v1 (motor_version === 1). Apagada, la pantalla es la de hoy, tambien con
// una sesion v1 (que hoy no crea ninguna pantalla).
export const pantallaV1 = () => String(process.env.NEXT_PUBLIC_SIM_V1_PANTALLA ?? '').trim() === 'encendido'
export const esSesionV1 = s => s?.motor_version === 1
export const modoV1 = s => pantallaV1() && esSesionV1(s)
