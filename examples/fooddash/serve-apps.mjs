#!/usr/bin/env node
// node serve-apps.mjs → serves every build listed in fact-card.json (builds.<key>.dist on builds.<key>.url)
// so you can click through the app yourself. run.mjs serves a build on its own when it is not up.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '../../lib/serve.mjs'

const dir = dirname(fileURLToPath(import.meta.url))
const { builds } = JSON.parse(readFileSync(join(dir, 'fact-card.json'), 'utf8'))
for (const [key, b] of Object.entries(builds)) {
  const server = await serve(join(dir, b.dist), Number(new URL(b.url).port))
  console.log(`  ${key.padEnd(7)} ${b.url}${server ? '' : '  (port already in use: assuming it is already served)'}`)
}
console.log('Ctrl+C stops the servers.')
