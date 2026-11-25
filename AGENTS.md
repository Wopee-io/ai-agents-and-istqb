# AGENTS.md

This repository turns a product spec into tests in five steps: spec → fact card → techniques → tests → run.
The process is described as skills in `.claude/skills/<name>/SKILL.md`. Read the skill for the step you are
working on before you act.

| Task | Skill |
| --- | --- |
| The whole process, end to end | `.claude/skills/spec-to-tests/SKILL.md` |
| Fill a fact card from a spec | `.claude/skills/extract-facts/SKILL.md` |
| Review a card with the analyst, record answers and approval | `.claude/skills/review-fact-card/SKILL.md` |
| Generate tests from an approved card | `.claude/skills/generate-tests/SKILL.md` |
| Run the tests in the browser | `.claude/skills/run-tests/SKILL.md` |
| Report failures as findings | `.claude/skills/report-findings/SKILL.md` |
| Apply the process to another product | `.claude/skills/adapt-to-your-app/SKILL.md` |

## Rules that hold in every step

1. **Facts before tests.** No test without an approved fact. No fact without a quote from the source documents.
2. **A gap is a question, not a guess.** When the documents do not say, add an open question to the card. Never fill it in.
3. **Counting and computing belong to code.** Boundaries, combinations, paths, prices and expected results come from
   `lib/techniques.mjs` and the binding. Do not compute them yourself and do not edit `tests.json` or `tests.md` by hand.
4. **Rules and expected results come from the spec, never from the app.** Do not open the app to find out what the
   right answer is. Test data the spec does not contain (a menu, a price list) may be read from the app; it goes under
   `data` on the card with a note saying so.
5. **Only the analyst approves.** Never run `npm run approve` and never edit the `approval` block. Any edit of the
   card after approval voids it, and the generator stops until a person approves again.
6. **`examples/fooddash/planted-defects.json` and `examples/fooddash/apps/README.md` are the answer key.** Do not read
   them while extracting facts or generating tests.

## Commands

```bash
npm run check-card     # shape, references, every quote against the sources, approval state
npm run generate       # fact card → tests.json + tests.md, prints sha256
npm run tests          # all builds; `npm run tests battle` for one; exit code 1 only when the run itself broke
npm run unit           # unit tests of lib/
```

After changing `lib/` or a binding: `npm run unit`, then `npm run generate` twice and compare the sha256.
