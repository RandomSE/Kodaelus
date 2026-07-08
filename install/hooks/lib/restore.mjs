import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const DELETION_MANIFEST_REL = ".kodaelus/deletion-manifest.json";

/**
 * @param {string} cwd
 * @returns {import('./deletion-manifest-io.mjs').DeletionManifestEntry[]}
 */
function readManifestFile(cwd) {
  const file = join(cwd, DELETION_MANIFEST_REL);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} cwd
 * @param {import('./deletion-manifest-io.mjs').DeletionManifestEntry[]} entries
 */
function writeManifestFile(cwd, entries) {
  const file = join(cwd, DELETION_MANIFEST_REL);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

/**
 * @param {string} value
 */
function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

/**
 * @param {import('./deletion-manifest-io.mjs').DeletionManifestEntry[]} entries
 * @param {string} [targetPath]
 */
function findRestorableEntry(entries, targetPath) {
  const pending = entries.filter((entry) => !entry.restoredAt);
  if (pending.length === 0) return undefined;

  if (targetPath) {
    const normalized = normalizePath(targetPath);
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      if (normalizePath(pending[i].path) === normalized) {
        return pending[i];
      }
    }
    return undefined;
  }

  return pending[pending.length - 1];
}

/**
 * @param {string} cwd
 * @param {import('./deletion-manifest-io.mjs').DeletionManifestEntry} entry
 * @param {string} restoredAt
 */
function markRestored(cwd, entry, restoredAt) {
  const entries = readManifestFile(cwd).map((row) =>
    row.path === entry.path && row.timestamp === entry.timestamp
      ? { ...row, restoredAt }
      : row,
  );
  writeManifestFile(cwd, entries);
}

/**
 * @param {string} cwd
 * @param {string} targetPath
 * @returns {{ path: string, backup: string, restoredAt: string }}
 */
export function restoreDeletedFile(cwd, targetPath) {
  const entries = readManifestFile(cwd);
  const entry = findRestorableEntry(entries, targetPath);
  if (!entry) {
    throw new Error(`No restorable deletion found for path: ${targetPath}`);
  }

  const backupAbsolute = join(cwd, entry.backup);
  if (!existsSync(backupAbsolute)) {
    throw new Error(`Backup missing: ${entry.backup}`);
  }

  const destination = join(cwd, entry.path);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(backupAbsolute, destination);

  const restoredAt = new Date().toISOString();
  markRestored(cwd, entry, restoredAt);

  return { path: entry.path, backup: entry.backup, restoredAt };
}

/**
 * @param {string} cwd
 * @returns {{ path: string, backup: string, restoredAt: string }}
 */
export function undoLastDeletion(cwd) {
  const entry = findRestorableEntry(readManifestFile(cwd));
  if (!entry) {
    throw new Error("No restorable deletions in manifest");
  }
  return restoreDeletedFile(cwd, entry.path);
}
