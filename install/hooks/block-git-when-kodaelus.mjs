#!/usr/bin/env node
/**
 * User-level Cursor hook: deny git shell commands while Kodaelus session is active.
 * Event: beforeShellExecution
 */
import { isGitShellCommand } from "./lib/git-guard.mjs";
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
        "Git commands are blocked while Kodaelus is active in this chat. Say \"stop kodaelus\" to opt out, or run git yourself.",
      agent_message:
        "Kodaelus policy prohibits git commands (including gh repo/pr/issue subcommands). Do not retry git. Complete the task without git or ask the user to run git manually.",
    }) + "\n",
  );
  process.exit(0);
}

const input = await readInput();
const command = `${input.command ?? ""}`;

try {
  if (isSessionActive(input.conversation_id ?? "") && isGitShellCommand(command)) {
    deny();
  }
} catch {
  // Fail open: never block shell if session/git checks fail.
}

allow();
