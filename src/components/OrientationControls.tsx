'use client'

import type { Orientation } from '@/lib/ui/orientation'
import {
  flipHorizontal,
  flipVertical,
  isUpright,
  rotateLeft,
  rotateRight,
  UPRIGHT,
} from '@/lib/ui/orientation'

type OrientationControlsProps = {
  orientation: Orientation
  onChange: (next: Orientation) => void
}

/**
 * Rotate and flip as buttons rather than an angle picker.
 *
 * Everyone in this category does it this way, and for good reason: "turn it left" is
 * how people think about a sideways photo. Absolute 0/90/180/270 buttons ask the user
 * to work out the angle themselves.
 *
 * All four are momentary actions with no pressed state, deliberately. In canonical
 * form there is no separate "flipped vertically" bit — a vertical flip is a mirror
 * plus a half turn — so lighting up one flip button and not the other would report a
 * state that does not exist. The preview is the feedback; a reset appears once there
 * is something to undo.
 */
export function OrientationControls({ orientation, onChange }: OrientationControlsProps) {
  const actions = [
    { label: 'Rotate left', glyph: '↺', apply: rotateLeft },
    { label: 'Rotate right', glyph: '↻', apply: rotateRight },
    { label: 'Flip horizontally', glyph: '⇄', apply: flipHorizontal },
    { label: 'Flip vertically', glyph: '⇅', apply: flipVertical },
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            aria-label={action.label}
            title={action.label}
            onClick={() => onChange(action.apply(orientation))}
            className="flex-1 rounded-[--radius-sm] border border-border bg-bg-raised py-2 text-fg-primary text-lg leading-none transition-colors hover:border-brand hover:bg-bg-sunken"
          >
            {action.glyph}
          </button>
        ))}
      </div>

      {!isUpright(orientation) ? (
        <button
          type="button"
          onClick={() => onChange(UPRIGHT)}
          className="self-start text-fg-muted text-xs underline underline-offset-2 hover:text-fg-primary"
        >
          Reset orientation
        </button>
      ) : null}
    </div>
  )
}
