/** @typedef {'main' | 'prompt' | 'bug' | 'suggest' | 'lite' | 'question' | 'prepare' | 'ship'} KodaelusMode */

const DEACTIVATE =
  /\b(stop|disable|exit|end|leave)\s+kodaelus\b|\bnormal\s+mode\b|\bwithout\s+kodaelus\b/i;

export const MUTATING_MODES = new Set(["main", "lite", "prepare", "ship"]);
export const READ_ONLY_MODES = new Set(["prompt", "suggest", "question"]);

/** Max chars scanned in the leading activation preamble. */
export const LEADING_ACTIVATION_MAX_CHARS = 600;

/**
 * Explicit mutating upgrade tokens. When any match, leftmost upgrade wins and
 * read-only / bug / suggest phrases in the same message are ignored.
 * @type {{ mode: KodaelusMode, pattern: RegExp }[]}
 */
const MUTATING_UPGRADE_PATTERNS = [
  { mode: "main", pattern: /\bbugfix\b/gi },
  // Spaced/hyphen "bug fix" only with use-kodaelus qualifier or as a whole-line token
  // (avoids prose "Bug fix:" / "Bug fix. TDD." in Recommended specs).
  {
    mode: "main",
    pattern: /\b(use|with|activate|enable|switch to)\s+kodaelus\s+bug[-\s]fix\b/gi,
  },
  {
    mode: "main",
    pattern: /(?:^|\n)\s*bug[-\s]fix\s*[.!]?\s*(?=\n|$)/gi,
  },
  { mode: "main", pattern: /\brun it\b/gi },
  // Standalone upgrade line only (avoid "execute the tests" / "execute the plan").
  { mode: "main", pattern: /(?:^|\n)\s*(?:please\s+)?execute\s*[.!]?\s*(?=\n|$)/gi },
  {
    mode: "main",
    pattern: /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(0|main)\b/gi,
  },
  {
    mode: "main",
    // Bare `use kodaelus` / `use kodaelus` + non-mode words; exclude qualified modes.
    pattern:
      /\b(use|with|activate|enable|switch to)\s+kodaelus\b(?!\s+(0|main|1|p|prompt|2|b|bug|suggest|3|lite|4|fast|q|question|5|prepare|prep|6|ship|7)\b)/gi,
  },
  {
    mode: "lite",
    pattern: /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(lite|fast|4)\b/gi,
  },
  { mode: "lite", pattern: /\bkodaelus\s+lite\s+mode\b/gi },
  {
    mode: "prepare",
    pattern: /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(prepare|prep|6)\b/gi,
  },
  { mode: "prepare", pattern: /\bkodaelus\s+prepare\s+mode\b/gi },
  {
    mode: "ship",
    pattern: /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(ship|7)\b/gi,
  },
  { mode: "ship", pattern: /\bkodaelus\s+ship\s+mode\b/gi },
];

/**
 * Non-upgrade activation phrases (read-only, bug, suggest). Used when no
 * mutating upgrade token is present; leftmost match wins.
 * @type {{ mode: KodaelusMode, pattern: RegExp }[]}
 */
const OTHER_ACTIVATION_PATTERNS = [
  {
    mode: "bug",
    pattern: /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(2|b|bug)\b/gi,
  },
  { mode: "bug", pattern: /\bkodaelus\s+(2|bug\s+mode)\b/gi },
  { mode: "bug", pattern: /\bkodaelus\s+b\b/gi },
  {
    mode: "suggest",
    pattern: /\b(use|with|activate|enable|switch to)\s+kodaelus\s+suggest\b/gi,
  },
  { mode: "suggest", pattern: /\bkodaelus\s+suggest\s+mode\b/gi },
  { mode: "suggest", pattern: /\buse\s+kodaelus\s+3\b/gi },
  {
    mode: "question",
    pattern: /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(q|question)\b/gi,
  },
  { mode: "question", pattern: /\bkodaelus\s+question\s+mode\b/gi },
  { mode: "question", pattern: /\buse\s+kodaelus\s+5\b/gi },
  {
    mode: "prompt",
    pattern: /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(1|p|prompt)\b/gi,
  },
  { mode: "prompt", pattern: /\bkodaelus\s+(1|planner|prompt\s+mode)\b/gi },
  { mode: "main", pattern: /\bkodaelus\s+mode\b/gi },
];

/**
 * @param {string} prompt
 */
export function isDeactivatePrompt(prompt) {
  return typeof prompt === "string" && DEACTIVATE.test(prompt);
}

/**
 * Leading preamble used for mode activation: first contiguous non-empty lines
 * until a blank line or a markdown heading (after at least one line).
 * Retained for callers/tests; primary detection now uses leftmost + upgrade-wins.
 *
 * @param {string} prompt
 * @returns {string}
 */
export function extractLeadingActivationZone(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return "";
  const lines = prompt.replace(/^\uFEFF/, "").split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  let started = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!started) {
      if (!trimmed) continue;
      started = true;
      out.push(line);
      if (out.join("\n").length >= LEADING_ACTIVATION_MAX_CHARS) break;
      continue;
    }
    if (!trimmed) break;
    if (/^#{1,6}\s/.test(trimmed)) break;
    out.push(line);
    if (out.join("\n").length >= LEADING_ACTIVATION_MAX_CHARS) break;
  }

  return out.join("\n").trim();
}

/**
 * @param {string} text
 * @param {{ mode: KodaelusMode, pattern: RegExp }[]} patterns
 * @returns {{ mode: KodaelusMode, index: number } | null}
 */
function findLeftmostMatch(text, patterns) {
  /** @type {{ mode: KodaelusMode, index: number } | null} */
  let best = null;

  for (const { mode, pattern } of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (!match || match.index == null) continue;
    if (best === null || match.index < best.index) {
      best = { mode, index: match.index };
    }
  }

  return best;
}

/**
 * Leftmost explicit mutating upgrade token in text, or null.
 *
 * @param {string} text
 * @returns {KodaelusMode | null}
 */
export function detectExplicitMutatingUpgradeMode(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const hit = findLeftmostMatch(text, MUTATING_UPGRADE_PATTERNS);
  return hit?.mode ?? null;
}

/**
 * Mode detection against a single text slice using leftmost index among peers.
 * Explicit mutating upgrade tokens beat read-only / bug / suggest phrases.
 *
 * @param {string} text
 * @returns {KodaelusMode | null}
 */
export function detectKodaelusModeInText(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const normalized = text.trim();

  if (isDeactivatePrompt(normalized)) return null;

  const upgrade = findLeftmostMatch(normalized, MUTATING_UPGRADE_PATTERNS);
  if (upgrade) return upgrade.mode;

  const other = findLeftmostMatch(normalized, OTHER_ACTIVATION_PATTERNS);
  return other?.mode ?? null;
}

/**
 * @param {string} prompt
 * @returns {KodaelusMode | null}
 */
export function detectKodaelusMode(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return null;

  // Full-text deactivate always wins (opt-out mid-message).
  if (isDeactivatePrompt(prompt)) return null;

  return detectKodaelusModeInText(prompt);
}

/**
 * @param {KodaelusMode | null | undefined} mode
 * @returns {boolean}
 */
export function isMutatingMode(mode) {
  return mode != null && MUTATING_MODES.has(mode);
}

/**
 * @param {KodaelusMode | null | undefined} mode
 * @returns {boolean}
 */
export function isReadOnlyMode(mode) {
  return mode != null && READ_ONLY_MODES.has(mode);
}

/**
 * @param {KodaelusMode | null | undefined} mode
 * @returns {boolean}
 */
export function isBugInvestigationMode(mode) {
  return mode === "bug";
}
