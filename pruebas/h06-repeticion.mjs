/**
 * H06 · LA REPETICION POR CARGA DEL CONTROL «NINGUN SCRIPT POR TIMEOUT» (CTO 15-oct)
 *
 * aceptacion/d05 dio seis falsos rojos por carga: un script falso sano pasaba de los 20 s
 * de reloj con la maquina cargada. El control vigila tiempo de RELOJ (un cuelgue no gasta
 * CPU), asi que no se cambia a CPU: con timeout, d05 se repite entera UNA vez, en un proceso
 * nuevo, solo si la carga media de 1 minuto supera los nucleos, y lo dice
 * (pruebas/script-falso.mjs, controlH06). Aqui, d05 de verdad, en otro proceso:
 *   1 un d05 lento de verdad (espera plantada) con la carga baja: rojo, y no se repite
 *   2 el mismo con la carga alta: se repite una vez, lo dice, y sigue en rojo
 *   3 control: el d05 normal con la carga alta: verde y sin repeticion (solo se repite con timeout)
 */
import { spawnSync } from 'node:child_process'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'

const d05 = env => {
  const r = spawnSync(process.execPath, ['--import', './pruebas/sin-red.mjs', '--import', './pruebas/registro.mjs', 'pruebas/aceptacion/d05-actualizador-y-cache.mjs'],
    { cwd: REPO, encoding: 'utf8', timeout: 300000, env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'en_US.UTF-8', ...env } })
  return { codigo: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }
}
const veces = (t, re) => (t.match(re) || []).length
const PLANTADA = { H06_ESPERA_PLANTADA: '1', H06_LIMITE_MS: '300' }

titulo('1 · d05 lento de verdad, con la carga baja')
const baja = d05({ ...PLANTADA, H06_CARGA_FORZADA: '0' })
ver('control: la espera plantada se anuncia, y con su limite', /H06: ESPERA PLANTADA/.test(baja.out) && /H06: limite de la prueba del control: 300 ms/.test(baja.out), baja.out.slice(0, 400))
oraculo('H06', 'sigue en rojo (codigo distinto de 0), el control H06 roto, y dice que no se repite', baja.codigo !== 0 && /CONTROL ROTO: control \(H06\)/.test(baja.out) && /por timeout con la carga media de 1 min 0\.00 <= \d+ nucleos: no se repite/.test(baja.out) && !/se repite la prueba entera/.test(baja.out), `codigo ${baja.codigo}`)

titulo('2 · d05 lento de verdad, con la carga alta')
const alta = d05({ ...PLANTADA, H06_CARGA_FORZADA: '999' })
oraculo('H06', 'se repite UNA vez y lo dice (carga y nucleos); la repeticion lo dice tambien', veces(alta.out, /se repite la prueba entera UNA vez, en un proceso nuevo, y vale la repeticion/g) === 1 && /carga media de 1 min 999\.00 > \d+ nucleos/.test(alta.out) && veces(alta.out, /H06: esta es la REPETICION por carga/g) === 1, alta.out.split('\n').filter(l => /H06/.test(l)).join(' / '))
oraculo('H06', 'y sigue en rojo: la repeticion tambien tiene el control H06 roto, y su codigo es el que sale', alta.codigo !== 0 && veces(alta.out, /CONTROL ROTO: control \(H06\)/g) === 1, `codigo ${alta.codigo}`)

titulo('3 · control: el d05 normal con la carga alta')
const sano = d05({ H06_CARGA_FORZADA: '999' })
ver('control: el d05 sano, aun con la carga alta, sale en verde y no se repite (sin timeout no hay repeticion)', sano.codigo === 0 && !/se repite la prueba entera|REPETICION|ESPERA PLANTADA/.test(sano.out), `codigo ${sano.codigo} · ${sano.out.split('\n').slice(-3).join(' / ')}`)
fin()
