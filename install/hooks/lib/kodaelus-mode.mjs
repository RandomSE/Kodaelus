/** @typedef {'main' | 'prompt' | 'bug' | 'suggest' | 'lite' | 'question' | 'prepare'} KodaelusMode */

const DEACTIVATE =
  /\b(stop|disable|exit|end|leave)\s+kodaelus\b|\bnormal\s+mode\b|\bwithout\s+kodaelus\b/i;

export const MUTATING_MODES = new Set(["main", "lite", "prepare"]);
export const READ_ONLY_MODES = new Set(["prompt", "suggest", "question"]);

/** Max chars scanned in the leading activation preamble. */
export const LEADING_ACTIVATION_MAX_CHARS = 600;

/**
 * @param {string} prompt
 */
export function isDeactivatePrompt(prompt) {
  return typeof prompt === "string" && DEACTIVATE.test(prompt);
}

/**
 * Leading preamble used for mode activation: first contiguous non-empty lines
 * until a blank line or a markdown heading (after at least one line).
 * Prevents body mentions of "use kodaelus 1" / "kodaelus prompt mode" from
 * overriding a leading `use kodaelus main` upgrade paste.
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
 * Mode detection against a single text slice (no leading-zone preference).
 *
 * @param {string} text
 * @returns {KodaelusMode | null}
 */
export function detectKodaelusModeInText(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const normalized = text.trim();

  if (isDeactivatePrompt(normalized)) return null;

  if (/\bbugfix\b/i.test(normalized) || /\bbug[-\s]fix\b/i.test(normalized)) {
    return "main";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(2|b|bug)\b/i.test(normalized) ||
    /\bkodaelus\s+(2|bug\s+mode)\b/i.test(normalized) ||
    /\bkodaelus\s+b\b/i.test(normalized)
  ) {
    return "bug";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+suggest\b/i.test(normalized) ||
    /\bkodaelus\s+suggest\s+mode\b/i.test(normalized) ||
    /\buse\s+kodaelus\s+3\b/i.test(normalized)
  ) {
    return "suggest";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(q|question)\b/i.test(normalized) ||
    /\bkodaelus\s+question\s+mode\b/i.test(normalized) ||
    /\buse\s+kodaelus\s+5\b/i.test(normalized)
  ) {
    return "question";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(lite|fast)\b/i.test(normalized) ||
    /\bkodaelus\s+lite\s+mode\b/i.test(normalized) ||
    /\buse\s+kodaelus\s+4\b/i.test(normalized)
  ) {
    return "lite";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(prepare|prep|6)\b/i.test(normalized) ||
    /\bkodaelus\s+prepare\s+mode\b/i.test(normalized) ||
    /\buse\s+kodaelus\s+6\b/i.test(normalized)
  ) {
    return "prepare";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(1|p|prompt)\b/i.test(normalized) ||
    /\bkodaelus\s+(1|planner|prompt\s+mode)\b/i.test(normalized)
  ) {
    return "prompt";
  }

  if (/\b(run it|execute)\b/i.test(normalized)) {
    return "main";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus(?:\s+(0|main))?\b/i.test(normalized) ||
    /\bkodaelus\s+mode\b/i.test(normalized)
  ) {
    return "main";
  }

  return null;
}

/**
 * @param {string} prompt
 * @returns {KodaelusMode | null}
 */
export function detectKodaelusMode(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return null;

  // Full-text deactivate always wins (opt-out mid-message).
  if (isDeactivatePrompt(prompt)) return null;

  const leading = extractLeadingActivationZone(prompt);
  const fromLeading = detectKodaelusModeInText(leading);
  if (fromLeading !== null) return fromLeading;

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
