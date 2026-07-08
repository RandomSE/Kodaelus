/**
 * Detect shell commands that mutate the workspace in read-only Kodaelus modes.
 */

const READONLY_SHELL_MUTATOR_PATTERNS = [
  /\bnpm\s+(install|i|ci|add|uninstall|remove|update)\b/i,
  /\bpnpm\s+(install|i|add|remove|update)\b/i,
  /\byarn\s+(install|add|remove|upgrade)\b/i,
  /\bbun\s+(install|add|remove)\b/i,
  /\bpip3?\s+install\b/i,
  /\bcargo\s+(install|add)\b/i,
  /\bgo\s+get\b/i,
  /\bmkdir\b/i,
  /\bmd\s+\S/i,
  /\btouch\s+\S/i,
  /\bNew-Item\b/i,
  /\b(?:cp|copy|xcopy|mv|move|ren|rename)\s+\S/i,
  /\btee\s+\S/i,
  /\bOut-File\b/i,
  /\bSet-Content\b/i,
  /\bAdd-Content\b/i,
  /\bsed\s+-i\b/i,
  /\bnpm\s+run\s+build\b/i,
  /\bpnpm\s+(?:run\s+)?build\b/i,
  /\byarn\s+(?:run\s+)?build\b/i,
  /\bbun\s+run\s+build\b/i,
];

/**
 * Shell redirect / overwrite operators that write outside stdout capture.
 * @param {string} command
 * @returns {boolean}
 */
export function hasMutatingShellRedirect(command) {
  // Strip fd remaps like 2>&1 / 1>&2 so they are not treated as file writes.
  const withoutFdRemaps = `${command}`.replace(/\d*>&\d+/g, " ");
  // Remove null-device redirects, then look for remaining file redirects.
  const withoutNull = withoutFdRemaps.replace(
    /(?:^|[^>])>>?\s*(?:\/dev\/null|\$null|nul)\b/gi,
    " ",
  );
  return /(?:^|[^\d>])>{1,2}(?!&)\s*\S/.test(withoutNull);
}

/**
 * @param {string} command
 * @returns {boolean}
 */
export function isBlockedReadOnlyShellCommand(command) {
  const normalized = `${command}`.trim();
  if (!normalized) return false;
  if (hasMutatingShellRedirect(normalized)) return true;
  return READONLY_SHELL_MUTATOR_PATTERNS.some((pattern) => pattern.test(normalized));
}
