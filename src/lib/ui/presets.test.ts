import { limits } from '@config/limits'
import { findPreset, presets, widthPresets } from '@config/presets'
import { describe, expect, it } from 'vitest'
import {
  applyPreset,
  initialBuilderState,
  isWidthOnly,
  setDimension,
  toPipeline,
  widthOnly,
} from './pipelineState'

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

describe('width presets', () => {
  it('offers each width once', () => {
    const widths = widthPresets.map((entry) => entry.width)
    expect(new Set(widths).size).toBe(widths.length)
  })

  it('lists them largest first, so the row reads as a set of ceilings', () => {
    const widths = widthPresets.map((entry) => entry.width)
    expect(widths).toEqual([...widths].sort((a, b) => b - a))
  })

  it('stays inside the width the engine will accept', () => {
    for (const entry of widthPresets) {
      expect(entry.width).toBeGreaterThan(0)
      expect(Number.isInteger(entry.width)).toBe(true)
      expect(entry.width).toBeLessThanOrEqual(limits.maxWidth)
    }
  })

  it('says what every width is for, since the chip shows only a number', () => {
    for (const entry of widthPresets) {
      expect(entry.use.length).toBeGreaterThan(20)
    }
  })

  it('covers the width every sized preset resizes to', () => {
    // A preset and a chip that disagree on the same job would offer two routes to
    // two different answers.
    const widths = new Set(widthPresets.map((entry) => entry.width))

    for (const entry of presets) {
      if (entry.resize?.mode !== 'contain' || entry.resize.width === undefined) continue
      expect(widths).toContain(entry.resize.width)
    }
  })
})

describe('widthOnly', () => {
  const resize = (overrides: Partial<ReturnType<typeof initialBuilderState>['resize']> = {}) => ({
    ...base().resize,
    ...overrides,
  })

  it('sets the width and leaves the height to the aspect ratio', () => {
    const next = widthOnly(resize({ width: 500, height: 500 }), 1024)

    expect(next.width).toBe(1024)
    expect('height' in next).toBe(false)
  })

  it('forces contain, the only mode that means "at most this wide"', () => {
    // 'exact' with one dimension fails validation outright and 'cover' has nothing
    // to crop against, so neither can express a width-only resize.
    for (const mode of ['contain', 'cover', 'exact'] as const) {
      expect(widthOnly(resize({ mode }), 800).mode).toBe('contain')
    }
  })

  it('leaves the enlarging choice alone, which is a different question', () => {
    expect(widthOnly(resize({ allowUpscale: true }), 800).allowUpscale).toBe(true)
    expect(widthOnly(resize({ allowUpscale: false }), 800).allowUpscale).toBe(false)
  })

  it('produces a resize the engine accepts for every offered width', () => {
    for (const entry of widthPresets) {
      const state = { ...base(), resize: widthOnly(base().resize, entry.width) }
      const [transform] = toPipeline({
        ...state,
        enabled: { ...state.enabled, resize: true },
      }).transforms

      expect(transform).toEqual({
        kind: 'resize',
        mode: 'contain',
        allowUpscale: false,
        width: entry.width,
      })
    }
  })
})

describe('isWidthOnly', () => {
  it('recognises what widthOnly produced', () => {
    expect(isWidthOnly(widthOnly(base().resize, 1024), 1024)).toBe(true)
  })

  it('rejects a different width', () => {
    expect(isWidthOnly(widthOnly(base().resize, 1024), 2048)).toBe(false)
  })

  it('rejects the same width once a height is set, since that is a box', () => {
    const boxed = setDimension(widthOnly(base().resize, 1024), 'height', 1024)

    expect(isWidthOnly(boxed, 1024)).toBe(false)
  })

  it('rejects the same width under another fit mode', () => {
    const covered = { ...widthOnly(base().resize, 1024), mode: 'cover' as const }

    expect(isWidthOnly(covered, 1024)).toBe(false)
  })
})

describe('setDimension', () => {
  it('omits a cleared dimension rather than setting it undefined', () => {
    const next = setDimension({ ...base().resize, width: 800, height: 600 }, 'height', undefined)

    expect('height' in next).toBe(false)
    expect(next.width).toBe(800)
  })

  it('leaves the other axis and the mode untouched', () => {
    const next = setDimension(
      { kind: 'resize', mode: 'cover', width: 800, height: 600, allowUpscale: true },
      'width',
      1024,
    )

    expect(next).toEqual({
      kind: 'resize',
      mode: 'cover',
      width: 1024,
      height: 600,
      allowUpscale: true,
    })
  })
})
