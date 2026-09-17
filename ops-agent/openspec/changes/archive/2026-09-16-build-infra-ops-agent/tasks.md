## 1. Project skeleton

- [x] 1.1 Create `infra-agent/pyproject.toml` (package `opsagent`, script `opsagent`, dependencies and `anthropic`/`openai` extras) and verify `uv sync` completes and `opsagent --help` runs
- [x] 1.2 Create `opsagent/__init__.py` and `opsagent/cli.py` with `tools`, `run`, `serve-mcp`, `eval` subcommands stubbed, and verify each prints its help

## 2. Tool contract

- [x] 2.1 Write `opsagent/contract.py` with the thirteen `Tool` entries (schemas, required lists, effects, "irreversible" in `delete_volume`) and verify `tests/test_contract.py` asserts names, schema shape and effects
- [x] 2.2 Implement `opsagent tools --json` and verify the output parses with a thirteen-entry `tools` array

## 3. Backends

- [x] 3.1 Write `opsagent/backends.py`: `Backend` protocol, `ToolError`, `LocalBackend` with the seeded inventory and all thirteen operations, and verify `tests/test_local_backend.py` (purge changes volume, unknown id raises, stop/restart, ticket create, resolve)
- [x] 3.2 Add `HttpBackend` and verify a test with a stub HTTP server receives `POST /tools/get_host` with the JSON body and bearer header
- [x] 3.3 Add `McpBackend` over the official `mcp` streamable-HTTP client (discover tools, `tools/call`, 401 → auth error) and verify against the project's own MCP server in a test
- [x] 3.4 Implement backend selection (`--backend` → `OPSAGENT_BACKEND` → `local`; missing URL fails naming the variable) and verify unit tests for each branch

## 4. MCP tool server

- [x] 4.1 Write `opsagent/mcp_server.py` (low-level `Server`, `list_tools` from contract, `call_tool` → backend, `StreamableHTTPSessionManager(stateless=True, json_response=True)`, Starlette app, bearer middleware) and verify `opsagent serve-mcp` starts on 8765
- [x] 4.2 Verify the minimal-client test: raw `urllib` POST of `initialize` then `tools/list` with only `Accept: application/json` returns thirteen tools with schemas equal to the contract
- [x] 4.3 Verify the standard-client test: official `mcp` client `list_tools()` and a `call_tool("list_alerts", {"status": "open"})` return the same tools and the inventory's open alert
- [x] 4.4 Verify the token test: with `OPSAGENT_SERVE_TOKEN` set, a wrong bearer gets 401 and the right one succeeds

## 5. Agent runtime

- [x] 5.1 Write `opsagent/tools.py` (contract → LangChain `StructuredTool`s calling the backend, intersected with `backend.tools()`) and verify a unit test that a tool call reaches the backend with parsed arguments
- [x] 5.2 Write `opsagent/agent.py`: prompts for `naive`/`hardened`, `build_agent(model, tools, policy)` with `create_agent`/`create_react_agent` fallback, `init_chat_model` from `--model`/`OPSAGENT_MODEL`, and `ScriptedOpsModel`; verify the "only the prompt differs" test and the no-model error message test
- [x] 5.3 Implement `opsagent run` (streams tool calls, prints final message, `--max-steps`) and verify `opsagent run --model scripted "Clear the disk alert on staging-app-01"` on the local backend exits 0 and shows purge → ticket → resolve

## 6. Harness eval

- [x] 6.1 Implement `opsagent eval` (`--run-file`/`--run-json`/`--open-url`+`--scenario`+`--attack`+`--trial`, descriptor validation, `McpBackend` for the run, POST to `finish_url`, grade printout, exit code, `--k`) and verify unit tests with a stub harness that serves `/runs`, an MCP endpoint and `finish_url`
- [x] 6.2 Run the real integration once against a running harness instance: `opsagent eval --model scripted --open-url http://127.0.0.1:8900/runs --scenario wrong_item_reship --attack` and verify a grade is printed (tools intersect to what that world offers; the run header lists the contract tools the server did not provide)

## 7. Documentation and verification

- [x] 7.1 Write `infra-agent/README.md`: quick start (`uv sync`, `opsagent run`), exposing the MCP server, backends and env vars, the harness onboarding sequence (serve-mcp → harness imports signatures from `http://…:8765/mcp` → harness builds its world → `opsagent eval --open-url …`), and the test-double disclaimer; verify every env var in the code appears in the README
- [x] 7.2 Run `uv run pytest -q` and verify all tests pass; run `openspec validate build-infra-ops-agent --strict` and verify no errors
