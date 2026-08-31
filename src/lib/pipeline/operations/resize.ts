/**
 * Resize. Fits the image into a target box.
 *
 * Runs after crop and rotate, so the box applies to what the user actually ends
 * up with rather than to the original orientation.
 */

import { createCanvas, enableSmoothScaling } from '../codecs/canvas'
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

  apply(image, transform) {
    const plan = resizePlan(image.width, image.height, transform)

    if (plan.width === image.width && plan.height === image.height) {
      return ok(image)
    }

    const source = createCanvas(image.width, image.height)
    if (!source.ok) return source
    source.value.context.putImageData(image, 0, 0)

    const target = createCanvas(plan.width, plan.height)
    if (!target.ok) return target
    enableSmoothScaling(target.value.context)

    target.value.context.drawImage(
      source.value.canvas,
      plan.sourceX,
      plan.sourceY,
      plan.sourceWidth,
      plan.sourceHeight,
      0,
      0,
      plan.width,
      plan.height,
    )

    return ok(target.value.context.getImageData(0, 0, plan.width, plan.height))
  },
}

/**
 * Works out the final pixel dimensions and which part of the source fills them.
 *
 * Exported for tests: getting `cover` right is fiddly and worth asserting directly
 * rather than only through rendered output.
 */
export function resizePlan(
  sourceWidth: number,
  sourceHeight: number,
  transform: ResizeTransform,
): {
  width: number
  height: number
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
} {
  const { mode, allowUpscale } = transform
  const ratio = sourceWidth / sourceHeight

  let targetWidth = transform.width ?? Math.round((transform.height ?? sourceHeight) * ratio)
  let targetHeight = transform.height ?? Math.round((transform.width ?? sourceWidth) / ratio)

  if (mode === 'contain') {
    // Fit inside the box: the smaller scale wins so nothing overflows.
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
    const bounded = allowUpscale ? scale : Math.min(scale, 1)
    targetWidth = Math.max(1, Math.round(sourceWidth * bounded))
    targetHeight = Math.max(1, Math.round(sourceHeight * bounded))

    return {
      width: targetWidth,
      height: targetHeight,
      sourceX: 0,
      sourceY: 0,
      sourceWidth,
      sourceHeight,
    }
  }

  if (mode === 'exact') {
    if (!allowUpscale) {
      targetWidth = Math.min(targetWidth, sourceWidth)
      targetHeight = Math.min(targetHeight, sourceHeight)
    }
    return {
      width: Math.max(1, targetWidth),
      height: Math.max(1, targetHeight),
      sourceX: 0,
      sourceY: 0,
      sourceWidth,
      sourceHeight,
    }
  }

  // cover: fill the box completely and centre-crop whatever overflows.
  if (!allowUpscale) {
    const scale = Math.min(1, Math.min(sourceWidth / targetWidth, sourceHeight / targetHeight))
    if (scale < 1) {
      targetWidth = Math.max(1, Math.round(targetWidth * scale))
      targetHeight = Math.max(1, Math.round(targetHeight * scale))
    }
  }

  const targetRatio = targetWidth / targetHeight
  let cropWidth = sourceWidth
  let cropHeight = sourceHeight

  if (ratio > targetRatio) {
    // Source is wider than the box: trim the sides.
    cropWidth = Math.round(sourceHeight * targetRatio)
  } else {
    // Source is taller: trim top and bottom.
    cropHeight = Math.round(sourceWidth / targetRatio)
  }

  return {
    width: targetWidth,
    height: targetHeight,
    sourceX: Math.round((sourceWidth - cropWidth) / 2),
    sourceY: Math.round((sourceHeight - cropHeight) / 2),
    sourceWidth: cropWidth,
    sourceHeight: cropHeight,
  }
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
