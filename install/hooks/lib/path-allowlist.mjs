/**
 * Shared path allowlists for Bug Investigation writes, Suggest artifacts,
 * secrets fixtures, the product-file budget, and Prepare product-edit exceptions.
 */

import { SUGGESTIONS_DIR_REL } from "./suggestions-diff.mjs";
import { isKodaelusArtifactPath } from "./deletion-guard.mjs";

/** `*.test.*`, `*.tests.*`, `*.spec.*`, `*.specs.*` */
const TEST_FILE_RE = /\.(?:tests?|specs?)\.[^/]+$/i;
/** `*_test.*`, `*_tests.*`, `*_spec.*`, `*_specs.*` (Go, Rust, RSpec). */
const UNDERSCORE_TEST_RE = /_(?:tests?|specs?)\.[^/]+$/i;
/** `test_*.py` and the same prefix in other languages. */
const TEST_PREFIX_RE = /^test_/i;
/** `fixture.json`, `user.fixture.json`, `user_fixture.json`. */
const FIXTURE_FILE_RE = /(?:^|[._-])fixtures?(?:\.[^/]+)+$/i;
/**
 * Directory segments that are test trees. `testing/` and `test-utils/` stay product.
 * `specs` is the plural of `spec`, same as `tests` / `test`.
 */
const TEST_DIR_RE = /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)/i;
/** Fixture and test-data directories, including Jest snapshot folders. */
const TEST_DATA_DIR_RE =
  /(?:^|\/)(?:__fixtures__|__snapshots__|fixtures?|testdata|test-data|test_data)(?:\/|$)/i;
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
 * Java/C#/Kotlin `FooTest.ext` / `FooTests.ext`.
 * Case-sensitive so `latest.ts` and `contest.ts` stay product files.
 * @param {string} base
 * @returns {boolean}
 */
function isPascalTestFile(base) {
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return false;
  const stem = base.slice(0, dot);
  return stem.endsWith("Test") || stem.endsWith("Tests");
}

/**
 * Test file, test tree, or test fixture/data. Project-agnostic.
 * Excluded from the product-file budget. Source files stay included.
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isTestOrSpecPath(relativePath) {
  const normalized = normalizeRelPath(relativePath);
  if (!normalized) return false;
  const base = normalized.split("/").pop() ?? "";
  if (!base || base === "." || base === "..") return false;
  return (
    TEST_FILE_RE.test(base) ||
    UNDERSCORE_TEST_RE.test(base) ||
    TEST_PREFIX_RE.test(base) ||
    FIXTURE_FILE_RE.test(base) ||
    isPascalTestFile(base) ||
    TEST_DIR_RE.test(normalized) ||
    TEST_DATA_DIR_RE.test(normalized)
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
 * Suggestions suffix from a raw edit path, including Windows extended paths.
 * @param {string} editPath
 * @returns {string | null}
 */
export function suggestionsPathTail(editPath) {
  const normalized = `${editPath ?? ""}`.replace(/\\/g, "/");
  const marker = SUGGESTIONS_DIR_REL;
  const idx = normalized.toLowerCase().indexOf(marker);
  if (idx < 0) return null;
  const before = idx === 0 ? "" : normalized[idx - 1];
  if (before && before !== "/" && before !== ":") return null;
  const tail = normalized.slice(idx).replace(/["'\\].*$/, "");
  if (!tail || tail.includes("..")) return null;
  return tail;
}

/**
 * Posix path.resolve keeps `C:\...` as a relative segment, so the resolved
 * string can contain `.kodaelus/suggestions` without being rooted there.
 * Salvage that Windows absolute form. A real relative path such as
 * `evil/.kodaelus/suggestions` stays unchanged.
 * @param {string} rel
 * @param {string} raw
 * @returns {string}
 */
export function resolveSuggestWritePath(rel, raw) {
  const tail = suggestionsPathTail(raw);
  if (!tail || !isSuggestArtifactPath(tail)) return rel;
  const normalizedRel = `${rel ?? ""}`.replace(/\\/g, "/");
  if (isSuggestArtifactPath(normalizedRel)) return rel;
  if (/^[A-Za-z]:\//.test(normalizedRel)) return tail;
  if (normalizedRel.includes(".kodaelus/suggestions")) return rel;
  if (tail === normalizedRel || tail.endsWith(`/${normalizedRel}`)) return tail;
  return rel;
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
 * Product paths for the file budget, Prepare fix-cycle cap, and Ship CI repairs.
 * Test files, diagnostic paths, and `.kodaelus/**` are not product files.
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
