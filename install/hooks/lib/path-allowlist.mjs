/**
 * Shared path allowlists for Bug Investigation writes, Suggest artifacts,
 * secrets fixtures, and Prepare product-edit exceptions.
 */

import { SUGGESTIONS_DIR_REL } from "./suggestions-diff.mjs";
import { isKodaelusArtifactPath } from "./deletion-guard.mjs";

const TEST_FILE_RE = /\.(?:test|spec)\.[^/]+$/i;
const UNDERSCORE_TEST_RE = /_test\.[^/]+$/i;
const RUST_TESTS_DIR_RE = /(?:^|\/)tests\/.+\.rs$/i;
const DIAGNOSTIC_DIR_RE =
  /(?:^|\/)(?:debug|diag|diagnostic|instrument|instrumentation|repro)(?:\/|$)/i;
const DIAGNOSTIC_FILE_RE =
  /(?:^|\/)(?:debug[-_].+|.*[-_]debug\.[^/]+|repro[-_].+|instrument(?:ation)?[-_].+)$/i;

/**
 * @param {string} relativePath
 * @returns {string}
 */
export function normalizeRelPath(relativePath) {
  return `${relativePath ?? ""}`.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isTestOrSpecPath(relativePath) {
  const normalized = normalizeRelPath(relativePath);
  if (!normalized) return false;
  const base = normalized.split("/").pop() ?? normalized;
  return (
    TEST_FILE_RE.test(base) ||
    TEST_FILE_RE.test(normalized) ||
    UNDERSCORE_TEST_RE.test(base) ||
    RUST_TESTS_DIR_RE.test(normalized)
  );
}

/**
 * Heuristic diagnostic / instrumentation paths outside .kodaelus/.
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isDiagnosticInstrumentationPath(relativePath) {
  const normalized = normalizeRelPath(relativePath);
  if (!normalized) return false;
  return DIAGNOSTIC_DIR_RE.test(normalized) || DIAGNOSTIC_FILE_RE.test(normalized);
}

/**
 * Bug Investigation Write/StrReplace/ApplyPatch allowlist.
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isBugDiagnosticWritePath(relativePath) {
  const normalized = normalizeRelPath(relativePath);
  if (!normalized) return false;
  return (
    isKodaelusArtifactPath(normalized) ||
    isTestOrSpecPath(normalized) ||
    isDiagnosticInstrumentationPath(normalized)
  );
}

/**
 * Suggest-mode persistence tree only.
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isSuggestArtifactPath(relativePath) {
  const normalized = normalizeRelPath(relativePath);
  if (!normalized) return false;
  return (
    normalized === SUGGESTIONS_DIR_REL ||
    normalized.startsWith(`${SUGGESTIONS_DIR_REL}/`)
  );
}

/**
 * Paths where intentional fake secrets are allowed.
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isSecretsFixturePath(relativePath) {
  const normalized = normalizeRelPath(relativePath);
  if (!normalized) return false;
  if (isKodaelusArtifactPath(normalized)) return true;
  if (isTestOrSpecPath(normalized)) return true;
  if (/(?:^|\/)fixtures?(?:\/|$)/i.test(normalized)) return true;
  if (/fixture/i.test(normalized.split("/").pop() ?? "")) return true;
  return false;
}

/**
 * Product paths (not test/diagnostic/.kodaelus) for Prepare fix-cycle cap.
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isProductEditPath(relativePath) {
  const normalized = normalizeRelPath(relativePath);
  if (!normalized) return false;
  if (isBugDiagnosticWritePath(normalized)) return false;
  return true;
}

/**
 * @param {string} toolName
 * @returns {boolean}
 */
export function isWriteOrStrReplaceTool(toolName) {
  const name = `${toolName}`.toLowerCase().replace(/_/g, "");
  return name.includes("write") || name.includes("strreplace");
}

/**
 * @param {string} toolName
 * @returns {boolean}
 */
export function isWriteStrReplaceOrPatchTool(toolName) {
  const name = `${toolName}`.toLowerCase().replace(/_/g, "");
  return (
    name.includes("write") ||
    name.includes("strreplace") ||
    name.includes("applypatch")
  );
}

const NON_MKDIR_MUTATOR =
  /\b(?:rm|rmdir|del|erase|remove-item|move-item|copy-item|set-content|out-file|git|npm)\b/i;

/**
 * Collect mkdir / New-Item Directory targets, including a PowerShell if-wrapper.
 * @param {string} command
 * @returns {string[]}
 */
function extractMkdirTargets(command) {
  /** @type {string[]} */
  const targets = [];
  const mkdirRe = /\b(?:mkdir|md)\b([^;&|\n{}]*)/gi;
  let match;
  while ((match = mkdirRe.exec(command))) {
    const args = match[1]
      .replace(/["']/g, "")
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !part.startsWith("-"));
    targets.push(...args);
  }

  const newItemRe = /\bNew-Item\b([^;&|\n{}]*)/gi;
  while ((match = newItemRe.exec(command))) {
    const chunk = match[1];
    if (/\b-ItemType\s+(?!Directory\b)\S+/i.test(chunk)) continue;
    if (!/\b-ItemType\s+Directory\b/i.test(chunk) && !/\bDirectory\b/i.test(chunk)) {
      continue;
    }
    const pathMatch = chunk.match(/-Path\s+("[^"]+"|'[^']+'|\S+)/i);
    if (pathMatch?.[1]) {
      targets.push(pathMatch[1].replace(/["']/g, ""));
      continue;
    }
    const args = chunk
      .replace(/["']/g, "")
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !part.startsWith("-") && !/^Directory$/i.test(part));
    targets.push(...args);
  }
  return targets;
}

/**
 * Allow Suggest-mode shell mkdir targeting .kodaelus/suggestions/** only.
 * Gated forms such as `if (-not (Test-Path ...)) { mkdir ... }` are allowed
 * when every mkdir target stays under that tree.
 * @param {string} command
 * @returns {boolean}
 */
export function isAllowedSuggestShellCommand(command) {
  const normalized = `${command}`.trim();
  if (!normalized) return false;
  if (NON_MKDIR_MUTATOR.test(normalized)) return false;

  const targets = extractMkdirTargets(normalized);
  if (targets.length === 0) return false;
  return targets.every((arg) => isSuggestArtifactPath(normalizeRelPath(arg)));
}

export { SUGGESTIONS_DIR_REL };
