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
  classifyShipCiPoll,
  getSessionMode,
  isSessionActive,
  recordFirstFailingTest,
  recordPrepareSuiteAttempt,
  recordShellEvidence,
  recordShipCiPoll,
  SHIP_CI_MAX_PENDING_POLLS,
} from "./lib/session-store.mjs";
import { isFailingTestOutcome } from "./lib/tdd-order-guard.mjs";

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
const stdout = `${input.output ?? input.stdout ?? input.std_out ?? ""}`.slice(0, 8000);

try {
  if (!isSessionActive(conversationId)) {
    allowEmpty();
  }

  const mode = getSessionMode(conversationId) ?? "main";

  if (isTestLikeShellCommand(command) && (mode === "main" || mode === "prepare" || mode === "lite" || mode === "bug" || mode === "ship")) {
    recordShellEvidence(conversationId, command, outcome);
    if (isFailingTestOutcome(outcome)) {
      recordFirstFailingTest(conversationId, { command, outcome, stdout });
    }
  }

  if ((mode === "prepare" || mode === "ship") && isFullSuiteShellCommand(command)) {
    recordPrepareSuiteAttempt(conversationId);
  }

  if (mode === "ship") {
    const kind = classifyShipCiPoll(command, `${outcome}\n${stdout}`);
    if (kind) {
      const recorded = recordShipCiPoll(conversationId, kind);
      if (kind === "pending" && recorded && recorded.pendingPolls >= SHIP_CI_MAX_PENDING_POLLS) {
        console.error(
          "Kodaelus Ship: pending CI poll limit (4). Stop polling and report pending with Follow-Up Queue.",
        );
      }
    }
  }
} catch (err) {
  console.error(
    `Kodaelus shell-evidence recorder error: ${err instanceof Error ? err.message : "unknown"}`,
  );
}

allowEmpty();
