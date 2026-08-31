# ImgHub

All-in-one browser-based image toolkit. Convert, compress, resize and more in a single
pass, entirely client-side.

## Read these first

| Skill | When |
|---|---|
| `.claude/skills/workflow/` | Starting a ticket, committing, opening a PR |
| `.claude/skills/img-hub-conventions/` | Writing or reviewing any code here |
| `.claude/skills/security/` | Headers, CSP, dependencies, file intake, worker code |

| Doc | Owns |
|---|---|
| `docs/ARCHITECTURE.md` | How it is built |
| `docs/adr/` | Decisions and why alternatives lost |
| `docs/ROADMAP.md` | What ships, in what order |
| `docs/BACKLOG.md` | Tickets and status — the source of truth |
| `docs/STATUS.md` | Where things stand right now |
| `docs/FEATURES.md` | Feature specs and acceptance criteria |

## The three things most likely to be got wrong

0. **Never turn indexing on.** `NEXT_PUBLIC_ALLOW_INDEXING` stays unset until Mohmed
   says so in as many words, in chat. Not when the audits pass, not when a domain
   exists, not when it looks ready. He flips it; nobody else, and no inference from
   context counts as permission.

1. **Never commit to `main`.** Branch, PR, and wait for Mohmed's approval. His merge
   is the gate.
2. **Never set COOP or COEP headers**, and never adopt a library needing
   `SharedArrayBuffer`. It silently kills AdSense, which is the revenue model.
   See ADR-0002.
3. **Never hardcode a brand value, colour, limit or URL.** It goes in `config/`.

## Commands

```
pnpm dev        # development server
pnpm verify     # lint + typecheck + test + build — run before every push
pnpm test       # tests only
pnpm lint:fix   # format and autofix
```

## Shape of the thing

Every tool is the same ordered pipeline — decode, rotate, crop, resize, strip
metadata, encode — running in a Web Worker on the user's own device. The order is
fixed and load-bearing, not a default; ADR-0006 explains why, including why crop
coordinates are in post-rotation space.

Each operation is an independent module under `src/lib/pipeline/operations/`; they
never import each other. The runner is shared.

Each tool page names one **primary** feature that is always on and leads the UI. Every
other feature is a derived optional checkbox. Pages keep the source format unless
convert is ticked, so a cropper never silently hands back a different file type.

The engine returns `Result<T>` rather than throwing, because a batch is many files
and one corrupt file must not abort the rest.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
