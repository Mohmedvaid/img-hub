# Changelog

Releases use [SemVer](https://semver.org). `0.x` while the pipeline model is still
moving; `1.0.0` lands when shareable pipeline URLs ship and the encoding becomes a
public contract. See [docs/ROADMAP.md](docs/ROADMAP.md#versioning).

The **pipeline schema** is versioned separately, as an integer in
`src/lib/pipeline/schema.ts`. It is still at `1`: nothing below has changed the
encoding. See [ADR-0004](docs/adr/0004-version-the-pipeline-schema.md).

This file was backfilled from git history on 2026-08-31, after four phases had
already merged without one. Tags point at the merge commit that completed each
phase, so a version covers what actually landed in that window — which is not always
the same as the phase the roadmap files it under. `v0.2.0` is the clearest case: the
tool pages belong to the SEO phase on paper but shipped inside the toolkit window.

---

## [v0.4.0] — 2026-08-31 — Editor UX

Rotate and flip became buttons over a live preview, files started being identified by
their bytes, and tool pages finally opened on their own settings. Tickets `P4-01` …
`P4-07`.

### Added
- **Always-visible preview.** Shows geometry — orientation and crop — and turns as
  the buttons are clicked. Deliberately not compression or format, which would mean
  re-encoding on every keystroke. In a batch it previews the first file, since the
  settings apply to all of them.
- **Rotate and flip as four momentary buttons** rather than an angle picker. Any
  sequence of clicks composes into one of eight canonical orientations, so the fixed
  pipeline order (ADR-0006) never has to change.
- **File intake by magic bytes** (`src/lib/pipeline/codecs/sniff.ts`,
  `src/lib/ui/intake.ts`). `file.type` is the browser's guess from the extension and
  is wrong in both directions. Every rejection now names the file and says why.
- **BMP, TIFF, HEIC and ICO accepted as decode-only input.** They decode through the
  browser; refusing a file the visitor's own browser could open is the worse failure.
- **A download button per file**, alongside the zip.
- **Controls for the primary feature**: a format picker on a converter, a quality
  slider on the compressor. Neither page could previously change the thing it was
  about.
- **Coverage thresholds enforced.** `vitest.config.ts` carried an 80% floor that
  nothing ran; `pnpm verify` and CI now run it.
- **The browser smoke suite runs in CI**, and proves all eight orientations by
  downloading each result, decoding it, and sampling the four corners of a
  four-colour fixture.

### Fixed
- **Conversion pages ignored their own output format.** `ImageToolkit` took only
  `primary` and never the tool's `preset`, so every converter started on the same
  builder default and `png-to-jpg` handed back WebP. Fifteen landing pages ranked for
  one thing and did another.
- **Orientation composed in the wrong space.** Clicks were applied in the source's
  axes rather than the axes on screen, so rotate-then-flip and flip-then-rotate
  returned each other's image, and flipping a quarter-turned image mirrored the wrong
  axis. The unit test that should have caught it derived its expected value from the
  value under test — it compared a value with itself. It now models the display
  independently of the algebra.
- `rotate-image`'s preset no longer turns every file 90° on arrival.
- Image dimensions in the too-large message are now formatted consistently with the
  limit they are compared against.

### Changed
- `CropEditor` split into `ImagePreview` + `CropOverlay`; `ImageToolkit` split
  further into `PreviewPane`, `BatchSummary`, `FeatureChecklist` and `RunControls`,
  taking its cognitive complexity from 38 to under the lint ceiling.
- Zip is offered only when more than one file finished. One file gets a direct
  download.

### Testing
509 tests, up from 230. Statement coverage 54.9% → 96.8%, branches 94.7%.
`scripts/smoke.mjs` rewritten for the new UI: 19 checks, now a CI step.

---

## [v0.3.0] — 2026-08-31 — Pre-launch gates

Everything needed to decide whether the site is ready to be indexed, rather than
guessing.

### Added
- **Two-layer opt-in indexing.** `robots.txt` and per-page `noindex` both flip only
  on `NEXT_PUBLIC_ALLOW_INDEXING=true`, and a page can additionally opt out via
  `indexable` in `config/tools.ts`. The gates compose: a page cannot opt into
  indexing on a deployment where indexing is off.
- **`pnpm audit:seo`** — 517 checks across every indexable page: titles,
  descriptions, canonicals, structured data, heading structure, internal linking,
  thin-content heuristics. A CI step, so it gates every commit.
- **`pnpm audit:vitals`** — LCP and CLS on a throttled mobile profile.
- **Named presets**: web page, social square, email attachment, thumbnail, strip
  location data.

### Changed
- **Colour handling settled** (`P1-11`). Everything converts to sRGB on decode, which
  is correct for the web. The `keepColorProfile` toggle was removed rather than left
  as a false option: `createImageBitmap` offers no mode returning wide-gamut pixels
  with their profile, and no jSquash encoder can write one back out.

### Not shipped
- **AVIF output** (`P2-01`) — attempted and reverted. `@jsquash/avif` ships a
  multi-threaded build that needs `SharedArrayBuffer`, which this project can never
  enable (ADR-0002), and it still took a cold build from 13s to 112s.
- **PNG optimisation with oxipng** (`P1-12`) — reverted for the same cause; 13s to
  175s.

---

## [v0.2.0] — 2026-08-31 — Full toolkit and the tool pages

Every operation the pipeline models, plus the routes that are meant to bring traffic
to them.

### Added
- **Interactive crop** with corner handles, keyboard nudging (shift for larger steps)
  and aspect presets. The box is measured in post-rotation space, and moves with the
  image when rotation changes (`P1-10`, ADR-0006) — without that remap it silently
  selects a different region.
- **Rotate and flip**, and **metadata stripping**.
- **15 static tool pages** generated from `config/tools.ts`. Adding a format to the
  matrix creates its pages.
- **Per-page copy derived from format facts**, so `png-to-jpg` warns about
  transparency and `png-to-webp` does not. This is the defence against thin,
  near-duplicate content, and it is asserted by tests.
- **`FAQPage` structured data** generated from the same source as the visible copy,
  so the two cannot drift — mismatched structured data is a manual-action risk.
- Internal linking between related tools; every page links to the full builder.
- Sitemap and canonical coverage; a tool enters the sitemap only once `status` is
  `live`, so no route 404s.

---

## [v0.1.0] — 2026-08-31 — Working MVP

The product becomes usable: one page, the full pipeline, no tool routes yet.

### Added
- **Web Worker pipeline** with per-file progress, cancellation, and recovery from a
  worker crash — a codec that exhausts memory takes the worker down, so a fresh one
  is spawned and every in-flight job fails individually rather than hanging.
- **Decode via `createImageBitmap`, encode via jSquash WASM.** The split is
  deliberate: decoding gets EXIF auto-orientation and every format the browser
  supports for free, while encoding is where compression quality is won (ADR-0002).
- **EXIF auto-orientation.** Load-bearing, not a nicety: metadata stripping is on by
  default, and removing the orientation tag without rotating the pixels leaves every
  portrait phone photo sideways.
- Resize with `contain`, `cover` and `exact`; format conversion; compression.
- Batch handling that survives individual failures — one corrupt file in forty leaves
  the other thirty-nine untouched, which is why the engine returns `Result<T>` rather
  than throwing.
- Download individually or as a ZIP.
- **`pnpm smoke`** — a browser suite for what unit tests cannot reach: the WASM
  codecs, the worker, and EXIF orientation, asserted against real output bytes.

---

## [v0.0.1] — 2026-08-30 — Foundation

No UI. Everything the rest rests on.

### Added
- Next.js 16 + TypeScript strict (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`) + Tailwind v4, Biome, Vitest, CI.
- **Config layer** — brand, theme, site, limits, security, tools. Nothing outside
  `config/` hardcodes a name, colour, limit or URL.
- **Pipeline model, error taxonomy and versioned schema** with a migration chain,
  added before anything read it: once shareable links ship, every encoded pipeline
  becomes a permanent public contract (ADR-0004).
- **Independent operation modules** with a shared runner, enforced by a lint rule so
  operations can never import each other (ADR-0005).
- **The primary/optional feature model**: each page names one feature that is always
  on, and derives the rest as checkboxes.
- Security headers, with COOP and COEP permanently excluded — they would enable
  `SharedArrayBuffer` and silently kill AdSense, which is the revenue model
  (ADR-0002).
- Docs, six ADRs, and the three repo skills.

[v0.4.0]: https://github.com/Mohmedvaid/img-hub/releases/tag/v0.4.0
[v0.3.0]: https://github.com/Mohmedvaid/img-hub/releases/tag/v0.3.0
[v0.2.0]: https://github.com/Mohmedvaid/img-hub/releases/tag/v0.2.0
[v0.1.0]: https://github.com/Mohmedvaid/img-hub/releases/tag/v0.1.0
[v0.0.1]: https://github.com/Mohmedvaid/img-hub/releases/tag/v0.0.1
