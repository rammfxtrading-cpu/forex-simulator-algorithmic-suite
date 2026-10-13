// Version del cliente de la etapa 1 (diseño sim-004, k.1 b y o.5). Un entero:
// la cabecera x-sim-cliente es etapa1-<VERSION_CLIENTE> y se compara, como
// entero, con sim_servicio.version_minima. Subirla obliga a recargar a las
// pestañas viejas cuando el dueño sube version_minima (o.6).
export const VERSION_CLIENTE = 1
export const CABECERA_CLIENTE = `etapa1-${VERSION_CLIENTE}`
