"""The agent's only way to touch Jira: a Jira MCP server, by URL.

Point it at the open-source mcp-atlassian server, at a mock (mock-jira-mcp),
or at a testing harness's per-run URL standing in for Jira — the agent code is
identical. Contract names are routed to the server's names through the alias
map when they differ.
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
from typing import Any, Protocol

import httpx

from .contract import ALIASES, NAMES


class ToolError(Exception):
    """A Jira call failed; the agent sees this as a tool result."""


class BackendError(Exception):
    """The backend itself is unusable (bad URL, refused auth). Fail fast."""


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


def tool_map(env: dict | None = None) -> dict[str, list[str]]:
    """Contract name → candidate server names. TICKETAGENT_TOOL_MAP adds/overrides."""
    env = os.environ if env is None else env
    out = {name: [name] + ALIASES.get(name, []) for name in NAMES}
    raw = env.get("TICKETAGENT_TOOL_MAP")
    if raw:
        try:
            for k, v in json.loads(raw).items():
                out.setdefault(k, [k]).insert(0, v)
        except ValueError as exc:
            raise BackendError(f"TICKETAGENT_TOOL_MAP is not valid JSON: {exc}") from exc
    return out


class McpBackend:
    """Any Jira MCP server. A dedicated thread owns the session so the
    synchronous `call` works from sync and async callers alike."""

    def __init__(self, url: str, token: str | None = None, timeout: float = 60.0, env: dict | None = None) -> None:
        self.url, self.timeout = url, timeout
        self.headers = {"Authorization": f"Bearer {token}"} if token else {}
        self._map = tool_map(env)
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._loop.run_forever, daemon=True, name="jira-mcp")
        self._thread.start()
        self._ready = threading.Event()
        self._stop = asyncio.Event()
        self._error: BaseException | None = None
        self._session = None
        self._server_tools: list[str] = []
        self.route: dict[str, str] = {}          # contract name → server name actually used
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
        offered = set(self._server_tools)
        for name, candidates in self._map.items():
            hit = next((c for c in candidates if c in offered), None)
            if hit:
                self.route[name] = hit

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
        return [n for n in NAMES if n in self.route]

    def call(self, name: str, args: dict[str, Any]) -> Any:
        target = self.route.get(name)
        if not target:
            raise ToolError(f"{name} is not offered by the connected Jira MCP server")

        async def go():
            return await self._session.call_tool(target, args or {})
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
    """--mcp-url / --token, else JIRA_MCP_URL / JIRA_MCP_TOKEN."""
    env = os.environ if env is None else env
    url = url or env.get("JIRA_MCP_URL")
    if not url:
        raise BackendError("no Jira MCP server configured: pass --mcp-url or set JIRA_MCP_URL "
                           "(mock: http://127.0.0.1:8766/mcp; or an mcp-atlassian / Atlassian MCP endpoint)")
    return McpBackend(url, token or env.get("JIRA_MCP_TOKEN"), env=env)
