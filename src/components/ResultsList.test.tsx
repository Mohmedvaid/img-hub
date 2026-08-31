import { limits } from '@config/limits'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { pipelineError } from '@/lib/pipeline/errors'
import type { RunOutput } from '@/lib/pipeline/runner'
import type { BatchFile, FileStatus } from '@/lib/ui/batch'
import { ResultsList } from './ResultsList'

function entry(status: FileStatus, name = 'holiday.jpg', size = 2_000_000): BatchFile {
  const file = new File([new Uint8Array([1])], name, { type: 'image/jpeg' })
  // Only the reported size is read here, and allocating megabytes of zeros to get it
  // would slow every case for nothing.
  Object.defineProperty(file, 'size', { value: size })
  return { id: name, file, status }
}

function output(overrides: Partial<RunOutput> = {}): RunOutput {
  return {
    blob: new Blob(['x']),
    fileName: 'holiday.webp',
    format: 'webp',
    width: 1920,
    height: 1080,
    bytesIn: 2_000_000,
    bytesOut: 500_000,
    ...overrides,
  }
}

const noop = () => {}

describe('ResultsList', () => {
  it('renders nothing at all when the batch is empty', () => {
    const { container } = render(
      <ResultsList files={[]} onRemove={noop} onDownload={noop} busy={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a queued file with its size', () => {
    render(
      <ResultsList
        files={[entry({ kind: 'queued' })]}
        onRemove={noop}
        onDownload={noop}
        busy={false}
      />,
    )

    expect(screen.getByText('holiday.jpg')).toBeInTheDocument()
    expect(screen.getByText('1.9 MB · waiting')).toBeInTheDocument()
  })

  it('names the stage a running file is in', () => {
    render(
      <ResultsList
        files={[entry({ kind: 'running', stage: 'decode' })]}
        onRemove={noop}
        onDownload={noop}
        busy
      />,
    )

    expect(screen.getByText('Reading…')).toBeInTheDocument()
  })

  it('warns that a large file will sit in the encode stage a while', () => {
    render(
      <ResultsList
        files={[entry({ kind: 'running', stage: 'encode' }, 'big.jpg', 9_000_000)]}
        onRemove={noop}
        onDownload={noop}
        busy
      />,
    )

    expect(screen.getByText(/large file, hang on/)).toBeInTheDocument()
  })

  it('does not warn about a small file in the same stage', () => {
    render(
      <ResultsList
        files={[entry({ kind: 'running', stage: 'encode' }, 'small.jpg', 100_000)]}
        onRemove={noop}
        onDownload={noop}
        busy
      />,
    )

    expect(screen.queryByText(/large file/)).not.toBeInTheDocument()
    expect(screen.getByText('Saving…')).toBeInTheDocument()
  })

  it('reports what a finished file saved, and its new dimensions and format', () => {
    render(
      <ResultsList
        files={[entry({ kind: 'done', output: output() })]}
        onRemove={noop}
        onDownload={noop}
        busy={false}
      />,
    )

    expect(screen.getByText('(−75%)')).toBeInTheDocument()
    expect(screen.getByText(/1920×1080 · WEBP/)).toBeInTheDocument()
  })

  it('says so plainly when the output grew instead of shrinking', () => {
    render(
      <ResultsList
        files={[entry({ kind: 'done', output: output({ bytesIn: 100_000, bytesOut: 150_000 }) })]}
        onRemove={noop}
        onDownload={noop}
        busy={false}
      />,
    )

    expect(screen.getByText('(+50% larger)')).toBeInTheDocument()
  })

  it('offers a download per finished file', async () => {
    const onDownload = vi.fn()
    const finished = entry({ kind: 'done', output: output() })
    render(<ResultsList files={[finished]} onRemove={noop} onDownload={onDownload} busy={false} />)

    await userEvent.click(screen.getByRole('button', { name: 'Download' }))

    expect(onDownload).toHaveBeenCalledWith(finished)
  })

  it('offers no download for a file that has not finished', () => {
    render(
      <ResultsList
        files={[entry({ kind: 'queued' })]}
        onRemove={noop}
        onDownload={noop}
        busy={false}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
  })

  it('shows the failure message for a file that failed', () => {
    render(
      <ResultsList
        files={[entry({ kind: 'failed', error: pipelineError('DECODE_FAILED') })]}
        onRemove={noop}
        onDownload={noop}
        busy={false}
      />,
    )

    expect(screen.getByText(/couldn't be read/)).toBeInTheDocument()
  })

  it('names the actual limit when a file was rejected for being too large', () => {
    render(
      <ResultsList
        files={[entry({ kind: 'failed', error: pipelineError('FILE_TOO_LARGE') })]}
        onRemove={noop}
        onDownload={noop}
        busy={false}
      />,
    )

    expect(
      screen.getByText(new RegExp(`limit ${limits.maxFileBytes / (1024 * 1024)}`)),
    ).toBeInTheDocument()
  })

  it('removes a file on request', async () => {
    const onRemove = vi.fn()
    render(
      <ResultsList
        files={[entry({ kind: 'queued' })]}
        onRemove={onRemove}
        onDownload={noop}
        busy={false}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove holiday.jpg' }))

    expect(onRemove).toHaveBeenCalledWith('holiday.jpg')
  })

  it('hides remove buttons while the batch is running, so a job cannot vanish mid-run', () => {
    render(
      <ResultsList
        files={[entry({ kind: 'running', stage: 'transform' })]}
        onRemove={noop}
        onDownload={noop}
        busy
      />,
    )

    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument()
  })
})
