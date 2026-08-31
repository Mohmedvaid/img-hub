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
| A new operation (crop, resize, watermark…) | a new file in `src/lib/pipeline/operations/` |
| A page-level feature or its checkbox copy | `src/lib/pipeline/features.ts` |
| Enumeration, ordering or dispatch | `src/lib/pipeline/registry.ts` |
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

### Operations are independent

Each operation is one file under `operations/`, implementing `OperationModule`: its
transform type, `defaults()`, `validate()` and `parse()`.

**Operations never import each other.** If one needs another's logic, that logic
belongs in a shared module, not in a cross-import. This is enforced by a
`noRestrictedImports` rule in `biome.json`, not left to review — the same rule also
blocks importing `registry.ts` or `types.ts` from an operation, since both would be
cycles.

Adding an operation:
1. Create `operations/<name>.ts` exporting its transform type and its module.
2. Add the type to the `Transform` union in `types.ts`.
3. Add it to `OPERATIONS` in `registry.ts`, and one line to each of the three
   delegating switches. They are exhaustive, so TypeScript names every spot.
4. Add it to `features.ts` if it is user-facing, with its label, hint and `hasFields`.
5. Bump `CURRENT_SCHEMA_VERSION` and add a migration **if the change is not purely
   additive**.
6. The shared contract tests in `operations/operations.test.ts` cover it
   automatically. Add cases for anything specific to it.

The switches in `registry.ts` are pure delegation — one line per operation, no logic.
If one grows a condition, that condition belongs in the operation module.

### Before adding an image codec

Two jSquash packages have been added and reverted for the same reason. Check both of
these before writing any code against a new one:

1. **Does it ship a multi-threaded build?** Look for `-mt`, `parallel`, `rayon` or
   `.worker.` in its file list. Those builds need WebAssembly threads, which need
   SharedArrayBuffer, which needs the COOP/COEP headers ADR-0002 permanently forbids.
   They can never run here, but the bundler still processes them.
2. **Measure a cold `pnpm build`** against the ~13s baseline before writing UI.
   `@jsquash/oxipng` took it to 175s; `@jsquash/avif` to 112s. Both were reverted.

Neither cost is visible from the package README, and neither shows up until a full
production build. See P1-12 and P2-01 in the backlog for what a reopen needs.

### Order is fixed and load-bearing

`OPERATIONS` in `registry.ts` defines the apply order: **rotate → crop → resize →
metadata**, with EXIF auto-orientation baked in at decode before any of it.

Do not reorder it. Crop coordinates are in post-rotation space, so the order is what
makes a saved pipeline mean the same thing every run — and shareable links depend on
that. Tests assert the order and state the reasoning; if one fails, read it before
changing it.

Two rules that follow:

- Any new decode path **must** auto-orient from EXIF and reset the tag. Stripping EXIF
  is on by default, so skipping this ships sideways phone photos.
- A new operation goes in the position its correctness requires, not at the end.
  Justify the position in its module doc comment.

### Features versus operations

`features.ts` is the page layer, not the engine layer. `convert` and `compress` are
two features over one encode step, because they are two search intents.

A page names one **primary** feature; the optional checkboxes are derived from the
rest. Never hand-write a per-page list of optional features — adding a feature must
light it up everywhere at once.

Set `hasFields: false` when ticking the checkbox is the whole interaction.

A tool's `preset` in `config/tools.ts` is what makes one page differ from another, and
it must actually reach the builder — `ImageToolkit` takes both `primary` and `preset`.
Config that the code ignores is worse than no config: `png-to-jpg` shipped producing
WebP because the preset was never read. If you add a field to a tool definition, follow
it through to something that consumes it.

The primary feature gets the same controls its optional checkbox would reveal, minus
the checkbox. A converter with no format picker can only ever produce what its preset
named.

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
| A test that computes its expectation from the value under test | Passes forever. See Testing below |
| A UI action composed in the file's coordinate space | Clicks act on what is on screen. See `orientation.ts` |

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
- `pnpm test:coverage` enforces 80% thresholds. They are a floor for noticing an
  untested module, not a target — a covered line is not an asserted one.

### A test must not derive the expected value the way the code does

The orientation test had a loop over every three-click sequence that looked
exhaustive and proved nothing: it computed the expected corner position *from the
composed orientation*, which is the value under test. It compared a value with itself
and passed for weeks while rotate-then-flip returned flip-then-rotate's image.

Before trusting a test, ask what it would take to make it fail. If the answer is not
obvious, break the implementation on purpose and watch it go red. Two independent
descriptions of the same thing is the shape to aim for — in that case, one model of
what the user clicked and one of what the engine renders, with only the code under
test linking them.

### What browser-only means, and what it does not excuse

`OffscreenCanvas`, `createImageBitmap` and the WASM encoders do not exist in jsdom, so
`rotate.apply`, `resize.apply` and the encoders are not unit-testable. Stubbing a
rasteriser would test the stub.

They are covered in `scripts/smoke.mjs` against a real Chromium instead, and that
coverage is specific: it downloads the output, decodes it, and samples the four
corners of a four-colour fixture. Dimensions alone cannot tell a 180° turn from a
double flip. If you touch geometry, run `pnpm smoke` — the unit suite cannot catch you.

Stubbing a global the code merely *calls* is fine and expected: `decode.test.ts` stubs
`createImageBitmap` to assert the options it is asked for and the limits applied to
what comes back. The line is whether the stub has to reimplement the behaviour under
test.

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
