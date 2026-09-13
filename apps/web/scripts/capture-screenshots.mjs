#!/usr/bin/env node
// Regenerates docs/images from the dev-only /preview/shots pages (sample data only) with
// headless Chrome. Start `pnpm --filter web dev` first. BASE_URL and CHROME override the defaults.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const outDir = join(repoRoot, 'docs', 'images')
const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// shot → viewport in CSS pixels, captured at 2x
const SHOTS = {
  conversation: [1400, 860],
  review: [1400, 950],
  'side-panel': [1400, 860],
  social: [1600, 900],
}

// optional shot names as arguments capture just those
const only = process.argv.slice(2)

mkdirSync(outDir, { recursive: true })
for (const [name, [width, height]] of Object.entries(SHOTS)) {
  if (only.length > 0 && !only.includes(name)) continue
  const file = join(outDir, `${name}.png`)
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      // dates like "Sep 4" regardless of the machine's locale
      '--lang=en-US',
      `--window-size=${width},${height}`,
      // lets the client-rendered views mount before the capture
      '--virtual-time-budget=10000',
      `--screenshot=${file}`,
      `${base}/preview/shots/${name}`,
    ],
    // Intl date formatting follows the process locale, not --lang
    { stdio: 'ignore', env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' } },
  )
  console.log(`wrote docs/images/${name}.png`)
}
