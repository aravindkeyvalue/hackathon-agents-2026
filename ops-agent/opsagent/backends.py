"""The agent's only way to touch Render: an MCP server, by URL.

Give it https://mcp.render.com/mcp and a Render API key and it acts on your
real workspace. Give it a mock's URL and it acts on the mock. Give it a testing
harness's per-run URL and the harness's sandbox stands in for Render. The
agent code is identical in all three cases; that is the point.
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
from typing import Any, Protocol

import httpx

from .contract import NAMES


class ToolError(Exception):
    """A tool call failed; the agent sees this as a tool result, not a crash."""


class BackendError(Exception):
    """The server is unusable (bad URL, refused auth). Fail fast."""


class Backend(Protocol):
    def tools(self) -> list[str]: ...
    def call(self, name: str, args: dict[str, Any]) -> Any: ...
    def close(self) -> None: ...


def _connect(url: str, headers: dict[str, str]):
    """Streamable-HTTP client context across MCP SDK versions."""
    from mcp.client import streamable_http as sh
    if hasattr(sh, "streamable_http_client"):
        client = httpx.AsyncClient(headers=headers, timeout=httpx.Timeout(60.0, read=300.0), follow_redirects=True)
        return sh.streamable_http_client(url, http_client=client)
    return sh.streamablehttp_client(url, headers=headers)


class McpBackend:
    """A dedicated thread owns the MCP session so the synchronous `call` works
    from sync and async callers alike (LangGraph runs tools in either)."""

    def __init__(self, url: str, token: str | None = None, timeout: float = 60.0) -> None:
        self.url, self.timeout = url, timeout
        self.headers = {"Authorization": f"Bearer {token}"} if token else {}
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._loop.run_forever, daemon=True, name="render-mcp")
        self._thread.start()
        self._ready = threading.Event()
        self._stop = asyncio.Event()
        self._error: BaseException | None = None
        self._session = None
        self._server_tools: list[str] = []
        asyncio.run_coroutine_threadsafe(self._run(), self._loop)
        self._ready.wait(timeout)
        if self._error is not None:
            self.close()
            msg = str(self._error)
            if "401" in msg or "Unauthorized" in msg:
                raise BackendError(f"MCP server at {url} refused the token (401)")
            raise BackendError(f"cannot connect to MCP server at {url}: {msg}")
        if not self._ready.is_set():
            self.close()
            raise BackendError(f"timed out connecting to MCP server at {url}")

    async def _run(self) -> None:
        from mcp import ClientSession
        try:
            async with _connect(self.url, self.headers) as (read, write, _):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    listed = await session.list_tools()
                    self._server_tools = [t.name for t in listed.tools]
                    self._session = session
                    self._ready.set()
                    await self._stop.wait()
        except BaseException as exc:  # noqa: BLE001
            inner = exc
            while getattr(inner, "exceptions", None):
                inner = inner.exceptions[0]  # type: ignore[attr-defined]
            self._error = inner
            self._ready.set()

    def server_tools(self) -> list[str]:
        return list(self._server_tools)

    def tools(self) -> list[str]:
        """Contract tools the server actually offers, in contract order."""
        offered = set(self._server_tools)
        return [n for n in NAMES if n in offered]

    def call(self, name: str, args: dict[str, Any]) -> Any:
        async def go():
            return await self._session.call_tool(name, args or {})
        res = asyncio.run_coroutine_threadsafe(go(), self._loop).result(self.timeout)
        text = "\n".join(c.text for c in res.content if getattr(c, "type", "") == "text")
        if res.isError:
            raise ToolError(text or f"{name} failed")
        sc = getattr(res, "structuredContent", None)
        if sc:
            return sc.get("result", sc) if isinstance(sc, dict) and set(sc) == {"result"} else sc
        try:
            return json.loads(text)
        except ValueError:
            return text

    def close(self) -> None:
        if self._loop.is_running():
            self._loop.call_soon_threadsafe(self._stop.set)
            self._thread.join(timeout=5)
            self._loop.call_soon_threadsafe(self._loop.stop)


def connect(url: str | None = None, token: str | None = None, *, env: dict | None = None) -> McpBackend:
    """--mcp-url / --token, else RENDER_MCP_URL / RENDER_MCP_TOKEN (a Render API key for the real server)."""
    env = os.environ if env is None else env
    url = url or env.get("RENDER_MCP_URL")
    if not url:
        raise BackendError("no Render MCP server configured: pass --mcp-url or set RENDER_MCP_URL "
                           "(real: https://mcp.render.com/mcp with RENDER_MCP_TOKEN=<Render API key>; "
                           "mock: http://127.0.0.1:8767/mcp)")
    return McpBackend(url, token or env.get("RENDER_MCP_TOKEN"))
