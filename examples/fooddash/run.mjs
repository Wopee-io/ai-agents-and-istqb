#!/usr/bin/env node
// node run.mjs [battle] [learn] [bug] [--video]   (default: all three builds)
// Runs the generated tests headless with Playwright against each FoodDash build, then prints
// passed / failed per build and which planted defects the failed checks match (planted-defects.json).
// Writes results.json + results.md. A build that is not being served yet is served from apps/dist for the run.

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve, isUp } from '../../lib/serve.mjs'

const dir = dirname(fileURLToPath(import.meta.url))
let cli
try {
  cli = join(dirname(createRequire(import.meta.url).resolve('@playwright/test/package.json')), 'cli.js')
} catch {
  console.error('Playwright is not installed. In the repository root: npm install && npx playwright install chromium')
  process.exit(1)
}
if (!existsSync(join(dir, 'tests.json'))) {
  console.error('No tests.json yet. Generate the tests first: npm run generate')
  process.exit(1)
}

const args = process.argv.slice(2)
const video = args.includes('--video')
const card = JSON.parse(readFileSync(join(dir, 'fact-card.json'), 'utf8'))
const suite = JSON.parse(readFileSync(join(dir, 'tests.json'), 'utf8'))
const key = JSON.parse(readFileSync(join(dir, 'planted-defects.json'), 'utf8')).defects
const builds = args.filter((a) => !a.startsWith('--'))
const order = builds.length ? builds : ['battle', 'learn', 'bug']

const anyOf = (v, f) => (Array.isArray(v) ? v.some(f) : f(v))
const matches = (m, c) => !c.ok && anyOf(m.fact, (f) => f === c.fact) && (!m.what || anyOf(m.what, (w) => c.what.includes(w)))

const summary = {}
const servers = []
for (const b of order) {
  const url = card.builds[b]?.url
  if (!card.builds[b]) {
    console.log(`${b}: no such build in fact-card.json (builds: ${Object.keys(card.builds).join(', ')})`)
    continue
  }
  if (!(await isUp(url))) {
    const server = card.builds[b].dist ? await serve(join(dir, card.builds[b].dist), Number(new URL(url).port)) : null
    if (!server) {
      console.log(`${b}: ${url} is not responding and there is no build to serve.`)
      continue
    }
    servers.push(server)
  }
  rmSync(join(dir, 'results', b), { recursive: true, force: true })
  console.log(`\n=== ${b} (${url}) ===`)
  // async on purpose: this process may be serving the build, so it must keep answering requests
  const child = spawn(process.execPath, [cli, 'test', '-c', join(dir, 'playwright.config.mjs')], {
    cwd: dir,
    stdio: 'inherit',
    env: { ...process.env, BUILD: b, BASE_URL: url, ...(video ? { VIDEO: '1', SLOWMO: process.env.SLOWMO || '250' } : {}) },
  })
  await new Promise((done) => child.on('exit', done))
  const rdir = join(dir, 'results', b)
  const results = existsSync(rdir)
    ? readdirSync(rdir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(rdir, f), 'utf8')))
    : []
  const failedChecks = results.flatMap((r) => r.checks.filter((c) => !c.ok).map((c) => ({ ...c, test: r.id })))
  const planted = key.filter((d) => d.builds.includes(b))
  const caught = planted.map((d) => ({ id: d.id, text: d.text, by: [...new Set(failedChecks.filter((c) => matches(d.match, c)).map((c) => c.test))] }))
  // a wrong Total next to another failed check in the same test is a consequence, not a separate finding
  const consequence = (c) => c.fact === 'F03' && failedChecks.some((o) => o.test === c.test && o !== c && o.fact !== 'F03')
  const extra = failedChecks.filter((c) => !planted.some((d) => matches(d.match, c)) && !consequence(c))
  const extraGroups = {}
  for (const c of extra) {
    const k = `${c.fact ?? '-'} · ${c.what}`
    ;(extraGroups[k] ??= []).push(`${c.test} (expected ${c.expected}, got ${c.actual})`)
  }
  summary[b] = {
    url,
    executed: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    failedTests: results.filter((r) => !r.passed).map((r) => r.id),
    planted: caught,
    notOnPlantedList: Object.entries(extraGroups).map(([what, tests]) => ({ what, tests: [...new Set(tests)] })),
  }
}

const lines = []
lines.push('# Test run results', '')
lines.push(`Tests: \`tests.json\` (${suite.counts.total} generated, ${suite.counts.ready} runnable, ${suite.counts.blocked} blocked by a question).`, '')
for (const [b, s] of Object.entries(summary)) {
  const hit = s.planted.filter((d) => d.by.length)
  lines.push(`## ${b} (${s.url})`, '')
  lines.push(`Run ${s.executed}, passed ${s.passed}, failed ${s.failed}${s.failedTests.length ? ` (${s.failedTests.join(', ')})` : ''}.`, '')
  lines.push(`Planted defects: found **${hit.length} of ${s.planted.length}**.`, '')
  for (const d of s.planted) lines.push(`- ${d.by.length ? 'FOUND' : 'NOT FOUND'} ${d.id}: ${d.text}${d.by.length ? ` (${d.by.join(', ')})` : ''}`)
  if (s.notOnPlantedList.length) {
    lines.push('', 'Failures not on the planted list (the app differs from the spec):', '')
    for (const e of s.notOnPlantedList) lines.push(`- ${e.what}: ${e.tests.join(', ')}`)
  }
  lines.push('')
}
writeFileSync(join(dir, 'results.json'), JSON.stringify(summary, null, 2) + '\n')
writeFileSync(join(dir, 'results.md'), lines.join('\n'))

console.log('\n' + '='.repeat(72))
for (const [b, s] of Object.entries(summary)) {
  const hit = s.planted.filter((d) => d.by.length).length
  console.log(`${b.padEnd(7)} run ${s.executed}, passed ${s.passed}, failed ${s.failed} · planted defects found ${hit}/${s.planted.length}`)
  for (const d of s.planted) console.log(`   ${d.by.length ? '✔' : '✘'} ${d.id}${d.by.length ? ` ← ${d.by.join(', ')}` : ''}`)
  if (s.notOnPlantedList.length) console.log(`   + not on the list: ${s.notOnPlantedList.length} spec discrepancies (see results.md)`)
}
console.log('Details: examples/fooddash/results.md')
for (const server of servers) server.close()
