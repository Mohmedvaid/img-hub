# Status

Where the project is **right now**. Regenerated from [BACKLOG.md](BACKLOG.md) — this
file is a view, not a source. If the two disagree, the backlog is right.

**Last updated:** 2026-08-31 · **Release:** `v0.4.0` · **Phase:** 1, 2 and 4 complete; 3 clear of everything but AdSense

## At a glance

| | Count |
|---|---|
| Done | 34 |
| Awaiting review | 7 (Phase 4, on `feat/P4-editor-ux`) |
| To do (carried) | 2 reverted with reasons, 1 blocked on Mohmed |
| Blocked | 0 |

## In progress

Phase 4 (editor UX) is on `feat/P4-editor-ux` awaiting review. Everything through
Phase 2 is merged to `main` and CI is green.

## Indexing

**The site is noindex on every page, and that is deliberate.** Two independent
layers, both opt-in:

- `robots.txt` returns `Disallow: /`
- every page emits `noindex, nofollow`

Both flip only when `NEXT_PUBLIC_ALLOW_INDEXING="true"` is set on the deployment.
Deploy and test on the real domain freely; nothing gets crawled until that variable
is set. `P3-01` and `P3-02` are the gates to clear before flipping it.

Individual pages can also opt out via `indexable` in `config/tools.ts`. The two gates
compose: a page cannot opt into indexing on a deployment where indexing is off.

## Picking this up next session

The app works end to end. Start by running it:

```bash
pnpm install && pnpm dev        # http://localhost:3000
pnpm verify                     # lint + typecheck + 509 tests + build
pnpm test:coverage              # same tests, with the 80% thresholds enforced
pnpm smoke                      # 19 browser checks; needs the server running
```

Then read `docs/BACKLOG.md` for what is left. The toolkit itself is feature-complete
for v1 — what remains is launch work, and most of it needs a decision rather than code:

1. **Legal pages** — About, Contact and Privacy. AdSense rejects sites without them,
   so this gates the revenue model. It also wants substantive content; 15 template
   pages are the shape of site that gets refused, which is why the copy is derived
   from format facts rather than filled in
2. **Domain and deploy** — then `NEXT_PUBLIC_ALLOW_INDEXING="true"` once `P3-01` and
   `P3-02` have been re-run against the real origin
3. **`P2-01` AVIF** and **`P1-12` PNG optimisation** — both attempted and reverted
   for the same reason: their codec packages ship multi-threaded builds that can
   never run here (ADR-0002) but still cost 7-13x the build time. Each ticket records
   the measurement and what a reopen needs

Two dependencies have now been reverted for the same cause. Before adding any jSquash
codec, check whether it ships a `-mt`, `parallel` or `rayon` build, and measure a cold
`pnpm build` against the 13s baseline before writing UI for it.

**AdSense is the only item that needs Mohmed**: it wants a publisher ID in
`NEXT_PUBLIC_ADSENSE_CLIENT`. Everything else can be taken to done independently.

If you touch rotate, flip or crop, run `pnpm smoke`. The unit suite cannot see a
canvas, so geometry is only truly asserted there — and it caught a live bug the unit
tests had been passing over. See `P4-06`.

## Next up

1. Legal pages — About, Contact, Privacy. AdSense will not approve a site without
   them, so this blocks the revenue model regardless of what else ships
2. Domain and deploy, then flip `NEXT_PUBLIC_ALLOW_INDEXING`
3. AVIF output behind the slow-encode warning
4. Core Web Vitals pass on the real domain, then AdSense

`P1-12` (oxipng) was attempted and reverted — it cost 13x the build time for an
unmeasured gain. The backlog entry records what a reopen needs.

## Recently done

**Phase 4 — editor UX (`P4-01` … `P4-07`)**

- Rotate and flip as momentary buttons over an always-visible preview that turns as
  they are clicked; the crop box is drawn on the same preview
- A download per file, and a zip only when there is more than one
- File intake by magic bytes, with a stated reason for every rejection; BMP, TIFF,
  HEIC and ICO accepted as decode-only input
- Tool pages now open on their own preset — `png-to-jpg` was producing WebP because
  `ImageToolkit` never received it — and the primary feature has its own controls
- **Orientation composition fixed.** Clicks were composed in the source's axes rather
  than the axes on screen, so rotate-then-flip and flip-then-rotate produced each
  other's image. The unit test that should have caught it was circular; it now models
  the display independently, and the smoke suite asserts all eight orientations by
  sampling the corners of a downloaded PNG
- Unit coverage from 55% to 96.8%, with 80% thresholds enforced in `vitest.config.ts`

**Earlier**

- Repo foundation: framework, tooling, CI, docs, skills (`P0-01` … `P0-12`)
- Independent operation modules and the primary/optional feature model (`P0-13`)
- Working MVP (`P1-01` … `P1-09`): worker, codecs, runner, builder UI, batch results,
  single and ZIP download, error boundaries
- Browser smoke suite covering the WASM and EXIF paths unit tests cannot reach
- 15 static tool pages with copy derived from format facts, FAQ structured data and
  internal linking
- Interactive crop with aspect presets, and the rotation remap that keeps the drawn
  region selected (`P1-10`); `crop-image` is now live, so every tool has a page
- Six ADRs recording the decisions behind the stack

## Open questions

| Question | Blocks | Owner |
|---|---|---|
| Domain and final product name | SEO config, OG image, launch | Mohmed |
| Logo and brand assets | `public/brand/*` are placeholders | Mohmed |

Neither blocks Phase 1: `config/brand.ts` and `NEXT_PUBLIC_SITE_URL` absorb both
changes when the answers arrive.

## Pre-launch gates

`P3-01` and `P3-02` are both automated and passing:

```bash
pnpm audit:seo      # 517 checks over 29 pages; also a CI step
pnpm audit:vitals   # LCP/CLS on a throttled mobile profile
```

What is left on them needs a real domain or post-launch field data, not more code.
`P3-03` AdSense is the only item blocked on Mohmed — it needs a publisher ID.

## Health

| Check | State |
|---|---|
| CI | Passing |
| Tests | 509 passing at 96.8% statement coverage, plus a 19-check smoke suite and a 517-check SEO audit |
| Typecheck | Clean, strict mode |
| Lint | Clean |
| Production build | Passing, all routes static |
| Browser smoke | 19/19 passing |
| Known bugs | None. Colour profile and PNG optimisation are unimplemented, not broken — P1-11, P1-12 |
