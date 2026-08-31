import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `site` reads its env once at module load, so each case reloads the module tree.
 * Both branches matter: the empty one is what makes the privacy policy's claim that
 * this site runs no third-party scripts literally true.
 */
async function renderWith(token: string | undefined) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_ANALYTICS_TOKEN', token as string)
  const { Analytics } = await import('./Analytics')
  return render(<Analytics />)
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('Analytics', () => {
  it('renders nothing at all when no token is configured', async () => {
    const { container } = await renderWith(undefined)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a token that is only whitespace', async () => {
    const { container } = await renderWith('   ')
    expect(container).toBeEmptyDOMElement()
  })

  it('loads the beacon from the host the CSP allows', async () => {
    const { container } = await renderWith('abc123')
    const script = container.querySelector('script')

    expect(script).toHaveAttribute('src', 'https://static.cloudflareinsights.com/beacon.min.js')
  })

  it('defers the beacon so it never blocks first paint', async () => {
    const { container } = await renderWith('abc123')
    expect(container.querySelector('script')).toHaveAttribute('defer')
  })

  it('passes the token in the shape Cloudflare expects', async () => {
    const { container } = await renderWith('abc123')
    const beacon = container.querySelector('script')?.getAttribute('data-cf-beacon')

    expect(JSON.parse(beacon ?? '{}')).toEqual({ token: 'abc123' })
  })
})
