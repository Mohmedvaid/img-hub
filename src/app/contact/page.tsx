import { brand } from '@config/brand'
import { findLegalPage } from '@config/legal'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buildMetadata } from '@/lib/seo/metadata'

const page = findLegalPage('contact')
if (!page) throw new Error('the contact page is missing from config/legal.ts')

export const metadata = buildMetadata({
  title: page.metaTitle,
  description: page.metaDescription,
  path: '/contact',
  indexable: page.indexable,
})

/**
 * One email address, no form.
 *
 * A contact form on a site with no server would need a third-party handler, which
 * means another script, another entry in the CSP, and another party receiving what
 * people write. A mailto costs none of that and reaches the same inbox.
 */
export default function ContactPage() {
  const entry = findLegalPage('contact')
  if (!entry) notFound()

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-semibold text-2xl text-fg-primary tracking-tight sm:text-3xl">
        {entry.title}
      </h1>

      <div className="mt-6 flex flex-col gap-5 text-fg-secondary leading-relaxed">
        <p>
          Email{' '}
          <a
            href={`mailto:${brand.supportEmail}`}
            className="text-brand underline underline-offset-2"
          >
            {brand.supportEmail}
          </a>
          . It reaches a person, not a ticket queue, and it is the only way to get in touch.
        </p>

        <h2 className="mt-4 font-medium text-fg-primary text-lg">What is worth sending</h2>

        <p>
          <span className="font-medium text-fg-primary">A file that would not work.</span> The most
          useful report names the format, roughly how large the file was, what you asked{' '}
          {brand.name} to do, and what happened instead. Since nothing is uploaded, nobody here can
          see the file that failed, so those details are all there is to go on.
        </p>

        <p>
          <span className="font-medium text-fg-primary">A format or tool that is missing.</span> Say
          what you were trying to do and what you would have used it for. Requests that come with a
          real task attached get built first.
        </p>

        <p>
          <span className="font-medium text-fg-primary">Anything about privacy.</span> Questions
          about what is and is not collected are answered in the{' '}
          <Link href="/privacy" className="text-brand underline underline-offset-2">
            privacy policy
          </Link>
          , and anything it does not cover can be asked directly.
        </p>

        <h2 className="mt-4 font-medium text-fg-primary text-lg">What cannot be helped with</h2>

        <p>
          Recovering an image you already processed. Everything happens on your device and nothing
          is stored anywhere, so there is no copy to retrieve — not on a server, and not in this
          browser once the tab is closed. Keep your originals until you are happy with the result.
        </p>
      </div>
    </main>
  )
}
