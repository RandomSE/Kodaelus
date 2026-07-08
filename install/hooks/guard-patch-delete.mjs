#!/usr/bin/env node
/**
 * User-level Cursor hook: backup-before-delete for ApplyPatch removals while Kodaelus is active.
 * Event: preToolUse (matcher: ApplyPatch)
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  appendManifestEntry,
  copyToTrash,
  isKodaelusArtifactPath,
  normalizeProjectPath,
} from "./lib/deletion-guard.mjs";
import { checkEntryPoint, resolveProjectRoot } from "./lib/entry-point-guard.mjs";
import { extractPatchDeletePaths, extractPatchText } from "./lib/patch-guard.mjs";
import {
  addPendingDelete,
  getSessionMode,
  isBugInvestigationMode,
  isMutatingMode,
  isReadOnlyMode,
  isSessionActive,
} from "./lib/session-store.mjs";
import { denyBugModeDelete, denyReadOnlyTool } from "./lib/mode-guard.mjs";

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

  const mode = getSessionMode(conversationId) ?? "main";

  if (isReadOnlyMode(mode)) {
    const denial = denyReadOnlyTool(mode);
    deny(denial.user_message, denial.agent_message);
  }

  const patch = extractPatchText(input);
  if (!patch) {
    allow();
  }

  const deletePaths = extractPatchDeletePaths(patch);
  if (deletePaths.length === 0) {
    allow();
  }

  const projectRoot = resolveProjectRoot(input, deletePaths[0]);

  for (const target of deletePaths) {
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
          reason: "entry-point hard-block (ApplyPatch)",
          confidence: 100,
          backup: "",
          timestamp: new Date().toISOString(),
          entryPointCheck: "BLOCKED",
        });
      } catch {
        // Continue to deny.
      }
      const detail = reasons.join("; ");
      deny(
        `Kodaelus blocked ApplyPatch deletion of entry-point "${rel}". ${detail}.`,
        `ApplyPatch delete of entry-point "${rel}" is blocked (${detail}). Do not retry.`,
      );
    }

    if (!existsSync(absolutePath)) {
      continue;
    }

    if (!isMutatingMode(mode)) {
      continue;
    }

    const { backupPath, timestamp } = copyToTrash(projectRoot, rel);
    appendManifestEntry(projectRoot, {
      path: rel,
      reason: "pre-delete hook backup (ApplyPatch)",
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
    `Kodaelus blocked ApplyPatch: mandatory backup/manifest failed (${message}).`,
    `ApplyPatch blocked — backup or manifest write failed (${message}).`,
  );
}

allow();
