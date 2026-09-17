import assert from "node:assert/strict";
import { test } from "node:test";
import { withRetry } from "../agent/gemini.ts";

const noSleep = async () => {};
const apiError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

test("retries on 429 and returns the eventual success", async () => {
  let calls = 0;
  const r = await withRetry(async () => {
    if (++calls < 3) throw apiError(429);
    return "ok";
  }, noSleep);
  assert.equal(r, "ok");
  assert.equal(calls, 3);
});

test("rethrows non-quota errors without retrying", async () => {
  let calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw apiError(404); }, noSleep), /HTTP 404/);
  assert.equal(calls, 1);
});

test("gives up after 6 attempts", async () => {
  let calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw apiError(429); }, noSleep), /HTTP 429/);
  assert.equal(calls, 6);
});
