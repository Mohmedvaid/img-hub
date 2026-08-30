/**
 * Resize. Fits the image into a target box.
 *
 * Runs after crop and rotate, so the box applies to what the user actually ends
 * up with rather than to the original orientation.
 */

import { ok, pipelineError, type Result } from '../errors'
import { invalidPayload, type OperationModule, type PipelineLimits } from '../operation'

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
  /** When false, an image already smaller than the box is left untouched. */
  readonly allowUpscale: boolean
}

export const RESIZE_MODES: readonly ResizeMode[] = ['contain', 'cover', 'exact']

export const resizeOperation: OperationModule<ResizeTransform> = {
  kind: 'resize',

  defaults() {
    // 1920 wide is the common "make this fit on a web page" answer, and not
    // upscaling means a smaller source is left alone rather than blurred.
    return { kind: 'resize', mode: 'contain', width: 1920, allowUpscale: false }
  },

  validate(transform, limits: PipelineLimits) {
    const { width, height } = transform

    if (width === undefined && height === undefined) {
      return pipelineError('INVALID_PIPELINE', {
        message: 'Set a width, a height, or both.',
        stage: 'validate',
      })
    }

    const widthError = validateAxis('width', width, limits.maxWidth)
    if (widthError) return widthError

    const heightError = validateAxis('height', height, limits.maxHeight)
    if (heightError) return heightError

    if (transform.mode === 'exact' && (width === undefined || height === undefined)) {
      return pipelineError('INVALID_PIPELINE', {
        message: 'Stretching to exact dimensions needs both a width and a height.',
        stage: 'validate',
      })
    }

    if (width !== undefined && height !== undefined && width * height > limits.maxPixels) {
      return pipelineError('DIMENSIONS_TOO_LARGE', {
        message: `That is over the ${(limits.maxPixels / 1_000_000).toFixed(0)} megapixel limit.`,
        stage: 'validate',
      })
    }

    return undefined
  },

  parse(raw): Result<ResizeTransform> {
    const mode = RESIZE_MODES.find((candidate) => candidate === raw.mode)
    if (!mode) return invalidPayload(`unknown resize mode: ${String(raw.mode)}`)

    const width = parseOptionalDimension(raw.width)
    const height = parseOptionalDimension(raw.height)
    if (width === 'invalid' || height === 'invalid') {
      return invalidPayload('resize dimension is invalid')
    }

    return ok({
      kind: 'resize',
      mode,
      allowUpscale: raw.allowUpscale === true,
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
    })
  },
}

/** An absent dimension is legal; it gets derived from the other one and the ratio. */
function validateAxis(axis: 'width' | 'height', value: number | undefined, max: number) {
  if (value === undefined) return undefined

  const label = axis === 'width' ? 'Width' : 'Height'

  if (!Number.isInteger(value) || value < 1) {
    return pipelineError('INVALID_PIPELINE', {
      message: `${label} must be a whole number of pixels.`,
      detail: `received ${axis}=${value}`,
      stage: 'validate',
    })
  }

  if (value > max) {
    return pipelineError('DIMENSIONS_TOO_LARGE', {
      message: `Maximum ${axis} is ${max.toLocaleString()}px.`,
      stage: 'validate',
    })
  }

  return undefined
}

/** Returns undefined for an absent value, 'invalid' for a present but unusable one. */
function parseOptionalDimension(value: unknown): number | undefined | 'invalid' {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return 'invalid'
  return value
}
