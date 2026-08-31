/**
 * Runs one pipeline over one file.
 *
 * Returns a Result and never throws, because a batch is many files and one corrupt
 * file must not abort the rest. The batch layer above calls this once per file and
 * records each outcome independently.
 */

import { createCanvas } from './codecs/canvas'
import { decodeImage } from './codecs/decode'
import { encodeImage } from './codecs/encode'
import { fail, ok, type Result } from './errors'
import { formatFromExtension, formatFromMimeType, formatInfo, type ImageFormat } from './formats'
import type { PipelineLimits } from './operation'
import { applyTransform, sortTransforms, validatePipeline } from './registry'
import { type Pipeline, resolveOutputFormat } from './types'

export type RunInput = {
  readonly fileName: string
  readonly blob: Blob
}

export type RunOutput = {
  readonly blob: Blob
  readonly fileName: string
  readonly format: ImageFormat
  readonly width: number
  readonly height: number
  readonly bytesIn: number
  readonly bytesOut: number
}

/** Reports which stage is running, so a slow AVIF encode does not look like a hang. */
export type ProgressReporter = (stage: 'decode' | 'transform' | 'encode') => void

export async function runPipeline(
  input: RunInput,
  pipeline: Pipeline,
  limits: PipelineLimits,
  onProgress: ProgressReporter = () => {},
): Promise<Result<RunOutput>> {
  const valid = validatePipeline(pipeline, limits)
  if (!valid.ok) return valid

  const sourceFormat = detectFormat(input)
  if (!sourceFormat) {
    return fail('UNSUPPORTED_INPUT_FORMAT', {
      detail: `type=${input.blob.type} name=${input.fileName}`,
      stage: 'validate',
    })
  }

  if (input.blob.size > limits.maxFileBytes) {
    return fail('FILE_TOO_LARGE', {
      message: `This file is ${formatBytes(input.blob.size)}. The maximum is ${formatBytes(limits.maxFileBytes)}.`,
      stage: 'validate',
    })
  }

  onProgress('decode')
  const decoded = await decodeImage(input.blob, limits)
  if (!decoded.ok) return decoded

  const surface = createCanvas(decoded.value.width, decoded.value.height)
  if (!surface.ok) {
    decoded.value.bitmap.close()
    return surface
  }

  surface.value.context.drawImage(decoded.value.bitmap, 0, 0)
  // The bitmap can be large; release it as soon as its pixels are on the canvas.
  decoded.value.bitmap.close()

  let image = surface.value.context.getImageData(0, 0, decoded.value.width, decoded.value.height)

  onProgress('transform')
  // Sorted rather than taken as given: the order is a correctness guarantee, not the
  // order the user happened to enable things in. See ADR-0006.
  for (const transform of sortTransforms(pipeline.transforms)) {
    const applied = applyTransform(image, transform)
    if (!applied.ok) return applied
    image = applied.value
  }

  onProgress('encode')
  const targetFormat = resolveOutputFormat(pipeline.output, sourceFormat)
  const encoded = await encodeImage(image, targetFormat, pipeline.output.quality)
  if (!encoded.ok) return encoded

  return ok({
    blob: encoded.value.blob,
    fileName: outputFileName(input.fileName, targetFormat),
    format: targetFormat,
    width: image.width,
    height: image.height,
    bytesIn: input.blob.size,
    bytesOut: encoded.value.bytes,
  })
}

/**
 * Trusts the MIME type first and the extension only as a fallback.
 *
 * A file named `.png` that is really a JPEG is common — people rename files — and the
 * browser sniffs content, so its type is the better signal.
 */
function detectFormat(input: RunInput): ImageFormat | undefined {
  return formatFromMimeType(input.blob.type) ?? formatFromExtension(input.fileName)
}

/** Swaps the extension for the output format's, keeping the user's own name. */
export function outputFileName(original: string, format: ImageFormat): string {
  const withoutExtension = original.replace(/\.[^./\\]+$/, '')
  const base = withoutExtension.length > 0 ? withoutExtension : 'image'
  return `${base}.${formatInfo(format).extensions[0]}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
