/**
 * Facts about image formats. Not policy.
 *
 * "Can this format hold transparency" is a fact and lives here. "Do we currently
 * offer AVIF output" is policy and lives in config/limits.ts. Keeping them apart
 * means enabling a format is a config change, never a code change.
 */

export type ImageFormat =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'avif'
  | 'jxl'
  | 'gif'
  | 'qoi'
  /* Decode-only. Accepted as input because the browser can read them. */
  | 'bmp'
  | 'tiff'
  | 'heic'
  | 'ico'

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
  /**
   * How widely browsers can decode this.
   *
   * 'limited' means some browsers cannot open it at all — HEIC and TIFF are
   * essentially Safari-only. We still accept them, because rejecting a file the
   * visitor's own browser could have opened is worse than trying and explaining a
   * failure. The message names the reason rather than saying "corrupt".
   */
  readonly decodeSupport: 'universal' | 'limited'
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
    decodeSupport: 'universal',
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
    decodeSupport: 'universal',
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
    decodeSupport: 'universal',
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
    decodeSupport: 'universal',
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
    decodeSupport: 'universal',
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
    decodeSupport: 'universal',
  },
  bmp: {
    id: 'bmp',
    label: 'BMP',
    mimeType: 'image/bmp',
    extensions: ['bmp'],
    canDecode: true,
    canEncode: false,
    lossy: false,
    supportsAlpha: true,
    supportsAnimation: false,
    encodeCost: 'fast',
    decodeSupport: 'universal',
  },
  tiff: {
    id: 'tiff',
    label: 'TIFF',
    mimeType: 'image/tiff',
    extensions: ['tif', 'tiff'],
    canDecode: true,
    canEncode: false,
    lossy: false,
    supportsAlpha: true,
    supportsAnimation: false,
    encodeCost: 'fast',
    // Safari decodes TIFF; Chrome and Firefox generally do not.
    decodeSupport: 'limited',
  },
  heic: {
    id: 'heic',
    label: 'HEIC',
    mimeType: 'image/heic',
    extensions: ['heic', 'heif'],
    canDecode: true,
    canEncode: false,
    lossy: true,
    supportsAlpha: true,
    supportsAnimation: false,
    encodeCost: 'slow',
    // What iPhones shoot by default, and only Safari opens it natively.
    decodeSupport: 'limited',
  },
  ico: {
    id: 'ico',
    label: 'ICO',
    mimeType: 'image/x-icon',
    extensions: ['ico'],
    canDecode: true,
    canEncode: false,
    lossy: false,
    supportsAlpha: true,
    supportsAnimation: false,
    encodeCost: 'fast',
    decodeSupport: 'universal',
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
    decodeSupport: 'universal',
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
