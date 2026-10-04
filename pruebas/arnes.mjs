/**
 * EL ARNES SE COMPRUEBA ANTES QUE NADA: si el arnes miente, todo lo demas tambien.
 *
 *   1. la red esta cortada (fetch, https, net, dns) y no hay secretos en el entorno
 *   2. lo que el repo importa como Supabase es el doble (navegador y servidor),
 *      y el proveedor de velas que importa /api/candles es el falso
 *   3. el doble de Supabase es PEREZOSO como PostgREST: un builder sin then no
 *      ejecuta nada (D01 depende de esto); control positivo: con then, si
 *   4. el doble de Storage guarda y devuelve contenido; los errores se devuelven
 */
import https from 'node:https'
import net from 'node:net'
import { titulo, ver, fin, importa, escenario, db, proveedor, A, tok } from './lib.mjs'
import { llama } from './supabase-falso.mjs'
import { diaM1 } from './proveedor-falso.mjs'

titulo('1 · sin red y sin secretos')
let corte = ''
try { await fetch('https://example.com/') } catch (e) { corte = e.message }
ver('fetch a internet lanza RED BLOQUEADA', /RED BLOQUEADA/.test(corte), corte)
let h = ''; try { https.request('https://example.com') } catch (e) { h = e.message }
ver('https.request bloqueado', /RED BLOQUEADA/.test(h))
let nn = ''; try { net.connect(443, 'example.com') } catch (e) { nn = e.message }
ver('net.connect bloqueado', /RED BLOQUEADA/.test(nn))
ver('ninguna variable de Supabase en el entorno', !Object.keys(process.env).some(k => /SUPABASE|DIAG_CREDS/.test(k)), Object.keys(process.env).join(','))

titulo('2 · los dobles son los que se cargan')
escenario()
const { supabase } = await importa('lib/supabase.js')
const q = supabase.from('sim_sessions')
ver('lib/supabase.js usa el doble (navegador)', typeof q.ejecuta === 'function')
const authApi = await importa('lib/authApi.js')
ver('lib/authApi.js usa el doble (servidor)', typeof authApi.supabaseAdmin.from('x').ejecuta === 'function')
const candles = (await importa('pages/api/candles.js')).default
proveedor.responde = () => diaM1('2025-01-06')     // un lunes completo: sin reintentos
const r = await llama(candles, { method: 'GET', token: tok(A), query: { pair: 'EURUSD', timeframe: 'M1', from: '1736121600', year: '2025' } })
ver('/api/candles llama al proveedor FALSO', proveedor.llamadas.length >= 1 && proveedor.llamadas[0].instrumento === 'eurusd', `${proveedor.llamadas.length} llamadas · estado ${r.estado}`)

titulo('3 · el doble es perezoso como PostgREST')
escenario()
const antes = db.log.length
supabase.from('sim_sessions').update({ balance: 1 }).eq('id', 'x')     // sin then
await new Promise(r => setTimeout(r, 20))
ver('un builder sin then no ejecuta nada', db.log.length === antes, `${db.log.length - antes} operaciones`)
await supabase.from('sim_sessions').update({ balance: 1 }).eq('id', 'x')
ver('control positivo: con await, si', db.log.length === antes + 1 && db.log.at(-1).op === 'update')

titulo('4 · Storage con contenido')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2025.json': '[1,2,3]' } } })
const st = authApi.supabaseAdmin.storage.from('forex-data')
const d = await st.download('EURUSD/M1/2025.json')
ver('download devuelve el contenido', JSON.parse(await d.data.text()).length === 3)
const no = await st.download('EURUSD/M1/2024.json')
ver('un objeto que no esta: error devuelto, no lanzado', no.data === null && /not found/i.test(no.error?.message))
db.falla = c => c.op === 'upload' ? { message: 'Payload too large', statusCode: '413' } : null
const up = await st.upload('EURUSD/M1/2025.json', new Blob(['[]']), { upsert: true })
ver('un upload fallido devuelve { error } y no pisa', up.error?.statusCode === '413' && db.storage['forex-data']['EURUSD/M1/2025.json'] === '[1,2,3]')
fin()
