/**
 * The tool registry. This is the SEO surface and the routing table at once.
 *
 * Every tool page in the product is the same pipeline engine with different
 * defaults and different copy. Rather than hand-writing a route per format pair,
 * conversion tools are derived from the format matrix: adding one format to
 * `limits.outputFormats` creates a page for every input format automatically.
 *
 * `status` gates what the sitemap advertises. A tool marked 'planned' has no
 * route yet, so listing it would feed search engines a 404. Flip it to 'live'
 * in the same change that ships its page.
 */

import { formatInfo, type ImageFormat } from '@/lib/pipeline/formats'
import type { Pipeline } from '@/lib/pipeline/types'
import { limits } from './limits'

export type ToolStatus = 'live' | 'planned'

export type ToolDefinition = {
  /** URL path without a leading slash, e.g. 'png-to-webp'. */
  readonly slug: string
  readonly status: ToolStatus
  /** <h1> and link text. Sentence case. */
  readonly title: string
  /** <title> tag. Includes the keyword users actually search for. */
  readonly metaTitle: string
  readonly metaDescription: string
  /** Defaults the builder loads when this page opens. */
  readonly preset: Pipeline
  /** Relative weight in the sitemap, 0-1. */
  readonly priority: number
}

/** Conversions we never generate, because the pair makes no sense as a search term. */
function isUselessPair(from: ImageFormat, to: ImageFormat): boolean {
  return from === to
}

function conversionTool(from: ImageFormat, to: ImageFormat): ToolDefinition {
  const source = formatInfo(from)
  const target = formatInfo(to)

  return {
    slug: `${source.extensions[0]}-to-${target.extensions[0]}`,
    // No conversion route exists yet; phase 3 ships them. See docs/ROADMAP.md.
    status: 'planned',
    title: `Convert ${source.label} to ${target.label}`,
    metaTitle: `${source.label} to ${target.label} Converter — Free & Private`,
    metaDescription: `Convert ${source.label} images to ${target.label} in your browser. Resize and compress in the same pass. Files never leave your device.`,
    preset: {
      transforms: [{ kind: 'metadata', stripExif: true, keepColorProfile: true }],
      output: { format: to, quality: target.lossy ? 80 : 100 },
    },
    priority: 0.8,
  }
}

/** Tools that are not a format pair and so are written out by hand. */
const STANDALONE_TOOLS: readonly ToolDefinition[] = [
  {
    slug: 'compress-image',
    status: 'planned',
    title: 'Compress images',
    metaTitle: 'Compress Images Online — Free, Private, No Upload',
    metaDescription:
      'Shrink JPEG, PNG and WebP files without visible quality loss. Runs entirely in your browser, so nothing is uploaded.',
    preset: {
      transforms: [{ kind: 'metadata', stripExif: true, keepColorProfile: true }],
      output: { format: 'webp', quality: 75 },
    },
    priority: 0.9,
  },
  {
    slug: 'resize-image',
    status: 'planned',
    title: 'Resize images',
    metaTitle: 'Resize Images Online — Free, Private, No Upload',
    metaDescription:
      'Resize images to exact dimensions or scale them proportionally. Convert and compress in the same pass. Nothing is uploaded.',
    preset: {
      transforms: [
        { kind: 'resize', mode: 'contain', width: 1920, allowUpscale: false },
        { kind: 'metadata', stripExif: true, keepColorProfile: true },
      ],
      output: { format: 'webp', quality: 80 },
    },
    priority: 0.9,
  },
]

/** Every tool the product knows about, live or planned. */
export function allTools(): readonly ToolDefinition[] {
  const conversions = limits.inputFormats.flatMap((from) =>
    limits.outputFormats
      .filter((to) => !isUselessPair(from, to))
      .map((to) => conversionTool(from, to)),
  )

  return [...STANDALONE_TOOLS, ...conversions]
}

/** Tools with a route that actually exists. This is what the sitemap advertises. */
export function liveTools(): readonly ToolDefinition[] {
  return allTools().filter((tool) => tool.status === 'live')
}

export function findTool(slug: string): ToolDefinition | undefined {
  return allTools().find((tool) => tool.slug === slug)
}
