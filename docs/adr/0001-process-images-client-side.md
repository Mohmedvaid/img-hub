# 0001. Process images client-side

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

The product is a free, SEO-driven image toolkit. Traffic is the business model, so
the cost of serving a visitor has to be effectively zero or the more successful the
site gets, the worse the economics become.

Two options: decode and encode on a server, or in the visitor's browser via
WebAssembly.

Server-side processing also brings a hard platform limit. Vercel caps a function's
request body at 4.5 MB, so any server path needs presigned direct-to-storage uploads
before it can accept a single phone photo. That is real backend work before the first
user arrives.

## Decision

All image processing runs in the browser, in a Web Worker. No image is ever uploaded.

## Consequences

Makes easy:

- Marginal cost per image is zero. Traffic scales without a hosting bill.
- No upload size limit, no storage, no TTL cleanup job, no retention policy.
- "Your images never leave your device" is a true and checkable claim. It is the
  strongest differentiator against every upload-based competitor and it appears on
  every landing page.
- Removes the entire abuse surface: we never hold user content, so there is no DMCA
  process, no CSAM exposure, and no data-processing agreement to write.

Makes hard:

- The weakest phone we support is the binding constraint, not a server we can scale.
  This is why `config/limits.ts` caps file size and pixel count conservatively.
- AVIF encoding is 5-20x slower than WebP; 2-5s for a 12MP image on a fast preset and
  30s+ at quality presets. It ships behind a flag and a warning rather than as a
  default.
- Formats needing a licensed or heavyweight decoder (HEIC from iPhones) may never be
  practical in-browser.

## Escalation trigger

Add a server-side path only when one of these is observed, not before:

1. Analytics show real abandonment on AVIF or another slow encode.
2. HEIC input demand is high enough to justify an edge function.
3. A paid developer API becomes a product, at which point it is `sharp` on a server
   and a separate surface from the web app.

## Alternatives considered

**Server-side with `sharp`.** Fastest and handles every format and size. Lost on unit
economics: a free tool ranking for high-volume keywords attracts exactly the users
least likely to pay for the compute they consume.

**Hybrid from day one** — browser for small files, server for large. Lost because it
requires building and paying for both paths before knowing whether the server path is
ever needed. It stays available as the escalation above.
