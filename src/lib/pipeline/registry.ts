/**
 * The operation registry and the shared validation pass.
 *
 * Two things live here, and they are deliberately separate:
 *
 *   - `OPERATIONS` enumerates the operations, so a page can list them without
 *     knowing what they are. This is what drives the optional-feature checkboxes.
 *   - `operationFor` dispatches to the right module with the type narrowed.
 *
 * The dispatch is an exhaustive switch rather than an index into the registry,
 * because that way adding an operation produces a compile error pointing at the
 * one line that needs updating, instead of a lookup that silently misses.
 */

import { fail, ok, pipelineError, type Result } from './errors'
import { formatInfo } from './formats'
import type { PipelineLimits } from './operation'
import { cropOperation } from './operations/crop'
import { metadataOperation } from './operations/metadata'
import { resizeOperation } from './operations/resize'
import { rotateOperation } from './operations/rotate'
import { type Pipeline, QUALITY_RANGE, type Transform, type TransformKind } from './types'

/**
 * Every operation, in the order they are applied to an image.
 *
 * The order is fixed and load-bearing, not a default. See
 * docs/adr/0006-fixed-pipeline-order.md:
 *
 *   rotate  first, because crop coordinates are defined against the rotated image.
 *           Cropping first would apply a box the user drew on a rotated preview to
 *           the unrotated pixels, selecting the wrong region entirely.
 *   crop    before resize, so the resize box applies to the final composition and
 *           so resizing never discards resolution the crop then magnifies.
 *   resize  after the frame is settled.
 *   metadata last: it is an encode-time flag, not a pixel operation.
 *
 * Decoding auto-orients from the EXIF tag before any of this runs, so `rotate` here
 * only ever means the user's own explicit turn.
 */
export const OPERATIONS = [
  rotateOperation,
  cropOperation,
  resizeOperation,
  metadataOperation,
] as const

export const OPERATION_KINDS: readonly TransformKind[] = OPERATIONS.map(
  (operation) => operation.kind,
)

/** Applies transforms in pipeline order regardless of the order they were added. */
export function sortTransforms(transforms: readonly Transform[]): readonly Transform[] {
  return [...transforms].sort(
    (a, b) => OPERATION_KINDS.indexOf(a.kind) - OPERATION_KINDS.indexOf(b.kind),
  )
}

export function defaultsFor(kind: TransformKind): Transform {
  switch (kind) {
    case 'crop':
      return cropOperation.defaults()
    case 'rotate':
      return rotateOperation.defaults()
    case 'resize':
      return resizeOperation.defaults()
    case 'metadata':
      return metadataOperation.defaults()
  }
}

export function applyTransform(image: ImageData, transform: Transform): Result<ImageData> {
  switch (transform.kind) {
    case 'crop':
      return cropOperation.apply(image, transform)
    case 'rotate':
      return rotateOperation.apply(image, transform)
    case 'resize':
      return resizeOperation.apply(image, transform)
    case 'metadata':
      return metadataOperation.apply(image, transform)
  }
}

function validateTransform(transform: Transform, limits: PipelineLimits) {
  switch (transform.kind) {
    case 'crop':
      return cropOperation.validate(transform, limits)
    case 'rotate':
      return rotateOperation.validate(transform, limits)
    case 'resize':
      return resizeOperation.validate(transform, limits)
    case 'metadata':
      return metadataOperation.validate(transform, limits)
  }
}

export function parseTransform(kind: string, raw: Record<string, unknown>): Result<Transform> {
  switch (kind) {
    case 'crop':
      return cropOperation.parse(raw)
    case 'rotate':
      return rotateOperation.parse(raw)
    case 'resize':
      return resizeOperation.parse(raw)
    case 'metadata':
      return metadataOperation.parse(raw)
    default:
      return fail('INVALID_PIPELINE', {
        message: "This link's settings couldn't be read.",
        detail: `unknown transform kind: ${kind}`,
        stage: 'validate',
      })
  }
}

/**
 * Checks a pipeline is runnable before any file is touched.
 *
 * Returns the pipeline unchanged on success so callers can use the result directly
 * rather than validating and then reaching for the original.
 */
export function validatePipeline(pipeline: Pipeline, limits: PipelineLimits): Result<Pipeline> {
  const outputError = validateOutput(pipeline, limits)
  if (outputError) return { ok: false, error: outputError }

  for (const transform of pipeline.transforms) {
    const error = validateTransform(transform, limits)
    if (error) return { ok: false, error }
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

function validateOutput(pipeline: Pipeline, limits: PipelineLimits) {
  const { format, quality } = pipeline.output

  // 'source' is resolved per file at run time, so there is no format to check yet.
  if (format !== 'source') {
    const info = formatInfo(format)

    if (!info.canEncode) {
      return pipelineError('UNSUPPORTED_OUTPUT_FORMAT', {
        message: `${info.label} can be read but not written.`,
        stage: 'validate',
      })
    }

    if (!limits.enabledOutputFormats.includes(format)) {
      return pipelineError('UNSUPPORTED_OUTPUT_FORMAT', {
        message: `${info.label} output isn't available yet.`,
        stage: 'validate',
      })
    }
  }

  if (!Number.isInteger(quality) || quality < QUALITY_RANGE.min || quality > QUALITY_RANGE.max) {
    return pipelineError('INVALID_PIPELINE', {
      message: `Quality must be between ${QUALITY_RANGE.min} and ${QUALITY_RANGE.max}.`,
      detail: `received quality=${quality}`,
      stage: 'validate',
    })
  }

  return undefined
}
