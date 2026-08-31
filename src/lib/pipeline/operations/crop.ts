/**
 * Crop. Cuts a rectangle out of the image.
 *
 * COORDINATE SPACE — the contract the UI must honour:
 *
 * `x`, `y`, `width` and `height` are in **post-rotation** pixels. Crop runs after
 * `rotate`, so the box is measured against the image as the user sees it once their
 * own rotation has been applied (EXIF auto-orientation is already baked in at decode).
 *
 * This matters because it decides who does the work. When the user changes rotation
 * after drawing a box, the UI must remap the stored rectangle into the new
 * orientation. Through a 90° turn that remap is exact and lossless, so nothing is
 * lost by putting it there.
 *
 * The alternative — storing coordinates against the unrotated source — was rejected
 * because rotation is set once and rarely, while the crop box is dragged constantly.
 * Anchoring to the stable thing keeps the common interaction free of conversions.
 *
 * Crop also runs before resize, so the resize box applies to the final composition,
 * and so a resize never throws away resolution the crop would then have to magnify.
 */

import { createCanvas } from '../codecs/canvas'
import { fail, ok, pipelineError, type Result } from '../errors'
import { invalidPayload, type OperationModule, type PipelineLimits } from '../operation'

export type CropTransform = {
  readonly kind: 'crop'
  /** Pixel offset from the top-left of the source. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export const cropOperation: OperationModule<CropTransform> = {
  kind: 'crop',

  defaults() {
    // Zero offset and no size yet: the UI fills these from the source dimensions
    // once a file is loaded, because a default crop box has no meaning before then.
    return { kind: 'crop', x: 0, y: 0, width: 0, height: 0 }
  },

  validate(transform, limits: PipelineLimits) {
    const { x, y, width, height } = transform

    if (![x, y].every((value) => Number.isInteger(value) && value >= 0)) {
      return pipelineError('INVALID_PIPELINE', {
        message: 'Crop position must be zero or greater.',
        detail: `received x=${x} y=${y}`,
        stage: 'validate',
      })
    }

    if (![width, height].every((value) => Number.isInteger(value) && value >= 1)) {
      return pipelineError('INVALID_PIPELINE', {
        message: 'Crop size must be at least 1px.',
        detail: `received width=${width} height=${height}`,
        stage: 'validate',
      })
    }

    if (width * height > limits.maxPixels) {
      return pipelineError('DIMENSIONS_TOO_LARGE', {
        message: `That is over the ${(limits.maxPixels / 1_000_000).toFixed(0)} megapixel limit.`,
        stage: 'validate',
      })
    }

    return undefined
  },

  parse(raw): Result<CropTransform> {
    const values = ['x', 'y', 'width', 'height'].map((key) => raw[key])
    if (!values.every((value) => typeof value === 'number' && Number.isInteger(value))) {
      return invalidPayload('crop values must be integers')
    }

    const [x, y, width, height] = values as [number, number, number, number]
    return ok({ kind: 'crop', x, y, width, height })
  },

  apply(image, transform) {
    const { x, y, width, height } = transform

    // Clamp to the image rather than failing. A crop box can legitimately extend
    // past the edge — a user drags to the corner, or a preset ratio overshoots by a
    // pixel — and silently trimming is what they expect. Only a box entirely outside
    // the image is a real error.
    const left = Math.min(x, image.width)
    const top = Math.min(y, image.height)
    const right = Math.min(x + width, image.width)
    const bottom = Math.min(y + height, image.height)

    const clampedWidth = right - left
    const clampedHeight = bottom - top

    if (clampedWidth < 1 || clampedHeight < 1) {
      return fail('TRANSFORM_FAILED', {
        message: 'The crop area falls outside the image.',
        detail: `crop ${x},${y} ${width}x${height} against ${image.width}x${image.height}`,
        stage: 'transform',
      })
    }

    const source = createCanvas(image.width, image.height)
    if (!source.ok) return source
    source.value.context.putImageData(image, 0, 0)

    return ok(source.value.context.getImageData(left, top, clampedWidth, clampedHeight))
  },
}
