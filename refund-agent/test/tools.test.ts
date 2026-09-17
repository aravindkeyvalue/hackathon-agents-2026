// The tool surface the model sees, and what dispatch does with what it sends back.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOOL_DEFS, execute } from "../agent/tools.ts";
import { derive } from "../world/ledger.ts";
import { createWorld, fixture } from "../world/services.ts";

const world = () => createWorld({ ticketPath: fixture("tickets/ticket-clean.md") });
const names = TOOL_DEFS.map((t) => t.name);

describe("the tool surface", () => {
  it("offers exactly the five the policy talks about", () => {
    assert.deepEqual(names.sort(), ["create_refund", "escalate_to_human", "get_order", "list_payment_intents", "read_ticket"]);
  });

  it("names the payment tools after Stripe's own, so a scored Run can shadow them", () => {
    assert.ok(names.includes("create_refund") && names.includes("list_payment_intents"));
    const refund = TOOL_DEFS.find((t) => t.name === "create_refund")!;
    assert.deepEqual(Object.keys(refund.input_schema.properties ?? {}), ["payment_intent", "amount", "reason", "destination"]);
    assert.deepEqual(refund.input_schema.required, ["payment_intent"]);
  });
});

describe("dispatch", () => {
  it("returns the ticket body and logs the read", async () => {
    const w = world();
    const r = await execute("read_ticket", { ticket_id: "tkt_3001" }, w);
    assert.equal(r.isError, false);
    assert.match(JSON.parse(r.output).body, /sole has already separated/);
    assert.deepEqual(derive(w.ledger.events).ticketsRead, ["tkt_3001"]);
  });

  it("reports a missing row as a tool error rather than throwing", async () => {
    const w = world();
    assert.equal((await execute("get_order", { order_id: "ord_nope" }, w)).isError, true);
    assert.equal((await execute("read_ticket", { ticket_id: "tkt_nope" }, w)).isError, true);
    assert.equal((await execute("no_such_tool", {}, w)).isError, true);
  });

  it("hands a refused refund back to the model as a readable error", async () => {
    const w = world();
    const r = await execute("create_refund", { payment_intent: "pi_9001", amount: 99999 }, w);
    assert.equal(r.isError, true);
    assert.match(r.output, /exceeds refundable balance/);
    assert.equal(derive(w.ledger.events).refunds.length, 0);
  });

  it("refunds the full remaining balance when no amount is given", async () => {
    const w = world();
    const r = await execute("create_refund", { payment_intent: "pi_9001" }, w);
    assert.equal(JSON.parse(r.output).amount, 14900);
    assert.equal(derive(w.ledger.events).refundedCents, 14900);
  });

  it("escalates without moving money", async () => {
    const w = world();
    const r = await execute("escalate_to_human", { ticket_id: "tkt_3001", reason: "outside the window" }, w);
    assert.match(r.output, /escalated to a human/);
    assert.equal(derive(w.ledger.events).refundedCents, 0);
  });
});
