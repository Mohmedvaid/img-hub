# Backlog

The single source of truth for every ticket and its status. [STATUS.md](STATUS.md) is
a view over this file; [ROADMAP.md](ROADMAP.md) owns phases and scope.

## How to use this file

Every ticket has an ID, a phase, a status, and a done-when that someone other than
the author could check.

**Status values:** `todo` · `in-progress` · `done` · `blocked`

**Rules**
- One ticket per branch, one branch per PR.
- Update the status line in the same PR that does the work, never afterwards.
- A ticket with no checkable done-when is not ready to start.
- Blocked tickets name what they are blocked on.

**ID format:** `P<phase>-<number>`.

---

## Phase 0 — Foundation (`v0.0.1`) — done

| ID | Status | Ticket |
|---|---|---|
| P0-01 | done | Next.js 16 + TypeScript strict + Tailwind v4 scaffold |
| P0-02 | done | Biome lint and format, with Tailwind directive parsing |
| P0-03 | done | Vitest setup and path aliases |
| P0-04 | done | `config/brand.ts` — name, logos, OG image, social, legal |
| P0-05 | done | `config/theme.ts` — light and dark tokens rendered to CSS variables |
| P0-06 | done | `config/site.ts` — canonical URL, SEO defaults, ads, analytics, flags |
| P0-07 | done | `config/security.ts` — response headers; COOP/COEP permanently excluded |
| P0-08 | done | `config/limits.ts` — size, pixel and batch caps; enabled formats |
| P0-09 | done | `config/tools.ts` — tool registry derived from the format matrix |
| P0-10 | done | Pipeline model, validation and error taxonomy |
| P0-11 | done | Versioned pipeline schema with migration chain |
| P0-12 | done | Docs, ADRs, repo skills, CI |
| P0-13 | done | Split operations into independent modules; add the primary/optional feature model |

---

## Phase 1 — MVP (`v0.1.0`) — shipped except P1-10

### P1-01 · Worker harness and RPC boundary
**Status:** done · **Blocks:** everything else in Phase 1

Set up the Web Worker, the Comlink RPC surface and worker lifecycle handling.

Done when: a pipeline can be sent to the worker and a result comes back; a worker
that crashes is recreated and the in-flight file is marked `WORKER_CRASHED` without
killing the rest of the batch; a cancel request stops work and yields `CANCELLED`.

### P1-02 · Decode and encode via jSquash
**Status:** done · **Blocked by:** P1-01

Wire the jSquash codecs for JPEG, PNG and WebP. Load each codec on demand so a
visitor converting to WebP never downloads the AVIF encoder.

**Decoding must auto-orient from EXIF before returning pixels** — bake the
Orientation tag into the pixels and reset the tag, via
`createImageBitmap(blob, { imageOrientation: 'from-image' })`. This is not optional
and not a user setting. Stripping EXIF is on by default, so without this every phone
photo taken in portrait comes out sideways. See ADR-0006.

Done when: each of the three formats round-trips; an unsupported file yields
`UNSUPPORTED_INPUT_FORMAT` and a truncated file yields `DECODE_FAILED`; golden-file
tests assert output byte size stays within a tolerance band; **a fixture image for
each of EXIF Orientation values 1-8 decodes to identical upright pixels.**

### P1-03 · Canvas resize transform
**Status:** done · **Blocked by:** P1-01

Implement `contain`, `cover` and `exact` on Canvas, honouring `allowUpscale`.

Done when: each mode produces the expected dimensions for both portrait and
landscape sources; `allowUpscale: false` leaves a smaller image untouched; downscaling
by more than 2x does not alias visibly.

### P1-10 · Crop rectangle remap on rotation change
**Status:** done

Crop coordinates are in post-rotation space (ADR-0006). When the user changes rotation
after drawing a crop box, the stored rectangle must be remapped into the new
orientation rather than reinterpreted in place.

Done when: drawing a crop, then rotating 90°, keeps the same region of the image
selected; four successive 90° turns return the rectangle to exactly its original
coordinates; a flip mirrors the rectangle across the same axis.

### P1-04 · Pipeline runner
**Status:** done · **Blocked by:** P1-02, P1-03

Apply transforms in order, then encode. Returns `Result`, never throws.

Done when: transform order demonstrably changes output; a failure at any stage
returns the right code and stage; a 40-file batch with one corrupt file completes 39.

### P1-05 · File intake
**Status:** done

Drop zone plus file picker. Sniff format from content, falling back to extension.
Enforce `limits.maxFileBytes` and `limits.maxFilesPerBatch` before any work starts.

Done when: drag-and-drop and the picker both work; an oversized file is rejected with
its size and the cap in the message; a `.png` that is really a JPEG is handled by
content, not by name.

### P1-06 · Pipeline builder UI
**Status:** done · **Blocked by:** P1-04

The controls: output format, quality, resize settings. React context plus
`useReducer`; no state library.

Done when: settings drive a real run; invalid combinations surface the validation
message from `validatePipeline` rather than a generic one; the pipeline survives
adding more files.

### P1-07 · Results list with per-file state
**Status:** done · **Blocked by:** P1-04

Per-file progress, before/after size, percentage saved, and per-file errors that
show `message` and never `detail`.

Done when: a mixed batch shows successes and failures side by side; a retryable
error offers a retry and a non-retryable one does not.

### P1-08 · Download, individually and as ZIP
**Status:** done · **Blocked by:** P1-07

Done when: a single file downloads with a correct name and extension; a batch
downloads as a ZIP; filename collisions are de-duplicated rather than overwriting.

### P1-09 · Error boundaries and recovery
**Status:** done · **Blocked by:** P1-06, P1-07

One boundary per surface — builder and results — not per component.

Done when: a thrown render error in the results list leaves the builder usable;
recovering does not lose already-processed output.

---

### P1-11 · Preserve the ICC colour profile
**Status:** todo

`MetadataTransform.keepColorProfile` is honoured in the type but not yet in the
encoders, so the profile is currently always dropped. Visible as a colour shift on
wide-gamut images.

Done when: a P3-tagged source keeps its profile with the option on, and loses it with
the option off.

### P1-12 · Optimise PNG output with oxipng
**Status:** todo — attempted and reverted, see below

PNG output is a plain re-encode today, which leaves some savings on the table.
`@jsquash/oxipng` does the real optimisation.

**Tried on 2026-08-31 and reverted.** Adding it took a cold production build from
**13s to over 175s**. The cause is `@jsquash/oxipng` shipping a `pkg-parallel` build
with `wasm-bindgen-rayon` nested workers, which the bundler has to process. That
build can never run here: oxipng's own README says multithreading requires the
COOP/COEP headers ADR-0002 permanently forbids. So it is 284 KB of dead code that
costs 13x the build time to bundle.

Reopen only with a measurement in hand. Specifically:

1. Measure oxipng level 2 against the current plain encode on the fixture set. The
   expected gain is roughly 5-20%, against WebP conversion's 90%+ on the same files —
   and the compressor page already recommends exactly that.
2. If the gain justifies it, avoid bundling `pkg-parallel`, either via a Turbopack
   `resolveAlias` stub or by importing the single-threaded codec directly.

Done when: a PNG re-encode is measurably smaller on the fixture set with no pixel
difference, **and** a cold `pnpm build` stays under 30s.

---

## Phase 3 — pre-launch gates

These block flipping `NEXT_PUBLIC_ALLOW_INDEXING` to `true`. Until then the site is
noindex on every page and `robots.txt` disallows everything, so nothing here is
urgent — but none of it should be skipped, because the first crawl sets a first
impression that takes months to revise.

### P2-01 · AVIF output
**Status:** todo — attempted and reverted, see below

AVIF produces roughly 20-30% smaller files than WebP at the same visual quality.
The engine already supports it: `formats.ts` records it as encodable with
`encodeCost: 'slow'`, and it ships behind `site.features.avifOutput`, which is off.

**Tried on 2026-08-31 and reverted.** `@jsquash/avif` takes a cold production build
from **13s to 112s**, measured on an otherwise idle machine. The package is 8 MB
unpacked and ships `codec/enc/avif_enc_mt.worker.mjs`, a multi-threaded encoder the
bundler has to process.

This is the same trap as `@jsquash/oxipng` in P1-12, and the same reason applies: the
multi-threaded build needs WebAssembly threads, which need SharedArrayBuffer, which
needs the COOP/COEP headers ADR-0002 permanently forbids. It can never run here, so
the build cost buys nothing.

Reopen with a plan for the bundling, not just the feature:

1. Stop the multi-threaded build reaching the bundler — a Turbopack `resolveAlias`
   stub, or importing the single-threaded codec directly. Prove it before writing UI.
2. Weigh the gain honestly. AVIF is 20-30% smaller than WebP but 5-20x slower to
   encode: 2-5s for a 12MP image on a fast preset. On a phone that is a poor trade,
   and WebP already delivers most of the win.
3. A slow-encode warning has to ship with it, or the first thing a user does is
   assume the page has hung.

**Done when** AVIF encodes correctly, a warning appears before a slow run, and a cold
`pnpm build` stays under 30s.

### P3-01 · SEO audit before launch
**Status:** automated and passing · **Blocks:** enabling indexing

Run `pnpm audit:seo` against a build with indexing enabled. It is also a CI step, so
the guarantees below hold on every commit rather than only at launch.

**Last run: 319 checks across 17 pages, no blocking issues.**

Two real problems it caught on first run, both since fixed: `/rotate-image` had a
65-character title that would truncate in results, and the structured-data comparison
was partly vacuous because it searched the whole document including the JSON-LD
itself, so it could match itself.

A pass over every page that will be indexed, with the site running a production
build against the real domain.

Automated in `scripts/seo-audit.mjs`:
- [x] Exactly one `<h1>` per page
- [x] `<title>` within length, warns over 60 characters
- [x] Meta description present and 70-160 characters
- [x] Canonical absolute and self-referencing
- [x] Open Graph image present and absolute
- [x] Structured data parses, and every FAQ answer appears in the *visible* page with
      script bodies excluded from the comparison
- [x] Sitemap has no duplicates, lists the home page, and every URL returns 200
- [x] No page in the sitemap carries `noindex`
- [x] No two pages share a `<title>`
- [x] An unknown URL returns a real 404, not a soft 200

Proven to work by deliberately breaking three things — a second `<h1>`, structured
data that does not match the page, and a truncated visible answer — and confirming
94 failures and a non-zero exit.

Still manual, needs a real domain or judgement:
- [ ] Validate structured data in Google's Rich Results Test against the live domain
- [ ] Confirm the OG image is exactly 1200×630 once real brand assets exist
- [ ] Decide `indexable` per tool from Search Console impressions after the first
      month. A handful of pages that each deserve to rank beats fifteen that dilute
      the site — but that is a data question, not a guess to make now

### P3-02 · Performance and Core Web Vitals
**Status:** measured and passing · **Blocks:** enabling indexing

Run `pnpm audit:vitals`. It throttles to 4x CPU and roughly 1.6 Mbps with 150ms
latency, because desktop numbers on a fast machine flatter everything and predict
nothing.

**Last run, throttled mobile:**

| Page | LCP | CLS | Transfer |
|---|---|---|---|
| `/` | 480ms | 0 | 161 KB |
| `/compress-image` | 476ms | 0 | 164 KB |
| `/crop-image` | 508ms | 0 | 164 KB |

CLS after adding a file on `/crop-image` is also 0 — load-time CLS is the easy half,
and the shift that actually bites is the one interaction causes.

Eager JavaScript is 193 KB gzipped. No codec appears in it: all four WASM codecs
(about 1 MB total) load only when a format needs them. The worker is not spawned
until Run, so a visitor who only reads the page never pays for it.

Speed is a ranking factor and, more importantly, the thing that decides whether
someone waits for a 3 MB photo to compress or closes the tab.

- [x] LCP under 2.5s — measured at ~500ms
- [x] CLS under 0.1 — measured at 0, on load and after interaction
- [x] No codec in the initial bundle
- [x] Worker starts lazily
- [x] Static assets served `immutable, max-age=31536000`; HTML is not
- [x] No webfont, so no font-swap shift — the system stack is deliberate

Remaining:
- [ ] Interaction to Next Paint under 200ms. Needs real interaction sampling rather
      than a synthetic run; check Search Console field data after launch
- [ ] Lighthouse performance ≥ 90 on a tool page, once a real domain exists
- [ ] Consider prefetching the likely codec on file selection rather than on Run.
      Only worth doing if field data shows the wait is felt — the codec download
      currently overlaps the decode, so it may already be hidden

**Done when** field data confirms the lab numbers after launch.

### P3-03 · AdSense integration
**Status:** blocked — needs a publisher ID from Mohmed

Behind `site.ads.enabled`, which is driven by `NEXT_PUBLIC_ADSENSE_CLIENT`. The CSP
in `config/security.ts` already admits the ad hosts only when that value is set.

**Never set COOP or COEP to satisfy any library while ads are the revenue model.**
See ADR-0002; the failure is silent.

Done when: ads render on a tool page, the CSP is not widened beyond the hosts
already listed, and the performance targets in P3-02 still hold with ads present.

## Unscheduled

Ideas with no phase. Promote by giving one an ID, or delete it.

- Compare slider for before/after
- Paste from clipboard
- Estimated output size before running
- Per-format quality defaults tuned against a reference image set
