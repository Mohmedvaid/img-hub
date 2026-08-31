/**
 * Contract tests every operation must satisfy.
 *
 * `contractTests` is invoked once per module with its concrete type, rather than by
 * looping over the registry, because the correlation between `defaults()` and
 * `validate()` only type-checks when the operation's type is known at the call site.
 * The count assertion at the bottom fails if a new operation is registered without
 * being added here.
 */

import { describe, expect, it } from 'vitest'
import type { OperationModule, PipelineLimits, TransformLike } from '../operation'
import { defaultsFor, OPERATIONS, parseTransform, sortTransforms } from '../registry'
import type { Transform } from '../types'
import { cropOperation } from './crop'
import { metadataOperation } from './metadata'
import { resizeOperation } from './resize'
import { rotateOperation } from './rotate'

const limits: PipelineLimits = {
  maxWidth: 20_000,
  maxHeight: 20_000,
  maxPixels: 100_000_000,
  enabledOutputFormats: ['jpeg', 'png', 'webp'],
}

type ContractOptions = {
  /**
   * True when `defaults()` is deliberately incomplete because the value depends on
   * the source image. Crop is the only such case: a crop box has no meaning until a
   * file supplies dimensions.
   */
  readonly defaultsNeedSourceImage?: boolean
}

function contractTests<T extends TransformLike>(
  operation: OperationModule<T>,
  options: ContractOptions = {},
) {
  describe(operation.kind, () => {
    it('tags its defaults with its own kind', () => {
      expect(operation.defaults().kind).toBe(operation.kind)
    })

    it('produces defaults a user can act on', () => {
      const error = operation.validate(operation.defaults(), limits)

      if (options.defaultsNeedSourceImage) {
        expect(error?.code).toBe('INVALID_PIPELINE')
      } else {
        expect(error).toBeUndefined()
      }
    })

    it('round-trips its own defaults through parse', () => {
      const defaults = operation.defaults()
      const parsed = operation.parse({ ...defaults })

      expect(parsed.ok).toBe(true)
      if (parsed.ok) expect(parsed.value).toEqual(defaults)
    })

    it('never throws on hostile input', () => {
      const hostile = [{}, { kind: 'x' }, { width: '10' }, { degrees: null }, { x: Number.NaN }]

      for (const input of hostile) {
        expect(() => operation.parse(input)).not.toThrow()
      }
    })

    it('reports a stable error code when parsing fails', () => {
      const parsed = operation.parse({ width: 'wide', x: 'left', degrees: 'sideways' })

      if (!parsed.ok) expect(parsed.error.code).toBe('INVALID_PIPELINE')
    })
  })
}

contractTests(cropOperation, { defaultsNeedSourceImage: true })
contractTests(resizeOperation)
contractTests(rotateOperation)
contractTests(metadataOperation)

describe('operations stay independent', () => {
  it('covers every registered operation with contract tests', () => {
    // Bump this alongside the contractTests calls above when adding an operation.
    expect(OPERATIONS).toHaveLength(4)
  })

  it('registers each kind exactly once', () => {
    const kinds = OPERATIONS.map((operation) => operation.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('resolves defaults for every registered kind', () => {
    for (const operation of OPERATIONS) {
      expect(defaultsFor(operation.kind).kind).toBe(operation.kind)
    }
  })

  it('routes parsing to the matching module', () => {
    for (const operation of OPERATIONS) {
      const parsed = parseTransform(operation.kind, { ...operation.defaults() })

      expect(parsed.ok).toBe(true)
      if (parsed.ok) expect(parsed.value.kind).toBe(operation.kind)
    }
  })

  it('rejects a kind no module claims', () => {
    const parsed = parseTransform('sharpen', {})

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error.detail).toContain('sharpen')
  })
})

describe('pipeline order', () => {
  it('applies operations in pipeline order however they were added', () => {
    const scrambled: Transform[] = [
      { kind: 'metadata', stripExif: true, keepColorProfile: true },
      { kind: 'resize', mode: 'contain', width: 100, allowUpscale: false },
      { kind: 'crop', x: 0, y: 0, width: 10, height: 10 },
      { kind: 'rotate', degrees: 90, flipHorizontal: false, flipVertical: false },
    ]

    expect(sortTransforms(scrambled).map((transform) => transform.kind)).toEqual([
      'rotate',
      'crop',
      'resize',
      'metadata',
    ])
  })

  it('rotates before cropping, because crop coordinates are in post-rotation space', () => {
    // Reversing these silently selects the wrong region: the user drew the box on a
    // rotated preview, so applying it to unrotated pixels crops somewhere else
    // entirely. See operations/crop.ts and docs/adr/0006.
    const order = orderOf([
      { kind: 'crop', x: 0, y: 0, width: 10, height: 10 },
      { kind: 'rotate', degrees: 90, flipHorizontal: false, flipVertical: false },
    ])

    expect(order.indexOf('rotate')).toBeLessThan(order.indexOf('crop'))
  })

  it('crops before resizing, so the resize box applies to the final composition', () => {
    // Reversing these also throws away resolution the crop then has to magnify.
    const order = orderOf([
      { kind: 'resize', mode: 'contain', width: 100, allowUpscale: false },
      { kind: 'crop', x: 0, y: 0, width: 10, height: 10 },
    ])

    expect(order.indexOf('crop')).toBeLessThan(order.indexOf('resize'))
  })

  it('leaves metadata last, since it is an encode-time flag not a pixel operation', () => {
    const order = orderOf([
      { kind: 'metadata', stripExif: true, keepColorProfile: true },
      { kind: 'rotate', degrees: 90, flipHorizontal: false, flipVertical: false },
    ])

    expect(order.at(-1)).toBe('metadata')
  })

  it('orders every registered operation, leaving none unplaced', () => {
    const everything = OPERATIONS.map((operation) => defaultsFor(operation.kind))

    expect(sortTransforms(everything)).toHaveLength(OPERATIONS.length)
  })

  it('does not mutate the array it is given', () => {
    const original: Transform[] = [
      { kind: 'metadata', stripExif: true, keepColorProfile: true },
      { kind: 'crop', x: 0, y: 0, width: 10, height: 10 },
    ]
    const snapshot = [...original]

    sortTransforms(original)

    expect(original).toEqual(snapshot)
  })
})

function orderOf(transforms: Transform[]): string[] {
  return sortTransforms(transforms).map((transform) => transform.kind)
}
