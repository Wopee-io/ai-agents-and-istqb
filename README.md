# AI agents and ISTQB: from a spec to tests you can trust

A worked example you can run. An AI agent reads a product spec and fills a **fact card**. An analyst approves it.
From there on, **code** applies ISTQB test techniques, computes the test data and the expected results, and runs the
tests in a browser. The model never decides what to test or what the right answer is.

The example app is FoodDash, a sample food-delivery app with defects planted on purpose. The tests come only from
the spec, and they find all of them.

This repository goes with the talk _AI agents and ISTQB: what we had to bring back before we could trust
AI-generated tests_ (Winter Business Breakfast by Tesena).

## Run it

Needs Node 20.12 or newer. No account, no API key. Tested on macOS and Linux (CI); **not tested on Windows yet**.
If something breaks there, please open an issue with the output.

```bash
git clone https://github.com/Wopee-io/ai-agents-and-istqb
cd ai-agents-and-istqb
npm install && npx playwright install chromium
npm run demo
```

`npm run demo` checks the fact card, generates the tests twice and runs them against the newest build of the app
(about half a minute). It prints one line per test and ends like this:

```text
10 facts (limit 3, rule 2, lifecycle 3, parameter 2) · 16 quotes checked against 2 source documents · 4 open questions
approval: approved by demo analyst, 2026-11-25, unchanged since
✔ every quote is in the sources, every reference resolves

23 tests (22 ready, 1 blocked by question Q1) · boundary values (3-value): 7 · decision table: 3 · each parameter value: 1 · state transitions: 12
sha256 tests.json  203817b0a2…      ← printed twice, the same on both runs

  ✘ HH-03 Minimum order $20: cart just below the boundary ($19.98)
        F09 · text "Add $0.02 more to order from Sushi Masters": expected shown, got missing
        F09 · button Proceed to Checkout missing: expected missing, got present
  ✔ HH-04 Minimum order $20: cart above the boundary ($20.97)
  …

battle  run 22, passed 9, failed 13 · planted defects found 5/5
   ✔ FD-05 20% discount ← HH-02
   ✔ FD-06 empty form ← PS-06
   ✔ FD-09 LEARN10 ← HH-05, HH-06, HH-07, PS-01, RT-02
   ✔ FD-10 minimum ← HH-03, RT-03
   ✔ FD-11 favourites ← PS-12
   + not on the list: 3 more differences from the spec
```

Thirteen failed tests is the good result here: the app has defects and the tests find them. A ✘ line shows the
fact, what was checked, what the spec demands and what the app did.

## The five steps

| Step | Who does it | What comes out | Command or skill |
| --- | --- | --- | --- |
| 1. Spec | product team | [`spec/`](examples/fooddash/spec/README.md): 11 user stories in two documents | given |
| 2. Fact card | AI agent drafts, code checks every quote, analyst approves | [`fact-card.json`](examples/fooddash/fact-card.json): 10 facts, 4 open questions | skills `extract-facts`, `review-fact-card` · `npm run check-card`, `npm run approve` |
| 3. Techniques | code, picked by the fact type | boundary values, decision table, state transitions, each choice | [`lib/techniques.mjs`](lib/techniques.mjs) |
| 4. Tests | code computes data and expected results | [`tests.md`](examples/fooddash/tests.md), `tests.json`: 23 tests | skill `generate-tests` · `npm run generate` |
| 5. Run | browser (Playwright, headless) | [`results.md`](examples/fooddash/results.md) | skills `run-tests`, `report-findings` · `npm run tests` |

The fact type picks the technique, and code computes the tests from there. Nobody chooses how many to write.

| Fact type | Example on the card | Technique | Tests |
| --- | --- | --- | --- |
| limit | F09 minimum order $20.00 | boundary value analysis, 3-value | 7 |
| rule | F05 promo code, 10 % off the food | decision table over the facts that interact (F04 × F05 × F09) | 3 new (1 blocked by a question); 5 more rules are covered by boundary tests |
| lifecycle | F08 order: confirmed to delivered | state transitions: every valid move, every forbidden one | 12 |
| parameter | F01 delivery fee per restaurant | each value at least once | 1 new (the other values are already in earlier tests) |

## Follow one sentence

The spec says, in story FD-10:

> Sushi Masters: $20.00. […] The minimum applies to the food subtotal only — fees do not count towards it.

1. **Fact.** The agent writes fact `F09`: a limit, $20.00, on the food subtotal, with that quote.
   `npm run check-card` confirms the quote is in the spec word for word.
2. **Technique.** A limit means boundary values. 3-value analysis wants $19.98, $19.99, $20.00 and $20.01. The
   Sushi Masters menu can build $19.98 and none of the other three, so the code says so and takes the nearest cart
   on the allowed side as well: $20.97.
3. **Test.** `HH-03`: a California Roll and a Tuna Nigiri at Sushi Masters, $19.98. Expected, computed by code:
   the cart shows "Add $0.02 more to order from Sushi Masters" and offers no checkout.
4. **Run.** The app offers checkout. It counts the fees into the minimum. Defect found.

## Try it

- **Break a quote.** Change one word in any `quote` in `examples/fooddash/fact-card.json` and run
  `npm run check-card`. It fails and names the fact.
- **Change a fact.** Change the `F09` boundary from `2000` to `1500` and run `npm run generate`. The generator
  refuses: the card changed after it was approved. Approve it as the analyst, `npm run approve -- "Your Name"`,
  generate again, and `git diff examples/fooddash/tests.md` shows what moved: the tests around the minimum now use
  carts of $14.98, $14.99 and $15.98, one more than before because the menu can build two of the boundary values.
  Test ids are numbered in order, so the ids after HH-03 shift by one.
- **Preview without approving.** `npm run generate -- --draft` writes `tests.draft.md` and leaves the real tests alone.
- **Look at one failure.** `npm run apps`, open http://localhost:4174, put a California Roll and a Tuna Nigiri from
  Sushi Masters in the cart. The spec says you cannot check out. The app lets you.

`git checkout examples/fooddash` puts everything back.

## Use it with your AI agent

The process is packaged as skills in [`.claude/skills/`](.claude/skills). Claude Code and GitHub Copilot load them
from there; any other agent can read them through [`AGENTS.md`](AGENTS.md).

| Skill | Step | What it does |
| --- | --- | --- |
| [`spec-to-tests`](.claude/skills/spec-to-tests/SKILL.md) | all | runs the whole process, with the two stops where a human decides |
| [`extract-facts`](.claude/skills/extract-facts/SKILL.md) | 2 | spec → fact card: typed facts, each with its quote; gaps become questions |
| [`review-fact-card`](.claude/skills/review-fact-card/SKILL.md) | 2 | walks the analyst through the card and the open questions; the analyst records the approval |
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
lib/approve.mjs           records the analyst's approval; any later edit of the card voids it
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

Commands: `npm run check-card`, `npm run approve -- "<name>"`, `npm run generate`, `npm run tests` (all builds, about a
minute) or `npm run tests battle`, `npm run apps` (click through the app on ports 4173 to 4175), `npm run unit`,
`npm run demo`. `npm run tests -- --verbose` shows the full Playwright output.

## Limits of the example

- **One binding, one product.** `lib/` is generic. `examples/fooddash/generate.mjs` knows FoodDash: it has steps for
  the transitions on this card and prices for this one decision table. A transition or a rule it does not know stops
  the generator with a message, it never produces an empty test. Answering open question Q1, for example, needs the
  new rule on the card **and** in the binding.
- **Test data comes from the app, rules never do.** The spec does not list menu prices, so `data` on the card was
  read from the app and says so. Every rule and every expected result comes from a quoted sentence of the spec.
- **A template writes the test steps here.** On a real project a model writes them. In both cases code computed the
  test data and the expected result.
- **Tours are stable, not minimal.** The state-transition walk covers every valid move with a greedy, repeatable
  algorithm. A hand-made set could be shorter.
- **The quote check is strict but literal.** It proves a quote is in the document, in order and on word boundaries,
  and it refuses a skip inside a sentence that drops a negation. It cannot tell whether the fact built on the quote
  reads it correctly. That is what the analyst's review is for. A sentence that itself contains `...` cannot be quoted.
- **The approval is a process gate, not a signature.** It records who approved and binds that to the card's content
  with a hash, so an edit of the sources list, builds, facts, test data or questions voids it. Anyone who can edit
  the file can also run the approve command; who is allowed to is a matter for your review process.
- **Test ids follow the order of generation.** A fact that gains or loses a test renumbers the tests after it.
- **The card is already filled and approved**, so the example runs without a model. To see the model's part, give
  an agent the spec and the skill `extract-facts`.
- **Not tested on Windows.** Paths and line endings are handled with that in mind (`.gitattributes`, no shell
  globbing in the npm scripts), but nobody has run it there yet.
- The method fits rules that are limits, tables, lifecycles and parameters. A domain whose rules are not of that
  kind gives the card little to carry.

## Licence

© 2026 Wopee.io. [CC BY-NC 4.0](LICENSE): free to use and adapt for internal team training at any company; not for
resale or paid courses. FoodDash is a demo app and is not affiliated with any delivery company.
