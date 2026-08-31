'use client'

import { limits } from '@config/limits'
import { useCallback, useRef, useState } from 'react'
import { formatInfo } from '@/lib/pipeline/formats'

type DropZoneProps = {
  onFiles: (files: File[]) => void
  disabled: boolean
  count: number
}

const ACCEPT = limits.inputFormats.map((format) => formatInfo(format).mimeType).join(',')

export function DropZone({ onFiles, disabled, count }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list) return
      const files = Array.from(list).filter((file) => file.type.startsWith('image/'))
      if (files.length > 0) onFiles(files)
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
        JPEG, PNG, WebP, AVIF and GIF · up to {limits.maxFilesPerBatch} files
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
