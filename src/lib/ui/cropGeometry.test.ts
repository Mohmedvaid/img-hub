import { describe, expect, it } from 'vitest'
import type { RotateTransform } from '@/lib/pipeline/operations/rotate'
import {
  ASPECT_RATIOS,
  clampRect,
  defaultCropRect,
  fitAspect,
  flipRect,
  orientedFrame,
  type Rect,
  remapCrop,
  rotateRect,
} from './cropGeometry'

const rotation = (over: Partial<RotateTransform> = {}): RotateTransform => ({
  kind: 'rotate',
  degrees: 0,
  flipHorizontal: false,
  flipVertical: false,
  ...over,
})

const LANDSCAPE = { width: 100, height: 50 }

describe('orientedFrame', () => {
  it('swaps the axes on a quarter turn', () => {
    expect(orientedFrame(100, 50, 90)).toEqual({ width: 50, height: 100 })
    expect(orientedFrame(100, 50, 270)).toEqual({ width: 50, height: 100 })
  })

  it('leaves them alone on a half turn', () => {
    expect(orientedFrame(100, 50, 180)).toEqual({ width: 100, height: 50 })
    expect(orientedFrame(100, 50, 0)).toEqual({ width: 100, height: 50 })
  })
})

describe('rotateRect', () => {
  it('sends the top-left corner to the top-right on a 90 turn', () => {
    const topLeft: Rect = { x: 0, y: 0, width: 10, height: 5 }

    // Frame becomes 50 wide, so a box flush to the right edge starts at 50 - 5.
    expect(rotateRect(topLeft, LANDSCAPE, 90)).toEqual({ x: 45, y: 0, width: 5, height: 10 })
  })

  it('sends the top-left corner to the bottom-left on a 270 turn', () => {
    const topLeft: Rect = { x: 0, y: 0, width: 10, height: 5 }

    expect(rotateRect(topLeft, LANDSCAPE, 270)).toEqual({ x: 0, y: 90, width: 5, height: 10 })
  })

  it('sends the top-left corner to the bottom-right on a half turn', () => {
    const topLeft: Rect = { x: 0, y: 0, width: 10, height: 5 }

    expect(rotateRect(topLeft, LANDSCAPE, 180)).toEqual({ x: 90, y: 45, width: 10, height: 5 })
  })

  it('returns four 90 turns to exactly where it started', () => {
    const start: Rect = { x: 12, y: 7, width: 30, height: 20 }

    let rect = start
    let frame = LANDSCAPE
    for (let turn = 0; turn < 4; turn++) {
      rect = rotateRect(rect, frame, 90)
      frame = orientedFrame(frame.width, frame.height, 90)
    }

    expect(rect).toEqual(start)
    expect(frame).toEqual(LANDSCAPE)
  })

  it('never moves a rectangle outside its new frame', () => {
    const rect: Rect = { x: 90, y: 45, width: 10, height: 5 }

    for (const degrees of [90, 180, 270]) {
      const turned = rotateRect(rect, LANDSCAPE, degrees)
      const frame = orientedFrame(LANDSCAPE.width, LANDSCAPE.height, degrees)

      expect(turned.x).toBeGreaterThanOrEqual(0)
      expect(turned.y).toBeGreaterThanOrEqual(0)
      expect(turned.x + turned.width).toBeLessThanOrEqual(frame.width)
      expect(turned.y + turned.height).toBeLessThanOrEqual(frame.height)
    }
  })
})

describe('flipRect', () => {
  it('mirrors horizontally', () => {
    expect(flipRect({ x: 0, y: 10, width: 20, height: 5 }, LANDSCAPE, true, false)).toEqual({
      x: 80,
      y: 10,
      width: 20,
      height: 5,
    })
  })

  it('mirrors vertically', () => {
    expect(flipRect({ x: 10, y: 0, width: 20, height: 5 }, LANDSCAPE, false, true)).toEqual({
      x: 10,
      y: 45,
      width: 20,
      height: 5,
    })
  })

  it('is its own inverse', () => {
    const rect: Rect = { x: 13, y: 6, width: 21, height: 9 }
    const there = flipRect(rect, LANDSCAPE, true, true)

    expect(flipRect(there, LANDSCAPE, true, true)).toEqual(rect)
  })
})

describe('remapCrop keeps the same region selected', () => {
  const rect: Rect = { x: 10, y: 5, width: 40, height: 20 }

  it('is a no-op when the orientation has not changed', () => {
    expect(remapCrop(rect, LANDSCAPE, rotation(), rotation())).toEqual(rect)
  })

  it('moves the box when rotation changes', () => {
    const moved = remapCrop(rect, LANDSCAPE, rotation(), rotation({ degrees: 90 }))

    expect(moved).not.toEqual(rect)
    // A quarter turn swaps the box's own axes too.
    expect(moved.width).toBe(rect.height)
    expect(moved.height).toBe(rect.width)
  })

  it('returns to the original after a full circle of quarter turns', () => {
    const circle = [
      [0, 90],
      [90, 180],
      [180, 270],
      [270, 0],
    ] as const

    let current = rect
    for (const [from, to] of circle) {
      current = remapCrop(
        current,
        LANDSCAPE,
        rotation({ degrees: from }),
        rotation({ degrees: to }),
      )
    }

    expect(current).toEqual(rect)
  })

  it('round-trips through every orientation pair', () => {
    for (const a of [0, 90, 180, 270] as const) {
      for (const b of [0, 90, 180, 270] as const) {
        const there = remapCrop(rect, LANDSCAPE, rotation({ degrees: a }), rotation({ degrees: b }))
        const back = remapCrop(there, LANDSCAPE, rotation({ degrees: b }), rotation({ degrees: a }))

        expect(back).toEqual(rect)
      }
    }
  })

  it('round-trips with flips applied', () => {
    const from = rotation({ degrees: 90, flipHorizontal: true })
    const to = rotation({ degrees: 270, flipVertical: true })

    const there = remapCrop(rect, LANDSCAPE, from, to)
    expect(remapCrop(there, LANDSCAPE, to, from)).toEqual(rect)
  })

  it('keeps the box inside the oriented frame for every combination', () => {
    for (const degrees of [0, 90, 180, 270] as const) {
      for (const flipHorizontal of [false, true]) {
        const to = rotation({ degrees, flipHorizontal })
        const moved = remapCrop(rect, LANDSCAPE, rotation(), to)
        const frame = orientedFrame(LANDSCAPE.width, LANDSCAPE.height, degrees)

        expect(moved.x).toBeGreaterThanOrEqual(0)
        expect(moved.y).toBeGreaterThanOrEqual(0)
        expect(moved.x + moved.width).toBeLessThanOrEqual(frame.width)
        expect(moved.y + moved.height).toBeLessThanOrEqual(frame.height)
      }
    }
  })
})

describe('clampRect', () => {
  it('pulls a rectangle back inside the frame', () => {
    expect(clampRect({ x: 95, y: 48, width: 20, height: 10 }, LANDSCAPE)).toEqual({
      x: 80,
      y: 40,
      width: 20,
      height: 10,
    })
  })

  it('shrinks a rectangle larger than the frame', () => {
    expect(clampRect({ x: 0, y: 0, width: 500, height: 500 }, LANDSCAPE)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    })
  })

  it('never produces a zero dimension', () => {
    const clamped = clampRect({ x: 0, y: 0, width: 0, height: 0 }, LANDSCAPE)

    expect(clamped.width).toBeGreaterThanOrEqual(1)
    expect(clamped.height).toBeGreaterThanOrEqual(1)
  })

  it('always returns integers', () => {
    const clamped = clampRect({ x: 1.7, y: 2.2, width: 10.9, height: 4.4 }, LANDSCAPE)

    for (const value of Object.values(clamped)) {
      expect(Number.isInteger(value)).toBe(true)
    }
  })
})

describe('fitAspect', () => {
  it('produces the requested ratio', () => {
    const square = fitAspect({ x: 10, y: 5, width: 60, height: 40 }, 1, LANDSCAPE)

    expect(square.width).toBe(square.height)
  })

  it('keeps the centre where it was', () => {
    const before = { x: 20, y: 10, width: 40, height: 30 }
    const after = fitAspect(before, 1, LANDSCAPE)

    expect(after.x + after.width / 2).toBeCloseTo(before.x + before.width / 2, 0)
    expect(after.y + after.height / 2).toBeCloseTo(before.y + before.height / 2, 0)
  })

  it('shrinks rather than growing past the frame', () => {
    const wide = fitAspect({ x: 0, y: 0, width: 100, height: 50 }, 16 / 9, LANDSCAPE)

    expect(wide.width).toBeLessThanOrEqual(LANDSCAPE.width)
    expect(wide.height).toBeLessThanOrEqual(LANDSCAPE.height)
  })

  it('stays inside the frame for every offered ratio', () => {
    for (const { value } of ASPECT_RATIOS) {
      if (value === undefined) continue
      const fitted = fitAspect({ x: 30, y: 20, width: 50, height: 25 }, value, LANDSCAPE)

      expect(fitted.x).toBeGreaterThanOrEqual(0)
      expect(fitted.y).toBeGreaterThanOrEqual(0)
      expect(fitted.x + fitted.width).toBeLessThanOrEqual(LANDSCAPE.width)
      expect(fitted.y + fitted.height).toBeLessThanOrEqual(LANDSCAPE.height)
    }
  })
})

describe('defaultCropRect', () => {
  it('is centred', () => {
    const rect = defaultCropRect(LANDSCAPE)

    expect(rect.x).toBe(Math.round((LANDSCAPE.width - rect.width) / 2))
    expect(rect.y).toBe(Math.round((LANDSCAPE.height - rect.height) / 2))
  })

  it('leaves a visible margin, so the handles are grabbable', () => {
    const rect = defaultCropRect(LANDSCAPE)

    expect(rect.width).toBeLessThan(LANDSCAPE.width)
    expect(rect.height).toBeLessThan(LANDSCAPE.height)
  })

  it('still produces a usable box on a tiny image', () => {
    const rect = defaultCropRect({ width: 2, height: 2 })

    expect(rect.width).toBeGreaterThanOrEqual(1)
    expect(rect.height).toBeGreaterThanOrEqual(1)
  })
})
