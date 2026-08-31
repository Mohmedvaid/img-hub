/**
 * The pipeline model.
 *
 * A pipeline is an ordered list of transforms plus exactly one terminal encode.
 * Encoding is modelled separately rather than as another list entry, because
 * "encode happens last, exactly once" is then true by construction instead of
 * being a validation rule that can be violated.
 *
 * Each transform type is owned by its own operation module under `operations/`.
 * This file only assembles them into the union and the pipeline shape.
 */

import type { ImageFormat } from './formats'
import type { CropTransform } from './operations/crop'
import type { MetadataTransform } from './operations/metadata'
import type { ResizeTransform } from './operations/resize'
import type { RotateTransform } from './operations/rotate'

export type Transform = CropTransform | ResizeTransform | RotateTransform | MetadataTransform

export type TransformKind = Transform['kind']

/**
 * `'source'` keeps whatever format the file arrived in.
 *
 * This is what lets format conversion be an optional step: on a cropper page the
 * user has said nothing about format, so the output should match the input rather
 * than silently becoming WebP.
 */
export type OutputFormat = ImageFormat | 'source'

export type OutputSpec = {
  readonly format: OutputFormat
  /**
   * 1-100. Ignored by lossless formats. Not comparable across formats: WebP 75 and
   * JPEG 75 are different amounts of loss.
   */
  readonly quality: number
}

export type Pipeline = {
  readonly transforms: readonly Transform[]
  readonly output: OutputSpec
}

export const QUALITY_RANGE = { min: 1, max: 100 } as const

/** The quality used when a user enables compression without touching the slider. */
export const DEFAULT_QUALITY = 80

/** Resolves `'source'` against the file actually being processed. */
export function resolveOutputFormat(output: OutputSpec, sourceFormat: ImageFormat): ImageFormat {
  return output.format === 'source' ? sourceFormat : output.format
}

/** A pipeline that changes nothing but the metadata. The neutral starting point. */
export function defaultPipeline(): Pipeline {
  return {
    transforms: [{ kind: 'metadata', stripExif: true }],
    output: { format: 'source', quality: DEFAULT_QUALITY },
  }
}
