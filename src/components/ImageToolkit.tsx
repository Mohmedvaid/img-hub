'use client'

import { limits, pipelineLimits } from '@config/limits'
import { zipSync } from 'fflate'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { type PipelineError, pipelineError } from '@/lib/pipeline/errors'
import { availableOptionalFeatures, type FeatureId, featureInfo } from '@/lib/pipeline/features'
import { formatFromMimeType, formatInfo, losesTransparency } from '@/lib/pipeline/formats'
import type { ResizeTransform } from '@/lib/pipeline/operations/resize'
import { formatBytes } from '@/lib/pipeline/runner'
import { PipelineClient } from '@/lib/pipeline/worker/client'
import { type BatchFile, batchReducer, batchTotals, initialBatch } from '@/lib/ui/batch'
import { type BuilderState, hasWork, initialBuilderState, toPipeline } from '@/lib/ui/pipelineState'
import { DropZone } from './DropZone'
import { ErrorBoundary } from './ErrorBoundary'
import { FeatureToggle } from './FeatureToggle'
import { ResultsList } from './ResultsList'

type ImageToolkitProps = {
  /** The feature this page is about. Always on, never a checkbox. Omit on the home builder. */
  primary?: FeatureId
}

export function ImageToolkit({ primary }: ImageToolkitProps) {
  const [batch, dispatch] = useReducer(batchReducer, initialBatch)
  const [builder, setBuilder] = useState<BuilderState>(() => initialBuilderState(primary))
  const clientRef = useRef<PipelineClient>(null)

  // One worker for the page's lifetime. Created lazily so nothing is spawned for a
  // visitor who only reads the page.
  useEffect(() => {
    const client = new PipelineClient()
    clientRef.current = client
    return () => client.dispose()
  }, [])

  const optional = useMemo(
    () => availableOptionalFeatures(primary ?? ('__none__' as FeatureId)),
    [primary],
  )

  const setEnabled = useCallback((id: FeatureId, enabled: boolean) => {
    setBuilder((current) => ({ ...current, enabled: { ...current.enabled, [id]: enabled } }))
  }, [])

  const run = useCallback(async () => {
    const client = clientRef.current
    if (!client) return

    const pipeline = toPipeline(builder)
    const engineLimits = pipelineLimits()

    dispatch({ type: 'start' })

    // Sequential rather than parallel: every job competes for the same decoder and
    // the same memory, so running them at once makes each slower and risks an
    // out-of-memory kill on a phone. One at a time also makes progress honest.
    for (const entry of batch.files) {
      try {
        const { result } = client.run(entry.file.name, entry.file, pipeline, engineLimits, {
          onProgress: (stage) => dispatch({ type: 'progress', id: entry.id, stage }),
        })
        dispatch({ type: 'succeeded', id: entry.id, output: await result })
      } catch (error) {
        dispatch({
          type: 'failed',
          id: entry.id,
          error: error as ReturnType<typeof Object> as never,
        })
      }
    }

    dispatch({ type: 'finish' })
  }, [batch.files, builder])

  const totals = batchTotals(batch.files)
  const ready = batch.files.length > 0 && hasWork(builder) && !batch.running

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <DropZone
          onFiles={(files) => dispatch({ type: 'add', files, max: limits.maxFilesPerBatch })}
          disabled={batch.running}
          count={batch.files.length}
        />

        {totals.done > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[--radius-md] border border-border bg-bg-sunken px-3 py-2.5 text-sm">
            <span className="font-medium text-fg-primary">
              {totals.done} done{totals.failed > 0 ? `, ${totals.failed} failed` : ''}
            </span>
            <span className="text-fg-secondary">
              {formatBytes(totals.bytesIn)} → {formatBytes(totals.bytesOut)}
            </span>
            <span className={totals.savedPercent >= 0 ? 'text-success' : 'text-warning'}>
              {totals.savedPercent >= 0
                ? `${totals.savedPercent}% smaller`
                : `${Math.abs(totals.savedPercent)}% larger`}
            </span>
            {totals.done > 1 ? (
              <button
                type="button"
                onClick={() => downloadZip(batch.files)}
                className="ml-auto rounded-[--radius-sm] bg-brand px-3 py-1 font-medium text-brand-fg text-xs hover:bg-brand-hover"
              >
                Download all (.zip)
              </button>
            ) : null}
          </div>
        ) : null}

        <ErrorBoundary label="results list">
          <ResultsList
            files={batch.files}
            onRemove={(id) => dispatch({ type: 'remove', id })}
            onDownload={downloadOne}
            busy={batch.running}
          />
        </ErrorBoundary>
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
        {primary ? (
          <PrimaryPanel primary={primary} builder={builder} setBuilder={setBuilder} />
        ) : (
          <p className="font-medium text-fg-primary text-sm">What should we do?</p>
        )}

        {optional.map((feature) => (
          <FeatureToggle
            key={feature.id}
            feature={feature}
            enabled={builder.enabled[feature.id]}
            onToggle={(enabled) => setEnabled(feature.id, enabled)}
          >
            <FeatureFields id={feature.id} builder={builder} setBuilder={setBuilder} />
          </FeatureToggle>
        ))}

        <TransparencyWarning builder={builder} files={batch.files} />
        <LosslessQualityNote builder={builder} files={batch.files} />

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!ready}
            onClick={() => void run()}
            className="flex-1 rounded-[--radius-md] bg-brand px-4 py-2.5 font-medium text-brand-fg text-sm transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {batch.running ? 'Working…' : 'Run'}
          </button>

          {batch.files.length > 0 && !batch.running ? (
            <button
              type="button"
              onClick={() => dispatch({ type: 'clear' })}
              className="rounded-[--radius-md] border border-border px-3 py-2.5 font-medium text-fg-secondary text-sm transition-colors hover:bg-bg-sunken"
            >
              Clear
            </button>
          ) : null}
        </div>

        {batch.files.length > 0 && !hasWork(builder) ? (
          <p className="text-fg-muted text-xs">Pick at least one thing to do.</p>
        ) : null}
      </aside>
    </div>
  )
}

function PrimaryPanel({
  primary,
  builder,
  setBuilder,
}: {
  primary: FeatureId
  builder: BuilderState
  setBuilder: (update: (current: BuilderState) => BuilderState) => void
}) {
  const info = featureInfo(primary)

  return (
    <div className="rounded-[--radius-md] border border-brand bg-brand-subtle p-3">
      <p className="font-medium text-fg-primary text-sm">{info.label}</p>
      <p className="text-fg-secondary text-xs">{info.hint}</p>
      <div className="mt-3">
        <FeatureFields id={primary} builder={builder} setBuilder={setBuilder} forcePrimary />
      </div>
    </div>
  )
}

function FeatureFields({
  id,
  builder,
  setBuilder,
  forcePrimary = false,
}: {
  id: FeatureId
  builder: BuilderState
  setBuilder: (update: (current: BuilderState) => BuilderState) => void
  forcePrimary?: boolean
}) {
  switch (id) {
    case 'resize':
      return (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <NumberField
              label="Width"
              value={builder.resize.width}
              onChange={(width) =>
                setBuilder((c) => ({ ...c, resize: setDimension(c.resize, 'width', width) }))
              }
            />
            <NumberField
              label="Height"
              value={builder.resize.height}
              onChange={(height) =>
                setBuilder((c) => ({ ...c, resize: setDimension(c.resize, 'height', height) }))
              }
            />
          </div>
          <label className="text-fg-secondary text-xs">
            Fit
            <select
              value={builder.resize.mode}
              onChange={(event) =>
                setBuilder((c) => ({
                  ...c,
                  resize: { ...c.resize, mode: event.target.value as typeof c.resize.mode },
                }))
              }
              className="mt-1 w-full rounded-[--radius-sm] border border-border bg-bg-base px-2 py-1.5 text-fg-primary text-sm"
            >
              <option value="contain">Fit inside</option>
              <option value="cover">Fill &amp; crop</option>
              <option value="exact">Stretch</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-fg-secondary text-xs">
            <input
              type="checkbox"
              checked={builder.resize.allowUpscale}
              onChange={(event) =>
                setBuilder((c) => ({
                  ...c,
                  resize: { ...c.resize, allowUpscale: event.target.checked },
                }))
              }
              className="size-3.5 accent-[--color-brand]"
            />
            Allow enlarging
          </label>
        </div>
      )

    case 'rotate':
      return (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            {([0, 90, 180, 270] as const).map((degrees) => (
              <button
                key={degrees}
                type="button"
                onClick={() => setBuilder((c) => ({ ...c, rotate: { ...c.rotate, degrees } }))}
                className={`flex-1 rounded-[--radius-sm] border px-2 py-1.5 text-xs ${
                  builder.rotate.degrees === degrees
                    ? 'border-brand bg-brand text-brand-fg'
                    : 'border-border text-fg-secondary hover:bg-bg-sunken'
                }`}
              >
                {degrees}°
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            {(['flipHorizontal', 'flipVertical'] as const).map((axis) => (
              <label key={axis} className="flex items-center gap-1.5 text-fg-secondary text-xs">
                <input
                  type="checkbox"
                  checked={builder.rotate[axis]}
                  onChange={(event) =>
                    setBuilder((c) => ({
                      ...c,
                      rotate: { ...c.rotate, [axis]: event.target.checked },
                    }))
                  }
                  className="size-3.5 accent-[--color-brand]"
                />
                {axis === 'flipHorizontal' ? 'Mirror' : 'Flip'}
              </label>
            ))}
          </div>
        </div>
      )

    case 'convert':
      return (
        <label className="block text-fg-secondary text-xs">
          Format
          <select
            value={builder.outputFormat}
            onChange={(event) =>
              setBuilder((c) => ({
                ...c,
                outputFormat: event.target.value as typeof c.outputFormat,
              }))
            }
            className="mt-1 w-full rounded-[--radius-sm] border border-border bg-bg-base px-2 py-1.5 text-fg-primary text-sm"
          >
            {limits.outputFormats.map((format) => (
              <option key={format} value={format}>
                {formatInfo(format).label}
              </option>
            ))}
          </select>
        </label>
      )

    case 'compress':
      // Only the page where compression leads gets a slider. Elsewhere the checkbox
      // is the whole interaction, which is why hasFields is false for this feature.
      if (!forcePrimary) return null
      return (
        <label className="block text-fg-secondary text-xs">
          Quality: <span className="font-medium text-fg-primary">{builder.quality}</span>
          <input
            type="range"
            min={1}
            max={100}
            value={builder.quality}
            onChange={(event) => setBuilder((c) => ({ ...c, quality: Number(event.target.value) }))}
            className="mt-1 w-full accent-[--color-brand]"
          />
          <span className="text-fg-muted">Lower means smaller files.</span>
        </label>
      )

    default:
      return null
  }
}

/**
 * Clearing a dimension omits it rather than setting it to undefined, so an empty
 * field means "derive this from the aspect ratio" — which is what the engine expects
 * and what the placeholder promises.
 */
function setDimension(
  resize: ResizeTransform,
  axis: 'width' | 'height',
  value: number | undefined,
): ResizeTransform {
  const width = axis === 'width' ? value : resize.width
  const height = axis === 'height' ? value : resize.height

  return {
    kind: 'resize',
    mode: resize.mode,
    allowUpscale: resize.allowUpscale,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  }
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  return (
    <label className="flex-1 text-fg-secondary text-xs">
      {label}
      <input
        type="number"
        min={1}
        value={value ?? ''}
        placeholder="auto"
        onChange={(event) => {
          const next = Number(event.target.value)
          onChange(event.target.value === '' || next < 1 ? undefined : next)
        }}
        className="mt-1 w-full rounded-[--radius-sm] border border-border bg-bg-base px-2 py-1.5 text-fg-primary text-sm"
      />
    </label>
  )
}

/**
 * Warns before converting away transparency, rather than silently flattening it to
 * black — which is the single most surprising thing an image converter can do.
 */
function TransparencyWarning({
  builder,
  files,
}: {
  builder: BuilderState
  files: readonly BatchFile[]
}) {
  if (!builder.enabled.convert) return null

  const atRisk = files.some((entry) => {
    const source = entry.file.type === 'image/png' ? 'png' : undefined
    return source ? losesTransparency(source, builder.outputFormat) : false
  })

  if (!atRisk) return null

  return (
    <p className="rounded-[--radius-sm] bg-warning/10 px-2.5 py-2 text-warning text-xs">
      {formatInfo(builder.outputFormat).label} does not support transparency. Transparent areas will
      become solid.
    </p>
  )
}

/**
 * Quality has no effect on a lossless format, so saying so beats letting someone drag
 * a slider that does nothing.
 *
 * Only fires when the output really will be lossless: either they picked a lossless
 * format, or they kept the source format and every file they loaded is lossless.
 */
function LosslessQualityNote({
  builder,
  files,
}: {
  builder: BuilderState
  files: readonly BatchFile[]
}) {
  if (!builder.enabled.compress || files.length === 0) return null

  const outputIsLossless = builder.enabled.convert
    ? !formatInfo(builder.outputFormat).lossy
    : files.every((entry) => {
        const source = formatFromMimeType(entry.file.type)
        return source ? !formatInfo(source).lossy : false
      })

  if (!outputIsLossless) return null

  return (
    <p className="rounded-[--radius-sm] bg-bg-sunken px-2.5 py-2 text-fg-secondary text-xs">
      These files stay lossless, so quality has no effect. Tick{' '}
      <span className="font-medium">Convert format</span> and choose WebP for a much smaller file.
    </p>
  )
}

/** Narrows a rejection value, so an unexpected throw still renders something useful. */
function asPipelineError(thrown: unknown): PipelineError {
  if (
    typeof thrown === 'object' &&
    thrown !== null &&
    'code' in thrown &&
    'message' in thrown &&
    typeof (thrown as { message: unknown }).message === 'string'
  ) {
    return thrown as PipelineError
  }

  return pipelineError('TRANSFORM_FAILED', {
    detail: thrown instanceof Error ? thrown.message : String(thrown),
  })
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function downloadOne(entry: BatchFile): void {
  if (entry.status.kind !== 'done') return
  downloadBlob(entry.status.output.blob, entry.status.output.fileName)
}

async function downloadZip(files: readonly BatchFile[]): Promise<void> {
  const entries: Record<string, Uint8Array> = {}
  const used = new Set<string>()

  for (const entry of files) {
    if (entry.status.kind !== 'done') continue

    // Two source files can converge on one output name once extensions change, so
    // de-duplicate rather than letting one silently overwrite the other.
    let name = entry.status.output.fileName
    let suffix = 1
    while (used.has(name)) {
      const dot = name.lastIndexOf('.')
      name = `${entry.status.output.fileName.slice(0, dot)}-${suffix}${entry.status.output.fileName.slice(dot)}`
      suffix += 1
    }
    used.add(name)

    entries[name] = new Uint8Array(await entry.status.output.blob.arrayBuffer())
  }

  // Store-only: these are already-compressed images, so deflating them again costs
  // time and saves nothing.
  const zipped = zipSync(entries, { level: 0 })

  // fflate types its output as possibly SharedArrayBuffer-backed, which Blob will not
  // accept. We never enable SharedArrayBuffer (ADR-0002), so copying into a plain
  // array is exact rather than lossy, and avoids a cast that would outlive the reason
  // for it.
  downloadBlob(new Blob([Uint8Array.from(zipped)], { type: 'application/zip' }), 'imghub.zip')
}
