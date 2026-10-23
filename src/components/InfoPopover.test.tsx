import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { InfoPopover, InfoRow } from './InfoPopover'

function renderPopover() {
  return render(
    <div>
      <InfoPopover title="What these widths are for">
        <InfoRow term="2048px">Shopify’s recommended product photo.</InfoRow>
      </InfoPopover>
      <button type="button">Elsewhere</button>
    </div>,
  )
}

const trigger = () => screen.getByRole('button', { name: 'What these widths are for' })

describe('InfoPopover', () => {
  it('keeps the explanation out of the way until it is asked for', () => {
    renderPopover()

    expect(screen.queryByText(/recommended product photo/)).not.toBeInTheDocument()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the explanation on click', async () => {
    renderPopover()
    await userEvent.click(trigger())

    expect(screen.getByText(/recommended product photo/)).toBeInTheDocument()
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes again on a second click', async () => {
    renderPopover()
    await userEvent.click(trigger())
    await userEvent.click(trigger())

    expect(screen.queryByText(/recommended product photo/)).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    renderPopover()
    await userEvent.click(trigger())
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByText(/recommended product photo/)).not.toBeInTheDocument()
  })

  it('closes when something else on the page is clicked', async () => {
    renderPopover()
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))

    expect(screen.queryByText(/recommended product photo/)).not.toBeInTheDocument()
  })

  it('stays open while its own content is clicked, since it is there to be read', async () => {
    renderPopover()
    await userEvent.click(trigger())
    await userEvent.click(screen.getByText(/recommended product photo/))

    expect(screen.getByText(/recommended product photo/)).toBeInTheDocument()
  })

  it('names the control for anyone who cannot see the icon', () => {
    renderPopover()

    expect(trigger()).toHaveAccessibleName('What these widths are for')
  })
})

describe('InfoRow', () => {
  it('reads as the term followed by what it is for', () => {
    render(<InfoRow term="400px">Thumbnails and cart rows.</InfoRow>)

    expect(screen.getByText('400px')).toBeInTheDocument()
    expect(screen.getByText(/Thumbnails and cart rows/)).toBeInTheDocument()
  })
})
