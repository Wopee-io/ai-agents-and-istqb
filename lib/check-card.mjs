#!/usr/bin/env node
// node lib/check-card.mjs <fact-card.json> → checks a fact card before the analyst reads it.
// Code, not a model, verifies what can be verified:
//   1. shape: unique ids, known fact types, every fact has a source story and a quote;
//   2. quotes: every quote is in one of the card's source documents, word for word. " ... " (with the
//      spaces) may skip text inside one document; each part needs at least three words and must start
//      and end on a word boundary. Markdown emphasis, list markers, table bars, link targets and line
//      breaks in the document are ignored;
//   3. references: stories exist in the documents; open questions and decision tables point to facts on the card;
//   4. lifecycles: unique transition ids, every transition starts and ends in a declared state;
//   5. approval: whether the card changed after the analyst approved it.
// Exit code 0 when the card is clean, 1 when something needs fixing.

import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const FACT_TYPES = ['limit', 'rule', 'lifecycle', 'parameter']
const MIN_WORDS = 3

const tidy = (s) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()

// A source document as plain text: no emphasis, code ticks, list or quote markers, table bars or link targets.
export function plainDocument(markdown) {
  const out = []
  let inList = false
  let previous = ''
  for (const raw of markdown.split(/\r?\n/)) {
    let line = raw
    const blankBefore = previous.trim() === '' || /^\s*#/.test(previous)
    // a marker only counts where a list item or quote can start, not on a wrapped line of running text
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line) && (blankBefore || inList)) {
      line = line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')
      inList = true
    } else if (/^\s*>\s?/.test(line) && (blankBefore || /^\s*>/.test(previous))) {
      line = line.replace(/^\s*>\s?/, '')
    } else if (line.trim() === '') inList = false
    else if (!/^\s+\S/.test(raw)) inList = false
    out.push(line)
    previous = raw
  }
  return tidy(
    out
      .join('\n')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, ' ')
      .replace(/\|/g, ' ')
      .replace(/[*`]/g, '')
      .replace(/(^|[^\p{L}\p{N}])_+|_+(?=[^\p{L}\p{N}]|$)/gu, '$1'),
  )
}

const isWordChar = (c) => c !== undefined && /[\p{L}\p{N}]/u.test(c)

// Where the part occurs in the text on word boundaries, at or after `from`; -1 when it does not.
function findPart(text, part, from) {
  for (let at = text.indexOf(part, from); at >= 0; at = text.indexOf(part, at + 1)) {
    const before = text[at - 1]
    const after = text[at + part.length]
    const startsOk = !isWordChar(part[0]) || !isWordChar(before)
    // "$20" must not match inside "$20.00": a digit, or a decimal point followed by a digit, continues the number
    const numberGoesOn = /[\d]/.test(part.at(-1)) && (/\d/.test(after ?? '') || (/[.,]/.test(after ?? '') && /\d/.test(text[at + part.length + 1] ?? '')))
    const endsOk = (!isWordChar(part.at(-1)) || !isWordChar(after)) && !numberGoesOn
    if (startsOk && endsOk) return at
  }
  return -1
}

// null when the quote is found in one document; otherwise the reason it is not accepted.
export function quoteProblem(quote, documents) {
  const parts = tidy(quote).split(' ... ').map((p) => p.trim())
  if (parts.some((p) => !p)) return 'has an empty part'
  const short = parts.find((p) => p.split(' ').length < MIN_WORDS)
  if (short) return `part "${short}" is shorter than ${MIN_WORDS} words, too little to identify a sentence`
  if (/\.\.\.|…/.test(parts.join(' '))) return 'skips text without " ... " (three dots with a space on each side)'
  for (const text of documents) {
    let from = 0
    let ok = true
    for (const part of parts) {
      const at = findPart(text, part, from)
      if (at < 0) {
        ok = false
        break
      }
      from = at + part.length
    }
    if (ok) return null
  }
  return 'not found in the sources'
}
export const quoteFound = (quote, documents) => quoteProblem(quote, [].concat(documents)) === null

// What an approval covers: everything tests are computed from.
export function contentHash(card) {
  const covered = { facts: card.facts, decisionTables: card.decisionTables, data: card.data, openQuestions: card.openQuestions }
  return createHash('sha256').update(JSON.stringify(covered)).digest('hex')
}
// 'approved' | 'changed' (approved, then edited) | 'not approved'
export function approvalState(card) {
  if (card.approval?.status !== 'approved') return 'not approved'
  return card.approval.sha256 === contentHash(card) ? 'approved' : 'changed'
}

const SOURCE = /^([A-Z]+-\d+(?:, [A-Z]+-\d+)*)(?:: (.+))?$/s

export function checkCard(card, sourceTexts) {
  const problems = []
  const documents = sourceTexts.map(plainDocument)
  const all = documents.join(' ')
  const ids = new Set()
  let quotes = 0
  const quote = (where, q) => {
    quotes++
    const why = quoteProblem(q, documents)
    if (why) problems.push(`${where}: quote ${why}: "${q}"`)
  }
  const stories = (where, list) => {
    for (const s of list.split(',').map((x) => x.trim())) {
      if (!/^[A-Z]+-\d+$/.test(s)) problems.push(`${where}: "${s}" is not a story id like FD-07`)
      else if (findPart(all, s, 0) < 0) problems.push(`${where}: story ${s} is not in the sources`)
    }
  }
  // a nested "source" (on a transition, an order-number pattern, ...) is "STORY" or "STORY: quoted sentence"
  const nestedSources = (where, node) => {
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      const here = `${where}${node.id ? ` ${node.id}` : ''}`
      if (key === 'source' && typeof value === 'string') {
        const m = value.match(SOURCE)
        if (!m) problems.push(`${here}: source "${value}" is not "STORY" or "STORY: quoted sentence"`)
        else {
          stories(here, m[1])
          if (m[2]) quote(here, m[2])
        }
      } else nestedSources(Array.isArray(node) ? where : here, value)
    }
  }
  for (const f of card.facts ?? []) {
    if (!f.id) problems.push('a fact has no id')
    if (ids.has(f.id)) problems.push(`${f.id}: id used twice`)
    ids.add(f.id)
    if (!FACT_TYPES.includes(f.type)) problems.push(`${f.id}: type "${f.type}" is not one of ${FACT_TYPES.join(', ')}`)
    if (!f.source?.story) problems.push(`${f.id}: no source.story`)
    else stories(f.id, f.source.story)
    if (!f.source?.quote) problems.push(`${f.id}: no source.quote`)
    else quote(f.id, f.source.quote)
    if (f.type === 'lifecycle') {
      const m = f.values ?? {}
      const states = new Set(m.states ?? [])
      if (!states.has(m.initial)) problems.push(`${f.id}: initial state "${m.initial}" is not in states`)
      if (m.final !== undefined && !states.has(m.final)) problems.push(`${f.id}: final state "${m.final}" is not in states`)
      const moves = new Set()
      for (const t of [...(m.transitions ?? []), ...(m.forbidden ?? [])]) {
        if (!t.id) problems.push(`${f.id}: a transition has no id`)
        else if (moves.has(t.id)) problems.push(`${f.id} ${t.id}: transition id used twice`)
        moves.add(t.id)
      }
      for (const t of m.transitions ?? []) {
        if (!states.has(t.from) || !states.has(t.to)) problems.push(`${f.id} ${t.id}: "${t.from}" → "${t.to}" uses an undeclared state`)
      }
      for (const x of m.forbidden ?? []) if (!states.has(x.from)) problems.push(`${f.id} ${x.id}: "${x.from}" is not in states`)
    }
    nestedSources(f.id, f.values)
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

export function loadCard(file) {
  const card = JSON.parse(readFileSync(file, 'utf8'))
  const texts = (card.sources ?? []).map((s) => {
    try {
      return readFileSync(join(dirname(file), s.path), 'utf8')
    } catch {
      throw new Error(`source document not found: ${s.path} (paths in "sources" are relative to the card)`)
    }
  })
  return { card, texts }
}

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
  } catch {
    return false
  }
})()
if (isMain) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node lib/check-card.mjs <fact-card.json>')
    process.exit(1)
  }
  let loaded
  try {
    loaded = loadCard(file)
  } catch (e) {
    console.error(`✘ ${e.message}`)
    process.exit(1)
  }
  const { card, texts } = loaded
  const r = checkCard(card, texts)
  const byType = FACT_TYPES.map((t) => `${t} ${(card.facts ?? []).filter((f) => f.type === t).length}`).join(', ')
  console.log(`${r.facts} facts (${byType}) · ${r.quotes} quotes checked against ${texts.length} source documents · ${r.questions} open questions`)
  const state = approvalState(card)
  const who = card.approval?.by ? ` by ${card.approval.by}, ${card.approval.date}` : ''
  console.log(
    state === 'approved'
      ? `approval: approved${who}, unchanged since`
      : state === 'changed'
        ? `approval: CHANGED since it was approved${who}: the analyst approves the card again (npm run approve)`
        : `approval: not approved yet (status "${card.approval?.status ?? 'missing'}")`,
  )
  if (r.problems.length) {
    for (const p of r.problems) console.log(`  ✘ ${p}`)
    console.log(`${r.problems.length} problem${r.problems.length > 1 ? 's' : ''}: fix the card before the analyst reviews it.`)
    process.exit(1)
  }
  console.log('✔ every quote is in the sources, every reference resolves')
}
