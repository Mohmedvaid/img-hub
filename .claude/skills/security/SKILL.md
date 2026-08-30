---
name: security
description: Security rules and threat model for img-hub. Use before changing response headers, CSP, dependencies, file intake, worker code, or anything touching user files or third-party scripts. Also use when reviewing a PR for security, or when a library requires SharedArrayBuffer or cross-origin isolation.
---

# Security

The threat model here is unusual, because the app processes user files without ever
receiving them. That removes most of the usual web attack surface and leaves a
specific, narrower set of risks that are easy to miss precisely because the obvious
ones are absent.

## The hard constraint

**Never set `Cross-Origin-Embedder-Policy` or `Cross-Origin-Opener-Policy`.**

Those two headers enable cross-origin isolation, which is what `SharedArrayBuffer`
requires. Google Publisher Tag, which serves AdSense, does not support COEP. Setting
it removes all ad revenue — the monetisation model — and also breaks Stripe, YouTube
embeds and Google Sign-In. The failure is silent: ads simply stop rendering.

If a library requires `SharedArrayBuffer`, **the answer is a different library.**
This is the entire reason the project uses jSquash rather than wasm-vips. See
ADR-0002.

`config/security.ts` owns every response header and repeats this warning at the point
of change.

## What we are not exposed to

Worth naming, so effort goes to real risks:

- No file upload endpoint, so no upload-based RCE, path traversal or storage abuse.
- No database, so no SQL injection.
- No accounts or sessions, so no auth bypass, session fixation or CSRF.
- No user content at rest, so no DMCA process, no CSAM exposure, no breach surface.

Adding any of these changes the model and needs this file updated.

## What we are exposed to

### Decompression bombs

A 3 KB PNG can decode to gigabytes and hang or crash the tab. This is the single most
likely way to break a visitor's browser.

- Enforce `limits.maxPixels` on decoded dimensions **before** allocating the bitmap,
  not after.
- Enforce `limits.maxFileBytes` at intake.
- Treat `DIMENSIONS_TOO_LARGE` as a normal outcome with a clear message, not a crash.

### Memory exhaustion

Codecs materialise full bitmaps and mobile Safari gives up early. Failing fast with an
honest message beats a tab crash that looks like our bug. `normaliseThrown` detects
allocation failures across the several inconsistent shapes browsers report them in.

### Malicious SVG

SVG is a document, not a bitmap. It can carry `<script>`, external references and
XXE-style entity expansion. It executes if rendered inline or loaded into an `<img>`
in the wrong context.

SVG is deliberately **not** in `limits.inputFormats`. Before adding it: never render
untrusted SVG inline, rasterise it in an isolated context, and strip scripts and
external references first. Treat it as a separate feature with its own review, not
as one more entry in the format list.

### Dependency supply chain

Codecs are compiled WebAssembly. Reading them is not practical, so provenance is the
control.

- Pin exact versions. No `^` or `~` on anything that ships to a browser.
- The lockfile is committed and reviewed like code.
- Prefer packages with a public build pipeline; jSquash builds from Squoosh's sources.
- A new dependency in a PR needs a stated reason. "It was convenient" is not one.

### Content Security Policy

Built in `config/security.ts` and assembled from config, so ad and analytics hosts are
only permitted when those features are actually enabled.

Things that must stay true:
- `'wasm-unsafe-eval'` is required to instantiate codec modules. It does **not**
  permit `eval`.
- `object-src 'none'` and `frame-ancestors 'none'` stay.
- `img-src` allows `blob:` and `data:` because that is how decoded output reaches the
  page.
- Ad domains are added only under `site.ads.enabled`. Never widen the policy
  "temporarily" to debug.

### Third-party scripts

Every ad or analytics script runs with full page access. Each one is a decision, not a
default. Keep the list in `config/site.ts` short and load nothing that is not earning
its place.

### Privacy as a product claim

"Your images never leave your device" is on every landing page. It has to stay
literally true.

That means: no analytics event carrying a filename, no error report carrying image
content, no "just for debugging" upload path. `error.detail` is never rendered and
never transmitted, because decoder output can contain file content.

If a feature would ever send user image data anywhere, it breaks the core promise and
needs an explicit decision from Mohmed and an ADR, not a PR.

## Review checklist

For any PR touching headers, dependencies, file intake or worker code:

- [ ] No COOP or COEP added, and no dependency that needs `SharedArrayBuffer`
- [ ] New dependencies pinned exactly, with a stated reason
- [ ] Decoded dimensions checked against `limits.maxPixels` before allocation
- [ ] No user file content in logs, analytics or error messages
- [ ] CSP not widened; any new host tied to a config flag
- [ ] No `dangerouslySetInnerHTML` with anything but generated, typed config
- [ ] Runtime validation on anything from a URL or a file, no `as` casts
