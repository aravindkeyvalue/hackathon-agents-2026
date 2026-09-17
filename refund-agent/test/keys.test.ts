// Key gating. No keys, no network: this file must pass on a machine that has never seen an API key.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEFAULT_MODEL, providerOf, requireKey } from "../agent/agent.ts";

const saved = { anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY };
const restore = (name: "ANTHROPIC_API_KEY" | "OPENAI_API_KEY", value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};
afterEach(() => {
  restore("ANTHROPIC_API_KEY", saved.anthropic);
  restore("OPENAI_API_KEY", saved.openai);
});

describe("provider selection", () => {
  it("routes claude-* to anthropic", () => {
    assert.equal(providerOf("claude-haiku-4-5"), "anthropic");
    assert.equal(providerOf(DEFAULT_MODEL), "anthropic");
  });

  it("routes gpt-* and the o-series to openai", () => {
    assert.equal(providerOf("gpt-5"), "openai");
    assert.equal(providerOf("gpt-4.1-mini"), "openai");
    assert.equal(providerOf("o3"), "openai");
    assert.equal(providerOf("o4-mini"), "openai");
  });

  it("resolves an unknown model to no provider rather than falling back to one", () => {
    assert.equal(providerOf("gemini-2.5-pro"), undefined);
    assert.equal(providerOf("llama-3"), undefined);
    assert.equal(providerOf(""), undefined);
    // a bare leading 'o' is not the o-series, so it must not be captured by it
    assert.equal(providerOf("opus"), undefined);
  });
});

describe("requireKey", () => {
  it("names the missing variable instead of leaving the SDK to 401", () => {
    delete process.env.ANTHROPIC_API_KEY;
    assert.throws(() => requireKey("claude-haiku-4-5"), /ANTHROPIC_API_KEY is not set/);
  });

  it("names the missing OpenAI variable the same way", () => {
    delete process.env.OPENAI_API_KEY;
    assert.throws(() => requireKey("gpt-5"), /OPENAI_API_KEY is not set/);
  });

  it("refuses an unknown model before any key is read", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-test";
    assert.throws(() => requireKey("gemini-2.5-pro"), /no known provider; expected a claude-\*, gpt-\* or o-series model/);
  });

  it("returns the key on the path that runs it", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-test";
    assert.equal(requireKey("claude-haiku-4-5"), "sk-ant-test");
    assert.equal(requireKey("gpt-5"), "sk-test");
  });

  it("reads only the key for the provider that was selected", () => {
    // running OpenAI must not require, or touch, the Anthropic key
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    assert.equal(requireKey("gpt-5"), "sk-test");

    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    assert.equal(requireKey("claude-haiku-4-5"), "sk-ant-test");
  });
});

describe("runAgent", () => {
  it("rejects rather than throwing synchronously, so callers can catch it", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { runAgent } = await import("../agent/agent.ts");
    const { localDispatch } = await import("../agent/dispatch.ts");
    const { createWorld, fixture } = await import("../world/services.ts");
    const world = createWorld({ ticketPath: fixture("tickets/ticket-clean.md") });
    await assert.rejects(runAgent("brief", localDispatch(world)), /ANTHROPIC_API_KEY is not set/);
  });

  // An empty brief is what AgentSim's bridge-probe POSTs, and what a Run with a blank Task Brief
  // fetches. Both providers answer it with a 400, so it has to be refused before the key is read.
  it("rejects an empty brief by name, ahead of the key check", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const { runAgent } = await import("../agent/agent.ts");
    const { localDispatch } = await import("../agent/dispatch.ts");
    const { createWorld, fixture } = await import("../world/services.ts");
    const world = createWorld({ ticketPath: fixture("tickets/ticket-clean.md") });
    for (const empty of ["", "   ", "\n\t "]) {
      await assert.rejects(runAgent(empty, localDispatch(world)), /empty brief/);
    }
    // ...and it beats the key check, so a keyless probe says what is wrong rather than what is unset
    delete process.env.ANTHROPIC_API_KEY;
    await assert.rejects(runAgent("", localDispatch(world)), /empty brief/);
  });
});
