/**
 * V1C06 · «SIMULADOR ANTERIOR» TRAS EL CORTE: SOLO LECTURA Y SIN AVANZAR DE FASE (orden 1-127, ii; decision de Ramon).
 * Escrita ANTES que el codigo (en c20ca60: en rojo).
 *   A · /api/challenge/advance (el handler REAL sobre supabase-falso): una madre legado (legado = true) no avanza ni se
 *       marca: pass y fail → 409 solo_lectura con el aviso de solo lectura de hoy, CERO escrituras y ninguna hija (ni v1
 *       ni de ninguna clase). Una madre v1 (motor_version 1) tampoco va por aqui: 409, su camino es /api/sim/avanzar-fase.
 *       Control positivo: la misma madre sin legado avanza como hoy (200 y su hija).
 *   B · la pagina (los hooks REALES en el banco, bandera apagada: la sesion legado no es v1): el reto superado saca su
 *       modal, pero «Continuar» no manda /api/challenge/advance; sale «Esta sesión es del Simulador anterior: solo
 *       lectura.» (el aviso que ya existe). Igual con el de fallo.
 *   C · los modales: con una madre legado, sin el boton de avanzar (ChallengePassedPhaseModal y ChallengePassedAllModal
 *       reciben soloLectura) y con el aviso de solo lectura en su lugar; _SessionInner se lo pasa.
 * Datos inventados. Nada toca Supabase.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, tradeSim, importa, db, api, A, perfil, tok, fuente, asienta } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { banco } from '../banco-motor.mjs'

const TEXTO = 'Esta sesión es del Simulador anterior: solo lectura.'
const adv = (await importa('pages/api/challenge/advance.js')).default
const escrituras = () => db.log.filter(l => ['insert', 'update', 'delete', 'upsert'].includes(l.op) && !String(l.tabla).startsWith('storage')).length
const tx = x => JSON.stringify(x)
const madre = extra => sesionSim({ id: 'reto-p', challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 110000, ...extra })
const monta = extra => escenario({ perfiles: [perfil(A)], sim_sessions: [madre(extra)], sim_trades: [tradeSim({ session_id: 'reto-p', pnl: 10000, result: 'WIN', closed_at: '2025-03-04T12:00:00Z' })] })
const pide = outcome => llama(adv, { method: 'POST', token: tok(A), body: { session_id: 'reto-p', outcome, end_timestamp: 1741100000 } })
const hijas = () => db.tablas.sim_sessions.filter(x => x.challenge_parent_id === 'reto-p').length

titulo('A · /api/challenge/advance con una madre legado o v1')
monta({}); db.log.length = 0
const c0 = await pide('pass')
ver('control positivo: la misma madre sin legado avanza como hoy (200 y una hija)', c0.estado === 200 && hijas() === 1, tx({ e: c0.estado, hijas: hijas() }))
monta({ legado: true, motor_version: 0 }); db.log.length = 0
const rP = await pide('pass'), wP = escrituras(), hP = hijas()
oraculo('V1C06', 'A · madre legado, pass: 409 solo_lectura con el aviso de solo lectura, cero escrituras y ninguna hija', rP.estado === 409 && rP.cuerpo?.code === 'solo_lectura' && rP.cuerpo?.error === TEXTO && wP === 0 && hP === 0, tx({ e: rP.estado, c: rP.cuerpo, w: wP, h: hP }))
monta({ legado: true, motor_version: 0, balance: 89000 }); db.tablas.sim_trades[0].pnl = -11000; db.tablas.sim_trades[0].result = 'LOSS'; db.log.length = 0
const rF = await pide('fail'), wF = escrituras()
oraculo('V1C06', 'A · madre legado quemada, fail: 409 solo_lectura y cero escrituras (no se marca nada)', rF.estado === 409 && rF.cuerpo?.code === 'solo_lectura' && wF === 0, tx({ e: rF.estado, c: rF.cuerpo, w: wF }))
monta({ motor_version: 1 }); db.log.length = 0
const rV = await pide('pass'), wV = escrituras()
oraculo('V1C06', 'A · madre v1: 409 (su fase va por /api/sim/avanzar-fase), cero escrituras y ninguna hija', rV.estado === 409 && rV.cuerpo?.code === 'usa_avanzar_fase' && wV === 0 && hijas() === 0, tx({ e: rV.estado, c: rV.cuerpo, w: wV }))

titulo('B · la pagina con una madre legado: el modal sale, pero no avanza')
const fila = madre({ legado: true, motor_version: 0 })
escenario({ perfiles: [perfil(A)], sim_sessions: [fila], sim_trades: [tradeSim({ session_id: 'reto-p', pnl: 10000, result: 'WIN', closed_at: '2025-03-04T12:00:00Z' })] })
const b = await banco({ sesion: fila, userId: A })
await b.caja.valor.reto.refreshChallengeStatus(); await b.repinta(); await asienta(40); await b.repinta()
ver('control: el reto superado saca su modal de fase (como hoy)', b.caja.valor.reto.challengeModal === 'passed_phase', tx({ modal: b.caja.valor.reto.challengeModal, st: b.caja.valor.reto.challengeStatus?.evaluation?.status }))
db.log.length = 0
const antes = globalThis.__simAvisos?.lista?.length ?? 0
const nApi = api.llamadas.length
const avanza = () => api.llamadas.slice(nApi).filter(l => l.ruta === '/api/challenge/advance').length
await b.caja.valor.reto.handleChallengePass(); await asienta(40)
const avisosB = (globalThis.__simAvisos?.lista ?? []).slice(antes).map(a => a.texto)
oraculo('V1C06', 'B · «Continuar» con madre legado: no manda /api/challenge/advance (cero escrituras, ninguna hija) y avisa «Esta sesión es del Simulador anterior: solo lectura.»', avanza() === 0 && escrituras() === 0 && hijas() === 0 && avisosB.includes(TEXTO), tx({ advance: avanza(), w: escrituras(), h: hijas(), avisos: avisosB }))
db.log.length = 0
await b.caja.valor.reto.handleChallengeFail(); await asienta(40)
oraculo('V1C06', 'B · el de fallo con madre legado: tampoco manda /api/challenge/advance ni escribe nada', avanza() === 0 && escrituras() === 0, tx({ advance: avanza(), w: escrituras() }))

titulo('C · los modales, sin el boton de avanzar con una madre legado')
const MP = fuente('components/ChallengePassedPhaseModal.js'), MA = fuente('components/ChallengePassedAllModal.js'), SI = fuente('components/_SessionInner.js')
const sinBoton = m => /export default function \w+\(\{[^}]*\bsoloLectura\b[^}]*\}\)/.test(m) && /\{soloLectura \? \([\s\S]{0,200}Esta sesión es del Simulador anterior: solo lectura\.[\s\S]{0,400}\) : \(/.test(m)
oraculo('V1C06', 'C · ChallengePassedPhaseModal y ChallengePassedAllModal: con soloLectura, el aviso de solo lectura en lugar del boton de avanzar', sinBoton(MP) && sinBoton(MA))
oraculo('V1C06', 'C · _SessionInner les pasa soloLectura con una madre legado', (SI.match(/soloLectura=\{session\?\.legado===true\}/g) ?? []).length === 2)
fin()
