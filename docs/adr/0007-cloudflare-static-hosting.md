# 0007. Host as static files on Cloudflare, not Vercel

- **Status:** Accepted
- **Date:** 2026-08-31

## Context

The app has no server. Every route prerenders, there are no API routes, no database,
no auth and no server state. A production build is 187 files and 4.5 MB, WASM codecs
included, and every byte of image work happens on the visitor's device (ADR-0001).

So this is not a hosting decision so much as a CDN decision, and static CDN hosting is
free almost everywhere. What separates the options is not capability but terms.

**Vercel** is the default answer for a Next.js app and is the wrong one here. Its
Hobby plan prohibits commercial use, and names displaying ads — AdSense specifically —
as disqualifying. Ads are the monetisation model (ADR-0002), so the free tier stops
being available on the day the site starts earning. That means $20/month for Pro to
serve files needing zero compute. There is also a documented pattern of AdSense
rejecting applications from `*.vercel.app` for the domain rather than the content.

**Cloudflare** serves unlimited requests and bandwidth for static assets on its free
plan and permits ads. For new projects it now steers to Workers with static assets
rather than Pages; Pages is not deprecated and existing projects keep working, but
Workers is where new capability lands and reached parity for static hosting and custom
domains in March 2026.

**GitHub Pages and Netlify** would both also work. Neither was chosen over Cloudflare
for a specific reason; Cloudflare wins on already being the account we have, on
bandwidth that is unmetered rather than capped, and on Web Analytics being free.

## Decision

Deploy as a static export to Cloudflare Workers with static assets.

Two consequences follow, and both are the actual work:

**`output: 'export'` in `next.config.ts`.** The metadata routes need
`export const dynamic = 'force-static'` or the build fails on them.

**Security headers move to `public/_headers`.** `headers()` in `next.config.ts` does
not run in a static export; Next warns about this explicitly. The file must be
generated from `config/security.ts` at build time rather than written by hand, so the
CSP keeps one source of truth and the prohibition on COOP and COEP in ADR-0002 keeps
applying to whatever actually gets served.

Until a domain exists the site runs on the free `*.workers.dev` subdomain with
indexing off. A custom domain becomes necessary at exactly the point indexing turns
on, because a free platform subdomain cannot carry accumulated ranking signal you
intend to move, and AdSense will not approve one.

## Alternatives rejected

**Vercel Hobby.** Free until the site earns anything, then prohibited. Choosing a host
you must leave the moment the business model activates is choosing a migration.

**Vercel Pro at $20/month.** Buying compute for a site that needs none.

**Free TLDs (`.tk`, `.ml`, `.ga`).** Freenom paused free registration in 2023, exited
the domain business in 2024, and Mali and Gabon reclaimed their TLDs. The three still
operating now charge from about €8/year, which is not cheaper than a real domain, and
they carry a decade of phishing reputation that a site trying to rank cannot afford.

**Running `next start` on a small VPS.** A server process, an OS to patch and a
monthly bill, to serve files a CDN serves for nothing.

## Consequences

Hosting, bandwidth, TLS and analytics are all $0. The only recurring cost is the
domain, roughly $10 a year.

There is no origin to monitor, so uptime checks buy little. The realistic failure is a
bad deploy, and the existing `scripts/smoke.mjs` and `scripts/seo-audit.mjs` both take
a base URL, so pointing them at production after a deploy is the monitoring that
matters. Analytics is Cloudflare Web Analytics: free, cookieless, no consent banner,
and it reports Core Web Vitals, which covers the `P3-02` gate. Its 30-day retention is
the limit to watch.

Adding anything server-side later does not force a migration, because Workers already
hosts it.
