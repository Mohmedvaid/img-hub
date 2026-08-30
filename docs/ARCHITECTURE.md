# Architecture

How ImgHub is built and why. Decisions that were expensive to make are recorded as
[ADRs](adr/); this document describes the resulting system.

## The one-sentence version

Every tool in the product is the same ordered pipeline running in a Web Worker on the
user's own device, with a different preset and different copy per page.

## The core idea

Competing sites ship a resize tool, a convert tool and a compress tool as three
unrelated pages, so doing all three means three uploads and three downloads. ImgHub
models the work as a single pipeline instead:

```
decode → [crop] → [rotate] → [resize] → [strip metadata] → encode
```

That one structure serves three purposes at once:

1. **Product.** The home page exposes the pipeline directly, which is the "do
   everything in one pass" flow that is the reason to build this.
2. **SEO.** `/png-to-webp`, `/compress-image`, `/resize-image` are the same engine
   with a preset applied. Hundreds of long-tail pages, one implementation.
3. **Code.** Image operations live in exactly one place. There is no "resize engine"
   separate from a "convert engine".

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
  types.ts           Transform union, OutputSpec, Pipeline, validation
  errors.ts          Error taxonomy and the Result type
  schema.ts          Versioned URL encoding and migrations (ADR-0004)

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
