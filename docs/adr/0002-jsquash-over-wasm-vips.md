# 0002. Use jSquash codecs, never wasm-vips

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

Given ADR-0001, codecs must run in the browser. Two credible options:

- **wasm-vips** — the full libvips pipeline compiled to WebAssembly. Same engine as
  `sharp`. Streams operations, keeps memory low, handles a wide format range.
- **jSquash** — the Squoosh codecs (MozJPEG, libwebp, libavif, libjxl, Oxipng,
  Rust PNG) packaged one per format, plus a resize package.

wasm-vips is the more capable library. It also requires the `SharedArrayBuffer` API,
which browsers only expose to pages that are cross-origin isolated. Cross-origin
isolation requires two response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Google Publisher Tag, which serves AdSense, does not support COEP. Google's own
documentation says supporting it would require every ad resource, theirs and every
third party's, to opt into cross-origin embedding. Setting COEP therefore removes all
ad revenue. It also breaks Stripe, YouTube embeds and Google Sign-In.

Ads are this project's monetisation model.

## Decision

Use jSquash codecs. **Never set COOP or COEP on any response.**

The constraint is enforced in code: `config/security.ts` owns every response header
and carries a comment explaining why those two headers must not be added.

## Consequences

- Ad monetisation stays available, along with any future third-party embed.
- We give up libvips' streaming pipeline. Each operation materialises a full bitmap,
  which is the real reason `config/limits.ts` caps pixel count rather than trusting
  the device.
- Codecs are per-format modules loaded on demand, so a visitor converting to WebP
  never downloads the AVIF encoder. This is better for page weight than one large
  libvips binary.
- jSquash works in plain Web Workers and in Cloudflare Workers, which keeps an edge
  fallback open without changing codec libraries.

## The trap this ADR exists to prevent

wasm-vips is genuinely the more impressive choice, and its README does not mention
ads. Someone will propose it again, reasonably, on performance grounds. The cost is
not performance; it is the entire revenue model, and the failure is silent — ads
simply stop rendering.

If a future library requires `SharedArrayBuffer`, the answer is a different library.

## Alternatives considered

**wasm-vips with ads served from a separate non-isolated subdomain.** Ads would have
to render in an iframe on a different origin, which loses the ad formats that pay
best and adds a deployment surface. Rejected as complexity bought to keep a library
we do not need.

**Canvas API alone**, no WASM. Free and universally supported, but browser-native
encoders produce visibly worse files at the same size than MozJPEG or libwebp, and
compression quality is the product. Canvas is still used for geometry (resize, crop,
rotate); it just does not do the encoding.
