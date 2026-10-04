#!/usr/bin/env node
/**
 * User-level Cursor hook: deny git shell commands while Kodaelus session is active.
 * Event: beforeShellExecution
 */
import { isBlockedGitShellCommand } from "./lib/git-guard.mjs";
import { isCloudDeliveryRuntime } from "./lib/cloud-runtime.mjs";
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

function allow() {
  process.stdout.write(JSON.stringify({ permission: "allow" }) + "\n");
  process.exit(0);
}

function deny(ship) {
  const userMessage = ship
    ? "Ship mode blocked this git/gh command. Allowed: status, diff, log, branch, add, commit, push (no force, not main or master), checkout -b, switch -c, gh pr create|view|checks|status, gh run list|view."
    : "This git/gh command is blocked while Kodaelus is active. Only read-only git (status, diff, log) is allowed. Say \"stop kodaelus\" to opt out, or run other git commands yourself.";
  const agentMessage = ship
    ? "Kodaelus Ship allowlist denied this command. Do not force-push, reset, rebase, change git config, merge, or push main/master. Do not retry a denied command."
    : "Kodaelus allows only read-only git: status, diff, log. All other git and gh subcommands are prohibited. Do not retry blocked commands; ask the user to run them manually if needed.";
  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      user_message: userMessage,
      agent_message: agentMessage,
    }) + "\n",
  );
  process.exit(0);
}

const input = await readInput();
const command = `${input.command ?? ""}`;

try {
  const conversationId = input.conversation_id ?? "";
  const cloudDelivery = isCloudDeliveryRuntime();
  const ship = isSessionActive(conversationId) && getSessionMode(conversationId) === "ship";
  if (
    isSessionActive(conversationId) &&
    isBlockedGitShellCommand(command, {
      ship,
      cloudDelivery: ship ? false : cloudDelivery,
    })
  ) {
    deny(ship);
  }
} catch {
  // Fail open: never block shell if session/git checks fail.
}

allow();
