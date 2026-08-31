import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PipelineLimits } from '../operation'
import { decodeImage } from './decode'

const limits: PipelineLimits = {
  maxFileBytes: 50_000_000,
  maxWidth: 20_000,
  maxHeight: 20_000,
  maxPixels: 100_000_000,
  enabledOutputFormats: ['webp'],
}

const close = vi.fn()

/**
 * jsdom has no image decoder. Stubbing `createImageBitmap` is enough because what is
 * under test is the guarding around it — the options it is asked for, and the limits
 * applied to what comes back. Actual decoding is a browser concern.
 */
function decodesTo(width: number, height: number) {
  const stub = vi.fn(async () => ({ width, height, close }) as unknown as ImageBitmap)
  vi.stubGlobal('createImageBitmap', stub)
  return stub
}

function throwsOnDecode(thrown: unknown) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.reject(thrown)),
  )
}

const blob = new Blob([new Uint8Array(4)], { type: 'image/jpeg' })

afterEach(() => {
  vi.unstubAllGlobals()
  close.mockClear()
})

describe('decodeImage', () => {
  it('asks the browser to bake in the EXIF orientation', async () => {
    // Not optional: metadata stripping is on by default, so a decode that left the
    // orientation tag to the file would hand back every phone photo sideways.
    const decode = decodesTo(400, 300)

    await decodeImage(blob, limits)

    expect(decode).toHaveBeenCalledWith(blob, {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'default',
    })
  })

  it('returns the bitmap and its dimensions', async () => {
    decodesTo(400, 300)

    const result = await decodeImage(blob, limits)

    expect(result).toMatchObject({ ok: true, value: { width: 400, height: 300 } })
    expect(close).not.toHaveBeenCalled()
  })

  it('turns a decoder failure into a typed decode error', async () => {
    throwsOnDecode(new Error('The source image cannot be decoded'))

    const result = await decodeImage(blob, limits)

    expect(result).toMatchObject({ ok: false, error: { code: 'DECODE_FAILED', stage: 'decode' } })
  })

  it('recognises an allocation failure as running out of memory, not a corrupt file', async () => {
    throwsOnDecode(new RangeError('Array buffer allocation failed'))

    const result = await decodeImage(blob, limits)

    expect(result).toMatchObject({ ok: false, error: { code: 'OUT_OF_MEMORY', retryable: true } })
  })

  it('rejects a bitmap with no pixels, and releases it', async () => {
    decodesTo(0, 0)

    const result = await decodeImage(blob, limits)

    expect(result).toMatchObject({ ok: false, error: { code: 'DECODE_FAILED' } })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('rejects an image wider than the limit, naming both sizes', async () => {
    decodesTo(25_000, 100)

    const result = await decodeImage(blob, limits)

    expect(result).toMatchObject({ ok: false, error: { code: 'DIMENSIONS_TOO_LARGE' } })
    if (!result.ok) expect(result.error.message).toMatch(/25,000×100px.*20,000×20,000px/)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('rejects an image taller than the limit', async () => {
    decodesTo(100, 25_000)

    expect(await decodeImage(blob, limits)).toMatchObject({
      ok: false,
      error: { code: 'DIMENSIONS_TOO_LARGE' },
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('rejects a decompression bomb that fits both axes but not the pixel budget', async () => {
    // 15,000 x 15,000 is inside 20,000 on each axis and still 225 megapixels.
    decodesTo(15_000, 15_000)

    const result = await decodeImage(blob, limits)

    expect(result).toMatchObject({ ok: false, error: { code: 'DIMENSIONS_TOO_LARGE' } })
    if (!result.ok) expect(result.error.message).toMatch(/225.0 megapixels.*maximum is 100/)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('accepts an image sitting exactly on the limits', async () => {
    decodesTo(10_000, 10_000)

    expect(await decodeImage(blob, limits)).toMatchObject({ ok: true })
    expect(close).not.toHaveBeenCalled()
  })
})
