---
name: generate-tests
description: Generate tests from an approved fact card with code - boundary values, decision tables, state transitions, each choice - and prove the result is reproducible. Use for steps 3 and 4 of spec-to-tests, after a fact card changed, or when asked why a test exists or where its expected result comes from.
---

# Generate tests

The generator is code. You run it, check it and explain its output. You do not write or edit tests.

## Steps

1. `npm run check-card`. Stop when it fails.
2. `npm run generate` (FoodDash: `node examples/fooddash/generate.mjs`).
   - "fact-card.json is not approved": stop and use `review-fact-card`. `--draft` gives a preview only; never run or deliver draft tests.
3. Run it a second time. The two `sha256` lines must be identical. When they differ, something non-deterministic got into the binding (a clock, randomness, unordered iteration): find it before going on.
4. Read `tests.md` and check it against the card:
   - every fact appears in at least one test, or in a blocked test, or you can say why not;
   - every blocked test names an open question that is on the card;
   - the boundary value table says which wanted values the product cannot build and which nearest values replaced them;
   - the decision table has a result for every rule: a test, "covered" by an earlier test, "not possible", or a question.
5. Report: tests by technique, ready and blocked, per build, the sha256, and anything from step 4 that did not hold.

## What picks what

| Fact type | Technique | Function in `lib/techniques.mjs` |
| --- | --- | --- |
| `limit` | boundary value analysis, 3-value; nearest reachable value on the same side when the exact one cannot be built | `boundaryPoints`, `nearestReachable` |
| `rule` | decision table over the interacting facts | `decisionRules` |
| `lifecycle` | every valid transition at least once, every forbidden transition in its own test | `transitionTours`, `forbiddenPaths`, `shortestPath` |
| `parameter` | each value at least once, where earlier tests missed it | `uncoveredValues` |

## Explaining a test

Every test in `tests.md` carries its technique, its fact with the story, its steps and its expected result. To answer
"why does this test exist": name the fact, quote its sentence from the card, name the technique the type picked, and
show the row in the boundary or decision table it comes from.

## To change the tests

Change the fact card (and get it approved again), or change the binding, then generate again. Never edit
`tests.json` or `tests.md`: the next run overwrites them, and a hand-edited test has no source.

After changing `lib/` or the binding: `npm run unit`, then two generator runs with the same sha256.
