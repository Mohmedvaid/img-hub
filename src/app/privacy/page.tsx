import { brand } from '@config/brand'
import { findLegalPage, policyUpdated } from '@config/legal'
import { site } from '@config/site'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buildMetadata } from '@/lib/seo/metadata'

const page = findLegalPage('privacy')
if (!page) throw new Error('the privacy page is missing from config/legal.ts')

export const metadata = buildMetadata({
  title: page.metaTitle,
  description: page.metaDescription,
  path: '/privacy',
  indexable: page.indexable,
})

/**
 * The policy describes what this deployment actually does, not what the project might
 * do one day.
 *
 * The ad and analytics sections render only when their config flags are on, so a
 * build with neither enabled does not claim third parties that are not there. That
 * matters: a policy listing trackers a site does not run is as wrong as one omitting
 * trackers it does. Turning either flag on in config/site.ts updates this page in the
 * same change that adds the script.
 */
export default function PrivacyPage() {
  const entry = findLegalPage('privacy')
  if (!entry) notFound()

  const thirdParties = site.ads.enabled || site.analytics.enabled

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-semibold text-2xl text-fg-primary tracking-tight sm:text-3xl">
        {entry.title}
      </h1>
      <p className="mt-2 text-fg-muted text-sm">Last updated {policyUpdated}</p>

      <div className="mt-6 flex flex-col gap-5 text-fg-secondary leading-relaxed">
        <p>
          Short version: your images are processed on your own device and are never uploaded, so
          there is nothing about them for anyone to store, read or lose.{' '}
          {thirdParties
            ? 'The sections below cover the little that is collected when you load the page.'
            : 'This site sets no cookies and runs no analytics or advertising scripts at all.'}
        </p>

        <h2 className="mt-4 font-medium text-fg-primary text-lg">Your images</h2>

        <p>
          Every operation — decoding, rotating, cropping, resizing, stripping metadata and encoding
          — runs inside your browser, on your own machine. Your files are never sent to {brand.name}{' '}
          or to anyone else. No copy is kept on a server, because no server ever receives one.
        </p>

        <p>
          Nothing is kept in this browser either. {brand.name} sets no cookies and stores nothing in
          local storage; the images you load exist only in the page&rsquo;s memory and are gone when
          you close the tab.
        </p>

        <p>
          This is enforced, not just promised. The site&rsquo;s content security policy permits the
          page to make network connections only back to its own origin
          {site.analytics.enabled ? ' and to its analytics endpoint' : ''}, so it is not capable of
          transmitting your image data anywhere. You can confirm it yourself: open your
          browser&rsquo;s developer tools, watch the network tab, and process a file.
        </p>

        <h2 className="mt-4 font-medium text-fg-primary text-lg">Metadata in your files</h2>

        <p>
          Photos often carry EXIF data including GPS coordinates, camera serial numbers and
          timestamps. {brand.name} can strip that, and the tool pages switch it on by default. That
          processing happens on your device like everything else — the metadata is removed from your
          copy of the file, never read or recorded here.
        </p>

        <h2 className="mt-4 font-medium text-fg-primary text-lg">Server logs</h2>

        <p>
          Loading this site means requesting files from a web server, and that is true of every
          website. The hosting provider handles that request and records standard technical
          information about it, such as your IP address, browser user agent and the time. It is used
          to serve the page and to protect against abuse. It contains nothing about the images you
          process, because those requests never happen.
        </p>

        {site.analytics.enabled ? (
          <>
            <h2 className="mt-4 font-medium text-fg-primary text-lg">Analytics</h2>
            <p>
              This site uses privacy-preserving analytics to count visits and measure page
              performance. It sets no cookies, stores nothing on your device, does not fingerprint
              you and does not follow you to other sites. The result is a count of page views and
              referrers, not a profile of you.
            </p>
          </>
        ) : null}

        {site.ads.enabled ? (
          <>
            <h2 className="mt-4 font-medium text-fg-primary text-lg">Advertising</h2>
            <p>
              This site displays ads served by Google, which is how it stays free. Google and its
              partners may set cookies and use them to show ads based on your prior visits to this
              and other sites. That is Google&rsquo;s processing rather than {brand.name}&rsquo;s,
              and it is the one part of this page where a third party collects information about
              you.
            </p>
            <p>
              You can turn off personalised advertising at{' '}
              <a
                href="https://www.google.com/settings/ads"
                rel="noreferrer"
                className="text-brand underline underline-offset-2"
              >
                Google Ads Settings
              </a>
              , and opt out of third-party vendors at{' '}
              <a
                href="https://www.aboutads.info/choices/"
                rel="noreferrer"
                className="text-brand underline underline-offset-2"
              >
                aboutads.info
              </a>
              . Google&rsquo;s own policy is at{' '}
              <a
                href="https://policies.google.com/technologies/partner-sites"
                rel="noreferrer"
                className="text-brand underline underline-offset-2"
              >
                policies.google.com
              </a>
              . None of this affects your images, which still never leave your device.
            </p>
          </>
        ) : null}

        <h2 className="mt-4 font-medium text-fg-primary text-lg">Children</h2>

        <p>
          {brand.name} is not directed at children and knowingly collects nothing from anyone, of
          any age.
        </p>

        <h2 className="mt-4 font-medium text-fg-primary text-lg">Your rights</h2>

        <p>
          Rights to access, correct or delete personal data all depend on a company holding some.{' '}
          {brand.name} holds none: there are no accounts, no database and no record of who used the
          site or what they processed. If you want the server logs described above dealt with, or
          you have a question this page does not answer,{' '}
          <Link href="/contact" className="text-brand underline underline-offset-2">
            get in touch
          </Link>
          .
        </p>

        <h2 className="mt-4 font-medium text-fg-primary text-lg">Changes</h2>

        <p>
          If this policy changes in a way that affects you — a new third party, or a new category of
          information — the date at the top changes with it. Cosmetic edits do not move it, so a new
          date always means something real changed.
        </p>

        <p className="text-fg-muted text-sm">
          {brand.legalEntity} · questions to{' '}
          <a
            href={`mailto:${brand.supportEmail}`}
            className="text-brand underline underline-offset-2"
          >
            {brand.supportEmail}
          </a>
        </p>
      </div>
    </main>
  )
}
