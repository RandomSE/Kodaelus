/** Shared policy keywords validated by install smoke tests and SDK instructions tests. */

export const CORE_POLICY_KEYWORDS = [
  "## Task-Type Workflows",
  "## File Deletion Protocol",
  "## Cross-Cutting Safeguards",
  "## Follow-Up Queue",
  "Reproduction-first protocol",
  "Entry-point detection",
];

export const HARDENED_POLICY_KEYWORDS = [
  "## Delivery Tiers",
  "**Full**",
  "**Standard**",
  "**Lite**",
  "## Delivery Self-Check",
  "Do not claim complete if any applicable row is Fail",
  "**Below 70% = Delivery Self-Check Fail**",
  "## Test Discovery & CI Parity",
  "No test infrastructure detected",
  "CI parity",
  ".kodaelus/deletion-manifest.json",
  ".kodaelus/baselines/",
  "### Documentation update",
  "### Maintenance",
  "Minimum **2 reruns**",
  "FLaky",
  "instrumentation diff",
  "**Contract**",
  "Makefile",
  "justfile",
  "vite.config",
  "webpack.config",
  "turbo.json",
  "nx.json",
  ".kodaelus/insights.md",
  "monorepo",
  "workspace",
  "### Request Conflict Protocol",
  "## Escalation Protocol",
  "Escalation Block",
  "### Scope creep guardrail",
  "Concurrent modification",
  "### Performance Evidence",
  "Confidence: NN% | Evidence:",
  "### Bug Investigation mode",
  "Bug Investigation Dossier",
  ".kodaelus/bugs/",
  "use kodaelus main",
  "detectKodaelusMode",
];

/**
 * @param {string} content
 * @returns {string[]} missing keywords
 */
export function findMissingPolicyKeywords(content) {
  const missing = [];
  for (const keyword of [...CORE_POLICY_KEYWORDS, ...HARDENED_POLICY_KEYWORDS]) {
    if (!content.includes(keyword)) {
      missing.push(keyword);
    }
  }
  return missing;
}

/**
 * @param {string} content
 * @param {number} [minLength=5000]
 */
export function validateInstructionsPolicy(content, minLength = 5000) {
  const errors = [];
  if (content.length < minLength) {
    errors.push(`instructions.md should be at least ${minLength} characters`);
  }
  const missing = findMissingPolicyKeywords(content);
  for (const keyword of missing) {
    errors.push(`missing keyword: ${keyword}`);
  }
  return errors;
}
