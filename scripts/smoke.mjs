/**
 * End-to-end smoke test in a real browser.
 *
 * This covers what jsdom cannot: the WASM codecs, the Web Worker, OffscreenCanvas,
 * and EXIF auto-orientation. Every geometry operation ultimately draws on a real
 * canvas, so the unit suite asserts the maths and this asserts the pixels.
 *
 * Two cases here should never be deleted:
 *   - EXIF Orientation=6 must decode upright. Metadata stripping is on by default,
 *     so getting this wrong ships every phone photo sideways. See ADR-0006.
 *   - The corner-sampling checks. Dimensions alone cannot tell a 180° turn from a
 *     double flip, or a horizontal flip from a vertical one.
 *
 * Usage:
 *   pnpm build && pnpm start &
 *   node scripts/fixtures.mjs .fixtures
 *   node scripts/smoke.mjs .fixtures
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const SP = process.argv[2] ?? '.fixtures'
const BASE = process.env.SMOKE_URL ?? 'http://localhost:3000'

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (event) => errors.push(event.message))

let failures = 0
const check = (name, passed, detail) => {
  if (!passed) failures += 1
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`)
}

await page.goto(BASE, { waitUntil: 'networkidle' })

// Build a JPEG carrying EXIF Orientation=6 (rotate 90° CW to display).
// A 200x100 landscape source must therefore decode as 100x200 portrait.
const exif = await page.evaluate(async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 200
  canvas.height = 100
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#c33'
  ctx.fillRect(0, 0, 200, 100)
  ctx.fillStyle = '#33c'
  ctx.fillRect(0, 0, 40, 100)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  const bytes = new Uint8Array(await blob.arrayBuffer())

  // Minimal APP1/EXIF: TIFF header, one IFD entry (0x0112 Orientation = 6).
  const app1 = []
  const push = (...values) => app1.push(...values)
  push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00) // "Exif\0\0"
  push(0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08) // big-endian TIFF, IFD0 at 8
  push(0x00, 0x01) // 1 entry
  push(0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00) // Orientation=6
  push(0x00, 0x00, 0x00, 0x00) // no next IFD
  const length = app1.length + 2
  const segment = new Uint8Array([0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...app1])

  const out = new Uint8Array(bytes.length + segment.length)
  out.set(bytes.subarray(0, 2), 0) // SOI
  out.set(segment, 2) // our APP1
  out.set(bytes.subarray(2), 2 + segment.length) // the rest
  return Array.from(out)
})
writeFileSync(`${SP}/exif-rot90.jpg`, Buffer.from(exif))
console.log(`EXIF fixture: 200x100 source tagged Orientation=6 -> ${exif.length} bytes`)

/* ---------------------------------------------------------------- helpers */

const RESULTS = '[data-testid="results"] li'
const IDLE = () =>
  [...document.querySelectorAll('[data-testid="results"] li')].every(
    (row) => !/waiting|Reading|Editing|Saving/.test(row.textContent),
  )

const tick = (label) =>
  page.locator('label').filter({ hasText: label }).first().locator('input[type=checkbox]').check()

/** Waits for the preview to have measured the image, which is what seeds the crop box. */
const previewReady = () => page.waitForFunction(() => document.querySelector('img')?.complete)

/**
 * True once text matching `pattern` appears, false if it never does.
 *
 * Intake reads a file's bytes before it can say anything about it, so anything that
 * asserts on the result has to wait for it. Reading the DOM straight after
 * setInputFiles raced that read and failed about two runs in five.
 */
const seen = (pattern, timeout = 5000) =>
  page
    .getByText(pattern)
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false)

async function open(path, files) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.setInputFiles('input[type=file]', files)
  await page.waitForSelector(RESULTS)
  if (files.length > 0) await previewReady()
}

async function apply() {
  await page.getByRole('button', { name: /^Apply/ }).click()
  await page.waitForFunction(IDLE, null, { timeout: 60000 })
  return (await page.locator(RESULTS).allTextContents()).map((text) =>
    text.replace(/\s+/g, ' ').trim(),
  )
}

async function run(path, files, setup) {
  await open(path, files)
  if (setup) await setup()
  return apply()
}

/**
 * Downloads the first result and samples its four corners.
 *
 * Round-tripping the file back through the browser is what makes this a real check:
 * the bytes asserted on are the bytes a visitor would have saved.
 */
async function cornersOfResult() {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).first().click(),
  ])
  const saved = `${SP}/out-${download.suggestedFilename()}`
  await download.saveAs(saved)

  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0)

    // The fixture's four colours, matched by nearest neighbour so a lossy encode
    // still lands on the right name.
    const PALETTE = [
      ['red', 220, 40, 40],
      ['green', 40, 180, 60],
      ['blue', 40, 80, 220],
      ['yellow', 230, 200, 40],
    ]
    const name = (x, y) => {
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
      let best = ['none', Number.POSITIVE_INFINITY]
      for (const [label, pr, pg, pb] of PALETTE) {
        const distance = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if (distance < best[1]) best = [label, distance]
      }
      return best[1] < 60 ** 2 ? best[0] : `rgb(${r},${g},${b})`
    }
    const { width, height } = bitmap
    return {
      size: `${width}x${height}`,
      corners: [
        name(4, 4),
        name(width - 5, 4),
        name(4, height - 5),
        name(width - 5, height - 5),
      ].join(' '),
    }
  }, readFileSync(saved).toString('base64'))
}

/* ------------------------------------------------------------------ cases */

console.log('\n=== EXIF auto-orient (the bug) ===')
let rows = await run('/', [`${SP}/exif-rot90.jpg`], () => tick('Compress'))
check('200x100 tagged Orientation=6 decodes as 100x200 upright', /100×200/.test(rows[0]), rows[0])

console.log('\n=== resize actually resizes ===')
rows = await run('/', [`${SP}/photo.png`], async () => {
  await tick('Resize')
  await page.locator('input[type=number]').first().fill('300')
})
check('1200x900 contain-fit to width 300 becomes 300x225', /300×225/.test(rows[0]), rows[0])

console.log('\n=== cover mode centre-crops to an exact box ===')
rows = await run('/', [`${SP}/wide.png`], async () => {
  await tick('Resize')
  await page.locator('input[type=number]').first().fill('300')
  await page.locator('input[type=number]').nth(1).fill('300')
  await page.locator('select').first().selectOption('cover')
})
check('1600x400 cover 300x300 becomes exactly 300x300', /300×300/.test(rows[0]), rows[0])

console.log('\n=== orientation moves the right pixels ===')
// Dimensions alone cannot distinguish these; the corner colours can.
const ORIENTATIONS = [
  { label: 'untouched', clicks: [], size: '400x200', corners: 'red green blue yellow' },
  {
    label: 'rotate right',
    clicks: ['Rotate right'],
    size: '200x400',
    corners: 'blue red yellow green',
  },
  {
    label: 'rotate left',
    clicks: ['Rotate left'],
    size: '200x400',
    corners: 'green yellow red blue',
  },
  {
    label: 'half turn',
    clicks: ['Rotate right', 'Rotate right'],
    size: '400x200',
    corners: 'yellow blue green red',
  },
  {
    label: 'flip horizontally',
    clicks: ['Flip horizontally'],
    size: '400x200',
    corners: 'green red yellow blue',
  },
  {
    label: 'flip vertically',
    clicks: ['Flip vertically'],
    size: '400x200',
    corners: 'blue yellow red green',
  },
  // The two orders that a naive implementation gets wrong. A click acts on what is
  // on screen, so rotate-then-flip and flip-then-rotate are different images.
  {
    label: 'rotate right then flip horizontally',
    clicks: ['Rotate right', 'Flip horizontally'],
    size: '200x400',
    corners: 'red blue green yellow',
  },
  {
    label: 'flip horizontally then rotate right',
    clicks: ['Flip horizontally', 'Rotate right'],
    size: '200x400',
    corners: 'yellow green blue red',
  },
]

for (const scenario of ORIENTATIONS) {
  await open('/rotate-image', [`${SP}/corners.png`])
  for (const label of scenario.clicks) {
    await page.getByRole('button', { name: label, exact: true }).click()
  }
  await apply()
  const result = await cornersOfResult()
  check(
    `${scenario.label} -> ${scenario.size}, corners ${scenario.corners}`,
    result.size === scenario.size && result.corners === scenario.corners,
    `${result.size}, ${result.corners}`,
  )
}

console.log('\n=== crop selects exactly the region drawn ===')
await open('/crop-image', [`${SP}/photo.png`])
const seeded = await page.getByText(/ of /).first().textContent()
check(
  'seeds a centred 80% box on a 1200x900 source',
  /960 × 720 of 1200 × 900/.test(seeded),
  seeded,
)
rows = await apply()
check('output matches the drawn box', /960×720/.test(rows[0]), rows[0])

console.log('\n=== P1-10: the crop box follows a rotation change ===')
// Without the remap the box keeps stale coordinates and silently crops a different
// region — the failure mode ADR-0006 exists to prevent.
await open('/crop-image', [`${SP}/wide.png`])
await tick('Rotate & flip')
await page.getByRole('button', { name: 'Rotate right', exact: true }).click()
const moved = await page.getByText(/ of /).first().textContent()
// 1600x400 seeds 1280x320 at 160,40. A quarter turn into a 400x1600 frame swaps the
// axes and repositions it.
check('box swaps axes with the image', /320 × 1280 of 400 × 1600/.test(moved), moved)
rows = await apply()
check('rotated crop output is 320x1280', /320×1280/.test(rows[0]), rows[0])

console.log('\n=== a conversion page converts to its own format ===')
rows = await run('/png-to-jpg', [`${SP}/photo.png`])
check('png-to-jpg produces a JPEG', /JPEG/.test(rows[0]), rows[0])

console.log('\n=== one bad file does not kill the batch ===')
rows = await run('/', [`${SP}/photo.png`, `${SP}/broken.png`, `${SP}/wide.png`], () =>
  tick('Compress'),
)
check(
  '2 succeed, 1 fails independently',
  rows.filter((row) => /→/.test(row)).length === 2 &&
    rows.filter((row) => /couldn't be read/.test(row)).length === 1,
  rows.join(' | ').slice(0, 150),
)

console.log('\n=== a non-image is refused with a reason ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.setInputFiles('input[type=file]', [`${SP}/notes.pdf`])
check(
  'a PDF is named and explained rather than dropped in silence',
  await seen(/does not look like an image/),
)

console.log('\n=== lossless quality note ===')
await open('/compress-image', [`${SP}/photo.png`])
check(
  'PNG on the compressor explains quality has no effect',
  await seen(/These files stay lossless/),
)
await page.screenshot({ path: `${SP}/shot-toolpage.png` })

console.log('\n=== screenshots ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${SP}/shot-home.png` })
await open('/', [`${SP}/photo.png`, `${SP}/wide.png`, `${SP}/transparent.png`])
for (const label of ['Resize', 'Convert format', 'Compress']) await tick(label)
await apply()
await page.screenshot({ path: `${SP}/shot-results.png`, fullPage: true })
console.log('  saved')

console.log(`\npage errors: ${errors.length ? errors.slice(0, 5).join(' | ') : 'none'}`)
await browser.close()

if (failures > 0 || errors.length > 0) {
  console.error(`\n${failures} check(s) failed, ${errors.length} page error(s)`)
  process.exit(1)
}
console.log('\nall checks passed')
