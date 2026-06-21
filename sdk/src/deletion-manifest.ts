import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const DELETION_MANIFEST_REL = ".kodaelus/deletion-manifest.json";

export interface DeletionManifestEntry {
  path: string;
  reason: string;
  confidence: number;
  backup: string;
  timestamp: string;
  entryPointCheck: "Pass" | "BLOCKED";
  restoredAt?: string;
}

export interface RestoreResult {
  path: string;
  backup: string;
  restoredAt: string;
}

function manifestPath(cwd: string): string {
  return join(cwd, DELETION_MANIFEST_REL);
}

function readManifestFile(cwd: string): DeletionManifestEntry[] {
  const file = manifestPath(cwd);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeManifestFile(cwd: string, entries: DeletionManifestEntry[]): void {
  const file = manifestPath(cwd);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

export function readDeletionManifest(cwd: string): DeletionManifestEntry[] {
  return readManifestFile(cwd);
}

export function appendDeletionEntry(
  cwd: string,
  entry: DeletionManifestEntry,
): DeletionManifestEntry[] {
  const next = [...readManifestFile(cwd), entry];
  writeManifestFile(cwd, next);
  return next;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function findRestorableEntry(
  entries: DeletionManifestEntry[],
  targetPath?: string,
): DeletionManifestEntry | undefined {
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

function markRestored(
  cwd: string,
  entry: DeletionManifestEntry,
  restoredAt: string,
): void {
  const entries = readManifestFile(cwd).map((row) =>
    row.path === entry.path && row.timestamp === entry.timestamp
      ? { ...row, restoredAt }
      : row,
  );
  writeManifestFile(cwd, entries);
}

export function restoreDeletedFile(
  cwd: string,
  targetPath: string,
): RestoreResult {
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

export function undoLastDeletion(cwd: string): RestoreResult {
  const entry = findRestorableEntry(readManifestFile(cwd));
  if (!entry) {
    throw new Error("No restorable deletions in manifest");
  }
  return restoreDeletedFile(cwd, entry.path);
}
