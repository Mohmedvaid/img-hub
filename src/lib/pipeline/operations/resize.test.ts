import { describe, expect, it } from 'vitest'
import { type ResizeTransform, resizePlan } from './resize'

function transform(overrides: Partial<ResizeTransform>): ResizeTransform {
  return { kind: 'resize', mode: 'contain', allowUpscale: false, ...overrides }
}

describe('contain', () => {
  it('fits a landscape image inside the box without overflowing', () => {
    const plan = resizePlan(4000, 3000, transform({ width: 1000, height: 1000 }))

    expect(plan.width).toBe(1000)
    expect(plan.height).toBe(750)
  })

  it('fits a portrait image inside the box without overflowing', () => {
    const plan = resizePlan(3000, 4000, transform({ width: 1000, height: 1000 }))

    expect(plan.width).toBe(750)
    expect(plan.height).toBe(1000)
  })

  it('derives the missing dimension from the aspect ratio', () => {
    const plan = resizePlan(4000, 3000, transform({ width: 800 }))

    expect(plan).toMatchObject({ width: 800, height: 600 })
  })

  it('leaves a smaller image untouched when upscaling is off', () => {
    const plan = resizePlan(400, 300, transform({ width: 1920 }))

    expect(plan).toMatchObject({ width: 400, height: 300 })
  })

  it('enlarges when upscaling is explicitly allowed', () => {
    const plan = resizePlan(400, 300, transform({ width: 800, allowUpscale: true }))

    expect(plan).toMatchObject({ width: 800, height: 600 })
  })

  it('uses the whole source, since contain never crops', () => {
    const plan = resizePlan(4000, 3000, transform({ width: 1000, height: 1000 }))

    expect(plan).toMatchObject({ sourceX: 0, sourceY: 0, sourceWidth: 4000, sourceHeight: 3000 })
  })
})

describe('cover', () => {
  it('fills the box exactly', () => {
    const plan = resizePlan(4000, 3000, transform({ mode: 'cover', width: 500, height: 500 }))

    expect(plan).toMatchObject({ width: 500, height: 500 })
  })

  it('centre-crops the sides of a wide source', () => {
    const plan = resizePlan(4000, 2000, transform({ mode: 'cover', width: 500, height: 500 }))

    // A square target from a 2:1 source keeps a 2000x2000 centre square.
    expect(plan.sourceWidth).toBe(2000)
    expect(plan.sourceHeight).toBe(2000)
    expect(plan.sourceX).toBe(1000)
    expect(plan.sourceY).toBe(0)
  })

  it('centre-crops the top and bottom of a tall source', () => {
    const plan = resizePlan(2000, 4000, transform({ mode: 'cover', width: 500, height: 500 }))

    expect(plan.sourceWidth).toBe(2000)
    expect(plan.sourceHeight).toBe(2000)
    expect(plan.sourceX).toBe(0)
    expect(plan.sourceY).toBe(1000)
  })

  it('takes the full frame when the source already matches the target ratio', () => {
    const plan = resizePlan(1000, 1000, transform({ mode: 'cover', width: 500, height: 500 }))

    expect(plan).toMatchObject({ sourceX: 0, sourceY: 0, sourceWidth: 1000, sourceHeight: 1000 })
  })

  it('does not enlarge past the source when upscaling is off', () => {
    const plan = resizePlan(300, 300, transform({ mode: 'cover', width: 1000, height: 1000 }))

    expect(plan.width).toBeLessThanOrEqual(300)
    expect(plan.height).toBeLessThanOrEqual(300)
  })
})

describe('exact', () => {
  it('stretches to the requested dimensions, ignoring the ratio', () => {
    const plan = resizePlan(4000, 3000, transform({ mode: 'exact', width: 200, height: 900 }))

    expect(plan).toMatchObject({ width: 200, height: 900 })
  })

  it('never exceeds the source when upscaling is off', () => {
    const plan = resizePlan(100, 100, transform({ mode: 'exact', width: 500, height: 500 }))

    expect(plan).toMatchObject({ width: 100, height: 100 })
  })
})

describe('degenerate inputs', () => {
  it('never plans a zero or negative dimension', () => {
    const cases: ResizeTransform[] = [
      transform({ width: 1, height: 1 }),
      transform({ mode: 'cover', width: 1, height: 1 }),
      transform({ mode: 'exact', width: 1, height: 1 }),
    ]

    for (const candidate of cases) {
      const plan = resizePlan(4000, 3, candidate)
      expect(plan.width).toBeGreaterThanOrEqual(1)
      expect(plan.height).toBeGreaterThanOrEqual(1)
    }
  })

  it('always plans integer pixel dimensions', () => {
    const plan = resizePlan(1023, 767, transform({ width: 500 }))

    expect(Number.isInteger(plan.width)).toBe(true)
    expect(Number.isInteger(plan.height)).toBe(true)
  })

  it('keeps the crop window inside the source', () => {
    const plan = resizePlan(1920, 1080, transform({ mode: 'cover', width: 400, height: 700 }))

    expect(plan.sourceX + plan.sourceWidth).toBeLessThanOrEqual(1920)
    expect(plan.sourceY + plan.sourceHeight).toBeLessThanOrEqual(1080)
  })
})
