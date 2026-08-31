import { findPreset, presets } from '@config/presets'
import { describe, expect, it } from 'vitest'
import { applyPreset, initialBuilderState, toPipeline } from './pipelineState'

const base = () => initialBuilderState(undefined)

/** Fails with the missing id rather than a null dereference. */
function preset(id: string) {
  const found = findPreset(id)
  if (!found) throw new Error(`no preset registered with id: ${id}`)
  return found
}

describe('preset catalogue', () => {
  it('gives every preset a unique id', () => {
    const ids = presets.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every preset a label and a hint', () => {
    for (const preset of presets) {
      expect(preset.label.length).toBeGreaterThan(0)
      expect(preset.hint.length).toBeGreaterThan(20)
    }
  })

  it('enables at least one feature per preset', () => {
    for (const preset of presets) {
      expect(preset.features.length).toBeGreaterThan(0)
    }
  })

  it('keeps every quality in range', () => {
    for (const preset of presets) {
      if (preset.quality === undefined) continue
      expect(preset.quality).toBeGreaterThanOrEqual(1)
      expect(preset.quality).toBeLessThanOrEqual(100)
    }
  })

  it('gives a cover resize both dimensions, which the engine requires', () => {
    for (const preset of presets) {
      if (preset.resize?.mode !== 'cover') continue
      expect(preset.resize.width).toBeDefined()
      expect(preset.resize.height).toBeDefined()
    }
  })
})

describe('applyPreset', () => {
  it('produces exactly the features the preset names', () => {
    const state = applyPreset(base(), preset('email'))

    expect(state.enabled.resize).toBe(true)
    expect(state.enabled.convert).toBe(true)
    expect(state.enabled.rotate).toBe(false)
  })

  it('switches off features the preset does not name', () => {
    const withRotate = { ...base(), enabled: { ...base().enabled, rotate: true } }
    const state = applyPreset(withRotate, preset('privacy'))

    expect(state.enabled.rotate).toBe(false)
    expect(state.enabled.metadata).toBe(true)
  })

  it('keeps a crop the user already drew, because that is manual work', () => {
    const withCrop = {
      ...base(),
      enabled: { ...base().enabled, crop: true },
      crop: { kind: 'crop' as const, x: 10, y: 10, width: 100, height: 100 },
    }
    const state = applyPreset(withCrop, preset('web'))

    expect(state.enabled.crop).toBe(true)
    expect(state.crop).toEqual(withCrop.crop)
  })

  it('does not switch crop on when it was off', () => {
    expect(applyPreset(base(), preset('web')).enabled.crop).toBe(false)
  })

  it('never enlarges, so a small source is not blown up by a preset', () => {
    for (const preset of presets) {
      const state = applyPreset(base(), preset)
      expect(state.resize.allowUpscale).toBe(false)
    }
  })

  it('leaves the source format alone when the preset does not convert', () => {
    const pipeline = toPipeline(applyPreset(base(), preset('privacy')))

    expect(pipeline.output.format).toBe('source')
  })

  it('produces a runnable pipeline for every preset', () => {
    for (const preset of presets) {
      const pipeline = toPipeline(applyPreset(base(), preset))

      expect(pipeline.transforms.length).toBeGreaterThan(0)
      const kinds = pipeline.transforms.map((transform) => transform.kind)
      expect(new Set(kinds).size).toBe(kinds.length)
    }
  })

  it('sets both dimensions for the square preset, so cover has a box to fill', () => {
    const state = applyPreset(base(), preset('social-square'))

    expect(state.resize.mode).toBe('cover')
    expect(state.resize.width).toBe(1080)
    expect(state.resize.height).toBe(1080)
  })

  it('describes every sized preset as a ceiling, since none of them enlarge', () => {
    // The hint has to match the behaviour: a 1200x900 source under the square preset
    // yields 900x900, not 1080x1080, because enlarging is off.
    for (const entry of presets) {
      if (!entry.resize) continue
      expect(entry.hint).toMatch(/up to/i)
    }
  })
})
