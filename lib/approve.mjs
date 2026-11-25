#!/usr/bin/env node
// node lib/approve.mjs <fact-card.json> "<analyst name>" → records the analyst's approval on the card.
// A person runs this, never an agent. The approval stores a hash of the facts, decision tables, test data and
// open questions, so any later edit shows as "changed since approval" and the generator stops until it is approved again.

import { readFileSync, writeFileSync } from 'node:fs'
import { approvalState, checkCard, contentHash, loadCard } from './check-card.mjs'

const [file, by] = process.argv.slice(2)
if (!file || !by) {
  console.error('usage: node lib/approve.mjs <fact-card.json> "<analyst name>"')
  process.exit(1)
}
const { card, texts } = loadCard(file)
const { problems } = checkCard(card, texts)
if (problems.length) {
  console.error(`The card has ${problems.length} problem${problems.length > 1 ? 's' : ''}. Run check-card and fix them before approving.`)
  process.exit(1)
}
if (approvalState(card) === 'approved') {
  console.log(`Already approved by ${card.approval.by} on ${card.approval.date}, unchanged since.`)
  process.exit(0)
}
const text = readFileSync(file, 'utf8')
const note = card.approval?.note
card.approval = { status: 'approved', by, date: new Date().toISOString().slice(0, 10), sha256: contentHash(card), ...(note ? { note } : {}) }
// keep the card's own formatting: replace only the approval block
const block = JSON.stringify(card.approval, null, 2).replace(/\n/g, '\n  ')
const next = text.replace(/"approval":\s*\{[^}]*\}/, `"approval": ${block}`)
if (next === text && !/"approval"/.test(text)) {
  console.error('The card has no "approval" block to fill in. Add "approval": { "status": "draft" } and run this again.')
  process.exit(1)
}
writeFileSync(file, next)
console.log(`Approved by ${by} on ${card.approval.date}. ${(card.openQuestions ?? []).length} open question(s) stay open.`)
