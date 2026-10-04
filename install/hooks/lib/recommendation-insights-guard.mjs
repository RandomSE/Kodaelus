/**
 * Soft stop checks for intent/ceremony lines and an insights read.
 * Recommendations do not switch mode.
 */

/**
 * Natural-language Main/Lite/Prepare/Ship replies need both lines.
 * @param {unknown} text
 * @returns {boolean}
 */
export function responseMissingRecommendation(text) {
  const body = `${text ?? ""}`;
  const hasActive = /Active mode:/i.test(body);
  const hasRecommendation = /Does not switch mode/i.test(body);
  return !(hasActive && hasRecommendation);
}

/**
 * Evidence is a path mention or an Insights: line.
 * @param {unknown} text
 * @returns {boolean}
 */
export function responseMissingInsightsEvidence(text) {
  const body = `${text ?? ""}`;
  if (/\.kodaelus\/insights\.md/i.test(body)) return false;
  if (/\bInsights:/i.test(body)) return false;
  return true;
}
