import { describe, expect, it } from 'vitest'
import type { PipelineLimits } from './operation'
import { validatePipeline } from './registry'
import { defaultPipeline, type Pipeline } from './types'

const limits: PipelineLimits = {
  maxWidth: 20_000,
  maxHeight: 20_000,
  maxPixels: 100_000_000,
  enabledOutputFormats: ['jpeg', 'png', 'webp'],
}

function withTransforms(transforms: Pipeline['transforms']): Pipeline {
  return { transforms, output: { format: 'webp', quality: 80 } }
}

describe('validatePipeline', () => {
  it('accepts the default pipeline', () => {
    expect(validatePipeline(defaultPipeline(), limits).ok).toBe(true)
  })

  it('rejects an output format that is disabled by policy', () => {
    const result = validatePipeline(
      { transforms: [], output: { format: 'avif', quality: 50 } },
      limits,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNSUPPORTED_OUTPUT_FORMAT')
  })

  it('rejects a format that has no encoder at all', () => {
    const result = validatePipeline(
      { transforms: [], output: { format: 'gif', quality: 50 } },
      { ...limits, enabledOutputFormats: ['gif'] },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('not written')
  })

  it.each([0, 101, 50.5, Number.NaN])('rejects quality %s', (quality) => {
    const result = validatePipeline({ transforms: [], output: { format: 'webp', quality } }, limits)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_PIPELINE')
  })

  it('rejects a resize with neither width nor height', () => {
    const result = validatePipeline(
      withTransforms([{ kind: 'resize', mode: 'contain', allowUpscale: false }]),
      limits,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_PIPELINE')
  })

  it('rejects exact mode without both dimensions', () => {
    const result = validatePipeline(
      withTransforms([{ kind: 'resize', mode: 'exact', width: 100, allowUpscale: false }]),
      limits,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('both a width and a height')
  })

  it('rejects dimensions beyond the configured maximum', () => {
    const result = validatePipeline(
      withTransforms([{ kind: 'resize', mode: 'contain', width: 999_999, allowUpscale: false }]),
      limits,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('DIMENSIONS_TOO_LARGE')
  })

  it('rejects a pixel count beyond the limit even when each axis is legal', () => {
    const result = validatePipeline(
      withTransforms([
        { kind: 'resize', mode: 'exact', width: 15_000, height: 15_000, allowUpscale: false },
      ]),
      limits,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('DIMENSIONS_TOO_LARGE')
  })

  it('rejects a negative crop origin', () => {
    const result = validatePipeline(
      withTransforms([{ kind: 'crop', x: -1, y: 0, width: 10, height: 10 }]),
      limits,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_PIPELINE')
  })

  it('rejects a zero-area crop', () => {
    const result = validatePipeline(
      withTransforms([{ kind: 'crop', x: 0, y: 0, width: 0, height: 10 }]),
      limits,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_PIPELINE')
  })

  it('rejects the same transform applied twice', () => {
    const result = validatePipeline(
      withTransforms([
        { kind: 'rotate', degrees: 90, flipHorizontal: false, flipVertical: false },
        { kind: 'rotate', degrees: 180, flipHorizontal: false, flipVertical: false },
      ]),
      limits,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('one rotate step')
  })

  it('accepts every distinct transform combined in one pass', () => {
    const result = validatePipeline(
      withTransforms([
        { kind: 'crop', x: 0, y: 0, width: 500, height: 500 },
        { kind: 'rotate', degrees: 270, flipHorizontal: false, flipVertical: true },
        { kind: 'resize', mode: 'cover', width: 200, height: 200, allowUpscale: true },
        { kind: 'metadata', stripExif: true, keepColorProfile: true },
      ]),
      limits,
    )

    expect(result.ok).toBe(true)
  })
})
