#!/usr/bin/env node
/**
 * User-level Cursor hook: track Kodaelus-active conversations.
 * Events: beforeSubmitPrompt, subagentStart, sessionEnd
 */
import {
  activateSession,
  clearSession,
  deactivateSession,
  isActivatePrompt,
  isDeactivatePrompt,
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

try {
  if (event === "sessionEnd") {
    clearSession(conversationId);
    allow();
  }

  if (event === "subagentStart") {
    const subagentType = `${input.subagent_type ?? ""}`.toLowerCase();
    if (subagentType.includes("kodaelus")) {
      activateSession(conversationId);
    }
    allow();
  }

  if (event === "beforeSubmitPrompt") {
    const prompt = input.prompt ?? "";
    if (isDeactivatePrompt(prompt)) {
      deactivateSession(conversationId);
    } else if (isActivatePrompt(prompt)) {
      activateSession(conversationId);
    }
  }
} catch {
  // Fail open: never block prompts if session tracking fails.
}

allow();
