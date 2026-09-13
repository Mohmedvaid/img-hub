import { afterEach, describe, expect, it, vi } from 'vitest'
import { absoluteUrl, site } from './site'

/** `site` reads env once at load, so each case needs a fresh module tree. */
async function siteWith(url?: string) {
  vi.resetModules()
  if (url === undefined) vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
  else vi.stubEnv('NEXT_PUBLIC_SITE_URL', url)
  return (await import('./site')).site
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

/**
 * The base path is derived from the canonical URL rather than configured separately,
 * because the two are one fact and a deployment where they disagree looks fine in a
 * browser while every canonical tag points at a 404.
 */
describe('base path', () => {
  it.each([
    ['https://imghub.app', ''],
    ['https://imghub.app/', ''],
    ['http://localhost:3000', ''],
    ['https://mohmedvaid.github.io/img-hub', '/img-hub'],
    ['https://mohmedvaid.github.io/img-hub/', '/img-hub'],
    ['https://example.com/a/b', '/a/b'],
  ])('reads %s as %s', async (url, expected) => {
    expect((await siteWith(url)).basePath).toBe(expected)
  })

  it('is empty for the default local origin', async () => {
    expect((await siteWith(undefined)).basePath).toBe('')
  })

  it('does not take a build down over an unparseable URL', async () => {
    // A bad value here is a config error, but the useful error comes from
    // buildMetadata's `new URL()`, not from a crash inside a path helper.
    expect((await siteWith('not a url')).basePath).toBe('')
  })

  it('never ends in a slash, which would double up on every join', async () => {
    const { basePath } = await siteWith('https://mohmedvaid.github.io/img-hub/')
    expect(basePath.endsWith('/')).toBe(false)
  })
})

describe('canonical URLs and the base path agree', () => {
  // The invariant the whole derivation exists to guarantee. If a canonical URL did
  // not start with the prefix Next puts on every link, the sitemap would advertise
  // URLs the host does not serve.
  it.each(['https://mohmedvaid.github.io/img-hub', 'https://imghub.app'])(
    'every path under %s carries the prefix',
    async (url) => {
      const configured = await siteWith(url)
      const { absoluteUrl: absolute } = await import('./site')

      for (const path of ['/', '/about', '/privacy', '/png-to-jpg']) {
        const resolved = new URL(absolute(path))
        expect(resolved.pathname.startsWith(configured.basePath || '/')).toBe(true)
      }
    },
  )
})

describe('absoluteUrl', () => {
  it('joins a path onto the configured origin', () => {
    expect(absoluteUrl('/about')).toBe(`${site.url}/about`)
  })

  it('tolerates a path given without a leading slash', () => {
    expect(absoluteUrl('about')).toBe(`${site.url}/about`)
  })
})
