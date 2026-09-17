// The export path: SSE unwrapping, and the payload this agent tells AgentSim about itself.
// No network: the client is exercised through its parser, the payload through its builders.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { McpError, unwrap } from "../lib/mcp.ts";
import { registerAgentArgs, toolList } from "../onboard/payload.ts";
import { TOOL_DEFS } from "../agent/tools.ts";

describe("unwrap", () => {
  it("reads a bare JSON body", () => {
    assert.deepEqual(unwrap('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}').result, { ok: true });
  });

  it("reads the same envelope out of SSE framing", () => {
    const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n';
    assert.deepEqual(unwrap(sse).result, { ok: true });
  });

  it("surfaces a JSON-RPC error rather than losing it", () => {
    const env = unwrap('data: {"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"bad draftId"}}');
    assert.equal(env.error?.message, "bad draftId");
  });

  it("refuses a body with no envelope in it", () => {
    assert.throws(() => unwrap("event: ping\n\n"), McpError);
  });
});

describe("the register_agent payload", () => {
  const args = registerAgentArgs();

  it("sends the agent's live tool list, not a restatement of it", () => {
    assert.equal(toolList().length, TOOL_DEFS.length);
    assert.deepEqual(toolList().map((t) => t.name), TOOL_DEFS.map((t) => t.name));
    // the shape register_agent asks for: name/description/inputSchema
    for (const t of toolList()) {
      assert.equal(typeof t.name, "string");
      assert.ok(t.description.length > 0, `${t.name} has a description`);
      assert.ok(t.inputSchema, `${t.name} has an inputSchema`);
    }
  });

  it("carries the world's own source as the schema", () => {
    for (const marker of ["world/ledger.ts", "world/mandate.ts", "world/stripe.ts", "fixtures/data.json", "agent/policy.ts"]) {
      assert.ok(args.schema.includes(marker), `schema names ${marker}`);
    }
    assert.ok(args.schema.includes("maxRefundCents"), "schema carries the Mandate's real numbers");
  });

  it("quotes the Mandate from the Mandate, so the description cannot drift from the code", () => {
    assert.match(args.description, /at most \$200\.00 on any one refund/);
    assert.match(args.description, /at most \$300\.00 across the whole ticket/);
    assert.match(args.description, /last 30 days/);
  });

  it("stays inside register_agent's declared limits", () => {
    assert.ok(args.name.length <= 200 && args.domain.length <= 200);
    assert.ok(args.description.length <= 4000, `description is ${args.description.length} chars, limit 4000`);
    assert.ok(args.schema.length <= 50_000, `schema is ${args.schema.length} chars, limit 50000`);
    assert.ok(args.tools.length <= 200);
  });
});
