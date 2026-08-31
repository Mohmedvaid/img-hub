import { describe, expect, it } from 'vitest'
import { COMPRESS_CHECKBOX_QUALITY } from '@/lib/pipeline/features'
import { type BuilderState, hasWork, initialBuilderState, toPipeline } from './pipelineState'

function enable(state: BuilderState, ...ids: Array<keyof BuilderState['enabled']>): BuilderState {
  const enabled = { ...state.enabled }
  for (const id of ids) enabled[id] = true
  return { ...state, enabled }
}

describe('initial state', () => {
  it('switches the primary feature on', () => {
    expect(initialBuilderState('compress').enabled.compress).toBe(true)
  })

  it('leaves every other feature off', () => {
    const state = initialBuilderState('compress')

    expect(state.enabled.resize).toBe(false)
    expect(state.enabled.convert).toBe(false)
    expect(state.enabled.rotate).toBe(false)
  })

  it('starts with everything off when there is no primary', () => {
    expect(hasWork(initialBuilderState(undefined))).toBe(false)
  })
})

describe('initial state from a tool preset', () => {
  const stripExif = { kind: 'metadata', stripExif: true } as const

  it('opens on the format the page is named after', () => {
    // Regression: without this every conversion page started on the same default, so
    // png-to-jpg produced WebP.
    const state = initialBuilderState('convert', {
      transforms: [stripExif],
      output: { format: 'jpeg', quality: 80 },
    })

    expect(state.outputFormat).toBe('jpeg')
    expect(state.enabled.convert).toBe(true)
  })

  it('takes the quality the preset asks for', () => {
    const state = initialBuilderState('compress', {
      transforms: [],
      output: { format: 'source', quality: 60 },
    })

    expect(state.quality).toBe(60)
  })

  it('does not tick convert for a preset that keeps the source format', () => {
    const state = initialBuilderState('crop', {
      transforms: [stripExif],
      output: { format: 'source', quality: 80 },
    })

    expect(state.enabled.convert).toBe(false)
  })

  it('switches on every feature the preset lists a transform for', () => {
    const state = initialBuilderState('resize', {
      transforms: [
        stripExif,
        { kind: 'resize', mode: 'cover', width: 1080, height: 1080, allowUpscale: false },
      ],
      output: { format: 'source', quality: 80 },
    })

    expect(state.enabled.metadata).toBe(true)
    expect(state.enabled.resize).toBe(true)
    expect(state.resize).toMatchObject({ mode: 'cover', width: 1080, height: 1080 })
  })

  it('loads a rotation from the preset in the orientation the buttons use', () => {
    const state = initialBuilderState('rotate', {
      transforms: [{ kind: 'rotate', degrees: 90, flipHorizontal: true, flipVertical: false }],
      output: { format: 'source', quality: 80 },
    })

    expect(state.enabled.rotate).toBe(true)
    expect(state.orientation).toEqual({ rotation: 90, mirrored: true })
  })

  it('round-trips a preset back out through toPipeline', () => {
    const preset = {
      transforms: [stripExif],
      output: { format: 'webp', quality: 80 },
    } as const

    expect(toPipeline(initialBuilderState('convert', preset))).toEqual(preset)
  })

  it('leaves the home builder untouched, since it has no preset', () => {
    const state = initialBuilderState(undefined)

    expect(Object.values(state.enabled).every((on) => !on)).toBe(true)
  })
})

describe('toPipeline', () => {
  it('keeps the source format until convert is switched on', () => {
    const state = enable(initialBuilderState(undefined), 'resize')

    expect(toPipeline(state).output.format).toBe('source')
  })

  it('uses the chosen format once convert is on', () => {
    const state = {
      ...enable(initialBuilderState(undefined), 'convert'),
      outputFormat: 'jpeg' as const,
    }

    expect(toPipeline(state).output.format).toBe('jpeg')
  })

  it('includes only the transforms whose feature is enabled', () => {
    const state = enable(initialBuilderState(undefined), 'resize', 'metadata')
    const kinds = toPipeline(state).transforms.map((transform) => transform.kind)

    expect(kinds).toContain('resize')
    expect(kinds).toContain('metadata')
    expect(kinds).not.toContain('rotate')
    expect(kinds).not.toContain('crop')
  })

  it('produces no transforms when nothing is enabled', () => {
    expect(toPipeline(initialBuilderState(undefined)).transforms).toHaveLength(0)
  })

  it('applies the checkbox quality when nobody has chosen one', () => {
    const state = enable(initialBuilderState(undefined), 'resize')

    expect(toPipeline(state).output.quality).toBe(COMPRESS_CHECKBOX_QUALITY)
  })

  it('applies the chosen quality when compress is on', () => {
    const state = { ...enable(initialBuilderState(undefined), 'compress'), quality: 42 }

    expect(toPipeline(state).output.quality).toBe(42)
  })

  it('applies the chosen quality when converting, since that is an encode decision', () => {
    const state = { ...enable(initialBuilderState(undefined), 'convert'), quality: 42 }

    expect(toPipeline(state).output.quality).toBe(42)
  })

  it('never emits a duplicate transform kind', () => {
    const state = enable(initialBuilderState(undefined), 'rotate', 'resize', 'metadata', 'crop')
    const kinds = toPipeline(state).transforms.map((transform) => transform.kind)

    expect(new Set(kinds).size).toBe(kinds.length)
  })
})

describe('hasWork', () => {
  it('is false with nothing selected, so the run button can be disabled', () => {
    expect(hasWork(initialBuilderState(undefined))).toBe(false)
  })

  it('is true as soon as one feature is on', () => {
    expect(hasWork(enable(initialBuilderState(undefined), 'metadata'))).toBe(true)
  })
})
