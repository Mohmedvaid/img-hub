import { afterEach, describe, expect, it, vi } from 'vitest'
import { securityHeaders } from './security'

const header = (key: string) =>
  securityHeaders.find((entry) => entry.key.toLowerCase() === key.toLowerCase())?.value

const csp = () => header('Content-Security-Policy') ?? ''

/** Reads one directive out of the assembled policy. */
const directive = (name: string) =>
  csp()
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))

describe('cross-origin isolation', () => {
  // The single most expensive mistake available in this file. Either header enables
  // cross-origin isolation, which silently stops AdSense from rendering and takes the
  // revenue model with it. ADR-0002 is the whole story; this is the guard.
  it.each(['Cross-Origin-Embedder-Policy', 'Cross-Origin-Opener-Policy'])(
    'never sets %s',
    (name) => {
      expect(header(name)).toBeUndefined()
    },
  )

  it('sets no header that would isolate the page by another name', () => {
    const keys = securityHeaders.map((entry) => entry.key.toLowerCase())
    expect(keys.filter((key) => key.startsWith('cross-origin-'))).toEqual([])
  })
})

describe('content security policy', () => {
  it('allows WebAssembly to be compiled, or no codec can start', () => {
    expect(directive('script-src')).toContain("'wasm-unsafe-eval'")
  })

  it('does not allow eval, which wasm-unsafe-eval is often confused with', () => {
    expect(directive('script-src')).not.toContain("'unsafe-eval'")
  })

  it('keeps the page from connecting anywhere but its own origin', () => {
    // This is what makes "your images never leave your device" enforced rather than
    // promised: the page cannot POST them anywhere.
    expect(directive('connect-src')).toBe("connect-src 'self'")
  })

  it('lets decoded output reach the page as a blob or data URL', () => {
    expect(directive('img-src')).toContain('blob:')
    expect(directive('img-src')).toContain('data:')
  })

  it('lets the pipeline worker start', () => {
    expect(directive('worker-src')).toContain("'self'")
  })

  it.each([
    ["object-src 'none'", 'object-src'],
    ["frame-ancestors 'none'", 'frame-ancestors'],
    ["base-uri 'self'", 'base-uri'],
    ["form-action 'self'", 'form-action'],
  ])('keeps %s', (expected, name) => {
    expect(directive(name)).toBe(expected)
  })

  it('permits no ad or analytics host while both features are off', () => {
    // Hosts are added only under their config flag. A policy that allowlists Google
    // on a build with no ads is a policy nobody is reading.
    expect(csp()).not.toContain('googlesyndication')
    expect(csp()).not.toContain('doubleclick')
    expect(csp()).not.toContain('plausible.io')
  })
})

describe('the rest of the header set', () => {
  it.each([
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'DENY'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ])('sets %s', (key, value) => {
    expect(header(key)).toBe(value)
  })

  it('sets HSTS for long enough to be preloadable', () => {
    expect(header('Strict-Transport-Security')).toMatch(/max-age=\d{8,}/)
    expect(header('Strict-Transport-Security')).toContain('preload')
  })

  it('turns off device APIs this app has no use for', () => {
    const policy = header('Permissions-Policy') ?? ''
    for (const feature of ['camera', 'microphone', 'geolocation']) {
      expect(policy).toContain(`${feature}=()`)
    }
  })

  it('gives every header a key and a non-empty value', () => {
    for (const entry of securityHeaders) {
      expect(entry.key.length).toBeGreaterThan(0)
      expect(entry.value.length).toBeGreaterThan(0)
    }
  })
})

/**
 * The policy is assembled from config, so the interesting cases are the ones this
 * build does not exercise. `site` reads env once at load, so each needs a fresh
 * module tree.
 */
async function policyWith(env: Record<string, string>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  const { securityHeaders: headers } = await import('./security')
  return headers.find((entry) => entry.key === 'Content-Security-Policy')?.value ?? ''
}

describe('hosts appear only under their feature flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('allows the analytics beacon and its endpoint once a token is set', async () => {
    // Two different hosts: one serves beacon.min.js, the other receives the
    // measurements. Missing either makes it fail silently.
    const policy = await policyWith({ NEXT_PUBLIC_ANALYTICS_TOKEN: 'abc123' })

    expect(policy).toContain('script-src')
    expect(policy).toMatch(/script-src[^;]*https:\/\/static\.cloudflareinsights\.com/)
    expect(policy).toMatch(/connect-src[^;]*https:\/\/cloudflareinsights\.com/)
  })

  it('still permits no ad host when only analytics is on', async () => {
    const policy = await policyWith({ NEXT_PUBLIC_ANALYTICS_TOKEN: 'abc123' })

    expect(policy).not.toContain('googlesyndication')
  })

  it('allows the ad hosts once a publisher ID is set, and frames them', async () => {
    const policy = await policyWith({ NEXT_PUBLIC_ADSENSE_CLIENT: 'ca-pub-123' })

    expect(policy).toMatch(/script-src[^;]*googlesyndication/)
    expect(policy).toMatch(/frame-src[^;]*doubleclick/)
  })

  it('never isolates the page even with every feature on', async () => {
    // The combination that would be most tempting to "just make work".
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', 'ca-pub-123')
    vi.stubEnv('NEXT_PUBLIC_ANALYTICS_TOKEN', 'abc123')
    const { securityHeaders: headers } = await import('./security')

    expect(
      headers.map((entry) => entry.key.toLowerCase()).filter((k) => k.startsWith('cross-origin-')),
    ).toEqual([])
  })

  it('blocks framing entirely while ads are off', async () => {
    const policy = await policyWith({})
    expect(policy).toMatch(/frame-src 'none'/)
  })
})
