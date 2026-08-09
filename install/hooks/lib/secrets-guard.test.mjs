import assert from "node:assert/strict";
import test from "node:test";
import {
  denySecretLeak,
  findSecretLeaks,
  findSecretLeaksInTexts,
} from "./secrets-guard.mjs";

test("findSecretLeaks detects private key blocks", () => {
  const text = [
    "-----BEGIN PRIVATE KEY-----",
    "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7",
    "-----END PRIVATE KEY-----",
  ].join("\n");
  const hits = findSecretLeaks(text);
  assert.ok(hits.some((h) => h.kind === "private_key_block"));
});

test("findSecretLeaks detects API key assignment and tokens", () => {
  assert.ok(findSecretLeaks('api_key: "sk-abcdefghijklmnopqrstuvwxyz12"').length > 0);
  assert.ok(findSecretLeaks("CURSOR_API_KEY=sk-abcdefghijklmnopqrstuv").length > 0);
  assert.ok(findSecretLeaks("token ghp_abcdefghijklmnopqrstuvwxyz1234").length > 0);
});

test("findSecretLeaks ignores benign config", () => {
  assert.equal(findSecretLeaks("export const MAX = 10;\n").length, 0);
  assert.equal(findSecretLeaksInTexts(["hello", "world"]).length, 0);
});

test("denySecretLeak shapes deny payload", () => {
  const denial = denySecretLeak([{ kind: "obvious_token", snippet: "x" }], "src/a.ts");
  assert.equal(denial.permission, "deny");
  assert.match(denial.user_message, /secrets guard/i);
});
