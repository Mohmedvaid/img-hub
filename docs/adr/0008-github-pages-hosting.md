# 0008. Host on GitHub Pages, accepting the loss of response headers

- **Status:** Accepted
- **Date:** 2026-09-13
- **Supersedes:** [ADR-0007](0007-cloudflare-static-hosting.md)

## Context

ADR-0007 put the site on Cloudflare Workers static assets, and it worked: deployed,
live at `img-hub.mvaid.workers.dev`, $0/month, headers verified in production.

Mohmed asked for it to move to GitHub Pages and be served from the free
`github.io` URL. The trade below was put to him before any work started; he confirmed.
This ADR records what the move costs so nobody re-derives it later, and so that
reversing it is a known quantity rather than an investigation.

It is worth being plain about the reasoning: this is not a decision driven by a
technical advantage of GitHub Pages over Cloudflare Workers. There isn't one for this
workload. It is a decision to keep the whole project — source, CI and hosting — inside
one account that is already the source of truth, at the cost described below. That is
a legitimate thing to want.

### What GitHub Pages cannot do

**It sets no response headers.** There is no `_headers` file, no configuration, no
escape hatch. Every header in `config/security.ts` simply stops being sent.

That list was: `Content-Security-Policy`, `X-Content-Type-Options`,
`Referrer-Policy`, `X-Frame-Options`, `Strict-Transport-Security` and
`Permissions-Policy`.

### What can be recovered, and what cannot

Two of the six travel in the document instead:

| Protection | Recovered how | Complete? |
|---|---|---|
| `Content-Security-Policy` | `<meta http-equiv>`, injected at build time | all but `frame-ancestors` |
| `Referrer-Policy` | `<meta name="referrer">` | yes |

The CSP is the important one, and it is the one that survives. `connect-src 'self'` —
the directive that makes "your images never leave your device" enforced rather than
promised — is intact in the meta policy, which is the policy visitors actually get.
A meta tag silently drops `frame-ancestors`, `report-uri`, `report-to` and `sandbox`,
so `metaContentSecurityPolicy()` strips them rather than claiming protection that is
not there.

The other four are gone, and `headerOnlyProtections` in `config/security.ts` records
what each costs. In summary: this app has no login, no session and no state-changing
action, so clickjacking has nothing to hijack; every file served is one this build
produced, so there is nothing for a browser to mis-sniff; and nothing in the app asks
for camera, microphone or geolocation. They were backstops rather than controls here.
That is a real reduction in defence in depth, and a smaller one than the same change
would be for almost any other kind of site.

`securityHeaders` is deliberately left intact and complete. It is what a
header-capable host would serve, and moving to one restores all six with no code
change.

### The other consequences

**The site lives at `/img-hub`, not at a root.** A GitHub Pages project site is served
from `/<repo>`. Every asset URL and internal link needs that prefix, which Next
applies from `basePath`.

The prefix is derived in `config/site.ts` from `NEXT_PUBLIC_SITE_URL` rather than
configured separately, because the base path and the canonical URL are two expressions
of one fact. Configured independently, they drift — and a deployment where they
disagree looks perfectly fine in a browser while every canonical tag and sitemap entry
points at a URL that 404s. The workflow takes that URL from
`actions/configure-pages`, so it comes from GitHub rather than from a value typed into
this repo.

**`robots.txt` is no longer at the host root.** Crawlers read
`mohmedvaid.github.io/robots.txt`, which belongs to the account, not to this repo. The
one this build emits lands at `/img-hub/robots.txt`, where nothing will read it. This
does not matter yet — indexing is off and the per-page `noindex` tag is what enforces
it, which is exactly why that protection was built as two independent layers. It
matters at launch, and it is one more reason a real domain is required before
indexing (`P5-05`).

**HTTPS is the host's to enforce.** Without HSTS from us, that is whatever
`github.io` provides.

## Decision

Deploy the static export to GitHub Pages from `.github/workflows/pages.yml`, serving
at `https://mohmedvaid.github.io/img-hub/`.

Deliver the CSP and referrer policy as meta tags, injected into every emitted page by
`scripts/postbuild.mjs`. Keep `config/security.ts` as the single source of truth for
both, and keep `securityHeaders` whole so the move is reversible.

Injecting at build time rather than rendering from the root layout is not a style
choice. A meta policy governs only what the browser fetches after it parses the tag,
and Next hoists its own stylesheet links and script tags above anything a layout puts
in `<head>` — so a layout-rendered policy lands *below* the scripts it is meant to
cover and silently does not apply to them. This was found by reading the emitted HTML,
not by anything failing: the page worked either way. The script therefore also
verifies its own output per file, failing the build if a script or stylesheet ever
precedes the policy, and if the injection pushes the charset declaration past the
1024-byte mark browsers require.

Derive `basePath` from the canonical URL. Exercise the subpath in CI — both the browser
smoke suite and the SEO audit run against `/img-hub` — because a base-path mistake
breaks the entire site rather than one page, and a root-served test would never see it.

## Alternatives rejected

**Serving from both GitHub Pages and Cloudflare.** Two live copies of the same site
competing for the same queries, with canonical tags that can only point at one. Worse
than either alone.

**A framebusting script to replace `X-Frame-Options`.** Inline JavaScript defending
against an attack with no payload here, and it would need a CSP allowance of its own.
The honest answer is that the loss is acceptable for this app, not that it should be
papered over.

**Keeping a hand-written `_headers` in the repo for a future host.** A file nothing
reads is a file that goes stale. `securityHeaders` already is that record, and it is
type-checked and tested.

## Consequences

Hosting, bandwidth, TLS and CI are $0, as before. The account holding the code now also
holds the deploy, and a merge to `main` publishes without a separate credential.

Security posture is meaningfully weaker than ADR-0007's, in the specific and bounded
way documented above. The CSP — the control that actually backs the privacy claim —
survives.

Reversing this is small: set `NEXT_PUBLIC_SITE_URL` back to a root origin, restore
`wrangler.jsonc` and the `_headers` generation from git history, and the six headers
come back. Nothing about the application changed to accommodate the move.

Analytics stays Cloudflare Web Analytics — it is a script tag on any origin, and does
not require Cloudflare hosting. It is still waiting on a token (`P5-04`).
