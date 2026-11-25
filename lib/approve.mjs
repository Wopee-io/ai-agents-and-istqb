#!/usr/bin/env node
// node lib/approve.mjs <fact-card.json> "<analyst name>" → records the analyst's approval on the card.
// A person runs this, never an agent. The approval stores a hash of the sources, builds, facts, decision tables,
// test data and open questions, so any later edit shows as "changed since approval" and the generator stops
// until it is approved again.

import { readFileSync, writeFileSync } from 'node:fs'
import { approvalState, checkCard, contentHash, loadCard } from './check-card.mjs'

const fail = (message) => {
  console.error(message)
  process.exit(1)
}
const [file, by] = process.argv.slice(2)
if (!file || !by) fail('usage: node lib/approve.mjs <fact-card.json> "<analyst name>"')
let loaded
try {
  loaded = loadCard(file)
} catch (e) {
  fail(`Cannot read the card: ${e.message}`)
}
const { card, texts } = loaded
const { problems } = checkCard(card, texts)
if (problems.length) fail(`The card has ${problems.length} problem${problems.length > 1 ? 's' : ''}. Run check-card and fix them before approving.`)
if (approvalState(card) === 'approved') {
  console.log(`Already approved by ${card.approval.by} on ${card.approval.date}, unchanged since.`)
  process.exit(0)
}
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const note = card.approval?.note
const approval = { status: 'approved', by, date: today, sha256: contentHash(card), ...(note ? { note } : {}) }
// keep the card's own formatting: replace only the approval block (a flat object; braces inside its strings are fine)
const text = readFileSync(file, 'utf8')
const BLOCK = /"approval":\s*\{(?:[^{}"]|"(?:[^"\\]|\\.)*")*\}/
if (!BLOCK.test(text)) fail('The card needs a flat "approval" block to fill in, for example "approval": { "status": "draft" }.')
const next = text.replace(BLOCK, () => `"approval": ${JSON.stringify(approval, null, 2).replace(/\n/g, '\n  ')}`)
let written
try {
  written = JSON.parse(next)
} catch {}
if (!written || approvalState(written) !== 'approved') fail('Could not record the approval without changing the rest of the card. Nothing was written.')
writeFileSync(file, next)
console.log(`Approved by ${by} on ${today}. ${(card.openQuestions ?? []).length} open question(s) stay open.`)
