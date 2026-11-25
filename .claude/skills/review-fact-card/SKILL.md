---
name: review-fact-card
description: Walk the analyst through a draft fact card - facts with their quotes, readings to confirm, open questions - then record the answers and the approval. Use after extract-facts, when open questions get answered, or when asked to approve or update a fact card.
---

# Review the fact card

The analyst reviews a short list of facts with their sources instead of hundreds of generated tests. Make that review quick and exact.

## Steps

1. Run `npm run check-card`. Do not start the review with a card that fails it.
2. **Show the facts** as a table: id, type, name, the value in plain words, story, quote. Group by type. Leave the JSON out unless asked.
3. **Ask the questions one at a time**, the ones that block a test first. For each: the question, the facts it touches, why a technique needs it, and what happens while it stays open (which test is blocked, or which reading the card uses).
4. **Record each answer.**
   - An answer that states a rule becomes a new fact, or changes `values` of an existing one. Its source is the analyst: `"source": { "story": "<story>", "quote": "<the answer, word for word>", "answeredBy": "<name>", "date": "<YYYY-MM-DD>" }`. Add the answer to a document listed in `sources` (for example `spec/analyst-answers.md`), so the quote check still holds.
   - Then remove the question from `openQuestions`.
   - "I don't know yet" stays an open question. Keep its status as it is.
5. **Ask for the approval** in so many words: "Do you approve this card, with these questions left open?" The analyst records it themselves:

   ```bash
   npm run approve -- "<analyst name>"     # FoodDash; any card: node lib/approve.mjs <card> "<name>"
   ```

   The command stores who approved, when, and a hash of the sources list, builds, facts, decision tables, test data and open questions.
6. Run `npm run check-card`: it must say `approved by …, unchanged since`. Then use `generate-tests`.

## Rules

- Never run the approve command and never edit the `approval` block yourself, not even on a clear yes: hand the command to the analyst. The approval covers the whole card.
- Any change to the card after approval voids it: `check-card` says `CHANGED since it was approved` and the generator stops. The analyst approves the changed card again.
- Open questions do not prevent approval. The generator lists the tests they block and writes no test for them.
- Do not suggest an answer to a question unless the analyst asks for options. If you give options, say that the documents support none of them.

## Example

FoodDash, Q1: "Does the 20 % restaurant discount stack with the code LEARN10?" The spec gives no result for that
combination, so decision-table rule R1 has no expected result and test RT-01 is blocked. If the analyst answers
"No: when the restaurant discount applies, the code is rejected with 'This code cannot be combined'", that sentence
becomes a new `rule` fact with FD-09 as its story and Q1 is removed. The binding does not know that rule yet, so the
next `npm run generate` stops and says so: the rule has to be added to `priceExpect` in `generate.mjs` before R1 becomes a test.
