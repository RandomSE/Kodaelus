#!/usr/bin/env node
/**
 * User-level Cursor hook: record shell command outcomes for test evidence and
 * Prepare suite / fix-cycle counting.
 * Event: afterShellExecution
 */
import {
  isFullSuiteShellCommand,
  isTestLikeShellCommand,
} from "./lib/test-evidence-guard.mjs";
import {
  getSessionMode,
  isSessionActive,
  recordPrepareSuiteAttempt,
  recordShellEvidence,
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
const command = `${input.command ?? ""}`;
const exitCode =
  input.exit_code ??
  input.exitCode ??
  input.status ??
  input.returncode ??
  "";
const outcome =
  exitCode === "" || exitCode == null
    ? `${input.outcome ?? input.result ?? ""}`.slice(0, 200)
    : `exit=${exitCode}`;

try {
  if (!isSessionActive(conversationId)) {
    allowEmpty();
  }

  const mode = getSessionMode(conversationId) ?? "main";

  if (isTestLikeShellCommand(command) && (mode === "main" || mode === "prepare" || mode === "lite" || mode === "bug")) {
    recordShellEvidence(conversationId, command, outcome);
  }

  if (mode === "prepare" && isFullSuiteShellCommand(command)) {
    recordPrepareSuiteAttempt(conversationId);
  }
} catch (err) {
  console.error(
    `Kodaelus shell-evidence recorder error: ${err instanceof Error ? err.message : "unknown"}`,
  );
}

allowEmpty();
