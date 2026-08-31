import { site } from '@config/site'

/**
 * The Cloudflare Web Analytics beacon, or nothing.
 *
 * Renders only when a token is configured, so local runs, previews and any build
 * without `NEXT_PUBLIC_ANALYTICS_TOKEN` load no third-party script at all. That is
 * what lets the privacy policy state flatly that this site runs none — the page and
 * the policy read the same flag.
 *
 * A plain `<script defer>` rather than next/script: this is a server component in a
 * static export, so there is no client runtime to schedule it, and deferring is the
 * whole scheduling requirement.
 *
 * The beacon sets no cookies, stores nothing on the device and does not fingerprint,
 * which is why no consent banner accompanies it. If it is ever swapped for something
 * that does, the privacy policy is part of that change, not a follow-up.
 */
export function Analytics() {
  if (!site.analytics.enabled) return null

  return (
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token: site.analytics.token })}
    />
  )
}
