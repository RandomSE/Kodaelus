/**
 * Shared preference-intent heuristics for hooks and SDK (3× learning).
 */

/**
 * @param {string} intent
 */
export function normalizePreferenceKey(intent) {
  return intent.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * @param {string} prompt
 * @returns {string | null}
 */
export function extractPreferenceIntent(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return null;
  if (/\buse\s+kodaelus\b/i.test(prompt)) return null;
  if (/\b(stop|disable)\s+kodaelus\b/i.test(prompt)) return null;
  if (/\brestore\b/i.test(prompt) || /\bundo\s+last\s+delete\b/i.test(prompt)) return null;
  if (/\?\s*$/.test(prompt.trim())) return null;
  if (/^(how|what|why|when|where|can you|could you|should we|is there)\b/i.test(prompt.trim())) {
    return null;
  }

  const patterns = [
    /(?:^|[.!?\n]\s*)(?:always|from now on|every time|please always)\s+(.{10,160})/i,
    /\b(?:prefer|preferred)\s+(?:to\s+)?(.{10,160})/i,
    /(?:^|[.!?\n]\s*)remember\s+(?:to\s+)?(?:always\s+)?(.{10,160})/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match?.[1]) {
      const intent = match[1].trim().replace(/[.!?]+$/, "");
      if (intent.length < 10) continue;
      if (/^(fix|implement|add|create|update|delete|refactor|build|ship|debug|write|make)\b/i.test(intent)) {
        continue;
      }
      if (!/\b(use|run|prefer|avoid|never|always|pnpm|npm|vitest|jest|eslint|typescript|python)\b/i.test(intent)) {
        continue;
      }
      return intent;
    }
  }

  return null;
}
