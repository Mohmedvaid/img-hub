# Architecture

How ImgHub is built and why. Decisions that were expensive to make are recorded as
[ADRs](adr/); this document describes the resulting system.

## The one-sentence version

Independent operation modules, one shared runner, and one indexed page per operation
where that operation leads and the rest are optional extras.

## The core idea

Competing sites ship a resize tool, a convert tool and a compress tool as three
unrelated pages, so doing all three means three uploads and three downloads. ImgHub
models the work as a single pipeline instead:

```
decode → [rotate] → [crop] → [resize] → [strip metadata] → encode
```

That one structure serves three purposes at once:

1. **Product.** The home page exposes the pipeline directly, which is the "do
   everything in one pass" flow that is the reason to build this.
2. **SEO.** `/png-to-webp`, `/compress-image`, `/resize-image` are the same engine
   with a preset applied. Hundreds of long-tail pages, one implementation.
3. **Code.** Image operations live in exactly one place. There is no "resize engine"
   separate from a "convert engine".

## Operations and features

Two layers, with different jobs. Confusing them is the main way this design gets
misread.

**Operations** are the engine's units of work. Each is one file under
`src/lib/pipeline/operations/`, owning its transform type, defaults, validation and
parsing behind the `OperationModule` contract. **Operations never import each other.**
Adding one is a new file plus one line in each of three delegating switches in
`registry.ts`; those switches are exhaustive, so a missing line is a compile error
naming the exact spot.

**Features** are the page's units of choice, in `src/lib/pipeline/features.ts`. A
feature carries its label, its hint, and whether enabling it reveals any fields.

The lists are not identical on purpose. `convert` and `compress` are two features
driving the single encode step, because they are two search intents wanting different
controls in front of them.

## How a tool page works

Every page names one **primary** feature in `config/tools.ts`:

- The primary feature is **always on**, cannot be switched off, and gets the main UI.
  It is what the page ranks for.
- Every other feature becomes an **optional checkbox**, derived rather than listed.
  Ticking it reveals that feature's fields — or nothing at all, when `hasFields` is
  false. Compression is the case that motivated this: ticking "also compress" applies
  a sensible quality and shows no slider, because tuning quality is the compressor
  page's job.

Because the optional list is derived, adding a feature offers it on every existing
page without touching a single tool definition.

`OutputSpec.format` can be `'source'`, which is what makes conversion genuinely
optional. On a cropper page the visitor has said nothing about format, so the output
keeps the input's. Without it every page would silently convert — a change the user
never asked for.

Tool pages deep-link into the full builder, which is how a visitor who arrived for
one operation discovers the rest.

## Layout

```
config/            Everything brand-, environment- or policy-specific (ADR-0003)
  brand.ts           Name, logos, OG image, social, legal
  theme.ts           Colour and type tokens, light and dark
  site.ts            Canonical URL, SEO defaults, ad/analytics IDs, feature flags
  limits.ts          File size, pixel and batch caps; enabled formats
  security.ts        Every response header
  tools.ts           Tool registry; drives routes and the sitemap

src/lib/pipeline/  The engine. No React, no DOM assumptions, fully unit-testable
  formats.ts         Format facts: MIME types, alpha/animation support, encode cost
  operation.ts       The OperationModule contract every operation implements
  operations/        One file per operation. They never import each other
    crop.ts            Owns CropTransform, its defaults, validation and parsing
    resize.ts
    rotate.ts
    metadata.ts
  types.ts           Transform union, OutputSpec, Pipeline. Assembly only
  registry.ts        Enumeration, ordering, and delegating dispatch (ADR-0005)
  features.ts        The page layer: what a page offers and what leads
  errors.ts          Error taxonomy and the Result type
  schema.ts          Versioned URL envelope and migrations (ADR-0004)

src/lib/seo/       Metadata construction from config
src/app/           Routes, layout, robots and sitemap
```

## Facts versus policy

A distinction worth keeping straight, because getting it wrong is how config layers
rot:

- **Facts** live in `src/lib/pipeline/formats.ts`. "JPEG cannot store transparency"
  is true regardless of what we ship.
- **Policy** lives in `config/limits.ts`. "We currently offer AVIF output" is a
  product decision.

Enabling a format is therefore a config change. Adding a format is a code change.

## Processing model

All work happens in the browser (ADR-0001). Nothing is uploaded, so there is no
storage, no database, no auth and no backend in the MVP.

Codecs come from jSquash rather than wasm-vips, because wasm-vips requires
`SharedArrayBuffer`, which requires COOP/COEP headers, which break AdSense
permanently (ADR-0002). **COOP and COEP must never be set.** `config/security.ts`
owns every header and repeats this warning at the point of change.

## Order is load-bearing

The operation order is fixed and asserted by tests, not left to the sequence a user
enabled things in. Reordering changes the output of identical saved settings, which
would break shareable links. ADR-0006 has the full reasoning; the two facts to carry:

- **Crop coordinates are in post-rotation pixels.** Crop runs after rotate, so a box
  the user drew on a rotated preview lands where they drew it. The UI remaps the
  stored rectangle when rotation changes.
- **Decoding auto-orients from EXIF before anything else runs.** Phone photos carry an
  Orientation tag; stripping it without baking the rotation into pixels leaves them
  sideways. Since EXIF stripping is on by default, this is a correctness requirement,
  not an enhancement.

Geometry (resize, crop, rotate) uses Canvas. Encoding uses the WASM codecs, because
browser-native encoders produce visibly worse files at the same byte size, and
compression quality is the product.

## Error handling

A batch is many files, and one corrupt file failing is expected rather than
exceptional. If the engine threw, a single bad file would abort a 40-file job.

So every engine entry point returns `Result<T>` instead of throwing:

```ts
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: PipelineError }
```

`PipelineError` carries a **stable `code`** (analytics, help content and support key
off it, so codes are never renamed once shipped), a **user-facing `message`** that
may be reworded freely, an optional **`detail`** for logs only, the **`stage`** that
failed, and whether it is **`retryable`**.

`detail` is never rendered, because decoder output can contain file content.

Exceptions are caught only at boundaries we do not control — codec modules and the
worker's structured-clone barrier — and normalised by `normaliseThrown`. Application
code returns Results directly.

Default copy for every code lives in one table in `errors.ts`, so reviewing all
user-facing error wording means reading one screen.

## Rules that hold everywhere

- **No barrel files.** Import from the module that defines the thing.
- **No wrappers that only forward arguments.** Call the target.
- **No interface with one implementation.** Add it when the second caller exists.
- **`try/catch` catches to handle.** Never to log and rethrow.
- **Comments explain why.** The code already says what.

Repo-specific conventions are enforced through `.claude/skills/img-hub-conventions/`.

## What is deliberately absent

Named so nobody adds them speculatively:

| Not built | Because | Build it when |
|---|---|---|
| Database | Nothing is stored | Accounts or saved presets ship |
| Auth | No accounts | A paid tier exists |
| Backend API | Nothing is uploaded | HEIC input or the developer API arrives |
| State library | One pipeline, one reducer | State is shared across unrelated trees |
| Component library beyond a few primitives | The UI is dropzones, sliders and selects | Never, probably |

## Escalation triggers

The conditions that would change the architecture, so they can be recognised rather
than argued about:

1. **AVIF abandonment** in analytics → move slow encodes to an edge function.
2. **HEIC demand** → the first server-side path; jSquash also runs on Cloudflare
   Workers, so codecs do not change.
3. **A developer API becoming a product** → `sharp` on a server, as a separate
   surface, not by growing this one.

## Deployment

Every route prerenders, so `pnpm build` emits plain files into `out/` — no server
process, no runtime. Hosting is Cloudflare; the reasoning, including why not Vercel,
is in [ADR-0007](adr/0007-cloudflare-static-hosting.md).

Two consequences are worth knowing before touching either file:

**`headers()` in `next.config.ts` applies only to `next dev`.** A static export has no
server to run it. Production gets the same list from `out/_headers`, generated by
`scripts/headers.mjs` from `config/security.ts` — the same module the dev server
reads, so the CSP cannot drift between the two. The generator exits non-zero if COOP
or COEP ever appear, which turns the prohibition in ADR-0002 from a comment into a
failing build.

**`next start` does not work with a static export.** `pnpm start` runs
`scripts/serve.mjs` instead, a static server that reads `out/_headers` and applies it.
That is what the smoke suite, the SEO audit and the vitals run point at, so those runs
exercise the real response headers rather than a header-free approximation. It is a
test harness, not production: no caching, no compression.
