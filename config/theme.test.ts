import { describe, expect, it } from 'vitest'
import { cssVariables, theme } from './theme'

describe('design tokens', () => {
  it('defines the same token names in light and dark', () => {
    // A token present in one and missing from the other renders as nothing in that
    // mode, which shows up as invisible text rather than an error.
    expect(Object.keys(theme.colors.light).sort()).toEqual(Object.keys(theme.colors.dark).sort())
  })

  it('gives every colour a real value', () => {
    for (const scale of [theme.colors.light, theme.colors.dark]) {
      for (const [name, value] of Object.entries(scale)) {
        expect(value, name).toMatch(/oklch|#|rgb/)
      }
    }
  })
})

describe('cssVariables', () => {
  const css = cssVariables()

  it('emits a light palette on the bare root', () => {
    expect(css).toContain(':root{')
    expect(css).toContain(`--t-brand:${theme.colors.light.brand}`)
  })

  it('swaps to the dark palette under a dark colour scheme', () => {
    expect(css).toContain('@media (prefers-color-scheme:dark)')
    expect(css).toContain(`--t-brand:${theme.colors.dark.brand}`)
  })

  it('lets an explicit choice beat the system setting in both directions', () => {
    expect(css).toContain(':root:not([data-theme="light"])')
    expect(css).toContain(':root[data-theme="dark"]')
  })

  it('prefixes tokens so they cannot collide with Tailwind own --color-* names', () => {
    expect(css).not.toMatch(/--color-brand:/)
    expect(css).toContain('--t-brand:')
  })

  it('emits every colour token', () => {
    for (const name of Object.keys(theme.colors.light)) {
      expect(css).toContain(`--t-${name}:`)
    }
  })

  it('emits the font and radius tokens', () => {
    expect(css).toContain('--t-font-sans:')
    expect(css).toContain('--t-font-mono:')
    for (const name of Object.keys(theme.radius)) {
      expect(css).toContain(`--t-radius-${name}:`)
    }
  })
})
