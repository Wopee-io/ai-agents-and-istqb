import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkCard, quoteFound, plain } from './check-card.mjs'

const spec = `## FD-10 · Minimum order\n\n- **Sushi Masters: $20.00.** The others have none.\n- The minimum applies to the **food subtotal only** — fees do\n  not count towards it.\n`

test('quoteFound ignores markdown and line breaks, and " ... " skips text', () => {
  const text = plain(spec)
  assert.equal(quoteFound('Sushi Masters: $20.00. ... The minimum applies to the food subtotal only — fees do not count towards it.', text), true)
  assert.equal(quoteFound('The minimum applies to the total', text), false)
  assert.equal(quoteFound('fees do not count ... Sushi Masters', text), false)
})

test('checkCard reports an invented quote, an unknown type and a dangling question', () => {
  const card = {
    facts: [
      { id: 'F1', type: 'limit', source: { story: 'FD-10', quote: 'Sushi Masters: $20.00.' } },
      { id: 'F2', type: 'guess', source: { story: 'FD-10', quote: 'Fees count towards the minimum.' } },
    ],
    openQuestions: [{ id: 'Q1', facts: ['F9'], question: 'Which one?' }],
  }
  const r = checkCard(card, [spec])
  assert.equal(r.quotes, 2)
  assert.deepEqual(r.problems, ['F2: type "guess" is not one of limit, rule, lifecycle, parameter', 'F2: quote not found in the sources: "Fees count towards the minimum."', 'Q1: refers to F9, which is not on the card'])
})
