/**
 * Crop. Cuts a rectangle out of the source.
 *
 * Runs before resize, so the coordinates always refer to the dimensions the user
 * was looking at when they drew the selection.
 */

import { ok, pipelineError, type Result } from '../errors'
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
}
