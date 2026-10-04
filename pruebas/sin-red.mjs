// Corta toda salida de red del proceso. Se carga con --import antes que nada.
// ⛔ Las pruebas del simulador no hablan con nadie: ni Supabase, ni Dukascopy, ni
//    nada. `pruebas/arnes.mjs` comprueba que el corte funciona.
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'

const corta = (q) => () => { throw new Error('RED BLOQUEADA: ' + q) }
globalThis.fetch = async (u) => { throw new Error('RED BLOQUEADA: fetch ' + u) }
net.connect = net.createConnection = corta('net.connect')
http.request = http.get = corta('http.request')
https.request = https.get = corta('https.request')
dns.lookup = corta('dns.lookup')
globalThis.__fetchBloqueado = globalThis.fetch
