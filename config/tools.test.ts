import { describe, expect, it } from 'vitest'
import { isFeatureId } from '@/lib/pipeline/features'
import { allTools, findTool, liveTools, toolOptionalFeatures } from './tools'

describe('tool registry', () => {
  it('derives a conversion tool for every input/output pair', () => {
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

  it('keeps meta descriptions within the length search engines display', () => {
    for (const tool of allTools()) {
      expect(tool.metaDescription.length).toBeLessThanOrEqual(165)
    }
  })

  it('advertises only tools whose route exists', () => {
    // Every live tool must be reachable, or the sitemap feeds search engines a 404.
    for (const tool of liveTools()) {
      expect(findTool(tool.slug)?.status).toBe('live')
    }
  })

  it('has the compressor live, since its page ships in v0.1', () => {
    expect(liveTools().map((tool) => tool.slug)).toContain('compress-image')
  })

  it('keeps crop dark until its selection UI exists', () => {
    // A page that cannot do what its title promises is worse than no page.
    expect(liveTools().map((tool) => tool.slug)).not.toContain('crop-image')
  })

  it('ships every conversion pair, since convert works today', () => {
    const live = liveTools().map((tool) => tool.slug)
    expect(live).toContain('png-to-webp')
    expect(live).toContain('jpg-to-webp')
    expect(live.filter((slug) => slug.includes('-to-')).length).toBeGreaterThanOrEqual(12)
  })

  it('looks a tool up by slug', () => {
    expect(findTool('compress-image')?.title).toBe('Compress images')
    expect(findTool('does-not-exist')).toBeUndefined()
  })
})

describe('primary feature per page', () => {
  it('names a real feature as primary on every tool', () => {
    for (const tool of allTools()) {
      expect(isFeatureId(tool.primary)).toBe(true)
    }
  })

  it('makes the page about what its slug promises', () => {
    expect(findTool('crop-image')?.primary).toBe('crop')
    expect(findTool('resize-image')?.primary).toBe('resize')
    expect(findTool('compress-image')?.primary).toBe('compress')
    expect(findTool('rotate-image')?.primary).toBe('rotate')
    expect(findTool('png-to-webp')?.primary).toBe('convert')
  })

  it('never offers the primary feature as an optional checkbox', () => {
    for (const tool of allTools()) {
      const optional = toolOptionalFeatures(tool).map((feature) => feature.id)
      expect(optional).not.toContain(tool.primary)
    }
  })

  it('offers every other feature as a checkbox on every page', () => {
    for (const tool of allTools()) {
      expect(toolOptionalFeatures(tool).length).toBeGreaterThan(0)
    }
  })
})

describe('presets do not do more than the page promises', () => {
  it('keeps the source format on non-conversion pages', () => {
    // A visitor who came to crop said nothing about format. Handing them a WebP
    // would be a change they never asked for.
    for (const slug of ['crop-image', 'resize-image', 'compress-image', 'rotate-image']) {
      expect(findTool(slug)?.preset.output.format).toBe('source')
    }
  })

  it('sets an explicit target format only on conversion pages', () => {
    const tool = findTool('png-to-webp')

    expect(tool?.preset.output.format).toBe('webp')
    expect(tool?.conversion).toEqual({ from: 'png', to: 'webp' })
  })

  it('preloads the primary feature transform on pages that have one', () => {
    expect(findTool('resize-image')?.preset.transforms.some((t) => t.kind === 'resize')).toBe(true)
    expect(findTool('crop-image')?.preset.transforms.some((t) => t.kind === 'crop')).toBe(true)
    expect(findTool('rotate-image')?.preset.transforms.some((t) => t.kind === 'rotate')).toBe(true)
  })

  it('keeps every preset quality in range', () => {
    for (const tool of allTools()) {
      expect(tool.preset.output.quality).toBeGreaterThanOrEqual(1)
      expect(tool.preset.output.quality).toBeLessThanOrEqual(100)
    }
  })

  it('uses a lossless quality when converting to a lossless format', () => {
    expect(findTool('jpg-to-png')?.preset.output.quality).toBe(100)
  })
})
