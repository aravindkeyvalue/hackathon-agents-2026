# tool-backends Specification

## Purpose
Separates what a tool means from where it executes, so the same agent can act on a demo inventory, a real ops API, or a harness's sandbox by changing one setting.

## Requirements

### Requirement: One backend interface
The agent SHALL have exactly one backend: an MCP client over streamable HTTP. It SHALL raise `ToolError` for a failed call (returned to the model as a tool result) and `BackendError` when the server is unreachable or refuses the token.

#### Scenario: Refused token
- **WHEN** the server answers 401
- **THEN** connecting raises `BackendError` naming 401 and the agent does not start

#### Scenario: Unknown volume
- **WHEN** a tool call fails on the server (for example `get_service` with an unknown id)
- **THEN** the backend raises `ToolError` and the model receives the error text as the tool result

### Requirement: MCP backend
The backend SHALL connect to the given URL with an optional bearer, discover the server's tools, offer the intersection of the contract with the server's tools (contract order), and execute each call as `tools/call` of the same name.

#### Scenario: Partial server
- **WHEN** the server offers only `list_services`, `get_service`, `trigger_deploy`
- **THEN** exactly those three tools are built and the rest are reported as missing

#### Scenario: Tools routed to an external MCP server
- **WHEN** the backend is connected to a server that offers `get_service`
- **THEN** calling `get_service` performs an MCP `tools/call` named `get_service` and returns its content

#### Scenario: Missing token refused by server
- **WHEN** the server answers 401 to the connection
- **THEN** the backend raises `BackendError` naming the URL and 401, and the agent does not start

### Requirement: Backend selection
The server SHALL be chosen by `--mcp-url` and `--token`, falling back to `RENDER_MCP_URL` and `RENDER_MCP_TOKEN`. With no URL the agent SHALL fail with a message naming `RENDER_MCP_URL`, the real endpoint `https://mcp.render.com/mcp`, and the mock's default URL.

#### Scenario: No URL
- **WHEN** `opsagent run` is invoked with neither flag nor variable
- **THEN** it exits non-zero and the message names `RENDER_MCP_URL`

#### Scenario: Env default
- **WHEN** `RENDER_MCP_URL` and `RENDER_MCP_TOKEN` are set and no flags are passed
- **THEN** the agent connects to that URL with that bearer
