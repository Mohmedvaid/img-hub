import { describe, expect, it } from 'vitest'
import { type IntakeLimits, intakeFiles, rejectionSummary } from './intake'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff, 0xe0]
const HEIC = [0, 0, 0, 0x20, ...Buffer.from('ftyp'), ...Buffer.from('heic')]
const PDF = [0x25, 0x50, 0x44, 0x46]

const limits: IntakeLimits = {
  maxFileBytes: 1000,
  maxFilesPerBatch: 3,
  inputFormats: ['jpeg', 'png', 'webp', 'avif', 'gif', 'heic'],
}

function makeFile(header: number[], name: string, padTo = 0): File {
  const body = [...header, ...new Array(Math.max(0, padTo - header.length)).fill(0)]
  return new File([new Uint8Array(body)], name, { type: '' })
}

describe('accepting good files', () => {
  it('accepts images and reports their sniffed format', async () => {
    const result = await intakeFiles([makeFile(PNG, 'a.png'), makeFile(JPEG, 'b.jpg')], limits)

    expect(result.rejected).toHaveLength(0)
    expect(result.accepted.map((entry) => entry.format)).toEqual(['png', 'jpeg'])
  })

  it('flags formats this browser may not decode', async () => {
    const result = await intakeFiles([makeFile(HEIC, 'photo.heic')], limits)

    // HEIC is essentially Safari-only. Accepted, but the UI can warn up front.
    expect(result.accepted[0]?.mayNotDecode).toBe(true)
  })

  it('does not flag a universally supported format', async () => {
    const result = await intakeFiles([makeFile(PNG, 'a.png')], limits)
    expect(result.accepted[0]?.mayNotDecode).toBeUndefined()
  })
})

describe('rejecting with a reason', () => {
  it('rejects a non-image and names the file', async () => {
    const result = await intakeFiles([makeFile(PDF, 'invoice.pdf')], limits)

    expect(result.rejected[0]?.reason).toBe('not-an-image')
    expect(result.rejected[0]?.message).toContain('invoice.pdf')
  })

  it('rejects SVG with its own explanation rather than a generic failure', async () => {
    const svg = new File([new Uint8Array(Buffer.from('<svg/>'))], 'logo.svg', { type: '' })
    const result = await intakeFiles([svg], limits)

    expect(result.rejected[0]?.reason).toBe('svg-unsupported')
    expect(result.rejected[0]?.message).toMatch(/drawings/i)
  })

  it('rejects a file over the size limit, quoting both sizes', async () => {
    const result = await intakeFiles([makeFile(PNG, 'huge.png', 5000)], limits)

    expect(result.rejected[0]?.reason).toBe('too-large')
    expect(result.rejected[0]?.message).toMatch(/limit is/)
  })

  it('rejects a format that is recognised but not enabled', async () => {
    const narrow = { ...limits, inputFormats: ['jpeg'] as const }
    const result = await intakeFiles([makeFile(PNG, 'a.png')], narrow)

    expect(result.rejected[0]?.reason).toBe('format-not-enabled')
    expect(result.rejected[0]?.message).toContain('PNG')
  })

  it('keeps the good files when some are bad', async () => {
    const result = await intakeFiles(
      [makeFile(PNG, 'good.png'), makeFile(PDF, 'bad.pdf'), makeFile(JPEG, 'also-good.jpg')],
      limits,
    )

    expect(result.accepted).toHaveLength(2)
    expect(result.rejected).toHaveLength(1)
  })
})

describe('batch capacity', () => {
  it('stops at the cap and says the batch is full', async () => {
    const files = Array.from({ length: 5 }, (_, i) => makeFile(PNG, `${i}.png`))
    const result = await intakeFiles(files, limits)

    expect(result.accepted).toHaveLength(3)
    expect(result.rejected).toHaveLength(2)
    expect(result.rejected.every((entry) => entry.reason === 'batch-full')).toBe(true)
  })

  it('counts files already queued, so the cap holds across several drops', async () => {
    const result = await intakeFiles([makeFile(PNG, 'a.png'), makeFile(PNG, 'b.png')], limits, 2)

    expect(result.accepted).toHaveLength(1)
    expect(result.rejected[0]?.reason).toBe('batch-full')
  })

  it('accepts nothing once the batch is already full', async () => {
    const result = await intakeFiles([makeFile(PNG, 'a.png')], limits, 3)
    expect(result.accepted).toHaveLength(0)
  })
})

describe('rejectionSummary', () => {
  const reject = (reason: string, message: string) =>
    ({ file: new File([], 'x'), reason, message }) as never

  it('is undefined when nothing was rejected', () => {
    expect(rejectionSummary([])).toBeUndefined()
  })

  it('uses the single message when one file was rejected', () => {
    expect(rejectionSummary([reject('not-an-image', 'a.pdf does not look like an image.')])).toBe(
      'a.pdf does not look like an image.',
    )
  })

  it('groups several rejections sharing one reason', () => {
    const summary = rejectionSummary([
      reject('not-an-image', 'a'),
      reject('not-an-image', 'b'),
      reject('not-an-image', 'c'),
    ])

    expect(summary).toMatch(/3 files skipped/)
    expect(summary).toMatch(/not images/)
  })

  it('falls back to a count when reasons differ', () => {
    const summary = rejectionSummary([reject('not-an-image', 'a'), reject('too-large', 'b')])
    expect(summary).toMatch(/different reasons/)
  })
})
