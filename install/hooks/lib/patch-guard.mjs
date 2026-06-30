/**
 * @param {string} patch
 * @returns {string[]} relative paths removed by the patch (not /dev/null adds)
 */
export function extractPatchDeletePaths(patch) {
  if (typeof patch !== "string" || !patch.trim()) return [];

  const paths = new Set();
  const lines = patch.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const oldLine = lines[i];
    const oldMatch = oldLine.match(/^---\s+(?:a\/)?(.+)$/);
    if (!oldMatch?.[1]) continue;

    const oldPath = oldMatch[1].trim();
    if (oldPath === "/dev/null" || oldPath === "dev/null") continue;

    const nextLine = lines[i + 1] ?? "";
    const newMatch = nextLine.match(/^\+\+\+\s+(?:b\/)?(.+)$/);
    const newPath = newMatch?.[1]?.trim() ?? "";
    if (newPath === "/dev/null" || newPath === "dev/null") {
      paths.add(oldPath.replace(/\\/g, "/"));
    }
  }

  return [...paths];
}

/**
 * @param {unknown} input
 * @returns {string | null}
 */
export function extractPatchText(input) {
  if (!input || typeof input !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (input);
  const toolInput =
    record.tool_input ??
    record.toolInput ??
    record.arguments ??
    record.input ??
    record;

  if (toolInput && typeof toolInput === "object") {
    const ti = /** @type {Record<string, unknown>} */ (toolInput);
    if (typeof ti.patch === "string" && ti.patch.trim()) return ti.patch;
  }
  return null;
}

/**
 * @param {string} patch
 * @returns {string[]} all file paths touched by the patch
 */
export function extractPatchTouchedPaths(patch) {
  if (typeof patch !== "string" || !patch.trim()) return [];
  const paths = new Set();
  for (const line of patch.split(/\r?\n/)) {
    const match = line.match(/^(?:---|\+\+\+)\s+(?:[ab]\/)?(.+)$/);
    if (!match?.[1]) continue;
    const p = match[1].trim();
    if (p === "/dev/null" || p === "dev/null") continue;
    paths.add(p.replace(/\\/g, "/"));
  }
  return [...paths];
}
