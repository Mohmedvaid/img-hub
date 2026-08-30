/**
 * Rotate and flip. Right-angle rotation only.
 *
 * Arbitrary-angle rotation is deliberately absent: it needs a fill colour or
 * transparency for the corners it exposes, which is a product decision nobody has
 * made. Adding it later means a new field, not a new operation.
 */

import { ok, type Result } from '../errors'
import { invalidPayload, type OperationModule } from '../operation'

export type Rotation = 0 | 90 | 180 | 270

export type RotateTransform = {
  readonly kind: 'rotate'
  readonly degrees: Rotation
  readonly flipHorizontal: boolean
  readonly flipVertical: boolean
}

export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270]

export const rotateOperation: OperationModule<RotateTransform> = {
  kind: 'rotate',

  defaults() {
    return { kind: 'rotate', degrees: 0, flipHorizontal: false, flipVertical: false }
  },

  validate() {
    // Every field is a closed union or a boolean, so any value that type-checks is
    // already valid. Parsing is where untrusted input gets rejected.
    return undefined
  },

  parse(raw): Result<RotateTransform> {
    const degrees = ROTATIONS.find((candidate) => candidate === raw.degrees)
    if (degrees === undefined) return invalidPayload(`unknown rotation: ${String(raw.degrees)}`)

    return ok({
      kind: 'rotate',
      degrees,
      flipHorizontal: raw.flipHorizontal === true,
      flipVertical: raw.flipVertical === true,
    })
  },
}
