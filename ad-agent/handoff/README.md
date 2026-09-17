# Scoring harness — parked for the AgentSim repo

Not wired into this repo any more. These are the files that made up the exam room, kept here so they can be
copied across rather than retyped from the handoff doc. Delete this folder once they have landed.

| File | What it is |
|---|---|
| `score.ts` | The three-axis scorer: Task / Mandate / World Integrity, plus the HALTED verdict. Pure — ledger events in, scorecard out. |
| `scenario.ts` | Shared types: `Axis`, `Scorecard`, `axis()`, `scorecard()`, `Scenario`, `Shift`, and the agent-run types. |
| `score.test.ts` | Scores synthetic ledgers. No keys, no network — the property worth preserving. |
| `replay.ts` | Scripted A/B replays, for grading without spending a model call. |
| `run.ts` | The exam room CLI: build world, run agent or replay, score the ledger, write `runs/<shift>-<mode>-<time>.json`. |
| `sweep.sh` | Runs every poison record through the exam room, one row each. |
| `runs/` | 88 run records from the ladder sweeps — the raw evidence behind the measured landing rates. |

Imports have been rewritten to resolve inside this folder (`./scenario.ts`). The `../world/` and `../agent/`
imports in `score.ts`, `index.ts` and `score.test.ts` still point at the agent, which now lives at the repo
root — rewire those to wherever the agent ends up in AgentSim.
