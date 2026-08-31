'use client'

import { limits } from '@config/limits'
import { formatBytes } from '@/lib/pipeline/runner'
import type { BatchFile } from '@/lib/ui/batch'

const STAGE_LABEL = {
  decode: 'Reading',
  transform: 'Editing',
  encode: 'Saving',
} as const

type ResultsListProps = {
  files: readonly BatchFile[]
  onRemove: (id: string) => void
  onDownload: (file: BatchFile) => void
  busy: boolean
}

export function ResultsList({ files, onRemove, onDownload, busy }: ResultsListProps) {
  if (files.length === 0) return null

  return (
    <ul className="flex flex-col gap-2">
      {files.map((entry) => (
        <li
          key={entry.id}
          className="flex items-center gap-3 rounded-[--radius-md] border border-border bg-bg-raised px-3 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-fg-primary text-sm">{entry.file.name}</p>
            <FileDetail entry={entry} />
          </div>

          {entry.status.kind === 'done' ? (
            <button
              type="button"
              onClick={() => onDownload(entry)}
              className="shrink-0 rounded-[--radius-sm] border border-border px-2.5 py-1 font-medium text-fg-primary text-xs transition-colors hover:bg-bg-sunken"
            >
              Download
            </button>
          ) : null}

          {!busy ? (
            <button
              type="button"
              onClick={() => onRemove(entry.id)}
              aria-label={`Remove ${entry.file.name}`}
              className="shrink-0 rounded-[--radius-sm] px-2 py-1 text-fg-muted text-xs transition-colors hover:bg-bg-sunken hover:text-fg-primary"
            >
              ✕
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function FileDetail({ entry }: { entry: BatchFile }) {
  const { status } = entry

  switch (status.kind) {
    case 'queued':
      return <p className="text-fg-muted text-xs">{formatBytes(entry.file.size)} · waiting</p>

    case 'running':
      return (
        <p className="text-brand text-xs">
          {STAGE_LABEL[status.stage]}
          {status.stage === 'encode' && entry.file.size > 4_000_000
            ? ' — large file, hang on'
            : '…'}
        </p>
      )

    case 'done': {
      const { bytesIn, bytesOut, width, height, format } = status.output
      const saved = Math.round(((bytesIn - bytesOut) / bytesIn) * 100)
      const grew = saved < 0

      return (
        <p className="text-fg-muted text-xs">
          {formatBytes(bytesIn)} →{' '}
          <span className="text-fg-secondary">{formatBytes(bytesOut)}</span>{' '}
          <span className={grew ? 'text-warning' : 'text-success'}>
            ({grew ? `+${Math.abs(saved)}% larger` : `−${saved}%`})
          </span>{' '}
          · {width}×{height} · {format.toUpperCase()}
        </p>
      )
    }

    case 'failed':
      return (
        <p className="text-danger text-xs">
          {status.error.message}
          {status.error.code === 'FILE_TOO_LARGE'
            ? ` (limit ${formatBytes(limits.maxFileBytes)})`
            : ''}
        </p>
      )
  }
}
