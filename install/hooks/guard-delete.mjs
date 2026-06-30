#!/usr/bin/env node
/**
 * User-level Cursor hook: backup-before-delete + entry-point hard-block while Kodaelus is active.
 * Event: preToolUse (matcher: Delete)
 */
import {
  appendManifestEntry,
  copyToTrash,
  isKodaelusArtifactPath,
  normalizeProjectPath,
} from "./lib/deletion-guard.mjs";
import {
  checkEntryPoint,
  extractDeletePath,
  resolveProjectRoot,
} from "./lib/entry-point-guard.mjs";
import {
  addPendingDelete,
  getSessionMode,
  isMutatingMode,
  isSessionActive,
} from "./lib/session-store.mjs";
import { existsSync } from "node:fs";
import { join } from "node:path";

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

function allow() {
  process.stdout.write(JSON.stringify({ permission: "allow" }) + "\n");
  process.exit(0);
}

/**
 * @param {string} userMessage
 * @param {string} agentMessage
 */
function deny(userMessage, agentMessage) {
  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      user_message: userMessage,
      agent_message: agentMessage,
    }) + "\n",
  );
  process.exit(0);
}

const input = await readInput();
const conversationId = `${input.conversation_id ?? input.conversationId ?? ""}`;

try {
  if (!isSessionActive(conversationId)) {
    allow();
  }

  const targetPath = extractDeletePath(input);
  if (!targetPath) {
    allow();
  }

  const projectRoot = resolveProjectRoot(input, targetPath);
  const mode = getSessionMode(conversationId) ?? "main";

  let rel;
  try {
    rel = normalizeProjectPath(projectRoot, targetPath);
  } catch {
    allow();
  }

  const absolutePath = join(projectRoot, rel);

  if (isKodaelusArtifactPath(rel)) {
    allow();
  }

  const { blocked, reasons } = checkEntryPoint(rel, projectRoot);
  if (blocked) {
    try {
      appendManifestEntry(projectRoot, {
        path: rel,
        reason: "entry-point hard-block",
        confidence: 100,
        backup: "",
        timestamp: new Date().toISOString(),
        entryPointCheck: "BLOCKED",
      });
    } catch {
      // Manifest write failure should not allow delete of entry-point.
    }
    const detail = reasons.join("; ");
    deny(
      `Kodaelus blocked deletion of entry-point file "${rel}". ${detail}.`,
      `Deletion of "${rel}" is hard-blocked (${detail}). Do not retry; report BLOCKED in File Deletions and propose alternatives.`,
    );
  }

  if (!isMutatingMode(mode)) {
    allow();
  }

  if (!existsSync(absolutePath)) {
    allow();
  }

  const { backupPath, timestamp } = copyToTrash(projectRoot, rel);
  appendManifestEntry(projectRoot, {
    path: rel,
    reason: "pre-delete hook backup",
    confidence: 100,
    backup: backupPath,
    timestamp,
    entryPointCheck: "Pass",
  });
  addPendingDelete(conversationId, {
    path: rel,
    backupPath,
    manifestWrittenAt: timestamp,
    verified: false,
  });
} catch (err) {
  const message = err instanceof Error ? err.message : "backup failed";
  deny(
    `Kodaelus blocked delete: mandatory backup/manifest failed (${message}).`,
    `Delete blocked — backup or manifest write failed (${message}). Do not retry without resolving the failure.`,
  );
}

allow();
