/**
 * Error taxonomy for the image pipeline.
 *
 * Why results instead of exceptions: a batch is many files, and one corrupt file
 * failing is expected, not exceptional. If the engine throws, a single bad file
 * aborts a 40-file job. Every engine entry point returns a Result so the batch
 * runner can record one failure and carry on.
 *
 * Rules:
 *   - `code` is a stable identifier. Analytics, help content and support all key
 *     off it, so codes are never renamed or repurposed once shipped.
 *   - `message` is user-facing prose and may be reworded freely.
 *   - `detail` is for logs. It is never rendered to the user, because decoder
 *     output can contain file content.
 */

export type PipelineErrorCode =
  /* Input rejected before any work started */
  | 'UNSUPPORTED_INPUT_FORMAT'
  | 'UNSUPPORTED_OUTPUT_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'DIMENSIONS_TOO_LARGE'
  | 'INVALID_PIPELINE'
  /* Work started and failed */
  | 'DECODE_FAILED'
  | 'TRANSFORM_FAILED'
  | 'ENCODE_FAILED'
  /* Environment gave out */
  | 'OUT_OF_MEMORY'
  | 'WORKER_CRASHED'
  /* Not a failure, but not a success either */
  | 'CANCELLED'

/** Which part of the run failed. Drives which retry the UI offers. */
export type PipelineStage = 'validate' | 'decode' | 'transform' | 'encode'

export type PipelineError = {
  readonly code: PipelineErrorCode
  /** Safe to render. Written for a non-technical user. */
  readonly message: string
  /** Technical context for logs only. Never shown to the user. */
  readonly detail?: string
  readonly stage?: PipelineStage
  /** Whether running the same input again could plausibly succeed. */
  readonly retryable: boolean
  readonly cause?: unknown
}

type ErrorSpec = {
  readonly message: string
  readonly retryable: boolean
}

/**
 * Default copy per code. Editing user-facing error wording happens here and
 * nowhere else.
 */
const ERROR_SPECS: Record<PipelineErrorCode, ErrorSpec> = {
  UNSUPPORTED_INPUT_FORMAT: {
    message: "That file type isn't supported. Try a JPEG, PNG, WebP, AVIF or GIF.",
    retryable: false,
  },
  UNSUPPORTED_OUTPUT_FORMAT: {
    message: "That output format isn't available yet.",
    retryable: false,
  },
  FILE_TOO_LARGE: {
    message: 'This file is too large to process in the browser.',
    retryable: false,
  },
  DIMENSIONS_TOO_LARGE: {
    message: 'This image has too many pixels to process safely.',
    retryable: false,
  },
  INVALID_PIPELINE: {
    message: "These settings can't be applied together.",
    retryable: false,
  },
  DECODE_FAILED: {
    message: "This file couldn't be read. It may be corrupt or misnamed.",
    retryable: false,
  },
  TRANSFORM_FAILED: {
    message: 'Something went wrong while editing this image.',
    retryable: true,
  },
  ENCODE_FAILED: {
    message: "This image couldn't be saved in the chosen format.",
    retryable: true,
  },
  OUT_OF_MEMORY: {
    message: 'Your device ran out of memory. Try a smaller image or fewer files at once.',
    retryable: true,
  },
  WORKER_CRASHED: {
    message: 'Processing stopped unexpectedly. Try again.',
    retryable: true,
  },
  CANCELLED: {
    message: 'Cancelled.',
    retryable: true,
  },
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PipelineError }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

type FailOptions = {
  /** Overrides the default copy. Use when a specific limit or format helps the user act. */
  message?: string
  detail?: string
  stage?: PipelineStage
  cause?: unknown
}

/** Builds a typed error. Prefer this over constructing PipelineError by hand. */
export function pipelineError(code: PipelineErrorCode, options: FailOptions = {}): PipelineError {
  const spec = ERROR_SPECS[code]
  return {
    code,
    message: options.message ?? spec.message,
    retryable: spec.retryable,
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    ...(options.stage === undefined ? {} : { stage: options.stage }),
    ...(options.cause === undefined ? {} : { cause: options.cause }),
  }
}

export function fail<T = never>(code: PipelineErrorCode, options: FailOptions = {}): Result<T> {
  return { ok: false, error: pipelineError(code, options) }
}

/**
 * Normalises anything thrown across the worker boundary into a typed error.
 *
 * Only used at boundaries we do not control: codec modules and the structured
 * clone barrier. Application code returns Results directly rather than throwing.
 */
export function normaliseThrown(thrown: unknown, stage: PipelineStage): PipelineError {
  if (isOutOfMemory(thrown)) {
    return pipelineError('OUT_OF_MEMORY', { stage, cause: thrown })
  }

  const detail = thrown instanceof Error ? thrown.message : String(thrown)
  const code: PipelineErrorCode =
    stage === 'decode' ? 'DECODE_FAILED' : stage === 'encode' ? 'ENCODE_FAILED' : 'TRANSFORM_FAILED'

  return pipelineError(code, { detail, stage, cause: thrown })
}

/**
 * Detects allocation failures. Browsers report these inconsistently: V8 throws a
 * RangeError, WebAssembly traps surface as generic errors mentioning memory,
 * Emscripten aborts with "OOM", and some paths only produce a message string.
 *
 * Matching on message text is fragile by nature. It is worth it because the
 * alternative is telling a user their photo is corrupt when their phone simply
 * ran out of memory, which sends them off to re-export a file that was fine.
 */
const OUT_OF_MEMORY_PATTERN =
  /out of memory|\boom\b|allocation failed|(?:could not|cannot|failed to|unable to) allocate|array buffer allocation|maximum memory/i

function isOutOfMemory(thrown: unknown): boolean {
  if (thrown instanceof RangeError) return true
  const message = thrown instanceof Error ? thrown.message : String(thrown)
  return OUT_OF_MEMORY_PATTERN.test(message)
}
