/**
 * HTTP security headers.
 *
 * HARD CONSTRAINT — do not add Cross-Origin-Embedder-Policy or
 * Cross-Origin-Opener-Policy to this file.
 *
 * Those two headers enable cross-origin isolation, which is what `SharedArrayBuffer`
 * requires. Google Publisher Tag / AdSense does not support COEP, so enabling it
 * silently kills all ad revenue. It also breaks Stripe, YouTube embeds and Google
 * Sign-In. This is the single reason the project uses jSquash codecs rather than
 * wasm-vips. See docs/adr/0002-jsquash-over-wasm-vips.md.
 *
 * If you find yourself reaching for a library that needs SharedArrayBuffer, the
 * answer is a different library, not these headers.
 */

import { site } from './site'

/** Sources permitted to load scripts. Ad and analytics hosts are added only when configured. */
function scriptSources(): string[] {
  const sources = ["'self'", "'unsafe-inline'"]

  if (site.ads.enabled) {
    sources.push(
      'https://pagead2.googlesyndication.com',
      'https://googleads.g.doubleclick.net',
      'https://tpc.googlesyndication.com',
      'https://adservice.google.com',
    )
  }
  if (site.analytics.enabled) {
    // Cloudflare Web Analytics serves its beacon from one host and receives
    // measurements on another; both are needed or it fails silently.
    sources.push('https://static.cloudflareinsights.com')
  }
  return sources
}

function frameSources(): string[] {
  if (!site.ads.enabled) return ["'none'"]
  return ['https://googleads.g.doubleclick.net', 'https://tpc.googlesyndication.com']
}

/**
 * Directives ignored when a policy is delivered in a `<meta http-equiv>` tag rather
 * than a response header. The browser silently drops them and warns in the console,
 * so emitting them in meta would claim protection that is not there.
 *
 * `frame-ancestors` is the one that costs us something; see `headerOnlyProtections`.
 */
const META_IGNORED_DIRECTIVES = ['frame-ancestors', 'report-uri', 'report-to', 'sandbox']

function policyDirectives(): Record<string, string[]> {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': scriptSources(),
    // Tailwind injects styles at runtime in dev; inline styles carry the theme tokens.
    'style-src': ["'self'", "'unsafe-inline'"],
    // blob: and data: are how decoded image output is handed back to the page.
    'img-src': ["'self'", 'blob:', 'data:', 'https:'],
    'font-src': ["'self'", 'data:'],
    // wasm-unsafe-eval is required to instantiate the codec WebAssembly modules.
    'worker-src': ["'self'", 'blob:'],
    'connect-src': [
      "'self'",
      ...(site.analytics.enabled ? ['https://cloudflareinsights.com'] : []),
    ],
    'frame-src': frameSources(),
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'upgrade-insecure-requests': [],
  }

  // Codec modules are WebAssembly; without this they cannot be compiled.
  directives['script-src']?.push("'wasm-unsafe-eval'")

  return directives
}

function render(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([directive, values]) => (values.length ? `${directive} ${values.join(' ')}` : directive))
    .join('; ')
}

function contentSecurityPolicy(): string {
  return render(policyDirectives())
}

/**
 * The same policy, minus the directives a meta tag cannot carry.
 *
 * Used by the static export, where the host serves plain files and sets no headers
 * of its own. See docs/adr/0008-github-pages-hosting.md.
 */
export function metaContentSecurityPolicy(): string {
  const directives = policyDirectives()
  for (const directive of META_IGNORED_DIRECTIVES) {
    delete directives[directive]
  }
  return render(directives)
}

export type SecurityHeader = { key: string; value: string }

export const securityHeaders: SecurityHeader[] = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
]

/** The Referrer-Policy value, also deliverable as `<meta name="referrer">`. */
export const referrerPolicy = 'strict-origin-when-cross-origin'

/**
 * Protections in `securityHeaders` that a static host setting no headers cannot
 * deliver, and what stands in for each.
 *
 * Written down because "we lost a header" is the kind of thing that becomes
 * invisible three months later, and because moving to a host that can set headers
 * restores all of them with no code change — `securityHeaders` is still the whole
 * list. See docs/adr/0008-github-pages-hosting.md.
 */
export const headerOnlyProtections = [
  {
    header: 'X-Frame-Options',
    substitute: null,
    impact:
      'The site can be framed. There is no login, no session and no state-changing ' +
      'action to hijack, so the clickjacking value of framing this app is close to ' +
      'nil — the worst case is someone passing it off as their own.',
  },
  {
    header: 'X-Content-Type-Options',
    substitute: 'the host, if it sets nosniff itself',
    impact:
      'Every file served is one this build produced, with an extension matching its ' +
      'content, so there is no user-supplied file for a browser to mis-sniff.',
  },
  {
    header: 'Strict-Transport-Security',
    substitute: 'the HSTS preload list, if the host domain is on it',
    impact: 'HTTPS is not enforced by this site; it depends on the host.',
  },
  {
    header: 'Permissions-Policy',
    substitute: null,
    impact:
      'Camera, microphone and geolocation are not denied at the platform level. ' +
      'Nothing in this app requests them, so this removes a backstop rather than a ' +
      'control.',
  },
] as const

/**
 * Cross-origin isolation, which must never be enabled. See ADR-0002.
 *
 * This was enforced by the header-generation build step. That step is gone with the
 * move to a host that serves plain files, so the check lives here, at module load:
 * any build importing this config fails rather than shipping the headers. A rule
 * enforced only by a comment is a rule that gets broken.
 */
const FORBIDDEN_HEADERS = ['cross-origin-embedder-policy', 'cross-origin-opener-policy']

const offending = securityHeaders.filter((header) =>
  FORBIDDEN_HEADERS.includes(header.key.toLowerCase()),
)

if (offending.length > 0) {
  throw new Error(
    `config/security.ts sets ${offending.map((h) => h.key).join(' and ')}. ` +
      'Cross-origin isolation removes all ad revenue and breaks Stripe, YouTube and ' +
      'Google Sign-In. If a library needs SharedArrayBuffer, the answer is a ' +
      'different library. See docs/adr/0002-jsquash-over-wasm-vips.md.',
  )
}
