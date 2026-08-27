/** Shared policy keywords validated by install smoke tests and SDK instructions tests. */

/** Canonical 3-sentence purpose. Same text in README, package.json, and instructions.md. */
export const CANONICAL_PURPOSE =
  "Kodaelus is a Cursor session policy that replaces ad-hoc prompt engineering with locked modes, action boundaries, and delivery formats. Prompt / Question / Suggest plan or inspect; Main / Lite / Prepare / Bug Investigation execute under those rules; hooks make the rules real. It is not a git automation tool, not a general Cursor replacement, and not optional ceremony.";

/** Install-time description one-liner (agent, skill, session rule). First sentence of CANONICAL_PURPOSE. */
export const INSTALL_JOB_ONELINER =
  "Kodaelus is a Cursor session policy that replaces ad-hoc prompt engineering with locked modes, action boundaries, and delivery formats.";

export const CORE_POLICY_KEYWORDS = [
  "## Task-Type Workflows",
  "## File Deletion Protocol",
  "## Cross-Cutting Safeguards",
  "## Follow-Up Queue",
  "Reproduction-first protocol",
  "Entry-point detection",
];

export const HARDENED_POLICY_KEYWORDS = [
  "## Purpose & operating model",
  CANONICAL_PURPOSE,
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
  "## Project-Specific Guidelines",
  ".kodaelus/instructions.md",
  ".kodaelus/preference-log.json",
  "ensureProjectGuidelines",
  "Preference learning",
  "isReadOnlyMode",
  "isBugInvestigationMode",
  "block-readonly-shell",
  "extractPreferenceIntent",
  "monorepo",
  "workspace",
  "### Request Conflict Protocol",
  "## Escalation Protocol",
  "Escalation Block",
  "### Scope creep guardrail",
  "scope approved",
  "Concurrent modification",
  "### Performance Evidence",
  "Confidence: NN% | Evidence:",
  "### Bug Investigation mode",
  "Bug Investigation Dossier",
  ".kodaelus/bugs/",
  "use kodaelus main",
  "detectKodaelusMode",
  "Placement rule",
  "**Final section.**",
  "### Suggest mode (3)",
  "use kodaelus suggest issues",
  ".kodaelus/suggestions/",
  "### Lite mode (4)",
  "use kodaelus lite",
  "Mode Lite (4) vs Delivery Tier Lite",
  "### Question mode (5)",
  "use kodaelus question",
  "### Prepare mode (6)",
  "use kodaelus prepare",
  "guard-delete.mjs",
  "Hook enforcement",
  "confidence-evidence-guard.mjs",
  "Cursor clarifying questions",
  "minimal scope",
  "ambiguity pre-emption",
  "activation-safe wording",
  "fence preamble",
  "Soft stickiness",
  "resolution priority",
  "Same-turn",
  "ask-question-guard.mjs",
  "delivery-structure-guard.mjs",
  "prompt-fence-guard.mjs",
  "secrets-guard.mjs",
  "test-evidence-guard.mjs",
  "shell-evidence-recorder.mjs",
  "prepare continue",
  ".kodaelus/suggestions/",
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
