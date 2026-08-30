import type { NextConfig } from 'next'
import { securityHeaders } from './config/security'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Applied to every response. Note that COOP/COEP are deliberately absent;
  // config/security.ts explains why that is load-bearing.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
