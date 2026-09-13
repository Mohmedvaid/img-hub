/**
 * Serves the static export the way GitHub Pages will — P5-08.
 *
 * `next start` does not work with `output: 'export'`, and the smoke suite, the SEO
 * audit and the vitals run all need a server.
 *
 * It deliberately sets **no** security headers. It used to apply `out/_headers`,
 * which matched the previous host; GitHub Pages serves plain files and sets none of
 * ours, so adding them here would make every local and CI run pass against a
 * response production does not send. The policy that ships now travels in a `<meta>`
 * tag inside the HTML, which this serves verbatim — so what these runs check is what
 * visitors get. See docs/adr/0008-github-pages-hosting.md.
 *
 * It also honours a base path, because a GitHub Pages project site lives at
 * `/<repo>` rather than the root, and a subpath deployment fails in ways a root one
 * never shows.
 *
 * It is a test harness, not production: no caching policy, no compression, no range
 * requests.
 *
 * Usage: node scripts/serve.mjs [outDir] [port]
 * Base path comes from NEXT_PUBLIC_SITE_URL, the same input the build reads.
 */

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const OUT = process.argv[2] ?? 'out'
const PORT = Number(process.argv[3] ?? 3000)

/** Mirrors derivePath() in config/site.ts; see there for why there is one input. */
function basePath() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!raw) return ''
  try {
    const trimmed = new URL(raw).pathname.replace(/\/+$/, '')
    return trimmed === '/' ? '' : trimmed
  } catch {
    return ''
  }
}

const BASE = basePath()

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  // Serving WebAssembly as anything else makes the browser refuse to stream-compile it.
  '.wasm': 'application/wasm',
}

/**
 * Maps a URL to a file the way a static host does: a directory serves its index,
 * `/about` and `/about/` both reach `about/index.html`, and anything unknown gets
 * the 404 page with a real 404 status. A soft 404 tells a crawler a missing page is
 * real content.
 *
 * Returns undefined for a path outside the base path, which is what a host serving
 * only this project's subtree does.
 */
function resolve(pathname) {
  if (BASE && !(pathname === BASE || pathname.startsWith(`${BASE}/`))) return undefined

  const withinBase = BASE ? pathname.slice(BASE.length) || '/' : pathname
  const clean = normalize(decodeURIComponent(withinBase)).replace(/^(\.\.[/\\])+/, '')
  const base = join(OUT, clean)

  for (const candidate of [base, join(base, 'index.html'), `${base}.html`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return undefined
}

createServer((request, response) => {
  const { pathname } = new URL(request.url, `http://localhost:${PORT}`)
  const file = resolve(pathname)

  if (!file) {
    const notFound = join(OUT, '404.html')
    response.writeHead(404, { 'Content-Type': TYPES['.html'] })
    if (existsSync(notFound)) {
      createReadStream(notFound).pipe(response)
      return
    }
    response.end('Not found')
    return
  }

  response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(response)
}).listen(PORT, () => {
  console.log(`serving ${OUT} on http://localhost:${PORT}${BASE || '/'}`)
})
