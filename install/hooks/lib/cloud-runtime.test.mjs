import assert from "node:assert/strict";
import test from "node:test";
import { isCloudDeliveryRuntime, isCloudOrHeadlessRuntime } from "./cloud-runtime.mjs";

test("KODAELUS_CLOUD_DELIVERY=0 forces IDE semantics", () => {
  const env = { CURSOR_AGENT: "1", KODAELUS_CLOUD_DELIVERY: "0" };
  assert.equal(isCloudOrHeadlessRuntime(env), false);
  assert.equal(isCloudDeliveryRuntime(env), false);
});

test("KODAELUS_CLOUD_DELIVERY=1 enables cloudDelivery", () => {
  const env = { KODAELUS_CLOUD_DELIVERY: "1" };
  assert.equal(isCloudOrHeadlessRuntime(env), true);
  assert.equal(isCloudDeliveryRuntime(env), true);
});

test("CURSOR_AGENT=1 without override is headless/cloud", () => {
  assert.equal(isCloudOrHeadlessRuntime({ CURSOR_AGENT: "1" }), true);
  assert.equal(isCloudOrHeadlessRuntime({}), false);
});
