'use client'

import { limits } from '@config/limits'
import { useCallback, useRef, useState } from 'react'
import { formatInfo } from '@/lib/pipeline/formats'

type DropZoneProps = {
  onFiles: (files: readonly File[]) => void
  disabled: boolean
  count: number
}

/**
 * Deliberately permissive.
 *
 * `accept` filters what the file picker will even offer, so a narrow list hides valid
 * files from the user — a JPEG saved without an extension, or a HEIC the OS reports
 * with an odd type. Since intake identifies files by their actual bytes, the picker
 * should let things through and let that decide. Extensions are listed alongside
 * `image/*` because some systems do not map the newer formats to it.
 */
const ACCEPT = [
  'image/*',
  ...limits.inputFormats.flatMap((format) =>
    formatInfo(format).extensions.map((extension) => `.${extension}`),
  ),
].join(',')

export function DropZone({ onFiles, disabled, count }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // No filtering here any more. What is and is not an image is decided by reading
  // the actual bytes in `intakeFiles`, which also explains every rejection. Filtering
  // on the browser's guessed MIME type dropped valid files silently.
  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return
      onFiles(Array.from(list))
    },
    [onFiles],
  )

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop is a pointer-only enhancement; the accessible path is the focusable "Choose files" button inside this container
    <div
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        if (!disabled) handleFiles(event.dataTransfer.files)
      }}
      className={`rounded-[--radius-lg] border-2 border-dashed p-8 text-center transition-colors ${
        dragging ? 'border-brand bg-brand-subtle' : 'border-border bg-bg-raised'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files)
          // Reset so picking the same file twice still fires a change event.
          event.target.value = ''
        }}
      />

      <p className="font-medium text-fg-primary">
        {count > 0 ? `${count} image${count === 1 ? '' : 's'} ready` : 'Drop images here'}
      </p>

      <p className="mt-1 text-fg-muted text-sm">
        JPEG, PNG, WebP, AVIF, GIF, BMP and more · up to {limits.maxFilesPerBatch} files
      </p>

      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="mt-4 rounded-[--radius-md] bg-brand px-4 py-2 font-medium text-brand-fg text-sm transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        Choose files
      </button>

      <p className="mt-4 text-fg-muted text-xs">
        Everything runs on your device. Nothing is uploaded.
      </p>
    </div>
  )
}
