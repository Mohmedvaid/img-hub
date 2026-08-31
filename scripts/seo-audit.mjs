/**
 * Pre-launch SEO audit — P3-01.
 *
 * Written as a script rather than a checklist because a checklist is done once and a
 * script keeps being true. Every check here is something that silently breaks later:
 * a second <h1> creeping in, a canonical pointing at localhost, structured data
 * drifting from the visible page.
 *
 * Run against a production build with indexing enabled, which is what launch will
 * look like:
 *
 *   NEXT_PUBLIC_ALLOW_INDEXING=true NEXT_PUBLIC_SITE_URL=https://example.com \
 *     pnpm build && pnpm start &
 *   node scripts/seo-audit.mjs http://localhost:3000
 *
 * Exits non-zero if anything fails, so CI can gate on it.
 */

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '')

/**
 * Whether the origin being audited is a real deployment.
 *
 * CI runs this against a synthetic origin with indexing forced on, to exercise the
 * launch configuration on every commit. That is not a launch, so checks about
 * unfinished real-world details — a placeholder contact address, say — must not fire
 * there. Keying them on the indexing flag alone turned CI red for a problem that only
 * matters on a site people can actually reach.
 */
const PLACEHOLDER_HOSTS =
  /^(localhost|127\.0\.0\.1|\[::1\])$|(^|\.)example\.(com|org|net)$|\.example$/
const isRealDeployment = !PLACEHOLDER_HOSTS.test(new URL(BASE).hostname)

const failures = []
const warnings = []
let checks = 0

function check(ok, page, message, detail) {
  checks++
  if (!ok) failures.push(`${page} — ${message}${detail ? `: ${detail}` : ''}`)
}
function warn(ok, page, message, detail) {
  if (!ok) warnings.push(`${page} — ${message}${detail ? `: ${detail}` : ''}`)
}

const text = (html, re) => html.match(re)?.[1]?.trim()
const all = (html, re) => [...html.matchAll(re)]

/**
 * Decodes the entities React emits and flattens whitespace, so comparisons are
 * semantic. Without this a straight quote rendered as &quot; reads as a mismatch
 * when the text is identical.
 */
const ENTITIES = { quot: '"', '#x27': "'", '#39': "'", amp: '&', lt: '<', gt: '>', nbsp: ' ' }
function normalise(value) {
  return value
    .replace(/&(quot|#x27|#39|amp|lt|gt|nbsp);/g, (_, name) => ENTITIES[name])
    .replace(/\s+/g, ' ')
    .trim()
}

/** Google truncates titles around 60 characters and descriptions around 155. */
const TITLE_MAX = 60
const DESCRIPTION_MIN = 70
const DESCRIPTION_MAX = 160

async function fetchPage(path) {
  const response = await fetch(`${BASE}${path}`)
  return { status: response.status, html: await response.text() }
}

async function auditPage(path) {
  const { status, html } = await fetchPage(path)
  check(status === 200, path, `expected 200, got ${status}`)
  if (status !== 200) return

  // Exactly one h1. Two competing headings dilute the page's topic; none leaves the
  // crawler guessing from the title alone.
  const h1s = all(html, /<h1[^>]*>([\s\S]*?)<\/h1>/g)
  check(h1s.length === 1, path, `expected exactly one <h1>, found ${h1s.length}`)

  const title = text(html, /<title>([\s\S]*?)<\/title>/)
  check(Boolean(title), path, 'missing <title>')
  if (title) {
    warn(
      title.length <= TITLE_MAX,
      path,
      `title is ${title.length} chars, over ${TITLE_MAX}`,
      title,
    )
  }

  const description = text(html, /<meta name="description" content="([^"]*)"/)
  check(Boolean(description), path, 'missing meta description')
  if (description) {
    check(
      description.length >= DESCRIPTION_MIN && description.length <= DESCRIPTION_MAX,
      path,
      `description is ${description.length} chars, want ${DESCRIPTION_MIN}-${DESCRIPTION_MAX}`,
    )
  }

  // Canonical must be absolute and point at this page. A canonical carrying a
  // localhost origin into production de-indexes the whole site.
  const canonical = text(html, /<link rel="canonical" href="([^"]*)"/)
  check(Boolean(canonical), path, 'missing canonical')
  if (canonical) {
    check(/^https?:\/\//.test(canonical), path, 'canonical is not absolute', canonical)
    check(
      canonical.replace(/\/$/, '').endsWith(path === '/' ? '' : path),
      path,
      'canonical does not point at this page',
      canonical,
    )
  }

  const ogImage = text(html, /<meta property="og:image" content="([^"]*)"/)
  check(Boolean(ogImage), path, 'missing og:image')
  if (ogImage) check(/^https?:\/\//.test(ogImage), path, 'og:image is not absolute', ogImage)

  const robots = text(html, /<meta name="robots" content="([^"]*)"/)
  return { html, title, robots }
}

/** Structured data has to match what a reader sees, or it is a manual-action risk. */
function auditStructuredData(path, html) {
  const blocks = all(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
  if (blocks.length === 0) return

  for (const [, raw] of blocks) {
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      check(false, path, 'structured data is not valid JSON')
      continue
    }

    check(data['@context'] === 'https://schema.org', path, 'structured data missing @context')
    check(Boolean(data['@type']), path, 'structured data missing @type')

    if (data['@type'] !== 'FAQPage') continue

    const questions = data.mainEntity ?? []
    check(questions.length > 0, path, 'FAQPage has no questions')

    // Script bodies are removed first. Leaving them in would let the JSON-LD match
    // itself, making this check pass no matter what the page actually shows.
    const visible = normalise(
      html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' '),
    )

    for (const entry of questions) {
      const probe = normalise(entry.acceptedAnswer?.text ?? '').slice(0, 60)
      check(
        probe.length > 0 && visible.includes(probe),
        path,
        'structured-data answer is not visible on the page',
        probe.slice(0, 50),
      )
    }
  }
}

async function main() {
  console.log(`Auditing ${BASE}\n`)

  // robots.txt and the sitemap define what the crawler is even allowed to see.
  const robotsTxt = await fetch(`${BASE}/robots.txt`).then((r) => r.text())
  const indexingOn = !/Disallow: \/$/m.test(robotsTxt)

  if (!indexingOn) {
    console.log('robots.txt disallows everything — indexing is off for this build.')
    console.log('That is correct for a normal deploy, but this audit is a launch gate.')
    console.log('Re-run with NEXT_PUBLIC_ALLOW_INDEXING=true to check the launch config.\n')
  }

  const sitemap = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text())
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url).pathname)

  check(urls.length > 0, 'sitemap.xml', 'lists no URLs')
  check(urls.includes('/'), 'sitemap.xml', 'does not list the home page')
  check(new Set(urls).size === urls.length, 'sitemap.xml', 'contains duplicate URLs')

  if (indexingOn) {
    check(/Sitemap:/i.test(robotsTxt), 'robots.txt', 'does not point at the sitemap')
  }

  for (const path of urls) {
    const result = await auditPage(path)
    if (!result) continue

    auditStructuredData(path, result.html)

    if (indexingOn) {
      check(
        !/noindex/.test(result.robots ?? ''),
        path,
        'is in the sitemap but carries noindex',
        result.robots,
      )
    }
  }

  // Titles have to be distinct or pages compete for the same result.
  const titles = await Promise.all(
    urls.map(async (path) => text((await fetchPage(path)).html, /<title>([\s\S]*?)<\/title>/)),
  )
  check(new Set(titles).size === titles.length, 'site', 'two pages share a <title>')

  // A soft 404 tells the crawler a missing page is real content.
  const missing = await fetch(`${BASE}/this-page-does-not-exist`)
  check(missing.status === 404, 'site', `unknown URL returned ${missing.status}, expected 404`)

  // Placeholder contact details are the easiest thing to ship by accident and among
  // the worst: a contact page nobody can actually use reads as an abandoned site.
  //
  // Enforced only when a real deployment is being audited with indexing on. Both
  // conditions matter: CI audits a synthetic origin with indexing forced on, and that
  // is a rehearsal rather than a launch.
  if (indexingOn && isRealDeployment) {
    const contact = await fetchPage('/contact')
    check(
      !/example\.com|example\.org|your-?email|TODO/i.test(contact.html),
      '/contact',
      'still carries a placeholder contact address',
    )
  } else if (indexingOn) {
    console.log(`Placeholder-content checks skipped: ${BASE} is not a real deployment.\n`)
  }

  console.log(`${checks} checks across ${urls.length} pages\n`)

  for (const warning of warnings) console.log(`WARN  ${warning}`)
  for (const failure of failures) console.log(`FAIL  ${failure}`)

  if (failures.length === 0) {
    console.log(
      `\nPASS — no blocking issues${warnings.length ? `, ${warnings.length} warnings` : ''}`,
    )
  } else {
    console.log(`\nFAIL — ${failures.length} blocking issue(s)`)
    process.exitCode = 1
  }
}

await main()
