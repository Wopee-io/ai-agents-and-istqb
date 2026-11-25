#!/usr/bin/env node
// node generate.mjs [--draft] → reads fact-card.json, writes tests.json + tests.md, prints their sha256.
// --draft writes tests.draft.json + tests.draft.md instead (a preview of an unapproved card).
// Plain Node, no dependencies, no randomness, no clock: the same card always gives the same bytes.
//
// This file is the FoodDash binding: it knows the product (carts, prices, screens). The techniques
// themselves are product-independent and live in lib/techniques.mjs. The fact type picks the technique:
//   limit     → boundary value analysis, 3-value (both boundary values with their neighbours: four points)
//   rule      → decision table over the discount and minimum-order facts (card.decisionTables)
//   lifecycle → state transitions: every valid transition at least once (0-switch) + every forbidden one
//   parameter → every value at least once (each-choice) where the tests above miss a value
// Amounts are integer cents. Expected results are computed here; the app is never asked.
// A card that the analyst has not approved, or that changed after the approval, gives no tests.

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boundaryPoints, firstAbove, nearestReachable, decisionRules, transitionTours, forbiddenPaths, uncoveredValues } from '../../lib/techniques.mjs'
import { approvalState, checkCard, contentHash, loadCard } from '../../lib/check-card.mjs'

const dir = dirname(fileURLToPath(import.meta.url))
const cardText = readFileSync(join(dir, 'fact-card.json'), 'utf8')
const card = JSON.parse(cardText)
const sha = (s) => createHash('sha256').update(s).digest('hex')

// Facts come before tests: no approval, no tests. --draft writes a preview to tests.draft.* and leaves the real files alone.
const unknownOption = process.argv.slice(2).find((a) => a !== '--draft')
if (unknownOption) {
  console.error(`Unknown option ${unknownOption}. The only option is --draft.`)
  process.exit(1)
}
const draft = process.argv.includes('--draft')
const state = approvalState(card)
if (state !== 'approved' && !draft) {
  console.error(state === 'changed' ? 'fact-card.json changed after it was approved.' : `fact-card.json is not approved (approval.status: "${card.approval?.status ?? 'missing'}").`)
  console.error('Facts come before tests: the analyst reviews the card and approves it (npm run approve -- "<name>").')
  console.error('For a preview that does not touch tests.json: npm run generate -- --draft')
  process.exit(1)
}
// a product problem (a rule the binding does not know, a value the menu cannot build) stops with one clear line
const stop = (message) => {
  console.error(`Cannot generate: ${message}`)
  process.exit(1)
}
// the card must be clean before anything is computed from it: same checks as `npm run check-card`
{
  let texts
  try {
    texts = loadCard(join(dir, 'fact-card.json')).texts
  } catch (e) {
    stop(e.message)
  }
  const { problems } = checkCard(card, texts)
  if (problems.length) stop(`the card has ${problems.length} problem${problems.length > 1 ? 's' : ''} (first: ${problems[0]}). Run: npm run check-card`)
}
process.on('uncaughtException', (e) => stop(`the card asks for something this binding does not handle (${e.message}). Run check-card first; the binding is examples/fooddash/generate.mjs.`))
const OPS = { '>': (a, b) => a > b, '>=': (a, b) => a >= b }
const compare = (fact, operator) => OPS[operator] ?? stop(`${fact}: comparison "${operator}" is not supported, use ">" or ">="`)

const F = Object.fromEntries(card.facts.map((f) => [f.id, f]))
const KNOWN = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09', 'F10']
for (const id of KNOWN) if (!F[id]) stop(`fact ${id} is not on the card; this binding is written for facts F01 to F10`)
const unknownFact = card.facts.find((f) => !KNOWN.includes(f.id))
if (unknownFact) stop(`fact ${unknownFact.id} "${unknownFact.name}" is on the card, but this binding has no steps for it yet. An approved fact must not silently give no test: extend examples/fooddash/generate.mjs.`)
const whole = (where, v) => (Number.isInteger(v) ? v : stop(`${where} must be a whole number (amounts are in cents), got ${JSON.stringify(v)}`))
whole('F02 amount', F.F02.values.amount)
whole('F04 boundary', F.F04.values.boundary)
whole('F04 rate', F.F04.values.rate)
whole('F05 rate', F.F05.values.rate)
whole('F06 rate', F.F06.values.rate)
whole('F09 boundary', F.F09.values.boundary)
for (const r of card.data.restaurants) for (const m of r.menu) whole(`price of ${m[0]}`, m[1])
const RESTAURANTS = card.data.restaurants
const R = (name) => RESTAURANTS.find((r) => r.name === name)
const MAX_ITEMS = 5

const usd = (c) => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toFixed(2)
const short = (c) => usd(c).replace(/\.00$/, '') // $25, $20: the way the spec writes round amounts
const feeOf = (r) => (r.deliveryFee === 'Free' ? F.F01.values.freeMeans : r.deliveryFee)
const feeText = (r) => (r.deliveryFee === 'Free' ? 'Free ($0.00)' : usd(r.deliveryFee))
if (F.F06.values.rounding !== 'half-up') stop(`F06: rounding "${F.F06.values.rounding}" is not supported, the binding rounds half-up`)
const pct = (cents, rate) => Math.floor((cents * rate + 50) / 100) // half-up, integer cents
const exactPct = (cents, rate) => (cents * rate) % 100 === 0
const thousandths = (cents, rate) => '$' + ((cents * rate) / 10000).toFixed(3)

// ---------- which builds a test belongs to ----------
const storiesOf = (factIds) => [...new Set(factIds.flatMap((id) => F[id].source.story.split(',').map((s) => s.trim())))]
function buildsFor(factIds, restaurant) {
  const stories = storiesOf(factIds)
  let builds = Object.entries(card.builds)
    .filter(([, b]) => stories.every((s) => b.stories.includes(s)))
    .map(([k]) => k)
  if (factIds.includes('F09') && restaurant?.minOrder) builds = builds.filter((b) => restaurant.minOrder.builds.includes(b))
  return builds
}

// ---------- carts reachable from a menu (deterministic enumeration) ----------
const cartCache = new Map()
function carts(r) {
  if (cartCache.has(r.name)) return cartCache.get(r.name)
  const out = []
  const n = r.menu.length
  const rec = (start, left, picked) => {
    if (picked.length) out.push([...picked])
    if (!left) return
    for (let i = start; i < n; i++) {
      picked.push(i)
      rec(i, left - 1, picked)
      picked.pop()
    }
  }
  rec(0, MAX_ITEMS, [])
  const list = out
    .map((idx) => ({ idx, q: idx.length, sub: idx.reduce((s, i) => s + r.menu[i][1], 0) }))
    .sort((a, b) => a.q - b.q || cmpIdx(a.idx, b.idx))
  cartCache.set(r.name, list)
  return list
}
function cmpIdx(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]
  return a.length - b.length
}
// the smallest cart (fewest items, then cheapest) whose subtotal passes `pred`
function pick(r, pred) {
  const list = carts(r).filter((c) => pred(c.sub))
  if (!list.length) return null
  return [...list].sort((a, b) => a.q - b.q || a.sub - b.sub || cmpIdx(a.idx, b.idx))[0]
}
function itemsOf(r, cart) {
  const counts = new Map()
  for (const i of cart.idx) counts.set(i, (counts.get(i) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([i, q]) => [r.menu[i][0], q])
}
const subOf = (r, items) => items.reduce((s, [name, q]) => s + r.menu.find((m) => m[0] === name)[1] * q, 0)
const itemsText = (items) => items.map(([n, q]) => `${q}× ${n}`).join(' + ')
const sameItems = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ---------- money expectations ----------
const promo20 = F.F04.values
const hasPromo20 = (r) => r.promotion === promo20.promotionText
const promoApplies = (s) => compare('F04', promo20.appliesWhen)(s, promo20.boundary)
const minAllowed = (s) => compare('F09', F.F09.values.allowedWhen)(s, F.F09.values.boundary)
function priceExpect(r, items, code) {
  const sub = subOf(r, items)
  const delivery = feeOf(r)
  const service = F.F02.values.amount
  let discount = null
  if (hasPromo20(r) && promoApplies(sub)) {
    if (code) throw new Error('no expected result on the card for restaurant promotion + code')
    discount = { kind: 'restaurant', amount: pct(sub, promo20.rate) }
  } else if (code) discount = { kind: 'LEARN10', amount: pct(sub, F.F05.values.rate) }
  const total = sub - (discount?.amount ?? 0) + delivery + service
  return { Subtotal: sub, 'Delivery Fee': delivery, 'Service Fee': service, discount, Total: total }
}
const expectText = (e) =>
  `Subtotal ${usd(e.Subtotal)}, Delivery Fee ${usd(e['Delivery Fee'])}, Service Fee ${usd(e['Service Fee'])}, ` +
  (e.discount ? `${e.discount.kind === 'LEARN10' ? 'Promo LEARN10' : 'restaurant discount 20%'} −${usd(e.discount.amount)}, ` : 'no discount, ') +
  `Total ${usd(e.Total)}`

// ---------- plan ops (what the runner does) and their step text ----------
const op = {
  open: (r) => ({ op: 'openRestaurant', restaurant: r.name }),
  add: (r, items) => items.map(([item, qty]) => ({ op: 'add', item, qty, category: r.menu.find((m) => m[0] === item)[2] })),
  cart: () => ({ op: 'openCart' }),
  checkout: () => ({ op: 'proceedToCheckout' }),
  code: (code) => ({ op: 'applyCode', code }),
}
function summaryCheck(scope, e, discountFact) {
  return {
    op: 'expectSummary',
    scope,
    lines: { Subtotal: e.Subtotal, 'Delivery Fee': e['Delivery Fee'], 'Service Fee': e['Service Fee'], Total: e.Total },
    discount: e.discount,
    facts: { Subtotal: 'F03', 'Delivery Fee': 'F01', 'Service Fee': 'F02', Total: 'F03', discount: discountFact },
  }
}
function stepText(o) {
  switch (o.op) {
    case 'openRestaurant': return `Open the restaurant ${o.restaurant}.`
    case 'add': return `Add ${o.qty}× ${o.item}${o.category ? ` (${o.category} tab)` : ''}.`
    case 'openCart': return 'Open the cart.'
    case 'proceedToCheckout': return 'Proceed to Checkout.'
    case 'appNavigate': return `Go to ${o.path} inside the app, without a button.`
    case 'goto': return `Open the URL ${o.path}.`
    case 'applyCode': return `Enter the code ${o.code} and click Apply.`
    case 'removeCode': return 'Remove the code (Remove).'
    case 'fillDelivery': return 'Fill in all required fields.'
    case 'placeOrder': return 'Place Order.'
    case 'trackOrder': return 'Track My Order.'
    case 'reload': return 'Reload the page.'
    case 'removeItem': return `Remove ${o.item} from the cart.`
    case 'installClock': return 'Speed up time (test clock).'
    case 'toggleFavourite': return `Click the heart on ${o.restaurant}.`
    default: return null
  }
}

// ---------- test registry ----------
const tests = []
const seq = {}
const PREFIX = { bva: 'HH', dt: 'RT', each: 'PK', st: 'PS' }
const TECH = {
  bva: 'boundary values (3-value)',
  dt: 'decision table',
  each: 'each parameter value',
  st: 'state transitions',
}
function addTest(kind, t) {
  seq[kind] = (seq[kind] ?? 0) + 1
  const id = `${PREFIX[kind]}-${String(seq[kind]).padStart(2, '0')}`
  const test = {
    id,
    title: t.title,
    techniques: [t.technique ?? TECH[kind]],
    facts: t.facts,
    stories: storiesOf(t.facts),
    builds: t.status === 'blocked' ? [] : buildsFor(t.facts, t.restaurant),
    status: t.status ?? 'ready',
    data: t.data ?? {},
    steps: t.steps ?? t.plan.map(stepText).filter(Boolean),
    expected: t.expected,
    plan: t.plan ?? [],
  }
  if (t.question) test.question = t.question
  tests.push(test)
  return test
}

// =====================================================================================
// 1. Limits → boundary value analysis (3-value)
// =====================================================================================
const bvaReport = []
// every cart the menu can build, as candidates for a boundary point: nearest one on the same side wins
const reachable = (r, ok = () => true) => carts(r).filter((c) => ok(c.sub)).map((c) => ({ ...c, value: c.sub }))

// F04: restaurant promotion 20 % once the subtotal passes $25
{
  const r = RESTAURANTS.find(hasPromo20)
  const applies = promoApplies
  const rows = []
  const chosen = []
  const exactOk = (s) => !applies(s) || exactPct(s, promo20.rate) // Q4: only carts whose 20 % is whole cents
  for (const p of boundaryPoints(firstAbove(promo20.boundary, promo20.appliesWhen))) {
    const { side, exact: reached, candidate: cart } = nearestReachable(p, reachable(r, exactOk), applies)
    if (!cart) stop(`F04: the ${r.name} menu has no cart ${side ? 'where the discount applies' : 'below the discount'} near ${usd(p)}`)
    rows.push({ requested: usd(p), side: side ? 'discount applies' : 'no discount', reachable: reached ? usd(p) : null, used: usd(cart.sub) })
    if (!chosen.some((c) => c.sub === cart.sub)) chosen.push({ ...cart, side })
  }
  bvaReport.push({ fact: 'F04', restaurant: r.name, boundary: usd(promo20.boundary), rule: `discount when subtotal ${promo20.appliesWhen} ${short(promo20.boundary)}`, points: rows, note: 'A value the menu cannot build is replaced by the nearest cart on the same side of the boundary. Above the boundary, only carts where 20% comes out in whole cents (Q4).' })
  for (const c of chosen) {
    const items = itemsOf(r, c)
    const e = priceExpect(r, items, null)
    addTest('bva', {
      title: `20% discount: cart ${c.sub === promo20.boundary ? 'on' : c.side ? 'above' : 'below'} the ${short(promo20.boundary)} boundary (${usd(c.sub)})`,
      facts: ['F04'],
      restaurant: r,
      data: { restaurant: r.name, items, code: null },
      expected: (c.side ? `Restaurant discount −${usd(e.discount.amount)} (20% of ${usd(c.sub)}). ` : 'No discount. ') + expectText(e),
      plan: [op.open(r), ...op.add(r, items), op.cart(), summaryCheck('cart', e, 'F04')],
    })
  }
}

// F09: minimum order, food subtotal only
{
  const v = F.F09.values
  const r = R(v.restaurant)
  const allowed = minAllowed
  const rows = []
  const unreachable = []
  const chosen = []
  for (const p of boundaryPoints(firstAbove(v.boundary, v.allowedWhen))) {
    const { side, exact: reached, candidate: cart } = nearestReachable(p, reachable(r), allowed)
    if (!cart) stop(`F09: the ${r.name} menu has no cart ${side ? 'that reaches' : 'below'} the minimum of ${usd(v.boundary)}`)
    rows.push({ requested: usd(p), side: side ? 'checkout allowed' : 'checkout blocked', reachable: reached ? usd(p) : null, used: usd(cart.sub) })
    if (!reached) unreachable.push(usd(p))
    if (!chosen.some((c) => c.sub === cart.sub)) chosen.push({ ...cart, side })
  }
  bvaReport.push({ fact: 'F09', restaurant: r.name, boundary: usd(v.boundary), rule: `checkout when food subtotal ${v.allowedWhen} ${usd(v.boundary)}`, points: rows, note: unreachable.length ? `The menu cannot build ${unreachable.join(', ')}. The code takes the nearest carts on both sides.` : 'The menu can build every boundary value.' })
  for (const c of chosen) {
    const items = itemsOf(r, c)
    const missing = v.boundary - c.sub
    const msg = v.message.replace('${missing}', usd(missing))
    addTest('bva', {
      title: `Minimum order ${short(v.boundary)}: cart ${c.sub === v.boundary ? 'on' : c.side ? 'above' : 'just below'} the boundary (${usd(c.sub)})`,
      facts: ['F09'],
      restaurant: r,
      data: { restaurant: r.name, items, code: null },
      expected: c.side
        ? 'No minimum message. Proceed to Checkout is there and checkout shows the form.'
        : `The cart shows "${msg}" (the gap to the food subtotal; fees do not count) and offers no Proceed to Checkout.`,
      plan: c.side
        ? [op.open(r), ...op.add(r, items), op.cart(), { op: 'expectNoText', text: 'more to order from', fact: 'F09' }, { op: 'expectButton', name: 'Proceed to Checkout', present: true, fact: 'F09' }, op.checkout(), { op: 'expectButton', name: 'Place Order', present: true, fact: 'F09' }]
        : [op.open(r), ...op.add(r, items), op.cart(), { op: 'expectText', text: msg, fact: 'F09' }, { op: 'expectButton', name: 'Proceed to Checkout', present: false, fact: 'F09' }],
    })
  }
}

// F06: LEARN10 rounding, the boundary is half a cent (third decimal 4 / 5 / 6)
{
  const rate = F.F06.values.rate
  const ex = F.F05.values.example
  const candidates = RESTAURANTS.filter((r) => r.menu.length && !r.excludedFromPrices && !r.minOrder)
  const rows = []
  for (const digit of [4, 5, 6]) {
    let best = null
    for (const r of candidates) {
      const ok = (s) => (s * rate) % 100 === digit * 10 && (!hasPromo20(r) || !promoApplies(s))
      // the spec's own example wins when it sits on this point
      const exR = R(ex.restaurant)
      if (r === exR && ok(subOf(r, ex.items))) {
        best = { r, items: ex.items, sub: subOf(r, ex.items), q: 0 }
        break
      }
      const c = pick(r, ok)
      if (c && (!best || c.q < best.q || (c.q === best.q && c.sub < best.sub))) best = { r, items: itemsOf(r, c), sub: c.sub, q: c.q }
    }
    if (!best) stop(`F06: no menu builds a cart whose ${rate}% discount ends in ${digit} at the third decimal`)
    const disc = pct(best.sub, rate)
    rows.push({ requested: `third decimal ${digit}`, side: digit < 5 ? 'down' : 'up', reachable: true, used: `${usd(best.sub)} → ${thousandths(best.sub, rate)} → ${usd(disc)}` })
    const e = priceExpect(best.r, best.items, 'LEARN10')
    addTest('bva', {
      title: `LEARN10 rounding: 10% of ${usd(best.sub)} = ${thousandths(best.sub, rate)} → ${usd(disc)} (${digit < 5 ? 'down' : 'up'})`,
      facts: ['F05', 'F06'],
      restaurant: best.r,
      data: { restaurant: best.r.name, items: best.items, code: 'LEARN10' },
      expected: `Promo LEARN10 line −${usd(disc)}. ` + expectText(e),
      plan: [op.open(best.r), ...op.add(best.r, best.items), op.cart(), op.checkout(), op.code('LEARN10'), summaryCheck('checkout', e, 'F06')],
    })
  }
  bvaReport.push({ fact: 'F06', restaurant: 'picked by the code: smallest cart with no other discount', boundary: 'half a cent', rule: 'round to cents, halves up', points: rows, note: 'Rounding boundary: x.xx4 down, x.xx5 up, x.xx6 up.' })
}

// =====================================================================================
// 2. Rules → decision table
// =====================================================================================
const dtReport = []
const DT_CONDITIONS = ['F04', 'F05', 'F09'] // the one table this binding knows how to price
for (const dt of card.decisionTables ?? []) {
  if (JSON.stringify(dt.conditions) !== JSON.stringify(DT_CONDITIONS)) stop(`${dt.id}: the binding has no rules for the conditions ${dt.conditions.join(', ')} (it knows ${DT_CONDITIONS.join(', ')})`)
  const minV = F.F09.values
  for (const { rule: ruleId, values: [c1, c2, c3] } of decisionRules([['yes', 'no'], ['yes', 'no'], ['none', 'met', 'not met']])) {
    const rule = { rule: ruleId, '20% discount applies': c1, 'LEARN10 applied': c2, 'minimum order': c3 }
    const code = c2 === 'yes' ? 'LEARN10' : null
    const rs = RESTAURANTS.filter(
      (r) => r.menu.length && !r.excludedFromPrices && (c1 === 'yes' ? hasPromo20(r) : true) && (c3 === 'none' ? !r.minOrder : !!r.minOrder),
    )
    if (!rs.length) {
      dtReport.push({ ...rule, result: 'not possible', why: 'no restaurant in the data has both the 20% discount and a minimum' })
      continue
    }
    if (c1 === 'yes' && c2 === 'yes') {
      // the card has no rule for this combination: it is a test only once the analyst has answered
      const q = (card.openQuestions ?? []).find((q) => ['F04', 'F05'].every((f) => (q.facts ?? []).includes(f)))
      if (!q) stop(`${dt.id} ${rule.rule}: the card has no open question and no rule for "20% discount applies" with "LEARN10 applied". If the analyst answered it, the new rule has to be added to priceExpect in this binding.`)
      const t = addTest('dt', {
        title: '20% discount and LEARN10 together: the spec is silent',
        facts: ['F04', 'F05'],
        status: 'blocked',
        question: q.id,
        data: { restaurant: rs[0].name, items: null, code: 'LEARN10' },
        steps: [`No test until the analyst answers ${q.id}.`],
        expected: null,
        plan: [],
      })
      dtReport.push({ ...rule, result: `question ${q.id}`, test: t.id })
      continue
    }
    const r = rs[0]
    const subOk = (s) =>
      (c1 === 'yes' ? promoApplies(s) && exactPct(s, promo20.rate) : !hasPromo20(r) || !promoApplies(s)) &&
      (c3 === 'met' ? minAllowed(s) : c3 === 'not met' ? !minAllowed(s) : true)
    // cart: the spec's example, else a cart an earlier test already uses, else the smallest one
    let items = null
    const ex = F.F05.values.example
    if (code && R(ex.restaurant) === r && subOk(subOf(r, ex.items))) items = ex.items
    if (!items) {
      const prev = tests.find((t) => t.data.restaurant === r.name && t.data.items && t.status === 'ready' && subOk(subOf(r, t.data.items)) && t.facts.every((f) => ['F04', 'F05', 'F06', 'F09'].includes(f)))
      if (prev) items = prev.data.items
    }
    if (!items) items = itemsOf(r, pick(r, subOk))
    const factIds = [...(hasPromo20(r) ? ['F04'] : []), ...(code ? ['F05'] : []), ...(r.minOrder ? ['F09'] : [])]
    const same = tests.find((t) => t.data.restaurant === r.name && sameItems(t.data.items, items) && t.data.code === code && t.status === 'ready')
    if (same) {
      same.techniques.push(`${TECH.dt} (${rule.rule})`)
      for (const f of factIds) if (!same.facts.includes(f)) same.facts.push(f)
      same.stories = storiesOf(same.facts)
      dtReport.push({ ...rule, result: 'covered', test: same.id })
      continue
    }
    const sub = subOf(r, items)
    let t
    if (c3 === 'not met') {
      const msg = minV.message.replace('${missing}', usd(minV.boundary - sub))
      t = addTest('dt', {
        title: `${r.name} below the minimum${code ? ' + LEARN10' : ''}: checkout shows a message instead of the form`,
        facts: factIds,
        restaurant: r,
        data: { restaurant: r.name, items, code },
        expected: `Checkout shows "${msg}" instead of the form. There is no form and no code field, so ${code ? 'the code cannot be applied' : 'you cannot order'}.`,
        plan: [op.open(r), ...op.add(r, items), op.cart(), { op: 'appNavigate', path: '/checkout' }, { op: 'expectText', text: msg, fact: 'F09' }, { op: 'expectButton', name: 'Place Order', present: false, fact: 'F09' }, { op: 'expectField', name: 'Promo code', present: false, fact: 'F09' }],
      })
    } else {
      const e = priceExpect(r, items, code)
      const plan = [op.open(r), ...op.add(r, items), op.cart()]
      if (code) plan.push(op.checkout(), op.code(code), summaryCheck('checkout', e, 'F05'))
      else plan.push(summaryCheck('cart', e, 'F04'))
      if (r.minOrder) plan.push({ op: 'expectButton', name: 'Place Order', present: true, fact: 'F09' })
      t = addTest('dt', {
        title: `${r.name}${c3 === 'met' ? ' above the minimum' : ''}${code ? ' + LEARN10' : ''}${c1 === 'yes' ? ' with the 20% discount' : ''}`,
        facts: factIds,
        restaurant: r,
        data: { restaurant: r.name, items, code },
        expected: expectText(e) + (r.minOrder ? '. The minimum uses the food subtotal, so checkout works.' : ''),
        plan,
      })
    }
    t.techniques[0] = `${TECH.dt} (${rule.rule})`
    dtReport.push({ ...rule, result: 'new test', test: t.id })
  }
}

// =====================================================================================
// 3. Parameters → every value at least once
// =====================================================================================
const eachReport = []
{
  const priced = RESTAURANTS.filter((r) => r.menu.length && !r.excludedFromPrices)
  const covered = new Set(tests.filter((t) => t.plan.some((o) => o.op === 'expectSummary')).map((t) => feeText(R(t.data.restaurant))))
  const fresh = new Set(uncoveredValues(priced.map(feeText), covered))
  for (const r of priced) {
    const v = feeText(r)
    if (!fresh.delete(v)) {
      eachReport.push({ fact: 'F01', value: v, restaurant: r.name, coveredBy: tests.find((t) => t.plan.some((o) => o.op === 'expectSummary') && feeText(R(t.data.restaurant)) === v).id })
      continue
    }
    const items = itemsOf(r, pick(r, () => true))
    const e = priceExpect(r, items, null)
    const t = addTest('each', {
      title: `Delivery "${r.deliveryFee === 'Free' ? 'Free' : v}" counts as ${usd(feeOf(r))} (${r.name})`,
      facts: ['F01'],
      restaurant: r,
      data: { restaurant: r.name, items, code: null },
      expected: expectText(e),
      plan: [op.open(r), ...op.add(r, items), op.cart(), summaryCheck('cart', e, 'F01')],
    })
    eachReport.push({ fact: 'F01', value: v, restaurant: r.name, coveredBy: t.id })
  }
  for (const r of RESTAURANTS.filter((r) => r.excludedFromPrices || !r.menu.length)) eachReport.push({ fact: 'F01', value: feeText(r), restaurant: r.name, excludedBy: r.excludedFromPrices ?? 'no menu in data' })
}

// =====================================================================================
// 4. Lifecycles → state transitions
// =====================================================================================
const stReport = []

// F07 promo code
{
  const m = F.F07.values
  if (m.forbidden?.length) stop(`F07: the binding has no steps for forbidden transition ${m.forbidden[0].id}`)
  const ex = F.F05.values.example
  const r = R(ex.restaurant)
  const none = priceExpect(r, ex.items, null)
  const withCode = priceExpect(r, ex.items, 'LEARN10')
  for (const { chain } of transitionTours(m)) {
    const plan = [op.open(r), ...op.add(r, ex.items), op.cart(), op.checkout()]
    for (const t of chain) {
      if (t.id === 'p1') plan.push(op.code(t.input), { op: 'expectText', text: t.shows, fact: 'F07' }, { op: 'expectDiscountCount', count: 0, fact: 'F07' })
      if (t.id === 'p2') plan.push(op.code(t.input), { op: 'expectDiscountCount', count: 1, fact: 'F07' }, summaryCheck('checkout', withCode, 'F05'))
      if (t.id === 'p3') plan.push({ ...op.code(t.input), mayBeDisabled: true }, { op: 'expectDiscountCount', count: 1, fact: 'F07' })
      if (!['p1', 'p2', 'p3', 'p4'].includes(t.id)) stop(`F07: the binding has no steps for transition ${t.id}`)
      if (t.id === 'p4') plan.push({ op: 'removeCode' }, { op: 'expectDiscountCount', count: 0, fact: 'F07' }, { op: 'expectLine', line: 'Total', amount: none.Total, fact: 'F07' })
    }
    const test = addTest('st', {
      title: `Promo code: ${chain.map((t) => t.event.toLowerCase()).join(' → ')}`,
      facts: ['F05', 'F07'],
      restaurant: r,
      data: { restaurant: r.name, items: ex.items, code: chain.map((t) => t.input).filter(Boolean).join(', ') },
      expected: `Unknown code: "This code is not valid", no discount. learn10: one discount −${usd(withCode.discount.amount)}, Total ${usd(withCode.Total)}. Second Apply: still one discount. Remove: no discount, Total ${usd(none.Total)}.`,
      plan,
    })
    stReport.push({ fact: 'F07', test: test.id, covers: chain.map((t) => t.id) })
  }
}

// F08 order lifecycle
{
  const m = F.F08.values
  const r = RESTAURANTS[0]
  const items = [[r.menu[0][0], 1]]
  const e = priceExpect(r, items, null)
  const stages = m.states.slice(m.states.indexOf('Order Confirmed'))
  const forbiddenAtEnd = m.forbidden.filter((x) => x.from === m.final)
  const unknownAtEnd = forbiddenAtEnd.find((x) => x.id !== 'x4')
  if (unknownAtEnd) stop(`F08: the binding has no steps for forbidden transition ${unknownAtEnd.id} (${unknownAtEnd.from} → ${unknownAtEnd.event})`)
  const prefixOps = (path) => {
    const out = []
    for (const t of path) out.push(...transitionOps(t))
    return out
  }
  function transitionOps(t) {
    switch (t.id) {
      case 'o1': return [op.open(r), ...op.add(r, items)]
      case 'o2': return [op.cart(), op.checkout()]
      case 'o3': return [{ op: 'fillDelivery', fields: m.testCustomer }, { op: 'placeOrder' }, { op: 'expectConfirmation', pattern: m.orderNumber.pattern, total: e.Total, fact: 'F08' }]
      case 'o4': return [{ op: 'trackOrder' }, { op: 'expectLine', line: 'Total Paid', amount: e.Total, fact: 'F03' }]
      case 'o5': case 'o6': return []
      case 'o7': return [{ op: 'expectStages', stages, fact: 'F08' }]
      case 'o8': return [op.cart(), { op: 'removeItem', item: items[0][0] }, { op: 'expectButton', name: 'Proceed to Checkout', present: false, fact: 'F08' }]
      case 'o9': return [{ op: 'reload' }, op.cart(), { op: 'expectText', text: items[0][0], scope: 'cart', fact: 'F08' }]
    }
    return stop(`F08: the binding has no steps for transition ${t.id} (${t.from} → ${t.event})`)
  }
  for (const { chain, end } of transitionTours(m)) {
    const plan = []
    if (chain.some((t) => t.id === 'o7')) plan.push({ op: 'installClock' })
    plan.push(...prefixOps(chain))
    const extra = end === m.final ? forbiddenAtEnd : []
    if (extra.length) plan.push({ op: 'expectStaysAt', stage: m.final, fact: 'F08' })
    const reachesEnd = end === m.final
    const test = addTest('st', {
      title: reachesEnd
        ? 'The order goes through all five stages in order and never leaves Delivered'
        : `Cart: ${chain.map((t) => t.event).join(' → ')}`,
      facts: ['F08', ...(reachesEnd ? ['F03'] : [])],
      restaurant: r,
      data: { restaurant: r.name, items, code: null },
      expected: reachesEnd
        ? `Order Confirmed!, order number ${m.orderNumber.pattern}, Total ${usd(e.Total)}. Tracking shows Total Paid ${usd(e.Total)} and the stages ${stages.join(' → ')} in this order, none skipped, no going back.`
        : chain.at(-1).id === 'o8'
          ? 'An empty cart offers no Proceed to Checkout.'
          : `After a page reload, ${items[0][0]} is still in the cart.`,
      plan,
    })
    stReport.push({ fact: 'F08', test: test.id, covers: [...chain.map((t) => t.id), ...extra.map((x) => x.id)] })
  }
  // a forbidden move out of the final state is checked at the end of the tour that reaches it (expectStaysAt)
  for (const { forbidden: x, path } of forbiddenPaths(m).filter((p) => p.forbidden.from !== m.final)) {
    const plan = [...prefixOps(path)]
    let expected
    if (x.id === 'x1') {
      plan.push({ op: 'goto', path: '/checkout' }, { op: 'expectButton', name: 'Place Order', present: false, fact: 'F08' })
      expected = 'Checkout with an empty cart shows an empty state, no form and no Place Order.'
    } else if (x.id === 'x2') {
      plan.push({ op: 'placeOrder' }, { op: 'expectNoText', text: 'Order Confirmed!', fact: 'F08' }, { op: 'expectButton', name: 'Place Order', present: true, fact: 'F08' })
      expected = `No order is placed: no Order Confirmed!, the customer stays on the form (required: ${m.requiredFields.join(', ')}).`
    } else if (x.id === 'x3') {
      plan.push({ op: 'goto', path: `/order/${x.input}` }, { op: 'expectNoText', text: 'Total Paid', fact: 'F08' })
      expected = `No tracking page is shown for ${x.input}.`
    } else stop(`F08: the binding has no steps for forbidden transition ${x.id} (${x.from} → ${x.event})`)
    const test = addTest('st', {
      title: `Forbidden transition: ${x.from} → ${x.event}`,
      facts: ['F08'],
      restaurant: r,
      data: { restaurant: path.length ? r.name : null, items: path.length ? items : null, code: null },
      expected,
      plan,
    })
    stReport.push({ fact: 'F08', test: test.id, covers: [x.id], forbidden: true })
  }
}

// F10 favourites, for every restaurant
{
  const m = F.F10.values
  if (m.forbidden?.length) stop(`F10: the binding has no steps for forbidden transition ${m.forbidden[0].id}`)
  for (const r of RESTAURANTS) {
    for (const { chain } of transitionTours(m)) {
      const plan = [{ op: 'goto', path: '/' }]
      for (const t of chain) {
        if (t.id === 'f1') plan.push({ op: 'toggleFavourite', restaurant: r.name }, { op: 'expectButton', name: `Remove ${r.name} from favourites`, present: true, fact: 'F10' }, { op: 'expectPath', path: '/', fact: 'F10' })
        if (t.id === 'f2') plan.push({ op: 'reload' }, { op: 'expectButton', name: `Remove ${r.name} from favourites`, present: true, fact: 'F10' })
        if (!['f1', 'f2', 'f3'].includes(t.id)) stop(`F10: the binding has no steps for transition ${t.id}`)
        if (t.id === 'f3') plan.push({ op: 'toggleFavourite', restaurant: r.name }, { op: 'expectButton', name: `Add ${r.name} to favourites`, present: true, fact: 'F10' })
      }
      const test = addTest('st', {
        title: `Favourites: ${r.name} add → reload the page → remove`,
        facts: ['F10'],
        restaurant: r,
        data: { restaurant: r.name, items: null, code: null },
        expected: `The heart switches to "Remove ${r.name} from favourites", the card does not open, it stays a favourite after a page reload, and a second click removes it.`,
        plan,
      })
      stReport.push({ fact: 'F10', test: test.id, covers: chain.map((t) => t.id) })
    }
  }
}

// =====================================================================================
// output
// =====================================================================================
const ready = tests.filter((t) => t.status === 'ready')
const byTech = {}
for (const t of tests) {
  const k = t.techniques[0].replace(/ \(R\d+\)$/, '')
  byTech[k] = (byTech[k] ?? 0) + 1
}
const perBuild = Object.fromEntries(Object.keys(card.builds).map((b) => [b, ready.filter((t) => t.builds.includes(b)).length]))
const out = {
  generator: 'generate.mjs',
  cardSha256: contentHash(card),
  counts: { total: tests.length, ready: ready.length, blocked: tests.length - ready.length, byTechnique: byTech, perBuild },
  boundaryValues: bvaReport,
  decisionTable: dtReport,
  parameterValues: eachReport,
  stateTransitions: stReport,
  openQuestions: card.openQuestions,
  tests,
}
const json = JSON.stringify(out, null, 2) + '\n'

const md = []
md.push('# FoodDash: tests from the fact card', '')
md.push(`Generated from \`fact-card.json\` (sha256 \`${out.cardSha256.slice(0, 12)}…\`) by \`generate.mjs\`. No model, no randomness: same card = same tests.`, '')
md.push(`**${tests.length} tests**: ${ready.length} ready, ${tests.length - ready.length} blocked by a question. By technique: ${Object.entries(byTech).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '')
md.push(`Per build: ${Object.entries(perBuild).map(([b, n]) => `${b} ${n}`).join(', ')} (FD-09 to FD-11 exist only in the newer battle build).`, '')
md.push('## Boundary values: what the code wanted and what the menu allows', '')
for (const b of bvaReport) {
  md.push(`**${b.fact} ${F[b.fact].name}** (${b.restaurant}; ${b.rule}). ${b.note}`, '')
  md.push('| wanted value | side | cart used |', '| --- | --- | --- |')
  for (const p of b.points) md.push(`| ${p.requested} | ${p.side ?? ''} | ${p.reachable ? p.used : p.used.startsWith('$') ? `not possible, nearest ${p.used}` : p.used} |`)
  md.push('')
}
md.push('## Decision table: discounts × minimum order', '')
md.push('| rule | 20% discount applies | LEARN10 | minimum | result |', '| --- | --- | --- | --- | --- |')
for (const d of dtReport) md.push(`| ${d.rule} | ${d['20% discount applies']} | ${d['LEARN10 applied']} | ${d['minimum order']} | ${d.result}${d.test ? ` (${d.test})` : ''}${d.why ? `: ${d.why}` : ''} |`)
md.push('')
md.push('## Open questions for the analyst', '')
for (const q of card.openQuestions) md.push(`- **${q.id}** (${q.status}): ${q.question} ${q.why}`)
md.push('')
md.push('## Tests', '')
for (const t of tests) {
  md.push(`### ${t.id} · ${t.title}`, '')
  md.push(`- **Technique:** ${t.techniques.join('; ')}`)
  md.push(`- **Fact:** ${t.facts.map((f) => `${f} ${F[f].name} (${F[f].source.story})`).join('; ')}`)
  md.push(`- **Build:** ${t.builds.length ? t.builds.join(', ') : '—'}${t.status === 'blocked' ? ` · **BLOCKED by question ${t.question}**` : ''}`)
  md.push(`- **Steps:** ${t.steps.join(' ')}`)
  md.push(t.status === 'blocked' ? `- **Expected result:** unknown until ${t.question} is answered: ${card.openQuestions.find((q) => q.id === t.question).question}` : `- **Expected result (computed by code):** ${t.expected}`, '')
}
const mdText = md.join('\n')

// every ready test must check something: a plan without a check would pass whatever the app does
for (const t of ready) if (!t.plan.some((o) => o.op.startsWith('expect'))) stop(`${t.id} "${t.title}" has no check`)
const blockedBy = [...new Set(tests.filter((t) => t.status === 'blocked').map((t) => t.question))]
const name = draft ? 'tests.draft' : 'tests'
writeFileSync(join(dir, `${name}.json`), json)
writeFileSync(join(dir, `${name}.md`), mdText)
if (draft) console.log(`DRAFT from a card that is ${state}: written to ${name}.json and ${name}.md, the real tests are untouched.`)
console.log(`${tests.length} tests (${ready.length} ready, ${tests.length - ready.length} blocked${blockedBy.length ? ` by question ${blockedBy.join(', ')}` : ''}) · ${Object.entries(byTech).map(([k, v]) => `${k}: ${v}`).join(' · ')}`)
console.log(`per build: ${Object.entries(perBuild).map(([b, n]) => `${b} ${n}`).join(', ')}`)
console.log(`sha256 ${name}.json  ${sha(json)}`)
console.log(`sha256 ${name}.md    ${sha(mdText)}`)
