// ISTQB CTFL v4.0 §4.2 test techniques as plain functions.
// No dependencies, no randomness, no clock: the same input always gives the same output.
// Nothing here knows about any product. A binding (see examples/fooddash/generate.mjs) turns
// the abstract points, rules and paths into steps and expected results for one application.

// ---------- Boundary value analysis ----------

// 3-value BVA (CTFL v4.0 §4.2.2): for each boundary value, that value and both its neighbours.
// A threshold splits an ordered range into two partitions, so it has two boundary values: the last value of
// the lower partition and the first value of the upper one. Together with their neighbours that is four points.
//   firstAbove  the first value of the upper partition (">= 2000" → 2000, "> 2500" → 2501)
//   step        the smallest unit the product can tell apart (1 cent, 1 day, 1 character)
//   boundaryPoints(2000) → [1998, 1999, 2000, 2001]
export function boundaryPoints(firstAbove, step = 1) {
  if (!Number.isInteger(firstAbove) || !Number.isInteger(step) || step < 1) {
    throw new TypeError(`boundaryPoints needs whole numbers in the smallest unit, got ${JSON.stringify(firstAbove)} and step ${JSON.stringify(step)}`)
  }
  return [firstAbove - 2 * step, firstAbove - step, firstAbove, firstAbove + step]
}

// The first value of the upper partition for a rule written as "<base> <operator> <boundary>".
export function firstAbove(boundary, operator, step = 1) {
  if (operator === '>=') return boundary
  if (operator === '>') return boundary + step
  throw new Error(`unsupported comparison "${operator}": use ">" or ">="`)
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
    for (const t of (model.transitions ?? []).filter((t) => t.from === state)) {
      if (!seen.has(t.to)) {
        seen.add(t.to)
        queue.push([t.to, [...path, t]])
      }
    }
  }
  return null
}

// Stops with a clear message when a model cannot be walked: missing or repeated ids, unreachable states.
export function checkModel(model) {
  const ids = new Set()
  for (const t of [...(model.transitions ?? []), ...(model.forbidden ?? [])]) {
    if (!t.id) throw new Error(`a transition from "${t.from}" has no id`)
    if (ids.has(t.id)) throw new Error(`transition id "${t.id}" is used twice`)
    ids.add(t.id)
  }
  for (const t of [...(model.transitions ?? []), ...(model.forbidden ?? [])]) {
    if (!shortestPath(model, model.initial, t.from)) throw new Error(`transition "${t.id}" starts in "${t.from}", which cannot be reached from "${model.initial}"`)
  }
}

// 0-switch coverage: every valid transition at least once.
// Greedy and stable, not minimal: each test walks the shortest way to the first transition not yet taken
// (in the order the model lists them), then keeps taking untaken transitions until none leaves the current
// state or the final state is reached. The same model always gives the same tests.
// Returns [{ chain: [transition, ...], end: state }], one entry per test.
export function transitionTours(model) {
  checkModel(model)
  const untaken = new Set((model.transitions ?? []).map((t) => t.id))
  const tours = []
  while (untaken.size) {
    const next = (model.transitions ?? []).find((t) => untaken.has(t.id))
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

// For every forbidden transition, the shortest valid way to the state it starts from.
export function forbiddenPaths(model) {
  checkModel(model)
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
