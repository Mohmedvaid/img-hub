/**
 * Deployment-level settings: canonical URL, SEO defaults, third-party scripts,
 * feature flags.
 *
 * Every value falls back to a safe default, so a fresh clone runs with no .env
 * file. Anything that differs between environments is read from an env var here
 * and nowhere else.
 */

import { brand } from './brand'

/** Reads a public env var, trimming and treating empty strings as unset. */
function env(key: string): string | undefined {
  const raw = process.env[key]?.trim()
  return raw ? raw : undefined
}

/** Strips any trailing slash so URL joins never produce a double slash. */
function normaliseOrigin(value: string): string {
  return value.replace(/\/+$/, '')
}

const siteUrl = normaliseOrigin(env('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:3000')

export const site = {
  url: siteUrl,

  /** BCP 47 tag. Drives <html lang> and OG locale. */
  locale: 'en',
  ogLocale: 'en_US',

  /**
   * Title template applied to every page that sets a title.
   * `%s` is replaced with the page title.
   */
  titleTemplate: `%s | ${brand.name}`,
  defaultTitle: `${brand.name} — ${brand.tagline}`,

  /**
   * Indexing is opt-in. Preview and local deployments emit a global noindex so
   * they can never outrank or duplicate production.
   */
  allowIndexing: env('NEXT_PUBLIC_ALLOW_INDEXING') === 'true',

  ads: {
    /** Empty disables all ad markup. See ADR 0002: COEP must never be enabled. */
    adsenseClient: env('NEXT_PUBLIC_ADSENSE_CLIENT') ?? '',
    get enabled(): boolean {
      return this.adsenseClient.length > 0
    },
  },

  analytics: {
    /** Empty disables analytics entirely. */
    domain: env('NEXT_PUBLIC_ANALYTICS_DOMAIN') ?? '',
    get enabled(): boolean {
      return this.domain.length > 0
    },
  },

  /**
   * Feature flags. Each one is deleted once the feature is permanently on;
   * this is not a long-lived flag system.
   */
  features: {
    /** AVIF encode is 5-20x slower than WebP. Gated until the warning UX ships. */
    avifOutput: false,
    /** Shareable pipeline URLs. Ships in v1.0. */
    shareablePipelines: false,
  },
} as const

/** Joins a path onto the canonical origin. Use for canonical tags and sitemaps. */
export function absoluteUrl(path: string): string {
  return `${site.url}${path.startsWith('/') ? path : `/${path}`}`
}
