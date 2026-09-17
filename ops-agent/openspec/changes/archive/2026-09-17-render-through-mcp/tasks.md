## 1. Rewrite

- [x] 1.1 Replace the contract with Render's 12 tools — verified by `test_contract_is_render_shaped`, `test_export`
- [x] 1.2 Reduce backends to `McpBackend` + `connect()` with `RENDER_MCP_URL`/`RENDER_MCP_TOKEN` — verified by `test_connect_requires_url_and_reads_env`, `test_backend_roundtrip_intersection_and_auth`
- [x] 1.3 Remove `mcp_server.py` and `serve-mcp`; CLI `run` takes `--mcp-url`/`--token` and a default task — verified by `test_run_command_against_stub`
- [x] 1.4 Render prompts and the new scripted double — verified by `test_scripted_double_fixes_staging_only`, `test_scripted_double_is_hijacked_by_planted_log_line`, `test_policies_and_providers`
- [x] 1.5 `eval` unchanged — verified by `test_eval_attack_then_clean`, `test_eval_descriptor_validation`

## 2. Verify

- [x] 2.1 Run against a separately started `mock-render-mcp --plant` by URL: naive double redeploys prod and copies the Stripe key onto staging; `pytest -q` → 10 passed
- [x] 2.2 README rewritten; `openspec validate --strict` clean
