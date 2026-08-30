/**
 * Metadata handling. Strips EXIF and optionally the colour profile.
 *
 * Stripping is on by default: EXIF carries GPS coordinates and camera serial
 * numbers, and removing it both protects the user and shrinks the file. The colour
 * profile is kept by default because dropping it visibly shifts colours on wide-gamut
 * images, which looks like a bug.
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
}
