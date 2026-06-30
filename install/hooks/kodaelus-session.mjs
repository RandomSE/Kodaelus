#!/usr/bin/env node
/**
 * User-level Cursor hook: track Kodaelus-active conversations.
 * Events: beforeSubmitPrompt, subagentStart, sessionEnd
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { manifestHasEntry } from "./lib/deletion-guard.mjs";
import {
  activateSession,
  approveScope,
  clearSession,
  deactivateSession,
  detectKodaelusMode,
  detectSuggestSubMode,
  getUnverifiedPendingDeletes,
  isActivatePrompt,
  isDeactivatePrompt,
  isScopeApprovePrompt,
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

function allow() {
  process.stdout.write("{}\n");
  process.exit(0);
}

const input = await readInput();
const event = input.hook_event_name ?? "";
const conversationId = input.conversation_id ?? "";
const workspaceRoots = input.workspace_roots ?? input.workspaceRoots;
const projectRoot = Array.isArray(workspaceRoots) && typeof workspaceRoots[0] === "string"
  ? workspaceRoots[0]
  : process.cwd();

try {
  if (event === "sessionEnd") {
    const pending = getUnverifiedPendingDeletes(conversationId);
    for (const row of pending) {
      const hasManifest = manifestHasEntry(projectRoot, row.path, row.backupPath);
      const backupExists = row.backupPath
        ? existsSync(join(projectRoot, row.backupPath))
        : false;
      if (!hasManifest || !backupExists) {
        console.error(
          `Kodaelus sessionEnd: deletion of "${row.path}" missing manifest entry or backup "${row.backupPath}".`,
        );
      }
    }
    clearSession(conversationId);
    allow();
  }

  if (event === "subagentStart") {
    const subagentType = `${input.subagent_type ?? ""}`.toLowerCase();
    if (subagentType.includes("kodaelus")) {
      activateSession(conversationId, "main");
    }
    allow();
  }

  if (event === "beforeSubmitPrompt") {
    const prompt = input.prompt ?? "";
    if (isDeactivatePrompt(prompt)) {
      deactivateSession(conversationId);
    } else if (isScopeApprovePrompt(prompt)) {
      approveScope(conversationId);
    } else if (isActivatePrompt(prompt)) {
      const mode = detectKodaelusMode(prompt) ?? "main";
      const suggestSubMode = detectSuggestSubMode(prompt);
      activateSession(conversationId, mode, suggestSubMode);
    }
  }
} catch {
  // Fail open: never block prompts if session tracking fails.
}

allow();
