import test from "node:test";
import assert from "node:assert/strict";
import {validIsoDate,validTime} from "../src/validation.js";

test("validIsoDate accepts a real past date", () => {
  assert.equal(validIsoDate("2000-02-29"), "2000-02-29");
});

test("validIsoDate rejects normalized and future dates", () => {
  assert.equal(validIsoDate("2026-02-30"), "");
  assert.equal(validIsoDate("2999-01-01"), "");
});

test("validTime requires a real 24-hour time", () => {
  assert.equal(validTime("23:59"), "23:59");
  assert.equal(validTime("24:00"), "");
  assert.equal(validTime("9:30"), "");
});
