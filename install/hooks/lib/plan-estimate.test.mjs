import assert from "node:assert/strict";
import test from "node:test";
import { parseFileCountFromText } from "./plan-estimate.mjs";

test("parseFileCountFromText reads digit estimates", () => {
  assert.equal(parseFileCountFromText("Plan: file count ~8 files touched"), 8);
  assert.equal(parseFileCountFromText("estimate 12 files in scope"), 12);
});

test("parseFileCountFromText reads word-number estimates", () => {
  assert.equal(parseFileCountFromText("file count: twenty files"), 20);
  assert.equal(parseFileCountFromText("estimate twenty-one files"), 21);
});

test("parseFileCountFromText returns null when absent", () => {
  assert.equal(parseFileCountFromText("no estimate here"), null);
});
