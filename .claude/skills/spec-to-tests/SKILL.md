---
name: spec-to-tests
description: Run the whole process from a product spec to executed tests - fact card, analyst approval, ISTQB techniques computed by code, browser run, findings. Use when asked to generate or regenerate tests from a spec or requirements document, or to run the FoodDash example end to end.
---

# Spec to tests

Five steps. A model works in step 2 and may write text in steps 4 and 5. Everything else is code.

| Step | Who | Skill | Done when |
| --- | --- | --- | --- |
| 1. Spec | product team | none: take the documents as they are | the source documents are in the example folder and listed in `sources` |
| 2. Fact card | agent drafts, analyst approves | `extract-facts`, then `review-fact-card` | `npm run check-card` passes and `approval.status` is `approved` |
| 3. Techniques | code | `generate-tests` | the generator ran without an error |
| 4. Tests | code | `generate-tests` | two runs print the same sha256 |
| 5. Run | browser | `run-tests`, then `report-findings` | `results.md` is written and every failure is a finding or explained |

## How to run it

1. Find the example folder (default `examples/fooddash`) and read its `fact-card.json` if there is one.
2. No card, or the spec changed: use `extract-facts`.
3. Card not approved, or it has open questions the analyst has not seen: use `review-fact-card`. **Stop here until the analyst has approved.** Do not approve for them.
4. Use `generate-tests`.
5. Use `run-tests`, then `report-findings`.

## Two stops for a human

- **After step 2:** the analyst approves the card. Nothing is generated before that.
- **After step 5:** a person decides which findings are defects in the app and which are mistakes in the spec or the card.

## Do not

- Do not write tests directly from the spec, even "just a few to start". A test without a fact cannot be traced or reproduced.
- Do not answer an open question yourself.
- Do not look at the app, at `planted-defects.json` or at `apps/README.md` to decide what the expected result is.
- Do not edit `tests.json` or `tests.md`. To change a test, change the fact and generate again.

## Report at the end

Facts by type and open questions; tests by technique, ready and blocked; the sha256 and that two runs matched; per build: run, passed, failed; the findings, each with its fact and story.
