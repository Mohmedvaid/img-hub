import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CropTransform } from '@/lib/pipeline/operations/crop'
import type { Orientation } from '@/lib/ui/orientation'
import { UPRIGHT } from '@/lib/ui/orientation'
import { ImagePreview } from './ImagePreview'

const file = new File([new Uint8Array([1])], 'holiday.jpg', { type: 'image/jpeg' })

const crop = (overrides: Partial<CropTransform> = {}): CropTransform => ({
  kind: 'crop',
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  ...overrides,
})

/**
 * jsdom never fetches the image, so its dimensions have to be supplied and the load
 * event fired by hand. Everything downstream — frame, scale, crop seeding — is the
 * component's own work.
 */
function loadImage(width: number, height: number): HTMLImageElement {
  const image = document.querySelector('img') as HTMLImageElement
  Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true })
  Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true })
  fireEvent.load(image)
  return image
}

/** The box the preview sizes to the oriented frame. The image is its only child. */
function frameBox(): HTMLElement {
  const parent = document.querySelector('img')?.parentElement
  if (!parent) throw new Error('preview has not rendered an image')
  return parent
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ImagePreview', () => {
  it('shows the picked file straight away, before its dimensions are known', () => {
    render(<ImagePreview file={file} orientation={UPRIGHT} />)

    expect(document.querySelector('img')).toBeInTheDocument()
  })

  it('reports the source dimensions once the image has loaded', () => {
    const onSourceLoad = vi.fn()
    render(<ImagePreview file={file} orientation={UPRIGHT} onSourceLoad={onSourceLoad} />)

    loadImage(400, 300)

    expect(onSourceLoad).toHaveBeenCalledWith({ width: 400, height: 300 })
  })

  it.each<[string, Orientation, string]>([
    ['a quarter turn', { rotation: 90, mirrored: false }, 'rotate(90deg) scale(1, 1)'],
    ['a mirror', { rotation: 0, mirrored: true }, 'rotate(0deg) scale(-1, 1)'],
    ['both at once', { rotation: 180, mirrored: true }, 'rotate(180deg) scale(-1, 1)'],
  ])('previews %s with the same transform the engine will apply', (_, orientation, expected) => {
    render(<ImagePreview file={file} orientation={orientation} />)
    const image = loadImage(400, 300)

    expect(image.style.transform).toBe(`translate(-50%, -50%) ${expected}`)
  })

  it('swaps the frame dimensions for a quarter turn', () => {
    render(<ImagePreview file={file} orientation={{ rotation: 90, mirrored: false }} />)
    loadImage(400, 300)

    // A 400x300 image turned on its side occupies 300x400.
    expect(frameBox()).toHaveStyle({ width: '300px', height: '400px' })
  })

  it('scales an oversized image down to fit rather than overflowing', () => {
    render(<ImagePreview file={file} orientation={UPRIGHT} />)
    loadImage(2000, 1000)

    // 460px is the cap on either axis; the width follows from the aspect ratio.
    expect(frameBox()).toHaveStyle({ width: '460px', height: '230px' })
  })

  it('captions the preview when told to', () => {
    render(<ImagePreview file={file} orientation={UPRIGHT} caption="first of 12" />)

    expect(screen.getByText('first of 12')).toBeInTheDocument()
  })

  it('shows no crop selection when cropping is off', () => {
    render(<ImagePreview file={file} orientation={UPRIGHT} />)
    loadImage(400, 300)

    expect(screen.queryByTestId('crop-selection')).not.toBeInTheDocument()
  })

  it('seeds a usable crop box once the dimensions arrive', () => {
    const onChange = vi.fn()
    render(<ImagePreview file={file} orientation={UPRIGHT} crop={{ value: crop(), onChange }} />)

    loadImage(400, 300)

    // 80% of the frame, centred — not the zero-size default the operation starts with.
    expect(onChange).toHaveBeenCalledWith({ kind: 'crop', x: 40, y: 30, width: 320, height: 240 })
  })

  it('seeds the box against the rotated frame, not the source', () => {
    const onChange = vi.fn()
    render(
      <ImagePreview
        file={file}
        orientation={{ rotation: 90, mirrored: false }}
        crop={{ value: crop(), onChange }}
      />,
    )

    loadImage(400, 300)

    expect(onChange).toHaveBeenCalledWith({ kind: 'crop', x: 30, y: 40, width: 240, height: 320 })
  })

  it('draws the selection once the box has a size', () => {
    render(
      <ImagePreview
        file={file}
        orientation={UPRIGHT}
        crop={{ value: crop({ width: 100, height: 80 }), onChange: vi.fn() }}
      />,
    )
    loadImage(400, 300)

    expect(screen.getByTestId('crop-selection')).toBeInTheDocument()
  })

  it('keeps a dragged selection inside the image', () => {
    const onChange = vi.fn()
    render(
      <ImagePreview
        file={file}
        orientation={UPRIGHT}
        crop={{ value: crop({ x: 300, y: 200, width: 100, height: 100 }), onChange }}
      />,
    )
    loadImage(400, 300)
    onChange.mockClear()

    fireEvent.pointerDown(screen.getByTestId('crop-selection'), { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 500, clientY: 500 })

    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'crop',
      x: 300,
      y: 200,
      width: 100,
      height: 100,
    })
  })

  it('reshapes a dragged selection to the chosen ratio', () => {
    const onChange = vi.fn()
    render(
      <ImagePreview
        file={file}
        orientation={UPRIGHT}
        crop={{ value: crop({ x: 0, y: 0, width: 200, height: 100 }), onChange, ratio: 1 }}
      />,
    )
    loadImage(400, 300)
    onChange.mockClear()

    fireEvent.pointerDown(screen.getByTestId('crop-selection'), { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 0 })

    // Squared off around the same centre, so the box shrinks rather than moving.
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'crop',
      x: 60,
      y: 0,
      width: 100,
      height: 100,
    })
  })

  it('releases the object URL when the file is replaced', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const { rerender } = render(<ImagePreview file={file} orientation={UPRIGHT} />)

    rerender(
      <ImagePreview
        file={new File([new Uint8Array([2])], 'other.png', { type: 'image/png' })}
        orientation={UPRIGHT}
      />,
    )

    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it('releases the object URL on unmount', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const { unmount } = render(<ImagePreview file={file} orientation={UPRIGHT} />)

    unmount()

    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it('forgets the previous file’s dimensions so no frame is drawn with the wrong geometry', () => {
    const { rerender } = render(<ImagePreview file={file} orientation={UPRIGHT} />)
    loadImage(400, 300)
    expect(frameBox()).toHaveStyle({ width: '400px' })

    rerender(
      <ImagePreview
        file={new File([new Uint8Array([2])], 'other.png', { type: 'image/png' })}
        orientation={UPRIGHT}
      />,
    )

    expect(frameBox()).not.toHaveStyle({ width: '400px' })
  })
})
