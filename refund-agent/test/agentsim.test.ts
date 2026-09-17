// Integration shape B: forwarding tool calls to a Run. `fetch` is stubbed, so no server is needed.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AgentSimError, fetchBrief, forwardingDispatch, runBase } from "../lib/agentsim.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** Captures each request and answers with whatever the test queued. */
function stubFetch(reply: (url: string, init?: RequestInit) => { status?: number; body: string }) {
  const seen: { url: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const { status = 200, body } = reply(url, init);
    return new Response(body, { status });
  }) as typeof fetch;
  return seen;
}

describe("run URLs", () => {
  it("builds the Run's base, tolerating a trailing slash", () => {
    assert.equal(runBase("http://localhost:3000", "run_1"), "http://localhost:3000/api/runs/run_1");
    assert.equal(runBase("http://localhost:3000/", "run_1"), "http://localhost:3000/api/runs/run_1");
  });
});

describe("fetchBrief", () => {
  it("returns the Task Brief as text", async () => {
    stubFetch(() => ({ body: "Ticket tkt_1001 has been assigned to you." }));
    assert.match(await fetchBrief("http://x", "run_1"), /tkt_1001/);
  });

  it("fails by name on an unknown Run", async () => {
    stubFetch(() => ({ status: 404, body: '{"error":"Unknown run"}' }));
    await assert.rejects(fetchBrief("http://x", "run_nope"), AgentSimError);
  });
});

describe("forwardingDispatch", () => {
  it("posts the agent's own tool name and input to the Run's call endpoint", async () => {
    const seen = stubFetch(() => ({ body: '{"ok":true,"result":"{\\"id\\":\\"re_1\\"}"}' }));
    const dispatch = forwardingDispatch("http://x", "run_1");
    const r = await dispatch("create_refund", { payment_intent: "pay_7003" }, "msg_abc");
    assert.equal(r.isError, false);
    assert.match(r.output, /re_1/);
    assert.equal(seen[0].url, "http://x/api/runs/run_1/call");
    assert.deepEqual(seen[0].body, { tool: "create_refund", input: { payment_intent: "pay_7003" }, callId: "call_1", batchId: "msg_abc" });
  });

  it("groups a turn's calls under one batchId and numbers each call", async () => {
    const seen = stubFetch(() => ({ body: '{"ok":true,"result":"{}"}' }));
    const dispatch = forwardingDispatch("http://x", "run_1");
    await dispatch("get_order", {}, "msg_1");
    await dispatch("list_payment_intents", {}, "msg_1");
    assert.deepEqual(seen.map((s) => (s.body as { callId: string }).callId), ["call_1", "call_2"]);
    assert.deepEqual(new Set(seen.map((s) => (s.body as { batchId: string }).batchId)), new Set(["msg_1"]));
  });

  it("turns a refused call into a tool error the model can read, not a throw", async () => {
    stubFetch(() => ({ body: '{"ok":false,"error":"Refund of 99999 exceeds refundable balance 4999 on pay_7003"}' }));
    const r = await forwardingDispatch("http://x", "run_1")("create_refund", {}, "msg_1");
    assert.equal(r.isError, true);
    assert.match(r.output, /exceeds refundable balance/);
  });

  it("raises a finished or unknown Run as a setup error, since the model cannot recover from it", async () => {
    stubFetch(() => ({ status: 409, body: '{"error":"Run run_1 has finished"}' }));
    await assert.rejects(forwardingDispatch("http://x", "run_1")("get_order", {}, "msg_1"), AgentSimError);
  });
});
