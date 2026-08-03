/** Unicode en dash (U+2013) and em dash (U+2014). */
export const UNICODE_DASH_CHARS = "\u2013\u2014";
export const UNICODE_DASH_RE = /[\u2013\u2014]/;
export const UNICODE_DASH_RUN_RE = /[\u2013\u2014]{2,}/g;
export const UNICODE_DASH_GLOBAL_RE = /[\u2013\u2014]/g;

export const MAX_FOLLOWUP_CHARS = 800;
export const MAX_SNIPPET_CHARS = 80;
export const DEFAULT_VIOLATION_LIMIT = 3;

const RULES_REMINDER =
  "Use ASCII only: comma or semicolon for clause breaks, hyphen for ranges, - for lists. No U+2013 or U+2014.";

/**
 * @param {string} text
 * @returns {boolean}
 */
export function containsUnicodeDash(text) {
  return typeof text === "string" && UNICODE_DASH_RE.test(text);
}

/**
 * @param {string} text
 * @returns {number}
 */
export function countUnicodeDashes(text) {
  if (typeof text !== "string") return 0;
  const matches = text.match(UNICODE_DASH_GLOBAL_RE);
  return matches ? matches.length : 0;
}

/**
 * @param {string} text
 * @param {number} [limit=3]
 * @returns {{ index: number, snippet: string, char: string }[]}
 */
export function findUnicodeDashViolations(text, limit = DEFAULT_VIOLATION_LIMIT) {
  /** @type {{ index: number, snippet: string, char: string }[]} */
  const violations = [];
  if (typeof text !== "string") return violations;

  const regex = /[\u2013\u2014]/g;
  let match;
  while ((match = regex.exec(text)) !== null && violations.length < limit) {
    const start = Math.max(0, match.index - 40);
    const end = Math.min(text.length, match.index + 41);
    let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
    if (snippet.length > MAX_SNIPPET_CHARS) {
      snippet = `${snippet.slice(0, MAX_SNIPPET_CHARS - 1)}…`;
    }
    violations.push({
      index: match.index,
      snippet,
      char: match[0],
    });
  }

  return violations;
}

/**
 * @param {string} text
 * @returns {{ preserve: boolean, text: string }[]}
 */
export function splitPreservingCode(text) {
  /** @type {{ preserve: boolean, text: string }[]} */
  const segments = [];
  const fenceRe = /(```[\s\S]*?```|`[^`\n]+`)/g;
  let lastIndex = 0;
  let match;

  while ((match = fenceRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ preserve: false, text: text.slice(lastIndex, match.index) });
    }
    segments.push({ preserve: true, text: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ preserve: false, text: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ preserve: false, text });
  }

  return segments;
}

/**
 * @param {string} text
 * @returns {string}
 */
export function replaceUnicodeDashesInProse(text) {
  if (typeof text !== "string" || !containsUnicodeDash(text)) {
    return text;
  }

  let result = text;

  result = result.replace(/^(\s*)[\u2013\u2014](\s+)/gm, "$1-$2");
  result = result.replace(/(\d+)\s*[\u2013\u2014]\s*(\d+)/g, "$1 - $2");
  result = result.replace(
    /([^\u2013\u2014\n]+?)\s*[\u2013\u2014]\s*([^\u2013\u2014\n]+?)\s*[\u2013\u2014]\s*([^\u2013\u2014\n]+)/g,
    "$1, $2, $3",
  );
  result = result.replace(UNICODE_DASH_RUN_RE, ", ");

  /**
   * @param {string} before
   * @param {string} after
   * @returns {string}
   */
  const pickReplacement = (before, after) => {
    if (/^[a-z]/.test(after)) return ", ";
    if (/^[A-Z]/.test(after)) {
      if (/[.!?]$/.test(before)) return ". ";
      return "; ";
    }
    return ", ";
  };

  result = result.replace(/\s[\u2013\u2014]\s/g, (match, offset, whole) => {
    const afterIdx = offset + match.length;
    const after = whole.slice(afterIdx).trimStart();
    const before = whole.slice(0, offset).trimEnd();
    return pickReplacement(before, after);
  });
  result = result.replace(/(?<=\S)[\u2013\u2014]\s+/g, (match, offset, whole) => {
    const after = whole.slice(offset + match.length).trimStart();
    const before = whole.slice(0, offset).trimEnd();
    return pickReplacement(before, after);
  });
  result = result.replace(/\s+[\u2013\u2014](?=\S)/g, (match, offset, whole) => {
    const after = whole.slice(offset + match.length).trimStart();
    const before = whole.slice(0, offset).trimEnd();
    return pickReplacement(before, after);
  });
  result = result.replace(/(?<=\S)[\u2013\u2014](?=\S)/g, ", ");
  result = result.replace(UNICODE_DASH_GLOBAL_RE, ", ");

  return result;
}

/**
 * @param {string} text
 * @param {{ skipCode?: boolean }} [options]
 * @returns {string}
 */
export function replaceUnicodeDashes(text, options = {}) {
  if (typeof text !== "string") return text;
  const skipCode = options.skipCode !== false;

  if (!skipCode) {
    return replaceUnicodeDashesInProse(text);
  }

  return splitPreservingCode(text)
    .map((segment) =>
      segment.preserve ? segment.text : replaceUnicodeDashesInProse(segment.text),
    )
    .join("");
}

/**
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
export function truncateMessage(text, maxLen = MAX_FOLLOWUP_CHARS) {
  if (typeof text !== "string" || text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * @param {number} count
 * @param {{ index: number, snippet: string, char: string }[]} violations
 * @returns {string}
 */
export function buildPreToolDenyAgentMessage(count, violations) {
  const snippets = violations
    .map((v, i) => `${i + 1}. "${v.snippet}"`)
    .join(" ");
  return truncateMessage(
    `Kodaelus dash guard blocked this edit: ${count} unicode dash character(s) (U+2013/U+2014). ` +
      `Snippets: ${snippets}. ${RULES_REMINDER} Retry the edit using ASCII punctuation only.`,
    1200,
  );
}

/**
 * @param {object} params
 * @param {number} params.count
 * @param {{ index: number, snippet: string, char: string }[]} params.violations
 * @param {string | null} [params.artifactPath]
 * @param {number} [params.loopCount]
 * @returns {string}
 */
export function buildStopFollowupMessage({ count, violations, artifactPath = null, loopCount = 0 }) {
  if (loopCount >= 1) {
    return truncateMessage(
      `Kodaelus dash guard: ${count} unicode dash(es) remain in your delivery. ` +
        `Revise manually using ASCII punctuation only. ${RULES_REMINDER}`,
    );
  }

  const snippetText = violations.length
    ? ` Snippets: ${violations.map((v) => `"${v.snippet}"`).join("; ")}.`
    : "";

  const artifactText = artifactPath ? ` Sanitized reference: ${artifactPath}.` : "";

  return truncateMessage(
    `Kodaelus dash guard: ${count} unicode dash(es) in delivery. ` +
      `Revise the full response without U+2013 or U+2014.${snippetText} ${RULES_REMINDER}${artifactText}`,
  );
}

/**
 * @param {unknown} input
 * @returns {string[]}
 */
export function extractEditableTexts(input) {
  /** @type {string[]} */
  const texts = [];
  if (!input || typeof input !== "object") return texts;

  const record = /** @type {Record<string, unknown>} */ (input);
  const toolInput =
    record.tool_input ??
    record.toolInput ??
    record.arguments ??
    record.input ??
    record;

  if (!toolInput || typeof toolInput !== "object") return texts;
  const ti = /** @type {Record<string, unknown>} */ (toolInput);

  for (const key of ["contents", "new_string", "old_string", "patch"]) {
    if (typeof ti[key] === "string" && ti[key].trim()) {
      texts.push(ti[key]);
    }
  }

  return texts;
}

export { RULES_REMINDER };
