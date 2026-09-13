/**
 * Post-build step for the static export — P5-08.
 *
 * Does two things to `out/`, both of which exist because the host serves plain files
 * and configures nothing.
 *
 * **Injects the security policy into every page.** GitHub Pages sets no response
 * headers, so the CSP and referrer policy travel in the document. They are written
 * here rather than in the root layout because a meta policy governs only what is
 * fetched after the browser parses it, and Next hoists its own stylesheet links and
 * script tags above anything the layout puts in <head>. A policy emitted from the
 * component tree lands below those scripts and does not cover them. Injecting
 * immediately after `<head>` is the only way to be first.
 *
 * The values come from config/security.ts, the same module `next dev` reads, so the
 * shipped policy cannot drift from the reviewed one.
 *
 * **Writes `.nojekyll`.** GitHub Pages otherwise runs the output through Jekyll,
 * which skips every file and directory whose name starts with an underscore. Next
 * puts the entire client bundle in `_next/`, so without this the pages load and every
 * script, style and WebAssembly module 404s — a blank site that looks like a build
 * failure. The Actions-based deploy does not run Jekyll, so today the file changes
 * nothing; it is written because switching the repo to "deploy from branch" is one
 * click, produces exactly that failure, and gives no clue as to why.
 *
 * Usage: node scripts/postbuild.mjs [outDir]
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { join } from 'node:path'

// The config modules import each other without file extensions, which Next resolves
// and bare Node ESM does not. Retrying with `.ts` is the whole adaptation needed to
// read the real config rather than a copy of it.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch {
      return nextResolve(`${specifier}.ts`, context)
    }
  },
})

const { metaContentSecurityPolicy, referrerPolicy } = await import('../config/security.ts')

const outDir = process.argv[2] ?? 'out'

if (!existsSync(outDir)) {
  console.error(`${outDir} does not exist — run \`next build\` first`)
  process.exit(1)
}

/** Attribute values go inside double quotes; CSP's own single quotes need no escaping. */
function attribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

const TAGS =
  `<meta http-equiv="Content-Security-Policy" content="${attribute(metaContentSecurityPolicy())}">` +
  `<meta name="referrer" content="${attribute(referrerPolicy)}">`

function htmlFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...htmlFiles(path))
    else if (entry.endsWith('.html')) found.push(path)
  }
  return found
}

const pages = htmlFiles(outDir)

if (pages.length === 0) {
  console.error(`${outDir} contains no HTML — the export did not produce pages`)
  process.exit(1)
}

/**
 * Where the policy goes: after the character encoding if one is declared, otherwise
 * immediately inside `<head>`.
 *
 * The charset declaration has to fall inside the first 1024 bytes of the document or
 * the browser starts guessing the encoding, and the policy is long enough to matter.
 * Going second keeps charset first and still puts the policy ahead of every script
 * and stylesheet, which is the requirement that made this script necessary.
 */
const CHARSET = /<head>\s*(<meta\s+charSet="[^"]*"\s*\/?>)/i

function insertionPoint(html) {
  const charset = CHARSET.exec(html)
  if (charset) return charset.index + charset[0].length

  const head = html.indexOf('<head>')
  return head === -1 ? -1 : head + '<head>'.length
}

for (const page of pages) {
  const html = readFileSync(page, 'utf8')

  const at = insertionPoint(html)
  if (at === -1) {
    console.error(`${page} has no <head> — cannot carry a security policy`)
    process.exit(1)
  }

  const injected = html.slice(0, at) + TAGS + html.slice(at)

  // The reason this step exists at all. A policy that appears after a script does not
  // govern that script, and the failure is silent — the page works and the protection
  // is absent. Checked per file rather than assumed from where it was inserted.
  const policyAt = injected.indexOf('http-equiv="Content-Security-Policy"')
  const firstScript = injected.search(/<script\b|<link\b[^>]*rel="stylesheet"/)

  if (firstScript !== -1 && firstScript < policyAt) {
    console.error(`${page} loads a script or stylesheet before its policy — it would not apply`)
    process.exit(1)
  }

  // A charset declared past the first 1024 bytes is a charset the browser may have
  // already guessed around. The policy is the only thing here long enough to push it
  // out, so this is the check on the injection rather than on the page.
  const charsetAt = injected.search(/<meta\s+charSet=/i)
  if (charsetAt !== -1 && charsetAt > 1024) {
    console.error(`${page} declares its charset at byte ${charsetAt}, past the 1024-byte limit`)
    process.exit(1)
  }

  writeFileSync(page, injected)
}

writeFileSync(join(outDir, '.nojekyll'), '')

console.log(`wrote ${join(outDir, '.nojekyll')} and injected the policy into ${pages.length} pages`)
