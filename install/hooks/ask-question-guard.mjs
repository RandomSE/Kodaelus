#!/usr/bin/env node
/**
 * User-level Cursor hook: AskQuestion / clarifying-question guard.
 * Events: preToolUse, afterAgentResponse, stop
 *
 * Platform note (2026): AskQuestion may omit preToolUse/postToolUse.
 * Policy remains primary; this deny arms when Cursor wires the tool into hooks.
 * stop heuristic covers prose pauses that bypass AskQuestion hooks.
 */
import {
  buildDenyPayload,
  buildStopFollowupMessage,
  detectOpenClarification,
  isAskQuestionToolName,
  shouldDenyAskQuestion,
} from "./lib/ask-question-guard.mjs";
import {
  getSessionMode,
  isSessionActive,
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

function allowTool() {
  process.stdout.write(JSON.stringify({ permission: "allow" }) + "\n");
  process.exit(0);
}

/**
 * @param {{ permission: string, user_message: string, agent_message: string }} payload
 */
function denyTool(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
  process.exit(0);
}

const input = await readInput();
const event = `${input.hook_event_name ?? ""}`;
const conversationId = `${input.conversation_id ?? input.conversationId ?? ""}`;

try {
  if (!isSessionActive(conversationId)) {
    if (event === "preToolUse") allowTool();
    allowEmpty();
  }

  const mode = getSessionMode(conversationId) ?? "main";

  if (event === "preToolUse") {
    const toolName = `${input.tool_name ?? input.toolName ?? ""}`;
    if (!isAskQuestionToolName(toolName)) {
      allowTool();
    }
    if (!shouldDenyAskQuestion(mode)) {
      allowTool();
    }
    console.error(
      `Kodaelus ask-question-guard: denied ${toolName} in mode=${mode} (AskQuestion may still bypass hooks on some Cursor builds).`,
    );
    denyTool(buildDenyPayload());
  }

  if (event === "afterAgentResponse") {
    const text = `${input.response ?? input.text ?? input.agent_response ?? ""}`;
    if (shouldDenyAskQuestion(mode) && detectOpenClarification(text)) {
      console.error(
        "Kodaelus ask-question-guard: open clarification pattern observed in afterAgentResponse.",
      );
    }
    allowEmpty();
  }

  if (event === "stop") {
    if (!shouldDenyAskQuestion(mode)) {
      allowEmpty();
    }
    const text = `${input.response ?? input.text ?? input.agent_response ?? ""}`;
    if (!detectOpenClarification(text)) {
      allowEmpty();
    }
    const loopCount = Number(input.loop_count ?? input.loopCount ?? 0);
    const followup_message = buildStopFollowupMessage({ loopCount });
    console.error(
      "Kodaelus ask-question-guard: open clarification on stop; injecting resolution priority follow-up.",
    );
    process.stdout.write(JSON.stringify({ followup_message }) + "\n");
    process.exit(2);
  }
} catch (err) {
  console.error(
    `Kodaelus ask-question-guard error: ${err instanceof Error ? err.message : "unknown"}`,
  );
  if (event === "stop") {
    process.exit(2);
  }
  if (event === "preToolUse") {
    allowTool();
  }
}

allowEmpty();
