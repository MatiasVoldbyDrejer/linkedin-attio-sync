#!/usr/bin/env node
// Records the dev-only /preview/demo page (sample data only) into docs/images/demo.mp4: headless
// Chrome renders the timeline frame by frame over the DevTools protocol, then ffmpeg encodes it.
// Start `pnpm --filter web dev` first; needs ffmpeg on PATH. BASE_URL and CHROME override the defaults.
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const outDir = join(repoRoot, 'docs', 'images')
const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const FPS = 30
// 1600x900 CSS pixels rendered at 1.2x: a 1920x1080 video
const WIDTH = 1600
const HEIGHT = 900
const SCALE = 1.2
const PORT = 9333

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function devtools(url) {
  const socket = new WebSocket(url)
  const pending = new Map()
  let nextId = 0
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.reject(new Error(message.error.message))
    else waiter.resolve(message.result)
  }
  const opened = new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  return { opened, send, close: () => socket.close() }
}

const work = mkdtempSync(join(tmpdir(), 'linkedin-attio-demo-'))
const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(work, 'profile')}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    '--lang=en-US',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

try {
  let target
  for (let attempt = 0; attempt < 50 && !target; attempt++) {
    await sleep(200)
    target = await fetch(`http://127.0.0.1:${PORT}/json/new?${base}/preview/demo?record`, { method: 'PUT' })
      .then((res) => (res.ok ? res.json() : undefined))
      .catch(() => undefined)
  }
  if (!target) throw new Error('Chrome DevTools did not start')

  const page = devtools(target.webSocketDebuggerUrl)
  await page.opened
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: false })
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
  await page.send('Page.enable')
  await page.send('Page.reload')

  let duration = 0
  for (let attempt = 0; attempt < 150 && !duration; attempt++) {
    await sleep(200)
    const { result } = await page.send('Runtime.evaluate', {
      expression: 'document.fonts.ready.then(() => window.__demo?.duration ?? 0)',
      awaitPromise: true,
      returnByValue: true,
    })
    duration = result.value
  }
  if (!duration) throw new Error('The demo page never became ready; is the dev server running?')

  const frames = Math.round((duration / 1000) * FPS)
  for (let frame = 0; frame < frames; frame++) {
    await page.send('Runtime.evaluate', { expression: `window.__demo.seek(${(frame * 1000) / FPS})`, awaitPromise: true })
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(work, `${String(frame).padStart(5, '0')}.png`), Buffer.from(data, 'base64'))
    if (frame % (FPS * 4) === 0) console.log(`frame ${frame}/${frames}`)
  }
  page.close()

  const video = join(outDir, 'demo.mp4')
  execFileSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(work, '%05d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video],
    { stdio: 'inherit' },
  )
  console.log('wrote docs/images/demo.mp4')
} finally {
  // Chrome keeps writing its profile until it has exited
  const exited = new Promise((resolve) => browser.once('exit', resolve))
  browser.kill()
  await exited
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
