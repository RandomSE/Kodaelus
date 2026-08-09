#!/usr/bin/env node
/**
 * User-level Cursor hook: validate Prompt-mode Recommended handoff fence.
 * Events: afterAgentResponse (log), stop (follow-up)
 */
import { isSubstantiveResponse } from "./lib/confidence-format.mjs";
import {
  buildPromptFenceFollowup,
  validatePromptHandoffFence,
} from "./lib/prompt-fence-guard.mjs";
import { getSessionMode, isSessionActive } from "./lib/session-store.mjs";

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
  if (mode !== "prompt") {
    allowEmpty();
  }

  if (!isSubstantiveResponse(text, 200)) {
    allowEmpty();
  }

  const result = validatePromptHandoffFence(text);
  if (result.ok) {
    allowEmpty();
  }

  console.error(
    `Kodaelus prompt-fence guard: ${result.reasons.join("; ")}`,
  );

  if (event === "stop") {
    process.stdout.write(
      JSON.stringify({
        followup_message: buildPromptFenceFollowup(result.reasons, loopCount),
      }) + "\n",
    );
    process.exit(2);
  }
} catch (err) {
  console.error(
    `Kodaelus prompt-fence guard error: ${err instanceof Error ? err.message : "unknown"}`,
  );
  if (event === "stop") {
    process.exit(2);
  }
}

allowEmpty();
