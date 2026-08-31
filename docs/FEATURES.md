# Features

What each feature does and how to tell it is finished. [ROADMAP.md](ROADMAP.md) owns
when they ship; [BACKLOG.md](BACKLOG.md) owns the tickets.

A feature is specified here before it is built. If a spec cannot state its acceptance
criteria, the feature is not understood well enough to start.

## How features appear on a page

Every tool page names one **primary** feature. It is always on, cannot be switched
off, and gets the main UI — it is what the page ranks for. Every other feature shows
as an **optional checkbox** below it.

Ticking an optional feature reveals its fields. Some have none: ticking "also
compress" applies a sensible default quality and shows no slider, because tuning
quality is the compressor page's job, where compress is primary. `FeatureInfo.hasFields`
records which is which.

A page never changes something the visitor did not ask about. Non-conversion pages
keep the source format, so cropping a PNG returns a PNG unless convert is ticked.

The optional list is derived from the primary, so adding a feature offers it on every
existing page at once.

---

## Pipeline builder

**Status:** Phase 1 · **Tickets:** P1-04, P1-06

The core surface. A visitor picks files, chains operations, and runs them once.

Operations apply in a fixed order — rotate, crop, resize, metadata — then encode,
with EXIF auto-orientation baked in at decode before any of it. The order is a
correctness requirement, not a simplification: crop coordinates only mean something
relative to a known orientation, so reordering would change what identical settings
produce. See ADR-0006.

**Acceptance**
- Resize, convert and compress apply together in one pass over the source
- The output format list comes from `limits.outputFormats`, never a hardcoded list
- Quality is disabled, not hidden, for lossless formats, so the control does not jump
- Invalid combinations show the message from `validatePipeline`
- A pipeline persists while files are added or removed

**Not included:** arbitrary operation reordering. The order is what makes a saved
pipeline mean the same thing every time it runs, so it is a correctness guarantee
rather than a limitation to remove later.

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

## Crop

**Status:** Shipped in v0.2 · **Tickets:** P1-10

Drag a selection over a preview of the first file. Corner handles resize it, the body
drags it, and arrow keys nudge it (shift for larger steps). Aspect presets constrain
it around wherever it already is.

The box is measured against the **rotated** image, which is what the preview shows.
Changing rotation moves the box with it, so the region stays selected rather than
jumping — see ADR-0006.

**Acceptance**
- The seeded box is a centred 80% of the frame, so handles are immediately grabbable
- Output dimensions equal the box exactly
- An aspect preset produces that ratio and stays inside the frame
- Rotating after drawing keeps the same region selected
- A box extending past an edge is trimmed rather than failing; only a box entirely
  outside the image is an error
- In a batch, the box is drawn on the first file and clamped for the rest

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
