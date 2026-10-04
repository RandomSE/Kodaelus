#!/usr/bin/env node
/**
 * Soft stop follow-up: intent/ceremony lines on natural-language mutating turns,
 * and an insights read on Main/Prepare/Ship when .kodaelus/insights.md exists.
 * Does not change mode. stop loop_limit 2. A second stop still follows up.
 * Not a tool deny. Errors fail open.
 * Events: afterAgentResponse (log), stop (follow-up)
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  responseMissingInsightsEvidence,
  responseMissingRecommendation,
} from "./lib/recommendation-insights-guard.mjs";
import {
  getSessionMetadata,
  getSessionMode,
  isSessionActive,
} from "./lib/session-store.mjs";

const RECOMMEND_MODES = new Set(["main", "lite", "prepare", "ship"]);
const INSIGHT_MODES = new Set(["main", "prepare", "ship"]);

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
const event = `${input.hook_event_name ?? ""}`;
const conversationId = `${input.conversation_id ?? input.conversationId ?? ""}`;
const text = `${input.response ?? input.text ?? input.agent_response ?? ""}`;
const loopCount = Number(input.loop_count ?? input.loopCount ?? 0) || 0;

/**
 * The guard's own follow-up is a natural-language prompt. Following up again
 * resubmits that sentence forever when Cursor auto-sends it.
 * @param {string | undefined} prompt
 */
function isOwnFollowupPrompt(prompt) {
  return typeof prompt === "string" && /Kodaelus recommendation-insights guard:/i.test(prompt);
}

try {
  if (!isSessionActive(conversationId)) {
    allow();
  }

  // An empty stop payload cannot show the lines are missing. Fail open.
  if (!text.trim()) {
    allow();
  }

  const mode = getSessionMode(conversationId) ?? "";
  const meta = getSessionMetadata(conversationId);
  if (isOwnFollowupPrompt(meta?.lastUserPrompt)) {
    allow();
  }

  /** @type {string[]} */
  const notes = [];

  if (RECOMMEND_MODES.has(mode)) {
    if (meta?.lastPromptHadExplicitMode === false && responseMissingRecommendation(text)) {
      notes.push(
        "Add Active mode: and a recommendKodaelusIntent or recommendCeremony line that includes Does not switch mode. The recommendation does not change mode.",
      );
    }
  }

  if (INSIGHT_MODES.has(mode)) {
    const roots = input.workspace_roots ?? input.workspaceRoots;
    const root = Array.isArray(roots) && typeof roots[0] === "string" ? roots[0] : "";
    if (
      root &&
      existsSync(join(root, ".kodaelus", "insights.md")) &&
      responseMissingInsightsEvidence(text)
    ) {
      notes.push(
        "Read .kodaelus/insights.md before claiming complete. Mention the path or an Insights: line.",
      );
    }
  }

  if (notes.length === 0) {
    allow();
  }

    const lead =
      loopCount >= 1
        ? "Kodaelus recommendation-insights guard: still missing required lines."
        : "Kodaelus recommendation-insights guard:";
    const message = `${lead} ${notes.join(" ")}`;
  console.error(message);
  if (event === "stop") {
    process.stdout.write(JSON.stringify({ followup_message: message }) + "\n");
    process.exit(2);
  }
} catch (err) {
  console.error(
    `Kodaelus recommendation-insights guard error: ${err instanceof Error ? err.message : "unknown"}`,
  );
}

allow();
