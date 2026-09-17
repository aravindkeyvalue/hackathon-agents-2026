"""The mock Jira as an MCP server (streamable HTTP, stateless, JSON responses).

tools/list returns the contract's schemas verbatim; tools/call runs the mock
engine. A minimal client that only sends `Accept: application/json` gets plain
JSON-RPC back; the official client works too. Optional bearer.
"""
from __future__ import annotations

import contextlib
import json
import os
from collections.abc import AsyncIterator
from typing import Any

import mcp.types as types
from mcp.server.lowlevel import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Mount
from starlette.types import ASGIApp, Receive, Scope, Send

from . import contract
from .engine import JiraError, MockJira

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8766
PATH = "/mcp"


def build_server(jira: MockJira) -> Server:
    server: Server = Server("mock-jira", instructions="Mock Jira Cloud: one project (OPS), a handful of issues, "
                                                      "a To Do → In Progress → Done workflow.")

    @server.list_tools()
    async def _list() -> list[types.Tool]:
        return [types.Tool(name=t.name, description=t.description, inputSchema=t.schema,
                           annotations=types.ToolAnnotations(readOnlyHint=(t.effect == "read"),
                                                             destructiveHint=(t.effect == "destructive")))
                for t in contract.TOOLS]

    @server.call_tool()
    async def _call(name: str, arguments: dict[str, Any]) -> types.CallToolResult:
        if name not in contract.BY_NAME:
            return types.CallToolResult(content=[types.TextContent(type="text", text=f"unknown tool {name!r}")],
                                        isError=True)
        try:
            result = jira.call(name, arguments or {})
        except JiraError as exc:
            return types.CallToolResult(content=[types.TextContent(type="text", text=str(exc))], isError=True)
        structured = result if isinstance(result, dict) else {"result": result}
        return types.CallToolResult(content=[types.TextContent(type="text", text=json.dumps(result, default=str))],
                                    structuredContent=structured)

    return server


class BearerGuard:
    def __init__(self, app: ASGIApp, token: str | None) -> None:
        self.app, self.token = app, token

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self.token and scope["type"] == "http":
            headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
            if headers.get("authorization") != f"Bearer {self.token}":
                await JSONResponse({"error": "bearer token required"}, status_code=401)(scope, receive, send)
                return
        await self.app(scope, receive, send)


def build_app(jira: MockJira, token: str | None = None) -> ASGIApp:
    manager = StreamableHTTPSessionManager(app=build_server(jira), json_response=True, stateless=True)

    @contextlib.asynccontextmanager
    async def lifespan(_: Starlette) -> AsyncIterator[None]:
        async with manager.run():
            yield

    async def handle(scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["path"].rstrip("/") != PATH:
            await JSONResponse({"error": f"not found; MCP endpoint is {PATH}"}, status_code=404)(scope, receive, send)
            return
        await manager.handle_request(scope, receive, send)

    return BearerGuard(Starlette(routes=[Mount("/", app=handle)], lifespan=lifespan), token)


def serve(jira: MockJira, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, token: str | None = None) -> None:
    import uvicorn
    token = token if token is not None else os.environ.get("MOCK_JIRA_TOKEN")
    print(f"mock Jira MCP · http://{host}:{port}{PATH} · {len(contract.TOOLS)} tools · "
          f"{len(jira.issues)} issues · bearer {'required' if token else 'off'}", flush=True)
    uvicorn.run(build_app(jira, token), host=host, port=port, log_level="warning")
