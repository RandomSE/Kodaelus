export const DELETION_MANIFEST_REL: string;

export interface ManifestEntry {
  path: string;
  reason: string;
  confidence: number;
  backup: string;
  timestamp: string;
  entryPointCheck: "Pass" | "BLOCKED";
  restoredAt?: string;
}

export function readManifestEntries(projectRoot: string): ManifestEntry[];
export function appendManifestEntry(
  projectRoot: string,
  entry: ManifestEntry,
): ManifestEntry[];
export function writeManifestEntries(
  projectRoot: string,
  entries: ManifestEntry[],
): void;
export function manifestHasEntry(
  projectRoot: string,
  path: string,
  backupPath?: string,
): boolean;
