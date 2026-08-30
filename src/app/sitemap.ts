import { absoluteUrl } from '@config/site'
import { liveTools } from '@config/tools'
import type { MetadataRoute } from 'next'

/**
 * Built from the tool registry, so shipping a tool page adds it to the sitemap
 * automatically. Only tools marked 'live' appear: advertising a planned tool
 * would serve search engines a 404.
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
    ...liveTools().map((tool) => ({
      url: absoluteUrl(`/${tool.slug}`),
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: tool.priority,
    })),
  ]
}
