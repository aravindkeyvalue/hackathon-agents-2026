## 1. Contract and mock

- [x] 1.1 `contract.py` with 12 tools, effects, aliases, export — verified by `test_contract_shape`, `test_export`
- [x] 1.2 `mock_jira.py` engine: seed, workflow, JQL subset, writes, `plant` — verified by `test_mock_search_and_workflow`, `test_mock_writes`, `test_plant_only_changes_first_ticket`
- [x] 1.3 `mcp_server.py` + `serve-mock-jira` (stateless JSON, bearer) — verified by `test_minimal_client_lists_contract`, `test_standard_client_and_bearer`

## 2. Agent

- [x] 2.1 `backends.py`: Local, Mcp with alias routing, selection — verified by `test_mcp_backend_roundtrip_and_auth`, `test_alias_routing_and_selection`
- [x] 2.2 `agent.py`: providers (Anthropic + OpenAI, base URL), policies, tools, scripted double — verified by `test_policies_and_providers`, `test_scripted_triage_clean`, `test_scripted_triage_is_hijacked_by_planted_note`
- [x] 2.3 `cli.py`: tools · serve-mock-jira · run (default task, issue table) · eval — verified by `ticketagent run --model scripted [--plant]` output and `test_eval_attack_and_clean`

## 3. Integration and docs

- [x] 3.1 Mock served on :8766, agent run over MCP with `--backend mcp`; Nikasa `onboard --source http://127.0.0.1:8766/mcp` imported 12 signatures and drafted a world (drafter verb finding recorded in README)
- [x] 3.2 README: quick start, tools, mock, backends/models, double's faults, harness onboarding, env vars, limits
- [x] 3.3 `pytest -q` → 13 passed; `openspec validate --strict` clean
