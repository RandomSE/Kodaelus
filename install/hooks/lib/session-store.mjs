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

/** @typedef {'main' | 'prompt' | 'bug' | 'suggest' | 'lite' | 'question'} KodaelusMode */
/** @typedef {'issues' | 'features'} SuggestSubMode */

/**
 * @typedef {object} PendingDelete
 * @property {string} path
 * @property {string} backupPath
 * @property {string} manifestWrittenAt
 * @property {boolean} verified
 */

/**
 * @typedef {object} SessionMetadata
 * @property {number | null} planFileEstimate
 * @property {string[]} touchedFiles
 * @property {boolean} scopeApproved
 * @property {PendingDelete[]} pendingDeletes
 * @property {SuggestSubMode | null} suggestSubMode
 */

const DEACTIVATE =
  /\b(stop|disable|exit|end|leave)\s+kodaelus\b|\bnormal\s+mode\b|\bwithout\s+kodaelus\b/i;

const SCOPE_APPROVE = /\b(scope approved|proceed with scope|approve scope)\b/i;

const LOCK_STALE_MS = 30_000;
const LOCK_MAX_WAIT_MS = 5_000;
const LOCK_POLL_MS = 10;

const MUTATING_MODES = new Set(["main", "lite"]);

/** @returns {SessionMetadata} */
function emptyMetadata() {
  return {
    planFileEstimate: null,
    touchedFiles: [],
    scopeApproved: false,
    pendingDeletes: [],
    suggestSubMode: null,
  };
}

function getStorePath() {
  const cursorHome = process.env.CURSOR_HOME ?? join(homedir(), ".cursor");
  return join(cursorHome, "kodaelus", "active-sessions.json");
}

function getLockPath() {
  return `${getStorePath()}.lock`;
}

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
 * @param {unknown} value
 * @returns {KodaelusMode}
 */
function normalizeMode(value) {
  if (
    value === "main" ||
    value === "prompt" ||
    value === "bug" ||
    value === "suggest" ||
    value === "lite" ||
    value === "question"
  ) {
    return value;
  }
  return "main";
}

/**
 * @param {unknown} raw
 * @returns {SessionMetadata}
 */
function normalizeMetadata(raw) {
  const base = emptyMetadata();
  if (!raw || typeof raw !== "object") return base;

  const record = /** @type {Record<string, unknown>} */ (raw);
  if (typeof record.planFileEstimate === "number" && record.planFileEstimate > 0) {
    base.planFileEstimate = record.planFileEstimate;
  }
  if (Array.isArray(record.touchedFiles)) {
    base.touchedFiles = record.touchedFiles.filter((v) => typeof v === "string");
  }
  if (record.scopeApproved === true) base.scopeApproved = true;
  if (record.suggestSubMode === "issues" || record.suggestSubMode === "features") {
    base.suggestSubMode = record.suggestSubMode;
  }
  if (Array.isArray(record.pendingDeletes)) {
    base.pendingDeletes = record.pendingDeletes
      .filter((row) => row && typeof row === "object")
      .map((row) => {
        const item = /** @type {Record<string, unknown>} */ (row);
        return {
          path: `${item.path ?? ""}`,
          backupPath: `${item.backupPath ?? ""}`,
          manifestWrittenAt: `${item.manifestWrittenAt ?? ""}`,
          verified: item.verified === true,
        };
      })
      .filter((row) => row.path);
  }
  return base;
}

/**
 * @returns {{ conversationIds: string[], modes: Record<string, KodaelusMode>, metadata: Record<string, SessionMetadata> }}
 */
function readStoreUnlocked() {
  const storePath = getStorePath();
  if (!existsSync(storePath)) {
    return { conversationIds: [], modes: {}, metadata: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    const ids = Array.isArray(parsed?.conversationIds)
      ? parsed.conversationIds.filter((id) => typeof id === "string" && id.length > 0)
      : [];
    const conversationIds = [...new Set(ids)];
    /** @type {Record<string, KodaelusMode>} */
    const modes = {};
    /** @type {Record<string, SessionMetadata>} */
    const metadata = {};

    for (const id of conversationIds) {
      const mode = parsed?.modes?.[id];
      modes[id] = normalizeMode(mode);
      metadata[id] = normalizeMetadata(parsed?.metadata?.[id]);
    }

    return { conversationIds, modes, metadata };
  } catch {
    return { conversationIds: [], modes: {}, metadata: {} };
  }
}

/**
 * @param {{ conversationIds: string[], modes: Record<string, KodaelusMode>, metadata: Record<string, SessionMetadata> }} store
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
  /** @type {Record<string, SessionMetadata>} */
  const metadata = {};

  for (const id of conversationIds) {
    modes[id] = store.modes[id] ?? "main";
    metadata[id] = store.metadata[id] ?? emptyMetadata();
  }

  const payload = {
    conversationIds,
    modes,
    metadata,
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
 * @param {string} prompt
 * @returns {SuggestSubMode | null}
 */
export function detectSuggestSubMode(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return null;
  const text = prompt.trim();
  if (/\b(use|with|activate|enable|switch to)\s+kodaelus\s+suggest\s+issues\b/i.test(text)) {
    return "issues";
  }
  if (/\b(use|with|activate|enable|switch to)\s+kodaelus\s+suggest\s+features\b/i.test(text)) {
    return "features";
  }
  return null;
}

/**
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
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+suggest\b/i.test(text) ||
    /\bkodaelus\s+suggest\s+mode\b/i.test(text) ||
    /\buse\s+kodaelus\s+3\b/i.test(text)
  ) {
    return "suggest";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(q|question)\b/i.test(text) ||
    /\bkodaelus\s+question\s+mode\b/i.test(text) ||
    /\buse\s+kodaelus\s+5\b/i.test(text)
  ) {
    return "question";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(lite|fast)\b/i.test(text) ||
    /\bkodaelus\s+lite\s+mode\b/i.test(text) ||
    /\buse\s+kodaelus\s+4\b/i.test(text)
  ) {
    return "lite";
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

export function isScopeApprovePrompt(prompt) {
  return typeof prompt === "string" && SCOPE_APPROVE.test(prompt);
}

/**
 * @param {KodaelusMode | null | undefined} mode
 * @returns {boolean}
 */
export function isMutatingMode(mode) {
  return mode != null && MUTATING_MODES.has(mode);
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
 * @returns {SessionMetadata | null}
 */
export function getSessionMetadata(conversationId) {
  if (!conversationId) return null;
  try {
    return withStoreLock(() => {
      const store = readStoreUnlocked();
      if (!store.conversationIds.includes(conversationId)) return null;
      return store.metadata[conversationId] ?? emptyMetadata();
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
 * @param {number} estimate
 */
export function setPlanFileEstimate(conversationId, estimate) {
  if (!conversationId || !Number.isFinite(estimate) || estimate <= 0) return false;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return false;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    meta.planFileEstimate = estimate;
    store.metadata[conversationId] = meta;
    writeStoreUnlocked(store);
    return true;
  });
}

/**
 * @param {string} conversationId
 */
export function approveScope(conversationId) {
  if (!conversationId) return false;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return false;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    meta.scopeApproved = true;
    store.metadata[conversationId] = meta;
    writeStoreUnlocked(store);
    return true;
  });
}

/**
 * @param {string} conversationId
 * @param {string} relativePath
 */
export function recordTouchedFile(conversationId, relativePath) {
  if (!conversationId || !relativePath) return false;
  const normalized = relativePath.replace(/\\/g, "/");
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return false;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    if (!meta.touchedFiles.includes(normalized)) {
      meta.touchedFiles.push(normalized);
    }
    store.metadata[conversationId] = meta;
    writeStoreUnlocked(store);
    return true;
  });
}

/**
 * @param {string} conversationId
 * @returns {number}
 */
export function getScopeLimit(conversationId) {
  const meta = getSessionMetadata(conversationId);
  const estimate = meta?.planFileEstimate;
  return Math.max(10, estimate ? estimate * 2 : 10);
}

/**
 * @param {string} conversationId
 * @returns {{ exceeded: boolean, count: number, limit: number }}
 */
export function getScopeStatus(conversationId) {
  const meta = getSessionMetadata(conversationId);
  const count = meta?.touchedFiles.length ?? 0;
  const limit = getScopeLimit(conversationId);
  const exceeded = count > limit && meta?.scopeApproved !== true;
  return { exceeded, count, limit };
}

/**
 * @param {string} conversationId
 * @param {PendingDelete} pending
 */
export function addPendingDelete(conversationId, pending) {
  if (!conversationId || !pending?.path) return false;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return false;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    meta.pendingDeletes.push({
      path: pending.path,
      backupPath: pending.backupPath,
      manifestWrittenAt: pending.manifestWrittenAt,
      verified: pending.verified === true,
    });
    store.metadata[conversationId] = meta;
    writeStoreUnlocked(store);
    return true;
  });
}

/**
 * @param {string} conversationId
 * @param {string} path
 */
export function markPendingDeleteVerified(conversationId, path) {
  if (!conversationId || !path) return false;
  const normalized = path.replace(/\\/g, "/");
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return false;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    for (const row of meta.pendingDeletes) {
      if (row.path.replace(/\\/g, "/") === normalized) {
        row.verified = true;
      }
    }
    store.metadata[conversationId] = meta;
    writeStoreUnlocked(store);
    return true;
  });
}

/**
 * @param {string} conversationId
 * @returns {PendingDelete[]}
 */
export function getUnverifiedPendingDeletes(conversationId) {
  const meta = getSessionMetadata(conversationId);
  return (meta?.pendingDeletes ?? []).filter((row) => !row.verified);
}

/**
 * @param {string} conversationId
 * @param {KodaelusMode} [mode='main']
 * @param {SuggestSubMode | null} [suggestSubMode=null]
 */
export function activateSession(conversationId, mode = "main", suggestSubMode = null) {
  if (!conversationId) return false;
  const resolvedMode = normalizeMode(mode);
  const subMode =
    suggestSubMode === "issues" || suggestSubMode === "features" ? suggestSubMode : null;

  return withStoreLock(() => {
    const store = readStoreUnlocked();
    const alreadyActive = store.conversationIds.includes(conversationId);
    if (!alreadyActive) {
      store.conversationIds.push(conversationId);
      store.metadata[conversationId] = emptyMetadata();
    }
    store.modes[conversationId] = resolvedMode;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    if (subMode) meta.suggestSubMode = subMode;
    if (resolvedMode === "suggest" && subMode) meta.suggestSubMode = subMode;
    store.metadata[conversationId] = meta;
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
    const nextMetadata = { ...store.metadata };
    delete nextModes[conversationId];
    delete nextMetadata[conversationId];
    writeStoreUnlocked({ conversationIds: nextIds, modes: nextModes, metadata: nextMetadata });
    return true;
  });
}

export function clearSession(conversationId) {
  return deactivateSession(conversationId);
}
