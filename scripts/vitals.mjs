/**
 * Measures Core Web Vitals on a throttled mobile profile — P3-02.
 *
 * Desktop numbers on a fast machine flatter everything and predict nothing. This
 * throttles CPU and network to something like a mid-range phone on 4G, which is what
 * most of the traffic will be.
 *
 * Usage: pnpm build && pnpm start & ; node scripts/vitals.mjs [baseUrl]
 */

import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '')
const PAGES = ['/', '/compress-image', '/crop-image']

// Targets are Google's "good" thresholds.
const TARGETS = { LCP: 2500, CLS: 0.1 }

const browser = await chromium.launch()
const results = []

for (const path of PAGES) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()

  const session = await context.newCDPSession(page)
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await session.send('Network.enable')
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })

  await page.goto(`${BASE}${path}`, { waitUntil: 'load' })

  const vitals = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let lcp = 0
        let cls = 0
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) lcp = entry.startTime
        }).observe({ type: 'largest-contentful-paint', buffered: true })
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) cls += entry.value
          }
        }).observe({ type: 'layout-shift', buffered: true })

        setTimeout(() => {
          const nav = performance.getEntriesByType('navigation')[0]
          resolve({
            lcp: Math.round(lcp),
            cls: Number(cls.toFixed(4)),
            transferredKB: Math.round(
              performance.getEntriesByType('resource').reduce((t, r) => t + r.transferSize, 0) /
                1024,
            ),
            domContentLoaded: Math.round(nav?.domContentLoaded ?? 0),
          })
        }, 3500)
      }),
  )

  results.push({ path, ...vitals })
  await context.close()
}

/**
 * Load-time CLS is the easy half. The shift that actually bites is the one caused by
 * interaction: adding a file makes the crop preview and results list appear, and if
 * neither reserves space the page jumps under the user's thumb.
 */
const interaction = await (async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  const session = await context.newCDPSession(page)
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  await page.goto(`${BASE}/crop-image`, { waitUntil: 'load' })

  // Start counting only from here, so load-time shifts are not double-counted.
  await page.evaluate(() => {
    window.__cls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__cls += entry.value
      }
    }).observe({ type: 'layout-shift' })
  })

  const workerBefore = await page.evaluate(
    () => performance.getEntriesByType('resource').filter((r) => /worker/i.test(r.name)).length,
  )

  await page.setInputFiles('input[type=file]', ['.fixtures/photo.png'])
  await page.waitForTimeout(2500)

  const cls = await page.evaluate(() => Number(window.__cls.toFixed(4)))
  const workerAfterFile = await page.evaluate(
    () => performance.getEntriesByType('resource').filter((r) => /worker/i.test(r.name)).length,
  )

  await context.close()
  return { cls, workerBefore, workerAfterFile }
})()

await browser.close()

console.log('Throttled mobile (4x CPU, ~1.6Mbps, 150ms RTT)\n')
console.log('page'.padEnd(18), 'LCP'.padStart(8), 'CLS'.padStart(8), 'transfer'.padStart(10))
let failed = false
for (const r of results) {
  const lcpOk = r.lcp <= TARGETS.LCP
  const clsOk = r.cls <= TARGETS.CLS
  if (!lcpOk || !clsOk) failed = true
  console.log(
    r.path.padEnd(18),
    `${r.lcp}ms`.padStart(8),
    String(r.cls).padStart(8),
    `${r.transferredKB}KB`.padStart(10),
    lcpOk && clsOk ? '' : `  <-- ${!lcpOk ? 'LCP ' : ''}${!clsOk ? 'CLS' : ''} over target`,
  )
}
const interactionOk = interaction.cls <= TARGETS.CLS
if (!interactionOk) failed = true

console.log(
  `\nCLS after adding a file on /crop-image: ${interaction.cls}${interactionOk ? '' : '  <-- over target'}`,
)
console.log(
  `Worker spawned before Run: ${interaction.workerAfterFile > interaction.workerBefore ? 'yes — should be lazy' : 'no — correctly lazy'}`,
)

console.log(`\ntargets: LCP <= ${TARGETS.LCP}ms, CLS <= ${TARGETS.CLS}`)
console.log(failed ? 'FAIL' : 'PASS')
if (failed) process.exitCode = 1
