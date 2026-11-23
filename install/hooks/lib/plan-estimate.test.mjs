import assert from "node:assert/strict";
import test from "node:test";
import { parseFileCountFromText } from "./plan-estimate.mjs";

test("parseFileCountFromText reads a File count line", () => {
  assert.equal(parseFileCountFromText("Plan\nFile count: 4\nBlast radius: 2"), 4);
  assert.equal(parseFileCountFromText("file count: ~8"), 8);
  assert.equal(parseFileCountFromText("**File count:** 6"), 6);
});

test("parseFileCountFromText reads word numbers on a File count line", () => {
  assert.equal(parseFileCountFromText("file count: twenty files"), 20);
  assert.equal(parseFileCountFromText("File count: twenty-one"), 21);
});

test("parseFileCountFromText ignores blast radius and loose estimates", () => {
  assert.equal(parseFileCountFromText("blast radius: 2"), null);
  assert.equal(parseFileCountFromText("estimate 12 files in scope"), null);
  assert.equal(parseFileCountFromText("estimate twenty-one files"), null);
  assert.equal(parseFileCountFromText("Plan: file count ~8 files touched"), null);
  assert.equal(parseFileCountFromText("no estimate here"), null);
});
