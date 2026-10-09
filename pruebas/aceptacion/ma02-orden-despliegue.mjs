/**
 * MA02 · EL ORDEN DE DESPLIEGUE EXCLUYE A LOS ESCRITORES ANTIGUOS
 * (Astra MD-02; CTO 9-oct-2026)
 *
 * Astra demostro que un escritor antiguo (codigo de 6ab5ba9) que sigue vivo
 * durante el arranque publica su .json DESPUES del .gz y su mejora queda oculta.
 * Decision del CTO para revisiones/2026-10-09-mercado-diario-despliegue.md, en
 * este orden: congelar TODOS los escritores (sin ejecuciones manuales en curso,
 * ningun proceso en el Mac, cerrojos inventariados y reconciliados, nunca
 * borrados por antiguedad); lectores y escritores nuevos en main SIN el workflow
 * diario; inventario en seco; arranque; verificacion de los 9 pares uno a uno;
 * solo entonces el workflow diario. Rollback: nunca a lectores anteriores al gzip.
 *
 * Es una comprobacion de TEXTO: que el procedimiento escrito diga cada paso y en
 * ese orden (el procedimiento lo ejecuta una persona; no hay codigo que probar).
 */
import { titulo, oraculo, fin, fuente } from '../lib.mjs'
let t = ''
try { t = fuente('revisiones/2026-10-09-mercado-diario-despliegue.md') } catch { t = '' }
const pasos = [...t.matchAll(/^(\d+)\. \*\*(.+?)\*\*/gm)].map(m => ({ n: Number(m[1]), titulo: m[2], i: m.index }))
const bloque = re => { const p = pasos.find(x => re.test(x.titulo)); if (!p) return null; const sig = pasos.find(x => x.i > p.i); return { ...p, texto: t.slice(p.i, sig ? sig.i : t.indexOf('\n## ', p.i + 1) > 0 ? t.indexOf('\n## ', p.i + 1) : t.length) } }
const congelar = bloque(/congelar/i), main = bloque(/main/i), seco = bloque(/inventario en seco/i), arranque = bloque(/^arranque/i), verif = bloque(/verificaci/i), cron = bloque(/workflow diario/i)

titulo('el orden')
const orden = [congelar, main, seco, arranque, verif, cron]
oraculo('MD-02', 'seis pasos numerados en este orden: congelar escritores → main sin el workflow diario → inventario en seco → arranque → verificacion → workflow diario', orden.every(Boolean) && orden.every((p, k) => k === 0 || p.n > orden[k - 1].n), pasos.map(p => `${p.n}. ${p.titulo}`).join(' | ') || '(sin pasos)')
titulo('congelar todos los escritores')
oraculo('MD-02', 'congelar: ninguna ejecucion manual en curso, ningun proceso en el Mac (ni en otro checkout)', !!congelar && /ejecuci[oó]n(es)? manual/i.test(congelar.texto) && /\bMac\b/.test(congelar.texto) && /checkout/i.test(congelar.texto), congelar?.texto.slice(0, 120) ?? '')
oraculo('MD-02', 'congelar: cerrojos inventariados y reconciliados, nunca borrados por antigüedad', !!congelar && /inventari/i.test(congelar.texto) && /reconcili/i.test(congelar.texto) && /nunca.{0,40}antig[uü]edad/i.test(congelar.texto), '')
titulo('main, inventario, arranque, verificacion, cron')
oraculo('MD-02', 'main: lectores y escritores nuevos, SIN mercado-diario.yml', !!main && /mercado-diario\.yml/.test(main.texto) && /sin|salvo/i.test(main.texto), '')
oraculo('MD-02', 'inventario en seco con el arranque (sin --subir): cerrojos (codigo 5) y .gz existentes', !!seco && /`node scripts\/arranque-gzip\.js`/.test(seco.texto) && /c[oó]digo\s+5/.test(seco.texto) && /\.json\.gz/.test(seco.texto), '')
oraculo('MD-02', 'verificacion de los nueve pares UNO A UNO (no un grafico; un .gz presente o un codigo 0 no bastan)', !!verif && /nueve|9 pares/i.test(verif.texto) && /uno\s+a\s+uno/i.test(verif.texto) && /no\s+bast/i.test(verif.texto), '')
oraculo('MD-02', 'el workflow diario solo despues de la verificacion', !!cron && !!verif && cron.n > verif.n && /solo (entonces|despu[eé]s)/i.test(cron.texto + cron.titulo), '')
titulo('rollback')
oraculo('MD-02', 'rollback: nunca a lectores anteriores al gzip', /rollback/i.test(t) && /nunca.{0,80}(lectores|lector).{0,60}anterior(es)? al gzip/i.test(t), (t.match(/.*rollback.*/i) ?? [''])[0])
fin()
