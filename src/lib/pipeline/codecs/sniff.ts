/**
 * Identifies an image by its actual bytes.
 *
 * The browser's reported MIME type is a guess, usually derived from the file
 * extension, and it is wrong in both directions. A perfectly good JPEG downloaded
 * without an extension arrives with an empty type and would be rejected; a PDF
 * renamed to `.png` arrives as `image/png` and sails through to fail later with a
 * confusing decode error.
 *
 * Reading the first few bytes settles it. Every format below announces itself in its
 * opening bytes — that is what a magic number is for.
 */

import { formatFromExtension, formatFromMimeType, type ImageFormat } from '../formats'

/** How much of the file has to be read. ISO-BMFF brands sit at byte 8. */
const HEADER_BYTES = 32

type Signature = {
  readonly format: ImageFormat
  /** Returns true when these bytes belong to the format. */
  readonly matches: (bytes: Uint8Array) => boolean
}

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + length))

const startsWith = (bytes: Uint8Array, ...expected: number[]): boolean =>
  expected.every((byte, index) => bytes[index] === byte)

/**
 * Order matters only where one signature could shadow another. RIFF and ISO-BMFF both
 * need a second check further into the header, so they carry it themselves.
 */
const SIGNATURES: readonly Signature[] = [
  { format: 'jpeg', matches: (b) => startsWith(b, 0xff, 0xd8, 0xff) },
  { format: 'png', matches: (b) => startsWith(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) },
  { format: 'gif', matches: (b) => ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a' },
  // RIFF container; the format lives at byte 8.
  { format: 'webp', matches: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' },
  // ISO base media files share a layout: 'ftyp' at byte 4, then a brand.
  {
    format: 'avif',
    matches: (b) => ascii(b, 4, 4) === 'ftyp' && ['avif', 'avis'].includes(ascii(b, 8, 4)),
  },
  {
    format: 'heic',
    matches: (b) =>
      ascii(b, 4, 4) === 'ftyp' &&
      ['heic', 'heix', 'heim', 'heis', 'hevc', 'mif1', 'msf1'].includes(ascii(b, 8, 4)),
  },
  { format: 'bmp', matches: (b) => ascii(b, 0, 2) === 'BM' },
  // Little-endian and big-endian TIFF respectively.
  {
    format: 'tiff',
    matches: (b) => startsWith(b, 0x49, 0x49, 0x2a, 0x00) || startsWith(b, 0x4d, 0x4d, 0x00, 0x2a),
  },
  { format: 'ico', matches: (b) => startsWith(b, 0x00, 0x00, 0x01, 0x00) },
  {
    format: 'jxl',
    matches: (b) =>
      startsWith(b, 0xff, 0x0a) || startsWith(b, 0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20),
  },
  { format: 'qoi', matches: (b) => ascii(b, 0, 4) === 'qoif' },
]

/** Identifies the format from header bytes, or undefined if nothing matches. */
export function sniffFormat(bytes: Uint8Array): ImageFormat | undefined {
  return SIGNATURES.find((signature) => signature.matches(bytes))?.format
}

/**
 * True when the bytes look like SVG.
 *
 * Called out separately because SVG is deliberately refused: it is a document, not a
 * bitmap, and can carry scripts and external references. Detecting it lets us say so
 * plainly instead of reporting an unhelpful "unsupported file". See the security
 * skill; adding SVG is its own feature with its own sanitising, not a line in a list.
 */
export function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = ascii(bytes, 0, HEADER_BYTES).trimStart().toLowerCase()
  return head.startsWith('<svg') || head.startsWith('<?xml')
}

/**
 * Signatures for things people commonly drop by accident.
 *
 * Needed because of the fallback below: without positively recognising a PDF, a PDF
 * renamed `.png` reaches the declared-type fallback and gets accepted. Listing the
 * usual suspects means "inconclusive bytes" genuinely means inconclusive, rather
 * than "we did not look hard enough".
 */
const NON_IMAGE_SIGNATURES: ReadonlyArray<(bytes: Uint8Array) => boolean> = [
  (b) => ascii(b, 0, 4) === '%PDF',
  // ZIP, and everything built on it: docx, xlsx, pptx, odt, jar.
  (b) => startsWith(b, 0x50, 0x4b, 0x03, 0x04) || startsWith(b, 0x50, 0x4b, 0x05, 0x06),
  (b) => startsWith(b, 0x1f, 0x8b),
  (b) => ascii(b, 0, 4) === 'Rar!',
  (b) => ascii(b, 0, 2) === '7z',
  (b) => ascii(b, 0, 3) === 'ID3',
  // ISO-BMFF with a video or audio brand rather than an image one.
  (b) =>
    ascii(b, 4, 4) === 'ftyp' &&
    ['mp4', 'M4A', 'M4V', 'qt  ', 'isom'].some((brand) =>
      ascii(b, 8, 4).startsWith(brand.trimEnd()),
    ),
  (b) => {
    const head = ascii(b, 0, HEADER_BYTES).trimStart().toLowerCase()
    return head.startsWith('<!doctype html') || head.startsWith('<html')
  },
]

function looksLikeNonImage(bytes: Uint8Array): boolean {
  return NON_IMAGE_SIGNATURES.some((matches) => matches(bytes))
}

export type FileIdentity =
  | { readonly kind: 'image'; readonly format: ImageFormat }
  | { readonly kind: 'svg' }
  | { readonly kind: 'unknown' }

/**
 * Identifies a file by content, falling back to its declared type only when the bytes
 * are inconclusive.
 *
 * The fallback exists because a browser may know something we do not — a new format,
 * or one whose signature we have not listed — and refusing a file the browser could
 * have decoded is the worse failure.
 */
export async function identifyFile(file: Blob, fileName = ''): Promise<FileIdentity> {
  const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer())

  if (looksLikeSvg(header)) return { kind: 'svg' }

  const sniffed = sniffFormat(header)
  if (sniffed) return { kind: 'image', format: sniffed }

  // Positively not an image, whatever it claims to be.
  if (looksLikeNonImage(header)) return { kind: 'unknown' }

  const declared = formatFromMimeType(file.type) ?? formatFromExtension(fileName)
  return declared ? { kind: 'image', format: declared } : { kind: 'unknown' }
}
