import { restoreDeletedFile, undoLastDeletion } from "./restore.mjs";

/**
 * @param {string} prompt
 * @returns {{ type: 'last' } | { type: 'path', path: string } | null}
 */
export function parseRestorePrompt(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return null;
  if (/\bundo\s+last\s+delete\b/i.test(prompt)) {
    return { type: "last" };
  }

  const match = prompt.match(/^\s*restore\s+(\S+)\s*$/im);
  if (match?.[1]) {
    return { type: "path", path: match[1].trim() };
  }

  return null;
}

/**
 * @param {string} projectRoot
 * @param {string} prompt
 * @returns {{ path: string, backup: string, restoredAt: string } | null}
 */
export function tryRestoreFromPrompt(projectRoot, prompt) {
  const parsed = parseRestorePrompt(prompt);
  if (!parsed) return null;

  try {
    const result =
      parsed.type === "last"
        ? undoLastDeletion(projectRoot)
        : restoreDeletedFile(projectRoot, parsed.path);
    console.error(
      `[kodaelus] restored ${result.path} from ${result.backup} at ${result.restoredAt}`,
    );
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "restore failed";
    console.error(`[kodaelus] restore failed: ${message}`);
    return null;
  }
}
