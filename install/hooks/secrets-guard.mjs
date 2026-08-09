#!/usr/bin/env node
/**
 * User-level Cursor hook: deny Write/StrReplace/ApplyPatch that introduce obvious secrets.
 * Event: preToolUse
 */
import { extractEditableTexts } from "./lib/dash-guard.mjs";
import { normalizeProjectPath } from "./lib/deletion-guard.mjs";
import { resolveProjectRoot } from "./lib/entry-point-guard.mjs";
import { extractPatchText, extractPatchTouchedPaths } from "./lib/patch-guard.mjs";
import { isSecretsFixturePath, isWriteStrReplaceOrPatchTool } from "./lib/path-allowlist.mjs";
import { denySecretLeak, findSecretLeaksInTexts } from "./lib/secrets-guard.mjs";
import { isSessionActive } from "./lib/session-store.mjs";

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function allowTool() {
  process.stdout.write(JSON.stringify({ permission: "allow" }) + "\n");
  process.exit(0);
}

const input = await readInput();
const event = `${input.hook_event_name ?? ""}`;
const conversationId = `${input.conversation_id ?? input.conversationId ?? ""}`;
const toolName = `${input.tool_name ?? input.toolName ?? ""}`;

try {
  if (event && event !== "preToolUse") {
    process.stdout.write("{}\n");
    process.exit(0);
  }

  if (!isSessionActive(conversationId)) {
    allowTool();
  }

  if (!isWriteStrReplaceOrPatchTool(toolName)) {
    allowTool();
  }

  const texts = extractEditableTexts(input);
  const leaks = findSecretLeaksInTexts(texts);
  if (leaks.length === 0) {
    allowTool();
  }

  /** @type {string[]} */
  const paths = [];
  const toolInput =
    input.tool_input ?? input.toolInput ?? input.arguments ?? input.input ?? input;
  if (toolInput && typeof toolInput === "object" && typeof toolInput.path === "string") {
    paths.push(toolInput.path);
  }
  const patch = extractPatchText(input);
  if (patch) paths.push(...extractPatchTouchedPaths(patch));

  const projectRoot = resolveProjectRoot(input, paths[0] ?? ".");
  let relativePath = paths[0] ?? "(unknown)";
  try {
    if (paths[0]) relativePath = normalizeProjectPath(projectRoot, paths[0]);
  } catch {
    relativePath = `${paths[0]}`.replace(/\\/g, "/");
  }

  if (isSecretsFixturePath(relativePath)) {
    allowTool();
  }

  // If any touched path is a fixture, allow; otherwise deny.
  const allFixture =
    paths.length > 0 &&
    paths.every((p) => {
      try {
        return isSecretsFixturePath(normalizeProjectPath(projectRoot, p));
      } catch {
        return isSecretsFixturePath(p);
      }
    });
  if (allFixture) {
    allowTool();
  }

  process.stdout.write(`${JSON.stringify(denySecretLeak(leaks, relativePath))}\n`);
  process.exit(0);
} catch (err) {
  console.error(
    `Kodaelus secrets guard error: ${err instanceof Error ? err.message : "unknown"}`,
  );
  allowTool();
}

allowTool();
