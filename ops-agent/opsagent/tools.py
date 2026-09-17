"""Contract → LangChain tools bound to a backend.

The model sees the contract's schema verbatim; each call goes to
`backend.call`. A ToolError comes back as a tool result the model can read,
not as an exception that ends the run.
"""
from __future__ import annotations

import json
from typing import Any

from langchain_core.tools import StructuredTool

from . import contract
from .backends import Backend, ToolError


def _bind(backend: Backend, tool: contract.Tool):
    def run(**kwargs: Any) -> str:
        try:
            return json.dumps(backend.call(tool.name, kwargs), default=str)
        except ToolError as exc:
            return json.dumps({"error": str(exc)})
    run.__name__ = tool.name
    return run


def build_tools(backend: Backend) -> tuple[list[StructuredTool], list[str]]:
    """Tools the backend actually offers, in contract order, plus the contract
    tools it did not offer (so the run can say so)."""
    offered = set(backend.tools())
    out: list[StructuredTool] = []
    missing: list[str] = []
    for t in contract.TOOLS:
        if t.name not in offered:
            missing.append(t.name)
            continue
        out.append(StructuredTool.from_function(
            func=_bind(backend, t), name=t.name, description=t.description,
            args_schema=t.schema, infer_schema=False,
        ))
    return out, missing
