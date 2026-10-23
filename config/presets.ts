/**
 * Named starting points for the builder.
 *
 * Data rather than behaviour, so a preset is a config edit and never a code change.
 * `applyPreset` in src/lib/ui turns one of these into builder state.
 *
 * Each preset answers a job someone actually arrives with, in their words. "Make
 * this fit an email" is a real request; "resize to 1200px contain, JPEG quality 70"
 * is the same thing expressed as settings the person would have to work out.
 *
 * Every preset says "up to" rather than a flat size, and none of them enlarge. A
 * source smaller than the target produces the largest result it can rather than
 * inventing pixels, because a soft upscaled image is a worse outcome than a slightly
 * small sharp one. Anyone who genuinely needs the exact dimensions can tick "Allow
 * enlarging" afterwards.
 */

import type { FeatureId } from '@/lib/pipeline/features'
import type { ImageFormat } from '@/lib/pipeline/formats'
import type { ResizeMode } from '@/lib/pipeline/operations/resize'

export type Preset = {
  readonly id: string
  readonly label: string
  /** One line under the name saying what it produces. */
  readonly hint: string
  /** Features switched on. Anything absent is switched off. */
  readonly features: readonly FeatureId[]
  readonly resize?: {
    readonly mode: ResizeMode
    readonly width?: number
    readonly height?: number
  }
  readonly outputFormat?: ImageFormat
  readonly quality?: number
}

export const presets: readonly Preset[] = [
  {
    id: 'product-page',
    label: 'Product page image',
    hint: 'Up to 1024px wide, WebP, compressed. The width most store themes render.',
    features: ['resize', 'convert', 'compress', 'metadata'],
    resize: { mode: 'contain', width: 1024 },
    outputFormat: 'webp',
    quality: 82,
  },
  {
    id: 'web',
    label: 'For a web page',
    hint: 'Up to 1920px wide, WebP, compressed. The usual answer for a site image.',
    features: ['resize', 'convert', 'compress', 'metadata'],
    resize: { mode: 'contain', width: 1920 },
    outputFormat: 'webp',
    quality: 80,
  },
  {
    id: 'social-square',
    label: 'Social square',
    hint: 'Square, up to 1080×1080, centre-cropped. Fits Instagram and profile images.',
    features: ['resize', 'convert', 'compress', 'metadata'],
    resize: { mode: 'cover', width: 1080, height: 1080 },
    outputFormat: 'jpeg',
    quality: 85,
  },
  {
    id: 'email',
    label: 'Email attachment',
    hint: 'Up to 1200px JPEG, compressed harder. Small enough to send without complaints.',
    features: ['resize', 'convert', 'compress', 'metadata'],
    resize: { mode: 'contain', width: 1200 },
    outputFormat: 'jpeg',
    quality: 70,
  },
  {
    id: 'thumbnail',
    label: 'Thumbnail',
    hint: 'Square, up to 400×400, centre-cropped. For grids and list rows.',
    features: ['resize', 'convert', 'compress', 'metadata'],
    resize: { mode: 'cover', width: 400, height: 400 },
    outputFormat: 'webp',
    quality: 78,
  },
  {
    id: 'privacy',
    label: 'Strip location data',
    hint: 'Removes EXIF and GPS, changes nothing else. Same format, same pixels.',
    features: ['metadata'],
  },
] as const

export function findPreset(id: string): Preset | undefined {
  return presets.find((preset) => preset.id === id)
}

/**
 * One-click widths for the resize fields, as a ceiling with the height left to follow
 * the aspect ratio.
 *
 * Width-only is the whole point. A store image is specified by how wide the theme
 * renders it; the height is whatever the product happens to be, and typing a second
 * number is how someone accidentally squashes a photo. Clicking one of these sets
 * `contain` and clears the height, which is the only combination that means "at most
 * this wide, shape untouched".
 *
 * `use` is what the number is for, in the words someone would use to ask for it. The
 * chips show the number alone — six labelled buttons is a wall of text — and the
 * explanations sit behind the info button beside them.
 *
 * Largest first: these are ceilings, and the master image is the one most people
 * want. Every value is checked against `limits.maxWidth` by its test.
 */
export type WidthPreset = {
  readonly width: number
  /** What this width is for. One line, shown in the info panel. */
  readonly use: string
}

export const widthPresets: readonly WidthPreset[] = [
  { width: 2048, use: 'Shopify’s recommended product photo. Leaves room for zoom.' },
  { width: 1920, use: 'A full-width image on a web page. The general-purpose answer.' },
  { width: 1200, use: 'A large gallery image on most product pages, and an email attachment.' },
  { width: 1024, use: 'The main product image, and description images, on a typical page.' },
  { width: 800, use: 'Collection grids, and the smallest size zoom still looks sharp at.' },
  { width: 400, use: 'Thumbnails, cart rows and swatches.' },
] as const
