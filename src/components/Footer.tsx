import { brand } from '@config/brand'
import { legalPages } from '@config/legal'
import Link from 'next/link'

/**
 * Site footer. Server-rendered, no JavaScript.
 *
 * Its job is to make the legal pages reachable from every page. A privacy policy
 * nobody can find is the same as not having one, both to a visitor and to an ad
 * network deciding whether this is a real operation.
 *
 * Social links render only for handles that are actually set, so an unused one in
 * config/brand.ts produces nothing rather than a dead link.
 */
export function Footer() {
  const social = Object.entries(brand.social).filter(([, handle]) => handle.length > 0)

  return (
    <footer className="mt-16 border-border border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-fg-muted">
          © {new Date().getFullYear()} {brand.legalEntity}. Everything runs on your device.
        </p>

        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/" className="text-fg-secondary transition-colors hover:text-fg-primary">
            All tools
          </Link>

          {legalPages.map((page) => (
            <Link
              key={page.slug}
              href={`/${page.slug}`}
              className="text-fg-secondary transition-colors hover:text-fg-primary"
            >
              {page.title}
            </Link>
          ))}

          {social.map(([network, handle]) => (
            <a
              key={network}
              href={handle}
              rel="noreferrer"
              className="text-fg-secondary capitalize transition-colors hover:text-fg-primary"
            >
              {network}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
