# 0003. Drive branding, theming and limits from config

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

The project starts without a domain or a finished brand. Product name, colours,
fonts, logo paths and the canonical URL are all going to change, some of them more
than once.

Hardcoding any of them means a find-and-replace across the codebase later, which is
the kind of change that reliably misses a spot and ships a stale name in a meta tag
nobody looks at.

## Decision

Everything environment- or brand-specific lives in `config/`, and nothing outside
`config/` hardcodes a brand value, colour, size limit or URL.

| File | Owns |
|---|---|
| `config/brand.ts` | Name, tagline, description, logos, OG image, social, legal |
| `config/theme.ts` | Every colour and font token, light and dark |
| `config/site.ts` | Canonical URL, SEO defaults, ad and analytics IDs, feature flags |
| `config/limits.ts` | File size, pixel and batch caps; enabled formats |
| `config/security.ts` | Every response header |
| `config/tools.ts` | The tool registry that drives routes and the sitemap |

Design tokens are rendered into a `:root` block by the root layout and mapped onto
Tailwind utility names via `@theme inline` in `globals.css`. Token *values* live only
in `config/theme.ts`; `globals.css` only names them, so it changes when a token is
added, never when one is edited.

## Consequences

- Renaming the product is one file. Rebranding is two.
- The domain is a single env var, so the first deploy does not require a code change.
- Tokens are emitted with a `--t-` prefix to avoid colliding with the `--color-*`
  variables Tailwind generates.
- There is a real cost: an indirection between "the brand colour" and the literal
  value. It is worth it here specifically because these values are known to be
  unsettled. It would not be worth it for a stable product.

## Alternatives considered

**Hardcode now, extract later.** Cheaper today. Rejected because "later" arrives at
the same time as the first real deploy, when there is the most to miss and the least
appetite for a sweeping refactor.

**A CMS or remote config.** Wildly disproportionate. These values change a handful of
times, by the person editing the code.
