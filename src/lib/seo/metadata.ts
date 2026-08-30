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
}

export function buildMetadata({ title, description, path }: PageMetadataInput): Metadata {
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
    // Preview and local deployments must never compete with production in search.
    robots: site.allowIndexing
      ? { index: true, follow: true }
      : { index: false, follow: false, nocache: true },
  }
}
