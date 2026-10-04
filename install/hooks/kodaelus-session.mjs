#!/usr/bin/env node
/**
 * User-level Cursor hook: track Kodaelus-active conversations.
 * Events: beforeSubmitPrompt, subagentStart, sessionEnd
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { manifestHasEntry } from "./lib/deletion-guard.mjs";
import { ensureProjectGuidelines } from "./lib/project-guidelines.mjs";
import {
  extractPreferenceIntent,
  recordPreferenceCandidate,
} from "./lib/preference-learning.mjs";
import { tryRestoreFromPrompt } from "./lib/restore-handler.mjs";
import {
  activateSession,
  approvePrepareContinue,
  approveScope,
  approveShipCiContinue,
  clearSession,
  deactivateSession,
  detectExplicitMutatingUpgradeMode,
  detectKodaelusMode,
  detectSuggestSubMode,
  getSessionMode,
  getUnverifiedPendingDeletes,
  isActivatePrompt,
  isDeactivatePrompt,
  isPrepareContinuePrompt,
  isReadOnlyMode,
  isShipCiContinuePrompt,
  isScopeApprovePrompt,
  isSessionActive,
  recordPromptContext,
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

/** Exact subagent name to mode. Names that only contain "kodaelus" do not match. */
const SUBAGENT_MODE = {
  kodaelus: "main",
  "kodaelus-bug": "bug",
  "kodaelus-prompt": "prompt",
};

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
    const subagentType = `${input.subagent_type ?? ""}`.toLowerCase().trim();
    const mapped = SUBAGENT_MODE[subagentType];
    if (mapped) {
      if (isSessionActive(conversationId)) {
        const current = getSessionMode(conversationId);
        if (current && current !== mapped) {
          console.error(
            `Kodaelus subagentStart: conversation ${conversationId} already active as ${current}; not overwriting with ${mapped} from subagent ${subagentType}.`,
          );
        }
      } else {
        activateSession(conversationId, mapped);
        ensureProjectGuidelines(projectRoot);
      }
    }
    allow();
  }

  if (event === "beforeSubmitPrompt") {
    const prompt = input.prompt ?? "";
    if (isDeactivatePrompt(prompt)) {
      deactivateSession(conversationId);
    } else if (isScopeApprovePrompt(prompt)) {
      approveScope(conversationId);
    } else if (isShipCiContinuePrompt(prompt) && isSessionActive(conversationId)) {
      approveShipCiContinue(conversationId);
    } else if (isPrepareContinuePrompt(prompt) && isSessionActive(conversationId)) {
      approvePrepareContinue(conversationId);
    } else {
      // Same-turn: if already in a read-only mode and this message contains an
      // explicit mutating upgrade token, persist that mode before any preToolUse
      // deny can fire (even when body text still mentions prompt/suggest phrases).
      let mode = detectKodaelusMode(prompt);
      if (isSessionActive(conversationId)) {
        const current = getSessionMode(conversationId);
        if (isReadOnlyMode(current)) {
          const upgrade = detectExplicitMutatingUpgradeMode(prompt);
          if (upgrade) mode = upgrade;
        }
      }
      if (mode != null || isActivatePrompt(prompt)) {
        const resolved = mode ?? "main";
        const suggestSubMode = detectSuggestSubMode(prompt);
        activateSession(conversationId, resolved, suggestSubMode);
        ensureProjectGuidelines(projectRoot);
        if (existsSync(join(projectRoot, ".kodaelus", "insights.md"))) {
          console.error(
            "Kodaelus: .kodaelus/insights.md is present. Read it on Main, Prepare, and Ship turns.",
          );
        }
      }
    }

    if (isSessionActive(conversationId)) {
      recordPromptContext(conversationId, prompt);
      ensureProjectGuidelines(projectRoot);
      tryRestoreFromPrompt(projectRoot, prompt);

      const explicitPreference = process.env.KODAELUS_RECORD_PREFERENCE?.trim();
      const preferenceIntent = explicitPreference || extractPreferenceIntent(prompt);
      if (preferenceIntent) {
        const result = recordPreferenceCandidate(projectRoot, preferenceIntent);
        if (result.appended && result.guidelineLine) {
          console.error(
            `Kodaelus: appended preference to .kodaelus/instructions.md — ${result.guidelineLine}`,
          );
        }
      }
    }
  }
} catch {
  // Fail open: never block prompts if session tracking fails.
}

allow();
