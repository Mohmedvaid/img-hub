/**
 * Brand identity. The single place to rename the product, swap logos, or change
 * legal/contact details. Nothing outside this file should hardcode the product
 * name, a logo path, or a social handle.
 *
 * Renaming the product = editing this file only.
 */

export type BrandAsset = {
  /** Path under /public, or an absolute URL. */
  readonly src: string
  readonly width: number
  readonly height: number
  /** Empty string marks the asset as decorative (adjacent text already names it). */
  readonly alt: string
}

export const brand = {
  /** Product name as shown to users. Used in <title>, headers, OG tags. */
  name: 'ImgHub',

  /** Lowercase, no spaces. Used for file names, cache keys, storage prefixes. */
  slug: 'img-hub',

  /** One line, under ~60 chars. Pairs with the name in title tags. */
  tagline: 'Every image tool, one pass',

  /** ~150 chars. Default meta description when a page does not set its own. */
  description:
    'Convert, compress, resize and optimise images in a single pass. Runs entirely in your browser, so your files never leave your device. Free, no signup.',

  /** Shown in the footer and legal pages. */
  legalEntity: 'ImgHub',
  supportEmail: 'support@example.com',

  logo: {
    /** Full lockup: mark + wordmark. Header, footer. */
    full: { src: '/brand/logo.svg', width: 132, height: 32, alt: 'ImgHub' },
    /** Mark only. Favicon source, compact header, app icon. */
    mark: { src: '/brand/mark.svg', width: 32, height: 32, alt: '' },
  } satisfies Record<string, BrandAsset>,

  /**
   * Fallback social share image. Individual pages may generate their own.
   * Must be 1200x630 for correct rendering on X and Facebook.
   */
  ogImage: { src: '/brand/og-default.png', width: 1200, height: 630, alt: 'ImgHub' },

  /** Omit or leave empty to hide the link. Nothing renders for an empty string. */
  social: {
    x: '',
    github: '',
    bluesky: '',
  },
} as const

export type Brand = typeof brand
