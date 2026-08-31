/**
 * Rotate and flip. Right-angle rotation only.
 *
 * This is the user's OWN explicit turn, and it is separate from EXIF
 * auto-orientation. A phone photo arrives with an Orientation tag saying how it
 * should be displayed; decoding bakes that into the pixels before any operation
 * runs, so `degrees: 0` here means "as the user sees it", never "as the sensor
 * recorded it". Conflating the two is how images end up sideways.
 *
 * Runs first in the pipeline, because crop coordinates are defined against the
 * rotated image. See operations/crop.ts for that contract.
 *
 * Arbitrary-angle rotation is deliberately absent: it needs a fill colour or
 * transparency for the corners it exposes, which is a product decision nobody has
 * made. Adding it later means a new field, not a new operation.
 */

import { createCanvas } from '../codecs/canvas'
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

  apply(image, transform) {
    const { degrees, flipHorizontal, flipVertical } = transform

    if (degrees === 0 && !flipHorizontal && !flipVertical) {
      return ok(image)
    }

    // A quarter turn swaps the axes; a half turn does not.
    const swapsAxes = degrees === 90 || degrees === 270
    const width = swapsAxes ? image.height : image.width
    const height = swapsAxes ? image.width : image.height

    const surface = createCanvas(width, height)
    if (!surface.ok) return surface

    const source = createCanvas(image.width, image.height)
    if (!source.ok) return source
    source.value.context.putImageData(image, 0, 0)

    const { context } = surface.value

    // Rotate about the centre of the destination, then draw the source centred on
    // that same point. Doing it in this order means the same maths works for all
    // four angles instead of a special case per angle.
    context.translate(width / 2, height / 2)
    context.rotate((degrees * Math.PI) / 180)
    context.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1)
    context.drawImage(source.value.canvas, -image.width / 2, -image.height / 2)

    return ok(context.getImageData(0, 0, width, height))
  },
}
