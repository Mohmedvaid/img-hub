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
decode → rotate → crop → resize → strip metadata → encode
```

Pick what you want, run it once. And because it all happens client-side, files never
leave the device.

## Running it locally

Needs Node 20.9+ and pnpm (`npm i -g pnpm` if you do not have it).

```bash
git clone https://github.com/Mohmedvaid/img-hub.git
cd img-hub
pnpm install
pnpm dev            # http://localhost:3000
```

No `.env` file is needed. Every setting has a safe fallback, so a fresh clone runs
as-is. Copy `.env.example` to `.env.local` only when you want to override something.

Two pages exist today:

| Route | What it shows |
|---|---|
| `/` | The full builder. No primary feature; every option is a checkbox |
| `/compress-image` | A tool page. Compress is promoted to primary and always on |

Drop in some JPEGs or PNGs, tick what you want, and hit Run. Nothing is uploaded, so
the network tab stays empty.

### Commands

```bash
pnpm dev        # development server
pnpm verify     # lint + typecheck + test + build; run before every push
pnpm test       # unit tests only
pnpm smoke      # end-to-end browser test; needs the app running first
pnpm lint:fix   # format and autofix
```

`pnpm smoke` drives a real Chromium against a running server and asserts on actual
output bytes: EXIF auto-orientation, resize, rotate, cover-crop, batch resilience and
ZIP contents. It covers the WASM codec and Web Worker paths that unit tests cannot
reach. Run it against either `pnpm dev` or a production build:

```bash
pnpm dev &            # or: pnpm build && pnpm start &
pnpm smoke
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
