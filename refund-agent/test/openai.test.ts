// The OpenAI provider's own seams: how tool schemas cross over, and how bad arguments are handled.
// No network: the loop's helpers are exercised directly.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArguments, tools } from "../agent/openai.ts";
import { TOOL_DEFS } from "../agent/tools.ts";

describe("tool schemas crossing to OpenAI", () => {
  it("carries every tool over as a function, keeping the JSON Schema as-is", () => {
    assert.equal(tools.length, TOOL_DEFS.length);
    for (const [i, t] of tools.entries()) {
      assert.equal(t.type, "function");
      assert.equal(t.function.name, TOOL_DEFS[i].name);
      assert.equal(t.function.description, TOOL_DEFS[i].description);
      assert.deepEqual(t.function.parameters, TOOL_DEFS[i].input_schema);
    }
  });

  it("keeps create_refund's required field, so the model cannot omit the payment", () => {
    const refund = tools.find((t) => t.function.name === "create_refund")!;
    assert.deepEqual((refund.function.parameters as { required: string[] }).required, ["payment_intent"]);
  });
});

describe("parseArguments", () => {
  it("reads a normal arguments object", () => {
    assert.deepEqual(parseArguments('{"payment_intent":"pi_9001","amount":14900}'), {
      input: { payment_intent: "pi_9001", amount: 14900 },
    });
  });

  it("treats empty arguments as no arguments, not as an error", () => {
    assert.deepEqual(parseArguments(""), { input: {} });
    assert.deepEqual(parseArguments("   "), { input: {} });
  });

  it("turns malformed JSON into a tool error the model can correct", () => {
    const r = parseArguments('{"payment_intent": ');
    assert.deepEqual(r.input, {});
    assert.match(r.error!, /not valid JSON/);
  });

  it("rejects a JSON value that is not an object", () => {
    assert.match(parseArguments('"pi_9001"').error!, /must be a JSON object/);
    assert.match(parseArguments("[1,2]").error!, /must be a JSON object/);
    assert.match(parseArguments("null").error!, /must be a JSON object/);
  });
});
