/**
 * Prompt-mode Recommended handoff fence validator.
 */

const MUTATING_UPGRADE_LINE =
  /^(?:use\s+kodaelus\s+(?:main|0|lite|4|fast|prepare|6|prep|bugfix|bug\s+fix|bug-fix)|run\s+it|execute|bugfix|bug\s+fix)\s*$/i;

const PROMPT_ACTIVATION_IN_BODY =
  /\b(?:use\s+kodaelus\s+(?:1|p|prompt)|kodaelus\s+prompt\s+mode|kodaelus\s+planner)\b/i;

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractFencedBlocks(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  /** @type {string[]} */
  const blocks = [];
  const re = /```(?:[^\n`]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    blocks.push(match[1] ?? "");
  }
  return blocks;
}

/**
 * @param {string} block
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function validateHandoffFenceBlock(block) {
  /** @type {string[]} */
  const reasons = [];
  const lines = `${block}`.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i += 1;
  if (i >= lines.length) {
    return { ok: false, reasons: ["empty fenced block"] };
  }

  const first = lines[i].trim();
  if (!MUTATING_UPGRADE_LINE.test(first)) {
    reasons.push(
      "first non-empty fence line must be a mutating upgrade (e.g. use kodaelus main)",
    );
  }

  const afterFirst = i + 1;
  if (afterFirst >= lines.length || lines[afterFirst].trim() !== "") {
    reasons.push("blank line required immediately after the upgrade line");
  }

  const body = lines.slice(afterFirst + 1).join("\n");
  if (PROMPT_ACTIVATION_IN_BODY.test(body) || PROMPT_ACTIVATION_IN_BODY.test(first)) {
    // Upgrade line itself should not be a Prompt activation; body must not embed them.
    if (PROMPT_ACTIVATION_IN_BODY.test(body)) {
      reasons.push(
        "Prompt-mode activation phrases must not appear inside the fence body",
      );
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Require at least one valid Recommended handoff fence in Prompt-mode responses.
 * @param {string} text
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function validatePromptHandoffFence(text) {
  const blocks = extractFencedBlocks(text);
  if (blocks.length === 0) {
    return {
      ok: false,
      reasons: ["missing fenced Recommended Kodaelus Prompt block"],
    };
  }

  /** @type {string[]} */
  const allReasons = [];
  for (const block of blocks) {
    const result = validateHandoffFenceBlock(block);
    if (result.ok) return { ok: true, reasons: [] };
    allReasons.push(...result.reasons);
  }

  return {
    ok: false,
    reasons: [...new Set(allReasons)],
  };
}

/**
 * @param {string[]} reasons
 * @param {number} [loopCount]
 * @returns {string}
 */
export function buildPromptFenceFollowup(reasons, loopCount = 0) {
  const detail = reasons.join("; ");
  if (loopCount >= 1) {
    return (
      `Kodaelus prompt-fence guard: handoff fence still invalid (${detail}). ` +
      "Emit one fenced block: first line mutating upgrade, blank line, activation-safe body."
    );
  }
  return (
    `Kodaelus prompt-fence guard: ${detail}. ` +
    "Required fence preamble: first line = use kodaelus main (or other mutating upgrade), blank line, then body without Prompt activation phrases."
  );
}

export { MUTATING_UPGRADE_LINE, PROMPT_ACTIVATION_IN_BODY };
