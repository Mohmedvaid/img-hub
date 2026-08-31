/**
 * Composing rotate and flip the way a user expects.
 *
 * The problem this solves: click order changes the result. Mirroring and then
 * rotating right is not the same image as rotating right and then mirroring. But the
 * pipeline applies a fixed order — rotate, then flip (ADR-0006) — so naively storing
 * whatever the user last clicked would hand them something other than what they
 * watched happen on screen.
 *
 * The way out is that rotations and flips form a closed group of exactly **eight**
 * orientations. Any sequence of clicks, however long, reduces to one of them. So each
 * click is composed algebraically and stored in canonical form, and the pipeline never
 * has to change.
 *
 * Every click acts on **what is on screen**, not on the original file. That is the
 * rule the whole module follows, because it is what a user watching the preview
 * means: "rotate right" turns the image they can see. So each click composes on the
 * left of the stored orientation, never the right.
 *
 * Canonical form is `R(θ) ∘ Mirror^m` — mirror the source, then turn it — which is
 * exactly the order the engine's canvas transform and the preview's CSS transform
 * both apply. Composing a new click on the left uses one identity:
 *
 *     Mirror ∘ R(θ)  ==  R(−θ) ∘ Mirror
 *
 * which is why mirroring negates the rotation already stored, while rotating leaves
 * the mirror flag alone. Getting that backwards makes rotate-then-flip and
 * flip-then-rotate produce each other's image — invisible in either operation alone,
 * and wrong the moment they are combined. scripts/smoke.mjs asserts the pixels.
 */

import type { RotateTransform, Rotation } from '@/lib/pipeline/operations/rotate'

/**
 * Canonical orientation: a rotation plus whether the image is mirrored.
 *
 * One mirror flag rather than two, because a horizontal flip and a vertical flip
 * differ only by a half turn — so `flipH && flipV` is not a third state, it is
 * simply `rotate 180`. Sixteen representable combinations, eight real ones.
 */
export type Orientation = {
  readonly rotation: Rotation
  readonly mirrored: boolean
}

export const UPRIGHT: Orientation = { rotation: 0, mirrored: false }

function normalise(degrees: number): Rotation {
  const wrapped = ((degrees % 360) + 360) % 360
  return wrapped as Rotation
}

/**
 * Turns the displayed image a quarter turn clockwise.
 *
 *     R(90) ∘ (R(θ) ∘ Mirror^m)  ==  R(θ+90) ∘ Mirror^m
 *
 * A rotation composes straight onto the rotation already stored; whether the image is
 * mirrored makes no difference, because the mirror sits to the right of both.
 */
export function rotateRight(current: Orientation): Orientation {
  return { ...current, rotation: normalise(current.rotation + 90) }
}

/** Turns the displayed image a quarter turn anticlockwise. */
export function rotateLeft(current: Orientation): Orientation {
  return { ...current, rotation: normalise(current.rotation - 90) }
}

/**
 * Mirrors the displayed image left-to-right.
 *
 *     Mirror ∘ (R(θ) ∘ Mirror^m)  ==  R(−θ) ∘ Mirror^(1−m)
 *
 * The rotation is negated because pushing the new mirror past the stored rotation
 * reverses it. Without that, flipping a turned image mirrors the wrong axis — it
 * looks like a vertical flip.
 */
export function flipHorizontal(current: Orientation): Orientation {
  return { rotation: normalise(-current.rotation), mirrored: !current.mirrored }
}

/**
 * Mirrors the displayed image top-to-bottom, which is a horizontal mirror plus a
 * half turn.
 *
 * Expressing it this way is what keeps the state to eight orientations instead of
 * tracking two independent flip flags that can disagree.
 */
export function flipVertical(current: Orientation): Orientation {
  return { rotation: normalise(180 - current.rotation), mirrored: !current.mirrored }
}

export function isUpright(orientation: Orientation): boolean {
  return orientation.rotation === 0 && !orientation.mirrored
}

/** Reads a stored transform, collapsing the redundant two-flag form into canonical. */
export function fromTransform(transform: RotateTransform): Orientation {
  const { degrees, flipHorizontal: horizontal, flipVertical: vertical } = transform

  // Both flags together are a half turn with no mirroring left over.
  if (horizontal && vertical) return { rotation: normalise(degrees + 180), mirrored: false }
  if (vertical) return { rotation: normalise(degrees + 180), mirrored: true }
  return { rotation: normalise(degrees), mirrored: horizontal }
}

/** Writes canonical orientation back into the shape the pipeline runs. */
export function toTransform(orientation: Orientation): RotateTransform {
  return {
    kind: 'rotate',
    degrees: orientation.rotation,
    flipHorizontal: orientation.mirrored,
    flipVertical: false,
  }
}

/** The CSS transform that previews an orientation, matching what the engine will do. */
export function toCssTransform(orientation: Orientation): string {
  return `rotate(${orientation.rotation}deg) scale(${orientation.mirrored ? -1 : 1}, 1)`
}
