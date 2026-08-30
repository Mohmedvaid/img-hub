---
name: workflow
description: The development workflow for this repo — branching, commits, PRs, backlog hygiene, and the builder/reviewer split. Use whenever starting a ticket, opening a PR, merging, or asking "what should I work on next" in img-hub. Also use before any commit, to check the branch and backlog rules were followed.
---

# Workflow

How work moves through this repo. Follow it exactly; it exists so that state is never
guessed at from git history.

## The one rule that outranks the others

**Never commit to `main`.** Every change goes on a branch and merges after Mohmed
approves it. There is no automated approval, no bot merge, and no branch protection
rule standing in for the human gate. His merge *is* the gate.

The single exception was the Phase 0 foundation commit, which he authorised
explicitly. It does not generalise.

## Starting work

1. **Pick a ticket from `docs/BACKLOG.md`.** Work without a ticket ID does not start.
   If a task is real but has no ticket, write the ticket first.
2. **Check it is not blocked.** Blocked tickets name what blocks them.
3. **Branch from the latest `main`:**
   ```
   git fetch origin main
   git checkout -b <type>/<ticket-id>-<short-slug> origin/main
   ```
   `<type>` is `feat`, `fix`, `chore`, `docs` or `refactor`.
   Example: `feat/P1-03-canvas-resize`.
4. **Set the ticket to `in-progress`** in `docs/BACKLOG.md`, in your first commit.

One ticket per branch. One branch per PR. A branch that grows a second ticket gets
split.

## Commits

Conventional Commits, scoped to the area:

```
feat(pipeline): add cover and contain resize modes

Implements P1-03. Canvas-based, honours allowUpscale.
Refs: docs/BACKLOG.md#p1-03
```

- Present tense, imperative. "add", not "added".
- Body explains *why* when the reason is not obvious from the diff.
- Never mention which AI model produced the change, in any commit, PR or file.

## Before every push

Run the full gate. A push that reddens CI costs a review cycle:

```
pnpm verify
```

That is lint, typecheck, tests and a production build. If it does not pass locally,
it will not pass in CI.

Then re-read your own diff adversarially and ask what a reviewer would reject.

## Opening a PR

- Title: the ticket ID and what changed.
- Body: what changed, why, how it was verified, and anything deliberately left out.
- Link the ticket.
- Update `docs/BACKLOG.md` status and `docs/STATUS.md` **in the same PR**. A status
  update in a follow-up PR is a status update that will not happen.

Never open a PR unless Mohmed asked for one.

## The builder/reviewer split

**One session builds. A different session reviews.** Never both in one session.

A session that wrote the code has already decided the code is right; it cannot
review it honestly. The reviewer needs context that did not write the thing. When
review is wanted, it is a fresh session pointed at the diff.

## Merging

Mohmed merges. After a merge:

1. Set the ticket to `done` in `docs/BACKLOG.md`.
2. Regenerate the counts and "next up" in `docs/STATUS.md`.
3. Delete the branch.
4. Tag and add a `CHANGELOG.md` entry if the merge completes a phase.

## Documentation

**Docs are updated, never duplicated.** Before adding any document, find the one
that already owns the topic:

| Topic | Owner |
|---|---|
| How something is built, module boundaries | `docs/ARCHITECTURE.md` |
| A decision that would be expensive to reverse | a new ADR in `docs/adr/` |
| What ships and in what order | `docs/ROADMAP.md` |
| Tickets and their status | `docs/BACKLOG.md` |
| Where the project is right now | `docs/STATUS.md` (a view over the backlog) |
| What a feature does and its acceptance criteria | `docs/FEATURES.md` |

If a change makes an existing doc wrong, fixing it is part of that change.

Write an ADR when a decision would otherwise leave someone asking "why is it like
this", or when a rejected alternative is likely to be proposed again. ADRs are never
edited after acceptance; supersede them with a new one.

## When something is unclear

Ask once, with the specific question and the options. Do not build both branches of
an ambiguity, and do not pick silently when the choice is material.

State a disagreement once, with the reason. Then do it Mohmed's way and do not raise
it again.
