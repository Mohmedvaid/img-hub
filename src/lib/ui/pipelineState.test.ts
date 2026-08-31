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

  it('applies the checkbox quality when compress is off', () => {
    const state = enable(initialBuilderState(undefined), 'resize')

    expect(toPipeline(state).output.quality).toBe(COMPRESS_CHECKBOX_QUALITY)
  })

  it('applies the chosen quality when compress is on', () => {
    const state = { ...enable(initialBuilderState(undefined), 'compress'), quality: 42 }

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
