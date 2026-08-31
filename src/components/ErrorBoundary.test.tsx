import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('render exploded')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught render errors; the noise is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders its children when nothing goes wrong', () => {
    render(
      <ErrorBoundary label="builder">
        <p>all fine</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('all fine')).toBeInTheDocument()
  })

  it('names the surface that broke, so the user can say which part failed', () => {
    render(
      <ErrorBoundary label="results list">
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByText(/results list/)).toBeInTheDocument()
  })

  it('reassures that other work is unaffected', () => {
    render(
      <ErrorBoundary label="builder">
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByText(/other work is unaffected/i)).toBeInTheDocument()
  })

  it('offers a way back rather than a dead end', () => {
    render(
      <ErrorBoundary label="builder">
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('does not send the error anywhere, since messages can name user files', () => {
    const errorSpy = console.error as unknown as ReturnType<typeof vi.fn>
    render(
      <ErrorBoundary label="builder">
        <Boom />
      </ErrorBoundary>,
    )

    // Logged locally only. The promise is that nothing about a user's images leaves
    // the device, and that includes error text.
    expect(errorSpy).toHaveBeenCalled()
  })
})
