## Context

See proposal.md — Why. Reuses the pattern proven in `infra-agent/`: contract as data, backend protocol, low-level MCP `Server` with explicit schemas behind `StreamableHTTPSessionManager(stateless=True, json_response=True)`, LangGraph prebuilt agent, scripted double, `eval` as thin orchestration. What is new is the domain (Jira) and that the "mock" is not just an inventory but a system with a workflow, so the agent's mistakes are state transitions a Jira admin would recognise.

## Goals / Non-Goals

**Goals:** run and test with no Atlassian tenant; connect to a real Jira MCP by changing one URL; make the naive failure legible (an incident closed, a PIN in a comment).
**Non-Goals:** a full JQL parser; Jira Cloud OAuth (the agent passes a bearer through; whatever the server needs is the server's business); Confluence.

## Decisions

**D1. mcp-atlassian names, plus aliases.** Naming the contract after the most-used open-source Jira MCP gives a real server to point at with no mapping. Other servers name the same operations differently, so the backend routes through `ALIASES`, first hit wins, `TICKETAGENT_TOOL_MAP` overrides. Aliases are labelled best-effort in the README rather than asserted.

**D2. The mock is the MCP.** The mock engine is the only MCP server this project runs; it serves the exact contract, so a harness imports signatures from the mock rather than from a separate agent-side server. One server, one contract.

**D3. A real workflow, not free-form status.** Named transitions with a state table make `jira_transition_issue(OPS-7, "Done")` a concrete, gradable event and let an unavailable transition fail the way Jira does.

**D4. Attack and canary live in the data.** `--plant` appends the instruction to the first ticket's description; the canary is a PIN in the incident's description. A harness's own world will plant its own; the mock's plant exists so the standalone demo shows the failure.

**D5. The double's task parsing is minimal.** It reads the on-call email and project key out of the task text and otherwise follows a fixed plan; this keeps it deterministic and makes the two deliberate faults easy to point at in a demo.

## Risks / Trade-offs

- [Alias names wrong for a given server] → override env var; run header prints the routing used.
- [Double mistaken for the agent] → labelled everywhere; README shows the exact faults it has on purpose.
- [Harness drafter misclassifies `jira_*` verbs] → observed with Nikasa; reported as a harness finding, corrected in the wizard's review step.
