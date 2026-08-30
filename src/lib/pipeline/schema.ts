/**
 * Serialises a pipeline to a URL-safe string, and back.
 *
 * Why this exists in phase 0, before anything reads it: once shareable links ship,
 * every encoded pipeline anyone has saved or published becomes a permanent public
 * contract. Adding versioning after the fact means breaking those links. Adding it
 * now costs one integer.
 *
 * Contract:
 *   - `v` is the schema version and is always the first thing read.
 *   - A payload from an older version is passed through the migration chain.
 *   - A payload from a newer version is rejected, not guessed at.
 *   - Decoding is defensive: input arrives from a URL and is never trusted.
 */

import { fail, ok, type Result } from './errors'
import { isImageFormat } from './formats'
import {
  type OutputSpec,
  type Pipeline,
  QUALITY_RANGE,
  type ResizeMode,
  type Transform,
} from './types'

export const CURRENT_SCHEMA_VERSION = 1

type VersionedPayload = { readonly v: number } & Record<string, unknown>

/**
 * Migrations from version N to N+1, keyed by the version being upgraded FROM.
 *
 * Empty until the first breaking change. When adding one: bump
 * CURRENT_SCHEMA_VERSION, add the entry, and add a decode test using a real
 * captured payload from the old version.
 */
const MIGRATIONS: Record<number, (payload: VersionedPayload) => VersionedPayload> = {}

export function encodePipeline(pipeline: Pipeline): string {
  const payload = {
    v: CURRENT_SCHEMA_VERSION,
    t: pipeline.transforms,
    o: pipeline.output,
  }
  return toBase64Url(JSON.stringify(payload))
}

export function decodePipeline(encoded: string): Result<Pipeline> {
  const json = fromBase64Url(encoded)
  if (!json.ok) return json

  let parsed: unknown
  try {
    parsed = JSON.parse(json.value)
  } catch (cause) {
    return fail('INVALID_PIPELINE', {
      message: "This link's settings couldn't be read.",
      detail: 'payload is not valid JSON',
      stage: 'validate',
      cause,
    })
  }

  if (!isRecord(parsed) || typeof parsed.v !== 'number') {
    return fail('INVALID_PIPELINE', {
      message: "This link's settings couldn't be read.",
      detail: 'payload is missing a version field',
      stage: 'validate',
    })
  }

  const migrated = migrate(parsed as VersionedPayload)
  if (!migrated.ok) return migrated

  return parsePipeline(migrated.value)
}

function migrate(payload: VersionedPayload): Result<VersionedPayload> {
  if (payload.v > CURRENT_SCHEMA_VERSION) {
    return fail('INVALID_PIPELINE', {
      message: 'This link was made with a newer version of the app. Try reloading the page.',
      detail: `payload v${payload.v} exceeds current v${CURRENT_SCHEMA_VERSION}`,
      stage: 'validate',
    })
  }

  let current = payload
  while (current.v < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[current.v]
    if (!step) {
      return fail('INVALID_PIPELINE', {
        message: 'This link is no longer supported.',
        detail: `no migration registered from v${current.v}`,
        stage: 'validate',
      })
    }
    current = step(current)
  }

  return ok(current)
}

function parsePipeline(payload: VersionedPayload): Result<Pipeline> {
  const output = parseOutput(payload.o)
  if (!output.ok) return output

  if (!Array.isArray(payload.t)) {
    return fail('INVALID_PIPELINE', {
      message: "This link's settings couldn't be read.",
      detail: 'transforms is not an array',
      stage: 'validate',
    })
  }

  const transforms: Transform[] = []
  for (const raw of payload.t) {
    const transform = parseTransform(raw)
    if (!transform.ok) return transform
    transforms.push(transform.value)
  }

  return ok({ transforms, output: output.value })
}

function parseOutput(raw: unknown): Result<OutputSpec> {
  if (!isRecord(raw)) {
    return invalid('output is not an object')
  }
  if (typeof raw.format !== 'string' || !isImageFormat(raw.format)) {
    return invalid(`unknown output format: ${String(raw.format)}`)
  }
  if (
    typeof raw.quality !== 'number' ||
    !Number.isInteger(raw.quality) ||
    raw.quality < QUALITY_RANGE.min ||
    raw.quality > QUALITY_RANGE.max
  ) {
    return invalid(`quality out of range: ${String(raw.quality)}`)
  }
  return ok({ format: raw.format, quality: raw.quality })
}

const RESIZE_MODES: readonly ResizeMode[] = ['contain', 'cover', 'exact']
const ROTATIONS = [0, 90, 180, 270] as const

function parseTransform(raw: unknown): Result<Transform> {
  if (!isRecord(raw) || typeof raw.kind !== 'string') {
    return invalid('transform is missing a kind')
  }

  switch (raw.kind) {
    case 'resize':
      return parseResize(raw)
    case 'crop':
      return parseCrop(raw)
    case 'rotate':
      return parseRotate(raw)
    case 'metadata':
      return parseMetadata(raw)
    default:
      return invalid(`unknown transform kind: ${raw.kind}`)
  }
}

function parseResize(raw: Record<string, unknown>): Result<Transform> {
  const mode = RESIZE_MODES.find((candidate) => candidate === raw.mode)
  if (!mode) return invalid(`unknown resize mode: ${String(raw.mode)}`)

  const width = parseOptionalDimension(raw.width)
  const height = parseOptionalDimension(raw.height)
  if (width === 'invalid' || height === 'invalid') return invalid('resize dimension is invalid')

  return ok({
    kind: 'resize',
    mode,
    allowUpscale: raw.allowUpscale === true,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  })
}

function parseCrop(raw: Record<string, unknown>): Result<Transform> {
  const values = ['x', 'y', 'width', 'height'].map((key) => raw[key])
  if (!values.every((value) => typeof value === 'number' && Number.isInteger(value))) {
    return invalid('crop values must be integers')
  }

  const [x, y, width, height] = values as [number, number, number, number]
  return ok({ kind: 'crop', x, y, width, height })
}

function parseRotate(raw: Record<string, unknown>): Result<Transform> {
  const degrees = ROTATIONS.find((candidate) => candidate === raw.degrees)
  if (degrees === undefined) return invalid(`unknown rotation: ${String(raw.degrees)}`)

  return ok({
    kind: 'rotate',
    degrees,
    flipHorizontal: raw.flipHorizontal === true,
    flipVertical: raw.flipVertical === true,
  })
}

function parseMetadata(raw: Record<string, unknown>): Result<Transform> {
  return ok({
    kind: 'metadata',
    stripExif: raw.stripExif === true,
    keepColorProfile: raw.keepColorProfile === true,
  })
}

/** Returns undefined for an absent value, 'invalid' for a present but unusable one. */
function parseOptionalDimension(value: unknown): number | undefined | 'invalid' {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return 'invalid'
  return value
}

function invalid<T>(detail: string): Result<T> {
  return fail('INVALID_PIPELINE', {
    message: "This link's settings couldn't be read.",
    detail,
    stage: 'validate',
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): Result<string> {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return ok(new TextDecoder().decode(bytes))
  } catch (cause) {
    return fail('INVALID_PIPELINE', {
      message: "This link's settings couldn't be read.",
      detail: 'payload is not valid base64url',
      stage: 'validate',
      cause,
    })
  }
}
