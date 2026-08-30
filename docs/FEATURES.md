# Features

What each feature does and how to tell it is finished. [ROADMAP.md](ROADMAP.md) owns
when they ship; [BACKLOG.md](BACKLOG.md) owns the tickets.

A feature is specified here before it is built. If a spec cannot state its acceptance
criteria, the feature is not understood well enough to start.

---

## Pipeline builder

**Status:** Phase 1 · **Tickets:** P1-04, P1-06

The core surface. A visitor picks files, chains operations, and runs them once.

Operations apply in a fixed order — crop, rotate, resize, metadata — then encode.
Order is fixed because it is the order that produces predictable results: cropping
after resizing means the crop coordinates refer to dimensions the user never saw.

**Acceptance**
- Resize, convert and compress apply together in one pass over the source
- The output format list comes from `limits.outputFormats`, never a hardcoded list
- Quality is disabled, not hidden, for lossless formats, so the control does not jump
- Invalid combinations show the message from `validatePipeline`
- A pipeline persists while files are added or removed

**Not included:** arbitrary operation reordering. The fixed order is a product
decision, not a limitation to remove later.

---

## Batch processing

**Status:** Phase 1 · **Tickets:** P1-01, P1-05, P1-07

Many files, one pipeline, one pass.

The defining constraint is that per-file failure is normal. One corrupt file in forty
must not cost the other thirty-nine.

**Acceptance**
- Up to `limits.maxFilesPerBatch` files accepted; beyond that, rejected with a count
- Each file shows its own progress and its own outcome
- A failure is recorded against that file and the batch continues
- Cancelling stops promptly and keeps already-finished results
- The main thread never blocks for more than a frame

---

## Format conversion

**Status:** Phase 1 (JPEG/PNG/WebP), Phase 2 (AVIF) · **Tickets:** P1-02

**Acceptance**
- Every enabled pair round-trips without corruption
- Converting away from a format with alpha to one without warns first
  (`losesTransparency`), and does not silently produce a black background
- Converting away from an animated format warns that only the first frame is kept
- AVIF stays behind `site.features.avifOutput` until the slow-encode warning exists,
  because a 12MP AVIF encode takes 2-5s on a fast preset and far longer at quality

---

## Compression

**Status:** Phase 1 · **Tickets:** P1-02, P1-07

**Acceptance**
- Before and after byte sizes shown per file, with percentage saved
- A quality change visibly changes output size
- Where re-encoding would produce a *larger* file, say so rather than silently
  shipping a worse result

---

## Resize

**Status:** Phase 1 · **Tickets:** P1-03

Three modes: `contain` fits inside the box, `cover` fills and centre-crops, `exact`
stretches.

**Acceptance**
- Setting one dimension derives the other from the aspect ratio
- `exact` requires both dimensions and says so if one is missing
- `allowUpscale: false` leaves smaller images untouched rather than blurring them
- Large downscales do not alias

---

## Tool landing pages

**Status:** Phase 3 · **Tickets:** not yet written

Generated from `config/tools.ts`. Each is the builder with a preset applied and copy
targeting one search intent.

**Acceptance**
- Routes generate from the registry; adding a format creates its pages automatically
- A tool only enters the sitemap once `status` is `live`, so no route 404s
- Each page carries a unique title, description, `HowTo`/`FAQPage` structured data
  and a canonical URL
- Each page links to related tools and deep-links into the full builder
- Core Web Vitals pass on mobile

---

## Shareable pipelines

**Status:** Phase 4 · **Tickets:** not yet written

A URL that encodes a pipeline, so a settings combination can be shared or bookmarked.

**Acceptance**
- A link restores the exact pipeline, transform order included
- A link from an older schema version migrates silently
- A link from a newer version fails with a clear message rather than a partial restore
- A malformed link never throws; it falls back to defaults with a notice

The encoding is already implemented and tested (`src/lib/pipeline/schema.ts`); this
feature is the UI over it.
