# Status

Where the project is **right now**. Regenerated from [BACKLOG.md](BACKLOG.md) — this
file is a view, not a source. If the two disagree, the backlog is right.

**Last updated:** 2026-08-31 · **Release:** `v0.2.0` · **Phase:** 1 and 2 complete, 3 clear of everything but AdSense

## At a glance

| | Count |
|---|---|
| Done | 27 |
| In progress | 0 |
| To do (carried) | 2 reverted with reasons, 1 blocked on Mohmed |
| Blocked | 0 |

## In progress

Nothing. Everything through Phase 2 is merged to `main` and CI is green.

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
pnpm verify                     # lint + typecheck + 210 tests + build
pnpm smoke                      # 10 browser checks; needs the server running
```

Then read `docs/BACKLOG.md` for what is left. The next three, in value order,
are all self-contained and need nothing from Mohmed:

1. **`P1-11` colour profile** — the option exists in `MetadataTransform` but the
   encoders ignore it, so wide-gamut images shift colour. The last known gap in the
   toolkit itself
2. **`P2-01` AVIF** and **`P1-12` PNG optimisation** — both attempted and reverted
   for the same reason: their codec packages ship multi-threaded builds that can
   never run here (ADR-0002) but still cost 7-13x the build time. Each ticket records
   the measurement and what a reopen needs

Two dependencies have now been reverted for the same cause. Before adding any jSquash
codec, check whether it ships a `-mt`, `parallel` or `rayon` build, and measure a cold
`pnpm build` against the 13s baseline before writing UI for it.

**AdSense is the only item that needs Mohmed**: it wants a publisher ID in
`NEXT_PUBLIC_ADSENSE_CLIENT`. Everything else can be taken to done independently.

## Next up

1. AVIF output behind the slow-encode warning
2. Named presets (web hero, social square, email attachment)
3. `P1-11` colour profile preservation
4. Core Web Vitals pass, then AdSense

`P1-12` (oxipng) was attempted and reverted — it cost 13x the build time for an
unmeasured gain. The backlog entry records what a reopen needs.

## Recently done

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
pnpm audit:seo      # 319 checks over every indexable page; also a CI step
pnpm audit:vitals   # LCP/CLS on a throttled mobile profile
```

What is left on them needs a real domain or post-launch field data, not more code.
`P3-03` AdSense is the only item blocked on Mohmed — it needs a publisher ID.

## Health

| Check | State |
|---|---|
| CI | Passing |
| Tests | 230 passing, plus a 10-check smoke suite and a 319-check SEO audit |
| Typecheck | Clean, strict mode |
| Lint | Clean |
| Production build | Passing, all routes static |
| Browser smoke | 10/10 passing |
| Known bugs | None. Colour profile and PNG optimisation are unimplemented, not broken — P1-11, P1-12 |
