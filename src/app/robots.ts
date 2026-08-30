import { absoluteUrl, site } from '@config/site'
import type { MetadataRoute } from 'next'

/**
 * Indexing is opt-in per deployment. Previews and local runs emit a blanket
 * disallow so they cannot duplicate or outrank production.
 */
export default function robots(): MetadataRoute.Robots {
  if (!site.allowIndexing) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: site.url,
  }
}
