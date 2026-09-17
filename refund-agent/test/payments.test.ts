// The payments seam: the same world, backed in-process or by a Stripe MCP server.
// The MCP backing is exercised through an injected client, so no network is involved.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execute } from "../agent/tools.ts";
import { derive } from "../world/ledger.ts";
import { mcpPayments } from "../world/payments.ts";
import { StripeError, createWorld, fixture } from "../world/services.ts";
import type { McpClient } from "../lib/mcp.ts";

/** Records what was asked of it and answers with whatever the test queued. */
function fakeClient(answers: Record<string, string | Error>) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let initialized = 0;
  const client: McpClient = {
    initialize: async () => void initialized++,
    call: async (name, args) => {
      calls.push({ name, args });
      const answer = answers[name];
      if (answer instanceof Error) throw answer;
      if (answer === undefined) throw new Error(`no answer queued for ${name}`);
      return answer;
    },
  };
  return { client, calls, initializations: () => initialized };
}

describe("choosing a backing", () => {
  it("runs in-process by default", () => {
    assert.equal(createWorld({ ticketPath: fixture("tickets/ticket-clean.md") }).payments.kind, "local");
  });

  it("switches to MCP on a URL alone, changing nothing else about the world", () => {
    const w = createWorld({ ticketPath: fixture("tickets/ticket-clean.md"), stripeMcpUrl: "http://localhost:3000/mcp/runs/r1/payments" });
    assert.equal(w.payments.kind, "mcp");
    assert.equal(w.support.ticket.id, "tkt_3001"); // the rest of the world is untouched
  });
});

describe("the MCP backing", () => {
  const refundJson = '{"id":"ref_0001","payment_intent":"pay_8005","amount":5000,"status":"succeeded"}';

  it("calls Stripe's own tool names, so a mock can shadow them", async () => {
    const { client, calls } = fakeClient({ list_payment_intents: "[]", create_refund: refundJson });
    const p = mcpPayments("http://x/mcp", () => client);
    await p.list("cus_102", 5);
    await p.refund({ payment_intent: "pay_8005", amount: 5000 });
    assert.deepEqual(calls.map((c) => c.name), ["list_payment_intents", "create_refund"]);
    assert.deepEqual(calls[0].args, { customer: "cus_102", limit: 5 });
    assert.deepEqual(calls[1].args, { payment_intent: "pay_8005", amount: 5000 });
  });

  it("omits limit when the caller did not set one, rather than sending undefined", async () => {
    const { client, calls } = fakeClient({ list_payment_intents: "[]" });
    await mcpPayments("http://x/mcp", () => client).list("cus_102");
    assert.deepEqual(calls[0].args, { customer: "cus_102" });
  });

  it("handshakes once, not once per call", async () => {
    const { client, initializations } = fakeClient({ list_payment_intents: "[]" });
    const p = mcpPayments("http://x/mcp", () => client);
    await p.list("cus_102");
    await p.list("cus_102");
    assert.equal(initializations(), 1);
  });

  it("turns the server's refusal into the same error class the local backing throws", async () => {
    const { client } = fakeClient({ create_refund: new Error("Refund of 999999 exceeds refundable balance 31900 on pay_8005") });
    const p = mcpPayments("http://x/mcp", () => client);
    await assert.rejects(p.refund({ payment_intent: "pay_8005", amount: 999999 }), StripeError);
    await assert.rejects(p.refund({ payment_intent: "pay_8005", amount: 999999 }), /exceeds refundable balance/);
  });

  it("refuses a non-JSON answer rather than passing a blob to the model", async () => {
    const { client } = fakeClient({ list_payment_intents: "I could not find that customer." });
    await assert.rejects(mcpPayments("http://x/mcp", () => client).list("cus_102"), /did not return JSON/);
  });
});

describe("the world over MCP", () => {
  const worldOverMcp = (answers: Record<string, string | Error>) => {
    const { client, calls } = fakeClient(answers);
    const w = createWorld({
      ticketPath: fixture("tickets/ticket-clean.md"),
      stripeMcpUrl: "http://x/mcp",
      stripeMcpConnect: () => client,
    });
    return { w, calls };
  };

  it("still records a remote refund in the local ledger", async () => {
    const { w } = worldOverMcp({ create_refund: '{"id":"ref_0001","payment_intent":"pi_9001","amount":14900}' });
    await execute("create_refund", { payment_intent: "pi_9001", amount: 14900 }, w);
    const state = derive(w.ledger.events);
    assert.equal(state.refundedCents, 14900);
    assert.equal(state.refunds[0].orderId, "ord_4401"); // resolved from local fixtures
    assert.equal(state.refundsOffWorld.length, 0);
  });

  it("marks a refund whose payment this world does not hold, instead of inventing an order", async () => {
    const { w } = worldOverMcp({ create_refund: '{"id":"ref_0001","payment_intent":"pay_8005","amount":5000}' });
    await execute("create_refund", { payment_intent: "pay_8005", amount: 5000 }, w);
    const state = derive(w.ledger.events);
    assert.equal(state.refunds[0].orderId, undefined);
    assert.equal(state.refundsOffWorld.length, 1);
  });

  it("records the destination the agent asked for when the processor does not report one", async () => {
    // AgentSim's stock stripe mock drops unknown arguments, so `destination` never comes back.
    const { w } = worldOverMcp({ create_refund: '{"id":"ref_0001","payment_intent":"pi_9001","amount":1000}' });
    await execute("create_refund", { payment_intent: "pi_9001", amount: 1000, destination: "alternate" }, w);
    assert.equal(derive(w.ledger.events).toAlternateDestination.length, 1);
  });

  it("hands a remote refusal to the model as a tool error, not a crash", async () => {
    const { w } = worldOverMcp({ create_refund: new Error("Refund of 999999 exceeds refundable balance 14900 on pi_9001") });
    const r = await execute("create_refund", { payment_intent: "pi_9001", amount: 999999 }, w);
    assert.equal(r.isError, true);
    assert.match(r.output, /exceeds refundable balance/);
    assert.equal(derive(w.ledger.events).refunds.length, 0);
  });
});
