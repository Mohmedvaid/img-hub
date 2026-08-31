/**
 * Generates the smoke-test fixtures.
 *
 * Generated rather than committed because they are large and entirely synthetic:
 * a deterministic function of x and y, so every run produces identical bytes and a
 * diff never shows binary churn.
 *
 * Usage: node scripts/fixtures.mjs <output-dir>
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

function crc32(buf) {
  let c,
    crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = c ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(path, w, h, fn) {
  const raw = Buffer.alloc(h * (1 + w * 4))
  let o = 0
  for (let y = 0; y < h; y++) {
    raw[o++] = 0
    for (let x = 0; x < w; x++) {
      const p = fn(x, y, w, h)
      raw[o++] = p[0]
      raw[o++] = p[1]
      raw[o++] = p[2]
      raw[o++] = p[3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}
const clamp = (v) => Math.max(0, Math.min(255, v | 0))
const photo = (x, y) => [
  clamp(127 + 120 * Math.sin(x / 22) * Math.cos(y / 31)),
  clamp(127 + 120 * Math.sin((x + y) / 17)),
  clamp(127 + 120 * Math.cos(x / 13 + y / 29)),
  255,
]
const dot = (x, y, w, h) => {
  const d = Math.hypot(x - w / 2, y - h / 2)
  return [220, 40, 90, d < Math.min(w, h) / 2.5 ? 255 : 0]
}
/**
 * Four unmistakable quadrants, so an orientation can be proved by sampling corners
 * rather than by trusting the reported dimensions. A 180° turn and a double flip both
 * keep the dimensions and differ only in where the colours end up.
 */
const quadrants = (x, y, w, h) => {
  const right = x >= w / 2
  const bottom = y >= h / 2
  if (!right && !bottom) return [220, 40, 40, 255] // top-left: red
  if (right && !bottom) return [40, 180, 60, 255] // top-right: green
  if (!right && bottom) return [40, 80, 220, 255] // bottom-left: blue
  return [230, 200, 40, 255] // bottom-right: yellow
}

const dir = process.argv[2]
mkdirSync(dir, { recursive: true })
png(`${dir}/photo.png`, 1200, 900, photo)
png(`${dir}/wide.png`, 1600, 400, photo)
png(`${dir}/transparent.png`, 400, 400, dot)
png(`${dir}/corners.png`, 400, 200, quadrants)
writeFileSync(
  `${dir}/broken.png`,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('garbage'.repeat(50)),
  ]),
)
// A file that is emphatically not an image, for the intake path.
writeFileSync(`${dir}/notes.pdf`, Buffer.from('%PDF-1.7\n% not an image\n'))
console.log('fixtures written')
