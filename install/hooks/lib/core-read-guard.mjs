/**
 * Block edit and shell tools until this session has Read core.md.
 * Reads stay allowed. Missing core.md fails open.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { withStoreLock } from "./session-store.mjs";

/**
 * @param {string} name
 */
function normTool(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export function isCoreMdPath(filePath) {
  const normalized = String(filePath || "")
    .replace(/\\/g, "/")
    .trim();
  if (!normalized) return false;
  return normalized === "core.md" || normalized.endsWith("/core.md");
}

/**
 * @param {string} projectRoot
 * @param {string} cursorHome
 * @returns {string[]}
 */
export function corePolicyCandidates(projectRoot, cursorHome) {
  return [
    join(projectRoot, ".cursor", "kodaelus", "core.md"),
    join(projectRoot, "kodaelus", "core.md"),
    join(cursorHome, "kodaelus", "core.md"),
  ];
}

/**
 * @param {string} projectRoot
 * @param {string} cursorHome
 * @returns {boolean}
 */
export function corePolicyExists(projectRoot, cursorHome) {
  return corePolicyCandidates(projectRoot, cursorHome).some((file) => {
    try {
      return existsSync(file);
    } catch {
      return false;
    }
  });
}

/**
 * @param {string} toolName
 * @returns {boolean}
 */
function isReadName(toolName) {
  const tool = normTool(toolName);
  return tool === "read" || tool === "readfile";
}

/**
 * @param {string} toolName
 * @returns {boolean}
 */
function isGuardedEdit(toolName) {
  const tool = normTool(toolName);
  return (
    tool === "write" ||
    tool === "strreplace" ||
    tool === "searchreplace" ||
    tool === "applypatch" ||
    tool === "delete"
  );
}

/**
 * @param {object} params
 * @param {string} params.event
 * @param {string} params.toolName
 * @param {string} params.filePath
 * @param {boolean} params.coreExists
 * @param {boolean} params.alreadyRead
 * @returns {"allow" | "deny" | "record"}
 */
export function decideCoreRead({ event, toolName, filePath, coreExists, alreadyRead }) {
  if (!coreExists) return "allow";
  if (event === "beforeShellExecution") return alreadyRead ? "allow" : "deny";
  if (event !== "preToolUse") return "allow";
  if (isReadName(toolName)) return isCoreMdPath(filePath) ? "record" : "allow";
  if (isGuardedEdit(toolName)) return alreadyRead ? "allow" : "deny";
  return "allow";
}

/**
 * @returns {{ permission: "deny", user_message: string, agent_message: string }}
 */
export function denyUntilCoreRead() {
  return {
    permission: "deny",
    user_message: "Kodaelus: read core.md before edit or shell tools.",
    agent_message:
      "First tool call must Read core.md (`.cursor/kodaelus/core.md`, `kodaelus/core.md`, or `~/.cursor/kodaelus/core.md`), then the active mode file. Work done without that read is invalid. Read tools stay allowed.",
  };
}

/**
 * @param {unknown} input
 * @returns {string}
 */
export function extractToolPath(input) {
  const record = input && typeof input === "object" ? /** @type {Record<string, unknown>} */ (input) : {};
  const toolInput = record.tool_input ?? record.toolInput ?? record.arguments ?? record.input;
  const sources = [toolInput, record];
  const keys = ["path", "file_path", "filePath", "target_file"];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const row = /** @type {Record<string, unknown>} */ (source);
    for (const key of keys) {
      if (typeof row[key] === "string" && row[key].trim()) return row[key].trim();
    }
  }
  return "";
}

function coreReadFile() {
  const cursorHome = process.env.CURSOR_HOME ?? join(homedir(), ".cursor");
  return join(cursorHome, "kodaelus", "core-reads.json");
}

/**
 * @returns {string[]}
 */
function readCoreReadIds() {
  const file = coreReadFile();
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const ids = Array.isArray(parsed?.conversationIds) ? parsed.conversationIds : [];
    return ids.filter((id) => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

/**
 * @param {string} conversationId
 * @returns {boolean}
 */
export function hasCoreRead(conversationId) {
  if (!conversationId) return false;
  try {
    return withStoreLock(() => readCoreReadIds().includes(conversationId));
  } catch {
    return false;
  }
}

/**
 * @param {string} conversationId
 * @returns {boolean}
 */
export function recordCoreRead(conversationId) {
  if (!conversationId) return false;
  try {
    return withStoreLock(() => {
      const ids = readCoreReadIds();
      if (!ids.includes(conversationId)) ids.push(conversationId);
      const file = coreReadFile();
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        file,
        `${JSON.stringify({ conversationIds: ids.slice(-200) }, null, 2)}\n`,
        "utf8",
      );
      return true;
    });
  } catch {
    return false;
  }
}
