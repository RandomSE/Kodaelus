/**
 * @param {string} text
 * @returns {string[]}
 */
export function findConfidenceViolations(text) {
  if (typeof text !== "string" || !text.trim()) return [];

  const violations = [];
  const regex = /Confidence:\s*\d{1,3}%/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const window = text.slice(match.index, match.index + 200);
    if (!/Evidence:/.test(window)) {
      violations.push(match[0]);
    }
  }

  return violations;
}

/**
 * Plan-first opener (often >= 500 chars) is not a final report.
 * True when the text declares Plan / Delivery Tier but does not yet include
 * Delivery Self-Check or Follow-Up Queue.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isPlanFirstOnlyMessage(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  const body = text.trim();
  if (/##\s*Follow-Up Queue\b/i.test(body) || /##\s*Delivery Self-Check\b/i.test(body)) {
    return false;
  }
  return /##\s*Plan\b/i.test(body) || /\bDelivery\s+Tier\b/i.test(body);
}

/**
 * @param {string} text
 * @param {number} [minLength=500]
 * @param {{ event?: string, finalReport?: boolean }} [options]
 * @returns {boolean}
 */
export function isSubstantiveResponse(text, minLength = 500, options = {}) {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Final report of the turn (stop) must use Main Full section order.
  // Plan-first messages are exempt from the length >= minLength rule.
  // Progress may be one short sentence (well under minLength) or none.
  if (options.finalReport === true || options.event === "stop") return true;
  if (isPlanFirstOnlyMessage(trimmed)) return false;
  return trimmed.length >= minLength;
}
