/**
 * End-to-end smoke test in a real browser.
 *
 * Unit tests cannot cover the highest-risk part of this app: the WASM codecs, the
 * Web Worker, and EXIF auto-orientation all need a real browser. This drives Chromium
 * against a built app and asserts on actual output dimensions and bytes.
 *
 * The EXIF case is the one to never delete. It builds a JPEG tagged Orientation=6 and
 * asserts the decoded image comes out upright — the check that stops us shipping
 * sideways phone photos. See ADR-0006.
 *
 * Usage:
 *   pnpm build && pnpm start &
 *   node scripts/fixtures.mjs .fixtures
 *   node scripts/smoke.mjs .fixtures
 */

import { chromium } from 'playwright'

const SP = process.argv[2] ?? '.fixtures'
const BASE = process.env.SMOKE_URL ?? 'http://localhost:3000'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

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
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9))
  const bytes = new Uint8Array(await blob.arrayBuffer())

  // Minimal APP1/EXIF: TIFF header, one IFD entry (0x0112 Orientation = 6).
  const app1 = []
  const push = (...v) => app1.push(...v)
  push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00) // "Exif\0\0"
  push(0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08) // big-endian TIFF, IFD0 at 8
  push(0x00, 0x01) // 1 entry
  push(0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00) // Orientation=6
  push(0x00, 0x00, 0x00, 0x00) // no next IFD
  const len = app1.length + 2
  const seg = new Uint8Array([0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...app1])

  const out = new Uint8Array(bytes.length + seg.length)
  out.set(bytes.subarray(0, 2), 0) // SOI
  out.set(seg, 2) // our APP1
  out.set(bytes.subarray(2), 2 + seg.length) // rest
  return Array.from(out)
})
const fs = await import('node:fs')
fs.writeFileSync(`${SP}/exif-rot90.jpg`, Buffer.from(exif))
console.log('EXIF fixture: 200x100 source tagged Orientation=6 ->', exif.length, 'bytes')

async function runWith(files, setup) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.setInputFiles('input[type=file]', files)
  await page.waitForTimeout(200)
  if (setup) await setup()
  await page.getByRole('button', { name: 'Run' }).click()
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('li')].every(
        (li) => !/waiting|Reading|Editing|Saving/.test(li.textContent),
      ),
    null,
    { timeout: 60000 },
  )
  return (await page.locator('li').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim())
}
const check = (name, cond, detail) =>
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`)
const tick = async (label) =>
  page.locator('label').filter({ hasText: label }).first().locator('input[type=checkbox]').check()

console.log('\n=== EXIF auto-orient (the bug) ===')
let rows = await runWith([`${SP}/exif-rot90.jpg`], () => tick('Compress'))
check('200x100 tagged Orientation=6 decodes as 100x200 upright', /100×200/.test(rows[0]), rows[0])

console.log('\n=== resize actually resizes ===')
rows = await runWith([`${SP}/photo.png`], async () => {
  await tick('Resize')
  await page.locator('input[type=number]').first().fill('300')
})
check('1200x900 contain-fit to width 300 becomes 300x225', /300×225/.test(rows[0]), rows[0])

console.log('\n=== rotate swaps axes ===')
rows = await runWith([`${SP}/wide.png`], async () => {
  await tick('Rotate & flip')
  await page.getByRole('button', { name: '90°', exact: true }).click()
})
check('1600x400 rotated 90 becomes 400x1600', /400×1600/.test(rows[0]), rows[0])

console.log('\n=== cover mode centre-crops to an exact box ===')
rows = await runWith([`${SP}/wide.png`], async () => {
  await tick('Resize')
  await page.locator('input[type=number]').first().fill('300')
  await page.locator('input[type=number]').nth(1).fill('300')
  await page.locator('select').first().selectOption('cover')
})
check('1600x400 cover 300x300 becomes exactly 300x300', /300×300/.test(rows[0]), rows[0])

console.log('\n=== one bad file does not kill the batch ===')
rows = await runWith([`${SP}/photo.png`, `${SP}/broken.png`, `${SP}/wide.png`], () =>
  tick('Compress'),
)
check(
  '2 succeed, 1 fails independently',
  rows.filter((r) => /→/.test(r)).length === 2 &&
    rows.filter((r) => /couldn't be read/.test(r)).length === 1,
  rows.join(' | ').slice(0, 150),
)

console.log('\n=== crop selects exactly the region drawn ===')
await page.goto(`${BASE}/crop-image`, { waitUntil: 'networkidle' })
await page.setInputFiles('input[type=file]', [`${SP}/photo.png`])
await page.waitForTimeout(700)
const seeded = await page.getByText(/px at/).first().textContent()
check(
  'seeds a centred 80% box on a 1200x900 source',
  /960 × 720 px at 120, 90/.test(seeded),
  seeded,
)
await page.getByRole('button', { name: 'Run' }).click()
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('li')].every(
      (li) => !/waiting|Reading|Editing|Saving/.test(li.textContent),
    ),
  null,
  { timeout: 60000 },
)
rows = (await page.locator('li').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim())
check('output matches the drawn box', /960×720/.test(rows[0]), rows[0])

console.log('\n=== P1-10: the crop box follows a rotation change ===')
// Without the remap the box keeps stale coordinates and silently crops a different
// region — the failure mode ADR-0006 exists to prevent.
await page.goto(`${BASE}/crop-image`, { waitUntil: 'networkidle' })
await page.setInputFiles('input[type=file]', [`${SP}/wide.png`])
await page.waitForTimeout(700)
await tick('Rotate & flip')
await page.waitForTimeout(200)
await page.getByRole('button', { name: '90°', exact: true }).click()
await page.waitForTimeout(300)
const moved = await page.getByText(/px at/).first().textContent()
// 1600x400 seeds 1280x320 at 160,40. A quarter turn into a 400x1600 frame puts it
// at 40,160 with the axes swapped.
check('box swaps axes and repositions', /320 × 1280 px at 40, 160/.test(moved), moved)
await page.getByRole('button', { name: 'Run' }).click()
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('li')].every(
      (li) => !/waiting|Reading|Editing|Saving/.test(li.textContent),
    ),
  null,
  { timeout: 60000 },
)
rows = (await page.locator('li').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim())
check('rotated crop output is 320x1280', /320×1280/.test(rows[0]), rows[0])

console.log('\n=== lossless quality note ===')
await page.goto(`${BASE}/compress-image`, { waitUntil: 'networkidle' })
await page.setInputFiles('input[type=file]', [`${SP}/photo.png`])
await page.waitForTimeout(400)
check(
  'PNG on the compressor explains quality has no effect',
  (await page.getByText(/quality has no effect/).count()) > 0,
)
await page.screenshot({ path: `${SP}/shot-toolpage.png` })

console.log('\n=== screenshots ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${SP}/shot-home.png` })
await page.setInputFiles('input[type=file]', [
  `${SP}/photo.png`,
  `${SP}/wide.png`,
  `${SP}/transparent.png`,
])
await page.waitForTimeout(200)
for (const l of ['Resize', 'Convert format', 'Compress']) await tick(l)
await page.waitForTimeout(200)
await page.getByRole('button', { name: 'Run' }).click()
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('li')].every(
      (li) => !/waiting|Reading|Editing|Saving/.test(li.textContent),
    ),
  null,
  { timeout: 60000 },
)
await page.screenshot({ path: `${SP}/shot-results.png`, fullPage: true })
console.log('  saved')

console.log('\npage errors:', errors.length ? errors.slice(0, 5).join(' | ') : 'none')
await browser.close()
