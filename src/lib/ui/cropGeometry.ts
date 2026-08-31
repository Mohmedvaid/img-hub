/**
 * Crop rectangle maths.
 *
 * Pure functions, no DOM, because getting orientation remapping right matters more
 * than any of the drag handling around it and this is where it can actually be
 * asserted.
 *
 * The contract that drives all of it: crop coordinates live in **post-rotation**
 * space (ADR-0006). Crop runs after rotate, so a box the user drew on a rotated
 * preview lands where they drew it. The cost is that changing rotation has to move
 * the stored rectangle, which is what `remapCrop` does.
 */

import type { RotateTransform } from '@/lib/pipeline/operations/rotate'

export type Rect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type Frame = { readonly width: number; readonly height: number }

/** The frame dimensions after a rotation. A quarter turn swaps the axes. */
export function orientedFrame(width: number, height: number, degrees: number): Frame {
  return degrees === 90 || degrees === 270 ? { width: height, height: width } : { width, height }
}

/**
 * Rotates a rectangle with its frame, clockwise.
 *
 * Derived from where a point lands: a 90° clockwise turn of a W×H image sends
 * (x, y) to (H − y, x) in the resulting H×W image. Applying that to both corners and
 * re-normalising gives the expressions below.
 */
export function rotateRect(rect: Rect, frame: Frame, degrees: number): Rect {
  const { x, y, width, height } = rect

  switch (degrees) {
    case 90:
      return { x: frame.height - (y + height), y: x, width: height, height: width }
    case 180:
      return {
        x: frame.width - (x + width),
        y: frame.height - (y + height),
        width,
        height,
      }
    case 270:
      return { x: y, y: frame.width - (x + width), width: height, height: width }
    default:
      return rect
  }
}

/** Mirrors a rectangle within its frame. Its own inverse, so it runs in both directions. */
export function flipRect(rect: Rect, frame: Frame, horizontal: boolean, vertical: boolean): Rect {
  return {
    x: horizontal ? frame.width - (rect.x + rect.width) : rect.x,
    y: vertical ? frame.height - (rect.y + rect.height) : rect.y,
    width: rect.width,
    height: rect.height,
  }
}

/** Source-space rectangle to the space the user sees after `rotation` is applied. */
export function applyOrientation(rect: Rect, source: Frame, rotation: RotateTransform): Rect {
  const rotated = rotateRect(rect, source, rotation.degrees)
  const frame = orientedFrame(source.width, source.height, rotation.degrees)
  return flipRect(rotated, frame, rotation.flipHorizontal, rotation.flipVertical)
}

/**
 * The inverse of `applyOrientation`.
 *
 * The pipeline rotates and then flips, so undoing it means un-flipping first and
 * rotating back second.
 */
export function undoOrientation(rect: Rect, source: Frame, rotation: RotateTransform): Rect {
  const frame = orientedFrame(source.width, source.height, rotation.degrees)
  const unflipped = flipRect(rect, frame, rotation.flipHorizontal, rotation.flipVertical)
  return rotateRect(unflipped, frame, (360 - rotation.degrees) % 360)
}

/**
 * Moves a crop rectangle from one orientation to another — P1-10.
 *
 * Called when the user changes rotation after drawing a box. Routing through source
 * space means any pair of orientations composes without a special case per
 * combination.
 */
export function remapCrop(
  rect: Rect,
  source: Frame,
  from: RotateTransform,
  to: RotateTransform,
): Rect {
  return applyOrientation(undoOrientation(rect, source, from), source, to)
}

/** Keeps a rectangle inside its frame, preserving size where it can. */
export function clampRect(rect: Rect, frame: Frame): Rect {
  const width = Math.min(Math.max(1, Math.round(rect.width)), frame.width)
  const height = Math.min(Math.max(1, Math.round(rect.height)), frame.height)

  return {
    width,
    height,
    x: Math.min(Math.max(0, Math.round(rect.x)), frame.width - width),
    y: Math.min(Math.max(0, Math.round(rect.y)), frame.height - height),
  }
}

export type AspectRatio = { readonly label: string; readonly value: number | undefined }

/** Free plus the ratios people actually ask for by name. */
export const ASPECT_RATIOS: readonly AspectRatio[] = [
  { label: 'Free', value: undefined },
  { label: 'Square', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
]

/**
 * Reshapes a rectangle to a ratio, keeping its centre and staying inside the frame.
 *
 * Shrinks rather than grows: expanding to hit a ratio can push the box off an edge,
 * and a crop that silently moves is worse than one that gets slightly smaller.
 */
export function fitAspect(rect: Rect, ratio: number, frame: Frame): Rect {
  const centreX = rect.x + rect.width / 2
  const centreY = rect.y + rect.height / 2

  let width = rect.width
  let height = width / ratio

  if (height > rect.height) {
    height = rect.height
    width = height * ratio
  }

  // Still has to fit the frame; a wide ratio on a tall image can overflow.
  if (width > frame.width) {
    width = frame.width
    height = width / ratio
  }
  if (height > frame.height) {
    height = frame.height
    width = height * ratio
  }

  return clampRect({ x: centreX - width / 2, y: centreY - height / 2, width, height }, frame)
}

/** A sensible starting box: the largest centred rectangle covering 80% of the frame. */
export function defaultCropRect(frame: Frame): Rect {
  const width = Math.max(1, Math.round(frame.width * 0.8))
  const height = Math.max(1, Math.round(frame.height * 0.8))
  return clampRect(
    {
      x: Math.round((frame.width - width) / 2),
      y: Math.round((frame.height - height) / 2),
      width,
      height,
    },
    frame,
  )
}
