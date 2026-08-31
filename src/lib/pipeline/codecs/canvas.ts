/**
 * Canvas helpers shared by the geometry operations.
 *
 * Kept here rather than in any one operation, because operations must not import
 * each other (ADR-0005). Shared pixel plumbing belongs in a shared module.
 */

import { fail, normaliseThrown, ok, type Result } from '../errors'

/**
 * Allocates an OffscreenCanvas and its 2D context together, since neither is useful
 * alone and both can fail on a device that is out of memory.
 */
export function createCanvas(
  width: number,
  height: number,
): Result<{ canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D }> {
  try {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', {
      // The pipeline reads pixels back on every step, so tell the browser to keep
      // them in an accessible buffer rather than optimising for display.
      willReadFrequently: true,
    })

    if (!context) {
      return fail('TRANSFORM_FAILED', {
        detail: 'OffscreenCanvas returned no 2D context',
        stage: 'transform',
      })
    }

    return ok({ canvas, context })
  } catch (thrown) {
    return { ok: false, error: normaliseThrown(thrown, 'transform') }
  }
}

/**
 * Enables the browser's best downscaling filter.
 *
 * Without this, a large downscale samples rather than averages and produces visible
 * aliasing on detailed images — the single most obvious quality difference between a
 * naive resizer and a good one.
 */
export function enableSmoothScaling(context: OffscreenCanvasRenderingContext2D): void {
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
}
