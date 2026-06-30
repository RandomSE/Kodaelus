import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SUGGESTIONS_DIR_REL = ".kodaelus/suggestions";

/**
 * @param {string} line
 * @returns {string | null}
 */
function extractSuggestionKey(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const table = trimmed.match(/^\|\s*([^|]+)\s*\|/);
  if (table?.[1]) {
    const cell = table[1].trim();
    if (cell && !/^-+$/.test(cell) && !/^(finding|suggestion|#)$/i.test(cell)) {
      return cell.toLowerCase();
    }
  }

  const bullet = trimmed.match(/^[-*]\s+(.+)/);
  if (bullet?.[1]) return bullet[1].trim().toLowerCase();

  return null;
}

/**
 * @param {string} content
 * @returns {Set<string>}
 */
export function extractSuggestionKeys(content) {
  const keys = new Set();
  for (const line of content.split(/\r?\n/)) {
    const key = extractSuggestionKey(line);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * @param {string} projectRoot
 * @param {'issues' | 'features'} subMode
 * @param {string} [excludeFile] basename to skip (current run output)
 * @returns {{ priorFiles: string[], addressed: string[], stillOpen: string[] }}
 */
export function diffPriorSuggestions(projectRoot, subMode, excludeFile) {
  const dir = join(projectRoot, SUGGESTIONS_DIR_REL);
  if (!existsSync(dir)) {
    return { priorFiles: [], addressed: [], stillOpen: [] };
  }

  const suffix = `-${subMode}.md`;
  const priorFiles = readdirSync(dir)
    .filter((name) => name.endsWith(suffix) && name !== excludeFile)
    .sort();

  if (priorFiles.length === 0) {
    return { priorFiles: [], addressed: [], stillOpen: [] };
  }

  /** @type {string} */
  let priorFileName;
  /** @type {string} */
  let currentFileName;

  if (excludeFile) {
    priorFileName = priorFiles[priorFiles.length - 1];
    currentFileName = excludeFile;
  } else if (priorFiles.length < 2) {
    return { priorFiles, addressed: [], stillOpen: [] };
  } else {
    priorFileName = priorFiles[priorFiles.length - 2];
    currentFileName = priorFiles[priorFiles.length - 1];
  }

  const priorContent = readFileSync(join(dir, priorFileName), "utf8");
  const priorKeys = extractSuggestionKeys(priorContent);

  let currentKeys = new Set();
  const currentPath = join(dir, currentFileName);
  if (existsSync(currentPath)) {
    currentKeys = extractSuggestionKeys(readFileSync(currentPath, "utf8"));
  }

  const addressed = [];
  const stillOpen = [];
  for (const key of priorKeys) {
    if (currentKeys.has(key)) {
      stillOpen.push(key);
    } else {
      addressed.push(key);
    }
  }

  return { priorFiles, addressed, stillOpen };
}
