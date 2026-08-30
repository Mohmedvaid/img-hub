# 0004. Version the pipeline schema from day one

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

The product's defining feature is chaining operations into one pass. Shareable links
that encode a pipeline are on the roadmap for v1.0, and preset URLs for tool pages
arrive earlier.

The moment such a link is published, its encoded payload becomes a public contract.
Someone bookmarks it, another site links to it, a tutorial embeds it. Changing the
encoding after that breaks every one of them, silently, with no way to find out how
many.

Nothing reads the encoded form yet. Versioning it now costs one integer field.

## Decision

Every serialised pipeline carries a `v` field read before anything else.

- A payload from an older version passes through a registered migration chain.
- A payload from a newer version is rejected with a clear message, never guessed at.
- Decoding is fully defensive: input arrives from a URL and is treated as hostile.
  Every field is validated at runtime; nothing is cast.

`CURRENT_SCHEMA_VERSION` and the `MIGRATIONS` map live in
`src/lib/pipeline/schema.ts`.

## Consequences

- Adding a transform or renaming a field is a routine change: bump the version, add a
  migration, add a decode test using a captured payload from the old version.
- Old links keep working, which matters because they are the SEO and sharing surface.
- A newer-than-current payload fails loudly instead of silently dropping the settings
  it does not understand, which would otherwise hand someone a differently-processed
  image than the link promised.
- Slight overhead now: a version field nothing branches on yet, and a migration map
  that is empty.

## Alternatives considered

**Add versioning when shareable links ship.** The obvious call, and wrong. By then
tool pages are already encoding presets into URLs, so the contract is live before the
feature that made it explicit.

**Query parameters instead of an encoded blob** (`?w=800&fmt=webp`). More readable
and self-versioning in a loose sense. Rejected because transform *order* changes the
output, and query parameters have no reliable ordering. Order is part of the model,
so it has to be part of the encoding.
