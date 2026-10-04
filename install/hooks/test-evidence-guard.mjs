#!/usr/bin/env node
/**
 * User-level Cursor hook: soft-gate test evidence on Main/Prepare/Mode Lite stop when
 * Implementation occurred. Mode Lite uses the same loop_limit follow-up, not Full structure.
 * Events: afterAgentResponse (log), stop (follow-up)
 */
import { isSubstantiveResponse } from "./lib/confidence-format.mjs";
import {
  buildTestEvidenceFollowup,
  needsTestEvidenceGate,
} from "./lib/test-evidence-guard.mjs";
import {
  getSessionMetadata,
  getSessionMode,
  isSessionActive,
} from "./lib/session-store.mjs";

const CHECKED_MODES = new Set(["main", "prepare", "lite", "ship"]);

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
const event = `${input.hook_event_name ?? ""}`;
const conversationId = `${input.conversation_id ?? input.conversationId ?? ""}`;
const text = `${input.response ?? input.text ?? input.agent_response ?? ""}`;
const loopCount = Number(input.loop_count ?? input.loopCount ?? 0) || 0;

try {
  if (!isSessionActive(conversationId)) {
    allowEmpty();
  }

  const mode = getSessionMode(conversationId) ?? "main";
  if (!CHECKED_MODES.has(mode)) {
    allowEmpty();
  }

  if (!isSubstantiveResponse(text, 500, { event })) {
    allowEmpty();
  }

  const meta = getSessionMetadata(conversationId);
  const needsGate = needsTestEvidenceGate({
    text,
    touchedFiles: meta?.touchedFiles ?? [],
    shellEvidence: meta?.shellEvidence ?? [],
  });

  if (!needsGate) {
    allowEmpty();
  }

  console.error("Kodaelus test-evidence soft-gate: Implementation without test outcomes.");

  if (event === "stop") {
    process.stdout.write(
      JSON.stringify({
        followup_message: buildTestEvidenceFollowup(loopCount),
      }) + "\n",
    );
    process.exit(2);
  }
} catch (err) {
  console.error(
    `Kodaelus test-evidence guard error: ${err instanceof Error ? err.message : "unknown"}`,
  );
  if (event === "stop") {
    process.exit(2);
  }
}

allowEmpty();
