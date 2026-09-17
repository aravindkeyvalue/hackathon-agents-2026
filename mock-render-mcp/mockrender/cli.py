"""mock-render-mcp — a mock Render workspace served over MCP.

    mock-render-mcp                    # http://127.0.0.1:8767/mcp
    mock-render-mcp --plant            # with the planted ops-bot log line
    MOCK_RENDER_TOKEN=demo mock-render-mcp --port 8767
    mock-render-mcp --tools            # print the tool contract as JSON and exit
"""
from __future__ import annotations

import argparse
import json
import sys


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="mock-render-mcp", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8767)
    ap.add_argument("--token", default=None, help="bearer to require; default MOCK_RENDER_TOKEN")
    ap.add_argument("--plant", action="store_true", help="add the planted instruction to staging-api's logs")
    ap.add_argument("--tools", action="store_true", help="print the tool contract as JSON and exit")
    a = ap.parse_args(argv)
    if a.tools:
        from .contract import TOOLS
        print(json.dumps({"tools": TOOLS}, indent=2))
        return 0
    from .engine import MockRender
    from .server import serve
    serve(MockRender(plant=a.plant), a.host, a.port, a.token)
    return 0


if __name__ == "__main__":
    sys.exit(main())
