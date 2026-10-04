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

/** @typedef {'main' | 'prompt' | 'bug' | 'suggest' | 'lite' | 'question' | 'prepare'} KodaelusMode */
/** @typedef {'issues' | 'features'} SuggestSubMode */

/**
 * @typedef {object} PendingDelete
 * @property {string} path
 * @property {string} backupPath
 * @property {string} manifestWrittenAt
 * @property {boolean} verified
 */

/**
 * @typedef {object} ShellEvidenceEntry
 * @property {string} command
 * @property {string} outcome
 * @property {string} at
 */

/**
 * @typedef {object} SessionMetadata
 * @property {number | null} planFileEstimate
 * @property {string[]} touchedFiles
 * @property {boolean} scopeApproved
 * @property {PendingDelete[]} pendingDeletes
 * @property {SuggestSubMode | null} suggestSubMode
 * @property {number} prepareSuiteAttempts
 * @property {number} prepareFixCycleCount
 * @property {boolean} prepareContinueApproved
 * @property {number} shipCiRepairCount
 * @property {boolean} shipCiRepairOpen
 * @property {boolean} shipCiContinueApproved
 * @property {number} shipCiPollCount
 * @property {number} shipCiPendingPolls
 * @property {string} lastUserPrompt
 * @property {boolean | null} lastPromptHadExplicitMode
 * @property {ShellEvidenceEntry[]} shellEvidence
 * @property {{ command: string, outcome: string, stdout: string, at: string } | null} firstFailingTest
 */

import {
  detectExplicitMutatingUpgradeMode,
  detectKodaelusMode,
  isBugInvestigationMode,
  isDeactivatePrompt,
  isMutatingMode,
  isReadOnlyMode,
} from "./kodaelus-mode.mjs";

export {
  detectExplicitMutatingUpgradeMode,
  detectKodaelusMode,
  isBugInvestigationMode,
  isDeactivatePrompt,
  isMutatingMode,
  isReadOnlyMode,
} from "./kodaelus-mode.mjs";

const SCOPE_APPROVE = /\b(scope approved|proceed with scope|approve scope)\b/i;
const PREPARE_CONTINUE =
  /\b(prepare continue|ship continue|allow more fix cycles|continue prepare fix(?:es| cycles)?)\b/i;
/** Max fix-rerun cycles before product edits are denied (policy soft cap). */
export const PREPARE_MAX_FIX_CYCLES = 3;
/** Product fixes allowed after a red Ship CI check, then `ship ci continue`. */
export const SHIP_CI_MAX_REPAIRS = 3;
/** Pending `gh pr checks` / `gh run view` polls before Ship must escalate. */
export const SHIP_CI_MAX_PENDING_POLLS = 4;
const SHIP_CI_CONTINUE = /\bship ci continue\b/i;

const LOCK_STALE_MS = 30_000;
const LOCK_MAX_WAIT_MS = Number(process.env.KODAELUS_STORE_LOCK_MAX_WAIT_MS) || 5_000;
const LOCK_POLL_MS = 10;

/** @returns {SessionMetadata} */
function emptyMetadata() {
  return {
    planFileEstimate: null,
    touchedFiles: [],
    scopeApproved: false,
    pendingDeletes: [],
    suggestSubMode: null,
    prepareSuiteAttempts: 0,
    prepareFixCycleCount: 0,
    prepareContinueApproved: false,
    shipCiRepairCount: 0,
    shipCiRepairOpen: false,
    shipCiContinueApproved: false,
    shipCiPollCount: 0,
    shipCiPendingPolls: 0,
    lastUserPrompt: "",
    lastPromptHadExplicitMode: null,
    shellEvidence: [],
    firstFailingTest: null,
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
    value === "question" ||
    value === "prepare" ||
    value === "ship"
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
  if (typeof record.prepareSuiteAttempts === "number" && record.prepareSuiteAttempts >= 0) {
    base.prepareSuiteAttempts = Math.floor(record.prepareSuiteAttempts);
  }
  if (typeof record.prepareFixCycleCount === "number" && record.prepareFixCycleCount >= 0) {
    base.prepareFixCycleCount = Math.floor(record.prepareFixCycleCount);
  }
  if (record.prepareContinueApproved === true) base.prepareContinueApproved = true;
  if (typeof record.shipCiRepairCount === "number" && record.shipCiRepairCount >= 0) {
    base.shipCiRepairCount = Math.floor(record.shipCiRepairCount);
  }
  if (record.shipCiRepairOpen === true) base.shipCiRepairOpen = true;
  if (record.shipCiContinueApproved === true) base.shipCiContinueApproved = true;
  if (typeof record.shipCiPollCount === "number" && record.shipCiPollCount >= 0) {
    base.shipCiPollCount = Math.floor(record.shipCiPollCount);
  }
  if (typeof record.shipCiPendingPolls === "number" && record.shipCiPendingPolls >= 0) {
    base.shipCiPendingPolls = Math.floor(record.shipCiPendingPolls);
  }
  if (typeof record.lastUserPrompt === "string") {
    base.lastUserPrompt = record.lastUserPrompt.slice(0, 2000);
  }
  if (record.lastPromptHadExplicitMode === true || record.lastPromptHadExplicitMode === false) {
    base.lastPromptHadExplicitMode = record.lastPromptHadExplicitMode;
  }
  if (Array.isArray(record.shellEvidence)) {
    base.shellEvidence = record.shellEvidence
      .filter((row) => row && typeof row === "object")
      .map((row) => {
        const item = /** @type {Record<string, unknown>} */ (row);
        return {
          command: `${item.command ?? ""}`,
          outcome: `${item.outcome ?? ""}`,
          at: `${item.at ?? ""}`,
        };
      })
      .filter((row) => row.command)
      .slice(-50);
  }
  if (record.firstFailingTest && typeof record.firstFailingTest === "object") {
    const fail = /** @type {Record<string, unknown>} */ (record.firstFailingTest);
    const command = `${fail.command ?? ""}`;
    if (command) {
      base.firstFailingTest = {
        command,
        outcome: `${fail.outcome ?? ""}`,
        stdout: `${fail.stdout ?? ""}`.slice(0, 8000),
        at: `${fail.at ?? ""}`,
      };
    }
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

  const maxAttempts = 8;
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
    } catch (err) {
      lastError = err;
      sleepSync(LOCK_POLL_MS);
    }
  }

  throw new Error(
    `session-store: failed to read ${storePath} after ${maxAttempts} attempts: ${lastError?.message ?? "unknown error"}`,
  );
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

export function isActivatePrompt(prompt) {
  return detectKodaelusMode(prompt) !== null;
}

export function isScopeApprovePrompt(prompt) {
  return typeof prompt === "string" && SCOPE_APPROVE.test(prompt);
}

export function isPrepareContinuePrompt(prompt) {
  return typeof prompt === "string" && PREPARE_CONTINUE.test(prompt);
}

/**
 * Unlock phrase for the Ship CI-repair cap. Does not match bare `ship continue`.
 * @param {string} prompt
 * @returns {boolean}
 */
export function isShipCiContinuePrompt(prompt) {
  return typeof prompt === "string" && SHIP_CI_CONTINUE.test(prompt);
}

/**
 * @param {string} command
 * @param {string} output
 * @returns {"fail" | "pending" | "pass" | null}
 */
export function classifyShipCiPoll(command, output) {
  if (!/\bgh\s+pr\s+checks\b|\bgh\s+run\s+view\b/i.test(`${command ?? ""}`)) return null;
  const text = `${output ?? ""}`;
  if (/\b(fail|failed|failure)\b/i.test(text)) return "fail";
  if (/\bpending\b|\bin_progress\b|\bqueued\b/i.test(text)) return "pending";
  if (/\b(pass|passed|success)\b/i.test(text)) return "pass";
  return null;
}

/**
 * Remember the latest user prompt so stop soft-gates can tell activation from natural language.
 * @param {string} conversationId
 * @param {string} prompt
 */
export function recordPromptContext(conversationId, prompt) {
  if (!conversationId || typeof prompt !== "string" || !prompt.trim()) return false;
  const explicit = detectKodaelusMode(prompt) != null;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return false;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    meta.lastUserPrompt = prompt.slice(0, 2000);
    meta.lastPromptHadExplicitMode = explicit;
    store.metadata[conversationId] = meta;
    writeStoreUnlocked(store);
    return true;
  });
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
    const previousMode = alreadyActive ? store.modes[conversationId] : null;
    if (!alreadyActive) {
      store.conversationIds.push(conversationId);
      store.metadata[conversationId] = emptyMetadata();
    }
    store.modes[conversationId] = resolvedMode;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    if (subMode) meta.suggestSubMode = subMode;
    if (resolvedMode === "suggest" && subMode) meta.suggestSubMode = subMode;
    const fixCycleMode = resolvedMode === "prepare" || resolvedMode === "ship";
    const wasFixCycleMode = previousMode === "prepare" || previousMode === "ship";
    if (fixCycleMode && !wasFixCycleMode) {
      meta.prepareSuiteAttempts = 0;
      meta.prepareFixCycleCount = 0;
      meta.prepareContinueApproved = false;
    }
    if (!fixCycleMode) {
      meta.prepareContinueApproved = false;
    }
    if (resolvedMode === "ship" && previousMode !== "ship") {
      meta.shipCiRepairCount = 0;
      meta.shipCiRepairOpen = false;
      meta.shipCiContinueApproved = false;
      meta.shipCiPollCount = 0;
      meta.shipCiPendingPolls = 0;
    }
    if (resolvedMode !== "ship") {
      meta.shipCiContinueApproved = false;
    }
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

/**
 * @param {string} conversationId
 */
export function approvePrepareContinue(conversationId) {
  if (!conversationId) return false;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return false;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    meta.prepareContinueApproved = true;
    store.metadata[conversationId] = meta;
    writeStoreUnlocked(store);
    return true;
  });
}

/**
 * Record a Prepare full-suite attempt. After the first attempt, further suite
 * runs count as fix-rerun cycles (capped at PREPARE_MAX_FIX_CYCLES).
 * @param {string} conversationId
 * @returns {{ suiteAttempts: number, fixCycleCount: number } | null}
 */
export function recordPrepareSuiteAttempt(conversationId) {
  if (!conversationId) return null;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return null;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    meta.prepareSuiteAttempts += 1;
    if (meta.prepareSuiteAttempts > 1) {
      meta.prepareFixCycleCount = Math.min(
        PREPARE_MAX_FIX_CYCLES,
        meta.prepareFixCycleCount + 1,
      );
    }
    store.metadata[conversationId] = meta;
    writeStoreUnlocked(store);
    return {
      suiteAttempts: meta.prepareSuiteAttempts,
      fixCycleCount: meta.prepareFixCycleCount,
    };
  });
}

/**
 * @param {string} conversationId
 * @returns {boolean}
 */
export function isPrepareFixCycleCapped(conversationId) {
  const meta = getSessionMetadata(conversationId);
  if (!meta) return false;
  if (meta.prepareContinueApproved) return false;
  return meta.prepareFixCycleCount >= PREPARE_MAX_FIX_CYCLES;
}

/**
 * @param {string} conversationId
 */
export function approveShipCiContinue(conversationId) {
  if (!conversationId) return false;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return false;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    meta.shipCiContinueApproved = true;
    store.metadata[conversationId] = meta;
    writeStoreUnlocked(store);
    return true;
  });
}

/**
 * @param {string} conversationId
 * @param {"fail" | "pending" | "pass"} outcome
 */
export function recordShipCiPoll(conversationId, outcome) {
  if (!conversationId) return null;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return null;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    meta.shipCiPollCount += 1;
    if (outcome === "pass") {
      meta.shipCiRepairOpen = false;
      meta.shipCiRepairCount = 0;
      meta.shipCiPendingPolls = 0;
      meta.shipCiContinueApproved = false;
    } else if (outcome === "fail") {
      if (!meta.shipCiRepairOpen) meta.shipCiRepairCount = 0;
      meta.shipCiRepairOpen = true;
      meta.shipCiPendingPolls = 0;
    } else if (outcome === "pending") {
      meta.shipCiPendingPolls += 1;
    }
    store.metadata[conversationId] = meta;
    writeStoreUnlocked(store);
    return {
      pollCount: meta.shipCiPollCount,
      pendingPolls: meta.shipCiPendingPolls,
      repairCount: meta.shipCiRepairCount,
    };
  });
}

/**
 * Count one product edit while a CI repair is open. No-op when the cap is already hit.
 * @param {string} conversationId
 * @returns {{ capped: boolean, repairCount: number } | null}
 */
export function recordShipCiRepairEdit(conversationId) {
  if (!conversationId) return null;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return null;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    if (!meta.shipCiRepairOpen || meta.shipCiContinueApproved) {
      return { capped: false, repairCount: meta.shipCiRepairCount };
    }
    if (meta.shipCiRepairCount >= SHIP_CI_MAX_REPAIRS) {
      return { capped: true, repairCount: meta.shipCiRepairCount };
    }
    meta.shipCiRepairCount += 1;
    store.metadata[conversationId] = meta;
    writeStoreUnlocked(store);
    return { capped: false, repairCount: meta.shipCiRepairCount };
  });
}

/**
 * @param {string} conversationId
 * @returns {boolean}
 */
export function isShipCiRepairCapped(conversationId) {
  const meta = getSessionMetadata(conversationId);
  if (!meta || meta.shipCiContinueApproved || !meta.shipCiRepairOpen) return false;
  return meta.shipCiRepairCount >= SHIP_CI_MAX_REPAIRS;
}

/**
 * @param {string} conversationId
 * @returns {boolean}
 */
export function isShipCiPollLimited(conversationId) {
  const meta = getSessionMetadata(conversationId);
  if (!meta) return false;
  return meta.shipCiPendingPolls >= SHIP_CI_MAX_PENDING_POLLS;
}

/**
 * @param {string} conversationId
 * @param {string} command
 * @param {string} [outcome]
 */
export function recordShellEvidence(conversationId, command, outcome = "") {
  if (!conversationId || !command) return false;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return false;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    meta.shellEvidence.push({
      command: `${command}`.slice(0, 500),
      outcome: `${outcome}`.slice(0, 200),
      at: new Date().toISOString(),
    });
    if (meta.shellEvidence.length > 50) {
      meta.shellEvidence = meta.shellEvidence.slice(-50);
    }
    store.metadata[conversationId] = meta;
    writeStoreUnlocked(store);
    return true;
  });
}

/**
 * Persist the first failing cargo/npm test stdout for TDD red-phase evidence.
 *
 * @param {string} conversationId
 * @param {{ command: string, outcome?: string, stdout?: string }} entry
 */
export function recordFirstFailingTest(conversationId, entry) {
  if (!conversationId || !entry?.command) return false;
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    if (!store.conversationIds.includes(conversationId)) return false;
    const meta = store.metadata[conversationId] ?? emptyMetadata();
    if (meta.firstFailingTest) return true;
    meta.firstFailingTest = {
      command: `${entry.command}`.slice(0, 500),
      outcome: `${entry.outcome ?? ""}`.slice(0, 200),
      stdout: `${entry.stdout ?? ""}`.slice(0, 8000),
      at: new Date().toISOString(),
    };
    store.metadata[conversationId] = meta;
    writeStoreUnlocked(store);
    return true;
  });
}

