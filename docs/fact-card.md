# The fact card

The fact card is the one document the analyst approves. It holds what the source documents state, in a shape code
can compute from. Everything after it is deterministic. A complete, approved card: [`examples/fooddash/fact-card.json`](../examples/fooddash/fact-card.json).

## Top level

| Field | Meaning |
| --- | --- |
| `product` | name of the product under test |
| `sources` | `[{ "path", "stories" }]`: the documents the facts come from, paths relative to the card |
| `approval` | `{ "status", "by", "date", "sha256", "note" }`, written by `node lib/approve.mjs <card> "<name>"`. The hash covers sources, builds, facts, decision tables, test data and open questions; the generator only runs while it matches |
| `builds` | `{ key: { "url", "dist", "stories" } }`: where each version of the app runs and which stories it has |
| `facts` | the facts, see below |
| `decisionTables` | `[{ "id", "name", "conditions": [fact ids] }]`: which facts interact |
| `data` | test data that is not a rule (a menu, a price list), with a note saying where it was read |
| `openQuestions` | `[{ "id", "facts", "question", "why", "status" }]`: what the documents do not say |

## A fact

```json
{
  "id": "F09",
  "type": "limit",
  "name": "Minimum order",
  "source": { "story": "FD-10", "quote": "Sushi Masters: $20.00. ... The minimum applies to the food subtotal only — fees do not count towards it." },
  "values": { "restaurant": "Sushi Masters", "boundary": 2000, "allowedWhen": ">=", "base": "subtotal" }
}
```

- `source.quote` is copied word for word. ` ... ` marks skipped text. Markdown emphasis and line breaks do not matter.
  `npm run check-card` fails when a quote is not in the sources.
- `values` holds numbers as the smallest unit the product can tell apart (cents, not dollars), so code never rounds by accident.

## The four types

| Type | Use it when the document states | Technique |
| --- | --- | --- |
| `limit` | a threshold where behaviour changes: a minimum, a maximum, a rounding point | boundary value analysis, 3-value |
| `rule` | a result that depends on conditions: a formula, a discount, an eligibility rule | decision table, together with the facts it interacts with |
| `lifecycle` | states and the moves between them | state transition testing: every valid transition, every forbidden one |
| `parameter` | a value that varies by case, or a fixed value other facts use: a fee per restaurant, a flat service fee | each value at least once |

One sentence can give two facts. "20 % off once the subtotal passes $25" is one `limit` (the $25 threshold and the rate that applies above it). "The code takes 10 % off, rounded halves up" is a `rule` (the 10 %) and a `limit` (the rounding point). Split when the sentence holds both a threshold and something a second technique needs; otherwise keep one fact.

## `values`, by type

The binding reads these keys, so use these names. Amounts are integers in the smallest unit.

**limit**

```json
{ "boundary": 2000, "allowedWhen": ">=", "base": "subtotal", "restaurant": "Sushi Masters", "message": "Add ${missing} more to order from Sushi Masters" }
```

| Key | Meaning |
| --- | --- |
| `boundary` | the threshold. For a rounding point write `"half a cent"` and give `rounding` (`"half-up"`) |
| `allowedWhen` or `appliesWhen` | the comparison exactly as written: "over", "passes" → `>`; "at or above", "at least" → `>=` |
| `base` | what is compared: `subtotal`, `quantity`, … |
| `rate` | when crossing the boundary applies a percentage |
| anything the document ties to this limit | where it applies, the message shown |

**rule**

```json
{ "code": "LEARN10", "rate": 10, "base": "subtotal", "line": "Promo LEARN10", "example": { "restaurant": "Burger Palace", "items": [["Classic Beef Burger", 1]], "discount": 130, "total": 1614 } }
```

`formula` for a computation (free text, for the reader), `rate` and `base` for a percentage, `example` when the document gives a worked example (the generator prefers the document's own example as test data). Put into `example` only what the document states; here the spec says "10 % of $12.95 is $1.30", and the restaurant, dish and total were added by the analyst from the test data. A list the document gives (required fields, payment methods) goes in as an array under a name of your choice, such as `requiredFields`.

Two things in `values` are not quotes and may be written by the author of the card: a placeholder in a message (`${missing}` for the document's `$X.XX`) and a test input the document leaves open (`"input": "LEARN11"` for "an unknown code").

**lifecycle**

```json
{
  "states": ["No code", "LEARN10 applied"],
  "initial": "No code",
  "transitions": [
    { "id": "p1", "from": "No code", "event": "Apply with an unknown code", "input": "LEARN11", "to": "No code", "shows": "This code is not valid" },
    { "id": "p4", "from": "LEARN10 applied", "event": "Remove", "to": "No code" }
  ],
  "forbidden": []
}
```

- `final` is one state name, and only when the lifecycle ends somewhere (an order ends in `Delivered`). Leave it out for a cycle.
- A move that keeps the state (apply the same code again) is a transition with `from` equal to `to`.
- `forbidden` holds moves the document rules out: `{ "id", "from", "event" }`, no `to`.
- When the document gives the states "in order" and no trigger, write the event as the document allows (`"time passes"`) and ask a question about the trigger.
- A transition may carry its own `source`, written exactly as `"FD-07: quoted sentence"` (story id, colon, space, quote). That quote is checked too, which is why `check-card` can count more quotes than facts.

**parameter**

```json
{ "amount": 150 }
```

or `{ "from": "data.restaurants[].deliveryFee", "freeMeans": 0 }` when the values are test data.

## Quotes

- Copy word for word, including the document's own characters (`−`, `—`, `→`).
- ` ... ` (three dots with a space on each side) skips text, and the parts must appear in document order. A fact has one `source.story`; when two stories state the same rule, quote the more precise one.
- Each part needs at least three words and must start and end on a word boundary: `$20` does not match `$20.00`.
- Ignored in the document when comparing: line breaks, repeated spaces, list and quote markers, markdown emphasis, table bars and link targets. A table row is quoted as its cells: `Full Name yes`.
- A quote must come from one document. It cannot be stitched from two.
- A skip of whole sentences is always fine. A skip inside a sentence is refused when the skipped words include a negation (not, never, no, only, …), because that would turn the meaning around.

## Open questions

A question records something the technique needs and the documents do not give: a decision-table cell with no
result, a boundary whose own value is unclear, a rounding rule that is missing.

- The generator never turns a question into a test. A test that depends on it is listed as **blocked**, with the question id.
- When the analyst answers, the answer becomes a fact (with the analyst's answer as its source) and the question is removed.
- A reading the card had to choose ("over $25" taken as "more than $25") is also a question, with status `reading to confirm`. Every other question has status `open`.
- Missing test data (a price list the documents do not contain) is asked for in the hand-over message, not as an open question. Questions are for missing rules.
- `data` entries may point at a question, for example `"excludedFromPrices": "Q3"`: the generator leaves that entry out while the question is open. `check-card` reports a pointer to a question that is no longer on the card.
