/**
 * Delivery section presence checks for Main / Bug / Prepare stop hooks.
 */

const SELF_CHECK_RE = /##\s*Delivery Self-Check\b/i;
const FOLLOW_UP_RE = /##\s*Follow-Up Queue\b/i;
const PREPARE_VERDICT_RE =
  /##\s*(?:Prepare\s+)?(?:Verdict|Ready(?:\s+vs\s+Not ready)?)\b|\bVerdict\s*:\s*(?:Ready|Not ready)\b/i;

/**
 * @param {string} text
 * @returns {boolean}
 */
export function hasDeliverySelfCheck(text) {
  return typeof text === "string" && SELF_CHECK_RE.test(text);
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function hasFollowUpQueue(text) {
  return typeof text === "string" && FOLLOW_UP_RE.test(text);
}

/**
 * Follow-Up Queue should be the last ## heading.
 * @param {string} text
 * @returns {boolean}
 */
export function isFollowUpQueueFinalSection(text) {
  if (!hasFollowUpQueue(text)) return false;
  const headings = [...`${text}`.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  if (headings.length === 0) return false;
  return /^Follow-Up Queue\b/i.test(headings[headings.length - 1] ?? "");
}

/**
 * @param {string} text
 * @returns {{ ready: boolean, notReady: boolean, hasVerdictSection: boolean }}
 */
export function detectPrepareVerdict(text) {
  const body = `${text ?? ""}`;
  const explicitNotReady = /\bNot ready\b/i.test(body);
  const explicitReady = /\bReady\b/i.test(body) && !explicitNotReady;
  return {
    ready: explicitReady,
    notReady: explicitNotReady,
    hasVerdictSection: PREPARE_VERDICT_RE.test(body) || explicitReady || explicitNotReady,
  };
}

/**
 * @param {string} mode
 * @param {string} text
 * @param {{ prepareCapped?: boolean }} [options]
 * @returns {string[]}
 */
export function findMissingDeliverySections(mode, text, options = {}) {
  /** @type {string[]} */
  const missing = [];
  const body = `${text ?? ""}`;

  if (mode === "main" || mode === "bug") {
    if (!hasDeliverySelfCheck(body)) missing.push("Delivery Self-Check");
    if (!hasFollowUpQueue(body)) missing.push("Follow-Up Queue");
    else if (!isFollowUpQueueFinalSection(body)) {
      missing.push("Follow-Up Queue (must be final section)");
    }
  }

  if (mode === "prepare") {
    const verdict = detectPrepareVerdict(body);
    if (!verdict.hasVerdictSection) {
      missing.push("Ready vs Not ready verdict");
    }
    if (options.prepareCapped || verdict.notReady) {
      if (verdict.ready && options.prepareCapped) {
        missing.push("Not ready (required when prepare fix-cycle cap reached)");
      }
      if (!hasFollowUpQueue(body)) missing.push("Follow-Up Queue");
      else if (!isFollowUpQueueFinalSection(body)) {
        missing.push("Follow-Up Queue (must be final section)");
      }
    }
    if (options.prepareCapped && /proposed commit message|##\s*Proposed commit/i.test(body)) {
      missing.push("omit proposed commit message when Not ready / capped");
    }
  }

  return missing;
}

/**
 * @param {string[]} missing
 * @param {string} mode
 * @param {number} [loopCount]
 * @returns {string}
 */
export function buildDeliveryStructureFollowup(missing, mode, loopCount = 0) {
  const list = missing.join("; ");
  if (loopCount >= 1) {
    return (
      `Kodaelus delivery-structure guard: still missing required sections for ${mode} mode: ${list}. ` +
      "Revise the delivery to include them before stopping."
    );
  }
  return (
    `Kodaelus delivery-structure guard: ${mode} mode requires: ${list}. ` +
    "Add the missing sections (Delivery Self-Check table and/or Follow-Up Queue / Prepare verdict) then stop again."
  );
}
