import { findTool, liveTools, type ToolDefinition } from '@config/tools'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { toolContent } from '@/lib/seo/toolContent'
import { ToolPageContent, ToolStructuredData } from './ToolPageContent'

function tool(slug: string): ToolDefinition {
  const found = findTool(slug)
  if (!found) throw new Error(`fixture tool ${slug} is missing from config/tools.ts`)
  return found
}

describe('ToolPageContent', () => {
  it('renders every question and answer the content module produced', () => {
    const subject = tool('png-to-webp')
    render(<ToolPageContent tool={subject} />)

    for (const entry of toolContent(subject).faq) {
      expect(screen.getByText(entry.question)).toBeInTheDocument()
      expect(screen.getByText(entry.answer)).toBeInTheDocument()
    }
  })

  it('links to sibling tools, never to itself', () => {
    const subject = tool('png-to-webp')
    render(<ToolPageContent tool={subject} />)

    const related = within(screen.getByRole('list'))
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))

    expect(related.length).toBeGreaterThan(0)
    expect(related).not.toContain(`/${subject.slug}`)
    expect(related.every((href) => href?.startsWith('/'))).toBe(true)
  })

  it('caps the related list so the page is not a link farm', () => {
    // There are more live tools than the cap, so the cap is what is being tested.
    expect(liveTools().length).toBeGreaterThan(7)

    render(<ToolPageContent tool={tool('png-to-webp')} />)

    expect(within(screen.getByRole('list')).getAllByRole('link').length).toBeLessThanOrEqual(6)
  })

  it('prefers tools sharing a format with this one', () => {
    render(<ToolPageContent tool={tool('png-to-webp')} />)

    const hrefs = within(screen.getByRole('list'))
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))

    expect(hrefs.some((href) => href?.startsWith('/png-to-'))).toBe(true)
  })

  it('points at the full builder for combining tools', () => {
    render(<ToolPageContent tool={tool('png-to-webp')} />)

    expect(screen.getByRole('link', { name: /full builder/i })).toHaveAttribute('href', '/')
  })

  it('offers related tools on a standalone tool page too', () => {
    render(<ToolPageContent tool={tool('compress-image')} />)

    expect(screen.getByText('Related tools')).toBeInTheDocument()
  })
})

describe('ToolStructuredData', () => {
  it('emits FAQPage JSON-LD that matches the visible questions exactly', () => {
    const subject = tool('png-to-jpg')
    const { container } = render(<ToolStructuredData tool={subject} />)

    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()

    const parsed = JSON.parse(script?.textContent ?? '{}')
    expect(parsed['@type']).toBe('FAQPage')

    // Structured data that does not match the page is a manual-action risk, so this
    // asserts equality with the rendered copy rather than merely that it is present.
    expect(parsed.mainEntity).toEqual(
      toolContent(subject).faq.map((entry) => ({
        '@type': 'Question',
        name: entry.question,
        acceptedAnswer: { '@type': 'Answer', text: entry.answer },
      })),
    )
  })
})
