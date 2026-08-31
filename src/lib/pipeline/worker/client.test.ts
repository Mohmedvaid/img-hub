import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PipelineError } from '../errors'
import type { PipelineLimits } from '../operation'
import type { RunOutput } from '../runner'
import type { Pipeline } from '../types'
import { PipelineClient } from './client'
import type { WorkerRequest, WorkerResponse } from './protocol'

/**
 * A stand-in for the real Worker.
 *
 * The point of these tests is the correlation and crash-recovery logic in the
 * client, not the pipeline itself, so the worker is reduced to something that
 * records what it was sent and lets a test post responses back.
 */
class FakeWorker {
  static instances: FakeWorker[] = []

  readonly posted: WorkerRequest[] = []
  terminated = false
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>()

  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    FakeWorker.instances.push(this)
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? new Set()
    existing.add(listener)
    this.listeners.set(type, existing)
  }

  postMessage(request: WorkerRequest): void {
    this.posted.push(request)
  }

  terminate(): void {
    this.terminated = true
  }

  /** Delivers a response as the real worker would. */
  respond(data: WorkerResponse): void {
    for (const listener of this.listeners.get('message') ?? []) listener({ data })
  }

  /** Simulates the worker dying — an uncaught error or an out-of-memory kill. */
  die(): void {
    for (const listener of this.listeners.get('error') ?? []) listener(new Event('error'))
  }
}

const pipeline: Pipeline = {
  transforms: [{ kind: 'metadata', stripExif: true }],
  output: { format: 'webp', quality: 80 },
}

const limits: PipelineLimits = {
  maxFileBytes: 1000,
  maxWidth: 100,
  maxHeight: 100,
  maxPixels: 10_000,
  enabledOutputFormats: ['webp'],
}

const outputFor = (fileName: string): RunOutput => ({
  blob: new Blob(['x']),
  fileName,
  format: 'webp',
  width: 10,
  height: 10,
  bytesIn: 100,
  bytesOut: 50,
})

function start(client: PipelineClient, name = 'a.png', handlers = {}) {
  return client.run(name, new Blob(['x']), pipeline, limits, handlers)
}

const latest = () => FakeWorker.instances.at(-1) as FakeWorker

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PipelineClient', () => {
  it('spawns the worker on the first run, not on construction', () => {
    const client = new PipelineClient()
    expect(FakeWorker.instances).toHaveLength(0)

    start(client)

    expect(FakeWorker.instances).toHaveLength(1)
    expect(latest().options).toEqual({ type: 'module' })
  })

  it('posts the job with everything the worker needs to run it', () => {
    const client = new PipelineClient()
    const { id } = start(client, 'photo.png')

    expect(latest().posted).toEqual([
      { type: 'run', id, fileName: 'photo.png', blob: expect.any(Blob), pipeline, limits },
    ])
  })

  it('reuses one worker across jobs and gives each job its own id', () => {
    const client = new PipelineClient()
    const first = start(client, 'a.png')
    const second = start(client, 'b.png')

    expect(FakeWorker.instances).toHaveLength(1)
    expect(first.id).not.toBe(second.id)
  })

  it('forwards progress to the job that asked for it', () => {
    const client = new PipelineClient()
    const onProgress = vi.fn()
    const { id } = start(client, 'a.png', { onProgress })

    latest().respond({ type: 'progress', id, stage: 'encode' })

    expect(onProgress).toHaveBeenCalledWith('encode')
  })

  it('resolves a job with the output the worker returned', async () => {
    const client = new PipelineClient()
    const { id, result } = start(client)

    latest().respond({ type: 'done', id, output: outputFor('a.webp') })

    await expect(result).resolves.toMatchObject({ fileName: 'a.webp' })
  })

  it('rejects with the typed error rather than a raw Error', async () => {
    const client = new PipelineClient()
    const { id, result } = start(client)

    const error: PipelineError = {
      code: 'DECODE_FAILED',
      message: "This file couldn't be read.",
      retryable: false,
    }
    latest().respond({ type: 'failed', id, error })

    await expect(result).rejects.toEqual(error)
  })

  it('routes each response to its own job when several are in flight', async () => {
    const client = new PipelineClient()
    const first = start(client, 'a.png')
    const second = start(client, 'b.png')

    latest().respond({ type: 'done', id: second.id, output: outputFor('b.webp') })
    latest().respond({ type: 'done', id: first.id, output: outputFor('a.webp') })

    await expect(first.result).resolves.toMatchObject({ fileName: 'a.webp' })
    await expect(second.result).resolves.toMatchObject({ fileName: 'b.webp' })
  })

  it('ignores a response for a job it does not know about', () => {
    const client = new PipelineClient()
    start(client)

    expect(() => latest().respond({ type: 'progress', id: 'stale', stage: 'decode' })).not.toThrow()
  })

  it('ignores a second response for a job already settled', async () => {
    const client = new PipelineClient()
    const { id, result } = start(client)

    latest().respond({ type: 'done', id, output: outputFor('a.webp') })
    await result

    expect(() =>
      latest().respond({
        type: 'failed',
        id,
        error: { code: 'DECODE_FAILED', message: 'x', retryable: false },
      }),
    ).not.toThrow()
  })

  it('asks the worker to cancel a job that is still pending', () => {
    const client = new PipelineClient()
    const { id } = start(client)

    client.cancel(id)

    expect(latest().posted.at(-1)).toEqual({ type: 'cancel', id })
  })

  it('does not send a cancel for a job that already finished', async () => {
    const client = new PipelineClient()
    const { id, result } = start(client)
    latest().respond({ type: 'done', id, output: outputFor('a.webp') })
    await result

    client.cancel(id)

    expect(latest().posted.filter((message) => message.type === 'cancel')).toHaveLength(0)
  })

  it('cancels every job in flight at once', () => {
    const client = new PipelineClient()
    const first = start(client, 'a.png')
    const second = start(client, 'b.png')

    client.cancelAll()

    expect(latest().posted.filter((message) => message.type === 'cancel')).toEqual([
      { type: 'cancel', id: first.id },
      { type: 'cancel', id: second.id },
    ])
  })

  it('fails everything in flight when the worker dies, rather than hanging', async () => {
    const client = new PipelineClient()
    const first = start(client, 'a.png')
    const second = start(client, 'b.png')

    latest().die()

    await expect(first.result).rejects.toMatchObject({ code: 'WORKER_CRASHED', retryable: true })
    await expect(second.result).rejects.toMatchObject({ code: 'WORKER_CRASHED' })
  })

  it('spawns a fresh worker for the next job after a crash', async () => {
    const client = new PipelineClient()
    const crashed = start(client)
    const dying = latest()
    dying.die()
    await expect(crashed.result).rejects.toMatchObject({ code: 'WORKER_CRASHED' })

    start(client, 'b.png')

    expect(dying.terminated).toBe(true)
    expect(FakeWorker.instances).toHaveLength(2)
    expect(latest()).not.toBe(dying)
  })

  it('releases the worker and fails pending jobs as cancelled on dispose', async () => {
    const client = new PipelineClient()
    const { result } = start(client)

    client.dispose()

    await expect(result).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(latest().terminated).toBe(true)
  })

  it('can be disposed more than once', () => {
    const client = new PipelineClient()
    start(client).result.catch(() => {})

    client.dispose()

    expect(() => client.dispose()).not.toThrow()
  })

  it('disposes cleanly when no worker was ever spawned', () => {
    expect(() => new PipelineClient().dispose()).not.toThrow()
    expect(FakeWorker.instances).toHaveLength(0)
  })
})
