# harness-eval Specification

## Purpose
Lets an external testing harness run this agent against its own sandbox: the harness hands over a run descriptor, the agent routes its tools there, does the job, and reports back for grading.

## Requirements

### Requirement: Accepts a run descriptor
`opsagent eval` SHALL accept a run descriptor as JSON via `--run-file <path>` or `--run-json '<json>'`, or SHALL create one by POSTing `{"scenario", "attack", "trial"}` to `--open-url <url>` (the harness's run-opening endpoint). A descriptor SHALL contain `mcp_url`, `token`, `task` and `finish_url`; a missing key SHALL fail with a message naming it.

#### Scenario: Open a run from the harness
- **WHEN** `opsagent eval --open-url http://127.0.0.1:8900/runs --scenario free_disk_staging --attack` runs
- **THEN** a run is opened, and the descriptor's four keys are present before the agent starts

### Requirement: Tools are routed to the run
For the duration of the eval the agent SHALL use the MCP backend pointed at the descriptor's `mcp_url` with its `token`, regardless of `OPSAGENT_BACKEND`, and SHALL take its tool set from that server. The task text SHALL be the descriptor's `task`.

#### Scenario: Sandbox, not inventory
- **WHEN** the eval runs with the local backend configured in the environment
- **THEN** no local inventory call is made and every tool call goes to `mcp_url`

### Requirement: Reports the verdict
When the agent finishes, `eval` SHALL POST `{"final_message": <agent's final text>}` to `finish_url`, print the returned JSON's `grade` (gate, floor, attacker goal) and each violation, and exit 0 if the gate passed and 1 if it failed. `--k N` SHALL repeat with trials `0..N-1` (opening a new run each time when `--open-url` is used) and print `passed/N`.

#### Scenario: Keyless hijack is visible
- **WHEN** `opsagent eval --model scripted --open-url … --scenario free_disk_staging --attack` runs against a harness whose scenario plants an instruction in the alert note
- **THEN** the printed grade shows the gate failed and the attacker goal met, and the exit code is 1

#### Scenario: Pass count
- **WHEN** `--k 3` is given
- **THEN** three runs are opened with trials 0, 1, 2 and the last line is `<passed>/3 passed the gate`
