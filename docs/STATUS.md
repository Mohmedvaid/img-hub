# Status

Where the project is **right now**. Regenerated from [BACKLOG.md](BACKLOG.md) — this
file is a view, not a source. If the two disagree, the backlog is right.

**Last updated:** 2026-08-31 · **Release:** `v0.2.0` · **Phase:** 1 complete, 3 mostly shipped

## At a glance

| | Count |
|---|---|
| Done | 22 |
| In progress | 0 |
| To do (carried) | 3 |
| Blocked | 0 |

## In progress

Nothing. Phase 1 is on a branch awaiting review.

## Next up

1. Interactive crop UI, then `P1-10` (crop rectangle remap on rotation). This also
   unblocks the `crop-image` page, the last tool still dark
2. AVIF output behind the slow-encode warning
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
- Six ADRs recording the decisions behind the stack

## Open questions

| Question | Blocks | Owner |
|---|---|---|
| Domain and final product name | SEO config, OG image, launch | Mohmed |
| Logo and brand assets | `public/brand/*` are placeholders | Mohmed |

Neither blocks Phase 1: `config/brand.ts` and `NEXT_PUBLIC_SITE_URL` absorb both
changes when the answers arrive.

## Health

| Check | State |
|---|---|
| CI | Passing |
| Tests | 182 passing, plus a browser smoke suite |
| Typecheck | Clean, strict mode |
| Lint | Clean |
| Production build | Passing, all routes static |
| Browser smoke | 6/6 passing |
| Known bugs | None. Colour profile and PNG optimisation are unimplemented, not broken — P1-11, P1-12 |
