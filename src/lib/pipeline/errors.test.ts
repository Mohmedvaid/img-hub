import { describe, expect, it } from 'vitest'
import { fail, normaliseThrown, ok, pipelineError } from './errors'

describe('Result constructors', () => {
  it('wraps a success value', () => {
    const result = ok(42)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(42)
  })

  it('carries the code and default copy on failure', () => {
    const result = fail('DECODE_FAILED')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('DECODE_FAILED')
      expect(result.error.message).toMatch(/couldn't be read/)
    }
  })
})

describe('pipelineError', () => {
  it('lets a caller override the message with something more actionable', () => {
    const error = pipelineError('FILE_TOO_LARGE', { message: 'Maximum size is 50 MB.' })

    expect(error.message).toBe('Maximum size is 50 MB.')
    expect(error.code).toBe('FILE_TOO_LARGE')
  })

  it('marks transient failures retryable and permanent ones not', () => {
    expect(pipelineError('OUT_OF_MEMORY').retryable).toBe(true)
    expect(pipelineError('WORKER_CRASHED').retryable).toBe(true)
    expect(pipelineError('UNSUPPORTED_INPUT_FORMAT').retryable).toBe(false)
    expect(pipelineError('DECODE_FAILED').retryable).toBe(false)
  })

  it('omits optional fields entirely rather than setting them undefined', () => {
    const error = pipelineError('CANCELLED')

    expect(error).not.toHaveProperty('detail')
    expect(error).not.toHaveProperty('cause')
  })
})

describe('normaliseThrown', () => {
  it('maps the failing stage onto the matching code', () => {
    expect(normaliseThrown(new Error('boom'), 'decode').code).toBe('DECODE_FAILED')
    expect(normaliseThrown(new Error('boom'), 'encode').code).toBe('ENCODE_FAILED')
    expect(normaliseThrown(new Error('boom'), 'transform').code).toBe('TRANSFORM_FAILED')
  })

  it('detects a RangeError as memory exhaustion', () => {
    expect(normaliseThrown(new RangeError('too big'), 'decode').code).toBe('OUT_OF_MEMORY')
  })

  it.each([
    'Out of memory',
    'Array buffer allocation failed',
    'WebAssembly.Memory(): could not allocate memory',
    'Aborted(OOM)',
    'Cannot allocate Wasm memory for new instance',
  ])('detects "%s" as memory exhaustion regardless of stage', (message) => {
    expect(normaliseThrown(new Error(message), 'encode').code).toBe('OUT_OF_MEMORY')
  })

  it('keeps technical detail out of the user-facing message', () => {
    const error = normaliseThrown(new Error('libwebp: invalid VP8 header at 0x4f'), 'decode')

    expect(error.message).not.toContain('VP8')
    expect(error.detail).toContain('VP8')
  })

  it('handles a thrown non-Error without losing information', () => {
    const error = normaliseThrown('just a string', 'decode')

    expect(error.code).toBe('DECODE_FAILED')
    expect(error.detail).toBe('just a string')
  })
})
