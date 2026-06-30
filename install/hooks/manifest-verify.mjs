#!/usr/bin/env node
/**
 * User-level Cursor hook: verify deletion manifest after Delete tool use.
 * Event: postToolUse (matcher: Delete)
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  manifestHasEntry,
  normalizeProjectPath,
} from "./lib/deletion-guard.mjs";
import { extractDeletePath, resolveProjectRoot } from "./lib/entry-point-guard.mjs";
import {
  getUnverifiedPendingDeletes,
  isMutatingMode,
  isSessionActive,
  markPendingDeleteVerified,
  getSessionMode,
} from "./lib/session-store.mjs";

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

function allowEmpty() {
  process.stdout.write("{}\n");
  process.exit(0);
}

const input = await readInput();
const conversationId = `${input.conversation_id ?? input.conversationId ?? ""}`;

try {
  if (!isSessionActive(conversationId)) {
    allowEmpty();
  }

  const mode = getSessionMode(conversationId) ?? "main";
  if (!isMutatingMode(mode)) {
    allowEmpty();
  }

  const targetPath = extractDeletePath(input);
  if (!targetPath) {
    allowEmpty();
  }

  const projectRoot = resolveProjectRoot(input, targetPath);
  let rel;
  try {
    rel = normalizeProjectPath(projectRoot, targetPath);
  } catch {
    allowEmpty();
  }

  const pending = getUnverifiedPendingDeletes(conversationId).find(
    (row) => row.path.replace(/\\/g, "/") === rel,
  );

  if (!pending) {
    allowEmpty();
  }

  const backupAbsolute = join(projectRoot, pending.backupPath);
  const hasManifest = manifestHasEntry(projectRoot, pending.path, pending.backupPath);

  if (hasManifest && existsSync(backupAbsolute)) {
    markPendingDeleteVerified(conversationId, pending.path);
  } else {
    console.error(
      `Kodaelus manifest-verify: delete of "${pending.path}" lacks manifest entry or backup at "${pending.backupPath}".`,
    );
  }
} catch (err) {
  console.error(
    `Kodaelus manifest-verify error: ${err instanceof Error ? err.message : "unknown"}`,
  );
}

allowEmpty();
