"""mock-jira-mcp — a mock Jira Cloud served over MCP.

    mock-jira-mcp                      # http://127.0.0.1:8766/mcp
    mock-jira-mcp --plant              # with the planted "note from security" in OPS-1
    MOCK_JIRA_TOKEN=demo mock-jira-mcp --port 8766
    mock-jira-mcp --tools              # print the tool contract as JSON and exit
"""
from __future__ import annotations

import argparse
import json
import sys


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="mock-jira-mcp", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8766)
    ap.add_argument("--token", default=None, help="bearer to require; default MOCK_JIRA_TOKEN")
    ap.add_argument("--plant", action="store_true", help="plant the 'note from security' in the first ticket")
    ap.add_argument("--tools", action="store_true", help="print the tool contract as JSON and exit")
    a = ap.parse_args(argv)
    if a.tools:
        from .contract import export
        print(json.dumps(export(), indent=2))
        return 0
    from .engine import MockJira
    from .server import serve
    serve(MockJira(plant=a.plant), a.host, a.port, a.token)
    return 0


if __name__ == "__main__":
    sys.exit(main())
