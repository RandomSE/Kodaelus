/** @typedef {'main' | 'prompt' | 'bug' | 'suggest' | 'lite' | 'question'} KodaelusMode */

const DEACTIVATE =
  /\b(stop|disable|exit|end|leave)\s+kodaelus\b|\bnormal\s+mode\b|\bwithout\s+kodaelus\b/i;

export const MUTATING_MODES = new Set(["main", "lite"]);
export const READ_ONLY_MODES = new Set(["prompt", "suggest", "question"]);

/**
 * @param {string} prompt
 */
export function isDeactivatePrompt(prompt) {
  return typeof prompt === "string" && DEACTIVATE.test(prompt);
}

/**
 * @param {string} prompt
 * @returns {KodaelusMode | null}
 */
export function detectKodaelusMode(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return null;
  const text = prompt.trim();

  if (isDeactivatePrompt(text)) return null;

  if (/\bbugfix\b/i.test(text) || /\bbug[-\s]fix\b/i.test(text)) {
    return "main";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(2|b|bug)\b/i.test(text) ||
    /\bkodaelus\s+(2|bug\s+mode)\b/i.test(text) ||
    /\bkodaelus\s+b\b/i.test(text)
  ) {
    return "bug";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+suggest\b/i.test(text) ||
    /\bkodaelus\s+suggest\s+mode\b/i.test(text) ||
    /\buse\s+kodaelus\s+3\b/i.test(text)
  ) {
    return "suggest";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(q|question)\b/i.test(text) ||
    /\bkodaelus\s+question\s+mode\b/i.test(text) ||
    /\buse\s+kodaelus\s+5\b/i.test(text)
  ) {
    return "question";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(lite|fast)\b/i.test(text) ||
    /\bkodaelus\s+lite\s+mode\b/i.test(text) ||
    /\buse\s+kodaelus\s+4\b/i.test(text)
  ) {
    return "lite";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus\s+(1|p|prompt)\b/i.test(text) ||
    /\bkodaelus\s+(1|planner|prompt\s+mode)\b/i.test(text)
  ) {
    return "prompt";
  }

  if (/\b(run it|execute)\b/i.test(text)) {
    return "main";
  }

  if (
    /\b(use|with|activate|enable|switch to)\s+kodaelus(?:\s+(0|main))?\b/i.test(text) ||
    /\bkodaelus\s+mode\b/i.test(text)
  ) {
    return "main";
  }

  return null;
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
