import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  extractPreferenceIntent,
  normalizePreferenceKey,
} from "./preference-intent.mjs";
import {
  ensureProjectGuidelines,
  PROJECT_GUIDELINES_REL,
} from "./project-guidelines.mjs";

export { extractPreferenceIntent, normalizePreferenceKey } from "./preference-intent.mjs";

export const PREFERENCE_LOG_REL = ".kodaelus/preference-log.json";
export const PREFERENCE_THRESHOLD = 3;

/**
 * @param {string} projectRoot
 * @param {string} line
 */
function appendPreferenceLine(projectRoot, line) {
  const filePath = join(projectRoot, PROJECT_GUIDELINES_REL);
  let content = readFileSync(filePath, "utf8");

  if (!content.includes("## Preferences")) {
    content = `${content.trimEnd()}\n\n## Preferences\n\n${line}\n`;
  } else {
    content = content.replace(/(## Preferences\r?\n)/, `$1\n${line}\n`);
  }

  writeFileSync(filePath, content, "utf8");
}

/**
 * @param {string} projectRoot
 * @param {string} intent
 * @returns {{ count: number, appended: boolean, guidelineLine?: string }}
 */
export function recordPreferenceCandidate(projectRoot, intent) {
  const trimmed = intent.trim();
  if (!trimmed) {
    throw new Error("Preference intent must not be empty.");
  }

  ensureProjectGuidelines(projectRoot);

  const normalizedIntent = trimmed.replace(/\s+/g, " ");
  const key = normalizePreferenceKey(normalizedIntent);
  const logPath = join(projectRoot, PREFERENCE_LOG_REL);
  const now = new Date().toISOString();

  /** @type {{ candidates: Array<{ key: string, count: number, lastSeen: string }> }} */
  let log = { candidates: [] };
  if (existsSync(logPath)) {
    try {
      log = JSON.parse(readFileSync(logPath, "utf8"));
      if (!Array.isArray(log.candidates)) {
        log = { candidates: [] };
      }
    } catch {
      log = { candidates: [] };
    }
  }

  let candidate = log.candidates.find((row) => row.key === key);
  if (!candidate) {
    candidate = { key, count: 0, lastSeen: now };
    log.candidates.push(candidate);
  }

  candidate.count += 1;
  candidate.lastSeen = now;

  let appended = false;
  let guidelineLine;

  if (candidate.count >= PREFERENCE_THRESHOLD) {
    guidelineLine = `${now.slice(0, 10)} | source: repeated request | ${normalizedIntent}`;
    appendPreferenceLine(projectRoot, guidelineLine);
    candidate.count = 0;
    appended = true;
  }

  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");

  return { count: candidate.count, appended, guidelineLine };
}
