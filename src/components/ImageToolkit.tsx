'use client'

import { limits, pipelineLimits } from '@config/limits'
import { type Preset, presets, widthPresets } from '@config/presets'
import { zipSync } from 'fflate'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { type PipelineError, pipelineError } from '@/lib/pipeline/errors'
import {
  availableOptionalFeatures,
  type FeatureId,
  type FeatureInfo,
  featureInfo,
} from '@/lib/pipeline/features'
import {
  formatFromMimeType,
  formatInfo,
  type ImageFormat,
  losesTransparency,
} from '@/lib/pipeline/formats'
import type { CropTransform } from '@/lib/pipeline/operations/crop'
import { formatBytes } from '@/lib/pipeline/runner'
import { type Pipeline, QUALITY_RANGE } from '@/lib/pipeline/types'
import { PipelineClient } from '@/lib/pipeline/worker/client'
import { type BatchFile, batchReducer, batchTotals, initialBatch } from '@/lib/ui/batch'
import { ASPECT_RATIOS, type Frame, remapCrop } from '@/lib/ui/cropGeometry'
import { intakeFiles, rejectionSummary } from '@/lib/ui/intake'
import { type Orientation, toTransform, UPRIGHT } from '@/lib/ui/orientation'
import {
  applyPreset,
  type BuilderState,
  hasWork,
  initialBuilderState,
  isWidthOnly,
  setDimension,
  toPipeline,
  widthOnly,
} from '@/lib/ui/pipelineState'
import { DropZone } from './DropZone'
import { ErrorBoundary } from './ErrorBoundary'
import { FeatureToggle } from './FeatureToggle'
import { ImagePreview } from './ImagePreview'
import { InfoPopover, InfoRow } from './InfoPopover'
import { OrientationControls } from './OrientationControls'
import { ResultsList } from './ResultsList'

type ImageToolkitProps = {
  /** The feature this page is about. Always on, never a checkbox. Omit on the home builder. */
  primary?: FeatureId
  /**
   * The state this page opens in, from its entry in config/tools.ts.
   *
   * It is what makes one conversion page differ from another; without it every
   * converter would start on the same output format.
   */
  preset?: Pipeline
}

export function ImageToolkit({ primary, preset }: ImageToolkitProps) {
  const [batch, dispatch] = useReducer(batchReducer, initialBatch)
  const [builder, setBuilder] = useState<BuilderState>(() => initialBuilderState(primary, preset))
  const [sourceFrame, setSourceFrame] = useState<Frame>()
  const [activePreset, setActivePreset] = useState<string>()
  const [cropRatio, setCropRatio] = useState<number>()
  const [skipped, setSkipped] = useState<string>()
  const clientRef = useRef<PipelineClient>(null)

  useEffect(() => {
    const client = new PipelineClient()
    clientRef.current = client
    return () => client.dispose()
  }, [])

  const optional = useMemo(() => availableOptionalFeatures(primary), [primary])

  /**
   * Changing orientation moves the crop box with it.
   *
   * Crop coordinates are in post-rotation space (ADR-0006), so turning the image
   * without moving the box silently selects a different region. Enabling or disabling
   * the rotate feature counts as an orientation change too, so both route through here.
   */
  const applyOrientation = useCallback(
    (nextOrientation: Orientation, nextEnabled?: boolean) => {
      setActivePreset(undefined)
      setBuilder((current) => {
        const enabled = nextEnabled ?? current.enabled.rotate
        const next: BuilderState = {
          ...current,
          orientation: nextOrientation,
          enabled: { ...current.enabled, rotate: enabled },
        }

        const from = toTransform(
          current.enabled.rotate ? current.orientation : { rotation: 0, mirrored: false },
        )
        const to = toTransform(enabled ? nextOrientation : { rotation: 0, mirrored: false })
        const unchanged = from.degrees === to.degrees && from.flipHorizontal === to.flipHorizontal

        if (unchanged || !current.enabled.crop || current.crop.width === 0 || !sourceFrame) {
          return next
        }

        return {
          ...next,
          crop: { kind: 'crop', ...remapCrop(current.crop, sourceFrame, from, to) },
        }
      })
    },
    [sourceFrame],
  )

  const setEnabled = useCallback(
    (id: FeatureId, enabled: boolean) => {
      if (id === 'rotate') {
        applyOrientation(builder.orientation, enabled)
        return
      }
      setActivePreset(undefined)
      setBuilder((current) => ({ ...current, enabled: { ...current.enabled, [id]: enabled } }))
    },
    [applyOrientation, builder.orientation],
  )

  /**
   * Back to the state this page opens in.
   *
   * There was no way out of a choice short of reloading: a preset switches four
   * features on at once, and undoing it by hand meant remembering which four. Files
   * are deliberately left alone — `Clear` is for those, and someone resetting the
   * settings is usually about to run the same batch a different way.
   */
  const resetSettings = useCallback(() => {
    setBuilder(initialBuilderState(primary, preset))
    setActivePreset(undefined)
    setCropRatio(undefined)
  }, [primary, preset])

  const addFiles = useCallback(
    async (files: readonly File[]) => {
      const result = await intakeFiles(files, limits, batch.files.length)
      setSkipped(rejectionSummary(result.rejected))
      if (result.accepted.length > 0) {
        dispatch({
          type: 'add',
          files: result.accepted.map((entry) => entry.file),
          max: limits.maxFilesPerBatch,
        })
      }
    },
    [batch.files.length],
  )

  const run = useCallback(async () => {
    const client = clientRef.current
    if (!client) return

    const pipeline = toPipeline(builder)
    const engineLimits = pipelineLimits()
    dispatch({ type: 'start' })

    // Sequential: every job competes for the same decoder and the same memory, so
    // running them at once makes each slower and risks an out-of-memory kill.
    for (const entry of batch.files) {
      try {
        const { result } = client.run(entry.file.name, entry.file, pipeline, engineLimits, {
          onProgress: (stage) => dispatch({ type: 'progress', id: entry.id, stage }),
        })
        dispatch({ type: 'succeeded', id: entry.id, output: await result })
      } catch (thrown) {
        dispatch({ type: 'failed', id: entry.id, error: asPipelineError(thrown) })
      }
    }

    dispatch({ type: 'finish' })
  }, [batch.files, builder])

  const previewFile = batch.files[0]?.file
  const count = batch.files.length
  const ready = count > 0 && hasWork(builder) && !batch.running

  // Geometry controls sit beside the preview rather than under a checkbox, so they
  // appear whenever their feature is on — as the page's own, or because it was ticked.
  const showOrientation = primary === 'rotate' || builder.enabled.rotate
  const showCropRatio = (primary === 'crop' || builder.enabled.crop) && previewFile !== undefined

  // Crop is drawn on the first file; a mixed-size batch clamps for the rest.
  const mixedSizes = builder.enabled.crop && count > 1

  return (
    <div className="flex flex-col gap-6">
      {/*
       * Presets sit above the columns rather than at the top of the settings column.
       * They are the fastest route to a finished file, and in the column they were
       * below the preview, the dropzone and the results on every screen narrower than
       * `lg` — the first thing a visitor should see, reachable only by scrolling past
       * everything else.
       */}
      {primary ? null : (
        <PresetPicker
          active={activePreset}
          onPick={(chosen) => {
            setActivePreset(chosen.id)
            setBuilder((current) => applyPreset(current, chosen))
          }}
        />
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          <PreviewPane
            file={previewFile}
            count={count}
            builder={builder}
            cropRatio={cropRatio}
            onSourceLoad={setSourceFrame}
            onCropChange={(crop) => setBuilder((c) => ({ ...c, crop }))}
          />

          <DropZone onFiles={addFiles} disabled={batch.running} count={count} />

          {skipped ? (
            <p className="rounded-[--radius-sm] bg-warning/10 px-3 py-2 text-warning text-sm">
              {skipped}
            </p>
          ) : null}

          <BatchSummary files={batch.files} />

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
            <p className="font-medium text-fg-primary text-sm">Or choose your own</p>
          )}

          {showOrientation ? (
            <Panel title="Orientation">
              <OrientationControls
                orientation={builder.orientation}
                onChange={(next) => applyOrientation(next, true)}
              />
            </Panel>
          ) : null}

          {showCropRatio ? (
            <Panel title="Crop ratio">
              <RatioPicker active={cropRatio} onPick={setCropRatio} mixedSizes={mixedSizes} />
            </Panel>
          ) : null}

          <FeatureChecklist
            optional={optional}
            builder={builder}
            setBuilder={setBuilder}
            onToggle={setEnabled}
          />

          <TransparencyWarning builder={builder} files={batch.files} />
          <LosslessQualityNote builder={builder} files={batch.files} />

          <RunControls
            count={count}
            ready={ready}
            running={batch.running}
            onRun={() => void run()}
            onClear={() => {
              dispatch({ type: 'clear' })
              setSkipped(undefined)
            }}
          />

          {count > 0 && !hasWork(builder) ? (
            <p className="text-fg-muted text-xs">Pick at least one thing to do.</p>
          ) : null}

          <button
            type="button"
            onClick={resetSettings}
            className="self-start text-fg-muted text-xs underline underline-offset-2 transition-colors hover:text-fg-secondary"
          >
            Reset settings
          </button>
        </aside>
      </div>
    </div>
  )
}

/**
 * The preview, or nothing when no file has been picked yet.
 *
 * Shows the first file of a batch: the crop box and the turn are set once and applied
 * to everything, so previewing each file in turn would suggest otherwise.
 */
function PreviewPane({
  file,
  count,
  builder,
  cropRatio,
  onSourceLoad,
  onCropChange,
}: {
  file: File | undefined
  count: number
  builder: BuilderState
  cropRatio: number | undefined
  onSourceLoad: (frame: Frame) => void
  onCropChange: (crop: CropTransform) => void
}) {
  if (!file) return null

  const crop = builder.enabled.crop
    ? {
        crop: {
          value: builder.crop,
          onChange: onCropChange,
          ...(cropRatio === undefined ? {} : { ratio: cropRatio }),
        },
      }
    : {}

  return (
    <ImagePreview
      file={file}
      orientation={builder.enabled.rotate ? builder.orientation : UPRIGHT}
      onSourceLoad={onSourceLoad}
      caption={count > 1 ? `Previewing ${file.name} — first of ${count}` : file.name}
      {...crop}
    />
  )
}

/** A titled block in the settings column. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[--radius-md] border border-border bg-bg-raised p-3">
      <p className="mb-2 font-medium text-fg-primary text-sm">{title}</p>
      {children}
    </div>
  )
}

/** What the batch achieved, plus the one download that covers all of it. */
function BatchSummary({ files }: { files: readonly BatchFile[] }) {
  const totals = batchTotals(files)
  if (totals.done === 0) return null

  const shrank = totals.savedPercent >= 0

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[--radius-md] border border-border bg-bg-sunken px-3 py-2.5 text-sm">
      <span className="font-medium text-fg-primary">
        {totals.done} done{totals.failed > 0 ? `, ${totals.failed} failed` : ''}
      </span>
      <span className="text-fg-secondary">
        {formatBytes(totals.bytesIn)} → {formatBytes(totals.bytesOut)}
      </span>
      <span className={shrank ? 'text-success' : 'text-warning'}>
        {shrank ? `${totals.savedPercent}% smaller` : `${Math.abs(totals.savedPercent)}% larger`}
      </span>

      {/* One file needs no archive; downloading it directly is what people expect. */}
      {totals.done > 1 ? (
        <button
          type="button"
          onClick={() => void downloadZip(files)}
          className="ml-auto rounded-[--radius-sm] bg-brand px-3 py-1 font-medium text-brand-fg text-xs hover:bg-brand-hover"
        >
          Download all ({totals.done}) as .zip
        </button>
      ) : null}
    </div>
  )
}

function RatioPicker({
  active,
  onPick,
  mixedSizes,
}: {
  active: number | undefined
  onPick: (ratio: number | undefined) => void
  mixedSizes: boolean
}) {
  return (
    <>
      <div className="flex flex-wrap gap-1">
        {ASPECT_RATIOS.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onPick(option.value)}
            className={`rounded-[--radius-sm] border px-2 py-1 text-xs ${
              active === option.value
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border text-fg-secondary hover:bg-bg-sunken'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mixedSizes ? (
        <p className="mt-2 text-fg-muted text-xs">
          The area is set on the first image. Smaller images are trimmed to fit.
        </p>
      ) : null}
    </>
  )
}

/**
 * The optional features, as checkboxes.
 *
 * Rotate and crop are listed last and carry no fields of their own: their controls
 * live beside the preview, where the image they act on actually is.
 */
function FeatureChecklist({
  optional,
  builder,
  setBuilder,
  onToggle,
}: {
  optional: readonly FeatureInfo[]
  builder: BuilderState
  setBuilder: (update: (current: BuilderState) => BuilderState) => void
  onToggle: (id: FeatureId, enabled: boolean) => void
}) {
  const onPreview = (id: FeatureId) => id === 'rotate' || id === 'crop'

  return (
    <>
      {optional
        .filter((feature) => !onPreview(feature.id))
        .map((feature) => (
          <FeatureToggle
            key={feature.id}
            feature={feature}
            enabled={builder.enabled[feature.id]}
            onToggle={(enabled) => onToggle(feature.id, enabled)}
          >
            <FeatureFields id={feature.id} builder={builder} setBuilder={setBuilder} />
          </FeatureToggle>
        ))}

      {optional
        .filter((feature) => onPreview(feature.id))
        .map((feature) => (
          <FeatureToggle
            key={feature.id}
            feature={feature}
            enabled={builder.enabled[feature.id]}
            onToggle={(enabled) => onToggle(feature.id, enabled)}
          />
        ))}
    </>
  )
}

function RunControls({
  count,
  ready,
  running,
  onRun,
  onClear,
}: {
  count: number
  ready: boolean
  running: boolean
  onRun: () => void
  onClear: () => void
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={!ready}
        onClick={onRun}
        className="flex-1 rounded-[--radius-md] bg-brand px-4 py-2.5 font-medium text-brand-fg text-sm transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? 'Working…' : count > 1 ? `Apply to all ${count}` : 'Apply'}
      </button>

      {count > 0 && !running ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-[--radius-md] border border-border px-3 py-2.5 font-medium text-fg-secondary text-sm transition-colors hover:bg-bg-sunken"
        >
          Clear
        </button>
      ) : null}
    </div>
  )
}

/**
 * The presets, as one wrapped row of buttons.
 *
 * Each used to carry its own line of prose, which made the list taller than the
 * controls it was meant to save the visitor from. The prose is the same for everyone
 * and read once, so it moved behind the info button — the row stays scannable, and
 * nothing was deleted.
 */
function PresetPicker({
  active,
  onPick,
}: {
  active: string | undefined
  onPick: (preset: Preset) => void
}) {
  return (
    <div className="rounded-[--radius-md] border border-border bg-bg-raised p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-fg-primary text-sm">Start from a preset</p>
          <p className="text-fg-muted text-xs">
            One click sets the size, format and quality for a common job.
          </p>
        </div>
        <InfoPopover title="What each preset does">
          {presets.map((preset) => (
            <InfoRow key={preset.id} term={preset.label}>
              {preset.hint}
            </InfoRow>
          ))}
        </InfoPopover>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onPick(preset)}
            className={`rounded-[--radius-sm] border px-2.5 py-1.5 font-medium text-xs transition-colors ${
              active === preset.id
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border bg-bg-base text-fg-secondary hover:border-border-strong hover:text-fg-primary'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The page's own feature, and its controls.
 *
 * A converter with no format picker can only ever produce what its preset named, and
 * a compressor with no slider is a page about quality that will not let you set it.
 * The primary feature gets the same fields the optional checkbox would reveal, minus
 * the checkbox — it cannot be switched off.
 */
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
    <div className="flex flex-col gap-2 rounded-[--radius-md] border border-brand bg-brand-subtle p-3">
      <div>
        <p className="font-medium text-fg-primary text-sm">{info.label}</p>
        <p className="text-fg-secondary text-xs">{info.hint}</p>
      </div>

      {primary === 'convert' ? (
        <FormatField
          value={builder.outputFormat}
          onChange={(outputFormat) => setBuilder((c) => ({ ...c, outputFormat }))}
        />
      ) : null}

      {primary === 'compress' ? (
        <QualityField
          value={builder.quality}
          onChange={(quality) => setBuilder((c) => ({ ...c, quality }))}
        />
      ) : null}

      {primary === 'resize' ? <ResizeFields builder={builder} setBuilder={setBuilder} /> : null}
    </div>
  )
}

function FeatureFields({
  id,
  builder,
  setBuilder,
}: {
  id: FeatureId
  builder: BuilderState
  setBuilder: (update: (current: BuilderState) => BuilderState) => void
}) {
  switch (id) {
    case 'resize':
      return <ResizeFields builder={builder} setBuilder={setBuilder} />

    case 'convert':
      return (
        <FormatField
          value={builder.outputFormat}
          onChange={(outputFormat) => setBuilder((c) => ({ ...c, outputFormat }))}
        />
      )

    default:
      return null
  }
}

function ResizeFields({
  builder,
  setBuilder,
}: {
  builder: BuilderState
  setBuilder: (update: (current: BuilderState) => BuilderState) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <WidthPresets
        resize={builder.resize}
        onPick={(width) => setBuilder((c) => ({ ...c, resize: widthOnly(c.resize, width) }))}
      />

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
}

/**
 * One-click widths, above the two number fields.
 *
 * Width only, with the height left on auto. Almost every target someone resizes for
 * is specified as a width — a theme's product image, a page column — and typing a
 * height alongside it is how an image ends up squashed. The fields below still take
 * both for anyone who genuinely needs a box.
 */
function WidthPresets({
  resize,
  onPick,
}: {
  resize: BuilderState['resize']
  onPick: (width: number) => void
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <p className="text-fg-secondary text-xs">Common widths</p>
        <InfoPopover title="What these widths are for">
          {widthPresets.map((entry) => (
            <InfoRow key={entry.width} term={`${entry.width}px`}>
              {entry.use}
            </InfoRow>
          ))}
          <p className="mt-1.5 text-fg-muted text-xs leading-snug">
            Each is a ceiling, with the height following the image. Nothing is enlarged unless you
            tick Allow enlarging.
          </p>
        </InfoPopover>
      </div>

      <div className="mt-1 flex flex-wrap gap-1">
        {widthPresets.map((entry) => (
          <button
            key={entry.width}
            type="button"
            onClick={() => onPick(entry.width)}
            className={`rounded-[--radius-sm] border px-1.5 py-1 text-xs tabular-nums transition-colors ${
              isWidthOnly(resize, entry.width)
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border text-fg-secondary hover:bg-bg-sunken'
            }`}
          >
            {entry.width}
          </button>
        ))}
      </div>
    </div>
  )
}

function FormatField({
  value,
  onChange,
}: {
  value: ImageFormat
  onChange: (format: ImageFormat) => void
}) {
  return (
    <label className="block text-fg-secondary text-xs">
      Format
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as ImageFormat)}
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
}

/**
 * The quality slider, shown only where compression is the page's whole point.
 *
 * Everywhere else compression is a bare checkbox on purpose: tuning quality is a
 * different, more advanced intent, and a slider next to every other option invites
 * fiddling with a number most people have no way to judge.
 */
function QualityField({ value, onChange }: { value: number; onChange: (quality: number) => void }) {
  return (
    <label className="block text-fg-secondary text-xs">
      Quality: <span className="font-medium text-fg-primary">{value}</span>
      <input
        type="range"
        min={QUALITY_RANGE.min}
        max={QUALITY_RANGE.max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full accent-[--color-brand]"
      />
    </label>
  )
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

function TransparencyWarning({
  builder,
  files,
}: {
  builder: BuilderState
  files: readonly BatchFile[]
}) {
  if (!builder.enabled.convert) return null

  const atRisk = files.some((entry) => {
    const source = formatFromMimeType(entry.file.type)
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

    // Two sources can converge on one output name once extensions change.
    let name = entry.status.output.fileName
    let suffix = 1
    while (used.has(name)) {
      const dot = entry.status.output.fileName.lastIndexOf('.')
      name = `${entry.status.output.fileName.slice(0, dot)}-${suffix}${entry.status.output.fileName.slice(dot)}`
      suffix += 1
    }
    used.add(name)
    entries[name] = new Uint8Array(await entry.status.output.blob.arrayBuffer())
  }

  // Store-only: these are already-compressed images.
  const zipped = zipSync(entries, { level: 0 })
  downloadBlob(new Blob([Uint8Array.from(zipped)], { type: 'application/zip' }), 'imghub.zip')
}
