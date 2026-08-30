# ImgHub

Every image tool, one pass.

Convert, compress and resize in a single operation instead of three separate
round-trips through three unrelated tools. Everything runs in the browser, so images
are never uploaded.

**Status:** Phase 0 — foundation. No UI yet. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Why

Plenty of sites convert an image. Plenty compress one. Even the sites that do both
treat them as separate tools, so resizing a photo, converting it to WebP and
compressing it means three uploads, three waits and three downloads.

ImgHub models the work as one pipeline:

```
decode → crop → rotate → resize → strip metadata → encode
```

Pick what you want, run it once. And because it all happens client-side, files never
leave the device.

## Getting started

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` to override defaults. Everything has a safe
fallback, so a fresh clone runs with no env file.

```bash
pnpm verify     # lint + typecheck + test + build; run before every push
pnpm test       # tests only
pnpm lint:fix   # format and autofix
```

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS v4, tokens from `config/theme.ts` |
| Processing | jSquash WebAssembly codecs in a Web Worker |
| Tooling | Biome, Vitest, pnpm |

Codecs are jSquash rather than wasm-vips for a specific reason: wasm-vips needs
`SharedArrayBuffer`, which needs COOP/COEP headers, which permanently break AdSense.
See [ADR-0002](docs/adr/0002-jsquash-over-wasm-vips.md).

## Layout

```
config/            Brand, theme, site, limits, security, tool registry
src/lib/pipeline/  The engine: formats, types, errors, versioned schema
src/lib/seo/       Metadata construction
src/app/           Routes, layout, robots, sitemap
docs/              Architecture, roadmap, backlog, status, features, ADRs
.claude/skills/    Workflow, conventions and security rules for this repo
```

Nothing outside `config/` hardcodes a brand value, colour, limit or URL.

## Docs

- [Architecture](docs/ARCHITECTURE.md) — how it is built
- [Decision records](docs/adr/) — why, and what lost
- [Roadmap](docs/ROADMAP.md) — what ships and when
- [Backlog](docs/BACKLOG.md) — tickets and status
- [Status](docs/STATUS.md) — where things stand
- [Features](docs/FEATURES.md) — specs and acceptance criteria

## Contributing

Work happens on branches and merges after review; `main` is never committed to
directly. The full workflow is in [`.claude/skills/workflow/`](.claude/skills/workflow/SKILL.md).
