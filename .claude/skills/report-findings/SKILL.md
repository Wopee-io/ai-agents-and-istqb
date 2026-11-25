---
name: report-findings
description: Turn failed checks from a test run into findings a developer and an analyst can act on - each traced to its test, technique, fact and the quoted sentence of the spec. Use after run-tests, or when asked to write up, triage or file the failures of a run.
---

# Report findings

Input: `results.md` and `results/<build>/*.json`. Output: one finding per distinct difference between the app and the spec.

## Steps

1. Collect the failed checks from `results/<build>/*.json`.
2. **Group them into findings.** Checks that fail for the same reason are one finding, however many tests show it. Leave out a wrong Total that only follows from another failed check in the same test.
3. **Write each finding** with these parts:

   | Part | Content |
   | --- | --- |
   | Title | what the app does, in one sentence |
   | Spec | the story and the quoted sentence, taken from the fact on the card |
   | Expected | the value code computed, from `tests.json` |
   | Actual | what the app showed, from the result file |
   | How to see it | the test's steps and data, from `tests.md` |
   | Found by | test ids, technique, build |
   | Evidence | the screenshot path |

4. **Sort the findings**: wrong money and orders that should not exist first, then behaviour that blocks the customer, then the rest. Say how you sorted.
5. **Mark what a person must decide.** A finding is a difference between app and spec. Whether the app or the spec is wrong is the analyst's call: say so when the spec looks like the weaker side.
6. Only on the FoodDash example, and only now: compare with the "planted defects" lines of `results.md` and say which findings were planted and which were not.

## Example

> **The minimum order counts the fees, so a cart below $20 of food can check out**
> Spec, FD-10: "The minimum applies to the food subtotal only — fees do not count towards it."
> Expected: with $19.98 of food at Sushi Masters the cart shows "Add $0.02 more to order from Sushi Masters" and offers no Proceed to Checkout.
> Actual: no message; Proceed to Checkout is shown.
> How to see it: open Sushi Masters, add 1× California Roll and 1× Tuna Nigiri (2pc), open the cart.
> Found by: HH-03 (boundary values), RT-03 (decision table R9), build battle. Evidence: `results/battle/HH-03.png`.

## Rules

- Quote the spec; do not retell it. The quote is on the fact card.
- Report what was observed. Do not guess the cause in the code.
- A blocked test is not a finding. List the open questions separately, as questions for the analyst.
- File issues anywhere only when the user asks for it and says where.
