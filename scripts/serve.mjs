/**
 * Serves the static export the way Cloudflare will — P5-02.
 *
 * `next start` does not work with `output: 'export'`, and the smoke suite, the SEO
 * audit and the vitals run all need a server. A plain static server would serve the
 * files but none of the security headers, which would make those runs pass while the
 * thing they are checking is absent.
 *
 * So this reads `out/_headers` and applies it, giving local and CI runs the same
 * response headers production will send. It is a test harness, not production: no
 * caching policy, no compression, no range requests.
 *
 * Usage: node scripts/serve.mjs [outDir] [port]
 */

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const OUT = process.argv[2] ?? 'out'
const PORT = Number(process.argv[3] ?? 3000)

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
 * Parses the subset of Cloudflare's `_headers` format this project emits: one `/*`
 * block of indented `Name: value` lines. Anything more elaborate is not generated,
 * so it is not parsed.
 */
function loadHeaders() {
  const path = join(OUT, '_headers')
  if (!existsSync(path)) {
    console.warn(`${path} is missing — serving without security headers`)
    return []
  }

  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => /^\s+\S/.test(line) && line.includes(':'))
    .map((line) => {
      const at = line.indexOf(':')
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
    })
}

const headers = loadHeaders()

/**
 * Maps a URL to a file the way a static host does: `/about` serves `about.html`,
 * a directory serves its index, and anything unknown gets the 404 page with a real
 * 404 status. A soft 404 tells a crawler a missing page is real content.
 */
function resolve(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  const base = join(OUT, clean)

  for (const candidate of [base, `${base}.html`, join(base, 'index.html')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return undefined
}

createServer((request, response) => {
  const { pathname } = new URL(request.url, `http://localhost:${PORT}`)
  const file = resolve(pathname)

  for (const [key, value] of headers) response.setHeader(key, value)

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
  console.log(`serving ${OUT} on http://localhost:${PORT} with ${headers.length} headers`)
})
