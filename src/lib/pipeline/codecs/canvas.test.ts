import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCanvas, enableSmoothScaling } from './canvas'

/**
 * jsdom has no OffscreenCanvas, so these cover the guarding around it: the options it
 * is asked for, and both ways it can fail. Real rasterisation is a browser concern and
 * is covered by the smoke suite.
 */
function offscreenCanvasReturning(context: unknown) {
  const getContext = vi.fn(() => context)
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext = getContext
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
    },
  )
  return getContext
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createCanvas', () => {
  it('allocates the canvas and its context together', () => {
    const context = { fillRect: vi.fn() }
    offscreenCanvasReturning(context)

    const result = createCanvas(400, 300)

    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.value.canvas).toMatchObject({ width: 400, height: 300 })
      expect(result.value.context).toBe(context)
    }
  })

  it('asks for a buffer it can read back from', () => {
    // The pipeline reads pixels after every step; without this the browser optimises
    // for display and every read is a stall.
    const getContext = offscreenCanvasReturning({})

    createCanvas(10, 10)

    expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true })
  })

  it('fails cleanly when the browser gives back no context', () => {
    offscreenCanvasReturning(null)

    expect(createCanvas(10, 10)).toMatchObject({
      ok: false,
      error: { code: 'TRANSFORM_FAILED', stage: 'transform' },
    })
  })

  it('turns an allocation failure into a typed error rather than throwing', () => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor() {
          throw new RangeError('Array buffer allocation failed')
        }
      },
    )

    expect(createCanvas(50_000, 50_000)).toMatchObject({
      ok: false,
      error: { code: 'OUT_OF_MEMORY', retryable: true },
    })
  })
})

describe('enableSmoothScaling', () => {
  it('turns on the best downscaling filter the browser has', () => {
    const context = {} as OffscreenCanvasRenderingContext2D

    enableSmoothScaling(context)

    expect(context.imageSmoothingEnabled).toBe(true)
    expect(context.imageSmoothingQuality).toBe('high')
  })
})
