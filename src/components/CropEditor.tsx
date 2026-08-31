'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CropTransform } from '@/lib/pipeline/operations/crop'
import type { RotateTransform } from '@/lib/pipeline/operations/rotate'
import {
  ASPECT_RATIOS,
  clampRect,
  defaultCropRect,
  type Frame,
  fitAspect,
  orientedFrame,
  type Rect,
} from '@/lib/ui/cropGeometry'

type CropEditorProps = {
  /** The file previewed. Crop is defined against this one and clamped for the rest. */
  file: File
  /** Current rotation, because the crop box is drawn against the rotated image. */
  rotation: RotateTransform
  rotationEnabled: boolean
  crop: CropTransform
  onChange: (crop: CropTransform) => void
  /** Reports the un-rotated source dimensions, which the rotation remap needs. */
  onSourceLoad: (frame: Frame) => void
}

type DragState =
  | { kind: 'move'; startX: number; startY: number; origin: Rect }
  | { kind: 'resize'; corner: Corner; startX: number; startY: number; origin: Rect }

type Corner = 'nw' | 'ne' | 'sw' | 'se'

/** Tallest the preview may get. Width comes from the container, which varies. */
const MAX_PREVIEW_HEIGHT = 320
const MIN_SIZE = 8

export function CropEditor({
  file,
  rotation,
  rotationEnabled,
  crop,
  onChange,
  onSourceLoad,
}: CropEditorProps) {
  const [source, setSource] = useState<Frame>()
  const [url, setUrl] = useState<string>()
  const [ratio, setRatio] = useState<number>()
  const [drag, setDrag] = useState<DragState>()
  const [available, setAvailable] = useState(0)

  /**
   * A callback ref rather than useRef, because the element only mounts once the
   * object URL exists. With a plain ref the observer effect runs while the ref is
   * still null and never retries, which silently collapses the preview to nothing.
   * This fires exactly when the node appears.
   */
  const [container, setContainer] = useState<HTMLDivElement | null>(null)

  // The panel is narrower than the page on desktop and full-width on mobile, so the
  // preview width has to be measured rather than assumed.
  useEffect(() => {
    if (!container) return

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailable(entry.contentRect.width)
    })
    observer.observe(container)
    setAvailable(container.clientWidth)
    return () => observer.disconnect()
  }, [container])

  // Object URLs leak until revoked, and a batch can churn through many.
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  const effectiveRotation = rotationEnabled
    ? rotation
    : { kind: 'rotate' as const, degrees: 0 as const, flipHorizontal: false, flipVertical: false }

  const frame = useMemo(
    () =>
      source ? orientedFrame(source.width, source.height, effectiveRotation.degrees) : undefined,
    [source, effectiveRotation.degrees],
  )

  // Seed a sensible box once the image dimensions are known, rather than leaving the
  // zero-size default from cropOperation.defaults().
  useEffect(() => {
    if (frame && crop.width === 0) {
      const seeded = defaultCropRect(frame)
      onChange({ kind: 'crop', ...seeded })
    }
  }, [frame, crop.width, onChange])

  const scale = frame
    ? Math.min(
        (available > 0 ? available : MAX_PREVIEW_HEIGHT) / frame.width,
        MAX_PREVIEW_HEIGHT / frame.height,
        1,
      )
    : 0
  const displayWidth = frame ? Math.round(frame.width * scale) : 0
  const displayHeight = frame ? Math.round(frame.height * scale) : 0

  const commit = useCallback(
    (next: Rect) => {
      if (!frame) return
      const bounded = clampRect(ratio ? fitAspect(next, ratio, frame) : next, frame)
      onChange({ kind: 'crop', ...bounded })
    },
    [frame, ratio, onChange],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!drag || !frame) return

      const dx = (event.clientX - drag.startX) / scale
      const dy = (event.clientY - drag.startY) / scale

      if (drag.kind === 'move') {
        commit({ ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy })
        return
      }

      const { corner, origin } = drag
      const left = corner === 'nw' || corner === 'sw'
      const top = corner === 'nw' || corner === 'ne'

      const x = left ? origin.x + dx : origin.x
      const y = top ? origin.y + dy : origin.y
      const width = left ? origin.width - dx : origin.width + dx
      const height = top ? origin.height - dy : origin.height + dy

      // Below the minimum the handles overlap and the box becomes ungrabbable.
      if (width < MIN_SIZE || height < MIN_SIZE) return
      commit({ x, y, width, height })
    },
    [drag, frame, scale, commit],
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
      commit({ ...crop, x: crop.x + move[0], y: crop.y + move[1] })
    },
    [crop, commit],
  )

  if (!url) return null

  const imageWidth = source ? Math.round(source.width * scale) : 0
  const imageHeight = source ? Math.round(source.height * scale) : 0

  return (
    <div ref={setContainer} className="flex w-full flex-col gap-3">
      <div
        className="relative mx-auto max-w-full overflow-hidden rounded-[--radius-sm] bg-bg-sunken"
        style={{ width: displayWidth || undefined, height: displayHeight || undefined }}
      >
        {/* biome-ignore lint/performance/noImgElement: a local object URL, not a remote asset next/image could optimise */}
        <img
          src={url}
          alt=""
          onLoad={(event) => {
            const frame = {
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            }
            setSource(frame)
            onSourceLoad(frame)
          }}
          className="absolute left-1/2 top-1/2 max-w-none select-none"
          style={{
            width: imageWidth || undefined,
            height: imageHeight || undefined,
            // Mirrors what the pipeline will do, so the box is drawn against the
            // image the user will actually get. See ADR-0006.
            transform: `translate(-50%, -50%) rotate(${effectiveRotation.degrees}deg) scale(${
              effectiveRotation.flipHorizontal ? -1 : 1
            }, ${effectiveRotation.flipVertical ? -1 : 1})`,
          }}
          draggable={false}
        />

        {frame && crop.width > 0 ? (
          <>
            <div className="pointer-events-none absolute inset-0 bg-black/50" />
            <div
              role="slider"
              tabIndex={0}
              aria-label="Crop area. Use arrow keys to move, shift for larger steps."
              aria-valuenow={crop.width}
              aria-valuemin={MIN_SIZE}
              aria-valuemax={frame.width}
              onKeyDown={nudge}
              onPointerDown={(event) => {
                event.preventDefault()
                setDrag({
                  kind: 'move',
                  startX: event.clientX,
                  startY: event.clientY,
                  origin: crop,
                })
              }}
              className="absolute cursor-move outline-2 outline-brand outline-offset-0 focus-visible:outline-4"
              style={{
                left: crop.x * scale,
                top: crop.y * scale,
                width: crop.width * scale,
                height: crop.height * scale,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0)',
                background: 'transparent',
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
                      origin: crop,
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
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1">
        {ASPECT_RATIOS.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => {
              setRatio(option.value)
              if (option.value && frame) {
                onChange({ kind: 'crop', ...fitAspect(crop, option.value, frame) })
              }
            }}
            className={`rounded-[--radius-sm] border px-2 py-1 text-xs ${
              ratio === option.value
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border text-fg-secondary hover:bg-bg-sunken'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="text-center text-fg-muted text-xs">
        {crop.width} × {crop.height} px at {crop.x}, {crop.y}
      </p>
    </div>
  )
}
