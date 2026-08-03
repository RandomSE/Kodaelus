/**
 * AskQuestion / clarifying-question guard helpers.
 * Policy primary; preToolUse deny arms when Cursor wires AskQuestion into hooks.
 */

export const MAX_FOLLOWUP_CHARS = 800;

/** Modes where AskQuestion should be denied when hooks fire. */
export const DENY_ASK_QUESTION_MODES = new Set(["main", "lite", "bug", "prepare"]);

/**
 * Keep false until Cursor confirms AskQuestion/AskUserQuestion fire preToolUse.
 * When true, installers may set `"failClosed": true` on the ask-question-guard
 * preToolUse entry in hooks.json.
 */
export const ASK_QUESTION_HOOK_FAIL_CLOSED_READY = false;

/**
 * @param {unknown} name
 * @returns {boolean}
 */
export function isAskQuestionToolName(name) {
  if (typeof name !== "string" || !name.trim()) return false;
  const normalized = name.toLowerCase().replace(/[_\s-]+/g, "");
  return (
    normalized === "askquestion" ||
    normalized === "askuserquestion" ||
    normalized.includes("askuserquestion") ||
    (normalized.includes("askquestion") && !normalized.includes("task"))
  );
}

/**
 * @param {string | null | undefined} mode
 * @returns {boolean}
 */
export function shouldDenyAskQuestion(mode) {
  if (mode == null || mode === "") return false;
  return DENY_ASK_QUESTION_MODES.has(`${mode}`.toLowerCase());
}

/**
 * @returns {{
 *   permission: 'deny',
 *   user_message: string,
 *   agent_message: string,
 * }}
 */
export function buildDenyPayload() {
  return {
    permission: "deny",
    user_message:
      "Kodaelus blocked AskQuestion in a mutating mode. Resolve via Cursor clarifying questions resolution priority, then continue.",
    agent_message:
      "Kodaelus ask-question-guard denied AskQuestion/AskUserQuestion. " +
      "Apply Cursor clarifying questions resolution priority (task spec, minimal scope, convention, safer default). " +
      "Document the question, chosen answer, rule used, and Confidence: NN% | Evidence: ... inline. " +
      "Do not re-ask via AskQuestion. If below 70% confidence after rules 1-4, present a specific rule-5 recommendation to the user.",
  };
}

/**
 * Strip fenced and inline code so docs/examples do not trip clarification detection.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripCodeForClarificationScan(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ");
}

/**
 * Conservative detection of agent prose waiting on the user.
 * Prefer precision over recall: require direct asks or interrogatives.
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export function detectOpenClarification(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  const t = stripCodeForClarificationScan(text);

  // Strong direct asks (no question-mark gate)
  if (/\bplease choose\b/i.test(t)) return true;
  if (/\bpick one\b[:.]?/i.test(t)) return true;
  if (/\bselect (one|an option)\b/i.test(t)) return true;
  if (/\bwhich (would you|do you) (prefer|want|choose)\b/i.test(t)) return true;

  // Medium: require a nearby question mark (same ~window) to avoid docs like
  // "user may reply with scope approved" or narrative "which option was chosen".
  if (/\bwhich option\b[^?\n]{0,100}\?/i.test(t)) return true;
  if (/\breply with\b[^?\n]{0,80}\?/i.test(t)) return true;
  if (/\bshould I\b[^?\n]{0,120}\?/i.test(t)) return true;

  // A/B choice blocks only when introduced as a pick/choose/option prompt
  const choiceIntro =
    /\b(pick one|please choose|select one|which option|options?:)\b[\s\S]{0,120}\b[A-C]\)\s+\S[\s\S]{0,200}\b[B-C]\)\s+\S/i;
  if (choiceIntro.test(t)) return true;

  if (
    /\b(pick one|please choose|select one|which option)\b[\s\S]{0,80}\bOption\s+[A-C]\b[\s\S]{0,120}\bOption\s+[B-C]\b/i.test(
      t,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * @param {string} message
 * @param {number} [max=MAX_FOLLOWUP_CHARS]
 * @returns {string}
 */
export function truncateMessage(message, max = MAX_FOLLOWUP_CHARS) {
  if (typeof message !== "string") return "";
  if (message.length <= max) return message;
  return `${message.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * @param {object} [params]
 * @param {number} [params.loopCount]
 * @returns {string}
 */
export function buildStopFollowupMessage({ loopCount = 0 } = {}) {
  if (loopCount >= 1) {
    return truncateMessage(
      "Kodaelus ask-question-guard: delivery still appears to wait on user clarification. " +
        "Apply resolution priority (task spec, minimal scope, convention, safer default). " +
        "If still below 70% after rules 1-4, emit a rule 5 recommendation " +
        "(question + recommended answer + Confidence: NN% | Evidence: ...). Do not call AskQuestion.",
    );
  }

  return truncateMessage(
    "Kodaelus ask-question-guard: open clarification detected in delivery. " +
      "Do not pause for AskQuestion. Apply Cursor clarifying questions resolution priority: " +
      "(1) task spec, (2) minimal scope, (3) convention, (4) safer default. " +
      "Log question, chosen answer, rule, and Confidence: NN% | Evidence: ... then continue. " +
      "Rule 5 only if confidence stays below 70%.",
  );
}
