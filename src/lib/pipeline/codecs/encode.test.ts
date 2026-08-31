import { describe, expect, it } from 'vitest'
import { encodeImage } from './encode'

/**
 * These run in Node, where the WASM codecs are not available, so they cover the
 * paths that reject before any codec loads. Real encoding is covered end to end in
 * the browser.
 */
describe('encodeImage guards', () => {
  const pixels = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData

  it('refuses a format that has no encoder', async () => {
    const result = await encodeImage(pixels, 'gif', 80)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNSUPPORTED_OUTPUT_FORMAT')
      expect(result.error.message).toContain('not written')
    }
  })

  it('reports an encode failure rather than throwing', async () => {
    // No WASM in this environment, so the dynamic import fails. The point is that
    // it surfaces as a typed error at the encode stage.
    const result = await encodeImage(pixels, 'jpeg', 80)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.stage).toBe('encode')
  })
})
