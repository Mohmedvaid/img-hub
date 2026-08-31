import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fail, ok } from '../errors'
import type { PipelineLimits } from '../operation'
import { runPipeline } from '../runner'
import type { Pipeline } from '../types'
import type { WorkerRequest, WorkerResponse } from './protocol'

vi.mock('../runner', () => ({ runPipeline: vi.fn() }))

const pipeline: Pipeline = { transforms: [], output: { format: 'webp', quality: 80 } }
const limits: PipelineLimits = {
  maxFileBytes: 1000,
  maxWidth: 100,
  maxHeight: 100,
  maxPixels: 10_000,
  enabledOutputFormats: ['webp'],
}

const output = {
  blob: new Blob(['x']),
  fileName: 'a.webp',
  format: 'webp' as const,
  width: 10,
  height: 10,
  bytesIn: 100,
  bytesOut: 50,
}

let posted: WorkerResponse[] = []
let deliver: (request: WorkerRequest) => void

/**
 * The worker registers its listener at import time and talks through `self`, so the
 * global is replaced before a fresh copy of the module is loaded for each test.
 */
async function loadWorker() {
  posted = []
  const listeners: Array<(event: MessageEvent<WorkerRequest>) => void> = []

  vi.stubGlobal('self', {
    addEventListener(type: string, listener: (event: MessageEvent<WorkerRequest>) => void) {
      if (type === 'message') listeners.push(listener)
    },
    postMessage(message: WorkerResponse) {
      posted.push(message)
    },
  })

  vi.resetModules()
  await import('./pipeline.worker')

  deliver = (request) => {
    for (const listener of listeners) listener({ data: request } as MessageEvent<WorkerRequest>)
  }
}

const runRequest = (id: string): WorkerRequest => ({
  type: 'run',
  id,
  fileName: 'a.png',
  blob: new Blob(['x']),
  pipeline,
  limits,
})

/** Lets the worker's own promise chain settle before the posted messages are read. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(runPipeline).mockResolvedValue(ok(output))
  await loadWorker()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pipeline worker', () => {
  it('runs the requested pipeline over the requested file', async () => {
    deliver(runRequest('job-1'))
    await settle()

    expect(runPipeline).toHaveBeenCalledWith(
      { fileName: 'a.png', blob: expect.any(Blob) },
      pipeline,
      limits,
      expect.any(Function),
    )
  })

  it('posts the output back against the job id', async () => {
    deliver(runRequest('job-1'))
    await settle()

    expect(posted).toEqual([{ type: 'done', id: 'job-1', output }])
  })

  it('relays progress as each stage starts', async () => {
    vi.mocked(runPipeline).mockImplementation(async (_input, _pipeline, _limits, onProgress) => {
      onProgress?.('decode')
      onProgress?.('encode')
      return ok(output)
    })

    deliver(runRequest('job-1'))
    await settle()

    expect(posted).toEqual([
      { type: 'progress', id: 'job-1', stage: 'decode' },
      { type: 'progress', id: 'job-1', stage: 'encode' },
      { type: 'done', id: 'job-1', output },
    ])
  })

  it('passes a failed run back as a failure rather than a crash', async () => {
    vi.mocked(runPipeline).mockResolvedValue(fail('DECODE_FAILED', { stage: 'decode' }))

    deliver(runRequest('job-1'))
    await settle()

    expect(posted).toMatchObject([
      { type: 'failed', id: 'job-1', error: { code: 'DECODE_FAILED' } },
    ])
  })

  it('catches anything that escapes the runner, so the page never hangs', async () => {
    vi.mocked(runPipeline).mockRejectedValue(new RangeError('out of memory'))

    deliver(runRequest('job-1'))
    await settle()

    expect(posted).toMatchObject([
      { type: 'failed', id: 'job-1', error: { code: 'OUT_OF_MEMORY' } },
    ])
  })

  it('discards the result of a job cancelled while it was running', async () => {
    let finish: (() => void) | undefined
    vi.mocked(runPipeline).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(ok(output))
        }),
    )

    deliver(runRequest('job-1'))
    deliver({ type: 'cancel', id: 'job-1' })
    finish?.()
    await settle()

    expect(posted).toEqual([
      {
        type: 'failed',
        id: 'job-1',
        error: { code: 'CANCELLED', message: 'Cancelled.', retryable: true },
      },
    ])
  })

  it('stops relaying progress once a job is cancelled', async () => {
    vi.mocked(runPipeline).mockImplementation(async (_input, _pipeline, _limits, onProgress) => {
      onProgress?.('encode')
      return ok(output)
    })

    deliver({ type: 'cancel', id: 'job-1' })
    deliver(runRequest('job-1'))
    await settle()

    expect(posted.some((message) => message.type === 'progress')).toBe(false)
  })

  it('forgets a cancellation afterwards, so the id can be reused', async () => {
    deliver({ type: 'cancel', id: 'job-1' })
    deliver(runRequest('job-1'))
    await settle()
    posted = []

    deliver(runRequest('job-1'))
    await settle()

    expect(posted).toEqual([{ type: 'done', id: 'job-1', output }])
  })

  it('leaves other jobs alone when one is cancelled', async () => {
    deliver({ type: 'cancel', id: 'job-1' })
    deliver(runRequest('job-2'))
    await settle()

    expect(posted).toEqual([{ type: 'done', id: 'job-2', output }])
  })
})
