import type { NextConfig } from 'next'
import { securityHeaders } from './config/security'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Every route prerenders and nothing runs on a server, so the build emits plain
  // files. See docs/adr/0007-cloudflare-static-hosting.md.
  output: 'export',

  /**
   * Applied by `next dev` only.
   *
   * `headers()` does not run in a static export, so production gets the same list via
   * `out/_headers`, generated from this same module by scripts/headers.mjs. Both are
   * kept here rather than dropping this one, because losing the CSP in development is
   * how a violation reaches production unnoticed.
   *
   * COOP and COEP are deliberately absent; config/security.ts explains why that is
   * load-bearing, and the generator fails the build if either ever appears.
   */
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
