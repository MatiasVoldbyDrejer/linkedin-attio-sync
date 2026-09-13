#!/usr/bin/env node
// Decides whether a self-heal PR stays inside the auto-merge allowlist.
//
//   node check-self-heal-scope.mjs --allowlist <file> --files <file-with-one-path-per-line>
//   node check-self-heal-scope.mjs --self-test
//
// Exits 0 when every changed file matches an allowlist glob, 1 otherwise (and
// prints the offending paths), 2 on usage errors.

import { readFileSync } from 'node:fs'

// Never auto-mergeable, even if someone adds a broad glob to the allowlist.
const ALWAYS_BLOCKED = ['.github/**', 'apps/**', 'packages/core/src/attio/**', 'package.json', '**/package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']

export function globToRegExp(glob) {
  let source = ''
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]
    if (char === '*') {
      if (glob[i + 1] === '*') {
        i++
        if (glob[i + 1] === '/') {
          i++
          source += '(?:.*/)?' // `**/` also matches zero directories
        } else {
          source += '.*'
        }
      } else {
        source += '[^/]*'
      }
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${source}$`)
}

export function parseGlobList(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

export function checkScope(allowGlobs, files) {
  const allow = allowGlobs.map(globToRegExp)
  const blocked = ALWAYS_BLOCKED.map(globToRegExp)
  const outOfScope = files.filter((file) => blocked.some((re) => re.test(file)) || !allow.some((re) => re.test(file)))
  return { ok: files.length > 0 && outOfScope.length === 0, outOfScope }
}

function selfTest() {
  const allow = parseGlobList(`
    # comment
    packages/core/src/linkedin/**
    packages/core/test/fixtures/**
    packages/core/test/linkedin.test.ts
  `)
  const cases = [
    [['packages/core/src/linkedin/parse.ts'], true],
    [['packages/core/src/linkedin/request-config.json', 'packages/core/test/fixtures/incidents/abc.json'], true],
    [['packages/core/test/linkedin.test.ts'], true],
    [['packages/core/test/note.test.ts'], false],
    [['packages/core/src/attio/client.ts'], false],
    [['packages/core/src/linkedin/parse.ts', 'apps/web/src/app/api/sync/route.ts'], false],
    [['.github/self-heal-allowlist'], false],
    [['pnpm-lock.yaml'], false],
    [['packages/core/src/linkedinX/parse.ts'], false],
    [['packages/core/test/linkedin.test.tsx'], false],
    [[], false], // an empty diff is suspicious, not mergeable
  ]
  const globCases = [
    ['a/*/c', 'a/b/c', true],
    ['a/*/c', 'a/b/x/c', false],
    ['a/**/c', 'a/c', true],
    ['a/**/c', 'a/b/x/c', true],
    ['a/**', 'a/b/c.json', true],
    ['a.json', 'aXjson', false],
  ]
  // allowlist entries must not be able to override the hard block
  const widened = checkScope(['**'], ['.github/workflows/ci.yml'])

  let failures = 0
  for (const [files, expected] of cases) {
    const { ok } = checkScope(allow, files)
    if (ok !== expected) {
      failures++
      console.error(`FAIL scope ${JSON.stringify(files)}: expected ${expected}, got ${ok}`)
    }
  }
  for (const [glob, path, expected] of globCases) {
    const matched = globToRegExp(glob).test(path)
    if (matched !== expected) {
      failures++
      console.error(`FAIL glob ${glob} vs ${path}: expected ${expected}, got ${matched}`)
    }
  }
  if (widened.ok) {
    failures++
    console.error('FAIL a `**` allowlist entry bypassed the hard block on .github/**')
  }
  const total = cases.length + globCases.length + 1
  console.log(`${total - failures}/${total} self-test cases passed`)
  process.exit(failures ? 1 : 0)
}

function arg(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

if (process.argv.includes('--self-test')) {
  selfTest()
} else {
  const allowlistPath = arg('--allowlist')
  const filesPath = arg('--files')
  if (!allowlistPath || !filesPath) {
    console.error('usage: check-self-heal-scope.mjs --allowlist <file> --files <file> | --self-test')
    process.exit(2)
  }
  const files = parseGlobList(readFileSync(filesPath, 'utf8'))
  const { ok, outOfScope } = checkScope(parseGlobList(readFileSync(allowlistPath, 'utf8')), files)
  if (ok) {
    console.log(`All ${files.length} changed files are inside the self-heal allowlist.`)
    process.exit(0)
  }
  if (files.length === 0) console.log('The PR has no changed files.')
  for (const file of outOfScope) console.log(`- \`${file}\``)
  process.exit(1)
}
