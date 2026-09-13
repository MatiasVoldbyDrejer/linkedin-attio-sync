#!/usr/bin/env node
// Builds the Chrome extension and zips it into public/, so every web deploy serves
// the unpacked build that matches the backend it talks to.
import { execSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(webDir, '..', '..')
const extensionOutput = join(repoRoot, 'apps', 'extension', 'dist', 'chrome-mv3')
const target = join(webDir, 'public', 'extension', 'linkedin-attio-sync.zip')

// the download has to talk to this deployment; Vercel exposes its production domain
const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL
const backendUrl =
  process.env.WXT_BACKEND_URL ?? process.env.PUBLIC_BASE_URL ?? (vercelDomain ? `https://${vercelDomain}` : undefined)
if (!backendUrl) {
  console.warn('No WXT_BACKEND_URL, PUBLIC_BASE_URL or Vercel domain: the packaged extension will target http://localhost:3000')
}

execSync('pnpm --filter extension build', {
  cwd: repoRoot,
  stdio: 'inherit',
  env: backendUrl ? { ...process.env, WXT_BACKEND_URL: backendUrl } : process.env,
})

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  )
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

// DOS date for 1980-01-01 with a zero time, so identical builds give identical zips
const DOS_DATE = (1 << 5) | 1

/** Minimal deflate zip without zip64: plenty for an extension of a few dozen files. */
function zip(entries) {
  const locals = []
  const centrals = []
  let offset = 0

  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const compressed = deflateRawSync(data)
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBytes, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBytes)

    offset += local.length + nameBytes.length + compressed.length
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

// manifest.json at the zip root, so the unzipped folder is directly "Load unpacked"-able
const entries = listFiles(extensionOutput)
  .map((path) => ({ name: relative(extensionOutput, path).split(sep).join('/'), data: readFileSync(path) }))
  .sort((a, b) => a.name.localeCompare(b.name))

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, zip(entries))
console.log(`Packaged ${entries.length} extension files into ${relative(repoRoot, target)}`)
