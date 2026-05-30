#!/usr/bin/env node
/**
 * User-level Cursor hook: deny git shell commands while Kodaelus session is active.
 * Event: beforeShellExecution
 */
import { isBlockedGitShellCommand } from "./lib/git-guard.mjs";
import { isSessionActive } from "./lib/session-store.mjs";

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

function deny() {
  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      user_message:
        "This git/gh command is blocked while Kodaelus is active. Only read-only git (status, diff, log) is allowed. Say \"stop kodaelus\" to opt out, or run other git commands yourself.",
      agent_message:
        "Kodaelus allows only read-only git: status, diff, log. All other git and gh subcommands are prohibited. Do not retry blocked commands; ask the user to run them manually if needed.",
    }) + "\n",
  );
  process.exit(0);
}

const input = await readInput();
const command = `${input.command ?? ""}`;

try {
  if (isSessionActive(input.conversation_id ?? "") && isBlockedGitShellCommand(command)) {
    deny();
  }
} catch {
  // Fail open: never block shell if session/git checks fail.
}

allow();
