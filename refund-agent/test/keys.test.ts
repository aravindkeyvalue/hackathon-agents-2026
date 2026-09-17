// Key gating. No keys, no network: this file must pass on a machine that has never seen an API key.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEFAULT_MODEL, providerOf, requireKey } from "../agent/agent.ts";

const saved = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = saved;
});

describe("provider selection", () => {
  it("routes claude-* to anthropic", () => {
    assert.equal(providerOf("claude-haiku-4-5"), "anthropic");
    assert.equal(providerOf(DEFAULT_MODEL), "anthropic");
  });

  it("resolves an unknown model to no provider rather than falling back to one", () => {
    assert.equal(providerOf("gpt-5"), undefined);
    assert.equal(providerOf(""), undefined);
  });
});

describe("requireKey", () => {
  it("names the missing variable instead of leaving the SDK to 401", () => {
    delete process.env.ANTHROPIC_API_KEY;
    assert.throws(() => requireKey("claude-haiku-4-5"), /ANTHROPIC_API_KEY is not set/);
  });

  it("refuses an unknown model before any key is read", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    assert.throws(() => requireKey("gpt-5"), /no known provider/);
  });

  it("returns the key on the path that runs it", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    assert.equal(requireKey("claude-haiku-4-5"), "sk-ant-test");
  });
});

describe("runAgent", () => {
  it("rejects rather than throwing synchronously, so callers can catch it", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { runAgent } = await import("../agent/agent.ts");
    const { createWorld, fixture } = await import("../world/services.ts");
    const world = createWorld({ ticketPath: fixture("tickets/ticket-clean.md") });
    await assert.rejects(runAgent("brief", world), /ANTHROPIC_API_KEY is not set/);
  });
});
