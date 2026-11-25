---
name: extract-facts
description: Turn a product spec or requirements document into a fact card - typed facts (limit, rule, lifecycle, parameter), each with a word-for-word quote, and open questions where the document is silent. Use for step 2 of spec-to-tests, when a spec is new or has changed.
---

# Extract facts

Input: the source documents. Output: a draft `fact-card.json` for the analyst. Format: `docs/fact-card.md`. Worked card: `examples/fooddash/fact-card.json`.

Your job is to copy what the documents state into a fixed shape. It is not to design tests and not to fill gaps.

## Steps

1. **Read every source document in full**, tables included. List them in `sources` with paths relative to the card.
2. **Go through the documents story by story** and pick out statements that decide behaviour. For each, choose the type:

   | The document states | Type |
   | --- | --- |
   | a threshold where behaviour changes: "minimum $20", "over $25", "rounded, halves up" | `limit` |
   | a result that depends on conditions: a formula, a discount, who is eligible | `rule` |
   | states and moves between them: an order, a code that is applied and removed | `lifecycle` |
   | a value that differs by case: a fee per restaurant, a setting per channel | `parameter` |

   Statements about layout or wording that no rule depends on do not go on the card.
3. **Write each fact** with `id` (F01, F02, …), `type`, `name`, `source.story`, `source.quote` and `values`.
   - Copy the quote word for word. Mark skipped text with ` ... `. Never paraphrase inside a quote.
   - Put amounts in the smallest unit (cents). Record the comparison exactly as written: "over" is `>`, "at or above" is `>=`.
   - For a lifecycle, list `states`, `initial`, `final`, every allowed `transition` and every move the document forbids under `forbidden`.
4. **Record what interacts.** When two or more facts can apply to the same case (a discount, a promo code and a minimum), add a `decisionTables` entry naming them.
5. **Write an open question for every gap.** Typical gaps:
   - two rules can apply together and the document gives no combined result;
   - a boundary whose own value is unclear ("over $25": is $25.00 in?);
   - a rounding or ordering rule that is given for one case and missing for a similar one;
   - something the product shows that no rule explains.

   Each question names the facts it touches, asks one thing, and says in `why` which technique needs the answer.
   When you had to choose a reading to write the fact at all, record it as a question with status `reading to confirm`.
6. **Test data is not a fact.** Price lists, menus and similar go under `data`, with a note saying where and when they were read. When the documents do not contain them, ask for them; do not invent values.
7. **Set `approval.status` to `draft`.**
8. **Run `npm run check-card`** (or `node lib/check-card.mjs <path to the card>`). Fix every problem it lists. A quote that is "not found" means you paraphrased or merged sentences: go back to the document and copy it.

## Do not

- Do not add a fact from general knowledge of how such products work. If it is not in the documents, it is a question.
- Do not resolve a contradiction between two documents. Quote both and ask.
- Do not read the app, `planted-defects.json` or `apps/README.md`.
- Do not write test cases, test counts or expected results. Code does that from the approved card.

## Hand over

Tell the analyst: how many facts of each type, how many quotes were checked, and the open questions in full. Then use `review-fact-card`.
