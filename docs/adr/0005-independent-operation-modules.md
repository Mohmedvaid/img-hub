# 0005. One module per operation, one shared runner

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

Phase 0 put every transform type, its validation and its parsing in one file with one
switch per concern. Four operations made that fine. It does not survive the roadmap:
crop, rotate, resize, metadata, and later watermark, background removal and PDF
conversion all landing in the same three switches.

The product also needs something the original model could not express. Every
operation gets its own indexed page — `/crop-image`, `/png-to-webp`,
`/compress-image` — and on each page one feature leads while the rest are available
as optional extras. The page is what ranks; the extras are what make a visitor who
came for one thing use the others.

A single-file model gives no way to ask "what operations exist" or "which of them is
this page about".

## Decision

Two layers, with different jobs.

**Operations** are the engine's units of work. Each lives in one file under
`src/lib/pipeline/operations/` and owns its transform type, defaults, validation and
parsing, behind the `OperationModule` contract. Operations never import each other.

**Features** are the page's units of choice, in `src/lib/pipeline/features.ts`. A
feature carries the label, the hint and — critically — whether enabling it reveals
any fields at all.

The two lists are deliberately not identical. `convert` and `compress` are separate
features that both drive the single encode step, because they are separate search
intents wanting different controls in front of them.

Every tool page names one **primary** feature. It is always on and gets the main UI.
Every other feature is derived into an optional checkbox; ticking it reveals that
feature's fields, or nothing when `hasFields` is false.

## Consequences

- Adding an operation is one new file plus one line in each of three delegating
  switches in `registry.ts`. Those switches are exhaustive, so forgetting a line is a
  compile error naming the exact spot, not a runtime lookup that silently misses.
- The optional-feature list per page is **derived**, never written out. Adding a
  feature offers it on every existing page without editing a single tool definition.
- Enumerating operations is now possible, which is what drives the checkbox UI and
  lets `sortTransforms` guarantee application order independently of the order a user
  added things.
- `OutputSpec.format` gained `'source'`. This is what makes conversion optional: on a
  cropper page the visitor has said nothing about format, so the output keeps the
  input's. Without it, every page silently converted, which is a change the user
  never asked for.
- Cost: two layers where there was one, and the feature/operation distinction has to
  be explained to anyone new. That is the price of `convert` and `compress` being one
  operation and two products.

## Alternatives considered

**Keep one file, split when it hurts.** The usual right answer, and rejected here for
a specific reason: the page model needs to enumerate operations, and enumeration is
exactly what a hand-written switch cannot provide. The refactor was not deferrable
because a feature depends on it, not because the file was getting long.

**One folder per operation** (`operations/crop/{types,validate,parse}.ts`). Rejected
as premature: four files per operation, most of them ten lines. Split a module when
its `apply` step arrives and earns it, not before.

**Make `convert` and `compress` one feature.** Simpler model, and wrong for the
product. They are two of the highest-volume search intents in this category and want
different primary controls. Collapsing them would mean one page trying to rank for
both and leading with the wrong control for half its visitors.
