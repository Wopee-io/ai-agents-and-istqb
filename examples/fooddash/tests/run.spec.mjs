// Executes tests.json: one Playwright test per generated test that applies to BUILD.
// Every expected value comes from tests.json (computed by generate.mjs); this file only drives the browser
// and compares. Checks are soft: a test records every check, then fails if any check failed.
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BUILD = process.env.BUILD || 'battle'
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null
const suite = JSON.parse(readFileSync(new URL('../tests.json', import.meta.url), 'utf8'))
const resultsDir = new URL(`../results/${BUILD}/`, import.meta.url)
mkdirSync(resultsDir, { recursive: true })

const usd = (c) => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toFixed(2)
const cents = (v) => {
  if (v == null) return null
  if (/free/i.test(v)) return 0
  const n = Math.round(parseFloat(v.replace(/[^0-9.]/g, '')) * 100)
  return v.trim().startsWith('-') ? -n : n
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function rows(page, scope) {
  const sel = scope === 'cart' ? '[role="dialog"]' : null
  return page.evaluate((sel) => {
    const root = sel ? document.querySelector(sel) : document.body
    if (!root) return []
    const out = []
    root.querySelectorAll('div').forEach((d) => {
      const k = [...d.children]
      if (k.length !== 2 || k[0].tagName !== 'SPAN' || k[1].tagName !== 'SPAN') return
      out.push([k[0].textContent.replace(/Remove\s*$/, '').trim(), k[1].textContent.trim()])
    })
    return out
  }, sel)
}
async function summary(page, scope) {
  for (let i = 0; i < 25; i++) {
    const r = await rows(page, scope)
    if (r.some(([l]) => l === 'Total' || l === 'Total Paid')) return r
    await page.waitForTimeout(200)
  }
  return rows(page, scope)
}
const discounts = (r) => r.filter(([, v]) => v.startsWith('-'))

async function stageLabel(page) {
  const t = await page.locator('.bg-gradient-primary span.font-semibold').first().textContent({ timeout: 3000 }).catch(() => null)
  return t ? t.replace(/!$/, '').trim() : null
}

async function run(ctx, o) {
  const { page, check } = ctx
  const cartButton = page.getByRole('button', { name: /^Cart( \d+)?$/ })
  switch (o.op) {
    case 'installClock':
      await page.clock.install()
      return
    case 'goto':
      await page.goto(o.path)
      await page.waitForLoadState('networkidle')
      return
    case 'openRestaurant':
      await page.goto('/')
      await page.getByRole('link', { name: new RegExp('^' + esc(o.restaurant)) }).first().click()
      await expect(page.getByRole('heading', { name: o.restaurant, exact: true })).toBeVisible()
      return
    case 'add': {
      const tab = page.getByRole('tab', { name: o.category, exact: true })
      const hasTab = o.category && (await tab.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false))
      if (hasTab) {
        for (let i = 0; i < 10 && (await tab.getAttribute('aria-selected')) !== 'true'; i++) {
          await tab.click({ timeout: 3000 }).catch(async () => {
            await tab.focus()
            await page.keyboard.press('Enter')
          })
          await page.waitForTimeout(300)
        }
      }
      for (let i = 0; i < o.qty; i++) {
        await page.getByRole('link', { name: new RegExp(esc(o.item)) }).getByRole('button').first().click({ timeout: 10_000 })
        ctx.count += 1
        await expect(page.getByRole('button', { name: `Cart ${ctx.count}` })).toBeVisible()
      }
      return
    }
    case 'openCart':
      // recording only: let the "Added to cart!" toast expire so it does not cover the cart summary
      if (process.env.VIDEO) await page.getByText('Added to cart!').first().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
      await cartButton.click()
      await expect(page.getByRole('dialog')).toBeVisible()
      return
    case 'proceedToCheckout':
      await page.getByRole('dialog').getByRole('button', { name: 'Proceed to Checkout' }).click()
      await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible()
      return
    case 'appNavigate':
      await page.keyboard.press('Escape')
      await page.evaluate((p) => {
        history.pushState({}, '', p)
        dispatchEvent(new PopStateEvent('popstate'))
      }, o.path)
      await page.waitForTimeout(600)
      return
    case 'applyCode': {
      const field = page.getByRole('textbox', { name: 'Promo code' })
      if (o.mayBeDisabled && (await field.isDisabled())) {
        ctx.notes.push(`${o.code}: the code field is disabled after Apply, so a second Apply is not possible`)
        return
      }
      await field.fill(o.code)
      await page.getByRole('button', { name: 'Apply' }).click()
      await page.waitForTimeout(300)
      return
    }
    case 'removeCode':
      await page.getByRole('button', { name: 'Remove' }).click()
      await page.waitForTimeout(300)
      return
    case 'fillDelivery':
      for (const [label, value] of Object.entries(o.fields)) await page.getByLabel(label, { exact: true }).fill(value)
      return
    case 'placeOrder':
      await page.getByRole('button', { name: 'Place Order' }).click()
      await page.waitForTimeout(800)
      return
    case 'trackOrder':
      await page.getByRole('button', { name: 'Track My Order' }).click()
      await expect(page.getByRole('heading', { name: 'Order Tracking' })).toBeVisible()
      return
    case 'reload':
      await page.reload()
      await page.waitForLoadState('networkidle')
      return
    case 'removeItem':
      await page.getByRole('dialog').locator('button:has(svg.lucide-trash2)').first().click()
      await page.waitForTimeout(300)
      return
    case 'toggleFavourite':
      await page.getByRole('button', { name: new RegExp(`^(Add ${esc(o.restaurant)} to|Remove ${esc(o.restaurant)} from) favourites$`) }).first().click()
      await page.waitForTimeout(300)
      return

    // ---------- checks ----------
    case 'expectSummary': {
      const r = await summary(page, o.scope)
      for (const [line, exp] of Object.entries(o.lines)) {
        const got = r.find(([l]) => l === line)?.[1] ?? null
        await check(o.facts[line], line, usd(exp), got, cents(got) === exp)
      }
      const neg = discounts(r)
      if (!o.discount) {
        await check(o.facts.discount, 'no discount', 'no discount line', neg.map((x) => x.join(' ')).join('; ') || 'none', neg.length === 0)
      } else if (o.discount.kind === 'LEARN10') {
        const row = neg.find(([l]) => l.startsWith('Promo LEARN10'))
        await check(o.facts.discount, 'Promo LEARN10 line', usd(-o.discount.amount), row?.[1] ?? 'missing', row ? cents(row[1]) === -o.discount.amount : false)
      } else {
        const row = neg.find(([l]) => !l.startsWith('Promo'))
        await check(o.facts.discount, 'restaurant discount 20% line', usd(-o.discount.amount), row ? row.join(' ') : 'missing', row ? cents(row[1]) === -o.discount.amount : false)
      }
      return
    }
    case 'expectLine': {
      const r = await summary(page, null)
      const got = r.find(([l]) => l === o.line)?.[1] ?? null
      await check(o.fact, o.line, usd(o.amount), got, cents(got) === o.amount)
      return
    }
    case 'expectDiscountCount': {
      const n = discounts(await summary(page, null)).length
      await check(o.fact, o.count ? `exactly ${o.count} discount line` : 'no discount line', String(o.count), String(n), n === o.count)
      return
    }
    case 'expectText': {
      const scope = o.scope === 'cart' ? page.getByRole('dialog') : page
      const vis = await scope.getByText(o.text).first().waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)
      await check(o.fact, `text "${o.text}"`, 'shown', vis ? 'shown' : 'missing', vis)
      return
    }
    case 'expectNoText': {
      await page.waitForTimeout(1000)
      const n = await page.getByText(o.text).count()
      await check(o.fact, `no ${o.text}`, 'not shown', n ? 'shown' : 'not shown', n === 0)
      return
    }
    case 'expectButton': {
      const b = page.getByRole('button', { name: o.name, exact: true })
      let vis
      if (o.present) vis = await b.first().waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false)
      else {
        await page.waitForTimeout(800)
        vis = await b.first().isVisible()
      }
      await check(o.fact, o.present ? `button ${o.name} present` : `button ${o.name} missing`, o.present ? 'present' : 'missing', vis ? 'present' : 'missing', vis === o.present)
      return
    }
    case 'expectField': {
      await page.waitForTimeout(300)
      const vis = await page.getByRole('textbox', { name: o.name }).first().isVisible()
      await check(o.fact, o.present ? `field ${o.name} present` : `field ${o.name} missing`, o.present ? 'present' : 'missing', vis ? 'present' : 'missing', vis === o.present)
      return
    }
    case 'expectPath': {
      const p = new URL(page.url()).pathname
      await check(o.fact, 'heart does not open the restaurant', o.path, p, p === o.path)
      return
    }
    case 'expectConfirmation': {
      const h = await page.getByRole('heading', { name: 'Order Confirmed!' }).waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)
      await check(o.fact, 'Order Confirmed!', 'shown', h ? 'shown' : 'missing', h)
      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      const num = text.match(/Order #(\S+)/)?.[1] ?? null
      await check(o.fact, 'order number', o.pattern, num, num ? new RegExp(o.pattern).test(num) : false)
      const total = text.match(/Total: (\$[\d.]+)/)?.[1] ?? null
      await check('F03', 'Total on confirmation', usd(o.total), total, cents(total) === o.total)
      return
    }
    case 'expectStages': {
      const seen = []
      for (let i = 0; i < 40; i++) {
        const s = await stageLabel(page)
        if (s && s !== seen.at(-1)) seen.push(s)
        if (s === o.stages.at(-1)) break
        await page.clock.runFor(3000)
      }
      await check(o.fact, 'stages in order', o.stages.join(' → '), seen.join(' → '), JSON.stringify(seen) === JSON.stringify(o.stages))
      return
    }
    case 'expectStaysAt': {
      const seen = new Set()
      for (let i = 0; i < 10; i++) {
        await page.clock.runFor(6000)
        seen.add(await stageLabel(page))
      }
      await check(o.fact, `no transition after ${o.stage}`, o.stage, [...seen].join(', '), seen.size === 1 && seen.has(o.stage))
      return
    }
    default:
      throw new Error(`unknown step ${o.op}`)
  }
}

for (const t of suite.tests.filter((t) => t.status === 'ready' && t.builds.includes(BUILD) && (!ONLY || ONLY.includes(t.id)))) {
  test(`${t.id} · ${t.title}`, async ({ page }) => {
    const checks = []
    const ctx = {
      page,
      count: 0,
      notes: [],
      check: async (fact, what, expected, actual, ok) => {
        checks.push({ fact, what, expected, actual, ok })
        if (!ok && checks.filter((c) => !c.ok).length === 1) {
          // let the "Added to cart!" toast go first, so it does not cover what the check is about
          await page.getByText('Added to cart!').first().waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {})
          await page.screenshot({ path: fileURLToPath(new URL(`${t.id}.png`, resultsDir)) }).catch(() => {})
        }
      },
    }
    let error = null
    try {
      for (const o of t.plan) await run(ctx, o)
    } catch (e) {
      error = String(e.message).split('\n')[0]
      await page.screenshot({ path: fileURLToPath(new URL(`${t.id}.png`, resultsDir)) }).catch(() => {})
      checks.push({ fact: null, what: 'test step failed', expected: '', actual: error, ok: false })
    }
    const failed = checks.filter((c) => !c.ok)
    writeFileSync(
      new URL(`${t.id}.json`, resultsDir),
      JSON.stringify({ id: t.id, title: t.title, techniques: t.techniques, facts: t.facts, build: BUILD, passed: failed.length === 0, checks, notes: ctx.notes }, null, 2) + '\n',
    )
    expect(failed.map((c) => `${c.fact ?? '-'} ${c.what}: expected ${c.expected}, got ${c.actual}`), 'failed checks').toEqual([])
  })
}
