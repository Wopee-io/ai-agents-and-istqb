---
name: extract-facts
description: Turn a product spec or requirements document into a fact card - typed facts (limit, rule, lifecycle, parameter), each with a word-for-word quote, and open questions where the document is silent. Use for step 2 of spec-to-tests, when a spec is new or has changed.
---

# Extract facts

Input: the source documents and the scope. Output: a draft `fact-card.json` for the analyst. Format, with the `values` keys for each type: `docs/fact-card.md`. A complete card to compare with: `examples/fooddash/fact-card.json` (when you are filling that very file, the examples in the format doc are your reference).

Your job is to copy what the documents state into a fixed shape. It is not to design tests and not to fill gaps.

## Scope first

A card for a whole product is too big to review. Before you start, settle the slice with the user: which stories or which feature (FoodDash: the money and order flow, that is cart totals, discounts, promo code, minimum order, order lifecycle, favourites). If nobody gave a scope, propose one and wait for a yes. Ten to fifteen facts is a card an analyst reads in one sitting; forty is not.

Inside the slice, a statement goes on the card only when a technique can compute tests from it: it has a threshold, conditions with a result, states with moves, or values that vary. A statement that is only a yes/no check ("a 404 page has a Return to Home link") is a plain checklist item: list those separately in the hand-over and keep them off the card.

## Steps

1. **Read every source document in full**, tables included. List them in `sources` with paths relative to the card.
2. **Go through the documents story by story** and pick out statements that decide behaviour. For each, choose the type:

   | The document states | Type |
   | --- | --- |
   | a threshold where behaviour changes: "minimum $20", "over $25", "rounded, halves up" | `limit` |
   | a result that depends on conditions: a formula, a discount, who is eligible | `rule` |
   | states and moves between them: an order, a code that is applied and removed | `lifecycle` |
   | a value that differs by case, or a fixed value other facts use: a fee per restaurant, a flat service fee | `parameter` |

   Statements about layout or wording that no rule depends on do not go on the card.
3. **Write each fact** with `id` (F01, F02, …), `type`, `name`, `source.story`, `source.quote` and `values`.
   - Copy the quote word for word. Mark skipped text with ` ... `. Never paraphrase inside a quote.
   - Use the `values` keys from `docs/fact-card.md` for the type. Do not invent key names: the binding reads them.
   - Put amounts in the smallest unit (cents). Record the comparison exactly as written: "over" is `>`, "at or above" is `>=`.
   - One sentence can give two facts (a threshold and a rate, a rate and a rounding point). The format doc says when to split.
   - For a lifecycle, list `states`, `initial`, every allowed transition and every move the document forbids under `forbidden`; `final` only when the lifecycle ends somewhere. A move that keeps the state is a transition, not a forbidden move.
4. **Record what interacts.** When two or more facts can apply to the same case and change the same result (a discount, a promo code and a minimum all decide what the customer pays or whether they can check out), add a `decisionTables` entry naming them as `conditions`. Name only the facts that are conditions, not the formula they feed.
5. **Write an open question for every gap.** Typical gaps:
   - two rules can apply together and the document gives no combined result;
   - a boundary whose own value is unclear ("over $25": is $25.00 in?);
   - a rounding or ordering rule that is given for one case and missing for a similar one;
   - something the product shows that no rule explains.

   Each question names the facts it touches, asks one thing (a natural follow-up may ride along), and says in `why` which technique needs the answer. Status is `open`.
   Ask only what a technique in scope needs. A long list of questions hides the two that block tests.
   When you had to choose a reading to write the fact at all, record it as a question with status `reading to confirm`.
6. **Test data is not a fact.** Price lists, menus and similar go under `data`, with a note saying where and when they were read. When the documents do not contain them, ask for them in the hand-over message; do not invent values and do not turn the request into an open question. A card that already has `sources`, `builds` or `data` filled in: keep them, and say so if something in them contradicts the documents.
7. **Set `approval.status` to `draft`.**
8. **Run `npm run check-card`** (or `node lib/check-card.mjs <path to the card>`). Fix every problem it lists. A quote that is "not found" means you paraphrased or merged sentences: go back to the document and copy it.

## Do not

- Do not add a fact from general knowledge of how such products work. If it is not in the documents, it is a question.
- Do not resolve a contradiction between two documents. Quote both and ask.
- Do not read the app, `planted-defects.json` or `apps/README.md`.
- Do not write test cases, test counts or expected results. Code does that from the approved card.

## Hand over

Tell the analyst: the scope, how many facts of each type, that every quote passed the check, the open questions in full, the checklist items you kept off the card, and any test data you still need. Then use `review-fact-card`.
