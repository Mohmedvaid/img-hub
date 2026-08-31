/**
 * Encoding: pixels in, a file out.
 *
 * Unlike decoding, this uses WASM codecs rather than the browser's own encoder.
 * Compression quality is the product — MozJPEG and libwebp produce visibly smaller
 * files than `canvas.convertToBlob` at the same visual quality, and that difference
 * is the reason to build this at all. See ADR-0002.
 *
 * Codecs are imported dynamically so a visitor converting to WebP never downloads
 * the JPEG encoder. Each module is fetched once and cached by the browser.
 */

import { fail, normaliseThrown, ok, type Result } from '../errors'
import { formatInfo, type ImageFormat } from '../formats'

export type EncodedImage = {
  readonly blob: Blob
  readonly format: ImageFormat
  readonly bytes: number
}

/**
 * Encodes pixels into the target format.
 *
 * `quality` is ignored by lossless formats. It is not comparable across formats:
 * WebP 75 and JPEG 75 are different amounts of loss.
 */
export async function encodeImage(
  image: ImageData,
  format: ImageFormat,
  quality: number,
): Promise<Result<EncodedImage>> {
  const info = formatInfo(format)

  if (!info.canEncode) {
    return fail('UNSUPPORTED_OUTPUT_FORMAT', {
      message: `${info.label} can be read but not written.`,
      stage: 'encode',
    })
  }

  try {
    const buffer = await encodeWith(image, format, quality)
    if (!buffer) {
      return fail('UNSUPPORTED_OUTPUT_FORMAT', {
        message: `${info.label} output isn't available yet.`,
        stage: 'encode',
      })
    }

    const blob = new Blob([buffer], { type: info.mimeType })
    return ok({ blob, format, bytes: blob.size })
  } catch (thrown) {
    return { ok: false, error: normaliseThrown(thrown, 'encode') }
  }
}

/**
 * Returns undefined for a format with no encoder wired up yet, rather than throwing,
 * so the caller can turn it into a typed error with the format's real name.
 */
async function encodeWith(
  image: ImageData,
  format: ImageFormat,
  quality: number,
): Promise<ArrayBuffer | undefined> {
  switch (format) {
    case 'jpeg': {
      const { default: encode } = await import('@jsquash/jpeg/encode')
      return encode(image, { quality })
    }
    case 'webp': {
      const { default: encode } = await import('@jsquash/webp/encode')
      return encode(image, { quality })
    }
    case 'png': {
      // PNG is lossless, so quality does not apply. Re-encoding still shrinks most
      // files by dropping whatever the source tool left behind.
      const { default: encode } = await import('@jsquash/png/encode')
      return encode(image)
    }
    default:
      return undefined
  }
}
