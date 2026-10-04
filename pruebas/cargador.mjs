// Cargador de las pruebas del simulador: codigo REAL del repo, sin Next, sin red.
// Solo para lo que importa un fichero DEL REPO (no node_modules):
//   @supabase/supabase-js  → supabase-falso.mjs (?servidor desde lib/authApi.js,
//                            ?navegador desde lib/supabase.js; la base es una)
//   dukascopy-node         → proveedor-falso.mjs (el proveedor de velas; nunca el real)
//   react, react/jsx-runtime → react-falso.mjs (un React minimo)
//   next/router, next/link, next/head, next/dynamic → next-falso.mjs
//   components/Estrellas, NetworkBg, Fps, AntimatterLoader → decorado-falso.mjs
// Los .js del repo se compilan con el SWC de Next.
// ⛔ Los scripts CommonJS de scripts/ NO pasan por aqui: los carga
//    pruebas/script-falso.mjs, que intercepta su require.
import { pathToFileURL, fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(AQUI, '..') + path.sep
const url = f => pathToFileURL(path.join(AQUI, f)).href
const delRepo = u => u?.startsWith(pathToFileURL(REPO).href) && !u.includes('/node_modules/') && !u.includes('/pruebas/')
const NEXT = { 'next/router': 'router', 'next/link': 'link', 'next/head': 'head', 'next/dynamic': 'dynamic' }
const DECORADO = ['components/Estrellas.js', 'components/NetworkBg.js', 'components/Fps.js', 'components/AntimatterLoader.js'].map(f => REPO + f)

export async function resolve(spec, ctx, next) {
  if (delRepo(ctx.parentURL)) {
    if (spec === '@supabase/supabase-js') {
      const quien = fileURLToPath(ctx.parentURL) === REPO + 'lib/authApi.js' ? 'servidor' : 'navegador'
      return { url: url('supabase-falso.mjs') + '?' + quien, shortCircuit: true }
    }
    if (spec === 'dukascopy-node') return { url: url('proveedor-falso.mjs'), shortCircuit: true }
    if (spec === 'react' || spec === 'react/jsx-runtime' || spec === 'react/jsx-dev-runtime') return { url: url('react-falso.mjs'), shortCircuit: true }
    if (NEXT[spec]) return { url: 'falso:' + NEXT[spec], shortCircuit: true }
    if (spec.startsWith('.') || spec.startsWith('/')) {
      let p = fileURLToPath(new URL(spec, ctx.parentURL))
      if (!existsSync(p) && existsSync(p + '.js')) p = p + '.js'
      if (DECORADO.includes(p)) return { url: url('decorado-falso.mjs'), shortCircuit: true }
      return { url: pathToFileURL(p).href, shortCircuit: true }
    }
  }
  return next(spec, ctx)
}

const EXPORTA = {
  router: 'export { useRouter, Router as default } from',
  link: 'export { Link as default } from',
  head: 'export { Head as default } from',
  dynamic: 'export { dynamic as default } from',
}
let swc = null
export async function load(u, ctx, next) {
  if (u.startsWith('falso:')) {
    return { format: 'module', source: `${EXPORTA[u.slice(6)]} ${JSON.stringify(url('next-falso.mjs'))}`, shortCircuit: true }
  }
  if (delRepo(u) && u.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true }
  if (delRepo(u) && u.endsWith('.js')) {
    const fuente = await readFile(fileURLToPath(u), 'utf8')
    swc ??= createRequire(REPO + 'package.json')('next/dist/build/swc')
    let { code } = await swc.transform(fuente, { filename: fileURLToPath(u),
      jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' }, module: { type: 'es6' } })
    code = code.replace(/^import\s+['"][^'"]+\.css['"];?\s*$/mg, '')
    if (/\brequire\(/.test(code)) code = `import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);\n` + code
    return { format: 'module', source: code, shortCircuit: true }
  }
  return next(u, ctx)
}
