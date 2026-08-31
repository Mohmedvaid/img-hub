/**
 * The message contract between the page and the worker.
 *
 * Hand-rolled rather than using an RPC library, because this boundary needs three
 * things a generic proxy does not give cleanly: per-file progress events, mid-flight
 * cancellation, and surviving a worker crash. Those are the whole reason the worker
 * exists, so they are worth ~80 lines of explicit protocol.
 */

import type { PipelineError } from '../errors'
import type { PipelineLimits } from '../operation'
import type { RunOutput } from '../runner'
import type { Pipeline } from '../types'

/** Correlates a response with its request. Unique per job, not per batch. */
export type JobId = string

export type WorkerRequest =
  | {
      readonly type: 'run'
      readonly id: JobId
      readonly fileName: string
      readonly blob: Blob
      readonly pipeline: Pipeline
      readonly limits: PipelineLimits
    }
  | { readonly type: 'cancel'; readonly id: JobId }

export type WorkerResponse =
  | { readonly type: 'progress'; readonly id: JobId; readonly stage: RunStage }
  | { readonly type: 'done'; readonly id: JobId; readonly output: RunOutput }
  | { readonly type: 'failed'; readonly id: JobId; readonly error: PipelineError }

export type RunStage = 'decode' | 'transform' | 'encode'
