# The FoodDash builds

> **Spoilers.** This page lists the defects in the app. It is the answer key: read it after you have run the tests.

Three frozen builds of one sample food-delivery app. They run offline: no backend, no account, no real orders.
`npm run apps` serves them; `npm run tests` serves a build by itself when it is not up.

| Build | Port | What it is |
| --- | --- | --- |
| `dist/learn` | 4173 | the original app, stories FD-01 to FD-08 |
| `dist/battle` | 4174 | the newer build, adds FD-09 promo code, FD-10 minimum order, FD-11 favourites |
| `dist/bug` | 4175 | `learn` plus three seeded bugs, M1 to M3 |

## Planted defects

| Rule in the spec | `learn` | `battle` | `bug` |
| --- | --- | --- | --- |
| FD-05: Burger Palace's "20% OFF orders over $25" is never applied | defect | defect | defect |
| FD-06: **Place Order** with empty required fields places the order | defect | defect | defect |
| FD-06: checkout with an empty cart shows no form | meets | meets | **M2**: the form shows |
| FD-07: order number is `FDR-` + 6 upper-case letters or digits | meets | meets | **M1**: 5 characters, lower case |
| FD-05: Service Fee $1.50 | meets | meets | **M3**: $2.00 |
| FD-09: `LEARN10` takes 10 % off food **and** delivery ($1.59 / $15.85 instead of $1.30 / $16.14) | n/a | defect | n/a |
| FD-10: the minimum counts the fees, so $15.51 of food already passes | n/a | defect | n/a |
| FD-11: **Koliba u Jána** loses its heart on reload | n/a | defect | n/a |

`../planted-defects.json` holds the same list in the form `run.mjs` uses to sort failed checks into "planted" and
"not on the list". The generator never reads it.

## Not planted, found anyway

The run also reports three differences from the spec that nobody put there on purpose: "Free" delivery and $1.99
delivery are both charged $2.99, the cart is empty after a page reload, and tracking shows an order number that
was never placed.
