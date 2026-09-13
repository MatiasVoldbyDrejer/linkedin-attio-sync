#!/usr/bin/env node
// One-off: draws the app icon (a blue rounded tile with lucide's arrow-right-left, as
// AppIcon renders it in the UI) into apps/extension/public/icon as icon.svg plus the PNG
// sizes Chrome wants, and into the web app as its favicon (icon.svg) and apple-icon.png.
// Dependency-free so it runs anywhere Node does. The files are committed; rerun only
// when the icon changes.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const iconDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension', 'public', 'icon')
const webAppDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app')
const SIZES = [16, 32, 48, 128]
const SUBSAMPLES = 4

// geometry in a 128×128 canvas, mirroring AppIcon in packages/ui/src/views/shared.tsx
const CANVAS = 128
const RADIUS = CANVAS * 0.28 // rounded-[28%]
const GLYPH = CANVAS * 0.52 // size-[52%]
const GLYPH_SCALE = GLYPH / 24
const GLYPH_OFFSET = (CANVAS - GLYPH) / 2
const STROKE_WIDTH = 2.25 // in lucide's 24-unit grid
/** Keep the arrows at least this many device pixels thick, or they vanish at 16px */
const MIN_STROKE_PX = 1.4
// primary (#0071e3) fading up to primary/80 over white, as the tile's bg-linear-to-b does
const TOP = [0x33, 0x8d, 0xe9]
const BOTTOM = [0x00, 0x71, 0xe3]

// lucide arrow-right-left, 24-unit grid
const PATHS = ['m16 3 4 4-4 4', 'M20 7H4', 'm8 21-4-4 4-4', 'M4 17h16']
const SEGMENTS = [
  [16, 3, 20, 7],
  [20, 7, 16, 11],
  [20, 7, 4, 7],
  [8, 21, 4, 17],
  [4, 17, 8, 13],
  [4, 17, 20, 17],
].map((points) => points.map((v) => GLYPH_OFFSET + v * GLYPH_SCALE))

function insideRoundedSquare(x, y) {
  const dx = Math.max(RADIUS - x, 0, x - (CANVAS - RADIUS))
  const dy = Math.max(RADIUS - y, 0, y - (CANVAS - RADIUS))
  return dx * dx + dy * dy <= RADIUS * RADIUS
}

/** Distance from a point to a segment: a capsule test gives round caps and joins for free */
function distanceToSegment(x, y, [ax, ay, bx, by]) {
  const vx = bx - ax
  const vy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)))
  return Math.hypot(x - (ax + t * vx), y - (ay + t * vy))
}

function sample(x, y, halfStroke, rounded) {
  if (rounded && !insideRoundedSquare(x, y)) return null
  if (SEGMENTS.some((segment) => distanceToSegment(x, y, segment) <= halfStroke)) return [255, 255, 255]
  const t = y / CANVAS
  return TOP.map((c, i) => c + (BOTTOM[i] - c) * t)
}

function render(size, { rounded = true } = {}) {
  const pixels = Buffer.alloc(size * size * 4)
  const scale = CANVAS / size
  const halfStroke = Math.max((STROKE_WIDTH * GLYPH_SCALE) / 2, (MIN_STROKE_PX * scale) / 2)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let covered = 0
      for (let sy = 0; sy < SUBSAMPLES; sy++) {
        for (let sx = 0; sx < SUBSAMPLES; sx++) {
          const color = sample((px + (sx + 0.5) / SUBSAMPLES) * scale, (py + (sy + 0.5) / SUBSAMPLES) * scale, halfStroke, rounded)
          if (!color) continue
          r += color[0]
          g += color[1]
          b += color[2]
          covered++
        }
      }
      const i = (py * size + px) * 4
      if (covered) {
        pixels[i] = Math.round(r / covered)
        pixels[i + 1] = Math.round(g / covered)
        pixels[i + 2] = Math.round(b / covered)
        pixels[i + 3] = Math.round((covered / (SUBSAMPLES * SUBSAMPLES)) * 255)
      }
    }
  }
  return pixels
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`
const round = (v) => Number(v.toFixed(4))

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">
  <!-- Generated with apps/web/scripts/generate-extension-icons.mjs, like the PNGs next to it -->
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hex(TOP)}" />
      <stop offset="1" stop-color="${hex(BOTTOM)}" />
    </linearGradient>
  </defs>
  <rect width="${CANVAS}" height="${CANVAS}" rx="${round(RADIUS)}" fill="url(#bg)" />
  <g transform="translate(${round(GLYPH_OFFSET)} ${round(GLYPH_OFFSET)}) scale(${round(GLYPH_SCALE)})" fill="none" stroke="#FFFFFF" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">
${PATHS.map((d) => `    <path d="${d}" />`).join('\n')}
  </g>
</svg>
`

writeFileSync(join(iconDir, 'icon.svg'), svg)
console.log('wrote icon/icon.svg')
for (const size of SIZES) {
  writeFileSync(join(iconDir, `${size}.png`), png(size, render(size)))
  console.log(`wrote icon/${size}.png`)
}

// the web app's favicon, plus a square touch icon that iOS rounds itself
writeFileSync(join(webAppDir, 'icon.svg'), svg)
writeFileSync(join(webAppDir, 'apple-icon.png'), png(180, render(180, { rounded: false })))
console.log('wrote web app icon.svg and apple-icon.png')
