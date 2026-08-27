/**
 * TDD write-order / red-phase helpers for Main (not Mode Lite).
 */

import { isProductEditPath, isTestOrSpecPath } from "./path-allowlist.mjs";
import { isTestLikeShellCommand } from "./test-evidence-guard.mjs";

/**
 * @param {string} [outcome]
 * @returns {boolean}
 */
export function isFailingTestOutcome(outcome) {
  const text = `${outcome ?? ""}`.trim();
  if (!text) return false;
  if (/\bexit\s*=\s*0\b/i.test(text)) return false;
  if (/\bexit\s*=\s*-?[1-9]\d*\b/i.test(text)) return true;
  if (/\bfail(?:ed|ure)?\b/i.test(text)) return true;
  return false;
}

/**
 * @param {{ command?: string, outcome?: string } | null | undefined} firstFailingTest
 * @param {{ command?: string, outcome?: string }[]} [shellEvidence]
 * @returns {boolean}
 */
export function hasFailingTestRun(firstFailingTest, shellEvidence = []) {
  if (firstFailingTest && isFailingTestOutcome(firstFailingTest.outcome)) {
    return true;
  }
  return (shellEvidence ?? []).some(
    (row) => isTestLikeShellCommand(row.command ?? "") && isFailingTestOutcome(row.outcome),
  );
}

/**
 * @param {{ command?: string, outcome?: string }[]} shellEvidence
 * @returns {boolean}
 */
export function firstTestCommandWasGreenWithoutPriorFail(shellEvidence = []) {
  const tests = (shellEvidence ?? []).filter((row) =>
    isTestLikeShellCommand(row.command ?? ""),
  );
  if (tests.length === 0) return false;
  const first = tests[0];
  if (isFailingTestOutcome(first.outcome)) return false;
  return /\bexit\s*=\s*0\b/i.test(`${first.outcome ?? ""}`) || /pass|\bok\b/i.test(`${first.outcome ?? ""}`);
}

/**
 * Main greenfield/new-behavior: do not treat product impl as TDD-complete
 * (and deny product writes) until a failing test run is recorded.
 * Mode Lite is never blocked.
 *
 * @param {object} params
 * @param {string} params.mode
 * @param {string[]} params.relativePaths
 * @param {string[]} [params.touchedFiles]
 * @param {{ command?: string, outcome?: string } | null} [params.firstFailingTest]
 * @param {{ command?: string, outcome?: string }[]} [params.shellEvidence]
 * @returns {boolean}
 */
export function shouldDenyProductWriteForTddRedPhase({
  mode,
  relativePaths,
  touchedFiles = [],
  firstFailingTest = null,
  shellEvidence = [],
}) {
  if (mode !== "main") return false;
  if (hasFailingTestRun(firstFailingTest, shellEvidence)) return false;

  const paths = Array.isArray(relativePaths) ? relativePaths : [];
  const prior = Array.isArray(touchedFiles) ? touchedFiles : [];
  const writingProduct = paths.some((rel) => isProductEditPath(rel));
  if (!writingProduct) return false;

  const wroteTests =
    prior.some((rel) => isTestOrSpecPath(rel)) || paths.some((rel) => isTestOrSpecPath(rel));
  return wroteTests;
}

/**
 * Delivery Self-Check Fail: first test command was already green and no
 * earlier failing run was recorded. Skips Mode Lite.
 *
 * @param {object} params
 * @param {string} params.mode
 * @param {string[]} [params.touchedFiles]
 * @param {{ command?: string, outcome?: string }[]} [params.shellEvidence]
 * @param {{ command?: string, outcome?: string } | null} [params.firstFailingTest]
 * @returns {boolean}
 */
export function tddRedPhaseSelfCheckFails({
  mode,
  touchedFiles = [],
  shellEvidence = [],
  firstFailingTest = null,
}) {
  if (mode !== "main") return false;
  if (hasFailingTestRun(firstFailingTest, shellEvidence)) return false;
  const implemented = (touchedFiles ?? []).some((rel) => isProductEditPath(rel));
  if (!implemented) return false;
  return firstTestCommandWasGreenWithoutPriorFail(shellEvidence);
}

/**
 * @returns {{ permission: 'deny', user_message: string, agent_message: string }}
 */
export function denyTddRedPhase() {
  return {
    permission: "deny",
    user_message:
      "Kodaelus TDD red phase: run a failing test (cargo test / npm test) before product implementation files.",
    agent_message:
      "TDD write order: a failing test run must exist before product impl. Run the test command now (expect fail), then implement. Mode Lite is not blocked.",
  };
}

/**
 * @param {number} [loopCount]
 * @returns {string}
 */
export function buildTddRedPhaseFollowup(loopCount = 0) {
  const prefix =
    loopCount >= 1
      ? "Kodaelus TDD order guard: still no recorded failing test run. "
      : "Kodaelus TDD order guard: first test command was already green (red phase skipped). ";
  return (
    prefix +
    "Record a failing cargo/npm test before treating product impl as TDD-complete. " +
    "Delivery Self-Check TDD write order row is Fail."
  );
}
