#!/usr/bin/env node
/**
 * User-level Cursor hook: block shell delete commands targeting entry-point files while Kodaelus is active.
 * Requires trash backup + manifest for non-entry-point deletes in mutating modes.
 * Event: beforeShellExecution
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  appendManifestEntry,
  copyToTrash,
  isKodaelusArtifactPath,
  normalizeProjectPath,
} from "./lib/deletion-guard.mjs";
import {
  checkEntryPoint,
  extractShellDeleteTargets,
  resolveProjectRoot,
} from "./lib/entry-point-guard.mjs";
import {
  addPendingDelete,
  getSessionMode,
  isBugInvestigationMode,
  isMutatingMode,
  isReadOnlyMode,
  isSessionActive,
} from "./lib/session-store.mjs";
import {
  denyBugModeDelete,
  denyReadOnlyShellDelete,
} from "./lib/mode-guard.mjs";

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
const command = `${input.command ?? ""}`;

try {
  if (!isSessionActive(conversationId)) {
    allow();
  }

  const targets = extractShellDeleteTargets(command);
  if (targets.length === 0) {
    allow();
  }

  const mode = getSessionMode(conversationId) ?? "main";
  const projectRoot = resolveProjectRoot(input, targets[0]);

  if (isReadOnlyMode(mode)) {
    const denial = denyReadOnlyShellDelete();
    deny(denial.user_message, denial.agent_message);
  }

  for (const target of targets) {
    let rel;
    try {
      rel = normalizeProjectPath(projectRoot, target);
    } catch {
      continue;
    }

    if (isKodaelusArtifactPath(rel)) {
      continue;
    }

    if (isBugInvestigationMode(mode) && !isKodaelusArtifactPath(rel)) {
      const denial = denyBugModeDelete(rel);
      deny(denial.user_message, denial.agent_message);
    }

    const absolutePath = join(projectRoot, rel);
    const { blocked, reasons } = checkEntryPoint(rel, projectRoot);
    if (blocked) {
      try {
        appendManifestEntry(projectRoot, {
          path: rel,
          reason: "entry-point hard-block (shell)",
          confidence: 100,
          backup: "",
          timestamp: new Date().toISOString(),
          entryPointCheck: "BLOCKED",
        });
      } catch {
        // Continue to deny even if manifest write fails.
      }
      const detail = reasons.join("; ");
      deny(
        `Kodaelus blocked shell deletion of entry-point "${rel}". ${detail}.`,
        `Shell delete of entry-point "${rel}" is blocked (${detail}). Do not retry; propose alternatives per File Deletion Protocol.`,
      );
    }

    if (!isMutatingMode(mode)) {
      continue;
    }

    if (!existsSync(absolutePath)) {
      continue;
    }

    const { backupPath, timestamp } = copyToTrash(projectRoot, rel);
    appendManifestEntry(projectRoot, {
      path: rel,
      reason: "pre-delete hook backup (shell)",
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
  }
} catch (err) {
  const message = err instanceof Error ? err.message : "backup failed";
  deny(
    `Kodaelus blocked shell delete: mandatory backup/manifest failed (${message}).`,
    `Shell delete blocked — backup or manifest write failed (${message}).`,
  );
}

allow();
