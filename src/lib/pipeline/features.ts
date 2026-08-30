/**
 * The feature layer: what a *page* offers, as opposed to what the engine does.
 *
 * These are not the same list, on purpose. `convert` and `compress` both drive the
 * single encode step but are separate features, because they are separate search
 * intents and separate landing pages. Someone looking for "png to webp" and someone
 * looking for "compress image" want different controls in front of them, even though
 * the same code runs underneath.
 *
 * Every tool page names one feature as primary. It is always on and gets the main
 * UI. Every other feature becomes an optional checkbox, and checking it reveals its
 * fields — or nothing at all, when the feature has no fields to reveal.
 */

import type { TransformKind } from './types'

export type FeatureId = TransformKind | 'convert' | 'compress'

/** Which part of the pipeline a feature edits. */
export type FeatureTarget =
  | { readonly kind: 'transform'; readonly transform: TransformKind }
  | { readonly kind: 'output'; readonly field: 'format' | 'quality' }

export type FeatureInfo = {
  readonly id: FeatureId
  /** Used as the checkbox label and the section heading. */
  readonly label: string
  /** One line under the checkbox explaining what enabling it does. */
  readonly hint: string
  /**
   * Whether enabling this feature reveals any controls.
   *
   * False means the checkbox is the whole interaction. Compression is the case that
   * motivated this: ticking it applies a sensible default quality, and a user who
   * wants to tune it is a different, more advanced intent.
   */
  readonly hasFields: boolean
  readonly target: FeatureTarget
}

const FEATURES: Record<FeatureId, FeatureInfo> = {
  crop: {
    id: 'crop',
    label: 'Crop',
    hint: 'Cut the image down to a selected area.',
    hasFields: true,
    target: { kind: 'transform', transform: 'crop' },
  },
  rotate: {
    id: 'rotate',
    label: 'Rotate & flip',
    hint: 'Turn the image in 90° steps, or mirror it.',
    hasFields: true,
    target: { kind: 'transform', transform: 'rotate' },
  },
  resize: {
    id: 'resize',
    label: 'Resize',
    hint: 'Change the pixel dimensions.',
    hasFields: true,
    target: { kind: 'transform', transform: 'resize' },
  },
  convert: {
    id: 'convert',
    label: 'Convert format',
    hint: 'Save as a different file type.',
    hasFields: true,
    target: { kind: 'output', field: 'format' },
  },
  compress: {
    id: 'compress',
    label: 'Compress',
    hint: 'Reduce file size with no visible quality loss.',
    // The checkbox is the whole control. Quality tuning is a different intent and
    // lives on the compressor page, where compress is the primary feature.
    hasFields: false,
    target: { kind: 'output', field: 'quality' },
  },
  metadata: {
    id: 'metadata',
    label: 'Strip metadata',
    hint: 'Remove EXIF, GPS and camera information.',
    hasFields: false,
    target: { kind: 'transform', transform: 'metadata' },
  },
}

/** Display order. Roughly the order the operations apply, with encode last. */
export const FEATURE_ORDER: readonly FeatureId[] = [
  'crop',
  'rotate',
  'resize',
  'convert',
  'compress',
  'metadata',
]

export function featureInfo(id: FeatureId): FeatureInfo {
  return FEATURES[id]
}

export function allFeatures(): readonly FeatureInfo[] {
  return FEATURE_ORDER.map(featureInfo)
}

export function isFeatureId(value: string): value is FeatureId {
  return value in FEATURES
}

/**
 * Every feature a page offers as an optional checkbox: all of them except the one
 * the page is about.
 *
 * Derived rather than listed per page, so adding a feature makes it available
 * everywhere at once instead of needing every tool definition updated.
 */
export function optionalFeatures(primary: FeatureId): readonly FeatureInfo[] {
  return allFeatures().filter((feature) => feature.id !== primary)
}

/**
 * When compress is primary the page leads with the quality slider; when it is an
 * optional checkbox it applies this instead, with no control shown.
 */
export const COMPRESS_CHECKBOX_QUALITY = 75
