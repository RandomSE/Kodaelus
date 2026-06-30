/** @type {Record<string, number>} */
const WORD_NUMBERS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

/**
 * @param {string} token
 * @returns {number | null}
 */
function parseWordNumber(token) {
  const lower = token.toLowerCase().replace(/[^a-z-]/g, "");
  if (!lower) return null;

  if (lower in WORD_NUMBERS) return WORD_NUMBERS[lower];

  const hyphen = lower.split("-");
  if (hyphen.length === 2) {
    const left = WORD_NUMBERS[hyphen[0]];
    const right = WORD_NUMBERS[hyphen[1]];
    if (left != null && right != null && left >= 20 && right < 10) {
      return left + right;
    }
  }

  return null;
}

/**
 * @param {string} text
 * @returns {number | null}
 */
export function parseFileCountFromText(text) {
  if (typeof text !== "string" || !text.trim()) return null;

  const digitPatterns = [
    /file\s+count[^0-9]{0,40}(\d{1,3})/i,
    /estimate[^0-9]{0,40}(\d{1,3})\s+files?/i,
    /~(\d{1,3})\s+files?/i,
    /(\d{1,3})\s+files?\s+(?:touched|estimated|in\s+scope)/i,
    /blast\s+radius[^0-9]{0,40}(\d{1,3})/i,
  ];

  for (const pattern of digitPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }

  const wordPatterns = [
    /file\s+count[^a-z]{0,40}([a-z][\w-]*)\s+files?/i,
    /estimate[^a-z]{0,40}([a-z][\w-]*)\s+files?/i,
    /~([a-z][\w-]*)\s+files?/i,
    /([a-z][\w-]*)\s+files?\s+(?:touched|estimated|in\s+scope)/i,
  ];

  for (const pattern of wordPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = parseWordNumber(match[1]);
      if (value != null && value > 0) return value;
    }
  }

  return null;
}
