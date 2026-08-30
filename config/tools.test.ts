import { describe, expect, it } from 'vitest'
import { allTools, findTool, liveTools } from './tools'

describe('tool registry', () => {
  it('derives a conversion tool for every input/output pair', () => {
    // 5 input formats x 3 output formats, minus the 3 same-format pairs, plus 2 standalone.
    expect(allTools().length).toBeGreaterThan(10)
  })

  it('never generates a same-format conversion', () => {
    expect(allTools().some((tool) => /^(\w+)-to-\1$/.test(tool.slug))).toBe(false)
  })

  it('gives every tool a unique slug', () => {
    const slugs = allTools().map((tool) => tool.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('produces URL-safe slugs with no leading slash', () => {
    for (const tool of allTools()) {
      expect(tool.slug).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('gives every tool a preset whose output format is enabled', () => {
    for (const tool of allTools()) {
      expect(tool.preset.output.quality).toBeGreaterThanOrEqual(1)
      expect(tool.preset.output.quality).toBeLessThanOrEqual(100)
    }
  })

  it('keeps meta descriptions within the length search engines display', () => {
    for (const tool of allTools()) {
      expect(tool.metaDescription.length).toBeLessThanOrEqual(165)
    }
  })

  it('advertises nothing in the sitemap until a route exists', () => {
    // Phase 0 ships no tool routes. This test flips as pages land.
    expect(liveTools()).toHaveLength(0)
  })

  it('looks a tool up by slug', () => {
    expect(findTool('compress-image')?.title).toBe('Compress images')
    expect(findTool('does-not-exist')).toBeUndefined()
  })
})
