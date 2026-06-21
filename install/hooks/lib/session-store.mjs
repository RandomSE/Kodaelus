import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** @typedef {'main' | 'prompt' | 'bug'} KodaelusMode */

const DEACTIVATE =
  /\b(stop|disable|exit|end|leave)\s+kodaelus\b|\bnormal\s+mode\b|\bwithout\s+kodaelus\b/i;

const LOCK_STALE_MS = 30_000;
const LOCK_MAX_WAIT_MS = 5_000;
const LOCK_POLL_MS = 10;

function getStorePath() {
  const cursorHome = process.env.CURSOR_HOME ?? join(homedir(), ".cursor");
  return join(cursorHome, "kodaelus", "active-sessions.json");
}

function getLockPath() {
  return `${getStorePath()}.lock`;
}

/** Short sync delay for lock polling (Atomics.wait is worker-only in Node). */
function sleepSync(ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    // Intentional brief spin — LOCK_POLL_MS is small (10ms).
  }
}

function removeStaleLock(lockPath) {
  if (!existsSync(lockPath)) return;
  try {
    const { mtimeMs } = statSync(lockPath);
    if (Date.now() - mtimeMs > LOCK_STALE_MS) {
      rmSync(lockPath, { force: true });
    }
  } catch {
    rmSync(lockPath, { force: true });
  }
}

/**
 * Exclusive cross-process lock for read-modify-write on active-sessions.json.
 */
export function withStoreLock(fn) {
  const lockPath = getLockPath();
  mkdirSync(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    try {
      writeFileSync(lockPath, `${process.pid}`, { flag: "wx" });
      try {
        return fn();
      } finally {
        rmSync(lockPath, { force: true });
      }
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
      removeStaleLock(lockPath);
      sleepSync(LOCK_POLL_MS);
    }
  }

  throw new Error("session-store: timed out waiting for store lock");
}

/**
 * @returns {{ conversationIds: string[], modes: Record<string, KodaelusMode> }}
 */
function readStoreUnlocked() {
  const storePath = getStorePath();
  if (!existsSync(storePath)) {
    return { conversationIds: [], modes: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    const ids = Array.isArray(parsed?.conversationIds)
      ? parsed.conversationIds.filter((id) => typeof id === "string" && id.length > 0)
      : [];
    const conversationIds = [...new Set(ids)];
    /** @type {Record<string, KodaelusMode>} */
    const modes = {};
    if (parsed?.modes && typeof parsed.modes === "object") {
      for (const id of conversationIds) {
        const mode = parsed.modes[id];
        if (mode === "main" || mode === "prompt" || mode === "bug") {
          modes[id] = mode;
        } else {
          modes[id] = "main";
        }
      }
    } else {
      for (const id of conversationIds) {
        modes[id] = "main";
      }
    }
    return { conversationIds, modes };
  } catch {
    return { conversationIds: [], modes: {} };
  }
}

/**
 * @param {{ conversationIds: string[], modes: Record<string, KodaelusMode> }} store
 */
function writeStoreUnlocked(store) {
  const storePath = getStorePath();
  const dir = dirname(storePath);
  mkdirSync(dir, { recursive: true });

  for (const entry of readdirSync(dir)) {
    if (/^active-sessions\.\d+\.tmp$/.test(entry)) {
      rmSync(join(dir, entry), { force: true });
    }
  }

  const conversationIds = [...new Set(store.conversationIds)];
  /** @type {Record<string, KodaelusMode>} */
  const modes = {};
  for (const id of conversationIds) {
    modes[id] = store.modes[id] ?? "main";
  }

  const payload = {
    conversationIds,
    modes,
    updatedAt: new Date().toISOString(),
  };
  const tmpPath = join(dir, `active-sessions.${process.pid}.tmp`);
  try {
    writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    renameSync(tmpPath, storePath);
  } catch (err) {
    rmSync(tmpPath, { force: true });
    throw err;
  }
}

/**
 * Detect Kodaelus mode from a user prompt. Priority: deactivate → bugfix → bug → prompt → main.
 * @param {string} prompt
 * @returns {KodaelusMode | null}
 */
export function detectKodaelusMode(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return null;
  const text = prompt.trim();

  if (isDeactivatePrompt(text)) return null;

  if (/\bbugfix\b/i.test(text) || /\bbug[-\s]fix\b/i.test(text)) {
    return "main";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(2|b|bug)\b/i.test(text) ||
    /\bkodaelus\s+(2|bug\s+mode)\b/i.test(text) ||
    /\bkodaelus\s+b\b/i.test(text)
  ) {
    return "bug";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(1|p|prompt)\b/i.test(text) ||
    /\bkodaelus\s+(1|planner|prompt\s+mode)\b/i.test(text)
  ) {
    return "prompt";
  }

  if (/\b(run it|execute)\b/i.test(text)) {
    return "main";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus(?:\s+(0|main))?\b/i.test(text) ||
    /\bkodaelus\s+mode\b/i.test(text)
  ) {
    return "main";
  }

  return null;
}

export function isActivatePrompt(prompt) {
  return detectKodaelusMode(prompt) !== null;
}

export function isDeactivatePrompt(prompt) {
  return typeof prompt === "string" && DEACTIVATE.test(prompt);
}

export function isSessionActive(conversationId) {
  if (!conversationId) return false;
  try {
    return withStoreLock(
      () => readStoreUnlocked().conversationIds.includes(conversationId),
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} conversationId
 * @returns {KodaelusMode | null}
 */
export function getSessionMode(conversationId) {
  if (!conversationId) return null;
  try {
    return withStoreLock(() => {
      const store = readStoreUnlocked();
      if (!store.conversationIds.includes(conversationId)) return null;
      return store.modes[conversationId] ?? "main";
    });
  } catch {
    return null;
  }
}

/**
 * @param {string} conversationId
 * @param {KodaelusMode} mode
 */
export function setSessionMode(conversationId, mode) {
  if (!conversationId) return false;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return false;
    store.modes[conversationId] = mode;
    writeStoreUnlocked(store);
    return true;
  });
}

/**
 * @param {string} conversationId
 * @param {KodaelusMode} [mode='main']
 */
export function activateSession(conversationId, mode = "main") {
  if (!conversationId) return false;
  const resolvedMode = mode === "prompt" || mode === "bug" ? mode : "main";
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    const alreadyActive = store.conversationIds.includes(conversationId);
    if (alreadyActive) {
      store.modes[conversationId] = resolvedMode;
      writeStoreUnlocked(store);
      return true;
    }
    store.conversationIds.push(conversationId);
    store.modes[conversationId] = resolvedMode;
    writeStoreUnlocked(store);
    return true;
  });
}

export function deactivateSession(conversationId) {
  if (!conversationId) return false;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    const nextIds = store.conversationIds.filter((id) => id !== conversationId);
    if (nextIds.length === store.conversationIds.length) return false;
    const nextModes = { ...store.modes };
    delete nextModes[conversationId];
    writeStoreUnlocked({ conversationIds: nextIds, modes: nextModes });
    return true;
  });
}

export function clearSession(conversationId) {
  return deactivateSession(conversationId);
}
