/**
 * S02 · useAuth PUEDE QUEDARSE CON EL USUARIO A Y EL PERFIL B, O CON DATOS TRAS CERRAR SESION
 *
 * Astra (4-oct): useAuth fija `user` una vez (lib/useAuth.js:37) y la
 * revalidacion solo refresca `profile` con la sesion que haya EN ESE MOMENTO
 * (:62-72); no escucha onAuthStateChange. Si la cookie compartida cambia a B
 * (login en el hub u otra pestaña), queda user A + perfil B; si se cierra
 * sesion, A y B siguen en pantalla.
 *
 * Se ejecuta: useAuth REAL (sonda de hooks, React falso) con el Supabase falso;
 * la cookie compartida se cambia como la cambiaria el hub (sin evento en esta
 * pestaña) y se dispara visibilitychange, que es lo que hace revalidar.
 *
 * ORACULOS: en todo momento user.id === profile.id; sin sesion, ni user ni
 * profile (o se sale a /).
 */
import { titulo, ver, oraculo, fin, escenario, importa, sonda, db, nav, A, B, tok, asienta, router } from '../lib.mjs'
import { emiteAuth } from '../supabase-falso.mjs'
const { useAuth } = await importa('lib/useAuth.js')
const sesionDe = id => ({ user: { id, email: id.slice(0, 1) + '@ejemplo.test' }, access_token: tok(id) })
const vista = c => ({ user: c.valor.user?.id?.slice(0, 1) ?? null, profile: c.valor.profile?.id?.slice(0, 1) ?? null, acceso: c.valor.hasAccess })

titulo('1 · entra A')
escenario()
const c = sonda(() => useAuth('simulador_activo'))
await asienta(60)
ver('control: user A, perfil A, con acceso', vista(c).user === 'a' && vista(c).profile === 'a' && vista(c).acceso === true, JSON.stringify(vista(c)))

titulo('2 · el hub cambia la cookie compartida a B y la pestaña vuelve a primer plano')
db.sesion = sesionDe(B)
nav.dispara('visibilitychange'); await asienta(60)
ver('control: la revalidacion leyo el perfil de B', db.log.filter(l => l.tabla === 'profiles').length >= 2 && vista(c).profile === 'b', JSON.stringify(vista(c)))
oraculo('S02', 'user y perfil son de la misma persona', vista(c).user === vista(c).profile, JSON.stringify(vista(c)))

titulo('3 · se cierra la sesion en el hub')
db.sesion = null
nav.dispara('visibilitychange'); await asienta(60)
const navego = router.navegado.some(([, u]) => u === '/')
oraculo('S02', 'sin sesion, no queda ni user ni perfil (o se sale a /)', (vista(c).user === null && vista(c).profile === null) || navego, `${JSON.stringify(vista(c))}; navego a /: ${navego}`)

titulo('4 · SIGNED_OUT en esta misma pestaña')
escenario()
const d = sonda(() => useAuth('simulador_activo'))
await asienta(60)
emiteAuth('SIGNED_OUT', null); await asienta(60)
ver('control: el evento se emitio y la sesion ya no esta', db.sesion === null)
oraculo('S02', 'tras SIGNED_OUT no quedan datos de A', (vista(d).user === null && vista(d).profile === null) || router.navegado.some(([, u]) => u === '/'), JSON.stringify(vista(d)))
fin()
