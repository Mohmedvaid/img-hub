/**
 * Builder state: which features are on, and what each is set to.
 *
 * Feature state is tracked explicitly rather than inferred from the pipeline. The
 * two are not equivalent — "compress is off" and "compress is on at quality 100"
 * produce the same output but mean different things to the user, and a checkbox that
 * un-ticks itself because the value happened to look like a default is maddening.
 *
 * `toPipeline` is the one place that turns this into something the engine runs.
 */

import type { Preset } from '@config/presets'
import type { FeatureId } from '@/lib/pipeline/features'
import { COMPRESS_CHECKBOX_QUALITY } from '@/lib/pipeline/features'
import type { ImageFormat } from '@/lib/pipeline/formats'
import type { CropTransform } from '@/lib/pipeline/operations/crop'
import type { MetadataTransform } from '@/lib/pipeline/operations/metadata'
import type { ResizeTransform } from '@/lib/pipeline/operations/resize'
import type { RotateTransform } from '@/lib/pipeline/operations/rotate'
import {
  DEFAULT_QUALITY,
  type OutputFormat,
  type Pipeline,
  type Transform,
} from '@/lib/pipeline/types'

export type BuilderState = {
  readonly enabled: Readonly<Record<FeatureId, boolean>>
  readonly rotate: RotateTransform
  readonly resize: ResizeTransform
  readonly crop: CropTransform
  readonly metadata: MetadataTransform
  readonly outputFormat: ImageFormat
  readonly quality: number
}

/**
 * The starting state for a page.
 *
 * The primary feature is always on: it is what the page is about, and it cannot be
 * switched off. Everything else starts off, so a page never does something the
 * visitor did not ask for.
 */
export function initialBuilderState(primary: FeatureId | undefined): BuilderState {
  const off: Record<FeatureId, boolean> = {
    crop: false,
    rotate: false,
    resize: false,
    convert: false,
    compress: false,
    metadata: false,
  }

  return {
    enabled: primary ? { ...off, [primary]: true } : off,
    rotate: { kind: 'rotate', degrees: 90, flipHorizontal: false, flipVertical: false },
    resize: { kind: 'resize', mode: 'contain', width: 1920, allowUpscale: false },
    crop: { kind: 'crop', x: 0, y: 0, width: 0, height: 0 },
    metadata: { kind: 'metadata', stripExif: true, keepColorProfile: true },
    outputFormat: 'webp',
    quality: DEFAULT_QUALITY,
  }
}

/** True when at least one feature that changes the file is switched on. */
export function hasWork(state: BuilderState): boolean {
  return Object.values(state.enabled).some(Boolean)
}

/**
 * Applies a named preset over the current state.
 *
 * Features the preset does not list are switched off, so picking one produces
 * exactly what its description promises rather than combining with whatever was
 * already ticked. Crop is the exception: it is preserved when it was already on,
 * because a crop box the user drew by hand is work a preset should not silently
 * discard.
 */
export function applyPreset(current: BuilderState, preset: Preset): BuilderState {
  const enabled: Record<FeatureId, boolean> = {
    crop: current.enabled.crop,
    rotate: false,
    resize: false,
    convert: false,
    compress: false,
    metadata: false,
  }
  for (const feature of preset.features) {
    enabled[feature] = true
  }

  return {
    ...current,
    enabled,
    resize: preset.resize
      ? {
          kind: 'resize',
          mode: preset.resize.mode,
          allowUpscale: false,
          ...(preset.resize.width === undefined ? {} : { width: preset.resize.width }),
          ...(preset.resize.height === undefined ? {} : { height: preset.resize.height }),
        }
      : current.resize,
    outputFormat: preset.outputFormat ?? current.outputFormat,
    quality: preset.quality ?? current.quality,
  }
}

export function toPipeline(state: BuilderState): Pipeline {
  const transforms: Transform[] = []

  if (state.enabled.rotate) transforms.push(state.rotate)
  if (state.enabled.crop) transforms.push(state.crop)
  if (state.enabled.resize) transforms.push(state.resize)
  if (state.enabled.metadata) transforms.push(state.metadata)

  // 'source' keeps whatever format arrived. Only ticking convert changes it, so a
  // resize never silently hands back a different file type.
  const format: OutputFormat = state.enabled.convert ? state.outputFormat : 'source'

  // Compression as a bare checkbox applies a sensible quality; the slider only
  // exists where compress is the page's primary feature.
  const quality = state.enabled.compress ? state.quality : COMPRESS_CHECKBOX_QUALITY

  return { transforms, output: { format, quality } }
}
