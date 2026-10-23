'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

type InfoPopoverProps = {
  /** What the button announces, e.g. 'What the presets do'. Also the panel heading. */
  title: string
  children: ReactNode
}

/**
 * A small "i" button that reveals an explanation on click.
 *
 * It exists so a row of controls can be short. Six presets each carrying a line of
 * prose is a wall of text in a 20rem column, and the prose is read once and never
 * again — but it has to be reachable, because "1024" tells a first-time visitor
 * nothing. The button is the compromise: the controls stay terse, the explanation is
 * one click away.
 *
 * Not a tooltip. Hover does not exist on a phone, and the content here is a list
 * rather than a label, so it needs to stay open while it is read.
 */
export function InfoPopover({ title, children }: InfoPopoverProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Escape and a click elsewhere both close it. A panel that can only be closed by
  // finding the same small button again is a panel people leave open.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (target instanceof Node && containerRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={title}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex size-5 items-center justify-center rounded-full border font-semibold text-[11px] leading-none transition-colors ${
          open
            ? 'border-brand bg-brand text-brand-fg'
            : 'border-border text-fg-muted hover:border-border-strong hover:text-fg-secondary'
        }`}
      >
        i
      </button>

      {open ? (
        // Right-aligned and absolutely positioned: the button sits at the top right of
        // a narrow column, so a panel growing rightwards would leave the page.
        <div className="absolute right-0 z-10 mt-1.5 w-64 rounded-[--radius-md] border border-border bg-bg-raised p-3 shadow-lg">
          <p className="mb-2 font-medium text-fg-primary text-xs">{title}</p>
          {children}
        </div>
      ) : null}
    </div>
  )
}

/**
 * One row of an info panel: the control's own label, then what it is for.
 *
 * Shared because both callers show the same shape — the sentence that was taken off
 * a control to make it small, put back beside the control's name.
 *
 * The term runs inline rather than in a fixed column: the terms here range from
 * `400px` to `Strip location data`, and a column wide enough for the longest wastes
 * most of a 16rem panel on the shortest.
 */
export function InfoRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <p className="py-1 text-fg-secondary text-xs leading-snug">
      <span className="font-medium text-fg-primary">{term}</span>
      {' — '}
      <span>{children}</span>
    </p>
  )
}
