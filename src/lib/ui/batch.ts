/**
 * Batch state.
 *
 * A reducer rather than a state library: this is one tree owned by one screen. If a
 * second, unrelated part of the app ever needs it, that is when a store earns its
 * place.
 *
 * The shape follows the one rule that matters — per-file failure is normal. Every
 * file carries its own status, so one corrupt file in forty leaves the other
 * thirty-nine untouched.
 */

import type { PipelineError } from '@/lib/pipeline/errors'
import type { RunOutput } from '@/lib/pipeline/runner'
import type { RunStage } from '@/lib/pipeline/worker/protocol'

export type FileStatus =
  | { readonly kind: 'queued' }
  | { readonly kind: 'running'; readonly stage: RunStage }
  | { readonly kind: 'done'; readonly output: RunOutput }
  | { readonly kind: 'failed'; readonly error: PipelineError }

export type BatchFile = {
  readonly id: string
  readonly file: File
  readonly status: FileStatus
}

export type BatchState = {
  readonly files: readonly BatchFile[]
  readonly running: boolean
}

export type BatchAction =
  | { type: 'add'; files: readonly File[]; max: number }
  | { type: 'remove'; id: string }
  | { type: 'clear' }
  | { type: 'start' }
  | { type: 'progress'; id: string; stage: RunStage }
  | { type: 'succeeded'; id: string; output: RunOutput }
  | { type: 'failed'; id: string; error: PipelineError }
  | { type: 'finish' }

export const initialBatch: BatchState = { files: [], running: false }

export function batchReducer(state: BatchState, action: BatchAction): BatchState {
  switch (action.type) {
    case 'add': {
      const room = Math.max(0, action.max - state.files.length)
      const additions = action.files.slice(0, room).map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        file,
        status: { kind: 'queued' } as const,
      }))
      return { ...state, files: [...state.files, ...additions] }
    }

    case 'remove':
      return { ...state, files: state.files.filter((entry) => entry.id !== action.id) }

    case 'clear':
      return initialBatch

    case 'start':
      // Re-running resets outcomes but keeps the files, so changing a setting and
      // running again does not mean re-picking everything.
      return {
        running: true,
        files: state.files.map((entry) => ({ ...entry, status: { kind: 'queued' } })),
      }

    case 'progress':
      return updateFile(state, action.id, { kind: 'running', stage: action.stage })

    case 'succeeded':
      return updateFile(state, action.id, { kind: 'done', output: action.output })

    case 'failed':
      return updateFile(state, action.id, { kind: 'failed', error: action.error })

    case 'finish':
      return { ...state, running: false }
  }
}

function updateFile(state: BatchState, id: string, status: FileStatus): BatchState {
  return {
    ...state,
    files: state.files.map((entry) => (entry.id === id ? { ...entry, status } : entry)),
  }
}

export type BatchTotals = {
  readonly done: number
  readonly failed: number
  readonly bytesIn: number
  readonly bytesOut: number
  /** Percentage saved across everything that succeeded. Negative means it grew. */
  readonly savedPercent: number
}

export function batchTotals(files: readonly BatchFile[]): BatchTotals {
  let done = 0
  let failed = 0
  let bytesIn = 0
  let bytesOut = 0

  for (const entry of files) {
    if (entry.status.kind === 'done') {
      done += 1
      bytesIn += entry.status.output.bytesIn
      bytesOut += entry.status.output.bytesOut
    } else if (entry.status.kind === 'failed') {
      failed += 1
    }
  }

  const savedPercent = bytesIn > 0 ? Math.round(((bytesIn - bytesOut) / bytesIn) * 100) : 0

  return { done, failed, bytesIn, bytesOut, savedPercent }
}
