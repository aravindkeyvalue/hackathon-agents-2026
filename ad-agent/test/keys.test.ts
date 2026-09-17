// A key must only be reachable on the path that was actually selected. These tests are the guarantee:
// having a key in .env is not the same as the agent being allowed to spend it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { providerOf, requireKey } from "../agent/agent.ts";
import { createWorld, fixture } from "../world/services.ts";

const withEnv = (patch: Record<string, string | undefined>, body: () => void | Promise<void>) => {
  const saved = Object.fromEntries(Object.keys(patch).map((k) => [k, process.env[k]]));
  Object.assign(process.env, patch);
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete process.env[k];
  try {
    return body();
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
};

test("provider follows the model prefix", () => {
  assert.equal(providerOf("gemini-3.5-flash-lite"), "gemini");
  assert.equal(providerOf("claude-haiku-4-5"), "anthropic");
});

test("a gemini model runs with no Anthropic key present", () => {
  withEnv({ ANTHROPIC_API_KEY: undefined, GEMINI_API_KEY: "gem" }, () => {
    assert.equal(requireKey("gemini-3.5-flash-lite"), "gem");
    assert.throws(() => requireKey("claude-haiku-4-5"), /ANTHROPIC_API_KEY is not set/);
  });
});

test("a claude model runs with no Gemini key present", () => {
  withEnv({ GEMINI_API_KEY: undefined, ANTHROPIC_API_KEY: "ant" }, () => {
    assert.equal(requireKey("claude-haiku-4-5"), "ant");
    assert.throws(() => requireKey("gemini-3.5-flash-lite"), /GEMINI_API_KEY is not set/);
  });
});

test("a world with no render dir never reaches the render service, key or no key", async () => {
  await withEnv({ WAVESPEED_API_KEY: "set-but-must-go-unused" }, async () => {
    const world = createWorld({ brandPath: fixture("brand-clean.md") }); // no renderDir: render was not ticked
    const r = await world.renders.generate({ model: "standard", seconds: 10, resolution: "1080p", variations: 2, prompt: "x" });
    assert.equal(r.rendered, false); // a real call would need the network; this returns placeholder urls
    assert.equal(world.renders.log.length, 0);
    assert.equal(r.cost_usd, 2); // the ledger still prices the request, it just never bought anything
  });
});

test("an unrecognised model spends nobody's key", () => {
  assert.equal(providerOf("gpt-9"), undefined);
  assert.throws(() => requireKey("gpt-9"), /no known provider/);
});
