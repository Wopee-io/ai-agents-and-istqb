// ISTQB CTFL v4.0 §4.2 test techniques as plain functions.
// No dependencies, no randomness, no clock: the same input always gives the same output.
// Nothing here knows about any product. A binding (see examples/fooddash/generate.mjs) turns
// the abstract points, rules and paths into steps and expected results for one application.

// ---------- Boundary value analysis ----------

// 3-value BVA: the value just below the boundary, the boundary, the value just above it.
// `step` is the smallest unit the product can tell apart (1 cent, 1 day, 1 character).
export function boundaryPoints(boundary, step = 1) {
  return [boundary - step, boundary, boundary + step]
}

// A wanted boundary point is often not reachable through the product (a $20.00 cart from a menu
// of .99 prices). Take the exact value when a candidate has it; otherwise the nearest candidate
// on the same side of the boundary, so the test still exercises that side.
//   candidates  [{ value, ... }] in a stable order (ties keep the earlier candidate)
//   sideOf      (value) => true | false, which side of the rule a value falls on
// Returns { wanted, side, exact, candidate } or candidate: null when that side is empty.
export function nearestReachable(wanted, candidates, sideOf) {
  const side = sideOf(wanted)
  const exact = candidates.find((c) => c.value === wanted)
  if (exact) return { wanted, side, exact: true, candidate: exact }
  let best = null
  for (const c of candidates) {
    if (sideOf(c.value) !== side) continue
    if (!best || Math.abs(c.value - wanted) < Math.abs(best.value - wanted)) best = c
  }
  return { wanted, side, exact: false, candidate: best }
}

// ---------- Decision table ----------

// Every combination of the condition values, first condition slowest, numbered R1..Rn.
//   decisionRules([['yes', 'no'], ['yes', 'no'], ['none', 'met', 'not met']]) → 12 rules
export function decisionRules(conditions) {
  let rows = [[]]
  for (const values of conditions) rows = rows.flatMap((row) => values.map((v) => [...row, v]))
  return rows.map((values, i) => ({ rule: `R${i + 1}`, values }))
}

// ---------- State transition testing ----------
// A model is { initial, final?, transitions: [{ id, from, to, ... }], forbidden?: [{ id, from, ... }] }.

// Fewest transitions from one state to another (breadth-first), or null when unreachable.
export function shortestPath(model, from, to) {
  const queue = [[from, []]]
  const seen = new Set([from])
  while (queue.length) {
    const [state, path] = queue.shift()
    if (state === to) return path
    for (const t of model.transitions.filter((t) => t.from === state && t.to !== state)) {
      if (!seen.has(t.to)) {
        seen.add(t.to)
        queue.push([t.to, [...path, t]])
      }
    }
  }
  return null
}

// 0-switch coverage: every valid transition at least once, in as few tests as the model allows.
// Each test walks the shortest way to the first transition not yet taken, then keeps taking
// untaken transitions until none leaves the current state or the final state is reached.
// Returns [{ chain: [transition, ...], end: state }], one entry per test.
export function transitionTours(model) {
  const untaken = new Set(model.transitions.map((t) => t.id))
  const tours = []
  while (untaken.size) {
    const next = model.transitions.find((t) => untaken.has(t.id))
    const chain = [...shortestPath(model, model.initial, next.from)]
    let state = next.from
    for (;;) {
      const t = model.transitions.find((t) => untaken.has(t.id) && t.from === state)
      if (!t) break
      chain.push(t)
      untaken.delete(t.id)
      state = t.to
      if (state === model.final) break
    }
    chain.forEach((t) => untaken.delete(t.id))
    tours.push({ chain, end: state })
  }
  return tours
}

// Every forbidden transition gets its own test: the shortest valid way to its start state.
export function forbiddenPaths(model) {
  return (model.forbidden ?? []).map((x) => ({ forbidden: x, path: shortestPath(model, model.initial, x.from) }))
}

// ---------- Each choice ----------

// Parameter values no earlier test has used yet, in the order given.
export function uncoveredValues(values, covered) {
  const seen = new Set(covered)
  const out = []
  for (const v of values) {
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}
