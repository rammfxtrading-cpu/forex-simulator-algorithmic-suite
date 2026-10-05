// EL CORTE DE RED de las pruebas, en CommonJS para poder cargarlo de forma
// sincrona tambien dentro de un worker (H01, auditoria del arnes 4-oct-2026:
// en Node 25 el --import NO se aplica en los workers; la sonda del arnes lo
// demostro con un fetch real). Lo cargan: sin-red.mjs (hilo principal y del
// cargador) y, por el envoltorio de Worker de abajo, cada worker antes que su
// propio codigo.
// ⚠️ Capa JS. La barrera de verdad es la del sistema (pruebas/aislar.sh).
'use strict'
const net = require('node:net')
const tls = require('node:tls')
const http = require('node:http')
const https = require('node:https')
const http2 = require('node:http2')
const dgram = require('node:dgram')
const dns = require('node:dns')
const wt = require('node:worker_threads')
const { pathToFileURL } = require('node:url')
const { syncBuiltinESMExports } = require('node:module')

if (!globalThis.__sinRed) {
  const corta = (q) => () => { throw new Error('RED BLOQUEADA: ' + q) }
  globalThis.fetch = async (u) => { throw new Error('RED BLOQUEADA: fetch ' + u) }
  net.connect = net.createConnection = corta('net.connect')
  // un socket construido a mano tambien: solo se permiten sockets Unix (path)
  const conectaOriginal = net.Socket.prototype.connect
  net.Socket.prototype.connect = function (...args) {
    const o = args[0]
    const esUnix = (typeof o === 'string' && isNaN(Number(o))) || (o && typeof o === 'object' && typeof o.path === 'string')
    if (!esUnix) throw new Error('RED BLOQUEADA: net.Socket.connect')
    return conectaOriginal.apply(this, args)
  }
  tls.connect = corta('tls.connect')
  http.request = http.get = corta('http.request')
  https.request = https.get = corta('https.request')
  http2.connect = corta('http2.connect')
  dgram.createSocket = corta('dgram.createSocket')
  for (const k of ['lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCname', 'resolveMx', 'resolveNs', 'resolveTxt', 'resolveSrv', 'reverse']) {
    if (typeof dns[k] === 'function') dns[k] = corta('dns.' + k)
    if (dns.promises && typeof dns.promises[k] === 'function') dns.promises[k] = corta('dns.promises.' + k)
  }
  // cada worker carga este fichero ANTES que su codigo (y asi sus workers)
  const Original = wt.Worker
  const precarga = `require(${JSON.stringify(__filename)});\n`
  class WorkerSinRed extends Original {
    constructor(src, opts = {}) {
      if (opts.eval) super(precarga + src, opts)
      else {
        const href = src instanceof URL ? src.href : (/^(file|data):/.test(String(src)) ? String(src) : pathToFileURL(String(src)).href)
        super(precarga + `import(${JSON.stringify(href)});`, { ...opts, eval: true })
      }
    }
  }
  wt.Worker = WorkerSinRed
  globalThis.__fetchBloqueado = globalThis.fetch
  globalThis.__sinRed = true
  // que `import { connect } from 'node:net'` vea tambien la version cortada
  syncBuiltinESMExports()
}
