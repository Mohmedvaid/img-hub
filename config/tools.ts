/**
 * The tool registry. The SEO surface and the routing table at once.
 *
 * Every page runs the same engine. What differs is which feature takes precedence:
 *
 *   - The **primary** feature is always on, cannot be switched off, and gets the
 *     main UI. It is what the page ranks for.
 *   - Every **other** feature appears as an optional checkbox. Ticking it reveals
 *     that feature's fields, or nothing at all when it has none (see
 *     `FeatureInfo.hasFields` — compression is the case where a tick is the whole
 *     interaction).
 *
 * The optional list is derived, never written out per page, so adding a feature
 * offers it on every existing page without touching a single tool definition.
 *
 * Conversion tools are likewise derived from the format matrix: adding one entry to
 * `limits.outputFormats` creates a page for every input format automatically.
 *
 * `status` gates what the sitemap advertises. A tool marked 'planned' has no route
 * yet, so listing it would feed search engines a 404. Flip it to 'live' in the same
 * change that ships its page.
 */

import {
  COMPRESS_CHECKBOX_QUALITY,
  type FeatureId,
  type FeatureInfo,
  optionalFeatures,
} from '@/lib/pipeline/features'
import { formatInfo, type ImageFormat } from '@/lib/pipeline/formats'
import { DEFAULT_QUALITY, type Pipeline } from '@/lib/pipeline/types'
import { limits } from './limits'

export type ToolStatus = 'live' | 'planned'

export type ToolDefinition = {
  /** URL path without a leading slash, e.g. 'png-to-webp'. */
  readonly slug: string
  readonly status: ToolStatus
  /** The feature this page is about. Always on, never a checkbox. */
  readonly primary: FeatureId
  /** <h1> and link text. Sentence case. */
  readonly title: string
  /** <title> tag. Carries the keyword users actually search for. */
  readonly metaTitle: string
  readonly metaDescription: string
  /** State the builder loads when this page opens. */
  readonly preset: Pipeline
  /** Set on conversion pages so the copy and the format picker can be specific. */
  readonly conversion?: { readonly from: ImageFormat; readonly to: ImageFormat }
  /** Relative weight in the sitemap, 0-1. */
  readonly priority: number
}

/** The optional checkboxes a page shows: every feature except its primary one. */
export function toolOptionalFeatures(tool: ToolDefinition): readonly FeatureInfo[] {
  return optionalFeatures(tool.primary)
}

function conversionTool(from: ImageFormat, to: ImageFormat): ToolDefinition {
  const source = formatInfo(from)
  const target = formatInfo(to)

  return {
    slug: `${source.extensions[0]}-to-${target.extensions[0]}`,
    status: 'live',
    primary: 'convert',
    conversion: { from, to },
    title: `Convert ${source.label} to ${target.label}`,
    metaTitle: `${source.label} to ${target.label} Converter — Free & Private`,
    metaDescription: `Convert ${source.label} images to ${target.label} in your browser. Resize and compress in the same pass. Files never leave your device.`,
    preset: {
      transforms: [{ kind: 'metadata', stripExif: true, keepColorProfile: true }],
      output: { format: to, quality: target.lossy ? DEFAULT_QUALITY : 100 },
    },
    priority: 0.8,
  }
}

/**
 * Tools that are not a format pair, written out by hand.
 *
 * Note what each preset does NOT do. The compressor keeps the source format, and the
 * cropper and resizer do too: a user who came to crop an image has said nothing about
 * format, so silently handing them a WebP would be wrong. Format only changes when
 * the convert feature is switched on.
 */
const STANDALONE_TOOLS: readonly ToolDefinition[] = [
  {
    slug: 'compress-image',
    status: 'live',
    primary: 'compress',
    title: 'Compress images',
    metaTitle: 'Compress Images Online — Free, Private, No Upload',
    metaDescription:
      'Shrink JPEG, PNG and WebP files without visible quality loss. Runs entirely in your browser, so nothing is uploaded.',
    preset: {
      transforms: [{ kind: 'metadata', stripExif: true, keepColorProfile: true }],
      output: { format: 'source', quality: COMPRESS_CHECKBOX_QUALITY },
    },
    priority: 0.9,
  },
  {
    slug: 'resize-image',
    status: 'live',
    primary: 'resize',
    title: 'Resize images',
    metaTitle: 'Resize Images Online — Free, Private, No Upload',
    metaDescription:
      'Resize images to exact dimensions or scale them proportionally. Convert and compress in the same pass. Nothing is uploaded.',
    preset: {
      transforms: [
        { kind: 'resize', mode: 'contain', width: 1920, allowUpscale: false },
        { kind: 'metadata', stripExif: true, keepColorProfile: true },
      ],
      output: { format: 'source', quality: DEFAULT_QUALITY },
    },
    priority: 0.9,
  },
  {
    slug: 'crop-image',
    // Stays dark until the interactive selection UI ships (v0.2). The engine works,
    // but a page that cannot do what its title promises is worse than no page.
    status: 'planned',
    primary: 'crop',
    title: 'Crop images',
    metaTitle: 'Crop Images Online — Free, Private, No Upload',
    metaDescription:
      'Crop images to any area or aspect ratio. Resize, convert and compress in the same pass. Files never leave your device.',
    preset: {
      // The crop box is filled in from the source dimensions once a file loads.
      transforms: [
        { kind: 'crop', x: 0, y: 0, width: 0, height: 0 },
        { kind: 'metadata', stripExif: true, keepColorProfile: true },
      ],
      output: { format: 'source', quality: DEFAULT_QUALITY },
    },
    priority: 0.9,
  },
  {
    slug: 'rotate-image',
    status: 'live',
    primary: 'rotate',
    title: 'Rotate & flip images',
    metaTitle: 'Rotate and Flip Images Online — Free, Private, No Upload',
    metaDescription:
      'Rotate images in 90° steps or mirror them. Crop, resize and convert in the same pass. Nothing is uploaded.',
    preset: {
      transforms: [
        { kind: 'rotate', degrees: 90, flipHorizontal: false, flipVertical: false },
        { kind: 'metadata', stripExif: true, keepColorProfile: true },
      ],
      output: { format: 'source', quality: DEFAULT_QUALITY },
    },
    priority: 0.7,
  },
]

/** Every tool the product knows about, live or planned. */
export function allTools(): readonly ToolDefinition[] {
  const conversions = limits.inputFormats.flatMap((from) =>
    limits.outputFormats.filter((to) => to !== from).map((to) => conversionTool(from, to)),
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
