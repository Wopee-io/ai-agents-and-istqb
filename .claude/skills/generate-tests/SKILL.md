---
name: generate-tests
description: Generate tests from an approved fact card with code - boundary values, decision tables, state transitions, each choice - and prove the result is reproducible. Use for steps 3 and 4 of spec-to-tests, after a fact card changed, or when asked why a test exists or where its expected result comes from.
---

# Generate tests

The generator is code. You run it, check it and explain its output. You do not write or edit tests.

## Steps

1. `npm run check-card`. Stop when it fails.
2. `npm run generate` (FoodDash: `node examples/fooddash/generate.mjs`).
   - "is not approved" or "changed after it was approved": stop and use `review-fact-card`. `npm run generate -- --draft` writes a preview to `tests.draft.json` and `tests.draft.md` and leaves the real tests alone; never run or deliver draft tests.
   - "Cannot generate: …": the card asks for something the binding has no rule or steps for (a new transition, an answered question, a value the product cannot build). Report the message; the fix is in the card or in the binding, not in the tests.
3. Run it a second time. The two `sha256` lines must be identical. When they differ, something non-deterministic got into the binding (a clock, randomness, unordered iteration): find it before going on.
4. Read `tests.md` and check it against the card:
   - every fact is checked by at least one test (as the test's fact, or as the `fact` of one of its checks in `tests.json`), or sits in a blocked test, or you can say why not;
   - every blocked test names an open question that is on the card;
   - the boundary value table says which wanted values the product cannot build and which nearest values replaced them;
   - the decision table has a result for every rule: a test, "covered" by an earlier test, "not possible", or a question.
5. Report: tests by technique, ready and blocked, per build, the sha256, and anything from step 4 that did not hold.

## What picks what

| Fact type | Technique | Function in `lib/techniques.mjs` |
| --- | --- | --- |
| `limit` | boundary value analysis, 3-value: both boundary values with their neighbours; nearest reachable value on the same side when the exact one cannot be built | `boundaryPoints`, `firstAbove`, `nearestReachable` |
| `rule` | decision table over the interacting facts | `decisionRules` |
| `lifecycle` | every valid transition at least once; every forbidden transition tested, in its own test or, when it starts in the final state, at the end of the tour that gets there | `transitionTours`, `forbiddenPaths` |
| `parameter` | each value at least once, where earlier tests missed it | `uncoveredValues` |

## Explaining a test

Every test in `tests.md` carries its technique, its fact with the story, its steps and its expected result. To answer
"why does this test exist": name the fact, quote its sentence from the card, name the technique the type picked, and
show the row in the boundary or decision table it comes from.

## To change the tests

Change the fact card (and get it approved again), or change the binding, then generate again. Never edit
`tests.json` or `tests.md`: the next run overwrites them, and a hand-edited test has no source.

After changing `lib/` or the binding: `npm run unit`, then two generator runs with the same sha256.
