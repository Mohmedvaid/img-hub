/**
 * The contract every operation implements.
 *
 * An operation is self-contained: it owns its own transform type, its defaults,
 * its validation and its parsing. Adding an operation means adding one file under
 * `operations/` and registering it. It must never require editing another
 * operation.
 *
 * This is what keeps the operations independent while the runner stays shared.
 * See docs/adr/0005-independent-operation-modules.md.
 */

import type { PipelineError, Result } from './errors'
import type { ImageFormat } from './formats'

/** Every transform is a tagged union member; `kind` is the tag. */
export type TransformLike = { readonly kind: string }

/** Runtime policy the engine validates against. Values come from config/limits.ts. */
export type PipelineLimits = {
  readonly maxFileBytes: number
  readonly maxWidth: number
  readonly maxHeight: number
  readonly maxPixels: number
  readonly enabledOutputFormats: readonly ImageFormat[]
}

export type OperationModule<T extends TransformLike> = {
  readonly kind: T['kind']

  /** The state this operation starts in when a user enables it. */
  defaults(): T

  /**
   * Checks the transform is runnable. Returns undefined when it is fine.
   *
   * Returns an error rather than a Result because the caller composes many of
   * these and only cares about the first failure.
   */
  validate(transform: T, limits: PipelineLimits): PipelineError | undefined

  /**
   * Rebuilds the transform from an untrusted object, typically decoded from a URL.
   *
   * Every field is checked at runtime. Nothing is cast.
   */
  parse(raw: Record<string, unknown>): Result<T>

  /**
   * Does the pixel work.
   *
   * Receives the image as it stands after every earlier operation and returns the
   * next one. Returning the input unchanged is legal and expected when the transform
   * is a no-op, such as a 0° rotation.
   *
   * Operations that only affect encoding rather than pixels — metadata — return the
   * input untouched and carry their effect on the OutputSpec instead.
   */
  apply(image: ImageData, transform: T): Result<ImageData>
}

/** Shared failure for anything that arrives malformed from a URL. */
export function invalidPayload<T>(detail: string): Result<T> {
  return {
    ok: false,
    error: {
      code: 'INVALID_PIPELINE',
      message: "This link's settings couldn't be read.",
      detail,
      stage: 'validate',
      retryable: false,
    },
  }
}
