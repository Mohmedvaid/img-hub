# 0006. Fix the pipeline order, and anchor crop to post-rotation space

- **Status:** Accepted
- **Date:** 2026-08-31

## Context

ADR-0005 made operations independent but left their apply order as an implementation
detail — a list in `registry.ts` that happened to read crop, rotate, resize, metadata.
Order is not a detail. Applied differently, the same saved settings produce a
different image, which matters twice over here: the pipeline is the product, and
encoded pipelines are a public contract once shareable links ship (ADR-0004).

Two questions had to be answered rather than defaulted.

**Where does crop sit relative to rotate?** A crop box is drawn on whatever the user
is looking at. If they rotate and then drag a box, the coordinates are in rotated
space. Applying that box to unrotated pixels selects a different region of the
image — not a subtly wrong crop, a wrong one.

**What happens to EXIF orientation?** A phone photo stores pixels in sensor
orientation plus an Orientation tag telling viewers how to display it. Strip the tag
without rotating the pixels and every such photo comes out sideways for anyone whose
viewer honoured it. Since stripping EXIF is on by default, this was a shipped bug
waiting to happen.

## Decision

**Decode auto-orients first, always.** Before any operation runs, decoding reads the
EXIF Orientation tag, bakes the rotation into the pixels, and resets the tag. This is
not a user-facing option; it is part of decoding. In the browser this is
`createImageBitmap(blob, { imageOrientation: 'from-image' })`.

**The order is fixed:**

```
decode (auto-orient) → rotate → crop → resize → metadata → encode
```

- **rotate** first, because crop coordinates are defined against the rotated image.
- **crop** before resize, so the resize box applies to the final composition, and so
  resizing never discards resolution the crop then has to magnify.
- **resize** once the frame is settled.
- **metadata** last, because it is an encode-time flag rather than a pixel operation.

**Crop coordinates are in post-rotation pixels.** When the user changes rotation
after drawing a box, the UI remaps the stored rectangle. Through a 90° turn that
remap is exact, so nothing is lost.

**The order is not user-reorderable.**

## Consequences

- `sortTransforms` guarantees the order regardless of the sequence a user enabled
  things in, so the UI never has to think about it.
- The UI owes one thing in return: remapping the crop rectangle when rotation
  changes. That is the cost of anchoring to post-rotation space, and it is paid in
  the rare interaction rather than the constant one.
- Stripping EXIF is safe. If the decode auto-orient step is ever removed, the
  metadata operation becomes a bug — which is why the requirement is written into
  `operations/metadata.ts` and into P1-02's acceptance criteria rather than left to
  memory.
- The order is asserted by tests that state the reasoning, so reordering fails with
  an explanation instead of a diff.

## Alternatives considered

**Crop coordinates against the unrotated source.** Symmetric, and worse. Rotation is
chosen once and often not at all; the crop box is dragged constantly. Anchoring to
the stable thing keeps conversions out of the common interaction.

**Let users reorder operations.** Rejected on correctness, not simplicity. Crop
coordinates only mean something relative to a known orientation, so reordering would
silently change what a saved pipeline produces — and break every shared link that
encoded one. The fixed order is what makes those links trustworthy.

**Auto-orient as a user-visible toggle.** Rejected: there is no sensible reason to
want a sideways image, and offering the choice invites picking the broken one.
