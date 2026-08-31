import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UPRIGHT } from '@/lib/ui/orientation'
import { OrientationControls } from './OrientationControls'

describe('OrientationControls', () => {
  it('offers rotate and flip as buttons, not an angle picker', () => {
    render(<OrientationControls orientation={UPRIGHT} onChange={() => {}} />)

    for (const label of ['Rotate left', 'Rotate right', 'Flip horizontally', 'Flip vertically']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('rotates right by a quarter turn', async () => {
    const onChange = vi.fn()
    render(<OrientationControls orientation={UPRIGHT} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Rotate right' }))

    expect(onChange).toHaveBeenCalledWith({ rotation: 90, mirrored: false })
  })

  it('turns a mirrored image clockwise on screen, like an unmirrored one', async () => {
    const onChange = vi.fn()
    render(
      <OrientationControls orientation={{ rotation: 0, mirrored: true }} onChange={onChange} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Rotate right' }))

    // Every click acts on what is on screen, so being mirrored changes nothing about
    // which way "right" is.
    expect(onChange).toHaveBeenCalledWith({ rotation: 90, mirrored: true })
  })

  it('mirrors the axis the user is looking at on a turned image', async () => {
    const onChange = vi.fn()
    render(
      <OrientationControls orientation={{ rotation: 90, mirrored: false }} onChange={onChange} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Flip horizontally' }))

    expect(onChange).toHaveBeenCalledWith({ rotation: 270, mirrored: true })
  })

  it('mirrors on a horizontal flip', async () => {
    const onChange = vi.fn()
    render(<OrientationControls orientation={UPRIGHT} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Flip horizontally' }))

    expect(onChange).toHaveBeenCalledWith({ rotation: 0, mirrored: true })
  })

  it('treats a vertical flip as a mirror plus a half turn', async () => {
    const onChange = vi.fn()
    render(<OrientationControls orientation={UPRIGHT} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Flip vertically' }))

    expect(onChange).toHaveBeenCalledWith({ rotation: 180, mirrored: true })
  })

  it('hides reset while the image is already upright', () => {
    render(<OrientationControls orientation={UPRIGHT} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
  })

  it('offers reset once there is something to undo', async () => {
    const onChange = vi.fn()
    render(
      <OrientationControls orientation={{ rotation: 90, mirrored: true }} onChange={onChange} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /reset/i }))

    expect(onChange).toHaveBeenCalledWith(UPRIGHT)
  })

  it('shows no pressed state, because canonical form has no flipV bit to report', () => {
    render(
      <OrientationControls orientation={{ rotation: 180, mirrored: true }} onChange={() => {}} />,
    )

    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toHaveAttribute('aria-pressed', 'true')
    }
  })
})
