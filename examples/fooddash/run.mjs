#!/usr/bin/env node
// node run.mjs [battle] [learn] [bug] [--verbose] [--video]   (default: all three builds)
// Runs the generated tests headless with Playwright against each FoodDash build and prints one line per test,
// then which planted defects the failed checks match (planted-defects.json). Writes results.json + results.md.
// A build that is not being served yet is served from apps/dist for the run.
// Failing tests are the expected result here, so they do not change the exit code. The exit code is 1 when the
// run itself did not happen as planned: unknown build, wrong app on the port, tests that did not execute.

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve, pageText } from '../../lib/serve.mjs'
import { contentHash } from '../../lib/check-card.mjs'

const dir = dirname(fileURLToPath(import.meta.url))
const fail = (message) => {
  console.error(message)
  process.exit(1)
}
let cli
try {
  cli = join(dirname(createRequire(import.meta.url).resolve('@playwright/test/package.json')), 'cli.js')
} catch {
  fail('Playwright is not installed. In the repository root: npm install && npx playwright install chromium')
}
if (!existsSync(join(dir, 'tests.json'))) fail('No tests.json yet. Generate the tests first: npm run generate')

const args = process.argv.slice(2)
const FLAGS = ['--verbose', '--video']
const unknownFlag = args.find((a) => a.startsWith('--') && !FLAGS.includes(a))
if (unknownFlag) fail(`Unknown option ${unknownFlag}. Options: ${FLAGS.join(', ')}`)
const video = args.includes('--video')
const verbose = args.includes('--verbose')
const card = JSON.parse(readFileSync(join(dir, 'fact-card.json'), 'utf8'))
const suite = JSON.parse(readFileSync(join(dir, 'tests.json'), 'utf8'))
const key = JSON.parse(readFileSync(join(dir, 'planted-defects.json'), 'utf8')).defects
const ALL = Object.keys(card.builds)
const builds = args.filter((a) => !a.startsWith('--'))
const unknownBuild = builds.find((b) => !card.builds[b])
if (unknownBuild) fail(`No build "${unknownBuild}" in fact-card.json. Builds: ${ALL.join(', ')}`)
const order = builds.length ? builds : [...ALL].sort((a, b) => (a === 'battle' ? -1 : b === 'battle' ? 1 : 0)) // newest build first
if (suite.cardSha256 !== contentHash(card)) fail('tests.json was generated from a different fact card than the one on disk. Run: npm run generate')
const APP = card.product.split(' ')[0] // "FoodDash": the page on the port must be this app, not whatever else listens there

const anyOf = (v, f) => (Array.isArray(v) ? v.some(f) : f(v))
const matches = (m, c) => !c.ok && anyOf(m.fact, (f) => f === c.fact) && (!m.what || anyOf(m.what, (w) => c.what.includes(w)))

let previous = {}
try {
  previous = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'))
} catch {}
const summary = {}
const servers = []
const problems = []
for (const b of order) {
  const { url, dist } = card.builds[b]
  let page = await pageText(url)
  if (page === null) {
    if (!dist || !existsSync(join(dir, dist, 'index.html'))) {
      problems.push(`${b}: nothing answers on ${url} and there is no build in ${dist ?? '(no dist on the card)'}`)
      continue
    }
    const server = await serve(join(dir, dist), Number(new URL(url).port))
    if (server) servers.push(server)
    page = await pageText(url)
  }
  if (page === null || !page.includes(APP)) {
    problems.push(`${b}: ${url} is answered by something that is not ${APP}. Free the port or change builds.${b}.url on the card.`)
    continue
  }
  rmSync(join(dir, 'results', b), { recursive: true, force: true })
  const expected = suite.counts.perBuild[b]
  console.log(`\n${b} · ${url} · ${expected} tests`)
  // async on purpose: this process may be serving the build, so it must keep answering requests
  const child = spawn(process.execPath, [cli, 'test', '-c', join(dir, 'playwright.config.mjs')], {
    cwd: dir,
    stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BUILD: b, BASE_URL: url, ...(video ? { VIDEO: '1', SLOWMO: process.env.SLOWMO || '250' } : {}) },
  })
  let log = ''
  if (!verbose) for (const stream of [child.stdout, child.stderr]) stream.on('data', (d) => (log += d))
  await new Promise((done) => child.on('exit', done))
  const rdir = join(dir, 'results', b)
  const results = existsSync(rdir)
    ? readdirSync(rdir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(rdir, f), 'utf8')))
    : []
  if (results.length !== expected) {
    problems.push(`${b}: ${results.length} of ${expected} tests ran. ${results.length ? 'Run again with --verbose to see why.' : 'Is Chromium installed? npx playwright install chromium'}`)
    if (!verbose && !results.length) console.log(log.split('\n').slice(-15).join('\n'))
  }
  for (const r of results) {
    const failed = r.checks.filter((c) => !c.ok)
    console.log(`  ${r.passed ? '✔' : '✘'} ${r.id} ${r.title}`)
    for (const c of failed) console.log(`        ${c.fact ?? 'runner'} · ${c.what}: expected ${c.expected || '—'}, got ${c.actual}`)
  }
  const failedChecks = results.flatMap((r) => r.checks.filter((c) => !c.ok).map((c) => ({ ...c, test: r.id })))
  // a step the runner could not do (timeout, element not found) is not yet a finding about the app
  const runnerErrors = failedChecks.filter((c) => c.fact === null)
  const appChecks = failedChecks.filter((c) => c.fact !== null)
  const planted = key.filter((d) => d.builds.includes(b))
  const caught = planted.map((d) => ({ id: d.id, text: d.text, by: [...new Set(appChecks.filter((c) => matches(d.match, c)).map((c) => c.test))] }))
  // a wrong Total next to another failed check in the same test is a consequence, not a separate finding
  const consequence = (c) => c.fact === 'F03' && appChecks.some((o) => o.test === c.test && o !== c && o.fact !== 'F03')
  const extra = appChecks.filter((c) => !planted.some((d) => matches(d.match, c)) && !consequence(c))
  const extraGroups = {}
  for (const c of extra) {
    const k = `${c.fact} · ${c.what}`
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
    runnerErrors: runnerErrors.map((c) => `${c.test}: ${c.actual}`),
    notes: results.flatMap((r) => r.notes.map((n) => `${r.id}: ${n}`)),
  }
}
for (const server of servers) server.close()

// keep the builds that were not part of this run, so `npm run tests battle` does not drop learn and bug
const merged = Object.fromEntries(ALL.map((b) => [b, summary[b] ?? previous[b]]).filter(([, s]) => s))
const lines = []
lines.push('# Test run results', '')
lines.push(`Tests: \`tests.json\` (${suite.counts.total} generated, ${suite.counts.ready} runnable, ${suite.counts.blocked} blocked by a question).`, '')
for (const [b, s] of Object.entries(merged)) {
  const hit = s.planted.filter((d) => d.by.length)
  lines.push(`## ${b} (${s.url})`, '')
  lines.push(`Run ${s.executed}, passed ${s.passed}, failed ${s.failed}${s.failedTests.length ? ` (${s.failedTests.join(', ')})` : ''}.`, '')
  lines.push(`Planted defects: found **${hit.length} of ${s.planted.length}**.`, '')
  for (const d of s.planted) lines.push(`- ${d.by.length ? 'FOUND' : 'NOT FOUND'} ${d.id}: ${d.text}${d.by.length ? ` (${d.by.join(', ')})` : ''}`)
  if (s.notOnPlantedList.length) {
    lines.push('', 'Failures not on the planted list (the app differs from the spec):', '')
    for (const e of s.notOnPlantedList) lines.push(`- ${e.what}: ${e.tests.join(', ')}`)
  }
  if (s.runnerErrors?.length) {
    lines.push('', 'Steps the runner could not do (look at the screenshot before calling these defects):', '')
    for (const e of s.runnerErrors) lines.push(`- ${e}`)
  }
  if (s.notes?.length) {
    lines.push('', 'Notes from the runner:', '')
    for (const n of s.notes) lines.push(`- ${n}`)
  }
  lines.push('')
}
writeFileSync(join(dir, 'results.json'), JSON.stringify(merged, null, 2) + '\n')
writeFileSync(join(dir, 'results.md'), lines.join('\n'))

console.log('\n' + '='.repeat(72))
for (const [b, s] of Object.entries(summary)) {
  const hit = s.planted.filter((d) => d.by.length).length
  console.log(`${b.padEnd(7)} run ${s.executed}, passed ${s.passed}, failed ${s.failed} · planted defects found ${hit}/${s.planted.length}`)
  for (const d of s.planted) console.log(`   ${d.by.length ? '✔' : '✘'} ${d.id}${d.by.length ? ` ← ${d.by.join(', ')}` : ''}`)
  if (s.notOnPlantedList.length) console.log(`   + not on the list: ${s.notOnPlantedList.length} more differences from the spec`)
  if (s.runnerErrors.length) console.log(`   ! ${s.runnerErrors.length} step(s) the runner could not do`)
}
console.log('Failed tests are the point: the builds have defects. Details: examples/fooddash/results.md')
if (problems.length) {
  for (const p of problems) console.error(`✘ ${p}`)
  process.exit(1)
}
