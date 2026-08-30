/**
 * Facts about image formats. Not policy.
 *
 * "Can this format hold transparency" is a fact and lives here. "Do we currently
 * offer AVIF output" is policy and lives in config/limits.ts. Keeping them apart
 * means enabling a format is a config change, never a code change.
 */

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'jxl' | 'gif' | 'qoi'

export type FormatInfo = {
  readonly id: ImageFormat
  /** Shown in the UI, e.g. the output format dropdown. */
  readonly label: string
  readonly mimeType: string
  /** First entry is canonical and used when naming output files. */
  readonly extensions: readonly string[]
  readonly canDecode: boolean
  readonly canEncode: boolean
  /** Whether a quality setting is meaningful. Lossless formats ignore it. */
  readonly lossy: boolean
  readonly supportsAlpha: boolean
  readonly supportsAnimation: boolean
  /**
   * Rough encode cost relative to JPEG, used to decide whether to warn the user
   * before starting. AVIF is genuinely 5-20x slower; that is not a guess.
   */
  readonly encodeCost: 'fast' | 'moderate' | 'slow'
}

const FORMATS: Record<ImageFormat, FormatInfo> = {
  jpeg: {
    id: 'jpeg',
    label: 'JPEG',
    mimeType: 'image/jpeg',
    extensions: ['jpg', 'jpeg'],
    canDecode: true,
    canEncode: true,
    lossy: true,
    supportsAlpha: false,
    supportsAnimation: false,
    encodeCost: 'fast',
  },
  png: {
    id: 'png',
    label: 'PNG',
    mimeType: 'image/png',
    extensions: ['png'],
    canDecode: true,
    canEncode: true,
    lossy: false,
    supportsAlpha: true,
    supportsAnimation: false,
    encodeCost: 'moderate',
  },
  webp: {
    id: 'webp',
    label: 'WebP',
    mimeType: 'image/webp',
    extensions: ['webp'],
    canDecode: true,
    canEncode: true,
    lossy: true,
    supportsAlpha: true,
    supportsAnimation: true,
    encodeCost: 'fast',
  },
  avif: {
    id: 'avif',
    label: 'AVIF',
    mimeType: 'image/avif',
    extensions: ['avif'],
    canDecode: true,
    canEncode: true,
    lossy: true,
    supportsAlpha: true,
    supportsAnimation: true,
    encodeCost: 'slow',
  },
  jxl: {
    id: 'jxl',
    label: 'JPEG XL',
    mimeType: 'image/jxl',
    extensions: ['jxl'],
    canDecode: true,
    canEncode: true,
    lossy: true,
    supportsAlpha: true,
    supportsAnimation: true,
    encodeCost: 'moderate',
  },
  gif: {
    id: 'gif',
    label: 'GIF',
    mimeType: 'image/gif',
    // Decode only: the browser decodes GIF natively, but we have no GIF encoder.
    extensions: ['gif'],
    canDecode: true,
    canEncode: false,
    lossy: false,
    supportsAlpha: true,
    supportsAnimation: true,
    encodeCost: 'fast',
  },
  qoi: {
    id: 'qoi',
    label: 'QOI',
    mimeType: 'image/qoi',
    extensions: ['qoi'],
    canDecode: true,
    canEncode: true,
    lossy: false,
    supportsAlpha: true,
    supportsAnimation: false,
    encodeCost: 'fast',
  },
}

export function formatInfo(format: ImageFormat): FormatInfo {
  return FORMATS[format]
}

export function allFormats(): readonly FormatInfo[] {
  return Object.values(FORMATS)
}

export function isImageFormat(value: string): value is ImageFormat {
  return value in FORMATS
}

/** Resolves a MIME type to a format. Returns undefined for anything unrecognised. */
export function formatFromMimeType(mimeType: string): ImageFormat | undefined {
  const normalised = mimeType.toLowerCase().split(';')[0]?.trim()
  return allFormats().find((format) => format.mimeType === normalised)?.id
}

/**
 * Resolves a file extension to a format. Used only as a fallback when the browser
 * reports an empty or generic MIME type; sniffed content always wins.
 */
export function formatFromExtension(fileName: string): ImageFormat | undefined {
  const extension = fileName.toLowerCase().split('.').pop()
  if (!extension) return undefined
  return allFormats().find((format) => format.extensions.includes(extension))?.id
}

/**
 * True when converting between these formats silently discards transparency.
 * The UI warns on this rather than blocking it.
 */
export function losesTransparency(from: ImageFormat, to: ImageFormat): boolean {
  return formatInfo(from).supportsAlpha && !formatInfo(to).supportsAlpha
}

/** True when converting drops animation frames down to a single still. */
export function losesAnimation(from: ImageFormat, to: ImageFormat): boolean {
  return formatInfo(from).supportsAnimation && !formatInfo(to).supportsAnimation
}
