import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { featureInfo } from '@/lib/pipeline/features'
import { FeatureToggle } from './FeatureToggle'

describe('FeatureToggle', () => {
  it('shows the feature label and its hint', () => {
    render(<FeatureToggle feature={featureInfo('resize')} enabled={false} onToggle={() => {}} />)

    expect(screen.getByText('Resize')).toBeInTheDocument()
    expect(screen.getByText(featureInfo('resize').hint)).toBeInTheDocument()
  })

  it('reports being switched on', async () => {
    const onToggle = vi.fn()
    render(<FeatureToggle feature={featureInfo('resize')} enabled={false} onToggle={onToggle} />)

    await userEvent.click(screen.getByRole('checkbox'))

    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('reports being switched off', async () => {
    const onToggle = vi.fn()
    render(<FeatureToggle feature={featureInfo('resize')} enabled onToggle={onToggle} />)

    await userEvent.click(screen.getByRole('checkbox'))

    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('hides its fields until it is switched on', () => {
    render(
      <FeatureToggle feature={featureInfo('resize')} enabled={false} onToggle={() => {}}>
        <p>width and height</p>
      </FeatureToggle>,
    )

    expect(screen.queryByText('width and height')).not.toBeInTheDocument()
  })

  it('reveals its fields once switched on', () => {
    render(
      <FeatureToggle feature={featureInfo('resize')} enabled onToggle={() => {}}>
        <p>width and height</p>
      </FeatureToggle>,
    )

    expect(screen.getByText('width and height')).toBeInTheDocument()
  })

  it('shows nothing extra for a feature with no fields, even when switched on', () => {
    // Compression is the motivating case: ticking it IS the whole interaction.
    expect(featureInfo('compress').hasFields).toBe(false)

    render(
      <FeatureToggle feature={featureInfo('compress')} enabled onToggle={() => {}}>
        <p>should not appear</p>
      </FeatureToggle>,
    )

    expect(screen.queryByText('should not appear')).not.toBeInTheDocument()
  })
})
