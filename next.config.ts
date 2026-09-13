import type { NextConfig } from 'next'
import { securityHeaders } from './config/security'
import { site } from './config/site'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Every route prerenders and nothing runs on a server, so the build emits plain
  // files. See docs/adr/0008-github-pages-hosting.md.
  output: 'export',

  /**
   * The subpath this deployment is served under — '' at a domain root, '/img-hub' on
   * GitHub Pages, which serves project sites from `/<repo>`.
   *
   * Derived in config/site.ts from `NEXT_PUBLIC_SITE_URL` rather than set here, so
   * the prefix on links and assets cannot drift from the prefix on canonical URLs.
   *
   * `basePath` covers asset URLs too, so no separate `assetPrefix` is needed.
   */
  basePath: site.basePath,

  /**
   * Directory-style output: `/about` becomes `about/index.html` rather than
   * `about.html`.
   *
   * A host that serves plain files has to guess how to map a clean URL onto a file,
   * and index files are the mapping every one of them agrees on. `about.html` works
   * on some and 404s on others.
   */
  trailingSlash: true,

  /**
   * Applied by `next dev` only.
   *
   * `headers()` does not run in a static export, and the production host sets no
   * headers of its own, so the policy that actually ships travels in a `<meta>` tag
   * from src/app/layout.tsx. This list stays because it is still the full set — it
   * is what a header-capable host would serve, and what `securityHeaders` means.
   *
   * COOP and COEP are deliberately absent; config/security.ts explains why that is
   * load-bearing, and throws at module load if either ever appears.
   */
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
