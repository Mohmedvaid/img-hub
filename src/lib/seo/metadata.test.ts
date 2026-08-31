import { brand } from '@config/brand'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `site` reads its env vars once at module load, so each indexing case has to
 * re-import the module tree rather than mutating a frozen object.
 */
async function loadWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value as string)
  }
  return import('./metadata')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('buildMetadata', () => {
  it('makes the canonical URL absolute against the configured origin', async () => {
    const { buildMetadata } = await loadWithEnv({
      NEXT_PUBLIC_SITE_URL: 'https://imghub.test',
    })

    const meta = buildMetadata({ title: 'Crop', description: 'Crop images', path: '/crop-image' })

    expect(meta.alternates?.canonical).toBe('https://imghub.test/crop-image')
    expect(meta.openGraph?.url).toBe('https://imghub.test/crop-image')
  })

  it('carries the page title and description into both social cards', async () => {
    const { buildMetadata } = await loadWithEnv({})

    const meta = buildMetadata({ title: 'Crop', description: 'Crop images', path: '/crop-image' })

    expect(meta.openGraph?.title).toBe('Crop')
    expect(meta.openGraph?.description).toBe('Crop images')
    expect(meta.twitter?.title).toBe('Crop')
    expect(meta.twitter?.description).toBe('Crop images')
  })

  it('takes the share image from brand config rather than any page', async () => {
    const { buildMetadata } = await loadWithEnv({ NEXT_PUBLIC_SITE_URL: 'https://imghub.test' })

    const meta = buildMetadata({ title: 'Crop', description: 'Crop images', path: '/crop-image' })
    const images = meta.openGraph && 'images' in meta.openGraph ? meta.openGraph.images : undefined

    expect(images).toEqual([
      {
        url: `https://imghub.test${brand.ogImage.src}`,
        width: brand.ogImage.width,
        height: brand.ogImage.height,
        alt: brand.ogImage.alt,
      },
    ])
  })

  it('noindexes every page when the deployment does not allow indexing', async () => {
    const { buildMetadata } = await loadWithEnv({ NEXT_PUBLIC_ALLOW_INDEXING: undefined })

    const meta = buildMetadata({ title: 'Crop', description: 'd', path: '/crop-image' })

    expect(meta.robots).toEqual({ index: false, follow: false, nocache: true })
  })

  it('indexes a page marked indexable once the deployment allows it', async () => {
    const { buildMetadata } = await loadWithEnv({ NEXT_PUBLIC_ALLOW_INDEXING: 'true' })

    const meta = buildMetadata({ title: 'Crop', description: 'd', path: '/crop-image' })

    expect(meta.robots).toEqual({ index: true, follow: true })
  })

  it('still noindexes a page opting out, even where indexing is allowed', async () => {
    const { buildMetadata } = await loadWithEnv({ NEXT_PUBLIC_ALLOW_INDEXING: 'true' })

    const meta = buildMetadata({
      title: 'Crop',
      description: 'd',
      path: '/crop-image',
      indexable: false,
    })

    // follow stays on: link equity still needs to reach the pages that are indexed.
    expect(meta.robots).toEqual({ index: false, follow: true, nocache: true })
  })

  it('cannot opt a page into indexing on a deployment that forbids it', async () => {
    const { buildMetadata } = await loadWithEnv({ NEXT_PUBLIC_ALLOW_INDEXING: 'false' })

    const meta = buildMetadata({
      title: 'Crop',
      description: 'd',
      path: '/crop-image',
      indexable: true,
    })

    expect(meta.robots).toMatchObject({ index: false })
  })
})
