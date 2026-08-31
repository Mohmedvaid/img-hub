/**
 * Builds page metadata from config so no page hardcodes a title suffix, an OG
 * image path or the canonical origin.
 *
 * Pages pass only what is unique to them; everything shared comes from
 * config/brand.ts and config/site.ts.
 */

import { brand } from '@config/brand'
import { absoluteUrl, site } from '@config/site'
import type { Metadata } from 'next'

type PageMetadataInput = {
  title: string
  description: string
  /** Path with a leading slash. Becomes the canonical URL. */
  path: string
  /**
   * Whether this page should be indexed at all, assuming the deployment allows it.
   *
   * Separate from the site-wide switch on purpose: not every page earns a place in
   * the index. A page with thin content, or one that competes with a stronger page
   * for the same intent, is better left out — a small set of pages that all deserve
   * to rank beats a large set that dilutes the site.
   *
   * This can only ever restrict. A page cannot opt into indexing on a deployment
   * where indexing is off.
   */
  indexable?: boolean
}

export function buildMetadata({
  title,
  description,
  path,
  indexable = true,
}: PageMetadataInput): Metadata {
  const canonical = absoluteUrl(path)

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: brand.name,
      title,
      description,
      url: canonical,
      locale: site.ogLocale,
      images: [
        {
          url: absoluteUrl(brand.ogImage.src),
          width: brand.ogImage.width,
          height: brand.ogImage.height,
          alt: brand.ogImage.alt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [absoluteUrl(brand.ogImage.src)],
    },
    // Two independent gates. The deployment must allow indexing at all — preview and
    // local builds never compete with production — and the page must be one we want
    // indexed. `follow` stays on even when indexing is off, so link equity still
    // flows through to pages that are indexed.
    robots:
      site.allowIndexing && indexable
        ? { index: true, follow: true }
        : { index: false, follow: site.allowIndexing, nocache: true },
  }
}
