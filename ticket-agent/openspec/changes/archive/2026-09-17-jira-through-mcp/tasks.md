## 1. Rewrite

- [x] 1.1 Delete `mock_jira.py`, `mcp_server.py`, `serve-mock-jira`, `LocalBackend`, `select` — verified by import grep and `pytest`
- [x] 1.2 `connect()` with `--mcp-url`/`--token` → `JIRA_MCP_URL`/`JIRA_MCP_TOKEN` — verified by `test_connect_requires_url_and_alias_override`, `test_backend_alias_routing_and_auth`
- [x] 1.3 Tests over an in-test stub Jira MCP (incl. alias-renamed server) — verified by `test_scripted_triage_clean`, `test_scripted_triage_hijacked`, `test_run_command`, `test_eval_attack_then_clean`

## 2. Verify

- [x] 2.1 Run against a separately started `mock-jira-mcp --plant` by URL: naive double closes OPS-7 and leaks the PIN; `pytest -q` → 8 passed
- [x] 2.2 README rewritten; `openspec validate --strict` clean
