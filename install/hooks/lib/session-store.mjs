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

const ACTIVATE =
  /\b(use|with|activate|enable|switch to)\s+kodaelus\b|\bkodaelus\s+mode\b|\bkodaelus\s+1\b|\bkodaelus\s+planner\b|\bkodaelus\s+prompt\s+mode\b/i;
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

function readStoreUnlocked() {
  const storePath = getStorePath();
  if (!existsSync(storePath)) {
    return { conversationIds: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    const ids = Array.isArray(parsed?.conversationIds)
      ? parsed.conversationIds.filter((id) => typeof id === "string" && id.length > 0)
      : [];
    return { conversationIds: [...new Set(ids)] };
  } catch {
    return { conversationIds: [] };
  }
}

function writeStoreUnlocked(conversationIds) {
  const storePath = getStorePath();
  const dir = dirname(storePath);
  mkdirSync(dir, { recursive: true });

  for (const entry of readdirSync(dir)) {
    if (/^active-sessions\.\d+\.tmp$/.test(entry)) {
      rmSync(join(dir, entry), { force: true });
    }
  }

  const payload = {
    conversationIds: [...new Set(conversationIds)],
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

export function isActivatePrompt(prompt) {
  return typeof prompt === "string" && ACTIVATE.test(prompt);
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
    // Fail open: if session state cannot be read, do not block git or other behavior.
    return false;
  }
}

export function activateSession(conversationId) {
  if (!conversationId) return false;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (store.conversationIds.includes(conversationId)) return false;
    writeStoreUnlocked([...store.conversationIds, conversationId]);
    return true;
  });
}

export function deactivateSession(conversationId) {
  if (!conversationId) return false;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    const next = store.conversationIds.filter((id) => id !== conversationId);
    if (next.length === store.conversationIds.length) return false;
    writeStoreUnlocked(next);
    return true;
  });
}

export function clearSession(conversationId) {
  return deactivateSession(conversationId);
}
