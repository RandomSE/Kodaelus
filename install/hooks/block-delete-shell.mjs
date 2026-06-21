#!/usr/bin/env node
/**
 * User-level Cursor hook: block shell delete commands targeting entry-point files while Kodaelus is active.
 * Event: beforeShellExecution
 */
import {
  checkEntryPoint,
  extractShellDeleteTargets,
  resolveProjectRoot,
} from "./lib/entry-point-guard.mjs";
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

/**
 * @param {string} path
 * @param {string[]} reasons
 */
function deny(path, reasons) {
  const detail = reasons.join("; ");
  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      user_message: `Kodaelus blocked shell deletion of entry-point "${path}". ${detail}.`,
      agent_message:
        `Shell delete of entry-point "${path}" is blocked (${detail}). ` +
        "Do not retry; propose alternatives per File Deletion Protocol.",
    }) + "\n",
  );
  process.exit(0);
}

const input = await readInput();
const conversationId = `${input.conversation_id ?? input.conversationId ?? ""}`;
const command = `${input.command ?? ""}`;

try {
  if (!isSessionActive(conversationId)) {
    allow();
  }

  const targets = extractShellDeleteTargets(command);
  if (targets.length === 0) {
    allow();
  }

  const projectRoot = resolveProjectRoot(input, targets[0]);
  for (const target of targets) {
    const { blocked, reasons } = checkEntryPoint(target, projectRoot);
    if (blocked) {
      deny(target, reasons);
    }
  }
} catch {
  // Fail open.
}

allow();
