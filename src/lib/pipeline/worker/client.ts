/**
 * The page's handle on the worker.
 *
 * Owns worker lifecycle, correlates responses to requests, and — the part that earns
 * its keep — recovers from a crash. A codec that exhausts memory takes the whole
 * worker down, so a fresh one is spawned and every job that was in flight is failed
 * individually rather than the batch hanging forever.
 */

import { type PipelineError, pipelineError } from '../errors'
import type { PipelineLimits } from '../operation'
import type { RunOutput } from '../runner'
import type { Pipeline } from '../types'
import type { JobId, RunStage, WorkerRequest, WorkerResponse } from './protocol'

export type RunHandlers = {
  readonly onProgress?: (stage: RunStage) => void
}

type PendingJob = {
  readonly resolve: (output: RunOutput) => void
  readonly reject: (error: PipelineError) => void
  readonly onProgress: (stage: RunStage) => void
}

export class PipelineClient {
  private worker: Worker | undefined
  private readonly pending = new Map<JobId, PendingJob>()
  private nextId = 0

  /**
   * Runs one file. Rejects with a typed PipelineError, never a raw Error, so callers
   * can render `message` and branch on `code` without normalising first.
   */
  run(
    fileName: string,
    blob: Blob,
    pipeline: Pipeline,
    limits: PipelineLimits,
    handlers: RunHandlers = {},
  ): { id: JobId; result: Promise<RunOutput> } {
    const id = `job-${this.nextId++}`

    const result = new Promise<RunOutput>((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject,
        onProgress: handlers.onProgress ?? (() => {}),
      })

      const request: WorkerRequest = { type: 'run', id, fileName, blob, pipeline, limits }
      this.ensureWorker().postMessage(request)
    })

    return { id, result }
  }

  cancel(id: JobId): void {
    if (!this.pending.has(id)) return
    this.worker?.postMessage({ type: 'cancel', id } satisfies WorkerRequest)
  }

  cancelAll(): void {
    for (const id of this.pending.keys()) {
      this.cancel(id)
    }
  }

  /** Releases the worker. Safe to call more than once. */
  dispose(): void {
    this.failAllPending(pipelineError('CANCELLED'))
    this.worker?.terminate()
    this.worker = undefined
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker

    const worker = new Worker(new URL('./pipeline.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      this.handleResponse(event.data)
    })

    // Fires when the worker itself dies — an uncaught error or an out-of-memory
    // kill. Without this the batch would sit at "processing" forever.
    worker.addEventListener('error', () => {
      this.worker?.terminate()
      this.worker = undefined
      this.failAllPending(pipelineError('WORKER_CRASHED', { stage: 'transform' }))
    })

    this.worker = worker
    return worker
  }

  private handleResponse(response: WorkerResponse): void {
    const job = this.pending.get(response.id)
    if (!job) return

    switch (response.type) {
      case 'progress':
        job.onProgress(response.stage)
        return
      case 'done':
        this.pending.delete(response.id)
        job.resolve(response.output)
        return
      case 'failed':
        this.pending.delete(response.id)
        job.reject(response.error)
        return
    }
  }

  private failAllPending(error: PipelineError): void {
    const jobs = [...this.pending.values()]
    this.pending.clear()
    for (const job of jobs) {
      job.reject(error)
    }
  }
}
