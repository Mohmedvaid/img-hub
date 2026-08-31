'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CropTransform } from '@/lib/pipeline/operations/crop'
import {
  clampRect,
  defaultCropRect,
  type Frame,
  fitAspect,
  orientedFrame,
  type Rect,
} from '@/lib/ui/cropGeometry'
import { type Orientation, toCssTransform } from '@/lib/ui/orientation'
import { CropOverlay } from './CropOverlay'

type ImagePreviewProps = {
  file: File
  orientation: Orientation
  /** When set, a draggable crop selection is shown over the image. */
  crop?: { value: CropTransform; onChange: (crop: CropTransform) => void; ratio?: number }
  onSourceLoad?: (frame: Frame) => void
  /** Shown under the image, e.g. "first of 12". */
  caption?: string
}

const MAX_HEIGHT = 460

/**
 * The always-visible preview.
 *
 * Shows geometry — orientation and crop — and deliberately not compression or format.
 * Previewing those would mean encoding on every keystroke, and every tool in this
 * category makes the same trade. Saying so plainly beats letting someone believe the
 * preview is telling them about quality.
 */
export function ImagePreview({
  file,
  orientation,
  crop,
  onSourceLoad,
  caption,
}: ImagePreviewProps) {
  const [url, setUrl] = useState<string>()
  const [source, setSource] = useState<Frame>()
  const [available, setAvailable] = useState(0)

  // A callback ref rather than useRef: the element only mounts once the object URL
  // exists, and an effect keyed on a plain ref would run while it is still null.
  const [container, setContainer] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    // Dimensions belong to the old file; clearing avoids a frame of wrong geometry.
    setSource(undefined)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  useEffect(() => {
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailable(entry.contentRect.width)
    })
    observer.observe(container)
    setAvailable(container.clientWidth)
    return () => observer.disconnect()
  }, [container])

  const frame = useMemo(
    () => (source ? orientedFrame(source.width, source.height, orientation.rotation) : undefined),
    [source, orientation.rotation],
  )

  const scale = frame
    ? Math.min((available > 0 ? available : MAX_HEIGHT) / frame.width, MAX_HEIGHT / frame.height, 1)
    : 0

  const handleLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const loaded = {
        width: event.currentTarget.naturalWidth,
        height: event.currentTarget.naturalHeight,
      }
      setSource(loaded)
      onSourceLoad?.(loaded)
    },
    [onSourceLoad],
  )

  // Seed a usable crop box once dimensions are known, rather than the zero-size
  // default the operation starts with.
  useEffect(() => {
    if (frame && crop && crop.value.width === 0) {
      crop.onChange({ kind: 'crop', ...defaultCropRect(frame) })
    }
  }, [frame, crop])

  const commitCrop = useCallback(
    (next: Rect) => {
      if (!frame || !crop) return
      const bounded = clampRect(crop.ratio ? fitAspect(next, crop.ratio, frame) : next, frame)
      crop.onChange({ kind: 'crop', ...bounded })
    },
    [frame, crop],
  )

  if (!url) return null

  const displayWidth = frame ? Math.round(frame.width * scale) : 0
  const displayHeight = frame ? Math.round(frame.height * scale) : 0

  return (
    <div ref={setContainer} className="flex w-full flex-col items-center gap-2">
      <div
        className="relative max-w-full overflow-hidden rounded-[--radius-md] bg-bg-sunken"
        style={{ width: displayWidth || undefined, height: displayHeight || undefined }}
      >
        {/* biome-ignore lint/performance/noImgElement: a local object URL, not a remote asset next/image could optimise */}
        <img
          src={url}
          alt=""
          onLoad={handleLoad}
          draggable={false}
          className="absolute left-1/2 top-1/2 max-w-none select-none"
          style={{
            width: source ? Math.round(source.width * scale) : undefined,
            height: source ? Math.round(source.height * scale) : undefined,
            // Matches exactly what the engine will do, so the preview is not a guess.
            transform: `translate(-50%, -50%) ${toCssTransform(orientation)}`,
          }}
        />

        {frame && crop && crop.value.width > 0 ? (
          <CropOverlay frame={frame} rect={crop.value} scale={scale} onChange={commitCrop} />
        ) : null}
      </div>

      {caption ? <p className="text-fg-muted text-xs">{caption}</p> : null}
    </div>
  )
}
