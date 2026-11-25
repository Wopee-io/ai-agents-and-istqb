# The fact card

The fact card is the one document the analyst approves. It holds what the source documents state, in a shape code
can compute from. Everything after it is deterministic. A worked card: [`examples/fooddash/fact-card.json`](../examples/fooddash/fact-card.json).

## Top level

| Field | Meaning |
| --- | --- |
| `product` | name of the product under test |
| `sources` | `[{ "path", "stories" }]`: the documents the facts come from, paths relative to the card |
| `approval` | `{ "status", "by", "date", "note" }`. The generator only runs when `status` is `approved` |
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

| Type | Use it when the document states | `values` carries | Technique |
| --- | --- | --- | --- |
| `limit` | a threshold where behaviour changes: a minimum, a maximum, a rounding point | `boundary`, the comparison, what it applies to | boundary value analysis, 3-value |
| `rule` | a result that depends on conditions: a formula, a discount, an eligibility rule | the formula or rate and its base | decision table, together with the facts it interacts with |
| `lifecycle` | states and the moves between them | `states`, `initial`, `final`, `transitions`, `forbidden` | state transition testing: every valid transition, every forbidden one |
| `parameter` | a value that varies by case: a fee per restaurant, a setting per channel | the values or where to read them | each value at least once |

A lifecycle transition is `{ "id", "from", "event", "to" }`; a forbidden one has no `to`. Either may carry its own
`source` as `"STORY: quoted sentence"`, and that quote is checked too.

## Open questions

A question records something the technique needs and the documents do not give: a decision-table cell with no
result, a boundary whose own value is unclear, a rounding rule that is missing.

- The generator never turns a question into a test. A test that depends on it is listed as **blocked**, with the question id.
- When the analyst answers, the answer becomes a fact (with the analyst's answer as its source) and the question is removed.
- A reading the card had to choose ("over $25" taken as "more than $25") is also a question, with status `reading to confirm`.
