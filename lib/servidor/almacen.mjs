// lib/servidor/almacen.mjs — el almacen del bucket PRIVADO «mercado» para los
// endpoints (etapa 3; diseño sim-004 e.2, p.8): SOLO LECTURA, con el cliente
// service_role del endpoint (no pasa por la RLS de storage.objects). Es el puerto
// de lib/mercado/publica-v1.mjs (lee → Buffer | null); sube y borra no existen.
// BF-02: un error ajeno sale propio, con solo «clase codigo».
import { BUCKET } from '../mercado/publica-v1.mjs'
import { noExiste } from '../mercado/ficheros.mjs'
import { errorPropio, texto } from '../mercado/errores.mjs'

export function almacenMercado(sb) {
  const b = () => sb.storage.from(BUCKET)
  return {
    async lee(ruta) {
      let r
      try { r = await b().download(ruta) } catch (e) { throw errorPropio(`leer ${ruta}: ${texto(e)}`) }
      if (r.error) { if (noExiste(r.error)) return null; throw errorPropio(`leer ${ruta}: ${texto(r.error)}`) }
      try { return Buffer.from(await r.data.arrayBuffer()) } catch (e) { throw errorPropio(`leer ${ruta}: ${texto(e)}`) }
    },
  }
}
