import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Frame, Rect } from '@/lib/ui/cropGeometry'
import { CropOverlay } from './CropOverlay'

const frame: Frame = { width: 400, height: 300 }
const rect: Rect = { x: 100, y: 50, width: 200, height: 150 }

function setup(scale = 1, overrides: Partial<Rect> = {}) {
  const onChange = vi.fn()
  render(
    <CropOverlay
      frame={frame}
      rect={{ ...rect, ...overrides }}
      scale={scale}
      onChange={onChange}
    />,
  )
  return { onChange, selection: screen.getByTestId('crop-selection') }
}

/** One press-move-release, in client pixels. */
function drag(target: Element, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(target, { clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1] })
}

describe('CropOverlay', () => {
  it('states the selected size against the whole frame', () => {
    setup()
    expect(screen.getByText('200 × 150 of 400 × 300')).toBeInTheDocument()
  })

  it('positions the selection in display pixels, not image pixels', () => {
    const { selection } = setup(0.5)

    expect(selection).toHaveStyle({ left: '50px', top: '25px', width: '100px', height: '75px' })
  })

  it('describes itself and how to move it, for anyone not using a pointer', () => {
    setup()
    expect(screen.getByRole('application')).toHaveAccessibleName(
      'Crop area, 200 by 150 pixels. Arrow keys move it, shift for larger steps.',
    )
  })

  it('nudges by one pixel per arrow press', () => {
    const { onChange } = setup()

    fireEvent.keyDown(screen.getByRole('application'), { key: 'ArrowRight' })

    expect(onChange).toHaveBeenCalledWith({ x: 101, y: 50, width: 200, height: 150 })
  })

  it('nudges by ten with shift held', () => {
    const { onChange } = setup()

    fireEvent.keyDown(screen.getByRole('application'), { key: 'ArrowDown', shiftKey: true })

    expect(onChange).toHaveBeenCalledWith({ x: 100, y: 60, width: 200, height: 150 })
  })

  it.each([
    ['ArrowLeft', { x: 99, y: 50 }],
    ['ArrowUp', { x: 100, y: 49 }],
  ])('moves the right way for %s', (key, expected) => {
    const { onChange } = setup()

    fireEvent.keyDown(screen.getByRole('application'), { key })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining(expected))
  })

  it('leaves keys it does not own to the page', () => {
    const { onChange } = setup()

    fireEvent.keyDown(screen.getByRole('application'), { key: 'Tab' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('moves the selection with the pointer', () => {
    const { onChange, selection } = setup()

    drag(selection, [0, 0], [30, 20])

    expect(onChange).toHaveBeenLastCalledWith({ x: 130, y: 70, width: 200, height: 150 })
  })

  it('converts pointer movement back into image pixels at the display scale', () => {
    // Half-size preview: 30 display pixels is 60 image pixels.
    const { onChange, selection } = setup(0.5)

    drag(selection, [0, 0], [30, 20])

    expect(onChange).toHaveBeenLastCalledWith({ x: 160, y: 90, width: 200, height: 150 })
  })

  it('grows the box from a south-east handle without moving its origin', () => {
    const { onChange } = setup()

    drag(screen.getByRole('button', { name: 'Resize from se' }), [0, 0], [40, 30])

    expect(onChange).toHaveBeenLastCalledWith({ x: 100, y: 50, width: 240, height: 180 })
  })

  it('moves the origin when resizing from a north-west handle', () => {
    const { onChange } = setup()

    drag(screen.getByRole('button', { name: 'Resize from nw' }), [0, 0], [40, 30])

    expect(onChange).toHaveBeenLastCalledWith({ x: 140, y: 80, width: 160, height: 120 })
  })

  it('refuses a resize that would shrink the box past grabbing size', () => {
    const { onChange } = setup(1, { width: 20, height: 20 })

    drag(screen.getByRole('button', { name: 'Resize from se' }), [0, 0], [-15, -15])

    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not start a drag from a handle and the box at once', () => {
    // The handle sits inside the box, so without stopPropagation a corner grab would
    // register as a move as well.
    const { onChange } = setup()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Resize from ne' }), {
      clientX: 0,
      clientY: 0,
    })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 10 })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ x: 100, y: 60, width: 210, height: 140 })
  })

  it('stops following the pointer once it is released', () => {
    const { onChange, selection } = setup()
    drag(selection, [0, 0], [30, 20])
    onChange.mockClear()

    fireEvent.pointerUp(window)
    fireEvent.pointerMove(window, { clientX: 90, clientY: 90 })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops following when the pointer is cancelled, not only released', () => {
    const { onChange, selection } = setup()
    drag(selection, [0, 0], [30, 20])
    onChange.mockClear()

    fireEvent.pointerCancel(window)
    fireEvent.pointerMove(window, { clientX: 90, clientY: 90 })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores pointer movement when nothing is being dragged', () => {
    const { onChange } = setup()

    fireEvent.pointerMove(window, { clientX: 90, clientY: 90 })

    expect(onChange).not.toHaveBeenCalled()
  })
})
