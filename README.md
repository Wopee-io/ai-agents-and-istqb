# AI agents and ISTQB: from a spec to tests you can trust

A worked example you can run. An AI agent reads a product spec and fills a **fact card**. An analyst approves it.
From there on, **code** applies ISTQB test techniques, computes the test data and the expected results, and runs the
tests in a browser. The model never decides what to test or what the right answer is.

The example app is FoodDash, a sample food-delivery app with defects planted on purpose. The tests come only from
the spec, and they find all of them.

This repository goes with the talk _AI agents and ISTQB: what we had to bring back before we could trust
AI-generated tests_ (Winter Business Breakfast by Tesena).

## Run it

Needs Node 20.12 or newer. No account, no API key.

```bash
git clone https://github.com/marcel-veselka/ai-agents-and-istqb
cd ai-agents-and-istqb
npm install && npx playwright install chromium
npm run demo
```

`npm run demo` checks the fact card, generates the tests twice and runs them against the newest build of the app.
Expected output, shortened:

```text
10 facts (limit 3, rule 2, lifecycle 3, parameter 2) · 15 quotes checked against 2 source documents · 4 open questions
✔ every quote is in the sources, every reference resolves

23 tests (22 ready, 1 blocked by question Q1) · boundary values (3-value): 7 · decision table: 3 · each parameter value: 1 · state transitions: 12
sha256 tests.json  7738580390…      ← the same on both runs

battle  run 22, passed 9, failed 13 · planted defects found 5/5
   ✔ FD-05 20% discount ← HH-02
   ✔ FD-06 empty form ← PS-06
   ✔ FD-09 LEARN10 ← HH-05, HH-06, HH-07, PS-01, RT-02
   ✔ FD-10 minimum ← HH-03, RT-03
   ✔ FD-11 favourites ← PS-12
   + not on the list: 3 spec discrepancies (see results.md)
```

Thirteen failed tests is the good result here: the app has defects and the tests find them.

## The five steps

| Step | Who does it | What comes out | Command or skill |
| --- | --- | --- | --- |
| 1. Spec | product team | [`spec/`](examples/fooddash/spec/fooddash-spec.md): 11 user stories | given |
| 2. Fact card | AI agent drafts, code checks every quote, analyst approves | [`fact-card.json`](examples/fooddash/fact-card.json): 10 facts, 4 open questions | skills `extract-facts`, `review-fact-card` · `npm run check-card` |
| 3. Techniques | code, picked by the fact type | boundary values, decision table, state transitions, each choice | [`lib/techniques.mjs`](lib/techniques.mjs) |
| 4. Tests | code computes data and expected results | [`tests.md`](examples/fooddash/tests.md), `tests.json`: 23 tests | skill `generate-tests` · `npm run generate` |
| 5. Run | browser (Playwright, headless) | [`results.md`](examples/fooddash/results.md) | skills `run-tests`, `report-findings` · `npm run tests` |

The fact type picks the technique. Nobody chooses how many tests to write.

| Fact type | Example on the card | Technique | Tests |
| --- | --- | --- | --- |
| limit | F09 minimum order $20.00 | boundary value analysis, 3-value | 7 |
| rule | F05 promo code, 10 % off the food | decision table | 3 (1 blocked by a question) |
| lifecycle | F08 order: confirmed to delivered | state transitions, valid and forbidden | 12 |
| parameter | F01 delivery fee per restaurant | each value at least once | 1 |

## Follow one sentence

The spec says, in story FD-10:

> Sushi Masters: $20.00. […] The minimum applies to the food subtotal only — fees do not count towards it.

1. **Fact.** The agent writes fact `F09`: a limit, $20.00, on the food subtotal, with that quote.
   `npm run check-card` confirms the quote is in the spec word for word.
2. **Technique.** A limit means boundary values: $19.99, $20.00, $20.01. The menu cannot build those
   (all prices end in .99), so the code takes the nearest carts on both sides: $19.98 and $20.97.
3. **Test.** `HH-03`: a California Roll and a Tuna Nigiri at Sushi Masters, $19.98. Expected, computed by code:
   the cart shows "Add $0.02 more to order from Sushi Masters" and offers no checkout.
4. **Run.** The app offers checkout. It counts the fees into the minimum. Defect found.

## Try it

- **Change a fact.** In `examples/fooddash/fact-card.json` change the `F09` boundary from `2000` to `1500` and run
  `npm run generate`. `tests.md` now has a $14.99 and a $15.98 cart, and `git diff` shows exactly which tests moved.
- **Break a quote.** Change one word in any `quote` and run `npm run check-card`. It fails and names the fact.
- **Withdraw the approval.** Set `approval.status` to anything but `approved`. The generator refuses to write tests.
- **Answer a question.** `Q1` (does the 20 % discount stack with the promo code?) blocks test `RT-01`.
  The skill `review-fact-card` shows how an answer becomes a fact.

## Use it with your AI agent

The process is packaged as skills in [`.claude/skills/`](.claude/skills). Claude Code and GitHub Copilot load them
from there; any other agent can read them through [`AGENTS.md`](AGENTS.md).

| Skill | Step | What it does |
| --- | --- | --- |
| [`spec-to-tests`](.claude/skills/spec-to-tests/SKILL.md) | all | runs the whole process, with the two stops where a human decides |
| [`extract-facts`](.claude/skills/extract-facts/SKILL.md) | 2 | spec → fact card: typed facts, each with its quote; gaps become questions |
| [`review-fact-card`](.claude/skills/review-fact-card/SKILL.md) | 2 | walks the analyst through the card and the open questions, records the approval |
| [`generate-tests`](.claude/skills/generate-tests/SKILL.md) | 3, 4 | runs the generator, proves the output is reproducible, explains each test |
| [`run-tests`](.claude/skills/run-tests/SKILL.md) | 5 | runs the tests in the browser and reads the result |
| [`report-findings`](.claude/skills/report-findings/SKILL.md) | 5 | turns each failure into a finding that quotes the spec |
| [`adapt-to-your-app`](.claude/skills/adapt-to-your-app/SKILL.md) | | your spec and your app instead of FoodDash |

In Claude Code, open the repository and ask: "Run the spec-to-tests process on FoodDash."

## Use it on your own app

Three layers, and only the last one is yours to write:

| Layer | Where | Changes per product? |
| --- | --- | --- |
| Techniques and checks | [`lib/`](lib) | no: plain functions, no product knowledge |
| Process | [`.claude/skills/`](.claude/skills), [`docs/fact-card.md`](docs/fact-card.md) | no |
| Fact card, binding, runner | [`examples/fooddash/`](examples/fooddash) | yes: copy the folder and replace its contents |

The binding (`generate.mjs`) is the part that knows the product: how a boundary becomes a cart, how a transition
becomes clicks. Start with the skill [`adapt-to-your-app`](.claude/skills/adapt-to-your-app/SKILL.md).

## What is in the repository

```text
lib/techniques.mjs        boundary values, decision table, state transitions, each choice (+ unit tests)
lib/check-card.mjs        checks a fact card: shape, references, every quote against the source documents
lib/serve.mjs             static server for the sample app
examples/fooddash/
  spec/                   the product spec: FD-01 to FD-08, and FD-09 to FD-11 for the newer build
  apps/dist/              three frozen builds of the app (learn, battle, bug); apps/README.md lists the defects
  fact-card.json          step 2: the approved fact card
  generate.mjs            steps 3 and 4: the FoodDash binding, writes tests.json and tests.md
  tests/run.spec.mjs      step 5: drives the browser from tests.json
  run.mjs                 step 5: runs the builds, sorts the failures, writes results.md
  planted-defects.json    scoring key; only run.mjs reads it, never the generator
docs/fact-card.md         the fact card format
.claude/skills/           the process as skills
```

Commands: `npm run check-card`, `npm run generate`, `npm run tests` (all builds) or `npm run tests battle`,
`npm run apps` (click through the app on ports 4173 to 4175), `npm run unit`, `npm run demo`.

## Limits of the example

- In the example a template writes the test steps. On a real project a model writes them. In both cases code
  computed the test data and the expected result.
- The fact card is already filled and approved, so the example runs without a model. To see the model's part,
  delete the facts and run the skill `extract-facts` on the spec.
- The method fits rules that are limits, tables, lifecycles and parameters. A domain whose rules are not of
  that kind gives the card little to carry.

## Licence

© 2026 Wopee.io. [CC BY-NC 4.0](LICENSE): free to use and adapt for internal team training at any company; not for
resale or paid courses. FoodDash is a demo app and is not affiliated with any delivery company.
