import { findTool } from '@config/tools'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pipelineError } from '@/lib/pipeline/errors'
import type { RunOutput } from '@/lib/pipeline/runner'
import type { Pipeline } from '@/lib/pipeline/types'
import { ImageToolkit } from './ImageToolkit'

function tool(slug: string) {
  const found = findTool(slug)
  if (!found) throw new Error(`fixture tool ${slug} is missing from config/tools.ts`)
  return found
}

/**
 * The worker is replaced wholesale.
 *
 * Its own correlation and crash handling are covered in worker/client.test.ts; what
 * matters here is what the page asks it to run and what it does with the answer.
 */
const worker = vi.hoisted(() => ({
  run: vi.fn(),
  cancel: vi.fn(),
  cancelAll: vi.fn(),
  dispose: vi.fn(),
}))

vi.mock('@/lib/pipeline/worker/client', () => ({
  PipelineClient: class {
    run = worker.run
    cancel = worker.cancel
    cancelAll = worker.cancelAll
    dispose = worker.dispose
  },
}))

const HEADERS = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff],
}

/** A file with real magic bytes, because intake reads them rather than trusting the type. */
function imageFile(name: string, kind: keyof typeof HEADERS = 'png', size = 32): File {
  const bytes = new Uint8Array(size)
  bytes.set(HEADERS[kind])
  return new File([bytes], name, { type: `image/${kind}` })
}

function pdfFile(name = 'invoice.pdf'): File {
  return new File([new TextEncoder().encode('%PDF-1.7 not an image at all')], name, {
    type: 'application/pdf',
  })
}

function outputFor(fileName: string, overrides: Partial<RunOutput> = {}): RunOutput {
  return {
    blob: new Blob([new Uint8Array(4)]),
    fileName,
    format: 'webp',
    width: 400,
    height: 300,
    bytesIn: 1000,
    bytesOut: 400,
    ...overrides,
  }
}

async function addFiles(...files: File[]) {
  const input = document.querySelector('input[type=file]') as HTMLInputElement
  await userEvent.upload(input, files)
  // Intake identifies files by reading their bytes, so the state update lands a tick
  // later. Letting it settle inside act() keeps assertions off a half-updated tree.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/**
 * Drops files on the zone rather than picking them.
 *
 * The file picker honours `accept`, so anything that is not an image cannot reach the
 * page that way. Drag-and-drop does not, which is exactly how a stray PDF arrives.
 */
async function dropFiles(...files: File[]) {
  fireEvent.drop(screen.getByText(/Drop images here|images? ready/).parentElement as Element, {
    dataTransfer: { files },
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** jsdom never loads the image, so the preview is handed its dimensions directly. */
async function loadPreview(width = 400, height = 300) {
  const image = await screen.findByRole('presentation')
  Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true })
  Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true })
  fireEvent.load(image)
}

const lastPipeline = (): Pipeline => worker.run.mock.calls.at(-1)?.[2] as Pipeline

const apply = () => screen.getByRole('button', { name: /^Apply/ })

beforeEach(() => {
  vi.clearAllMocks()
  worker.run.mockImplementation((fileName: string) => ({
    id: fileName,
    result: Promise.resolve(outputFor(fileName.replace(/\.\w+$/, '.webp'))),
  }))
})

describe('ImageToolkit — page shape', () => {
  it('offers presets on the home builder, where no feature leads', () => {
    render(<ImageToolkit />)

    expect(screen.getByText('Start from a preset')).toBeInTheDocument()
  })

  it('leads with the page’s own feature on a tool page, with no presets', () => {
    render(<ImageToolkit primary="resize" />)

    expect(screen.getByText('Resize')).toBeInTheDocument()
    expect(screen.queryByText('Start from a preset')).not.toBeInTheDocument()
  })

  it('never offers the primary feature as a checkbox as well', () => {
    render(<ImageToolkit primary="compress" />)

    const checkboxes = screen.getAllByRole('checkbox').map((box) => box.getAttribute('id'))
    expect(checkboxes).not.toContain('feature-compress')
  })

  it('shows the quality the compressor page will use', () => {
    render(<ImageToolkit primary="compress" />)

    expect(screen.getByText('80')).toBeInTheDocument()
  })

  it('asks for something to do when nothing is switched on', async () => {
    render(<ImageToolkit />)
    await addFiles(imageFile('a.png'))

    expect(await screen.findByText('Pick at least one thing to do.')).toBeInTheDocument()
    expect(apply()).toBeDisabled()
  })
})

describe('ImageToolkit — taking files in', () => {
  it('queues an image and previews it', async () => {
    render(<ImageToolkit primary="compress" />)

    await addFiles(imageFile('holiday.png'))

    expect(await screen.findByRole('presentation')).toBeInTheDocument()
    expect(within(screen.getByRole('list')).getByText('holiday.png')).toBeInTheDocument()
  })

  it('says why a file was skipped instead of dropping it in silence', async () => {
    render(<ImageToolkit primary="compress" />)

    await dropFiles(pdfFile('invoice.pdf'))

    expect(await screen.findByText(/invoice\.pdf does not look like an image/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('keeps the good files from a mixed selection', async () => {
    render(<ImageToolkit primary="compress" />)

    await dropFiles(imageFile('good.png'), pdfFile())

    expect(within(await screen.findByRole('list')).getByText('good.png')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled()
  })

  it('previews the first file and says which of how many it is', async () => {
    render(<ImageToolkit primary="compress" />)

    await addFiles(imageFile('first.png'), imageFile('second.png'), imageFile('third.png'))

    expect(await screen.findByText('Previewing first.png — first of 3')).toBeInTheDocument()
  })

  it('offers to apply to the whole batch once there is more than one', async () => {
    render(<ImageToolkit primary="compress" />)

    await addFiles(imageFile('a.png'), imageFile('b.png'), imageFile('c.png'))

    expect(await screen.findByRole('button', { name: 'Apply to all 3' })).toBeInTheDocument()
  })

  it('clears the batch and the skipped notice together', async () => {
    render(<ImageToolkit primary="compress" />)
    await dropFiles(imageFile('a.png'), pdfFile())
    await screen.findByRole('list')

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText(/does not look like an image/)).not.toBeInTheDocument()
  })
})

describe('ImageToolkit — running the batch', () => {
  it('runs every queued file and reports the totals', async () => {
    render(<ImageToolkit primary="compress" />)
    await addFiles(imageFile('a.png'), imageFile('b.png'))

    await userEvent.click(await screen.findByRole('button', { name: 'Apply to all 2' }))

    expect(await screen.findByText('2 done')).toBeInTheDocument()
    expect(worker.run).toHaveBeenCalledTimes(2)
  })

  it('sends the engine only the features that are switched on', async () => {
    render(<ImageToolkit primary="compress" />)
    await addFiles(imageFile('a.png'))

    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(worker.run).toHaveBeenCalled())
    // Compression alone: quality applies, and the source format is kept.
    expect(lastPipeline()).toEqual({ transforms: [], output: { format: 'source', quality: 80 } })
  })

  it('keeps the source format unless convert is ticked', async () => {
    render(<ImageToolkit primary="crop" />)
    await addFiles(imageFile('a.png'))
    await loadPreview()

    await userEvent.click(screen.getByLabelText(/Convert format/i))
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(worker.run).toHaveBeenCalled())
    expect(lastPipeline().output.format).toBe('webp')
  })

  it('carries on after a file fails, and shows the reason on that file', async () => {
    worker.run.mockImplementation((fileName: string) =>
      fileName === 'bad.png'
        ? { id: fileName, result: Promise.reject(pipelineError('DECODE_FAILED')) }
        : { id: fileName, result: Promise.resolve(outputFor('good.webp')) },
    )
    render(<ImageToolkit primary="compress" />)
    await addFiles(imageFile('bad.png'), imageFile('good.png'))

    await userEvent.click(await screen.findByRole('button', { name: 'Apply to all 2' }))

    expect(await screen.findByText('1 done, 1 failed')).toBeInTheDocument()
    expect(screen.getByText(/couldn't be read/)).toBeInTheDocument()
  })

  it('renders something useful even when the worker rejects with a bare error', async () => {
    worker.run.mockImplementation((fileName: string) => ({
      id: fileName,
      result: Promise.reject(new Error('kaboom')),
    }))
    render(<ImageToolkit primary="compress" />)
    await addFiles(imageFile('a.png'))

    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }))

    expect(await screen.findByText(/Something went wrong while editing/)).toBeInTheDocument()
  })

  it('offers a zip only once more than one file has finished', async () => {
    render(<ImageToolkit primary="compress" />)
    await addFiles(imageFile('a.png'))
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }))
    await screen.findByText('1 done')

    expect(screen.queryByRole('button', { name: /as \.zip/ })).not.toBeInTheDocument()
  })

  it('zips a finished batch on request', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<ImageToolkit primary="compress" />)
    await addFiles(imageFile('a.png'), imageFile('b.png'))
    await userEvent.click(await screen.findByRole('button', { name: 'Apply to all 2' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Download all (2) as .zip' }))

    await waitFor(() => expect(click).toHaveBeenCalled())
    click.mockRestore()
  })

  it('downloads a single finished file on its own', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<ImageToolkit primary="compress" />)
    await addFiles(imageFile('a.png'))
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Download' }))

    expect(click).toHaveBeenCalledTimes(1)
    click.mockRestore()
  })

  it('releases the worker when the page goes away', () => {
    const { unmount } = render(<ImageToolkit primary="compress" />)

    unmount()

    expect(worker.dispose).toHaveBeenCalledTimes(1)
  })
})

describe('ImageToolkit — orientation and crop', () => {
  it('shows rotate and flip as buttons on the rotate page', () => {
    render(<ImageToolkit primary="rotate" />)

    for (const label of ['Rotate left', 'Rotate right', 'Flip horizontally', 'Flip vertically']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('turns the preview as the user turns the image', async () => {
    render(<ImageToolkit primary="rotate" />)
    await addFiles(imageFile('a.png'))
    await loadPreview()

    await userEvent.click(screen.getByRole('button', { name: 'Rotate right' }))

    expect(await screen.findByRole('presentation')).toHaveStyle({
      transform: 'translate(-50%, -50%) rotate(90deg) scale(1, 1)',
    })
  })

  it('sends the turn to the engine as a rotate transform', async () => {
    render(<ImageToolkit primary="rotate" />)
    await addFiles(imageFile('a.png'))
    await loadPreview()
    await userEvent.click(screen.getByRole('button', { name: 'Rotate left' }))

    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(worker.run).toHaveBeenCalled())
    expect(lastPipeline().transforms).toContainEqual({
      kind: 'rotate',
      degrees: 270,
      flipHorizontal: false,
      flipVertical: false,
    })
  })

  it('moves the crop box with the image when it is turned', async () => {
    // Crop coordinates live in post-rotation space (ADR-0006), so a turn that does
    // not move the box would silently select a different region.
    render(<ImageToolkit primary="crop" />)
    await addFiles(imageFile('a.png'))
    await loadPreview(400, 300)
    await screen.findByTestId('crop-selection')

    await userEvent.click(screen.getByLabelText(/Rotate & flip/i))
    await userEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(worker.run).toHaveBeenCalled())
    // The seeded box is 320x240 at (40,30) in a 400x300 frame. Turned clockwise into
    // a 300x400 frame it becomes 240x320 at (30,40).
    expect(lastPipeline().transforms).toContainEqual({
      kind: 'crop',
      x: 30,
      y: 40,
      width: 240,
      height: 320,
    })
  })

  it('offers aspect ratios on the crop page', async () => {
    render(<ImageToolkit primary="crop" />)
    await addFiles(imageFile('a.png'))

    expect(await screen.findByRole('button', { name: 'Square' })).toBeInTheDocument()
  })

  it('reshapes the box to a ratio once one is chosen', async () => {
    render(<ImageToolkit primary="crop" />)
    await addFiles(imageFile('a.png'))
    await loadPreview(400, 300)
    await screen.findByTestId('crop-selection')

    await userEvent.click(screen.getByRole('button', { name: 'Square' }))
    // The ratio applies on the next commit, so nudge the box to trigger one.
    fireEvent.keyDown(screen.getByTestId('crop-selection'), { key: 'ArrowRight' })
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(worker.run).toHaveBeenCalled())
    const crop = lastPipeline().transforms.find((transform) => transform.kind === 'crop')
    expect(crop).toMatchObject({ width: 240, height: 240 })
  })

  it('warns that a crop drawn on the first image is trimmed for smaller ones', async () => {
    render(<ImageToolkit primary="crop" />)

    await addFiles(imageFile('a.png'), imageFile('b.png'))

    expect(await screen.findByText(/Smaller images are trimmed to fit/)).toBeInTheDocument()
  })

  it('says nothing about mixed sizes for a single image', async () => {
    render(<ImageToolkit primary="crop" />)

    await addFiles(imageFile('a.png'))

    await screen.findByRole('presentation')
    expect(screen.queryByText(/Smaller images are trimmed/)).not.toBeInTheDocument()
  })
})

describe('ImageToolkit — the page’s own preset', () => {
  it('converts to the format its page is named after, not a default', async () => {
    // Regression: every conversion page shared one builder default, so png-to-jpg
    // quietly produced WebP — the page ranked for one thing and did another.
    render(<ImageToolkit primary="convert" preset={tool('png-to-jpg').preset} />)
    await addFiles(imageFile('logo.png'))

    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(worker.run).toHaveBeenCalled())
    expect(lastPipeline().output.format).toBe('jpeg')
  })

  it('lets the visitor pick a different format without leaving the page', async () => {
    render(<ImageToolkit primary="convert" preset={tool('png-to-jpg').preset} />)
    await addFiles(imageFile('logo.png'))

    await userEvent.selectOptions(screen.getByLabelText('Format'), 'webp')
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(worker.run).toHaveBeenCalled())
    expect(lastPipeline().output.format).toBe('webp')
  })

  it('opens the compressor on the quality its preset asks for, and lets it be changed', async () => {
    render(<ImageToolkit primary="compress" preset={tool('compress-image').preset} />)
    await addFiles(imageFile('a.png'))

    const slider = screen.getByRole('slider')
    expect(slider).toHaveValue('75')

    fireEvent.change(slider, { target: { value: '40' } })
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(worker.run).toHaveBeenCalled())
    expect(lastPipeline().output.quality).toBe(40)
  })

  it('applies the transforms its preset lists', async () => {
    render(<ImageToolkit primary="resize" preset={tool('resize-image').preset} />)
    await addFiles(imageFile('a.png'))

    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(worker.run).toHaveBeenCalled())
    // Every tool preset asks for EXIF to be stripped; that has to reach the engine.
    expect(lastPipeline().transforms).toContainEqual({ kind: 'metadata', stripExif: true })
  })
})

describe('ImageToolkit — warnings that depend on the files', () => {
  it('warns before a conversion that would flatten transparency', async () => {
    render(<ImageToolkit primary="convert" />)
    await addFiles(imageFile('logo.png'))
    await screen.findByRole('list')

    await userEvent.selectOptions(screen.getByLabelText('Format'), 'jpeg')

    expect(await screen.findByText(/does not support transparency/)).toBeInTheDocument()
  })

  it('stays quiet for a conversion that keeps transparency', async () => {
    render(<ImageToolkit primary="convert" />)
    await addFiles(imageFile('logo.png'))
    await screen.findByRole('list')

    expect(screen.queryByText(/does not support transparency/)).not.toBeInTheDocument()
  })

  it('explains that quality does nothing to a lossless file', async () => {
    render(<ImageToolkit primary="compress" />)

    await addFiles(imageFile('diagram.png'))

    expect(await screen.findByText(/These files stay lossless/)).toBeInTheDocument()
  })

  it('says nothing of the sort for a JPEG', async () => {
    render(<ImageToolkit primary="compress" />)

    await addFiles(imageFile('photo.jpg', 'jpeg'))

    await screen.findByRole('list')
    expect(screen.queryByText(/stay lossless/)).not.toBeInTheDocument()
  })
})

describe('ImageToolkit — presets', () => {
  it('applies a preset to the builder', async () => {
    render(<ImageToolkit />)
    await addFiles(imageFile('a.png'))

    await userEvent.click(screen.getByRole('button', { name: /For a web page/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(worker.run).toHaveBeenCalled())
    expect(lastPipeline().transforms.some((transform) => transform.kind === 'resize')).toBe(true)
  })
})
