import { brand } from '@config/brand'
import { site } from '@config/site'
import { cssVariables, theme } from '@config/theme'
import type { Metadata, Viewport } from 'next'
import { Analytics } from '@/components/Analytics'
import { Footer } from '@/components/Footer'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.defaultTitle,
    template: site.titleTemplate,
  },
  description: brand.description,
  applicationName: brand.name,
  robots: site.allowIndexing
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: theme.colors.light['bg-base'] },
    { media: '(prefers-color-scheme: dark)', color: theme.colors.dark['bg-base'] },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={site.locale}>
      <head>
        {/*
          Design tokens are rendered here rather than written into globals.css so
          that config/theme.ts stays the single source of truth. This is a server
          component, so it costs nothing on the client.
        */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: generated from a typed config object, never user input */}
        <style dangerouslySetInnerHTML={{ __html: cssVariables() }} />
      </head>
      <body>
        {children}
        <Footer />
        <Analytics />
      </body>
    </html>
  )
}
