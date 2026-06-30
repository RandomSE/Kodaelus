import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import {
  appendManifestEntry,
  DELETION_MANIFEST_REL,
  manifestHasEntry,
  readManifestEntries,
} from "./deletion-manifest-io.mjs";

export {
  appendManifestEntry,
  DELETION_MANIFEST_REL,
  manifestHasEntry,
  readManifestEntries,
};

export const TRASH_DIR_REL = ".kodaelus/trash";

/**
 * @param {string} projectRoot
 * @param {string} filePath
 * @returns {string}
 */
export function normalizeProjectPath(projectRoot, filePath) {
  const root = resolve(projectRoot);
  const absolute = resolve(root, filePath);
  const rel = normalize(relative(root, absolute)).replace(/\\/g, "/");
  if (rel.startsWith("..")) {
    throw new Error(`Path outside project root: ${filePath}`);
  }
  return rel;
}

/**
 * @param {string} projectRoot
 */
export function ensureKodaelusGitignore(projectRoot) {
  const gitDir = join(projectRoot, ".git");
  if (!existsSync(gitDir)) return;

  const gitignorePath = join(projectRoot, ".gitignore");
  const line = ".kodaelus/";
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${line}\n`, "utf8");
    return;
  }

  const content = readFileSync(gitignorePath, "utf8");
  if (!content.split(/\r?\n/).some((row) => row.trim() === ".kodaelus" || row.trim() === ".kodaelus/")) {
    const suffix = content.endsWith("\n") ? "" : "\n";
    writeFileSync(gitignorePath, `${content}${suffix}${line}\n`, "utf8");
  }
}

/**
 * @param {string} projectRoot
 * @param {string} relativePath
 * @returns {{ backupPath: string, timestamp: string, relativePath: string }}
 */
export function copyToTrash(projectRoot, relativePath) {
  const rel = normalizeProjectPath(projectRoot, relativePath);
  const source = join(projectRoot, rel);
  if (!existsSync(source)) {
    throw new Error(`Cannot backup missing file: ${rel}`);
  }

  ensureKodaelusGitignore(projectRoot);

  const timestamp = new Date().toISOString();
  const safeDirName = timestamp.replace(/:/g, "-");
  const backupPath = join(TRASH_DIR_REL, safeDirName, rel);
  const backupAbsolute = join(projectRoot, backupPath);
  mkdirSync(dirname(backupAbsolute), { recursive: true });
  cpSync(source, backupAbsolute);

  return { backupPath: backupPath.replace(/\\/g, "/"), timestamp, relativePath: rel };
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isKodaelusArtifactPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  return normalized === ".kodaelus" || normalized.startsWith(".kodaelus/");
}
