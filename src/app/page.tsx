import { brand } from '@config/brand'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ImageToolkit } from '@/components/ImageToolkit'
import { buildMetadata } from '@/lib/seo/metadata'

export const metadata = buildMetadata({
  title: `${brand.name} — ${brand.tagline}`,
  description: brand.description,
  path: '/',
})

/**
 * The home page is the full builder: no primary feature, everything optional. Tool
 * pages are the same component with one feature promoted.
 */
export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <h1 className="font-semibold text-2xl text-fg-primary tracking-tight sm:text-3xl">
          {brand.name}
        </h1>
        <p className="mt-1 text-fg-secondary">
          Convert, compress and resize in a single pass. Everything runs on your device.
        </p>
      </header>

      <ErrorBoundary label="toolkit">
        <ImageToolkit />
      </ErrorBoundary>
    </main>
  )
}
