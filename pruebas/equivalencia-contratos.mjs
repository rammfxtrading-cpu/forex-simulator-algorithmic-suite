/**
 * MCV2-01 (Astra 15-oct; CTO 15-oct) y ORDEN 1-127 (CTO 26-oct): el instrumento de equivalencia del motor
 * (pruebas/medidas/equivalencia.mjs) con dos contratos, cada uno con su referencia CONSTRUIDA desde commits
 * aprobados. Corre el instrumento como lo correria cualquiera (un proceso aparte) y juzga su codigo de salida
 * y su informe.
 *
 * CONTRATO (orden 1-127). La prueba compara, byte a byte y tras cada paso (estado serializado y eventos),
 * el motor de la copia de trabajo con dos referencias, en 200 escenarios aleatorios de semilla fija
 * (practica, FTMO, 1F y 3F; 1 a 9 pares con cruces; SL/TP, pendientes, parciales, avances y breaches).
 * Cada contrato aisla UN cambio del motor: su referencia es lib/motor del commit base con TODOS los commits
 * aprobados posteriores que tocan lib/motor aplicados encima, en orden y a tres bandas (git merge-file; un
 * conflicto es error), menos el cambio que examina. «optimizacion»: base 4235196 + 36794dd (MCV-01),
 * e58536d (E3-02), ee766b8 (detencion), 5b348cd (sesion_terminada), f252152 (causa), ed36936 (la regla de
 * la vela) y f67facd (motor@3/recorrido@2 y ajuste al tick, orden 1-119): la copia de trabajo sin la
 * optimizacion a8e40a4; 200 de 200 identicos. «mcv01»: base 63be57d + 4235196, e58536d, ee766b8, 5b348cd,
 * f252152, ed36936 y f67facd: la copia de trabajo sin el campo conversion (7d4939e), sin su arreglo MCV-01
 * (36794dd) y sin la optimizacion; 200 de 200 identicos quitando SOLO el campo conversion de los eventos. El
 * instrumento comprueba que la cadena declarada mas lo que se deja fuera es exactamente la historia de
 * lib/motor (`git log --no-merges`) y para si aparece un commit de motor sin declarar. Por que: las
 * referencias de antes eran la base con unos parches sueltos, no llevaban la regla de la vela de la 1-119 y
 * dieron rojo sin fallo del motor; construidas desde la cadena completa no se quedan atras sin avisar, y lo
 * unico que difiere es lo que se mide. Controles que tienen que salir en ROJO: dos mutantes conocidos de la
 * copia de trabajo (el motor sin la regla de la vela; la firma de ambiguedad con el minuto y la fase de la
 * conversion, el fallo MCV-01), la referencia sin la regla de la 1-119 (la vieja), la de «optimizacion» sin
 * MCV-01, un commit de motor sin declarar y una excepcion plantada (una excepcion es rojo, nunca igualdad).
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
const linea = (salida, contrato) => salida.split('\n').find(l => l.startsWith(`contrato ${contrato} · referencia`)) ?? ''
const num = (l, clave) => Number(new RegExp(`${clave} (\\d+)`).exec(l)?.[1] ?? NaN)
const OPT = 'referencia 4235196 + 36794dd + e58536d + ee766b8 + 5b348cd + f252152 + ed36936 + f67facd · copia de trabajo ·'
const MCV = 'referencia 63be57d + 4235196 + e58536d + ee766b8 + 5b348cd + f252152 + ed36936 + f67facd (sin conversion) · copia de trabajo ·'
const rojo = (l, total = 200) => num(l, 'identicos') < total && num(l, 'escenarios') === total && num(l, 'excepciones') === 0

titulo('los dos contratos, 200 escenarios, con las referencias construidas desde la cadena aprobada (orden 1-127)')
const a = corre('200')
const opt = linea(a.salida, 'optimizacion'), mcv = linea(a.salida, 'mcv01')
console.log('  ' + opt + '\n  ' + mcv)
oraculo('EQ127', 'contrato «optimizacion» (4235196 + la cadena aprobada con la regla de la vela, sin a8e40a4): 200 de 200 identicos, 0 excepciones', num(opt, 'identicos') === 200 && num(opt, 'escenarios') === 200 && num(opt, 'excepciones') === 0 && opt.includes(OPT), opt || a.salida.slice(0, 300))
oraculo('EQ127', 'contrato «mcv01» (63be57d + la cadena aprobada con la regla de la vela, sin 7d4939e, 36794dd ni a8e40a4; quitando solo conversion): 200 de 200 identicos (ahora tambien 1F y 3F), 0 excepciones', num(mcv, 'identicos') === 200 && num(mcv, 'escenarios') === 200 && num(mcv, 'excepciones') === 0 && mcv.includes(MCV), mcv || '(sin linea del contrato)')
oraculo('EQ127', 'los dos contratos con eventos de verdad (cierres y breaches), la cadena declarada es la historia de lib/motor y el instrumento sale con 0', num(opt, 'cierres') > 100 && num(opt, 'breaches') > 10 && num(mcv, 'cierres') > 100 && !/no es la historia/.test(a.salida) && a.codigo === 0, `codigo ${a.codigo}`)

titulo('el rechazo 5b348cd va en la cadena, nunca traduciendo codigos (CTO 16-oct)')
const fuente = readFileSync(path.join(REPO, 'pruebas', 'medidas', 'equivalencia.mjs'), 'utf8')
oraculo('EQ127', 'el instrumento no nombra ningun codigo de rechazo fuera de los comentarios: no hay traduccion posible', !/sesion_en_breach|reto_terminado|sesion_terminada|objetivo_alcanzado/.test(fuente.replace(/^\s*(\/\/|\*).*$/gm, '')), (fuente.match(/.*(sesion_en_breach|reto_terminado|sesion_terminada|objetivo_alcanzado).*/g) ?? []).filter(l => !/^\s*(\/\/|\*)/.test(l)).join(' | ') || '-')

titulo('controles: lo que la prueba TIENE que ver en rojo')
const m1 = corre('200', '--mutante', 'regla-vela')
ver('control (mutante regla-vela): la copia de trabajo sin la regla de la vela de la 1-119 sale con diferencias en los dos contratos y codigo 1', m1.codigo === 1 && rojo(linea(m1.salida, 'optimizacion')) && rojo(linea(m1.salida, 'mcv01')), `${linea(m1.salida, 'optimizacion')} || ${linea(m1.salida, 'mcv01')}`)
const m2 = corre('200', '--contrato', 'mcv01', '--mutante', 'mcv01')
ver('control (mutante mcv01): con el fallo MCV-01 (la firma de ambiguedad con el minuto y la fase de la conversion) el contrato mcv01 ve diferencias y sale con 1', m2.codigo === 1 && rojo(linea(m2.salida, 'mcv01')), linea(m2.salida, 'mcv01') || m2.salida.slice(0, 300))
const v = corre('200', '--sin', 'ed36936', '--sin', 'f67facd')
ver('control: las referencias SIN la regla de la vela (ed36936 + f67facd: como antes de la 1-127) salen rojas contra la copia de trabajo, codigo 1', v.codigo === 1 && rojo(linea(v.salida, 'optimizacion')) && rojo(linea(v.salida, 'mcv01')), `${linea(v.salida, 'optimizacion')} || ${linea(v.salida, 'mcv01')}`)
const s = corre('200', '--contrato', 'optimizacion', '--sin', '36794dd')
ver('control: «optimizacion» sin MCV-01 en la cadena mezcla MCV-01 con la optimizacion (el rojo ambiguo de Astra): diferencias y codigo 1', s.codigo === 1 && rojo(linea(s.salida, 'optimizacion')), linea(s.salida, 'optimizacion') || s.salida.slice(0, 300))
const g = corre('5', '--contrato', 'mcv01', '--olvida', 'ed36936')
ver('control: un commit de motor que no esta en la cadena declarada (ed36936 olvidado) lo dice la guarda de la historia y el instrumento sale con 1', g.codigo === 1 && /contrato mcv01 · la cadena declarada no es la historia de lib\/motor desde 63be57d: sin declarar \[ed36936\]/.test(g.salida), g.salida.split('\n').slice(0, 2).join(' || '))

titulo('una excepcion es rojo, nunca igualdad')
const e = corre('5', '--control-excepcion')
const eo = linea(e.salida, 'optimizacion')
oraculo('EQ127', 'con una excepcion plantada en el escenario 0 de las DOS versiones: el escenario es rojo (no identico), se cuenta y el instrumento sale con 1', e.codigo === 1 && num(eo, 'excepciones') >= 1 && num(eo, 'identicos') === 4 && /excepcion/.test(e.salida), eo || e.salida.slice(0, 300))
fin()
