/**
 * Deciding which dropped files we will actually work on, and saying why for the rest.
 *
 * Previously anything failing `file.type.startsWith('image/')` was dropped in silence.
 * Someone selecting twelve files and seeing nine appear has no way to know what
 * happened or whether it was their mistake. Every rejection here carries a reason.
 */

import { identifyFile } from '@/lib/pipeline/codecs/sniff'
import { formatInfo, type ImageFormat } from '@/lib/pipeline/formats'

export type RejectionReason =
  | 'not-an-image'
  | 'svg-unsupported'
  | 'format-not-enabled'
  | 'too-large'
  | 'batch-full'

export type Rejected = {
  readonly file: File
  readonly reason: RejectionReason
  /** Shown to the user. Names the file and what to do about it. */
  readonly message: string
}

export type Accepted = {
  readonly file: File
  readonly format: ImageFormat
  /**
   * Set when this browser probably cannot decode the file, so the UI can warn before
   * a run rather than after it fails.
   */
  readonly mayNotDecode?: true
}

export type IntakeResult = {
  readonly accepted: readonly Accepted[]
  readonly rejected: readonly Rejected[]
}

export type IntakeLimits = {
  readonly maxFileBytes: number
  readonly maxFilesPerBatch: number
  readonly inputFormats: readonly ImageFormat[]
}

function readableSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Sorts incoming files into accepted and rejected.
 *
 * `alreadyQueued` is the count already in the batch, so the cap applies across
 * several drops rather than resetting each time.
 */
export async function intakeFiles(
  files: readonly File[],
  limits: IntakeLimits,
  alreadyQueued = 0,
): Promise<IntakeResult> {
  const accepted: Accepted[] = []
  const rejected: Rejected[] = []
  let room = Math.max(0, limits.maxFilesPerBatch - alreadyQueued)

  for (const file of files) {
    if (room === 0) {
      rejected.push({
        file,
        reason: 'batch-full',
        message: `${file.name} — batch is full at ${limits.maxFilesPerBatch} files.`,
      })
      continue
    }

    // Size is checked before reading bytes: no point sniffing a file we will refuse.
    if (file.size > limits.maxFileBytes) {
      rejected.push({
        file,
        reason: 'too-large',
        message: `${file.name} is ${readableSize(file.size)} — the limit is ${readableSize(limits.maxFileBytes)}.`,
      })
      continue
    }

    const identity = await identifyFile(file, file.name)

    if (identity.kind === 'svg') {
      rejected.push({
        file,
        reason: 'svg-unsupported',
        message: `${file.name} is an SVG. SVGs are drawings rather than photos, so there is nothing to compress or resize.`,
      })
      continue
    }

    if (identity.kind === 'unknown') {
      rejected.push({
        file,
        reason: 'not-an-image',
        message: `${file.name} does not look like an image.`,
      })
      continue
    }

    if (!limits.inputFormats.includes(identity.format)) {
      rejected.push({
        file,
        reason: 'format-not-enabled',
        message: `${file.name} is ${formatInfo(identity.format).label}, which isn't supported yet.`,
      })
      continue
    }

    const info = formatInfo(identity.format)
    accepted.push({
      file,
      format: identity.format,
      ...(info.decodeSupport === 'limited' ? { mayNotDecode: true as const } : {}),
    })
    room -= 1
  }

  return { accepted, rejected }
}

/** One line summarising rejections, or undefined when everything was accepted. */
export function rejectionSummary(rejected: readonly Rejected[]): string | undefined {
  if (rejected.length === 0) return undefined
  if (rejected.length === 1) return rejected[0]?.message

  const reasons = new Set(rejected.map((entry) => entry.reason))
  if (reasons.size === 1) {
    const [only] = [...reasons]
    const label: Record<RejectionReason, string> = {
      'not-an-image': 'are not images',
      'svg-unsupported': 'are SVGs, which this tool does not handle',
      'format-not-enabled': 'are in formats that are not supported yet',
      'too-large': 'are over the size limit',
      'batch-full': 'did not fit in the batch',
    }
    return `${rejected.length} files skipped — they ${label[only as RejectionReason]}.`
  }

  return `${rejected.length} files skipped for different reasons.`
}
