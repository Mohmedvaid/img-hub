/**
 * The pages that make the site a real business rather than a tool someone parked on
 * a domain: about, contact, and the privacy policy.
 *
 * They live in config for the same reason tools do — the footer links them, the
 * sitemap lists them, and each page reads its own title and description from here.
 * One entry, three consumers, no duplicated strings.
 *
 * AdSense will not approve a site without these, which is why they exist now rather
 * than later. See docs/BACKLOG.md P5-01.
 */

export type LegalPage = {
  /** URL path without a leading slash. */
  readonly slug: string
  /** <h1> and footer link text. */
  readonly title: string
  /** <title> tag. The site template appends the brand name. */
  readonly metaTitle: string
  /** 70-160 characters, enforced by scripts/seo-audit.mjs. */
  readonly metaDescription: string
  /**
   * Whether the page belongs in the sitemap and may be indexed.
   *
   * All three are, deliberately. They carry no search value, but a reviewer — human
   * or crawler — checking whether this site is a real operation needs to find them,
   * and a page missing from the sitemap is a page that looks hidden.
   */
  readonly indexable: boolean
}

export const legalPages: readonly LegalPage[] = [
  {
    slug: 'about',
    title: 'About ImgHub',
    metaTitle: 'About',
    metaDescription:
      'What ImgHub is, why every image tool runs in your browser instead of on a server, and who builds it. No uploads, no accounts, no cost.',
    indexable: true,
  },
  {
    slug: 'contact',
    title: 'Contact',
    metaTitle: 'Contact',
    metaDescription:
      'How to reach ImgHub about a bug, a file that would not convert, a feature request, or a privacy question. One email address, answered by a person.',
    indexable: true,
  },
  {
    slug: 'privacy',
    title: 'Privacy policy',
    metaTitle: 'Privacy Policy',
    metaDescription:
      'What ImgHub does and does not collect. Your images are processed on your own device and never uploaded, so there is nothing about them to store.',
    indexable: true,
  },
]

export function findLegalPage(slug: string): LegalPage | undefined {
  return legalPages.find((page) => page.slug === slug)
}

/**
 * When the privacy policy last changed in a way a reader would care about.
 *
 * Bump it when the substance changes — a new third party, a new category of data —
 * not for a typo. A date that moves for cosmetic edits teaches people to ignore it.
 */
export const policyUpdated = '2026-08-31'
