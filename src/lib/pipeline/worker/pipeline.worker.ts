/**
 * The worker entry point. Runs pipelines off the main thread so the UI keeps
 * responding while a 12-megapixel image is being encoded.
 *
 * Cancellation is cooperative and checked between stages. A WASM encode cannot be
 * interrupted once started, so cancelling during one takes effect when it returns —
 * the result is simply discarded rather than posted.
 */

/// <reference lib="webworker" />

import { normaliseThrown } from '../errors'
import { runPipeline } from '../runner'
import type { WorkerRequest, WorkerResponse } from './protocol'

const cancelled = new Set<string>()

function respond(message: WorkerResponse): void {
  self.postMessage(message)
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data

  if (request.type === 'cancel') {
    cancelled.add(request.id)
    return
  }

  void handleRun(request)
})

async function handleRun(request: Extract<WorkerRequest, { type: 'run' }>): Promise<void> {
  const { id, fileName, blob, pipeline, limits } = request

  try {
    const result = await runPipeline({ fileName, blob }, pipeline, limits, (stage) => {
      if (!cancelled.has(id)) respond({ type: 'progress', id, stage })
    })

    if (cancelled.has(id)) {
      cancelled.delete(id)
      respond({
        type: 'failed',
        id,
        error: { code: 'CANCELLED', message: 'Cancelled.', retryable: true },
      })
      return
    }

    if (result.ok) {
      respond({ type: 'done', id, output: result.value })
    } else {
      respond({ type: 'failed', id, error: result.error })
    }
  } catch (thrown) {
    // The runner returns Results, so reaching here means something escaped it —
    // most likely an allocation failure inside a codec.
    respond({ type: 'failed', id, error: normaliseThrown(thrown, 'transform') })
  } finally {
    cancelled.delete(id)
  }
}
