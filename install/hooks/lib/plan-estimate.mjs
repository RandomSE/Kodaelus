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
 * Product-file budget from a Plan line such as `File count: 4` or `File count: twenty`.
 * Accepts a bold label (`**File count:** 4`). Blast radius and prose like
 * "estimate 12 files" are ignored so a later reply cannot replace the count.
 * @param {string} text
 * @returns {number | null}
 */
export function parseFileCountFromText(text) {
  if (typeof text !== "string" || !text.trim()) return null;

  const digit = text.match(
    /\*{0,2}\s*file\s+count\s*:\s*\*{0,2}\s*~?\s*(\d{1,3})\b/i,
  );
  if (digit?.[1]) {
    const value = Number.parseInt(digit[1], 10);
    if (Number.isFinite(value) && value > 0) return value;
  }

  const word = text.match(
    /\*{0,2}\s*file\s+count\s*:\s*\*{0,2}\s*([a-z][\w-]*)/i,
  );
  if (word?.[1]) {
    const value = parseWordNumber(word[1]);
    if (value != null && value > 0) return value;
  }

  return null;
}
