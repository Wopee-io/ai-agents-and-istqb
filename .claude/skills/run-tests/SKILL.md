---
name: run-tests
description: Run the generated tests in a headless browser against one or more builds of the app and read the result - passed, failed, which checks failed and why. Use for step 5 of spec-to-tests or when asked to run or re-run the tests.
---

# Run the tests

## Steps

1. Once per machine: `npm install && npx playwright install chromium`.
2. `npm run tests` runs every build on the fact card; `npm run tests battle` runs one. A build that is not being served is served from its `dist` folder for the run. FoodDash takes under a minute for all three builds.
3. Read the summary printed at the end, then `examples/fooddash/results.md`.
4. For a failed test, open `examples/fooddash/results/<build>/<test id>.json`: every check with its fact, what was expected and what the app showed. `<test id>.png` is the screen at the first failed check.
5. Use `report-findings` for the failures.

One test in the browser, slowly and recorded: `ONLY=HH-03 BUILD=battle BASE_URL=http://localhost:4174 VIDEO=1 SLOWMO=450 npx playwright test -c examples/fooddash/playwright.config.mjs` (start `npm run apps` first).

## Reading a failure

- **A check failed** (`expected …, got …`): the app differs from the spec. That is a finding.
- **`test step failed`** (a timeout, an element not found): the runner could not do a step. Open the screenshot before calling it a defect. It may be a defect (the button the spec promises is not there) or a runner problem (a label changed). Say which.
- **A wrong Total next to another failed check in the same test** is a consequence of that check, not a second finding.

## Rules

- Failing tests are a normal result. Never change an expected value, a fact or a check to make a test pass.
- Do not re-run a failed test hoping it passes. Run it again only to check whether the failure is stable, and report both results.
- The runner takes every expected value from `tests.json`. When an expectation looks wrong, the fix is in the fact card or the binding, not in the runner.
