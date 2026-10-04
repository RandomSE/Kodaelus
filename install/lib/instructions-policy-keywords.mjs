import { readFileSync } from "node:fs";
import { join } from "node:path";

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

/** Locked heading for sessions that cannot load ~/.cursor/hooks.json. */
export const HOOK_ABSENT_HEADING = "## Hook-absent contract (cloud / SDK)";

/** Phrases the hook-absent / greenfield policy must spell out (smoke + helper). */
export const HOOK_ABSENT_REQUIRED_PHRASES = [
  "Hook-absent contract",
  "project-guidelines.md",
  "TDD write order",
  "Plan-first message is exempt",
];

export const HARDENED_POLICY_KEYWORDS = [
  "## Purpose & operating model",
  CANONICAL_PURPOSE,
  HOOK_ABSENT_HEADING,
  "Hook-absent contract",
  "project-guidelines.md",
  "TDD write order",
  "emit Plan first",
  "tdd-order-guard.mjs",
  "Plan-first message is exempt",
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
 * @returns {string[]} errors
 */
export function checkHookAbsentContract(content) {
  const errors = [];
  const purposeIdx = content.indexOf("## Purpose & operating model");
  const hookIdx = content.indexOf(HOOK_ABSENT_HEADING);
  const boundsIdx = content.indexOf("## Hard Boundaries");

  if (hookIdx < 0) {
    errors.push(`missing heading: ${HOOK_ABSENT_HEADING}`);
  }
  if (purposeIdx < 0 || boundsIdx < 0) {
    errors.push("missing Purpose or Hard Boundaries headings");
  } else if (hookIdx >= 0 && !(purposeIdx < hookIdx && hookIdx < boundsIdx)) {
    errors.push(
      "Hook-absent contract heading must sit after Purpose & operating model and before Hard Boundaries",
    );
  }
  for (const phrase of HOOK_ABSENT_REQUIRED_PHRASES) {
    if (!content.includes(phrase)) {
      errors.push(`missing phrase: ${phrase}`);
    }
  }
  return errors;
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
  errors.push(...checkHookAbsentContract(content));
  return errors;
}

/** Relative path -> max line count. */
export const POLICY_LINE_CAPS = {
  "core.md": 250,
  "modes/prompt.md": 120,
  "modes/question.md": 80,
  "modes/suggest.md": 80,
  "modes/lite.md": 80,
  "modes/bug.md": 160,
  "modes/prepare.md": 140,
  "modes/ship.md": 140,
  "modes/main.md": 220,
};

/** Named read sets and their max combined line counts. */
export const POLICY_READ_SETS = [
  {
    name: "prompt turn",
    max: 370,
    files: ["core.md", "modes/prompt.md"],
  },
  {
    name: "question turn",
    max: 330,
    files: ["core.md", "modes/question.md"],
  },
  {
    name: "main simple turn",
    max: 550,
    files: [
      "core.md",
      "modes/main.md",
      "tasks/tdd.md",
      "tasks/test-discovery.md",
      "tasks/follow-up-queue.md",
    ],
  },
];

/** Keyword -> owner file under the policy root. */
export const KEYWORD_OWNERS = {
  "## Task-Type Workflows": "modes/main.md",
  "## File Deletion Protocol": "tasks/file-deletion.md",
  "## Cross-Cutting Safeguards": "modes/main.md",
  "## Follow-Up Queue": "tasks/follow-up-queue.md",
  "Reproduction-first protocol": "modes/main.md",
  "Entry-point detection": "tasks/file-deletion.md",
  "## Purpose & operating model": "core.md",
  [CANONICAL_PURPOSE]: "core.md",
  [HOOK_ABSENT_HEADING]: "core.md",
  "Hook-absent contract": "core.md",
  "project-guidelines.md": "core.md",
  "TDD write order": "core.md",
  "emit Plan first": "core.md",
  "tdd-order-guard.mjs": "core.md",
  "Plan-first message is exempt": "core.md",
  "## Delivery Tiers": "modes/main.md",
  "**Full**": "modes/main.md",
  "**Standard**": "modes/main.md",
  "**Lite**": "modes/main.md",
  "## Delivery Self-Check": "fragments/delivery-self-check.md",
  "Do not claim complete if any applicable row is Fail": "fragments/delivery-self-check.md",
  "**Below 70% = Delivery Self-Check Fail**": "core.md",
  "## Test Discovery & CI Parity": "tasks/test-discovery.md",
  "No test infrastructure detected": "tasks/test-discovery.md",
  "CI parity": "tasks/test-discovery.md",
  ".kodaelus/deletion-manifest.json": "tasks/file-deletion.md",
  ".kodaelus/baselines/": "tasks/refactor.md",
  "### Documentation update": "modes/main.md",
  "### Maintenance": "modes/main.md",
  "Minimum **2 reruns**": "tasks/tdd.md",
  FLaky: "tasks/tdd.md",
  "instrumentation diff": "modes/main.md",
  "**Contract**": "modes/main.md",
  Makefile: "tasks/file-deletion.md",
  justfile: "tasks/file-deletion.md",
  "vite.config": "tasks/file-deletion.md",
  "webpack.config": "tasks/file-deletion.md",
  "turbo.json": "tasks/file-deletion.md",
  "nx.json": "tasks/file-deletion.md",
  ".kodaelus/insights.md": "modes/main.md",
  "## Project-Specific Guidelines": "core.md",
  ".kodaelus/instructions.md": "core.md",
  ".kodaelus/preference-log.json": "core.md",
  ensureProjectGuidelines: "core.md",
  "Preference learning": "core.md",
  isReadOnlyMode: "core.md",
  isBugInvestigationMode: "core.md",
  "block-readonly-shell": "core.md",
  extractPreferenceIntent: "core.md",
  monorepo: "tasks/refactor.md",
  workspace: "tasks/refactor.md",
  "### Request Conflict Protocol": "modes/main.md",
  "## Escalation Protocol": "core.md",
  "Escalation Block": "core.md",
  "### Scope creep guardrail": "core.md",
  "scope approved": "core.md",
  "Concurrent modification": "modes/main.md",
  "### Performance Evidence": "modes/main.md",
  "Confidence: NN% | Evidence:": "core.md",
  "### Bug Investigation mode": "modes/bug.md",
  "Bug Investigation Dossier": "modes/bug.md",
  ".kodaelus/bugs/": "modes/bug.md",
  "use kodaelus main": "core.md",
  detectKodaelusMode: "core.md",
  "Placement rule": "tasks/follow-up-queue.md",
  "**Final section.**": "tasks/follow-up-queue.md",
  "### Suggest mode (3)": "modes/suggest.md",
  "use kodaelus suggest issues": "modes/suggest.md",
  ".kodaelus/suggestions/": "modes/suggest.md",
  "### Lite mode (4)": "modes/lite.md",
  "use kodaelus lite": "modes/lite.md",
  "Mode Lite (4) vs Delivery Tier Lite": "core.md",
  "### Question mode (5)": "modes/question.md",
  "use kodaelus question": "modes/question.md",
  "### Prepare mode (6)": "modes/prepare.md",
  "use kodaelus prepare": "modes/prepare.md",
  "guard-delete.mjs": "core.md",
  "Hook enforcement": "core.md",
  "confidence-evidence-guard.mjs": "core.md",
  "Cursor clarifying questions": "core.md",
  "minimal scope": "core.md",
  "ambiguity pre-emption": "modes/prompt.md",
  "activation-safe wording": "modes/prompt.md",
  "fence preamble": "modes/prompt.md",
  "Soft stickiness": "core.md",
  "resolution priority": "core.md",
  "policy-manifest.json": "core.md",
  "IDE: Read fragments/delivery-self-check.md": "core.md",
  recommendKodaelusIntent: "core.md",
  "does not switch mode": "core.md",
  "ASK_QUESTION_HOOK_FAIL_CLOSED_READY": "core.md",
  "Mode Lite or Delivery Tier Lite": "core.md",
  "Same-turn": "core.md",
  "ask-question-guard.mjs": "core.md",
  "delivery-structure-guard.mjs": "core.md",
  "prompt-fence-guard.mjs": "core.md",
  "secrets-guard.mjs": "core.md",
  "test-evidence-guard.mjs": "core.md",
  "shell-evidence-recorder.mjs": "core.md",
  "prepare continue": "modes/prepare.md",
  "use kodaelus ship": "core.md",
  "### Ship mode (7)": "modes/ship.md",
  "ship continue": "modes/ship.md",
  "ship ci continue": "modes/ship.md",
  "recommendation-insights-guard.mjs": "core.md",
};

const RESPONSE_HEADINGS = {
  "modes/main.md": "### Main mode response structure (default Delivery Tier Full)",
  "modes/prompt.md": "## Planner / Prompt response structure",
  "modes/bug.md": "## Bug Investigation response structure",
  "modes/suggest.md": "## Suggest response structure",
  "modes/lite.md": "## Lite response structure",
  "modes/question.md": "## Question response structure",
  "modes/prepare.md": "## Prepare response structure",
  "modes/ship.md": "## Ship response structure",
};

/**
 * Editor-style line count (trailing newline does not add a line).
 * @param {string} text
 */
export function policyLineCount(text) {
  if (!text) return 0;
  const parts = text.split("\n");
  return text.endsWith("\n") ? parts.length - 1 : parts.length;
}

const SELF_CHECK_MODE_MARKERS = {
  "modes/main.md": "main",
  "modes/bug.md": "bug",
  "modes/prepare.md": "prepare",
  "modes/ship.md": "ship",
  "modes/lite.md": "lite",
};

/**
 * @param {string} text
 * @param {string} section
 * @returns {string}
 */
function extractSelfCheckSection(text, section) {
  const re = /<!--\s*kodaelus:self-check\s+([a-z0-9_-]+)\s*-->/gi;
  const matches = [...text.matchAll(re)];
  const idx = matches.findIndex((match) => match[1].toLowerCase() === section.toLowerCase());
  if (idx < 0) return "";
  const start = matches[idx].index + matches[idx][0].length;
  const end = idx + 1 < matches.length ? matches[idx + 1].index : text.length;
  return text.slice(start, end);
}

/**
 * Manifest is the task-pack source of truth. Mode files keep an include marker,
 * not a second copy of the self-check table.
 * @param {(rel: string) => string} load
 * @returns {string[]}
 */
function validateManifestAndFragments(load) {
  /** @type {string[]} */
  const errors = [];
  const raw = load("policy-manifest.json");
  if (!raw) return errors;

  /** @type {{ modes?: Record<string, { always?: string[], tiers?: Record<string, { always?: string[] }>, fragments?: { file: string, section?: string }[] }>, conditional?: { id?: string, file?: string }[] }} */
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    errors.push(
      `policy-manifest.json is not valid JSON (${err instanceof Error ? err.message : "parse failed"})`,
    );
    return errors;
  }

  const modes = manifest.modes ?? {};
  for (const [mode, spec] of Object.entries(modes)) {
    for (const rel of spec.always ?? []) {
      if (!load(rel)) errors.push(`policy-manifest.json ${mode}.always missing file: ${rel}`);
    }
    for (const [tier, tierSpec] of Object.entries(spec.tiers ?? {})) {
      for (const rel of tierSpec.always ?? []) {
        if (!load(rel)) {
          errors.push(`policy-manifest.json ${mode}.tiers.${tier} missing file: ${rel}`);
        }
      }
    }
    for (const frag of spec.fragments ?? []) {
      const body = load(frag.file);
      if (!body) {
        errors.push(`policy-manifest.json ${mode} fragment missing: ${frag.file}`);
        continue;
      }
      if (frag.section) {
        const section = extractSelfCheckSection(body, frag.section);
        if (!section.includes("## Delivery Self-Check")) {
          errors.push(
            `${frag.file} section ${frag.section} must contain ## Delivery Self-Check`,
          );
        }
        if (frag.section === "bug" && section.includes("Before **Outcome Validation**")) {
          errors.push("bug self-check must not depend on Outcome Validation");
        }
        if (
          (frag.section === "prepare" || frag.section === "ship") &&
          section.includes("**TDD write order:**")
        ) {
          errors.push(`${frag.section} self-check must not include a greenfield TDD write-order row`);
        }
        if (frag.section === "lite" && section.includes("## Follow-Up Queue")) {
          errors.push("lite self-check must not require ## Follow-Up Queue");
        }
        if (
          frag.section === "main" &&
          !section.includes("Do not claim complete if any applicable row is Fail")
        ) {
          errors.push("main self-check missing fail rule");
        }
      }
    }
  }

  for (const rule of manifest.conditional ?? []) {
    if (rule.file && !load(rule.file)) {
      errors.push(`policy-manifest.json conditional missing file: ${rule.file}`);
    }
  }

  for (const [rel, section] of Object.entries(SELF_CHECK_MODE_MARKERS)) {
    const marker = `<!-- kodaelus:include fragments/delivery-self-check.md#${section} -->`;
    const modeText = load(rel);
    if (modeText && !modeText.includes(marker)) {
      errors.push(`${rel} missing include marker: ${marker}`);
    }
    const readLine = `IDE: Read fragments/delivery-self-check.md#${section}`;
    if (modeText && !modeText.includes(readLine)) {
      errors.push(`${rel} missing mandatory IDE read line: ${readLine}`);
    }
    if (modeText && modeText.includes("**TDD write order:**")) {
      errors.push(`${rel} must not embed the self-check table (**TDD write order:**)`);
    }
    if (rel !== "modes/main.md" && modeText.includes("Before **Outcome Validation**")) {
      errors.push(`${rel} must not embed the Main Outcome Validation self-check`);
    }
  }

  const bug = load("modes/bug.md");
  if (bug && !bug.includes("**Delivery Self-Check.**")) {
    errors.push("modes/bug.md response structure must list Delivery Self-Check");
  }

  return errors;
}

/**
 * @param {string} policyRoot absolute or relative policy directory
 * @param {{ readFile?: (path: string) => string }} [io]
 * @returns {string[]} errors
 */
export function validatePolicyTree(policyRoot, io = {}) {
  const readFile = io.readFile ?? ((filePath) => readFileSync(filePath, "utf8"));
  /** @type {string[]} */
  const errors = [];

  /** @type {Map<string, string>} */
  const cache = new Map();
  const load = (rel) => {
    if (cache.has(rel)) return cache.get(rel);
    const abs = join(policyRoot, rel);
    let text;
    try {
      text = readFile(abs);
    } catch (err) {
      errors.push(`missing file: ${rel} (${err instanceof Error ? err.message : "read failed"})`);
      text = "";
    }
    cache.set(rel, text);
    return text;
  };

  for (const [rel, max] of Object.entries(POLICY_LINE_CAPS)) {
    const text = load(rel);
    const lines = policyLineCount(text);
    if (text && lines > max) {
      errors.push(`${rel} has ${lines} lines; cap is ${max}`);
    }
  }

  for (const set of POLICY_READ_SETS) {
    let total = 0;
    for (const rel of set.files) {
      total += policyLineCount(load(rel));
    }
    if (total > set.max) {
      errors.push(`${set.name} read set is ${total} lines; cap is ${set.max}`);
    }
  }

  for (const [keyword, owner] of Object.entries(KEYWORD_OWNERS)) {
    const text = load(owner);
    if (text && !text.includes(keyword)) {
      errors.push(`missing keyword in ${owner}: ${keyword}`);
    }
  }

  const core = load("core.md");
  if (core) {
    errors.push(...checkHookAbsentContract(core).map((err) => `core.md: ${err}`));
  }

  const prompt = load("modes/prompt.md");
  if (prompt.includes("## File Deletion Protocol")) {
    errors.push("modes/prompt.md must not contain ## File Deletion Protocol");
  }
  if (prompt.includes("## Bug Investigation mode")) {
    errors.push("modes/prompt.md must not contain ## Bug Investigation mode");
  }

  errors.push(...validateManifestAndFragments(load));

  const modeFiles = Object.keys(RESPONSE_HEADINGS);
  for (const [owner, heading] of Object.entries(RESPONSE_HEADINGS)) {
    if (!load(owner).includes(heading)) {
      errors.push(`${owner} missing response heading: ${heading}`);
    }
    for (const other of modeFiles) {
      if (other !== owner && load(other).includes(heading)) {
        errors.push(`${heading} must live only in ${owner}, also found in ${other}`);
      }
    }
  }

  return errors;
}
