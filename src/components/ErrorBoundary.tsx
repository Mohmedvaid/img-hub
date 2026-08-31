'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  /** Named in the fallback so a user can say which part broke. */
  label: string
  children: ReactNode
}

type ErrorBoundaryState = { failed: boolean }

/**
 * One boundary per surface, not per component.
 *
 * The point is that a render failure in the results list leaves the builder usable,
 * and vice versa. Wrapping every component instead would fragment the page into
 * dozens of independently-broken pieces, which is harder to reason about than one
 * clearly broken half.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Deliberately not sent anywhere. Error text can contain file names, and the
    // promise on every page is that nothing about a user's images leaves the device.
    console.error(`[${this.props.label}]`, error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children

    return (
      <div className="rounded-[--radius-md] border border-danger bg-danger-subtle p-4">
        <p className="font-medium text-fg-primary text-sm">
          Something broke in the {this.props.label}.
        </p>
        <p className="mt-1 text-fg-secondary text-xs">
          Your other work is unaffected. Reloading the page will clear this.
        </p>
        <button
          type="button"
          onClick={() => this.setState({ failed: false })}
          className="mt-3 rounded-[--radius-sm] border border-border bg-bg-raised px-3 py-1.5 font-medium text-fg-primary text-xs"
        >
          Try again
        </button>
      </div>
    )
  }
}
