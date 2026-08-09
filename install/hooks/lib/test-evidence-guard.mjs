/**
 * Test-evidence soft-gate helpers for Main / Prepare stop.
 */

import { isKodaelusArtifactPath } from "./deletion-guard.mjs";
import { isTestOrSpecPath } from "./path-allowlist.mjs";

const IMPLEMENTATION_HEADING = /^##\s+Implementation\b/im;
const TEST_OUTCOME_IN_TEXT =
  /(?:\bnpm\s+(?:run\s+)?test\b|\bvitest\b|\bpytest\b|\bcargo\s+test\b|\bgo\s+test\b).{0,120}?(?:pass|fail|ok|exit\s*[:=]?\s*\d+)/is;

const FULL_SUITE_SHELL =
  /(?:^|[;&|]\s*)(?:npm\s+(?:run\s+)?test(?:\s|$)|npm\s+run\s+test:|pnpm\s+(?:run\s+)?test(?:\s|$)|yarn\s+(?:run\s+)?test(?:\s|$)|vitest\s+run\b|npx\s+vitest\s+run\b|pytest(?:\s|$)|cargo\s+test\b|go\s+test\b)/i;

/**
 * @param {string} command
 * @returns {boolean}
 */
export function isTestLikeShellCommand(command) {
  const cmd = `${command}`.trim();
  if (!cmd) return false;
  return (
    FULL_SUITE_SHELL.test(cmd) ||
    /\bnode\s+--test\b/i.test(cmd) ||
    /\bnpm\s+run\s+test(?::\w+)?\b/i.test(cmd) ||
    /\bvitest\b/i.test(cmd)
  );
}

/**
 * @param {string} command
 * @returns {boolean}
 */
export function isFullSuiteShellCommand(command) {
  return FULL_SUITE_SHELL.test(`${command}`.trim());
}

/**
 * @param {string[]} touchedFiles
 * @returns {boolean}
 */
export function touchedProductImplementation(touchedFiles) {
  if (!Array.isArray(touchedFiles) || touchedFiles.length === 0) return false;
  return touchedFiles.some((file) => {
    const rel = `${file}`.replace(/\\/g, "/");
    if (isKodaelusArtifactPath(rel)) return false;
    if (isTestOrSpecPath(rel)) return false;
    return true;
  });
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function hasSubstantiveImplementationSection(text) {
  if (typeof text !== "string" || !IMPLEMENTATION_HEADING.test(text)) return false;
  const match = text.match(/##\s+Implementation\b([\s\S]*?)(?=\n##\s+|$)/i);
  const body = match?.[1]?.trim() ?? "";
  return body.length >= 80;
}

/**
 * @param {string} text
 * @param {{ command: string, outcome?: string }[]} [shellEvidence]
 * @returns {boolean}
 */
export function hasTestEvidence(text, shellEvidence = []) {
  if (Array.isArray(shellEvidence) && shellEvidence.some((row) => isTestLikeShellCommand(row.command))) {
    return true;
  }
  if (typeof text === "string" && TEST_OUTCOME_IN_TEXT.test(text)) {
    return true;
  }
  if (
    typeof text === "string" &&
    /##\s+Tests\b/i.test(text) &&
    /\b(pass|fail|exit\s*code|ok)\b/i.test(text)
  ) {
    return true;
  }
  return false;
}

/**
 * @param {object} params
 * @param {string} params.text
 * @param {string[]} [params.touchedFiles]
 * @param {{ command: string, outcome?: string }[]} [params.shellEvidence]
 * @returns {boolean}
 */
export function needsTestEvidenceGate({ text, touchedFiles = [], shellEvidence = [] }) {
  const implemented =
    touchedProductImplementation(touchedFiles) ||
    hasSubstantiveImplementationSection(text);
  if (!implemented) return false;
  return !hasTestEvidence(text, shellEvidence);
}

/**
 * @param {number} [loopCount]
 * @returns {string}
 */
export function buildTestEvidenceFollowup(loopCount = 0) {
  if (loopCount >= 1) {
    return (
      "Kodaelus test-evidence guard: Implementation occurred but still no recorded test command outcome. " +
      "Run tests and cite command + result in Tests / Verification, or ensure shell evidence was recorded."
    );
  }
  return (
    "Kodaelus test-evidence soft-gate: Implementation occurred without recorded test outcomes " +
    "in the delivery or session shell log. Run the test command, record pass/fail, then stop again."
  );
}
