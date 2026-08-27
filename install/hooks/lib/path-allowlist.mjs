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

/**
 * Allow Suggest-mode shell mkdir targeting .kodaelus/suggestions/** only.
 * @param {string} command
 * @returns {boolean}
 */
export function isAllowedSuggestShellCommand(command) {
  const normalized = `${command}`.trim();
  if (!normalized) return false;

  const mkdirMatch = normalized.match(
    /^(?:mkdir(?:\s+(?:-p|--parents))*|md|New-Item(?:\s+-ItemType\s+Directory)?)\s+(.+)$/i,
  );
  if (!mkdirMatch?.[1]) return false;

  const args = mkdirMatch[1]
    .replace(/["']/g, "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith("-"));

  if (args.length === 0) return false;
  return args.every((arg) => isSuggestArtifactPath(normalizeRelPath(arg)));
}

export { SUGGESTIONS_DIR_REL };
