/**
 * Delivery section presence checks for Main / Bug / Prepare stop hooks.
 *
 * Progress may be one short sentence (or none). The Plan-first message is
 * exempt from the length >= 500 Full-structure rule. Only the final report
 * of the turn (stop) must use Main Full section order with Follow-Up Queue
 * last. Do not rename required headings (Plan, Delivery Self-Check,
 * Follow-Up Queue).
 */

const SELF_CHECK_RE = /##\s*Delivery Self-Check\b/i;
const FOLLOW_UP_RE = /##\s*Follow-Up Queue\b/i;
const PREPARE_VERDICT_RE =
  /##\s*(?:Prepare\s+)?(?:Verdict|Ready(?:\s+vs\s+Not ready)?)\b|\bVerdict\s*:\s*(?:Ready|Not ready)\b/i;
const DELIVERY_TIER_RE = /\bDelivery\s+Tier\b/i;
const DELIVERY_TIER_CONFIDENCE_RE =
  /Delivery\s+Tier[\s\S]{0,240}?Confidence:\s*\d{1,3}%[^\n]{0,120}Evidence:/i;

/**
 * Delivery Tier line must include Confidence: NN% | Evidence: (stop-check).
 * Does not change the Confidence keyword itself.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasDeliveryTierConfidenceEvidence(text) {
  if (typeof text !== "string" || !DELIVERY_TIER_RE.test(text)) return false;
  return DELIVERY_TIER_CONFIDENCE_RE.test(text);
}

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
 * @param {{ prepareCapped?: boolean, shipCiCapped?: boolean }} [options]
 * @returns {string[]}
 */
export function findMissingDeliverySections(mode, text, options = {}) {
  /** @type {string[]} */
  const missing = [];
  const body = `${text ?? ""}`;

  if (mode === "lite") {
    if (!/##\s*Tests\b/i.test(body)) missing.push("Tests");
    if (!hasDeliverySelfCheck(body)) missing.push("Delivery Self-Check");
    return missing;
  }

  if (mode === "main" || mode === "bug") {
    if (!hasDeliverySelfCheck(body)) missing.push("Delivery Self-Check");
    if (!hasFollowUpQueue(body)) missing.push("Follow-Up Queue");
    else if (!isFollowUpQueueFinalSection(body)) {
      missing.push("Follow-Up Queue (must be final section)");
    }
  }

  if (mode === "main" && DELIVERY_TIER_RE.test(body) && !hasDeliveryTierConfidenceEvidence(body)) {
    missing.push("Delivery Tier Confidence: NN% | Evidence:");
  }

  if (mode === "prepare") {
    if (!hasDeliverySelfCheck(body)) missing.push("Delivery Self-Check");
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

  if (mode === "ship") {
    if (!hasDeliverySelfCheck(body)) missing.push("Delivery Self-Check");
    const verdict = detectPrepareVerdict(body);
    if (!verdict.hasVerdictSection) {
      missing.push("Ready vs Not ready verdict");
    }
    const ci = shipCiOutcome(body);
    if (verdict.ready) {
      if (!/##\s*Commit\b/i.test(body)) missing.push("Commit");
      if (!/##\s*Push\b/i.test(body)) missing.push("Push");
      if (!/##\s*(?:PR|Pull request)\b/i.test(body)) missing.push("PR");
      if (!/https?:\/\/\S+/i.test(body)) missing.push("PR link");
      if (ci === "missing") missing.push("CI status");
    }
    if (options.prepareCapped && verdict.ready) {
      missing.push("Not ready (required when prepare fix-cycle cap reached)");
    }
    if (options.shipCiCapped && verdict.ready) {
      missing.push("Not ready (required when ship CI-repair cap reached)");
    }
    const needsFollowUp =
      options.prepareCapped ||
      options.shipCiCapped ||
      verdict.notReady ||
      ci === "fail" ||
      ci === "pending";
    if (needsFollowUp) {
      if (!hasFollowUpQueue(body)) missing.push("Follow-Up Queue");
      else if (!isFollowUpQueueFinalSection(body)) {
        missing.push("Follow-Up Queue (must be final section)");
      }
    }
  }

  return missing;
}

/**
 * @param {string} body
 * @returns {"pass" | "fail" | "pending" | "missing"}
 */
function shipCiOutcome(body) {
  const match = body.match(/##\s*CI\b[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (!match) return "missing";
  const section = match[1];
  if (/\b(fail|failed|failure)\b/i.test(section)) return "fail";
  if (/\bpending\b/i.test(section)) return "pending";
  if (/\b(pass|passed|green|success)\b/i.test(section)) return "pass";
  return "missing";
}

/**
 * @param {string[]} missing
 * @param {string} mode
 * @param {number} [loopCount]
 * @returns {string}
 */
export function buildDeliveryStructureFollowup(missing, mode, loopCount = 0) {
  const list = missing.join("; ");
  if (mode === "lite") {
    return (
      `Kodaelus delivery-structure guard (Mode Lite, abbreviated, loop_limit soft follow-up): missing ${list}. ` +
      "Add ## Tests and a short ## Delivery Self-Check. Follow-Up Queue stays omitted unless the change is non-trivial."
    );
  }
  if (mode === "ship") {
    return (
      `Kodaelus delivery-structure guard (Ship): missing ${list}. ` +
      "Include Delivery Self-Check, a Ready or Not ready verdict, and Commit, Push, PR, and CI when Ready. " +
      "Follow-Up Queue is required when Not ready or CI failed, and omitted when Ready and CI is green."
    );
  }
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
