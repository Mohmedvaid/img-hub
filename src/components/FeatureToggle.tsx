'use client'

import type { ReactNode } from 'react'
import type { FeatureInfo } from '@/lib/pipeline/features'

type FeatureToggleProps = {
  feature: FeatureInfo
  enabled: boolean
  onToggle: (enabled: boolean) => void
  children?: ReactNode
}

/**
 * One optional feature: a checkbox that reveals its fields when ticked.
 *
 * A feature with `hasFields: false` renders the checkbox alone — ticking it IS the
 * whole interaction. Compression is the motivating case.
 */
export function FeatureToggle({ feature, enabled, onToggle, children }: FeatureToggleProps) {
  return (
    <div className="rounded-[--radius-md] border border-border bg-bg-raised">
      <label className="flex cursor-pointer items-start gap-3 p-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onToggle(event.target.checked)}
          className="mt-0.5 size-4 accent-[--color-brand]"
        />
        <span className="flex-1">
          <span className="block font-medium text-fg-primary text-sm">{feature.label}</span>
          <span className="block text-fg-muted text-xs">{feature.hint}</span>
        </span>
      </label>

      {enabled && feature.hasFields && children ? (
        <div className="border-border border-t px-3 py-3">{children}</div>
      ) : null}
    </div>
  )
}
