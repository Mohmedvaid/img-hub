/**
 * Decoding: bytes in, pixels out.
 *
 * Uses the browser's own decoder via `createImageBitmap` rather than a WASM codec.
 * That is a deliberate split from encoding, and it wins on three counts:
 *
 *   1. `imageOrientation: 'from-image'` bakes the EXIF Orientation tag into the
 *      pixels for us. This is not a nicety — stripping EXIF is on by default, and
 *      removing the tag without rotating the pixels leaves every portrait phone
 *      photo sideways. See ADR-0006.
 *   2. It decodes every format the browser supports, including HEIC on Safari,
 *      with no download.
 *   3. It is hardware accelerated, and it halves the WASM payload since only the
 *      encoders need shipping.
 *
 * Compression quality is what justifies WASM codecs, and quality is an encode-side
 * concern. Decoding is exact either way.
 */

import { fail, normaliseThrown, ok, type Result } from '../errors'
import type { PipelineLimits } from '../operation'

export type DecodedImage = {
  readonly bitmap: ImageBitmap
  readonly width: number
  readonly height: number
}

/**
 * Decodes a file into an oriented bitmap.
 *
 * Dimensions are checked after decode but before any canvas is allocated, because a
 * decompression bomb is small on disk and enormous in memory. `createImageBitmap`
 * itself is comparatively cheap; the canvas that follows is what would exhaust the
 * device.
 */
export async function decodeImage(
  blob: Blob,
  limits: PipelineLimits,
): Promise<Result<DecodedImage>> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob, {
      imageOrientation: 'from-image',
      // Applies the source's colour profile and converts to sRGB. Stated rather than
      // left to the default, because it is a real decision: sRGB is what browsers
      // assume, and no encoder here can write a profile back out, so converting on
      // the way in is what keeps colours correct. See P1-11.
      colorSpaceConversion: 'default',
    })
  } catch (thrown) {
    return { ok: false, error: normaliseThrown(thrown, 'decode') }
  }

  const { width, height } = bitmap

  if (width < 1 || height < 1) {
    bitmap.close()
    return fail('DECODE_FAILED', {
      detail: `degenerate dimensions ${width}x${height}`,
      stage: 'decode',
    })
  }

  if (width > limits.maxWidth || height > limits.maxHeight) {
    bitmap.close()
    return fail('DIMENSIONS_TOO_LARGE', {
      message: `This image is ${width.toLocaleString()}×${height.toLocaleString()}px. The maximum is ${limits.maxWidth.toLocaleString()}×${limits.maxHeight.toLocaleString()}px.`,
      stage: 'decode',
    })
  }

  if (width * height > limits.maxPixels) {
    bitmap.close()
    return fail('DIMENSIONS_TOO_LARGE', {
      message: `This image is ${((width * height) / 1_000_000).toFixed(1)} megapixels. The maximum is ${(limits.maxPixels / 1_000_000).toFixed(0)}.`,
      stage: 'decode',
    })
  }

  return ok({ bitmap, width, height })
}
