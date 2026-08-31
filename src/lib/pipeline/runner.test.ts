import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCanvas } from './codecs/canvas'
import { decodeImage } from './codecs/decode'
import { encodeImage } from './codecs/encode'
import { fail, ok } from './errors'
import type { PipelineLimits } from './operation'
import { formatBytes, outputFileName, runPipeline } from './runner'
import type { Pipeline } from './types'

/**
 * The codecs are mocked at the module boundary.
 *
 * What is under test here is orchestration — validate, then decode, then transforms
 * in the fixed order, then encode, stopping at the first failure and never throwing.
 * The codecs themselves need a real canvas and a real WASM encoder, so they are
 * exercised by the browser smoke suite instead.
 */
vi.mock('./codecs/decode', () => ({ decodeImage: vi.fn() }))
vi.mock('./codecs/encode', () => ({ encodeImage: vi.fn() }))
vi.mock('./codecs/canvas', () => ({ createCanvas: vi.fn(), enableSmoothScaling: vi.fn() }))

const limits: PipelineLimits = {
  maxFileBytes: 1_000_000,
  maxWidth: 10_000,
  maxHeight: 10_000,
  maxPixels: 1_000_000,
  enabledOutputFormats: ['jpeg', 'png', 'webp'],
}

const stripExif: Pipeline = {
  transforms: [{ kind: 'metadata', stripExif: true }],
  output: { format: 'source', quality: 80 },
}

const jpegFile = (bytes = 10) => ({
  fileName: 'holiday.jpg',
  blob: new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
})

const close = vi.fn()

function decodesTo(width = 4, height = 3) {
  vi.mocked(decodeImage).mockResolvedValue(
    ok({ bitmap: { close } as unknown as ImageBitmap, width, height }),
  )
}

function canvasReturns(image: ImageData) {
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => image),
  } as unknown as OffscreenCanvasRenderingContext2D

  vi.mocked(createCanvas).mockReturnValue(ok({ canvas: {} as OffscreenCanvas, context }))
  return context
}

/**
 * A canvas whose getImageData honours its arguments, so chaining operations produces
 * real dimensions. Pixels are not simulated; only geometry is.
 */
function trackingCanvas() {
  vi.mocked(createCanvas).mockImplementation((_width, _height) =>
    ok({
      canvas: {} as OffscreenCanvas,
      context: {
        drawImage: vi.fn(),
        putImageData: vi.fn(),
        getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => new ImageData(w, h)),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
      } as unknown as OffscreenCanvasRenderingContext2D,
    }),
  )
}

function encodesTo(bytes: number) {
  vi.mocked(encodeImage).mockResolvedValue(
    ok({ blob: new Blob([new Uint8Array(bytes)]), format: 'jpeg', bytes }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  decodesTo()
  canvasReturns(new ImageData(4, 3))
  encodesTo(5)
})

describe('runPipeline', () => {
  it('runs a file through and reports both sizes and the final dimensions', async () => {
    const result = await runPipeline(jpegFile(100), stripExif, limits)

    expect(result).toMatchObject({
      ok: true,
      value: {
        fileName: 'holiday.jpg',
        format: 'jpeg',
        width: 4,
        height: 3,
        bytesIn: 100,
        bytesOut: 5,
      },
    })
  })

  it('keeps the source format when the pipeline asks for "source"', async () => {
    await runPipeline(jpegFile(), stripExif, limits)

    expect(encodeImage).toHaveBeenCalledWith(expect.anything(), 'jpeg', 80)
  })

  it('converts when the pipeline names a format, renaming the file to match', async () => {
    const convert: Pipeline = { ...stripExif, output: { format: 'webp', quality: 70 } }

    const result = await runPipeline(jpegFile(), convert, limits)

    expect(encodeImage).toHaveBeenCalledWith(expect.anything(), 'webp', 70)
    expect(result).toMatchObject({ ok: true, value: { fileName: 'holiday.webp' } })
  })

  it('reports each stage as it starts, so a slow encode does not look like a hang', async () => {
    const onProgress = vi.fn()

    await runPipeline(jpegFile(), stripExif, limits, onProgress)

    expect(onProgress.mock.calls.map(([stage]) => stage)).toEqual(['decode', 'transform', 'encode'])
  })

  it('applies transforms in pipeline order, not the order they were listed', async () => {
    // Crop before resize is a correctness guarantee (ADR-0006), and the two produce
    // different dimensions in either order, so the output size is the proof.
    //
    //   crop 8x4 -> 8x2, then contain(width 4) -> 4x1
    //   contain(width 4) on 8x4 -> 4x2, then crop clamps to        -> 4x2
    decodesTo(8, 4)
    trackingCanvas()

    const listedBackwards: Pipeline = {
      transforms: [
        { kind: 'resize', mode: 'contain', width: 4, allowUpscale: false },
        { kind: 'crop', x: 0, y: 0, width: 8, height: 2 },
      ],
      output: { format: 'jpeg', quality: 80 },
    }

    const result = await runPipeline(jpegFile(), listedBackwards, limits)

    expect(result).toMatchObject({ ok: true, value: { width: 4, height: 1 } })
  })

  it('releases the decoded bitmap as soon as its pixels are on the canvas', async () => {
    await runPipeline(jpegFile(), stripExif, limits)

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('rejects a pipeline the limits do not allow before decoding anything', async () => {
    const tooBig: Pipeline = {
      transforms: [{ kind: 'crop', x: 0, y: 0, width: 2000, height: 2000 }],
      output: { format: 'jpeg', quality: 80 },
    }

    const result = await runPipeline(jpegFile(), tooBig, limits)

    expect(result).toMatchObject({ ok: false, error: { code: 'DIMENSIONS_TOO_LARGE' } })
    expect(decodeImage).not.toHaveBeenCalled()
  })

  it('rejects a file whose type and name both fail to identify a format', async () => {
    const result = await runPipeline(
      { fileName: 'notes', blob: new Blob(['x'], { type: 'application/pdf' }) },
      stripExif,
      limits,
    )

    expect(result).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_INPUT_FORMAT' } })
    expect(decodeImage).not.toHaveBeenCalled()
  })

  it('falls back to the extension when the browser reported no type', async () => {
    const result = await runPipeline(
      { fileName: 'holiday.png', blob: new Blob([new Uint8Array(10)]) },
      stripExif,
      limits,
    )

    expect(result).toMatchObject({ ok: true, value: { format: 'png' } })
  })

  it('names both the file size and the limit when a file is too large', async () => {
    const result = await runPipeline(jpegFile(2_000_000), stripExif, limits)

    expect(result).toMatchObject({ ok: false, error: { code: 'FILE_TOO_LARGE' } })
    if (!result.ok) expect(result.error.message).toBe('This file is 1.9 MB. The maximum is 977 KB.')
  })

  it('passes a decode failure straight back', async () => {
    vi.mocked(decodeImage).mockResolvedValue(fail('DECODE_FAILED', { stage: 'decode' }))

    const result = await runPipeline(jpegFile(), stripExif, limits)

    expect(result).toMatchObject({ ok: false, error: { code: 'DECODE_FAILED' } })
    expect(encodeImage).not.toHaveBeenCalled()
  })

  it('releases the bitmap when the canvas cannot be allocated', async () => {
    vi.mocked(createCanvas).mockReturnValue(fail('OUT_OF_MEMORY', { stage: 'transform' }))

    const result = await runPipeline(jpegFile(), stripExif, limits)

    expect(result).toMatchObject({ ok: false, error: { code: 'OUT_OF_MEMORY' } })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('stops at the first transform that fails', async () => {
    const outOfBounds: Pipeline = {
      transforms: [{ kind: 'crop', x: 9999, y: 9999, width: 10, height: 10 }],
      output: { format: 'jpeg', quality: 80 },
    }

    const result = await runPipeline(jpegFile(), outOfBounds, limits)

    expect(result).toMatchObject({ ok: false, error: { code: 'TRANSFORM_FAILED' } })
    expect(encodeImage).not.toHaveBeenCalled()
  })

  it('passes an encode failure straight back', async () => {
    vi.mocked(encodeImage).mockResolvedValue(fail('ENCODE_FAILED', { stage: 'encode' }))

    const result = await runPipeline(jpegFile(), stripExif, limits)

    expect(result).toMatchObject({ ok: false, error: { code: 'ENCODE_FAILED' } })
  })
})

describe('outputFileName', () => {
  it('swaps the extension for the output format, keeping the user’s own name', () => {
    expect(outputFileName('holiday snap.jpeg', 'webp')).toBe('holiday snap.webp')
  })

  it('adds an extension to a file that had none', () => {
    expect(outputFileName('holiday', 'png')).toBe('holiday.png')
  })

  it('keeps dots that are part of the name', () => {
    expect(outputFileName('v1.2.final.png', 'jpeg')).toBe('v1.2.final.jpg')
  })

  it('falls back to a usable name for a file that is nothing but an extension', () => {
    expect(outputFileName('.gitignore', 'png')).toBe('image.png')
  })

  it('leaves a path-like name alone rather than treating a directory dot as one', () => {
    expect(outputFileName('my.folder/holiday', 'webp')).toBe('my.folder/holiday.webp')
  })
})

describe('formatBytes', () => {
  it('uses bytes below a kilobyte', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('uses whole kilobytes below a megabyte', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(500_000)).toBe('488 KB')
  })

  it('uses one decimal place for megabytes', () => {
    expect(formatBytes(2_000_000)).toBe('1.9 MB')
  })
})
