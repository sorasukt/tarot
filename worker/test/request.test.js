import test from "node:test";
import assert from "node:assert/strict";
import {readJsonBody,RequestBodyError} from "../src/request.js";

test("readJsonBody parses a bounded JSON body", async () => {
  const request = new Request("https://api.example.test", { method: "POST", body: JSON.stringify({ ok: true }) });
  assert.deepEqual(await readJsonBody(request, 128), { ok: true });
});

test("readJsonBody rejects a streamed body that exceeds the limit", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ value: "x".repeat(128) }));
  const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
  const request = new Request("https://api.example.test", { method: "POST", body: stream, duplex: "half" });
  await assert.rejects(() => readJsonBody(request, 32), error => error instanceof RequestBodyError && error.status === 413);
});

test("readJsonBody rejects malformed JSON", async () => {
  const request = new Request("https://api.example.test", { method: "POST", body: "not-json" });
  await assert.rejects(() => readJsonBody(request, 128), error => error instanceof RequestBodyError && error.status === 400);
});
