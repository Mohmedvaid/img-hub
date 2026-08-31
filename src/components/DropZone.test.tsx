import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DropZone } from './DropZone'

const file = (name: string, type = 'image/png') => new File([new Uint8Array([1])], name, { type })

describe('DropZone', () => {
  it('invites a drop when empty', () => {
    render(<DropZone onFiles={() => {}} disabled={false} count={0} />)
    expect(screen.getByText(/drop images here/i)).toBeInTheDocument()
  })

  it('reports how many images are queued', () => {
    render(<DropZone onFiles={() => {}} disabled={false} count={3} />)
    expect(screen.getByText(/3 images ready/i)).toBeInTheDocument()
  })

  it('uses the singular for one image', () => {
    render(<DropZone onFiles={() => {}} disabled={false} count={1} />)
    expect(screen.getByText(/1 image ready/i)).toBeInTheDocument()
  })

  it('hands picked files straight through without its own filtering', async () => {
    // Validation happens by reading bytes in intake, not by trusting the browser's
    // guessed MIME type. Filtering here dropped valid files silently.
    const onFiles = vi.fn()
    render(<DropZone onFiles={onFiles} disabled={false} count={0} />)

    const input = document.querySelector('input[type=file]') as HTMLInputElement
    await userEvent.upload(input, [file('a.png'), file('b.jpg', 'image/jpeg')])

    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles.mock.calls[0]?.[0]).toHaveLength(2)
  })

  it('accepts a file the browser reports with no MIME type', async () => {
    const onFiles = vi.fn()
    render(<DropZone onFiles={onFiles} disabled={false} count={0} />)

    const input = document.querySelector('input[type=file]') as HTMLInputElement
    // Common on downloads and on Linux: a real image with an empty type. The picker
    // still offers it because the extension is in `accept`, and sniffing identifies
    // it from there. A MIME-only accept list would have hidden it.
    await userEvent.upload(input, [file('photo.heic', '')])

    expect(onFiles.mock.calls[0]?.[0]).toHaveLength(1)
  })

  it('passes dropped files through even when they are not images', () => {
    // Drag-and-drop ignores `accept`, so anything can land here. Intake explains the
    // rejection rather than the drop zone swallowing it.
    const onFiles = vi.fn()
    render(<DropZone onFiles={onFiles} disabled={false} count={0} />)

    const zone = screen.getByText(/drop images here/i).closest('div') as HTMLElement
    fireEvent.drop(zone, { dataTransfer: { files: [file('notes.txt', 'text/plain')] } })

    expect(onFiles).toHaveBeenCalledTimes(1)
  })

  it('states the privacy promise, which is the product differentiator', () => {
    render(<DropZone onFiles={() => {}} disabled={false} count={0} />)
    expect(screen.getByText(/nothing is uploaded/i)).toBeInTheDocument()
  })

  it('disables the picker while a batch is running', () => {
    render(<DropZone onFiles={() => {}} disabled count={2} />)
    expect(screen.getByRole('button', { name: /choose files/i })).toBeDisabled()
  })
})
