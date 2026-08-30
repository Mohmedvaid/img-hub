/**
 * The pipeline model.
 *
 * A pipeline is an ordered list of transforms plus exactly one terminal encode.
 * Encoding is modelled separately from transforms rather than as another entry in
 * the list, because "encode must be last and must appear exactly once" is then
 * true by construction instead of being a validation rule that can be violated.
 *
 * Every tool page in the product is this same structure with different defaults.
 * There is no separate "resize engine" or "convert engine".
 */

import { fail, ok, type Result } from './errors'
import { formatInfo, type ImageFormat } from './formats'

/** How the image is fitted into the requested box. */
export type ResizeMode =
  /** Preserve aspect ratio; the result fits inside the box. */
  | 'contain'
  /** Preserve aspect ratio; the result covers the box and is centre-cropped. */
  | 'cover'
  /** Ignore aspect ratio; stretch to exactly the box. */
  | 'exact'

export type ResizeTransform = {
  readonly kind: 'resize'
  readonly mode: ResizeMode
  /** At least one of width/height must be set. Omitting one derives it from the ratio. */
  readonly width?: number
  readonly height?: number
  /** When false, an image smaller than the box is left untouched. */
  readonly allowUpscale: boolean
}

export type CropTransform = {
  readonly kind: 'crop'
  /** Pixel offsets from the top-left of the source. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type RotateTransform = {
  readonly kind: 'rotate'
  readonly degrees: 0 | 90 | 180 | 270
  readonly flipHorizontal: boolean
  readonly flipVertical: boolean
}

export type MetadataTransform = {
  readonly kind: 'metadata'
  /** Strips EXIF, GPS and camera data. On by default: it is a privacy win and shrinks files. */
  readonly stripExif: boolean
  /** Keeping the ICC profile preserves colour accuracy at a small size cost. */
  readonly keepColorProfile: boolean
}

export type Transform = ResizeTransform | CropTransform | RotateTransform | MetadataTransform

export type TransformKind = Transform['kind']

export type OutputSpec = {
  readonly format: ImageFormat
  /**
   * 1-100. Ignored by lossless formats. Not comparable across formats: WebP 75
   * and JPEG 75 are different amounts of loss.
   */
  readonly quality: number
}

export type Pipeline = {
  readonly transforms: readonly Transform[]
  readonly output: OutputSpec
}

/** Runtime policy the engine validates against. Values come from config/limits.ts. */
export type PipelineLimits = {
  readonly maxWidth: number
  readonly maxHeight: number
  readonly maxPixels: number
  readonly enabledOutputFormats: readonly ImageFormat[]
}

export const QUALITY_RANGE = { min: 1, max: 100 } as const

/** Sensible starting point: strip metadata, re-encode to WebP, change nothing else. */
export function defaultPipeline(): Pipeline {
  return {
    transforms: [{ kind: 'metadata', stripExif: true, keepColorProfile: true }],
    output: { format: 'webp', quality: 80 },
  }
}

/**
 * Checks a pipeline is runnable before any file is touched.
 *
 * Returns the pipeline unchanged on success so callers can use the result
 * directly rather than validating and then reaching for the original.
 */
export function validatePipeline(pipeline: Pipeline, limits: PipelineLimits): Result<Pipeline> {
  const outputFormat = formatInfo(pipeline.output.format)

  if (!outputFormat.canEncode) {
    return fail('UNSUPPORTED_OUTPUT_FORMAT', {
      message: `${outputFormat.label} can be read but not written.`,
      stage: 'validate',
    })
  }

  if (!limits.enabledOutputFormats.includes(pipeline.output.format)) {
    return fail('UNSUPPORTED_OUTPUT_FORMAT', {
      message: `${outputFormat.label} output isn't available yet.`,
      stage: 'validate',
    })
  }

  const { quality } = pipeline.output
  if (!Number.isInteger(quality) || quality < QUALITY_RANGE.min || quality > QUALITY_RANGE.max) {
    return fail('INVALID_PIPELINE', {
      message: `Quality must be between ${QUALITY_RANGE.min} and ${QUALITY_RANGE.max}.`,
      detail: `received quality=${quality}`,
      stage: 'validate',
    })
  }

  for (const transform of pipeline.transforms) {
    const error = validateTransform(transform, limits)
    if (error) return error
  }

  const kinds = pipeline.transforms.map((transform) => transform.kind)
  const duplicate = kinds.find((kind, index) => kinds.indexOf(kind) !== index)
  if (duplicate) {
    return fail('INVALID_PIPELINE', {
      message: `You can only apply one ${duplicate} step.`,
      detail: `duplicate transform kind: ${duplicate}`,
      stage: 'validate',
    })
  }

  return ok(pipeline)
}

function validateTransform(
  transform: Transform,
  limits: PipelineLimits,
): Result<Pipeline> | undefined {
  switch (transform.kind) {
    case 'resize':
      return validateResize(transform, limits)
    case 'crop':
      return validateCrop(transform, limits)
    case 'rotate':
    case 'metadata':
      // Both are closed unions of valid states; there is nothing left to check.
      return undefined
  }
}

function validateResize(
  transform: ResizeTransform,
  limits: PipelineLimits,
): Result<Pipeline> | undefined {
  const { width, height } = transform

  if (width === undefined && height === undefined) {
    return fail('INVALID_PIPELINE', {
      message: 'Set a width, a height, or both.',
      stage: 'validate',
    })
  }

  const widthError = validateAxis('width', width, limits.maxWidth)
  if (widthError) return widthError

  const heightError = validateAxis('height', height, limits.maxHeight)
  if (heightError) return heightError

  if (transform.mode === 'exact' && (width === undefined || height === undefined)) {
    return fail('INVALID_PIPELINE', {
      message: 'Stretching to exact dimensions needs both a width and a height.',
      stage: 'validate',
    })
  }

  if (width !== undefined && height !== undefined && width * height > limits.maxPixels) {
    return fail('DIMENSIONS_TOO_LARGE', {
      message: `That is over the ${(limits.maxPixels / 1_000_000).toFixed(0)} megapixel limit.`,
      stage: 'validate',
    })
  }

  return undefined
}

/** An absent dimension is legal; it gets derived from the other one and the aspect ratio. */
function validateAxis(
  axis: 'width' | 'height',
  value: number | undefined,
  max: number,
): Result<Pipeline> | undefined {
  if (value === undefined) return undefined

  const label = axis === 'width' ? 'Width' : 'Height'

  if (!Number.isInteger(value) || value < 1) {
    return fail('INVALID_PIPELINE', {
      message: `${label} must be a whole number of pixels.`,
      detail: `received ${axis}=${value}`,
      stage: 'validate',
    })
  }

  if (value > max) {
    return fail('DIMENSIONS_TOO_LARGE', {
      message: `Maximum ${axis} is ${max.toLocaleString()}px.`,
      stage: 'validate',
    })
  }

  return undefined
}

function validateCrop(
  transform: CropTransform,
  limits: PipelineLimits,
): Result<Pipeline> | undefined {
  const { x, y, width, height } = transform

  if (![x, y].every((value) => Number.isInteger(value) && value >= 0)) {
    return fail('INVALID_PIPELINE', {
      message: 'Crop position must be zero or greater.',
      detail: `received x=${x} y=${y}`,
      stage: 'validate',
    })
  }

  if (![width, height].every((value) => Number.isInteger(value) && value >= 1)) {
    return fail('INVALID_PIPELINE', {
      message: 'Crop size must be at least 1px.',
      detail: `received width=${width} height=${height}`,
      stage: 'validate',
    })
  }

  if (width * height > limits.maxPixels) {
    return fail('DIMENSIONS_TOO_LARGE', {
      message: `That is over the ${(limits.maxPixels / 1_000_000).toFixed(0)} megapixel limit.`,
      stage: 'validate',
    })
  }

  return undefined
}
