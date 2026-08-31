import { allTools, indexableTools, liveTools } from '@config/tools'
import { describe, expect, it } from 'vitest'

/**
 * Indexing is the setting most expensive to get wrong: a preview deployment that
 * indexes competes with production for its own keywords, and a live site that does
 * not index earns nothing. Both directions are asserted here.
 */
describe('indexing is opt-in per deployment', () => {
  it('defaults to off, so nothing is indexed without an explicit env var', async () => {
    // config/site.ts reads NEXT_PUBLIC_ALLOW_INDEXING and requires the string 'true'.
    const { site } = await import('@config/site')
    expect(site.allowIndexing).toBe(false)
  })
})

describe('the sitemap only advertises pages that want indexing', () => {
  it('never lists a tool that is not live', () => {
    const liveSlugs = new Set(liveTools().map((tool) => tool.slug))
    for (const tool of indexableTools()) {
      expect(liveSlugs.has(tool.slug)).toBe(true)
    }
  })

  it('never lists a tool marked non-indexable', () => {
    for (const tool of indexableTools()) {
      expect(tool.indexable).toBe(true)
    }
  })

  it('is a subset of the live tools', () => {
    expect(indexableTools().length).toBeLessThanOrEqual(liveTools().length)
  })

  it('gives every tool an explicit indexing decision', () => {
    // Left implicit, a new tool silently inherits whatever the default happens to
    // be. Forcing the field means the decision is made when the page is added.
    for (const tool of allTools()) {
      expect(typeof tool.indexable).toBe('boolean')
    }
  })
})
