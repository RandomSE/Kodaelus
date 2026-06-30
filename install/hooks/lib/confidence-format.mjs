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
 * @param {string} text
 * @param {number} [minLength=500]
 * @returns {boolean}
 */
export function isSubstantiveResponse(text, minLength = 500) {
  return typeof text === "string" && text.trim().length >= minLength;
}
