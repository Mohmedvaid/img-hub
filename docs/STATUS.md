# Status

Where the project is **right now**. Regenerated from [BACKLOG.md](BACKLOG.md) — this
file is a view, not a source. If the two disagree, the backlog is right.

**Last updated:** 2026-09-13 · **Release:** `v0.4.0` · **Phase:** 1, 2 and 4 complete; 5 (launch) in progress

## At a glance

| | Count |
|---|---|
| Done | 39 |
| In progress | 3 (Phase 5, launch) |
| To do (carried) | 2 reverted with reasons, 1 blocked on Mohmed |
| Blocked | 0 |

## In progress

**Phase 5, getting the site live.** `P5-01` (about, contact, privacy), `P5-02`
(static export), `P5-04` (Cloudflare Web Analytics) and `P5-08` (GitHub Pages) are
done.

**Hosting moved to GitHub Pages** (`P5-08`, superseding `P5-03`), at
https://mohmedvaid.github.io/img-hub/, noindex, published by
`.github/workflows/pages.yml` on every merge to `main`. The first publish happens on
the merge that lands this, so the URL goes live then rather than now.

The Cloudflare Worker that served the site until this change is still deployed and
needs deleting by hand — see **Needs Mohmed** below.

What the move cost is in [ADR-0008](adr/0008-github-pages-hosting.md), and the short
version matters: **GitHub Pages sets no response headers.** The CSP and referrer
policy moved into the document as `<meta>` tags and survive, `frame-ancestors`
excepted. `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`
and `Permissions-Policy` are gone; `headerOnlyProtections` in `config/security.ts`
says what each cost. `connect-src 'self'` — the directive behind the privacy claim —
is intact in the policy visitors get. `securityHeaders` is still whole, so moving to a
header-capable host restores all six with no code change.

The site is served from `/img-hub` rather than a root. `basePath` is derived from
`NEXT_PUBLIC_SITE_URL`, and CI now builds and serves under the subpath for both the
smoke suite and the SEO audit — a root-served test cannot see a base-path mistake, and
one breaks every page at once.

`P5-05` is the domain, and waits on a product name. It matters slightly more now:
`robots.txt` lands at `/img-hub/robots.txt`, which no crawler reads, so the per-page
`noindex` tag is the layer doing the work.

`pnpm build` emits `out/` and `pnpm start` serves it through `scripts/serve.mjs`,
which honours the base path and sets no headers, matching the host — so smoke, the SEO
audit and vitals exercise the policy production actually serves.

Everything through Phase 4 is merged to `main` and CI is green, including the browser
smoke suite, which now runs on every pull request rather than by hand.

## Indexing

**The site is noindex on every page, and that is deliberate.** Two independent
layers, both opt-in:

- `robots.txt` returns `Disallow: /`
- every page emits `noindex, nofollow`

Both flip only when `NEXT_PUBLIC_ALLOW_INDEXING="true"` is set on the deployment.
Deploy and test freely; nothing gets crawled until that variable is set.

**Only Mohmed flips it, and only by saying so explicitly in chat** — words to the
effect of "we can go live now, let's do indexing". Passing `P3-01` and `P3-02` is
necessary but is not permission, and neither is having a domain, or the site looking
ready. Standing instruction, 2026-08-31.

Individual pages can also opt out via `indexable` in `config/tools.ts`. The two gates
compose: a page cannot opt into indexing on a deployment where indexing is off.

## Picking this up next session

The app works end to end. Start by running it:

```bash
pnpm install && pnpm dev        # http://localhost:3000
pnpm verify                     # lint + typecheck + 584 tests + build
pnpm test:coverage              # same tests, with the 80% thresholds enforced
pnpm smoke                      # 19 browser checks; needs the server running
```

Then read `docs/BACKLOG.md` for what is left. The toolkit itself is feature-complete
for v1 — what remains is launch work, and most of it needs a decision rather than code:

1. **Analytics token** — the only thing between the site and Core Web Vitals data.
   Set it as the `NEXT_PUBLIC_ANALYTICS_TOKEN` repository secret and the Pages
   workflow picks it up. Hosting is settled in
   [ADR-0008](adr/0008-github-pages-hosting.md): GitHub Pages, static, free
2. **`P5-05` domain** — blocked on a product name. It, indexing and the AdSense
   application all land together
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
| Domain and final product name | `P5-05`, so indexing and AdSense | Mohmed |
| Support email address | `brand.supportEmail` is a placeholder; the SEO audit fails on it at launch | Mohmed |
| Logo and brand assets | `public/brand/*` are placeholders | Mohmed |

Neither blocks Phase 1: `config/brand.ts` and `NEXT_PUBLIC_SITE_URL` absorb both
changes when the answers arrive.

## Launch requirements

Not backlog items to get to — the conditions for the site being public at all. Each
one blocks indexing. The list lives in
[BACKLOG.md](BACKLOG.md#launch-requirements); this is the view.

| Requirement | Ticket | State |
|---|---|---|
| The builder does not look broken when scrolled | `P5-06` | **not started — top priority** |
| A real support address | `P5-07` | needs Mohmed |
| About, contact, privacy pages | `P5-01` | done |
| Deployed over HTTPS | `P5-08` | done, on GitHub Pages |
| Analytics collecting | `P5-04` | code done, needs a token |
| SEO audit passes on the launch config | `P3-01` | passes, minus the support address |
| Core Web Vitals on the real origin | `P3-02` | passes locally, needs the domain |
| A domain | `P5-05` | needs a name |
| AdSense approved | `P3-03` | needs a publisher ID, and everything above |

Two of these are automated and stay that way:

```bash
pnpm audit:seo      # 580 checks over 32 pages; also a CI step
pnpm audit:vitals   # LCP/CLS on a throttled mobile profile
```

`P5-06` is first. It is the only item on the list that changes what a visitor sees,
and it is on the page the whole site funnels into.

## Needs Mohmed

Things that cannot be done from a session, in the order they matter:

1. **Delete the Cloudflare Worker.** The site it served is superseded but still
   deployed at `img-hub.mvaid.workers.dev`. Two live copies of the same site is the
   one outcome [ADR-0008](adr/0008-github-pages-hosting.md) rejects outright, and it
   becomes a duplicate-content problem the moment indexing goes on. Either
   `npx wrangler delete` from a clone, or the Workers dashboard. Nothing in the repo
   references it any more.
2. **The analytics token** (`P5-04`). From the Cloudflare dashboard — Web Analytics
   works on any origin and does not need Cloudflare hosting. Add it as the
   `NEXT_PUBLIC_ANALYTICS_TOKEN` repository secret; the Pages workflow reads it, and
   `workflow_dispatch` republishes without an empty commit.
3. **A support address** (`P5-07`). `brand.supportEmail` is still
   `support@example.com`, and the contact page renders it.
4. **A product name**, which unblocks the domain, then indexing, then AdSense
   (`P5-05`, `P3-03`).

Indexing is not on this list. It stays off until Mohmed says so in as many words —
rule zero in `CLAUDE.md`.

## Releases

Tagged in git with an entry in [CHANGELOG.md](../CHANGELOG.md). Backfilled on
2026-08-31, after four phases had merged without either.

| Tag | Phase |
|---|---|
| `v0.4.0` | Editor UX |
| `v0.3.0` | Pre-launch gates |
| `v0.2.0` | Full toolkit and the tool pages |
| `v0.1.0` | Working MVP |
| `v0.0.1` | Foundation |

## Health

| Check | State |
|---|---|
| CI | Passing |
| Tests | 584 passing at 96.7% statement coverage, plus a 19-check smoke suite and a 580-check SEO audit, both run against a subpath build |
| Typecheck | Clean, strict mode |
| Lint | Clean |
| Production build | Passing; publishes to https://mohmedvaid.github.io/img-hub/ on merge to `main` |
| Browser smoke | 19/19 passing |
| Known bugs | None. Colour profile and PNG optimisation are unimplemented, not broken — P1-11, P1-12 |
