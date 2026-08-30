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

Every tool is the same ordered pipeline — decode, crop, rotate, resize, strip
metadata, encode — running in a Web Worker on the user's own device. Tool pages are
that engine with a preset and different copy, generated from `config/tools.ts`.

The engine returns `Result<T>` rather than throwing, because a batch is many files
and one corrupt file must not abort the rest.
