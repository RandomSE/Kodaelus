#!/usr/bin/env node
/**
 * User-level Cursor hook: confidence format validation on agent responses.
 * Events: afterAgentResponse, stop
 */
import {
  findConfidenceViolations,
  isSubstantiveResponse,
} from "./lib/confidence-format.mjs";
import {
  getSessionMode,
  isSessionActive,
} from "./lib/session-store.mjs";

const CHECKED_MODES = new Set(["main", "lite", "bug", "suggest", "question", "prepare", "ship"]);

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

  const violations = findConfidenceViolations(text);
  if (violations.length === 0) {
    allowEmpty();
  }

  console.error(
    `Kodaelus confidence-evidence guard: ${violations.length} bare Confidence score(s) without Evidence.`,
  );

  if (event === "stop" && (mode === "main" || mode === "lite" || mode === "prepare" || mode === "ship")) {
    process.stdout.write(
      JSON.stringify({
        followup_message:
          "Kodaelus hook detected Confidence scores without adjacent Evidence fields. " +
          "Revise the delivery: every `Confidence: NN%` must include `Evidence: ...` within ~200 characters. " +
          "Then complete Delivery Self-Check and Outcome Validation.",
      }) + "\n",
    );
    process.exit(2);
  }
} catch (err) {
  console.error(
    `Kodaelus confidence-evidence guard error: ${err instanceof Error ? err.message : "unknown"}`,
  );
  if (event === "stop") {
    process.exit(2);
  }
}

allowEmpty();
