#!/usr/bin/env node
// node serve-apps.mjs → serves every build listed in fact-card.json (builds.<key>.dist on builds.<key>.url)
// so you can click through the app yourself. run.mjs serves a build on its own when it is not up.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve, pageText } from '../../lib/serve.mjs'

const dir = dirname(fileURLToPath(import.meta.url))
const { builds, product } = JSON.parse(readFileSync(join(dir, 'fact-card.json'), 'utf8'))
const app = product.split(' ')[0]
let started = 0
let wrong = 0
for (const [key, b] of Object.entries(builds)) {
  const server = await serve(join(dir, b.dist), Number(new URL(b.url).port))
  if (server) started++
  const page = server ? '' : ((await pageText(b.url)) ?? '')
  const other = !server && !page.includes(app)
  if (other) wrong++
  console.log(`  ${key.padEnd(7)} ${b.url}${server ? '' : other ? `  ✘ the port is taken by something that is not ${app}` : '  (already being served)'}`)
}
if (started) console.log('Ctrl+C stops the servers.')
else console.log(wrong ? 'Nothing was started.' : 'All builds were already being served; nothing new was started.')
if (wrong) process.exitCode = 1
