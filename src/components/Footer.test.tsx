import { brand } from '@config/brand'
import { legalPages } from '@config/legal'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Footer } from './Footer'

describe('Footer', () => {
  it('links every legal page, so none is reachable only by typing the URL', () => {
    render(<Footer />)

    for (const page of legalPages) {
      expect(screen.getByRole('link', { name: page.title })).toHaveAttribute(
        'href',
        `/${page.slug}`,
      )
    }
  })

  it('links back to the builder', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'All tools' })).toHaveAttribute('href', '/')
  })

  it('names the legal entity and the current year', () => {
    render(<Footer />)

    expect(
      screen.getByText(new RegExp(`${new Date().getFullYear()} ${brand.legalEntity}`)),
    ).toBeInTheDocument()
  })

  it('renders no social links while every handle in config is empty', () => {
    // All three are blank today. A footer full of dead links is worse than no links.
    expect(Object.values(brand.social).every((handle) => handle.length === 0)).toBe(true)

    render(<Footer />)

    const links = within(screen.getByRole('navigation')).getAllByRole('link')
    expect(links).toHaveLength(legalPages.length + 1)
  })
})
