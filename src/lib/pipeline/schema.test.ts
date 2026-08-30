import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, decodePipeline, encodePipeline } from './schema'
import { defaultPipeline, type Pipeline } from './types'

/** Encodes an arbitrary payload the way a future or hostile client might. */
function encodeRaw(payload: unknown): string {
  const binary = String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('encodePipeline / decodePipeline', () => {
  it('round-trips the default pipeline unchanged', () => {
    const original = defaultPipeline()
    const decoded = decodePipeline(encodePipeline(original))

    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(decoded.value).toEqual(original)
  })

  it('round-trips a full pipeline with every transform kind', () => {
    const original: Pipeline = {
      transforms: [
        { kind: 'crop', x: 10, y: 20, width: 800, height: 600 },
        { kind: 'rotate', degrees: 90, flipHorizontal: true, flipVertical: false },
        { kind: 'resize', mode: 'cover', width: 400, height: 400, allowUpscale: false },
        { kind: 'metadata', stripExif: true, keepColorProfile: false },
      ],
      output: { format: 'avif', quality: 55 },
    }

    const decoded = decodePipeline(encodePipeline(original))

    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(decoded.value).toEqual(original)
  })

  it('preserves transform order, since order changes the output', () => {
    const original: Pipeline = {
      transforms: [
        { kind: 'resize', mode: 'contain', width: 100, allowUpscale: false },
        { kind: 'crop', x: 0, y: 0, width: 50, height: 50 },
      ],
      output: { format: 'png', quality: 100 },
    }

    const decoded = decodePipeline(encodePipeline(original))

    expect(decoded.ok).toBe(true)
    if (decoded.ok) {
      expect(decoded.value.transforms.map((transform) => transform.kind)).toEqual([
        'resize',
        'crop',
      ])
    }
  })

  it('omits absent resize dimensions rather than encoding them as null', () => {
    const original: Pipeline = {
      transforms: [{ kind: 'resize', mode: 'contain', width: 1200, allowUpscale: false }],
      output: { format: 'webp', quality: 80 },
    }

    const decoded = decodePipeline(encodePipeline(original))

    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(decoded.value.transforms[0]).not.toHaveProperty('height')
  })

  it('produces a URL-safe string with no padding', () => {
    expect(encodePipeline(defaultPipeline())).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('decodePipeline rejects untrusted input', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['not base64 at all', '!!!not-base64!!!'],
    ['valid base64 that is not JSON', btoa('plain text')],
    ['JSON with no version field', encodeRaw({ t: [], o: { format: 'webp', quality: 80 } })],
    ['an unknown output format', encodeRaw({ v: 1, t: [], o: { format: 'bmp', quality: 80 } })],
    ['quality above the range', encodeRaw({ v: 1, t: [], o: { format: 'webp', quality: 900 } })],
    ['quality below the range', encodeRaw({ v: 1, t: [], o: { format: 'webp', quality: 0 } })],
    ['a non-integer quality', encodeRaw({ v: 1, t: [], o: { format: 'webp', quality: 80.5 } })],
    [
      'transforms that are not an array',
      encodeRaw({ v: 1, t: 'nope', o: { format: 'webp', quality: 80 } }),
    ],
    [
      'an unknown transform kind',
      encodeRaw({ v: 1, t: [{ kind: 'blur' }], o: { format: 'webp', quality: 80 } }),
    ],
    [
      'an unknown resize mode',
      encodeRaw({
        v: 1,
        t: [{ kind: 'resize', mode: 'squish' }],
        o: { format: 'webp', quality: 80 },
      }),
    ],
    [
      'a non-integer rotation',
      encodeRaw({ v: 1, t: [{ kind: 'rotate', degrees: 45 }], o: { format: 'webp', quality: 80 } }),
    ],
    [
      'a zero-width resize',
      encodeRaw({
        v: 1,
        t: [{ kind: 'resize', mode: 'contain', width: 0 }],
        o: { format: 'webp', quality: 80 },
      }),
    ],
    [
      'a fractional crop',
      encodeRaw({
        v: 1,
        t: [{ kind: 'crop', x: 0, y: 0, width: 1.5, height: 2 }],
        o: { format: 'webp', quality: 80 },
      }),
    ],
  ]

  for (const [description, payload] of cases) {
    it(`rejects ${description}`, () => {
      const decoded = decodePipeline(payload)

      expect(decoded.ok).toBe(false)
      if (!decoded.ok) expect(decoded.error.code).toBe('INVALID_PIPELINE')
    })
  }

  it('never throws, whatever it is handed', () => {
    for (const input of ['', '???', 'a', '/'.repeat(500), btoa('{"v":')]) {
      expect(() => decodePipeline(input)).not.toThrow()
    }
  })
})

describe('schema versioning', () => {
  it('refuses a payload from a newer schema instead of guessing', () => {
    const future = encodeRaw({
      v: CURRENT_SCHEMA_VERSION + 1,
      t: [],
      o: { format: 'webp', quality: 80 },
    })

    const decoded = decodePipeline(future)

    expect(decoded.ok).toBe(false)
    if (!decoded.ok) expect(decoded.error.detail).toContain('exceeds current')
  })

  it('refuses an older payload with no migration registered', () => {
    const ancient = encodeRaw({ v: 0, t: [], o: { format: 'webp', quality: 80 } })

    const decoded = decodePipeline(ancient)

    expect(decoded.ok).toBe(false)
    if (!decoded.ok) expect(decoded.error.detail).toContain('no migration registered')
  })

  it('stamps the current version onto everything it encodes', () => {
    const encoded = encodePipeline(defaultPipeline())
    const json = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
          c.charCodeAt(0),
        ),
      ),
    )

    expect(json.v).toBe(CURRENT_SCHEMA_VERSION)
  })
})
