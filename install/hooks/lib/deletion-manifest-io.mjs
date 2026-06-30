import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const DELETION_MANIFEST_REL = ".kodaelus/deletion-manifest.json";

/** @typedef {{ path: string, reason: string, confidence: number, backup: string, timestamp: string, entryPointCheck: 'Pass' | 'BLOCKED', restoredAt?: string }} ManifestEntry */

/**
 * @param {string} projectRoot
 * @returns {ManifestEntry[]}
 */
export function readManifestEntries(projectRoot) {
  const file = join(projectRoot, DELETION_MANIFEST_REL);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} projectRoot
 * @param {ManifestEntry} entry
 */
export function appendManifestEntry(projectRoot, entry) {
  const file = join(projectRoot, DELETION_MANIFEST_REL);
  mkdirSync(dirname(file), { recursive: true });
  const next = [...readManifestEntries(projectRoot), entry];
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

/**
 * @param {string} projectRoot
 * @param {ManifestEntry[]} entries
 */
export function writeManifestEntries(projectRoot, entries) {
  const file = join(projectRoot, DELETION_MANIFEST_REL);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

/**
 * @param {string} projectRoot
 * @param {string} path
 * @param {string} [backupPath]
 * @returns {boolean}
 */
export function manifestHasEntry(projectRoot, path, backupPath) {
  const normalized = path.replace(/\\/g, "/");
  return readManifestEntries(projectRoot).some((entry) => {
    if (entry.path.replace(/\\/g, "/") !== normalized) return false;
    if (backupPath && entry.backup.replace(/\\/g, "/") !== backupPath.replace(/\\/g, "/")) {
      return false;
    }
    return true;
  });
}
