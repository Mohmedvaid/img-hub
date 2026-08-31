/**
 * Metadata handling. Strips EXIF and optionally the colour profile.
 *
 * Stripping is on by default: EXIF carries GPS coordinates and camera serial
 * numbers, and removing it both protects the user and shrinks the file. The colour
 * profile is kept by default because dropping it visibly shifts colours on wide-gamut
 * images, which looks like a bug.
 *
 * SAFETY REQUIREMENT — stripping EXIF is only safe because decoding auto-orients
 * first. The Orientation tag tells viewers to display the pixels rotated; removing it
 * without having rotated the pixels leaves every phone photo sideways for anyone
 * whose viewer honoured the tag. Decode must bake orientation in and reset the tag.
 * If that step is ever removed, this operation becomes a bug.
 *
 * This is a flag, not a pixel operation: it is applied at encode time. It sits last
 * in the pipeline for that reason.
 */

import { ok, type Result } from '../errors'
import type { OperationModule } from '../operation'

export type MetadataTransform = {
  readonly kind: 'metadata'
  /** Removes EXIF, GPS and camera data. */
  readonly stripExif: boolean
  /** Keeping the ICC profile preserves colour accuracy at a small size cost. */
  readonly keepColorProfile: boolean
}

export const metadataOperation: OperationModule<MetadataTransform> = {
  kind: 'metadata',

  defaults() {
    return { kind: 'metadata', stripExif: true, keepColorProfile: true }
  },

  validate() {
    // Two booleans; every combination is meaningful.
    return undefined
  },

  parse(raw): Result<MetadataTransform> {
    return ok({
      kind: 'metadata',
      stripExif: raw.stripExif === true,
      keepColorProfile: raw.keepColorProfile === true,
    })
  },

  apply(image) {
    // Metadata never touches pixels. It takes effect at encode time, and the WASM
    // encoders write no EXIF at all, so stripping is what happens by default.
    //
    // That is only correct because decoding already baked the EXIF orientation into
    // these pixels — see codecs/decode.ts and ADR-0006. Keeping the colour profile
    // is not yet wired up; tracked as P1-11.
    return ok(image)
  },
}
