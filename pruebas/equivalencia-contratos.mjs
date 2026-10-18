/**
 * MCV2-01 (Astra 15-oct, bajo; decision del CTO del 15-oct): el instrumento de equivalencia
 * (pruebas/medidas/equivalencia.mjs) con DOS contratos separados. Escrito ANTES que el codigo
 * (contra 79f39a2: en rojo).
 *
 *   · «optimizacion»: el motor de la copia de trabajo contra el de 4235196 (el ultimo sin
 *     optimizar) con la MISMA politica de ambiguedad: a la referencia se le aplican los cambios
 *     funcionales posteriores del motor que no son la optimizacion (MCV-01 36794dd y E3-02
 *     e58536d). Antes se mezclaba el arreglo de MCV-01 con la referencia que aun tenia el fallo
 *     (164/200, un rojo ambiguo);
 *   · «mcv01»: la regresion de MCV-01 contra 63be57d (antes del campo conversion del evento
 *     cierre): identico quitando SOLO ese campo, en los tipos que 63be57d conoce (practica, FTMO);
 *   · una excepcion en un escenario es ROJO, nunca igualdad (antes, dos errores iguales contaban
 *     como identicos).
 * Corre el instrumento como lo correria cualquiera (un proceso aparte) y juzga su codigo de salida
 * y su informe.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
const corre = (...args) => {
  const r = spawnSync(process.execPath, ['--import', './pruebas/sin-red.mjs', '--import', './pruebas/registro.mjs', path.join('pruebas', 'medidas', 'equivalencia.mjs'), ...args],
    { cwd: REPO, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, TZ: process.env.TZ ?? 'Europe/Madrid' }, timeout: 280000 })
  return { codigo: r.status, salida: (r.stdout || '') + (r.stderr || '') }
}
const linea = (salida, contrato) => salida.split('\n').find(l => l.startsWith(`contrato ${contrato} `)) ?? ''
const num = (l, clave) => Number(new RegExp(`${clave} (\\d+)`).exec(l)?.[1] ?? NaN)

titulo('los dos contratos, 200 escenarios')
const a = corre('200')
const opt = linea(a.salida, 'optimizacion'), mcv = linea(a.salida, 'mcv01')
console.log('  ' + opt + '\n  ' + mcv)
oraculo('MCV2', 'contrato «optimizacion» (4235196 + MCV-01 + E3-02 + el rechazo 5b348cd, la misma politica de ambiguedad): 200 de 200 identicos, 0 excepciones', num(opt, 'identicos') === 200 && num(opt, 'escenarios') === 200 && num(opt, 'excepciones') === 0 && opt.includes('referencia 4235196 + 36794dd + e58536d + 5b348cd ·'), opt || a.salida.slice(0, 300))
oraculo('MCV2', 'contrato «mcv01» (63be57d + el rechazo 5b348cd, quitando solo conversion): todos los escenarios de practica y FTMO identicos, 0 excepciones', num(mcv, 'escenarios') > 50 && num(mcv, 'identicos') === num(mcv, 'escenarios') && num(mcv, 'excepciones') === 0 && mcv.includes('referencia 63be57d + 5b348cd (sin conversion) ·'), mcv || '(sin linea del contrato)')
oraculo('MCV2', 'los dos contratos con eventos de verdad (cierres y breaches), y el instrumento sale con 0', num(opt, 'cierres') > 100 && num(opt, 'breaches') > 10 && num(mcv, 'cierres') > 50 && a.codigo === 0, `codigo ${a.codigo}`)

titulo('el rechazo 5b348cd va en las referencias como parche, nunca traduciendo codigos (CTO 16-oct)')
const fuente = readFileSync(path.join(REPO, 'pruebas', 'medidas', 'equivalencia.mjs'), 'utf8')
oraculo('MCV2', 'el instrumento no nombra ningun codigo de rechazo (ni viejo ni nuevo): no hay traduccion posible, solo el parche', !/sesion_en_breach|reto_terminado|sesion_terminada|objetivo_alcanzado/.test(fuente.replace(/^\s*(\/\/|\*).*$/gm, '')), (fuente.match(/.*(sesion_en_breach|reto_terminado|sesion_terminada|objetivo_alcanzado).*/g) ?? []).filter(l => !/^\s*(\/\/|\*)/.test(l)).join(' | ') || '-')
const sr = corre('200', '--sin-rechazo')
const sro = linea(sr.salida, 'optimizacion'), srm = linea(sr.salida, 'mcv01')
ver('control: sin 5b348cd en las referencias, los dos contratos ven diferencias (los comandos sobre una sesion terminada) y el instrumento sale con 1', sr.codigo === 1 && num(sro, 'identicos') < 200 && num(srm, 'identicos') < num(srm, 'escenarios') && num(sro, 'excepciones') === 0 && num(srm, 'excepciones') === 0, `${sro} || ${srm}`)

titulo('una excepcion es rojo, nunca igualdad')
const e = corre('5', '--control-excepcion')
const eo = linea(e.salida, 'optimizacion')
oraculo('MCV2', 'con una excepcion plantada en el escenario 0 de las DOS versiones: el escenario es rojo (no identico), se cuenta y el instrumento sale con 1', e.codigo === 1 && num(eo, 'excepciones') >= 1 && num(eo, 'identicos') === 4 && /excepcion/.test(e.salida), eo || e.salida.slice(0, 300))

titulo('control: la referencia sin los cambios funcionales mezcla MCV-01 (el rojo ambiguo de Astra)')
const s = corre('200', '--contrato', 'optimizacion', '--sin-parches')
const so = linea(s.salida, 'optimizacion')
ver('control: sin aplicar MCV-01 a la referencia salen diferencias (las de MCV-01, no de la optimizacion) y el instrumento sale con 1', s.codigo === 1 && num(so, 'identicos') < 200 && num(so, 'excepciones') === 0, so || s.salida.slice(0, 300))
const c = corre('200', '--contrato', 'mcv01', '--copia', 'a8e40a4')
const co = linea(c.salida, 'mcv01')
ver('control: el contrato mcv01 ve el fallo de MCV-01 (con el motor de a8e40a4, que aun lo tiene, salen diferencias y el instrumento sale con 1)', c.codigo === 1 && num(co, 'identicos') < num(co, 'escenarios') && num(co, 'excepciones') === 0, co || c.salida.slice(0, 300))
fin()
