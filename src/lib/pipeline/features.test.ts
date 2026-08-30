import { describe, expect, it } from 'vitest'
import { allFeatures, FEATURE_ORDER, featureInfo, isFeatureId, optionalFeatures } from './features'

describe('feature catalogue', () => {
  it('lists every feature exactly once', () => {
    const ids = allFeatures().map((feature) => feature.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...FEATURE_ORDER])
  })

  it('keys every entry by its own id', () => {
    for (const feature of allFeatures()) {
      expect(featureInfo(feature.id)).toBe(feature)
    }
  })

  it('guards unknown feature ids', () => {
    expect(isFeatureId('crop')).toBe(true)
    expect(isFeatureId('sharpen')).toBe(false)
  })

  it('gives every feature a label and a hint for the checkbox', () => {
    for (const feature of allFeatures()) {
      expect(feature.label.length).toBeGreaterThan(0)
      expect(feature.hint.length).toBeGreaterThan(0)
    }
  })
})

describe('primary and optional features', () => {
  it('excludes the primary feature from the optional list', () => {
    for (const feature of allFeatures()) {
      const optional = optionalFeatures(feature.id)
      expect(optional.map((entry) => entry.id)).not.toContain(feature.id)
    }
  })

  it('offers every other feature as an option', () => {
    const optional = optionalFeatures('crop')
    expect(optional).toHaveLength(allFeatures().length - 1)
  })

  it('preserves display order in the optional list', () => {
    const ids = optionalFeatures('convert').map((feature) => feature.id)
    expect(ids).toEqual(FEATURE_ORDER.filter((id) => id !== 'convert'))
  })
})

describe('features that need no fields', () => {
  it('treats compression as a bare checkbox', () => {
    // Ticking "also compress" must not open a quality slider. Tuning quality is the
    // compressor page's job, where compress is primary.
    expect(featureInfo('compress').hasFields).toBe(false)
  })

  it('treats metadata stripping as a bare checkbox', () => {
    expect(featureInfo('metadata').hasFields).toBe(false)
  })

  it('gives crop, resize, rotate and convert fields to reveal', () => {
    for (const id of ['crop', 'resize', 'rotate', 'convert'] as const) {
      expect(featureInfo(id).hasFields).toBe(true)
    }
  })
})

describe('feature targets', () => {
  it('points convert and compress at the single encode step', () => {
    expect(featureInfo('convert').target).toEqual({ kind: 'output', field: 'format' })
    expect(featureInfo('compress').target).toEqual({ kind: 'output', field: 'quality' })
  })

  it('points every other feature at its own transform', () => {
    for (const id of ['crop', 'resize', 'rotate', 'metadata'] as const) {
      expect(featureInfo(id).target).toEqual({ kind: 'transform', transform: id })
    }
  })
})
