---
name: img-hub-conventions
description: Code conventions for the img-hub repo — where things go, the pipeline engine rules, the error taxonomy, config versus hardcoding, testing requirements, and the anti-patterns to reject in review. Use before writing or reviewing any code in this repo, and whenever adding a format, transform, tool page or error code.
---

# img-hub conventions

Repo-specific rules. Architectural judgement is not covered here; that lives in the
`web-architecture` skill. This file answers "where does this go and what shape is it"
for *this* codebase.

## Where things go

| Adding | Goes in |
|---|---|
| A brand value, colour, font, logo, URL | `config/` — never inline |
| A size, pixel or batch limit | `config/limits.ts` |
| A response header | `config/security.ts` |
| A tool page or format pair | `config/tools.ts` |
| A fact about an image format | `src/lib/pipeline/formats.ts` |
| A transform or output option | `src/lib/pipeline/types.ts` |
| An error code | `src/lib/pipeline/errors.ts` |
| Anything touching the encoded URL form | `src/lib/pipeline/schema.ts` + a version bump |

## Facts versus policy

Keep these apart or the config layer rots:

- **Fact:** "JPEG cannot store transparency." True regardless of what we ship. Lives
  in `formats.ts`.
- **Policy:** "We currently offer AVIF output." A product decision. Lives in
  `config/limits.ts`.

Enabling a format is a config change. Adding one is a code change.

## Never hardcode

No hex colours, font stacks, product names, logo paths, domains or size limits
outside `config/`. Token *values* live in `config/theme.ts`; `src/app/globals.css`
only maps them onto Tailwind names, so it changes when a token is added, never when
one is edited.

Tokens carry a `--t-` prefix so they never collide with Tailwind's own `--color-*`.

## The engine returns Results, it does not throw

Every entry point in `src/lib/pipeline/` returns `Result<T>`:

```ts
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: PipelineError }
```

Because a batch is many files and one bad file must not abort the other thirty-nine.

- Construct errors with `pipelineError()` or `fail()`, never a `PipelineError` literal.
- Catch exceptions only at boundaries we do not control — codec modules, the worker's
  structured-clone barrier — and normalise with `normaliseThrown`.
- `error.detail` is for logs. It is never rendered: decoder output can contain file
  content.
- Error **codes are permanent**. Analytics, help content and support key off them.
  Reword `message` freely; never rename a code that has shipped.

Adding an error code means adding it to `PipelineErrorCode` *and* to `ERROR_SPECS`.
TypeScript enforces this — the record is exhaustive on purpose.

## The pipeline model

Transforms are an ordered list; encoding is a separate terminal step. That is
deliberate: "encode happens last, exactly once" is then true by construction rather
than a rule that validation has to catch.

Adding a transform:
1. Add its type to the `Transform` union in `types.ts`.
2. Handle it in `validateTransform`. The switch is exhaustive; TypeScript will point
   at every site that needs updating.
3. Add a `parse*` function in `schema.ts` and wire it into `parseTransform`.
4. Bump `CURRENT_SCHEMA_VERSION` and add a migration **if the change is not purely
   additive**.
5. Add round-trip and rejection tests.

## Anti-patterns to reject

These get sent back in review:

| Pattern | Why |
|---|---|
| Barrel `index.ts` re-exporting a directory | Breaks tree-shaking, hides the real path, invites cycles |
| A wrapper that forwards its arguments unchanged | Indirection with no behaviour. Call the target |
| An interface with one implementation | An abstraction for a second case that does not exist |
| A defensive check for an impossible state | Either it is possible and needs real handling, or it is a lie about the types |
| `try/catch` that logs and rethrows | A stack frame and a duplicate log line. Catch to handle or do not catch |
| A comment restating the line below it | Comments explain *why* |
| `utils.ts` past three unrelated functions | Name the actual concern |
| A config object consumed by one function | Two positional arguments were fine |
| A test asserting a mock was called | Tests the test. Assert the observable outcome |
| `handleX` that only calls `x` | Naming ceremony |
| `as` casts on parsed input | Validate at runtime; URL and file input is hostile |

Before adding a file, layer or dependency, answer all three:
1. What breaks if we do not build this? "Nothing yet" means not yet.
2. Who is the second caller? One caller is not an abstraction.
3. What would we delete to undo it? More than two files means the coupling is the cost.

## Testing

- Engine logic gets unit tests. It has no DOM dependency specifically so this is easy.
- Validation and parsing get **rejection tests**, not just happy paths. Schema input
  arrives from URLs and is treated as hostile.
- Codec work gets golden-file tests asserting output size within a tolerance band.
  Exact byte equality breaks on every codec upgrade and teaches people to ignore
  failures.
- Never assert a mock was called. Assert what the user would observe.
- When a bug is fixed, the regression test comes with it in the same commit.

## Style

- TypeScript strict, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Omit optional properties rather than setting them
  `undefined`.
- No `any`. No non-null assertions. Both are lint errors.
- Biome owns formatting. Never hand-format; run `pnpm lint:fix`.
- Comments explain why. Doc comments on exported functions explain the contract and
  any non-obvious cost.

## Before pushing

```
pnpm verify
```

Lint, typecheck, test, build. All four, every time.
