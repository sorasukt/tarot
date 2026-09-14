import test from "node:test";
import assert from "node:assert/strict";
import { safeReturnTo } from "../src/auth-web.js";

const fallback = "https://sorasukt.com/tarot/";

test("PangTang production login returns to PangTang", () => {
  assert.equal(
    safeReturnTo("https://pangtang.sorasukt.com/settings"),
    "https://pangtang.sorasukt.com/settings",
  );
});

test("PangTang pull request previews are allowed", () => {
  assert.equal(
    safeReturnTo("https://pr-8.pangtang.pages.dev/?payment=success"),
    "https://pr-8.pangtang.pages.dev/?payment=success",
  );
});

test("the misspelled and unrelated domains fail closed", () => {
  assert.equal(
    safeReturnTo("https://pangtag.sorasukt.com/"),
    fallback,
  );
  assert.equal(
    safeReturnTo("https://pangtang.pages.dev.evil.example/"),
    fallback,
  );
  assert.equal(
    safeReturnTo("https://evil.example/?next=https://pangtang.sorasukt.com"),
    fallback,
  );
});

test("Tarot return URLs remain supported", () => {
  assert.equal(
    safeReturnTo("https://sorasukt.com/tarot/my/"),
    "https://sorasukt.com/tarot/my/",
  );
});
