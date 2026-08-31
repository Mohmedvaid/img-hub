import { describe, expect, it } from 'vitest'
import { type BatchFile, batchReducer, batchTotals, initialBatch } from './batch'

function fakeFile(name: string, size = 1000): File {
  return new File([new Uint8Array(size)], name, { type: 'image/png' })
}

function withFiles(names: string[]) {
  return batchReducer(initialBatch, { type: 'add', files: names.map((n) => fakeFile(n)), max: 50 })
}

describe('adding files', () => {
  it('queues everything that was added', () => {
    const state = withFiles(['a.png', 'b.png'])

    expect(state.files).toHaveLength(2)
    expect(state.files.every((entry) => entry.status.kind === 'queued')).toBe(true)
  })

  it('gives every file a distinct id even when names repeat', () => {
    const state = withFiles(['same.png', 'same.png', 'same.png'])
    const ids = state.files.map((entry) => entry.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('appends rather than replacing, so a second drop adds to the batch', () => {
    const first = withFiles(['a.png'])
    const second = batchReducer(first, { type: 'add', files: [fakeFile('b.png')], max: 50 })

    expect(second.files.map((entry) => entry.file.name)).toEqual(['a.png', 'b.png'])
  })

  it('stops at the batch cap instead of accepting an unbounded drop', () => {
    const state = batchReducer(initialBatch, {
      type: 'add',
      files: Array.from({ length: 80 }, (_, i) => fakeFile(`${i}.png`)),
      max: 50,
    })

    expect(state.files).toHaveLength(50)
  })

  it('accepts nothing more once the cap is reached', () => {
    const full = batchReducer(initialBatch, {
      type: 'add',
      files: Array.from({ length: 50 }, (_, i) => fakeFile(`${i}.png`)),
      max: 50,
    })
    const after = batchReducer(full, { type: 'add', files: [fakeFile('extra.png')], max: 50 })

    expect(after.files).toHaveLength(50)
  })
})

describe('per-file outcomes', () => {
  it('records a failure against one file and leaves the others alone', () => {
    const state = withFiles(['a.png', 'b.png', 'c.png'])
    const target = state.files[1]?.id ?? ''

    const after = batchReducer(state, {
      type: 'failed',
      id: target,
      error: { code: 'DECODE_FAILED', message: 'broken', retryable: false },
    })

    expect(after.files[1]?.status.kind).toBe('failed')
    expect(after.files[0]?.status.kind).toBe('queued')
    expect(after.files[2]?.status.kind).toBe('queued')
  })

  it('ignores an update for a file that was already removed', () => {
    const state = withFiles(['a.png'])

    const after = batchReducer(state, {
      type: 'progress',
      id: 'not-a-real-id',
      stage: 'encode',
    })

    expect(after.files[0]?.status.kind).toBe('queued')
  })

  it('resets outcomes on re-run but keeps the files', () => {
    const state = withFiles(['a.png', 'b.png'])
    const failed = batchReducer(state, {
      type: 'failed',
      id: state.files[0]?.id ?? '',
      error: { code: 'DECODE_FAILED', message: 'broken', retryable: false },
    })

    const rerun = batchReducer(failed, { type: 'start' })

    expect(rerun.files).toHaveLength(2)
    expect(rerun.files.every((entry) => entry.status.kind === 'queued')).toBe(true)
    expect(rerun.running).toBe(true)
  })
})

describe('batchTotals', () => {
  const output = (bytesIn: number, bytesOut: number) => ({
    blob: new Blob(),
    fileName: 'x.webp',
    format: 'webp' as const,
    width: 10,
    height: 10,
    bytesIn,
    bytesOut,
  })

  it('sums only the files that succeeded', () => {
    const files: BatchFile[] = [
      { id: '1', file: fakeFile('a.png'), status: { kind: 'done', output: output(1000, 400) } },
      {
        id: '2',
        file: fakeFile('b.png'),
        status: {
          kind: 'failed',
          error: { code: 'DECODE_FAILED', message: 'x', retryable: false },
        },
      },
      { id: '3', file: fakeFile('c.png'), status: { kind: 'queued' } },
    ]

    expect(batchTotals(files)).toMatchObject({
      done: 1,
      failed: 1,
      bytesIn: 1000,
      bytesOut: 400,
      savedPercent: 60,
    })
  })

  it('reports a negative saving when re-encoding made files bigger', () => {
    const files: BatchFile[] = [
      { id: '1', file: fakeFile('a.png'), status: { kind: 'done', output: output(500, 800) } },
    ]

    expect(batchTotals(files).savedPercent).toBeLessThan(0)
  })

  it('does not divide by zero on an empty batch', () => {
    expect(batchTotals([]).savedPercent).toBe(0)
  })
})
