import test from "node:test";
import assert from "node:assert/strict";
import {enforceAiRateLimit} from "../src/rate-limit.js";

test("enforceAiRateLimit uses an authenticated actor key", async () => {
  let key = "";
  const env = { AI_RATE_LIMITER: { async limit(input) { key = input.key; return { success: true }; } } };
  const result = await enforceAiRateLimit(new Request("https://api.example.test"), env, "auth0|member");
  assert.equal(result.allowed, true);
  assert.equal(key, "sorasukt-api:user:auth0|member");
});

test("enforceAiRateLimit returns 429 after the quota is exhausted", async () => {
  const env = { AI_RATE_LIMITER: { async limit() { return { success: false }; } } };
  const result = await enforceAiRateLimit(new Request("https://api.example.test"), env);
  assert.equal(result.allowed, false);
  assert.equal(result.status, 429);
  assert.equal(result.retryAfter, 60);
});
