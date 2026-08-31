import { findTool, liveTools } from '@config/tools'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ImageToolkit } from '@/components/ImageToolkit'
import { buildMetadata } from '@/lib/seo/metadata'

type ToolPageProps = { params: Promise<{ tool: string }> }

/**
 * One route template, every tool page. Which pages exist comes entirely from the
 * registry in config/tools.ts, so adding a format pair adds its page.
 */
export function generateStaticParams() {
  return liveTools().map((tool) => ({ tool: tool.slug }))
}

export async function generateMetadata({ params }: ToolPageProps): Promise<Metadata> {
  const { tool: slug } = await params
  const tool = findTool(slug)
  if (!tool) return {}

  return buildMetadata({
    title: tool.metaTitle,
    description: tool.metaDescription,
    path: `/${tool.slug}`,
  })
}

export default async function ToolPage({ params }: ToolPageProps) {
  const { tool: slug } = await params
  const tool = findTool(slug)

  // A tool that exists in the registry but is not live yet has no page. 404 rather
  // than rendering something the sitemap does not advertise.
  if (!tool || tool.status !== 'live') notFound()

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <h1 className="font-semibold text-2xl text-fg-primary tracking-tight sm:text-3xl">
          {tool.title}
        </h1>
        <p className="mt-1 text-fg-secondary">{tool.metaDescription}</p>
      </header>

      <ErrorBoundary label="toolkit">
        <ImageToolkit primary={tool.primary} />
      </ErrorBoundary>
    </main>
  )
}
