'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Frame, Rect } from '@/lib/ui/cropGeometry'

type CropOverlayProps = {
  frame: Frame
  rect: Rect
  /** Display pixels per image pixel, so drags convert back to image space. */
  scale: number
  onChange: (rect: Rect) => void
}

type Drag =
  | { kind: 'move'; startX: number; startY: number; origin: Rect }
  | { kind: 'resize'; corner: Corner; startX: number; startY: number; origin: Rect }

type Corner = 'nw' | 'ne' | 'sw' | 'se'

/** Below this the handles overlap and the box becomes impossible to grab. */
const MIN_SIZE = 8

/**
 * The draggable selection drawn over the preview.
 *
 * Split out from the preview because the preview is always on screen while this only
 * appears when crop is enabled, and mixing the two made a component that did two
 * unrelated jobs.
 */
export function CropOverlay({ frame, rect, scale, onChange }: CropOverlayProps) {
  const [drag, setDrag] = useState<Drag>()

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!drag) return

      const dx = (event.clientX - drag.startX) / scale
      const dy = (event.clientY - drag.startY) / scale

      const next =
        drag.kind === 'move'
          ? { ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy }
          : resized(drag.origin, drag.corner, dx, dy)

      if (next) onChange(next)
    },
    [drag, scale, onChange],
  )

  useEffect(() => {
    if (!drag) return
    const stop = () => setDrag(undefined)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [drag, onPointerMove])

  const nudge = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 10 : 1
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const move = moves[event.key]
      if (!move) return

      event.preventDefault()
      onChange({ ...rect, x: rect.x + move[0], y: rect.y + move[1] })
    },
    [rect, onChange],
  )

  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-black/50" />
      <div
        role="application"
        aria-label={`Crop area, ${rect.width} by ${rect.height} pixels. Arrow keys move it, shift for larger steps.`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a crop box is a custom widget with no matching ARIA role; role="application" hands arrow keys to it, which only works if it can hold focus
        tabIndex={0}
        onKeyDown={nudge}
        onPointerDown={(event) => {
          event.preventDefault()
          setDrag({ kind: 'move', startX: event.clientX, startY: event.clientY, origin: rect })
        }}
        data-testid="crop-selection"
        className="absolute cursor-move outline-2 outline-brand focus-visible:outline-4"
        style={{
          left: rect.x * scale,
          top: rect.y * scale,
          width: rect.width * scale,
          height: rect.height * scale,
          backdropFilter: 'brightness(1.9)',
        }}
      >
        {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
          <button
            key={corner}
            type="button"
            aria-label={`Resize from ${corner}`}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setDrag({
                kind: 'resize',
                corner,
                startX: event.clientX,
                startY: event.clientY,
                origin: rect,
              })
            }}
            className="absolute size-3 rounded-full border-2 border-brand bg-bg-base"
            style={{
              left: corner.includes('w') ? -6 : undefined,
              right: corner.includes('e') ? -6 : undefined,
              top: corner.startsWith('n') ? -6 : undefined,
              bottom: corner.startsWith('s') ? -6 : undefined,
              cursor: `${corner}-resize`,
            }}
          />
        ))}
      </div>

      <p className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-0.5 text-white text-xs">
        {rect.width} × {rect.height} of {frame.width} × {frame.height}
      </p>
    </>
  )
}

/**
 * The rectangle a corner drag produces, or undefined when it would shrink the box
 * past the point where its handles can still be grabbed.
 *
 * Which edges move follows from the corner: a west handle moves the left edge, so the
 * origin shifts and the width shrinks by the same amount.
 */
function resized(origin: Rect, corner: Corner, dx: number, dy: number): Rect | undefined {
  const left = corner === 'nw' || corner === 'sw'
  const top = corner === 'nw' || corner === 'ne'

  const width = left ? origin.width - dx : origin.width + dx
  const height = top ? origin.height - dy : origin.height + dy
  if (width < MIN_SIZE || height < MIN_SIZE) return undefined

  return {
    x: left ? origin.x + dx : origin.x,
    y: top ? origin.y + dy : origin.y,
    width,
    height,
  }
}
