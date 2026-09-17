"""The Jira tool contract this mock serves.

Names and shapes follow the widely used open-source `mcp-atlassian` server
(`jira_search`, `jira_get_issue`, …), so an agent written against that server
works against this mock by changing one URL.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

Effect = Literal["read", "write", "destructive"]


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    schema: dict[str, Any]
    effect: Effect = "read"

    @property
    def required(self) -> list[str]:
        return list(self.schema.get("required") or [])

    @property
    def params(self) -> dict[str, dict]:
        return dict(self.schema.get("properties") or {})

    def as_json(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description,
                "inputSchema": self.schema, "effect": self.effect}


def _obj(props: dict[str, dict], required: list[str]) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": required, "additionalProperties": False}


_KEY = {"type": "string", "description": "Issue key, e.g. OPS-12."}
_STR = lambda d: {"type": "string", "description": d}  # noqa: E731

TOOLS: list[Tool] = [
    # ------------------------------------------------------------ reads
    Tool("jira_search", "Search issues with JQL. Returns key, summary, status, priority, assignee, issue type, labels.",
         _obj({"jql": _STR("JQL query, e.g. project = OPS AND status = 'To Do' ORDER BY created ASC"),
               "max_results": {"type": "integer", "minimum": 1, "maximum": 50, "description": "Default 20."}},
              ["jql"])),
    Tool("jira_get_issue", "Get one issue in full: fields, description, comments, links.",
         _obj({"issue_key": _KEY}, ["issue_key"])),
    Tool("jira_get_transitions", "List the transitions currently available for an issue.",
         _obj({"issue_key": _KEY}, ["issue_key"])),
    Tool("jira_get_all_projects", "List projects visible to the agent.", _obj({}, [])),
    Tool("jira_get_user_profile", "Look up a user by account id or email.",
         _obj({"user_identifier": _STR("Account id or email address.")}, ["user_identifier"])),
    # ------------------------------------------------------------ writes
    Tool("jira_create_issue", "Create an issue.",
         _obj({"project_key": _STR("Project key, e.g. OPS."),
               "summary": _STR("One-line summary."),
               "issue_type": {"type": "string", "enum": ["Bug", "Task", "Incident", "Story"]},
               "description": _STR("Full description (optional)."),
               "priority": {"type": "string", "enum": ["Lowest", "Low", "Medium", "High", "Highest"]},
               "assignee": _STR("Account id or email of the assignee (optional).")},
              ["project_key", "summary", "issue_type"]), "write"),
    Tool("jira_update_issue", "Update fields on an issue. Only the fields given are changed.",
         _obj({"issue_key": _KEY,
               "summary": _STR("New summary."),
               "description": _STR("New description."),
               "priority": {"type": "string", "enum": ["Lowest", "Low", "Medium", "High", "Highest"]},
               "labels": {"type": "array", "items": {"type": "string"}, "description": "Replace the label set."}},
              ["issue_key"]), "write"),
    Tool("jira_assign_issue", "Assign an issue to a user (account id or email), or unassign with an empty string.",
         _obj({"issue_key": _KEY, "assignee": _STR("Account id, email, or '' to unassign.")},
              ["issue_key", "assignee"]), "write"),
    Tool("jira_add_comment", "Add a comment to an issue. Comments are visible to everyone who can see the issue.",
         _obj({"issue_key": _KEY, "body": _STR("Comment text.")}, ["issue_key", "body"]), "write"),
    Tool("jira_transition_issue", "Move an issue to another status by transition name (see jira_get_transitions).",
         _obj({"issue_key": _KEY, "transition": _STR("Transition name, e.g. 'Start progress', 'Done'."),
               "comment": _STR("Optional comment to add with the transition.")},
              ["issue_key", "transition"]), "write"),
    Tool("jira_create_issue_link", "Link two issues (Duplicate, Blocks, Relates).",
         _obj({"inward_key": _KEY, "outward_key": _KEY,
               "link_type": {"type": "string", "enum": ["Duplicate", "Blocks", "Relates"]}},
              ["inward_key", "outward_key", "link_type"]), "write"),
    Tool("jira_delete_issue", "Permanently delete an issue. Irreversible; ask for approval first.",
         _obj({"issue_key": _KEY}, ["issue_key"]), "destructive"),
]

BY_NAME: dict[str, Tool] = {t.name: t for t in TOOLS}
NAMES: list[str] = [t.name for t in TOOLS]

def export() -> dict[str, Any]:
    return {"tools": [t.as_json() for t in TOOLS]}
