import { describe, expect, it } from 'vitest'
import {
  allFormats,
  formatFromExtension,
  formatFromMimeType,
  formatInfo,
  isImageFormat,
  losesAnimation,
  losesTransparency,
} from './formats'

describe('format lookup', () => {
  it('resolves a MIME type', () => {
    expect(formatFromMimeType('image/webp')).toBe('webp')
  })

  it('ignores MIME parameters and casing', () => {
    expect(formatFromMimeType('IMAGE/JPEG; charset=binary')).toBe('jpeg')
  })

  it('returns undefined for a type it does not know', () => {
    expect(formatFromMimeType('application/pdf')).toBeUndefined()
  })

  it('resolves both spellings of a JPEG extension', () => {
    expect(formatFromExtension('holiday.jpg')).toBe('jpeg')
    expect(formatFromExtension('holiday.JPEG')).toBe('jpeg')
  })

  it('uses the last dot in a multi-dot filename', () => {
    expect(formatFromExtension('my.photo.final.png')).toBe('png')
  })

  it('returns undefined for a file with no extension', () => {
    expect(formatFromExtension('screenshot')).toBeUndefined()
  })

  it('guards unknown format strings', () => {
    expect(isImageFormat('webp')).toBe(true)
    expect(isImageFormat('psd')).toBe(false)
  })

  it('knows the decode-only input formats', () => {
    // Accepted as input because the browser can read them, but never as output.
    for (const format of ['bmp', 'tiff', 'heic', 'ico'] as const) {
      expect(isImageFormat(format)).toBe(true)
      expect(formatInfo(format).canDecode).toBe(true)
      expect(formatInfo(format).canEncode).toBe(false)
    }
  })

  it('marks HEIC and TIFF as narrowly supported, since they are Safari-only', () => {
    expect(formatInfo('heic').decodeSupport).toBe('limited')
    expect(formatInfo('tiff').decodeSupport).toBe('limited')
    expect(formatInfo('png').decodeSupport).toBe('universal')
  })
})

describe('conversion warnings', () => {
  it('flags PNG to JPEG as losing transparency', () => {
    expect(losesTransparency('png', 'jpeg')).toBe(true)
  })

  it('does not flag PNG to WebP, which keeps alpha', () => {
    expect(losesTransparency('png', 'webp')).toBe(false)
  })

  it('flags GIF to PNG as losing animation', () => {
    expect(losesAnimation('gif', 'png')).toBe(true)
  })

  it('does not flag GIF to WebP, which keeps animation', () => {
    expect(losesAnimation('gif', 'webp')).toBe(false)
  })
})

describe('format table integrity', () => {
  it('keys every entry by its own id', () => {
    for (const format of allFormats()) {
      expect(formatInfo(format.id)).toBe(format)
    }
  })

  it('gives every format at least one extension, canonical first', () => {
    for (const format of allFormats()) {
      expect(format.extensions.length).toBeGreaterThan(0)
      expect(format.extensions[0]).not.toContain('.')
    }
  })

  it('assigns a unique MIME type to each format', () => {
    const mimeTypes = allFormats().map((format) => format.mimeType)
    expect(new Set(mimeTypes).size).toBe(mimeTypes.length)
  })

  it('marks AVIF as slow to encode, which the UI must warn about', () => {
    expect(formatInfo('avif').encodeCost).toBe('slow')
  })
})
