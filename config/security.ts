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
    sources.push('https://plausible.io')
  }
  return sources
}

function frameSources(): string[] {
  if (!site.ads.enabled) return ["'none'"]
  return ['https://googleads.g.doubleclick.net', 'https://tpc.googlesyndication.com']
}

function contentSecurityPolicy(): string {
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
    'connect-src': ["'self'", ...(site.analytics.enabled ? ['https://plausible.io'] : [])],
    'frame-src': frameSources(),
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'upgrade-insecure-requests': [],
  }

  // Codec modules are WebAssembly; without this they cannot be compiled.
  directives['script-src']?.push("'wasm-unsafe-eval'")

  return Object.entries(directives)
    .map(([directive, values]) => (values.length ? `${directive} ${values.join(' ')}` : directive))
    .join('; ')
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
