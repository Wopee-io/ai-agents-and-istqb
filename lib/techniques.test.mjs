import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boundaryPoints, firstAbove, nearestReachable, decisionRules, shortestPath, transitionTours, forbiddenPaths, uncoveredValues } from './techniques.mjs'

test('boundaryPoints: 3-value BVA, both boundary values with their neighbours', () => {
  assert.deepEqual(boundaryPoints(firstAbove(2000, '>=')), [1998, 1999, 2000, 2001])
  assert.deepEqual(boundaryPoints(firstAbove(2500, '>')), [2499, 2500, 2501, 2502])
  assert.throws(() => boundaryPoints('2000'), /whole numbers/)
  assert.throws(() => boundaryPoints(0.3, 0.1), /whole numbers/)
  assert.throws(() => firstAbove(2000, '=>'), /unsupported comparison/)
})

test('nearestReachable: exact value wins, otherwise the nearest on the same side', () => {
  const carts = [1098, 1998, 2097, 2198].map((value) => ({ value }))
  const allowed = (v) => v >= 2000
  assert.deepEqual(nearestReachable(1999, carts, allowed), { wanted: 1999, side: false, exact: false, candidate: { value: 1998 } })
  assert.deepEqual(nearestReachable(2000, carts, allowed), { wanted: 2000, side: true, exact: false, candidate: { value: 2097 } })
  assert.equal(nearestReachable(2097, carts, allowed).exact, true)
  assert.equal(nearestReachable(2001, [{ value: 1998 }], allowed).candidate, null)
})

test('decisionRules: full combination table in a fixed order', () => {
  const rules = decisionRules([['yes', 'no'], ['yes', 'no'], ['none', 'met', 'not met']])
  assert.equal(rules.length, 12)
  assert.deepEqual(rules[0], { rule: 'R1', values: ['yes', 'yes', 'none'] })
  assert.deepEqual(rules[11], { rule: 'R12', values: ['no', 'no', 'not met'] })
})

const order = {
  initial: 'Empty',
  final: 'Delivered',
  transitions: [
    { id: 'o1', from: 'Empty', to: 'Cart' },
    { id: 'o2', from: 'Cart', to: 'Checkout' },
    { id: 'o3', from: 'Checkout', to: 'Delivered' },
    { id: 'o4', from: 'Cart', to: 'Empty' },
    { id: 'o5', from: 'Cart', to: 'Cart' },
  ],
  forbidden: [{ id: 'x1', from: 'Checkout' }, { id: 'x2', from: 'Delivered' }],
}

test('shortestPath: fewest transitions, null when unreachable', () => {
  assert.deepEqual(shortestPath(order, 'Empty', 'Checkout').map((t) => t.id), ['o1', 'o2'])
  assert.deepEqual(shortestPath(order, 'Empty', 'Empty'), [])
  assert.equal(shortestPath(order, 'Delivered', 'Empty'), null)
})

test('transitionTours: every valid transition at least once', () => {
  const tours = transitionTours(order)
  const taken = new Set(tours.flatMap((t) => t.chain.map((x) => x.id)))
  assert.deepEqual([...taken].sort(), ['o1', 'o2', 'o3', 'o4', 'o5'])
  assert.deepEqual(tours.map((t) => t.chain.map((x) => x.id)), [['o1', 'o2', 'o3'], ['o1', 'o4'], ['o1', 'o5']])
  assert.deepEqual(transitionTours(order), tours)
})

test('transitionTours: a model that cannot be walked is refused with a reason', () => {
  assert.throws(() => transitionTours({ initial: 'A', transitions: [{ id: 'a', from: 'A', to: 'B' }, { id: 'c', from: 'C', to: 'A' }] }), /"c" starts in "C", which cannot be reached/)
  assert.throws(() => transitionTours({ initial: 'A', transitions: [{ id: 't', from: 'A', to: 'B' }, { id: 't', from: 'B', to: 'A' }] }), /used twice/)
  assert.throws(() => transitionTours({ initial: 'A', transitions: [{ from: 'A', to: 'B' }] }), /has no id/)
  assert.deepEqual(transitionTours({ initial: 'A', transitions: [{ id: 'loop', from: 'A', to: 'A' }, { id: 'ab', from: 'A', to: 'B' }, { id: 'ba', from: 'B', to: 'A' }] }).map((t) => t.chain.map((x) => x.id)), [['loop', 'ab', 'ba']])
})

test('forbiddenPaths: one path per forbidden transition', () => {
  assert.deepEqual(forbiddenPaths(order).map((p) => [p.forbidden.id, p.path.map((t) => t.id)]), [['x1', ['o1', 'o2']], ['x2', ['o1', 'o2', 'o3']]])
})

test('uncoveredValues: only values no earlier test used', () => {
  assert.deepEqual(uncoveredValues(['$2.99', 'Free', '$1.99', 'Free'], ['$2.99', '$1.99']), ['Free'])
})
