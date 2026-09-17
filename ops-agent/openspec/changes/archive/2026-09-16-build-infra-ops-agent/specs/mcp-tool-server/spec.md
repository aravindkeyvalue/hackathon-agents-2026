## Purpose

Exposes the agent's tools as an MCP server so any client — an importer pulling signatures, another agent, a desktop MCP host — can list and call them over HTTP.

## ADDED Requirements

### Requirement: Serves the contract over streamable HTTP
`opsagent serve-mcp` SHALL start an MCP server on `--host/--port` (default `127.0.0.1:8765`) at path `/mcp` using the streamable HTTP transport with JSON responses enabled and stateless operation, so a client that only sends `Accept: application/json` and no session id receives plain JSON-RPC replies. `tools/list` SHALL return every contract tool with its name, description and `inputSchema` unchanged.

#### Scenario: Minimal client lists tools
- **WHEN** a client POSTs `initialize` then `tools/list` to `/mcp` with `Accept: application/json` and no `Mcp-Session-Id`
- **THEN** both return JSON-RPC results and the list has thirteen tools with schemas equal to the contract's

#### Scenario: Standard client lists tools
- **WHEN** the official MCP Python client connects with the streamable HTTP transport
- **THEN** `list_tools()` returns the same thirteen tools

### Requirement: Calls execute against the active backend
`tools/call` SHALL run the named tool through the server's configured backend (selected as in tool-backends) and return the result as JSON text content; a `ToolError` SHALL be returned as an MCP tool error result, not a transport error.

#### Scenario: Call over MCP
- **WHEN** a client calls `list_alerts` with `{"status": "open"}` against the local backend
- **THEN** the content is the JSON list of open alerts from the inventory

### Requirement: Optional bearer token
When `OPSAGENT_SERVE_TOKEN` is set, the server SHALL reject requests without `Authorization: Bearer <token>` with HTTP 401; when unset it SHALL accept all requests.

#### Scenario: Wrong token
- **WHEN** the token is set and a request carries a different bearer
- **THEN** the response is 401 and no JSON-RPC body is processed
