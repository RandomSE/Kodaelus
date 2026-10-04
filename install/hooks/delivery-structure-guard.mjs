#!/usr/bin/env node
/**
 * User-level Cursor hook: require mode delivery sections on stop (Main/Bug/Prepare).
 * Mode Lite is an abbreviated soft check (Tests + Delivery Self-Check, no Follow-Up Queue)
 * and shares this stop hook's loop_limit.
 * Events: afterAgentResponse (log), stop (follow-up)
 *
 * Progress may be one short sentence (or none). Plan-first messages are
 * exempt from the length >= 500 Full-structure rule. Only the final report
 * of the turn (stop) must include required headings with Follow-Up Queue last.
 */
import {
  buildDeliveryStructureFollowup,
  findMissingDeliverySections,
} from "./lib/delivery-structure-guard.mjs";
import { isSubstantiveResponse } from "./lib/confidence-format.mjs";
import {
  getSessionMode,
  isPrepareFixCycleCapped,
  isSessionActive,
  isShipCiRepairCapped,
} from "./lib/session-store.mjs";

const CHECKED_MODES = new Set(["main", "bug", "prepare", "lite", "ship"]);

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

  const prepareCapped =
    (mode === "prepare" || mode === "ship") && isPrepareFixCycleCapped(conversationId);
  const shipCiCapped = mode === "ship" && isShipCiRepairCapped(conversationId);
  const missing = findMissingDeliverySections(mode, text, { prepareCapped, shipCiCapped });
  if (missing.length === 0) {
    allowEmpty();
  }

  console.error(
    `Kodaelus delivery-structure guard: missing sections for ${mode}: ${missing.join(", ")}`,
  );

  if (event === "stop") {
    process.stdout.write(
      JSON.stringify({
        followup_message: buildDeliveryStructureFollowup(missing, mode, loopCount),
      }) + "\n",
    );
    process.exit(2);
  }
} catch (err) {
  console.error(
    `Kodaelus delivery-structure guard error: ${err instanceof Error ? err.message : "unknown"}`,
  );
  if (event === "stop") {
    process.exit(2);
  }
}

allowEmpty();
