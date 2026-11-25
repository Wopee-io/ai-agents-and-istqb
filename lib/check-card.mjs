#!/usr/bin/env node
// node lib/check-card.mjs <fact-card.json> → checks a fact card before the analyst reads it.
// Code, not a model, verifies what can be verified:
//   1. shape: unique ids, known fact types, every fact has a source story and a quote;
//   2. quotes: every quote is really in one of the card's source documents (word for word;
//      " ... " may skip text, markdown emphasis and line breaks are ignored);
//   3. references: open questions and decision tables only point to facts that exist;
//   4. lifecycles: every transition starts and ends in a declared state.
// Exit code 0 when the card is clean, 1 when something needs fixing.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const FACT_TYPES = ['limit', 'rule', 'lifecycle', 'parameter']

// Plain text for comparing: no markdown emphasis, code ticks, list markers, quote markers or line breaks.
export const plain = (s) =>
  s
    .replace(/^\s*(?:[-*>]|\d+\.)\s+/gm, ' ')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

// True when every fragment of the quote (split on " ... ") appears in the text, in order.
export function quoteFound(quote, text) {
  let from = 0
  for (const part of plain(quote).split(/\s*\.\.\.\s*/).filter(Boolean)) {
    const at = text.indexOf(part, from)
    if (at < 0) return false
    from = at + part.length
  }
  return true
}

export function checkCard(card, sourceTexts) {
  const problems = []
  const text = sourceTexts.map(plain).join(' ')
  const ids = new Set()
  let quotes = 0
  const quote = (where, q) => {
    quotes++
    if (!quoteFound(q, text)) problems.push(`${where}: quote not found in the sources: "${q}"`)
  }
  for (const f of card.facts ?? []) {
    if (!f.id) problems.push('a fact has no id')
    if (ids.has(f.id)) problems.push(`${f.id}: id used twice`)
    ids.add(f.id)
    if (!FACT_TYPES.includes(f.type)) problems.push(`${f.id}: type "${f.type}" is not one of ${FACT_TYPES.join(', ')}`)
    if (!f.source?.story) problems.push(`${f.id}: no source.story`)
    if (!f.source?.quote) problems.push(`${f.id}: no source.quote`)
    else quote(f.id, f.source.quote)
    if (f.type === 'lifecycle') {
      const m = f.values ?? {}
      const states = new Set(m.states ?? [])
      if (!states.has(m.initial)) problems.push(`${f.id}: initial state "${m.initial}" is not in states`)
      for (const t of m.transitions ?? []) {
        if (!states.has(t.from) || !states.has(t.to)) problems.push(`${f.id} ${t.id}: "${t.from}" → "${t.to}" uses an undeclared state`)
      }
      for (const x of m.forbidden ?? []) if (!states.has(x.from)) problems.push(`${f.id} ${x.id}: "${x.from}" is not in states`)
      // transitions may carry their own source as "STORY: quoted sentence"
      for (const t of [...(m.transitions ?? []), ...(m.forbidden ?? [])]) {
        const own = typeof t.source === 'string' && t.source.match(/^[A-Z]+-\d+(?:, [A-Z]+-\d+)*: (.+)$/)
        if (own) quote(`${f.id} ${t.id}`, own[1])
      }
    }
  }
  for (const q of card.openQuestions ?? []) {
    for (const id of q.facts ?? []) if (!ids.has(id)) problems.push(`${q.id}: refers to ${id}, which is not on the card`)
    if (!q.question) problems.push(`${q.id}: no question text`)
  }
  for (const dt of card.decisionTables ?? []) {
    for (const id of dt.conditions ?? []) if (!ids.has(id)) problems.push(`${dt.id}: condition ${id} is not on the card`)
  }
  return { facts: ids.size, quotes, questions: (card.openQuestions ?? []).length, problems }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node lib/check-card.mjs <fact-card.json>')
    process.exit(1)
  }
  const card = JSON.parse(readFileSync(file, 'utf8'))
  const texts = (card.sources ?? []).map((s) => readFileSync(join(dirname(file), s.path), 'utf8'))
  const r = checkCard(card, texts)
  const byType = FACT_TYPES.map((t) => `${t} ${card.facts.filter((f) => f.type === t).length}`).join(', ')
  console.log(`${r.facts} facts (${byType}) · ${r.quotes} quotes checked against ${texts.length} source documents · ${r.questions} open questions`)
  console.log(`approval: ${card.approval?.status ?? 'missing'}${card.approval?.by ? ` (${card.approval.by}, ${card.approval.date})` : ''}`)
  if (r.problems.length) {
    for (const p of r.problems) console.log(`  ✘ ${p}`)
    console.log(`${r.problems.length} problem${r.problems.length > 1 ? 's' : ''}: fix the card before the analyst reviews it.`)
    process.exit(1)
  }
  console.log('✔ every quote is in the sources, every reference resolves')
}
