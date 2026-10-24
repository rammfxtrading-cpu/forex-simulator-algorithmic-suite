/**
 * REGRESION DE LA ETAPA 1 CON v1 APAGADO (CTO, 16-oct). Mientras v1 este apagado, ninguna accion de hoy
 * de los alumnos (crear, operar, borrar una sesion legado, dashboard o analytics) puede cambiar de
 * comportamiento ni de texto: con SIM_V1_ENDPOINTS ausente, todos los flujos de la etapa 1 funcionan como
 * en produccion.
 *
 * Como: la prueba de la etapa 1 TAL COMO ESTA EN PRODUCCION (pruebas/etapa1-cliente.mjs de PRODUCCION,
 * fijado abajo) se corre contra el codigo de esta rama, sin SIM_V1_ENDPOINTS. Tiene que salir todo en
 * verde salvo, como mucho, API-503, y ese solo puede diferir en el motivo del cuerpo de los /api/sim/*
 * («apagado» en vez de «mantenimiento»), que ningun alumno ve: el dashboard decide el texto por el
 * codigo 503 (lib/sim/respuestas.js), y B-legado-503 (el texto que ve quien borra una sesion legado)
 * tiene que salir en verde, como en produccion.
 */
import { spawnSync } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
const PRODUCCION = '4fc0e17'   // main desplegado (etapa 1 en produccion); etapa1-cliente.mjs igual desde 2983be3
const tmp = path.join(REPO, 'pruebas', '.regresion-etapa1-produccion.mjs')   // en pruebas/ por sus imports relativos; el punto la deja fuera de la tanda
writeFileSync(tmp, execFileSync('git', ['-C', REPO, 'show', `${PRODUCCION}:pruebas/etapa1-cliente.mjs`]))
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TZ: process.env.TZ ?? 'Europe/Madrid' }
let r
try {
  r = spawnSync(process.execPath, ['--import', './pruebas/sin-red.mjs', '--import', './pruebas/registro.mjs', tmp], { cwd: REPO, encoding: 'utf8', env, timeout: 280000 })
} finally { rmSync(tmp, { force: true }) }
const salida = (r.stdout || '') + (r.stderr || '')
const lineas = salida.split('\n')
const rojos = lineas.filter(l => l.includes('🔴 ROJO'))
const verdes = lineas.filter(l => l.includes('🟢 VERDE'))
const ids = ls => ls.map(l => /\[([^\]]+)\]/.exec(l)?.[1])

titulo(`la prueba de la etapa 1 de produccion (${PRODUCCION}) contra esta rama, sin SIM_V1_ENDPOINTS`)
ver('control: el entorno de la prueba no tiene SIM_V1_ENDPOINTS', !('SIM_V1_ENDPOINTS' in env))
ver(`control: la prueba de produccion ha corrido entera (${verdes.length + rojos.length} oraculos, con su recuento final)`, verdes.length + rojos.length > 40 && /\d+ en rojo · \d+ en verde/.test(salida), `${verdes.length} verdes y ${rojos.length} rojos en la hija · codigo ${r.status}`)
// orden 1-117: la llamada a sim_cierre_v0 va con plazo (conPlazo(supabase.rpc(...))), asi que el mutante MUT-cola de la
// prueba de produccion ya no encuentra su texto de anclaje. No es un flujo que cambie: es el texto del mutante. El mismo
// mutante, con el anclaje nuevo, sigue en pruebas/etapa1-cliente.mjs de esta rama (y tiene que salir en verde alli)
const anclaje = l => l.includes('[MUT-cola]') && l.includes('el texto a cambiar existe')
oraculo('REG1', 'todos los flujos de la etapa 1 como en produccion: el unico oraculo que cambia es, como mucho, API-503 (y el anclaje del mutante MUT-cola, orden 1-117)', rojos.every(l => l.includes('[API-503]') || anclaje(l)), ids(rojos).join(', ') || '-')
const api = rojos.find(l => l.includes('[API-503]'))
const rutas = api ? api.split('  · ')[1]?.split(' | ') ?? [] : []
oraculo('REG1', 'API-503 solo difiere en el motivo del cuerpo: las 5 rutas siguen en 503, sin tocar la base ni la autenticacion, con motivo «apagado»', !api || (rutas.length === 5 && rutas.every(x => /: 503 \{"ok":false,"http":503,"motivo":"apagado"\} \/ 503 · 0 ops$/.test(x))), rutas.join(' | ') || '-')
const textos = ['B-legado-503', 'D6-respuestas', 'D-lapida-dashboard', 'D-etiqueta-legado', 'D-lapida-analytics']
oraculo('REG1', `lo que ve el alumno, en verde como en produccion: ${textos.join(', ')} (borrar legado dice lo mismo que hoy)`, textos.every(t => verdes.some(l => l.includes(`[${t}]`))), textos.filter(t => !verdes.some(l => l.includes(`[${t}]`))).join(', ') || '-')
fin()
