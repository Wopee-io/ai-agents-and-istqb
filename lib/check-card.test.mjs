import { test } from 'node:test'
import assert from 'node:assert/strict'
import { approvalState, checkCard, contentHash, plainDocument, quoteProblem } from './check-card.mjs'

const spec = `## FD-10 · Minimum order

- **Sushi Masters: $20.00.** The others have none.
- The minimum applies to the **food subtotal only** — fees do
  not count towards it.
- Delivery and service fees are never discounted. The Service Fee is a flat $1.50 per order.

Total = Subtotal
- discount + Delivery Fee. See [the main spec](../spec.md) for the rest.

| Field | Required |
| --- | --- |
| Full Name | **yes** |
`
const docs = [plainDocument(spec)]
const found = (q) => quoteProblem(q, docs) === null

test('a real quote is found: markdown, list markers, line breaks, links and table bars do not matter', () => {
  assert.equal(found('Sushi Masters: $20.00. ... The minimum applies to the food subtotal only — fees do not count towards it.'), true)
  assert.equal(found('Total = Subtotal - discount + Delivery Fee.'), true)
  assert.equal(found('See the main spec for the rest.'), true)
  assert.equal(found('Full Name yes'), true)
  assert.equal(found('Name yes'), false) // two words: too short to identify anything
})

test('a quote that changes the meaning is rejected', () => {
  assert.equal(found('The minimum applies to the total'), false)
  assert.equal(found('fees do ... count towards it.'), false)
  assert.equal(found('Delivery and service fees are ... discounted.'), false)
  assert.equal(found('The Service Fee is a flat $1'), false)
  assert.equal(found('Sushi Masters: $20'), false)
  assert.equal(found('...'), false)
  assert.equal(found('fees do not count ... Sushi Masters: $20.00.'), false)
  assert.equal(found('The minimum...applies to the food subtotal only'), false)
})

test('a quote cannot be stitched from two documents', () => {
  const two = [plainDocument('Free means $0.00 for delivery.'), plainDocument('Sushi Masters: $20.00. The others have none.')]
  assert.equal(quoteProblem('Free means $0.00 ... Sushi Masters: $20.00.', two), 'not found in the sources')
})

test('checkCard reports invented quotes, unknown types, unknown stories, dangling references and lifecycle slips', () => {
  const card = {
    facts: [
      { id: 'F1', type: 'limit', source: { story: 'FD-10', quote: 'Sushi Masters: $20.00.' } },
      { id: 'F2', type: 'guess', source: { story: 'FD-99', quote: 'Fees count towards the minimum.' } },
      {
        id: 'F3',
        type: 'lifecycle',
        source: { story: 'FD-10', quote: 'The others have none.' },
        values: {
          states: ['A', 'B'],
          initial: 'A',
          final: 'Nowhere',
          transitions: [{ id: 't', from: 'A', to: 'B', source: 'fd-10: invented' }, { id: 't', from: 'B', to: 'C' }],
          pattern: { source: 'FD-10: The others have none.' },
        },
      },
    ],
    openQuestions: [{ id: 'Q1', facts: ['F9'], question: 'Which one?' }],
  }
  const r = checkCard(card, [spec])
  assert.deepEqual(r.problems, [
    'F2: type "guess" is not one of limit, rule, lifecycle, parameter',
    'F2: story FD-99 is not in the sources',
    'F2: quote not found in the sources: "Fees count towards the minimum."',
    'F3: final state "Nowhere" is not in states',
    'F3 t: transition id used twice',
    'F3 t: "B" → "C" uses an undeclared state',
    'F3 t: source "fd-10: invented" is not "STORY" or "STORY: quoted sentence"',
    'Q1: refers to F9, which is not on the card',
  ])
  assert.equal(r.quotes, 4)
  assert.deepEqual(checkCard({}, []).problems, [])
})

test('an approval covers the content it was given for', () => {
  const card = { facts: [{ id: 'F1', values: { boundary: 2000 } }], openQuestions: [] }
  assert.equal(approvalState(card), 'not approved')
  card.approval = { status: 'approved', sha256: contentHash(card) }
  assert.equal(approvalState(card), 'approved')
  card.facts[0].values.boundary = 1500
  assert.equal(approvalState(card), 'changed')
})
