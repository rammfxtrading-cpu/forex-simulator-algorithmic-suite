/**
 * H04 (revision de Astra, 5-oct; bloque D, punto 8): UNA ACEPTACION VACIA NO APRUEBA
 *
 * Astra: fin() permitia 0 oraculos y nada exigia un inventario minimo: un
 * fichero de aceptacion vacio (o que pierde oraculos) aprobaba la tanda.
 * Ahora, en pruebas/aceptacion/ (y fase1/, historicas/): al menos un oraculo,
 * y en aceptacion/ al menos el minimo que declara su minimos.json; un fichero
 * sin minimo declarado tampoco vale. Codigo 2 (prueba invalida), no 0.
 * Se prueba con pruebas/fixtures/aceptacion/{vacia,una,dos}.mjs y su minimos.json.
 */
import { spawnSync } from 'node:child_process'
import { titulo, ver, fin, REPO } from './lib.mjs'
const corre = f => spawnSync(process.execPath, ['--import', './pruebas/sin-red.mjs', '--import', './pruebas/registro.mjs', `pruebas/fixtures/aceptacion/${f}.mjs`], { cwd: REPO, encoding: 'utf8', env: process.env })
titulo('H04 · recuento minimo de oraculos')
const v = corre('vacia'), u = corre('una'), d = corre('dos')
ver('una aceptacion sin oraculos sale con 2 (no vale), no con 0', v.status === 2, `codigo ${v.status} · ${(v.stdout.trim().split('\n').pop() ?? '')}`)
ver('una aceptacion por debajo de su minimo (1 de 2) sale con 2', u.status === 2, `codigo ${u.status} · ${(u.stdout.trim().split('\n').pop() ?? '')}`)
ver('control: la que llega a su minimo (2 de 2) sale con 0', d.status === 0, `codigo ${d.status} · ${(d.stdout.trim().split('\n').pop() ?? '')}`)
// CTO 10-oct (despliegue de mercado-diario, paso 2): una comprobacion que no puede correr porque su fichero
// falta A PROPOSITO se declara omitida, visible en la salida, y cuenta para el minimo; pero una prueba solo de
// omitidas no aprueba
const om = corre('omitida'), so = corre('solo-omitidas')
ver('una omitida cuenta para el minimo (1 oraculo + 1 omitida de 2) y sale con 0, diciendo «OMITIDA» y «1 omitidas»', om.status === 0 && /⚪ OMITIDA \[H04\] dos  · fichero ausente hasta el paso 7/.test(om.stdout) && /0 en rojo · 1 en verde · 0 controles rotos · 1 omitidas$/.test(om.stdout.trim().split('\n').pop() ?? ''), `codigo ${om.status} · ${(om.stdout.trim().split('\n').slice(-2).join(' / '))}`)
ver('una aceptacion SOLO con omitidas (ningun oraculo) sale con 2: no aprueba en vacio', so.status === 2, `codigo ${so.status} · ${(so.stdout.trim().split('\n').pop() ?? '')}`)
fin()
