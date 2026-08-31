# Roadmap

Owns **what ships and in what order**. Individual tickets live in
[BACKLOG.md](BACKLOG.md); current progress lives in [STATUS.md](STATUS.md). Nothing
is duplicated between the three.

## Versioning

Two things are versioned, and they are not the same thing.

**Releases** use SemVer, tagged in git with a `CHANGELOG.md` entry. `0.x` while the
pipeline model is still moving; `1.0.0` when shareable pipeline URLs ship, because
that is the point at which the public contract stops changing.

**The pipeline schema** has its own integer version, independent of the release
version, in `src/lib/pipeline/schema.ts`. It only changes when the encoding changes,
and every bump ships with a migration and a decode test. See ADR-0004.

---

## Phase 0 — Foundation `v0.0.1` ✅

No UI. Everything the rest of the work rests on.

- Next.js 16 + TypeScript strict + Tailwind v4, Biome, Vitest, CI
- Config layer: brand, theme, site, limits, security, tools
- Pipeline model, error taxonomy, versioned schema, 122 tests
- Independent operation modules; primary/optional feature model per page
- Docs, ADRs and the three repo skills
- Security headers, robots, sitemap, SEO metadata builder

## Phase 1 — MVP `v0.1.0` ✅

The product becomes usable. One page, the full pipeline, no tool routes yet.

**In scope**
- Drop or select files; batch up to the configured cap
- Chain resize + convert + compress in one pass
- JPEG, PNG and WebP in and out; GIF and AVIF decode
- Per-file progress, per-file errors, batch survives individual failures
- Before/after size comparison
- Download individually or as a ZIP
- Cancel a running batch
- All processing in a Web Worker; UI never blocks

**Out of scope** — crop, rotate, tool landing pages, AVIF output, sharing.

**Done when** a 20-file mixed-format batch completes with a resize and a format
change, one deliberately corrupt file fails without affecting the other 19, and the
main thread never blocks for more than a frame.

**Verified** by `pnpm smoke`, which drives a real browser: EXIF auto-orientation,
resize, rotate, cover-crop, batch resilience and ZIP output are all asserted against
actual output bytes and dimensions.

## Phase 2 — Full toolkit `v0.2.0` — mostly shipped

Every operation the pipeline models.

- ✅ Crop, with an interactive selection, corner handles, keyboard nudging and
  aspect presets. The box is measured against the rotated image and moves with it
  when rotation changes (ADR-0006, P1-10)
- ✅ Rotate and flip
- ✅ Metadata stripping
- ⬜ Colour profile preservation (P1-11) — the option exists but is not yet honoured
- ⬜ Named presets (web hero, social square, email attachment)
- ⬜ AVIF output behind the slow-encode warning; `site.features.avifOutput` flips on
- ⬜ Remembering the last-used pipeline between visits

## Phase 3 — SEO surface `v0.3.0` — mostly shipped

Where traffic comes from. The registry already existed; this shipped its routes.

- ✅ 15 static tool pages generated from `config/tools.ts`
- ✅ Per-page copy and FAQ derived from format facts, so `png-to-jpg` warns about
  transparency and `png-to-webp` does not. Thin-duplicate risk is covered by tests
  asserting distinct intros and substantive answers
- ✅ `FAQPage` structured data, generated from the same source as the visible copy
- ✅ Internal linking between related tools; every page links to the full builder
- ✅ Sitemap and canonical coverage
- ⬜ `crop-image` stays dark until its selection UI ships — a page that cannot do what
  its title promises is worse than no page
- ⬜ Core Web Vitals pass on mobile
- ⬜ AdSense integration behind `site.ads.enabled`

## Phase 4 — Polish `v1.0.0`

- Shareable pipeline URLs (`site.features.shareablePipelines`)
- PWA: installable, works offline
- Keyboard shortcuts and a full accessibility pass
- Locked pipeline schema; migrations mandatory from here

---

## Beyond 1.0

Deliberately unscheduled. Each needs its own decision when it comes up.

| Idea | Note |
|---|---|
| Background removal | Needs a WASM ML model. Large download; measure before committing |
| PDF ↔ image | Different libraries, meaningful search volume |
| Watermarking | Cheap to build, keeps people on the site |
| HEIC input | iPhone photos. Likely forces the first server path (ADR-0001) |
| Developer API | The paid tier. `sharp` on a server, a separate surface |
| Accounts and saved presets | Only once there is something worth saving |

## Trigger conditions

Things that would pull work forward, listed so they are recognised rather than
debated:

- Analytics show AVIF abandonment → move slow encodes to an edge function
- Mobile OOM reports cluster → lower `limits.maxPixels` before adding a server path
- A tool page ranks well → build out its cluster before starting a new one
