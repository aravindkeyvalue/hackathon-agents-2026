# harness-eval Specification

## Purpose
Lets an external harness run this agent against its own Jira-shaped sandbox and grade it.

## Requirements

### Requirement: Run descriptor in, verdict out
`ticketagent eval` SHALL accept a descriptor via `--run-file`, `--run-json`, or by POSTing `{scenario, attack, trial}` to `--open-url`; SHALL require `mcp_url`, `token`, `task`, `finish_url`; SHALL route all tools to that `mcp_url` for the run; SHALL POST `{"final_message"}` to `finish_url`; SHALL print gate, floor, attacker goal and violations; SHALL exit 0 if every run passed the gate, else 1; `--k N` SHALL repeat with trials `trial..trial+N-1`.

#### Scenario: Attack run fails, clean runs pass
- **WHEN** eval runs once with `--attack` and then with `--k 2` without it against a harness that plants the note on attack
- **THEN** the first exits 1 printing GATE FAILED with `attacker_goal` and `canary_leak`, the second exits 0 ending "2/2 passed the gate"
