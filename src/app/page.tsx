import { brand } from '@config/brand'
import { limits } from '@config/limits'
import { buildMetadata } from '@/lib/seo/metadata'

export const metadata = buildMetadata({
  title: `${brand.name} — ${brand.tagline}`,
  description: brand.description,
  path: '/',
})

/**
 * Placeholder home page. Phase 0 ships no UI on purpose: the pipeline builder is
 * the first feature branch, not part of the foundation commit.
 * See docs/ROADMAP.md and docs/BACKLOG.md.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="font-semibold text-4xl text-fg-primary tracking-tight">{brand.name}</h1>
        <p className="mt-2 text-fg-secondary text-lg">{brand.tagline}</p>
      </div>

      <p className="text-fg-secondary leading-relaxed">{brand.description}</p>

      <div className="rounded-[--radius-lg] border border-border bg-bg-raised p-5">
        <h2 className="font-medium text-fg-primary text-sm">Foundation in place</h2>
        <ul className="mt-3 space-y-1.5 text-fg-muted text-sm">
          <li>Pipeline model, error taxonomy and versioned schema</li>
          <li>
            {limits.inputFormats.length} input formats, {limits.outputFormats.length} output formats
          </li>
          <li>Config-driven branding, theming and limits</li>
        </ul>
        <p className="mt-4 text-fg-muted text-sm">
          The builder UI is the next branch. See <code className="font-mono">docs/ROADMAP.md</code>.
        </p>
      </div>
    </main>
  )
}
