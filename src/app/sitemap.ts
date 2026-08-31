import { legalPages } from '@config/legal'
import { absoluteUrl } from '@config/site'
import { indexableTools } from '@config/tools'
import type { MetadataRoute } from 'next'

/**
 * Built from the tool registry, so shipping a tool page adds it to the sitemap
 * automatically.
 *
 * Two filters apply. A tool must be 'live', or the sitemap would serve search
 * engines a 404. And it must be indexable, because listing a page that carries a
 * noindex tag asks Google to crawl something the page then tells it to ignore.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    {
      url: absoluteUrl('/'),
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...indexableTools().map((tool) => ({
      url: absoluteUrl(`/${tool.slug}`),
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: tool.priority,
    })),
    // Low priority and rarely changing, but listed: a reviewer deciding whether this
    // is a real operation should not have to guess the URLs.
    ...legalPages
      .filter((page) => page.indexable)
      .map((page) => ({
        url: absoluteUrl(`/${page.slug}`),
        lastModified,
        changeFrequency: 'yearly' as const,
        priority: 0.3,
      })),
  ]
}
