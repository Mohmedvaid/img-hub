import { describe, expect, it } from 'vitest'
import { findLegalPage, legalPages, policyUpdated } from './legal'

/** Mirrors the bounds scripts/seo-audit.mjs enforces against the rendered pages. */
const DESCRIPTION_MIN = 70
const DESCRIPTION_MAX = 160

describe('legal pages registry', () => {
  it('carries the three pages a site needs to look like a real operation', () => {
    expect(legalPages.map((page) => page.slug)).toEqual(['about', 'contact', 'privacy'])
  })

  it('gives every page a unique slug, so two never claim one route', () => {
    const slugs = legalPages.map((page) => page.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('gives every page a distinct title, so none compete in search results', () => {
    const titles = legalPages.map((page) => page.metaTitle)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it.each(legalPages.map((page) => [page.slug, page] as const))(
    '%s has a description the SEO audit will accept',
    (_slug, page) => {
      expect(page.metaDescription.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
      expect(page.metaDescription.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    },
  )

  it.each(legalPages.map((page) => [page.slug, page] as const))(
    '%s has a heading and a slug with no leading slash',
    (_slug, page) => {
      expect(page.title.length).toBeGreaterThan(0)
      expect(page.slug).not.toMatch(/^\//)
    },
  )
})

describe('findLegalPage', () => {
  it('finds a page by slug', () => {
    expect(findLegalPage('privacy')).toMatchObject({ slug: 'privacy' })
  })

  it('returns undefined for a slug that is not one, rather than guessing', () => {
    expect(findLegalPage('terms')).toBeUndefined()
  })
})

describe('policyUpdated', () => {
  it('is an ISO date, so it sorts and parses', () => {
    expect(policyUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(policyUpdated))).toBe(false)
  })

  it('is not in the future', () => {
    expect(Date.parse(policyUpdated)).toBeLessThanOrEqual(Date.now())
  })
})
