# Status

Where the project is **right now**. Regenerated from [BACKLOG.md](BACKLOG.md) — this
file is a view, not a source. If the two disagree, the backlog is right.

**Last updated:** 2026-08-30 · **Release:** `v0.0.1` · **Phase:** 0 complete, 1 not started

## At a glance

| | Count |
|---|---|
| Done | 12 |
| In progress | 0 |
| To do (Phase 1) | 9 |
| Blocked | 0 |

## In progress

Nothing. Phase 0 is merged; Phase 1 has not been picked up.

## Next up

The top of the Phase 1 backlog, in dependency order:

1. `P1-01` Worker harness and Comlink RPC boundary
2. `P1-02` Decode and encode via jSquash codecs
3. `P1-03` Canvas resize transform

`P1-01` blocks everything else in Phase 1, so it goes first and alone.

## Recently done

- Repo foundation: framework, tooling, CI, docs, skills (`P0-01` … `P0-12`)
- Pipeline model, error taxonomy and versioned schema, 74 tests passing
- Four ADRs recording the decisions behind the stack

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
| Tests | 74 passing |
| Typecheck | Clean, strict mode |
| Lint | Clean |
| Production build | Passing, all routes static |
| Known bugs | None |
