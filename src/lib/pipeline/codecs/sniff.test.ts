import { describe, expect, it } from 'vitest'
import { identifyFile, looksLikeSvg, sniffFormat } from './sniff'

/** Real magic bytes, padded so brand checks at byte 8 have something to read. */
const HEADERS: Record<string, number[]> = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  gif87: [...Buffer.from('GIF87a')],
  gif89: [...Buffer.from('GIF89a')],
  webp: [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')],
  avif: [0, 0, 0, 0x20, ...Buffer.from('ftyp'), ...Buffer.from('avif')],
  heic: [0, 0, 0, 0x20, ...Buffer.from('ftyp'), ...Buffer.from('heic')],
  bmp: [...Buffer.from('BM'), 0, 0],
  tiffLE: [0x49, 0x49, 0x2a, 0x00],
  tiffBE: [0x4d, 0x4d, 0x00, 0x2a],
  ico: [0x00, 0x00, 0x01, 0x00],
  qoi: [...Buffer.from('qoif')],
}

const bytes = (values: number[]) => new Uint8Array([...values, ...new Array(32).fill(0)])
const file = (values: number[], name = 'x.bin', type = '') =>
  new File([new Uint8Array(values)], name, { type })

describe('sniffFormat identifies by magic bytes', () => {
  it.each([
    ['jpeg', 'jpeg'],
    ['png', 'png'],
    ['gif87', 'gif'],
    ['gif89', 'gif'],
    ['webp', 'webp'],
    ['avif', 'avif'],
    ['heic', 'heic'],
    ['bmp', 'bmp'],
    ['tiffLE', 'tiff'],
    ['tiffBE', 'tiff'],
    ['ico', 'ico'],
    ['qoi', 'qoi'],
  ])('recognises %s', (key, expected) => {
    expect(sniffFormat(bytes(HEADERS[key] as number[]))).toBe(expected)
  })

  it('does not confuse WebP with any other RIFF file', () => {
    const wav = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE')]
    expect(sniffFormat(bytes(wav))).toBeUndefined()
  })

  it('does not confuse AVIF with another ISO-BMFF brand', () => {
    const mp4 = [0, 0, 0, 0x20, ...Buffer.from('ftyp'), ...Buffer.from('mp42')]
    expect(sniffFormat(bytes(mp4))).toBeUndefined()
  })

  it('returns undefined for arbitrary bytes', () => {
    expect(sniffFormat(bytes([1, 2, 3, 4]))).toBeUndefined()
  })

  it('does not throw on a header shorter than any signature', () => {
    expect(() => sniffFormat(new Uint8Array([0xff]))).not.toThrow()
  })

  it('does not throw on an empty header', () => {
    expect(() => sniffFormat(new Uint8Array())).not.toThrow()
  })
})

describe('looksLikeSvg', () => {
  it('detects a plain svg root', () => {
    expect(looksLikeSvg(new Uint8Array(Buffer.from('<svg xmlns="...">')))).toBe(true)
  })

  it('detects an svg behind an xml declaration', () => {
    expect(looksLikeSvg(new Uint8Array(Buffer.from('<?xml version="1.0"?><svg>')))).toBe(true)
  })

  it('detects an svg with leading whitespace', () => {
    expect(looksLikeSvg(new Uint8Array(Buffer.from('\n  <SVG>')))).toBe(true)
  })

  it('does not flag a binary image', () => {
    expect(looksLikeSvg(bytes(HEADERS.png as number[]))).toBe(false)
  })
})

describe('identifyFile', () => {
  it('trusts bytes over a wrong declared type', async () => {
    // A JPEG renamed .png with a matching wrong MIME type. Bytes win.
    const mislabelled = file(HEADERS.jpeg as number[], 'photo.png', 'image/png')
    await expect(identifyFile(mislabelled, 'photo.png')).resolves.toEqual({
      kind: 'image',
      format: 'jpeg',
    })
  })

  it('accepts a valid image with no declared type at all', async () => {
    // Downloads without an extension arrive with an empty type; the old MIME check
    // rejected these outright.
    const typeless = file(HEADERS.png as number[], 'download', '')
    await expect(identifyFile(typeless, 'download')).resolves.toEqual({
      kind: 'image',
      format: 'png',
    })
  })

  it('reports svg separately rather than as unknown', async () => {
    const svg = new File([new Uint8Array(Buffer.from('<svg></svg>'))], 'logo.svg', {
      type: 'image/svg+xml',
    })
    await expect(identifyFile(svg, 'logo.svg')).resolves.toEqual({ kind: 'svg' })
  })

  it.each([
    ['a PDF', [0x25, 0x50, 0x44, 0x46]],
    ['a ZIP or Office document', [0x50, 0x4b, 0x03, 0x04]],
    ['a gzip archive', [0x1f, 0x8b]],
    ['an MP3', [...Buffer.from('ID3')]],
    ['an HTML page', [...Buffer.from('<!DOCTYPE html>')]],
  ])('rejects %s even when it claims to be an image', async (_label, header) => {
    // Without positive non-image detection these reach the declared-type fallback
    // and get accepted, then fail later with a confusing decode error.
    const disguised = file(header as number[], 'invoice.png', 'image/png')
    await expect(identifyFile(disguised, 'invoice.png')).resolves.toEqual({ kind: 'unknown' })
  })

  it('rejects a video container rather than reading it as an image', async () => {
    const mp4 = [0, 0, 0, 0x20, ...Buffer.from('ftyp'), ...Buffer.from('mp42')]
    const disguised = file(mp4, 'clip.png', 'image/png')
    await expect(identifyFile(disguised, 'clip.png')).resolves.toEqual({ kind: 'unknown' })
  })

  it('falls back to the declared type when bytes are inconclusive', async () => {
    // The browser may know a format we have no signature for; refusing a file it
    // could decode is the worse failure.
    const unknownBytes = file([0x01, 0x02, 0x03, 0x04], 'image.webp', 'image/webp')
    await expect(identifyFile(unknownBytes, 'image.webp')).resolves.toEqual({
      kind: 'image',
      format: 'webp',
    })
  })

  it('falls back to the extension when there is no type either', async () => {
    const byName = file([0x01, 0x02, 0x03, 0x04], 'image.gif', '')
    await expect(identifyFile(byName, 'image.gif')).resolves.toEqual({
      kind: 'image',
      format: 'gif',
    })
  })

  it('returns unknown when nothing identifies it', async () => {
    await expect(identifyFile(file([9, 9, 9], 'mystery', ''), 'mystery')).resolves.toEqual({
      kind: 'unknown',
    })
  })
})
