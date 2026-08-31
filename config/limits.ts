/**
 * Processing policy. What the product currently allows, as opposed to what the
 * formats are technically capable of (that lives in src/lib/pipeline/formats.ts).
 *
 * These numbers are deliberately conservative. Everything runs on the user's own
 * device, so the binding constraint is the weakest phone we care about, not a
 * server we can scale up.
 */

import type { ImageFormat } from '@/lib/pipeline/formats'
import type { PipelineLimits } from '@/lib/pipeline/operation'
import { site } from './site'

const MEGABYTE = 1_024 * 1_024

export const limits = {
  /**
   * Per-file ceiling. Mobile Safari reliably runs out of memory decoding beyond
   * roughly this size, and failing fast with a clear message beats a browser tab
   * crash that looks like our bug.
   */
  maxFileBytes: 50 * MEGABYTE,

  /** Guards against a decompression bomb: a tiny file that decodes to gigabytes. */
  maxPixels: 100_000_000,
  maxWidth: 20_000,
  maxHeight: 20_000,

  /** Batch size cap. Beyond this the queue UI stops being useful. */
  maxFilesPerBatch: 50,

  /** Formats accepted as input. GIF is decode-only and still valid to upload. */
  inputFormats: ['jpeg', 'png', 'webp', 'avif', 'gif'] satisfies ImageFormat[],

  /**
   * Formats offered as output. AVIF is gated behind a flag because encoding a
   * 12MP image takes 2-5s even on a fast preset; it ships once the slow-encode
   * warning exists. See docs/ROADMAP.md, v0.2.
   */
  get outputFormats(): ImageFormat[] {
    const formats: ImageFormat[] = ['jpeg', 'png', 'webp']
    if (site.features.avifOutput) formats.push('avif')
    return formats
  },
} as const

/** The subset of policy the pipeline engine validates against. */
export function pipelineLimits(): PipelineLimits {
  return {
    maxFileBytes: limits.maxFileBytes,
    maxWidth: limits.maxWidth,
    maxHeight: limits.maxHeight,
    maxPixels: limits.maxPixels,
    enabledOutputFormats: limits.outputFormats,
  }
}
