---
name: adapt-to-your-app
description: Apply the spec-to-tests process to another product - set up a new example folder with its own spec, fact card, binding and runner, reusing the techniques library. Use when asked to try this on our own app, our own requirements, or to replace FoodDash.
---

# Adapt to your app

Three layers. Two you keep, one you write.

| Layer | Files | For your product |
| --- | --- | --- |
| Techniques and checks | `lib/techniques.mjs`, `lib/check-card.mjs` | keep as they are |
| Process | the skills, `docs/fact-card.md` | keep as they are |
| Fact card, binding, runner | `examples/<product>/` | yours |

## Steps

1. **Pick a small slice first**: one feature whose rules are limits, tables or a lifecycle, three to five stories. Not the whole product.
2. **Create `examples/<product>/`** with the source documents in `spec/`, unedited. If the documents are Word or PDF, convert them to Markdown or text and keep the wording as it is.
3. **Fill the card** with `extract-facts`, then `review-fact-card`. Point `builds.<key>.url` at a test environment of your app (leave `dist` out when the app runs elsewhere). Stop until the card is approved.
4. **Write the binding**, `examples/<product>/generate.mjs`. Start from the FoodDash one and keep its outline:
   - read the card, refuse an unapproved one;
   - for each fact type call the technique from `lib/techniques.mjs`;
   - turn each abstract result into a test: a plan of operations for the runner, readable steps, and the expected result computed from the fact;
   - write `tests.json` and `tests.md`, print their sha256.

   What you write is the part that knows the product. In FoodDash that is: how a wanted subtotal becomes a cart from the menu (`carts`, `pick`), how a price is computed from the facts (`priceExpect`), and which clicks a transition means (`transitionOps`).
5. **Write the runner**, `tests/run.spec.mjs`: one `case` per operation in your plans. Copy the FoodDash file and replace the operations. It takes every expected value from `tests.json` and never computes one.
6. **Add npm scripts** for your folder next to the FoodDash ones in `package.json`.
7. **Prove it**: `node lib/check-card.mjs examples/<product>/fact-card.json`, two generator runs with the same sha256, then the run.

## Keep these properties

- **No model call in the binding or the runner.** If a model should word the steps, do that as a separate last pass over `tests.json` that changes only the text.
- **No clock, no randomness, no unordered iteration** in the binding. Sort everything you enumerate.
- **Amounts as integers** in the smallest unit.
- **An unreachable value is reported, not dropped**: when the product cannot build a boundary value, take the nearest one on the same side and say so in `tests.md`.
- **A missing result is a question**: when a decision-table rule has no expected result on the card, write a blocked test that names the question.

## When it does not fit

The card carries limits, rules, lifecycles and parameters. If your slice has none of these (free-form content, pure
layout, exploratory risk), this process gives little, and it is better to say so than to force facts onto the card.
