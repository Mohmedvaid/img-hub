import { describe, expect, it } from 'vitest'
import {
  flipHorizontal,
  flipVertical,
  fromTransform,
  isUpright,
  type Orientation,
  rotateLeft,
  rotateRight,
  toCssTransform,
  toTransform,
  UPRIGHT,
} from './orientation'

/**
 * The algebra is checked against a model of what the screen shows.
 *
 * A grid names which corner of the *source* is currently in each corner of the
 * *display*, so two independent descriptions can be compared:
 *
 *   - `click`  — what the user asked for: turn or mirror the image on screen.
 *   - `render` — what the engine will do with the stored orientation: mirror the
 *     source first, then rotate, exactly as the canvas transform stack applies it.
 *
 * The functions under test are the only link between the two. An earlier version of
 * this file derived both sides from the composed orientation, which made it a
 * tautology that passed while rotate-then-flip was returning flip-then-rotate's
 * image. scripts/smoke.mjs asserts the same mapping against real pixels in Chromium.
 */
type Grid = readonly [string, string, string, string]

const SOURCE: Grid = ['TL', 'TR', 'BL', 'BR']

/** A quarter turn clockwise: what was bottom-left is now top-left. */
const turnRight = (g: Grid): Grid => [g[2], g[0], g[3], g[1]]
const turnLeft = (g: Grid): Grid => [g[1], g[3], g[0], g[2]]
const mirrorX = (g: Grid): Grid => [g[1], g[0], g[3], g[2]]
const mirrorY = (g: Grid): Grid => [g[2], g[3], g[0], g[1]]

/** What the user sees after one click on the currently displayed image. */
const click: Record<string, (g: Grid) => Grid> = {
  rotateRight: turnRight,
  rotateLeft: turnLeft,
  flipHorizontal: mirrorX,
  flipVertical: mirrorY,
}

/** What the engine renders for a stored orientation: mirror the source, then turn. */
function render(orientation: Orientation): Grid {
  let grid = orientation.mirrored ? mirrorX(SOURCE) : SOURCE
  for (let turn = 0; turn < orientation.rotation / 90; turn++) grid = turnRight(grid)
  return grid
}

const apply = (start: Orientation, steps: Array<(o: Orientation) => Orientation>) =>
  steps.reduce((current, step) => step(current), start)

describe('single operations', () => {
  it('rotates right by a quarter turn', () => {
    expect(rotateRight(UPRIGHT).rotation).toBe(90)
  })

  it('rotates left, wrapping below zero', () => {
    expect(rotateLeft(UPRIGHT).rotation).toBe(270)
  })

  it('returns to upright after four right turns', () => {
    expect(apply(UPRIGHT, [rotateRight, rotateRight, rotateRight, rotateRight])).toEqual(UPRIGHT)
  })

  it('returns to upright after four left turns', () => {
    expect(apply(UPRIGHT, [rotateLeft, rotateLeft, rotateLeft, rotateLeft])).toEqual(UPRIGHT)
  })

  it('cancels a right turn with a left turn', () => {
    expect(apply(UPRIGHT, [rotateRight, rotateLeft])).toEqual(UPRIGHT)
  })

  it('treats a horizontal flip as its own inverse', () => {
    expect(apply(UPRIGHT, [flipHorizontal, flipHorizontal])).toEqual(UPRIGHT)
  })

  it('treats a vertical flip as its own inverse', () => {
    expect(apply(UPRIGHT, [flipVertical, flipVertical])).toEqual(UPRIGHT)
  })

  it('makes a vertical flip equal a horizontal flip plus a half turn', () => {
    expect(flipVertical(UPRIGHT)).toEqual(
      apply(UPRIGHT, [flipHorizontal, rotateRight, rotateRight]),
    )
  })

  it('leaves the mirror flag alone when rotating', () => {
    expect(rotateRight(flipHorizontal(UPRIGHT))).toMatchObject({ rotation: 90, mirrored: true })
  })

  it('negates the stored rotation when mirroring', () => {
    expect(flipHorizontal(rotateRight(UPRIGHT))).toEqual({ rotation: 270, mirrored: true })
  })
})

describe('the composition order that motivates this module', () => {
  it('gives a different result for mirror-then-rotate than rotate-then-mirror', () => {
    const mirrorFirst = apply(UPRIGHT, [flipHorizontal, rotateRight])
    const rotateFirst = apply(UPRIGHT, [rotateRight, flipHorizontal])

    // They genuinely differ — which is the whole reason click order has to be composed
    // rather than stored as whatever was clicked last.
    expect(mirrorFirst).not.toEqual(rotateFirst)
    expect(render(mirrorFirst)).not.toEqual(render(rotateFirst))
  })

  it('flips the axis the user is looking at, not the one the file was stored in', () => {
    // Regression: mirroring a quarter-turned image used to leave the rotation alone,
    // which mirrors the source's x-axis — on screen that reads as a vertical flip.
    const turned = rotateRight(UPRIGHT)

    expect(render(flipHorizontal(turned))).toEqual(mirrorX(render(turned)))
    expect(render(flipVertical(turned))).toEqual(mirrorY(render(turned)))
  })

  it('turns the image on screen clockwise even when it is mirrored', () => {
    const mirrored = flipHorizontal(UPRIGHT)

    expect(render(rotateRight(mirrored))).toEqual(turnRight(render(mirrored)))
  })
})

describe('the algebra agrees with what the screen shows', () => {
  const steps = { rotateRight, rotateLeft, flipHorizontal, flipVertical }
  const names = Object.keys(steps) as Array<keyof typeof steps>

  it('matches the display for every single click', () => {
    for (const name of names) {
      expect(render(steps[name](UPRIGHT))).toEqual(click[name]?.(SOURCE))
    }
  })

  it('matches the display for every sequence of four clicks', () => {
    for (const a of names) {
      for (const b of names) {
        for (const c of names) {
          for (const d of names) {
            const sequence = [a, b, c, d]

            // Two independent walks: one through the orientation algebra, one through
            // the grid the user is looking at.
            const composed = apply(
              UPRIGHT,
              sequence.map((name) => steps[name]),
            )
            const displayed = sequence.reduce((grid, name) => click[name]?.(grid) as Grid, SOURCE)

            expect({ sequence, grid: render(composed) }).toEqual({ sequence, grid: displayed })
          }
        }
      }
    }
  })

  it('only ever produces one of the eight real orientations', () => {
    const seen = new Set<string>()
    const queue: Orientation[] = [UPRIGHT]

    while (queue.length > 0) {
      const current = queue.pop() as Orientation
      const key = `${current.rotation}:${current.mirrored}`
      if (seen.has(key)) continue
      seen.add(key)
      for (const name of names) queue.push(steps[name](current))
    }

    expect(seen.size).toBe(8)
  })

  it('reaches all eight, so no orientation is unreachable by clicking', () => {
    const grids = new Set<string>()
    const queue: Orientation[] = [UPRIGHT]
    const seen = new Set<string>()

    while (queue.length > 0) {
      const current = queue.pop() as Orientation
      const key = `${current.rotation}:${current.mirrored}`
      if (seen.has(key)) continue
      seen.add(key)
      grids.add(render(current).join(''))
      for (const name of names) queue.push(steps[name](current))
    }

    // Eight orientations that all look different: none is a duplicate of another.
    expect(grids.size).toBe(8)
  })

  it('keeps every rotation a legal quarter turn', () => {
    let current = UPRIGHT
    for (let index = 0; index < 40; index++) {
      current = steps[names[index % names.length] as keyof typeof steps](current)
      expect([0, 90, 180, 270]).toContain(current.rotation)
    }
  })
})

describe('round-tripping through the stored transform', () => {
  it('survives a round trip for all eight orientations', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const mirrored of [false, true]) {
        const orientation = { rotation, mirrored }
        expect(fromTransform(toTransform(orientation))).toEqual(orientation)
      }
    }
  })

  it('collapses both flip flags into a half turn', () => {
    // flipH and flipV together are a 180 rotation with no mirroring left over.
    expect(
      fromTransform({ kind: 'rotate', degrees: 0, flipHorizontal: true, flipVertical: true }),
    ).toEqual({ rotation: 180, mirrored: false })
  })

  it('reads a vertical-only flip as mirrored plus a half turn', () => {
    expect(
      fromTransform({ kind: 'rotate', degrees: 0, flipHorizontal: false, flipVertical: true }),
    ).toEqual({ rotation: 180, mirrored: true })
  })

  it('never writes a vertical flip, since canonical form has no use for one', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const mirrored of [false, true]) {
        expect(toTransform({ rotation, mirrored }).flipVertical).toBe(false)
      }
    }
  })

  it('preserves the geometry of a legacy two-flag transform', () => {
    const legacy = {
      kind: 'rotate',
      degrees: 90,
      flipHorizontal: true,
      flipVertical: true,
    } as const
    const canonical = fromTransform(legacy)

    // Reading and rewriting must not move the image.
    expect(fromTransform(toTransform(canonical))).toEqual(canonical)
  })
})

describe('helpers', () => {
  it('reports upright only when nothing is applied', () => {
    expect(isUpright(UPRIGHT)).toBe(true)
    expect(isUpright(rotateRight(UPRIGHT))).toBe(false)
    expect(isUpright(flipHorizontal(UPRIGHT))).toBe(false)
  })

  it('produces a CSS transform matching the stored orientation', () => {
    expect(toCssTransform({ rotation: 90, mirrored: false })).toBe('rotate(90deg) scale(1, 1)')
    expect(toCssTransform({ rotation: 270, mirrored: true })).toBe('rotate(270deg) scale(-1, 1)')
  })
})
