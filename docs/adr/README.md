# Architecture Decision Records

One file per decision that would be expensive to reverse. Short. Written when the
decision is made, not afterwards.

An ADR is never edited once accepted, because it records what was known at the
time. To change a decision, write a new ADR that supersedes it and add a
`Superseded by` line to the old one.

Not every choice needs an ADR. Write one when the answer to "why is it like this"
would otherwise be lost, or when someone is likely to try the alternative again.

## Template

```markdown
# NNNN. Title in the imperative

- **Status:** Accepted | Superseded by ADR-NNNN
- **Date:** YYYY-MM-DD

## Context
The forces at play. What constraint made this a real decision.

## Decision
What was chosen, stated plainly.

## Consequences
What this makes easy, what it makes hard, and what now becomes true forever.

## Alternatives considered
Each one, and the specific reason it lost.
```

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-process-images-client-side.md) | Process images client-side | Accepted |
| [0002](0002-jsquash-over-wasm-vips.md) | Use jSquash codecs, never wasm-vips | Accepted |
| [0003](0003-config-driven-branding.md) | Drive branding and limits from config | Accepted |
| [0004](0004-version-the-pipeline-schema.md) | Version the pipeline schema from day one | Accepted |
| [0005](0005-independent-operation-modules.md) | One module per operation, one shared runner | Accepted |
