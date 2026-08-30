/**
 * Serialises a pipeline to a URL-safe string, and back.
 *
 * Why this exists before anything reads it: once shareable links ship, every encoded
 * pipeline anyone has saved or published becomes a permanent public contract. Adding
 * versioning after the fact means breaking those links. Adding it now costs one
 * integer.
 *
 * This file owns the envelope — versioning, migration, base64 — and nothing else.
 * Each transform is parsed by its own operation module, so adding an operation never
 * touches this file.
 *
 * Contract:
 *   - `v` is the schema version and is always the first thing read.
 *   - A payload from an older version is passed through the migration chain.
 *   - A payload from a newer version is rejected, not guessed at.
 *   - Decoding is defensive: input arrives from a URL and is never trusted.
 */

import { fail, ok, type Result } from './errors'
import { isImageFormat } from './formats'
import { parseTransform } from './registry'
import { type OutputSpec, type Pipeline, QUALITY_RANGE, type Transform } from './types'

export const CURRENT_SCHEMA_VERSION = 1

type VersionedPayload = { readonly v: number } & Record<string, unknown>

/**
 * Migrations from version N to N+1, keyed by the version being upgraded FROM.
 *
 * Empty until the first breaking change. When adding one: bump
 * CURRENT_SCHEMA_VERSION, add the entry, and add a decode test using a real captured
 * payload from the old version.
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
    return invalid('payload is not valid JSON', cause)
  }

  if (!isRecord(parsed) || typeof parsed.v !== 'number') {
    return invalid('payload is missing a version field')
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
    return invalid('transforms is not an array')
  }

  const transforms: Transform[] = []
  for (const raw of payload.t) {
    if (!isRecord(raw) || typeof raw.kind !== 'string') {
      return invalid('transform is missing a kind')
    }

    const transform = parseTransform(raw.kind, raw)
    if (!transform.ok) return transform
    transforms.push(transform.value)
  }

  return ok({ transforms, output: output.value })
}

function parseOutput(raw: unknown): Result<OutputSpec> {
  if (!isRecord(raw)) {
    return invalid('output is not an object')
  }

  if (typeof raw.format !== 'string' || !(raw.format === 'source' || isImageFormat(raw.format))) {
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

function invalid<T>(detail: string, cause?: unknown): Result<T> {
  return fail('INVALID_PIPELINE', {
    message: "This link's settings couldn't be read.",
    detail,
    stage: 'validate',
    ...(cause === undefined ? {} : { cause }),
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
    return invalid('payload is not valid base64url', cause)
  }
}
