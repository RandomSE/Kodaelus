import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Relative path to per-project supplemental guidelines in consumer workspaces. */
export const PROJECT_GUIDELINES_REL = ".kodaelus/instructions.md";

/** Relative path to Kodaelus scratch directory under a project root. */
export const KODAELUS_DIR_REL = ".kodaelus";

/** Relative path to cross-session preference tracking for the 3× rule. */
export const PREFERENCE_LOG_REL = ".kodaelus/preference-log.json";

/** Occurrences required before appending a preference to project guidelines. */
export const PREFERENCE_THRESHOLD = 3;

const GITIGNORE_KODAELUS_ENTRY = ".kodaelus/";

/** Default global install location (see `npm run install:global`). */
export function globalInstructionsPath(
  cursorHome: string = path.join(homedir(), ".cursor"),
): string {
  return path.join(cursorHome, "kodaelus", "instructions.md");
}

/** Project-local copy when developing the Kodaelus distribution repo. */
export function projectInstructionsPath(repoRoot: string): string {
  return path.join(repoRoot, "kodaelus", "instructions.md");
}

/** Per-project supplemental guidelines in any consumer workspace. */
export function projectGuidelinesPath(cwd: string = process.cwd()): string {
  return path.join(path.resolve(cwd), PROJECT_GUIDELINES_REL);
}

export type ProjectGuidelinesOptions = {
  cwd?: string;
};

export type EnsureProjectGuidelinesResult = {
  created: boolean;
  path: string;
};

export type PreferenceLog = {
  candidates: Array<{ key: string; count: number; lastSeen: string }>;
};

export type RecordPreferenceResult = {
  count: number;
  appended: boolean;
  guidelineLine?: string;
};

/** Repo root (parent of `sdk/`) when cwd is inside this distribution repo. */
export function resolveDistributionRepoRoot(cwd: string = process.cwd()): string {
  const normalized = path.resolve(cwd);
  if (path.basename(normalized) === "sdk") {
    return path.dirname(normalized);
  }
  return normalized;
}

export type ResolveInstructionsOptions = {
  cwd?: string;
  cursorHome?: string;
  explicitPath?: string;
};

/**
 * Resolution order:
 * 1. KODAELUS_INSTRUCTIONS env
 * 2. Global install (~/.cursor/kodaelus/instructions.md)
 * 3. Project-local kodaelus/instructions.md (distribution repo only)
 */
export async function resolveInstructionsPath(
  options: ResolveInstructionsOptions = {},
): Promise<string> {
  const envPath = process.env.KODAELUS_INSTRUCTIONS?.trim();
  if (envPath) {
    return path.resolve(envPath);
  }

  const globalPath = globalInstructionsPath(options.cursorHome);
  if (await fileExists(globalPath)) {
    return globalPath;
  }

  const repoRoot = resolveDistributionRepoRoot(options.cwd ?? process.cwd());
  const localPath = projectInstructionsPath(repoRoot);
  if (await fileExists(localPath)) {
    return localPath;
  }

  throw new Error(
    [
      "Kodaelus instructions not found.",
      `Install globally: npm run install:global (from the Kodaelus repo),`,
      `or set KODAELUS_INSTRUCTIONS to your instructions.md path.`,
      `Expected global path: ${globalPath}`,
    ].join(" "),
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadInstructions(
  options: ResolveInstructionsOptions = {},
): Promise<string> {
  const filePath = await resolveInstructionsPath(options);
  return readFile(filePath, "utf8");
}

/**
 * Bootstrap project guidelines, load global policy, and append project guidelines when present.
 */
export async function loadInstructionsWithProjectGuidelines(
  options: ResolveInstructionsOptions = {},
): Promise<string> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  await ensureProjectGuidelines({ cwd });

  const globalInstructions = await loadInstructions({ ...options, cwd });
  const projectGuidelines = await loadProjectGuidelines({ cwd });

  if (!projectGuidelines?.trim()) {
    return globalInstructions;
  }

  return [
    globalInstructions.trim(),
    "",
    "---",
    "",
    "## Project-specific guidelines",
    "",
    projectGuidelines.trim(),
  ].join("\n");
}

/**
 * Load supplemental project guidelines, or null when `.kodaelus/instructions.md` is absent.
 */
export async function loadProjectGuidelines(
  options: ProjectGuidelinesOptions = {},
): Promise<string | null> {
  const filePath = projectGuidelinesPath(options.cwd);
  if (!(await fileExists(filePath))) {
    return null;
  }
  return readFile(filePath, "utf8");
}

/**
 * Create `.kodaelus/instructions.md` from template when missing and ensure `.kodaelus/`
 * is listed in `.gitignore` for git repositories. Idempotent on repeat calls.
 */
export async function ensureProjectGuidelines(
  options: ProjectGuidelinesOptions = {},
): Promise<EnsureProjectGuidelinesResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const filePath = projectGuidelinesPath(cwd);
  let created = false;

  if (!(await fileExists(filePath))) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const template = await readProjectGuidelinesTemplate();
    await writeFile(filePath, template, "utf8");
    created = true;
  }

  await ensureKodaelusGitignore(cwd);

  return { created, path: filePath };
}

import {
  extractPreferenceIntent,
  normalizePreferenceKey,
} from "./preference-intent.js";

export { extractPreferenceIntent, normalizePreferenceKey };

/**
 * Track a repeated non-safety preference; append to project guidelines on the 3rd occurrence.
 */
export async function recordPreferenceCandidate(
  intent: string,
  options: ProjectGuidelinesOptions = {},
): Promise<RecordPreferenceResult> {
  const trimmed = intent.trim();
  if (!trimmed) {
    throw new Error("Preference intent must not be empty.");
  }

  const cwd = path.resolve(options.cwd ?? process.cwd());
  await ensureProjectGuidelines({ cwd });

  const normalizedIntent = trimmed.replace(/\s+/g, " ");
  const key = normalizePreferenceKey(normalizedIntent);
  const logPath = path.join(cwd, PREFERENCE_LOG_REL);
  const now = new Date().toISOString();

  let log: PreferenceLog = { candidates: [] };
  if (await fileExists(logPath)) {
    try {
      log = JSON.parse(await readFile(logPath, "utf8")) as PreferenceLog;
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
  let guidelineLine: string | undefined;

  if (candidate.count >= PREFERENCE_THRESHOLD) {
    guidelineLine = `${now.slice(0, 10)} | source: repeated request | ${normalizedIntent}`;
    await appendPreferenceLine(cwd, guidelineLine);
    candidate.count = 0;
    appended = true;
  }

  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");

  return { count: candidate.count, appended, guidelineLine };
}

async function appendPreferenceLine(cwd: string, line: string): Promise<void> {
  const filePath = projectGuidelinesPath(cwd);
  let content = await readFile(filePath, "utf8");

  if (!content.includes("## Preferences")) {
    content = `${content.trimEnd()}\n\n## Preferences\n\n${line}\n`;
  } else {
    content = content.replace(/(## Preferences\r?\n)/, `$1\n${line}\n`);
  }

  await writeFile(filePath, content, "utf8");
}

async function readProjectGuidelinesTemplate(): Promise<string> {
  const distributionTemplate = path.join(
    resolveDistributionRepoRoot(path.join(__dirname, "..")),
    "install",
    "templates",
    "project-instructions.template.md",
  );
  if (await fileExists(distributionTemplate)) {
    return readFile(distributionTemplate, "utf8");
  }
  return DEFAULT_PROJECT_GUIDELINES_TEMPLATE;
}

async function ensureKodaelusGitignore(cwd: string): Promise<void> {
  if (!(await fileExists(path.join(cwd, ".git")))) {
    return;
  }

  const gitignorePath = path.join(cwd, ".gitignore");
  if (!(await fileExists(gitignorePath))) {
    await writeFile(
      gitignorePath,
      `# Kodaelus local scratch (guidelines, backups, insights)\n${GITIGNORE_KODAELUS_ENTRY}\n`,
      "utf8",
    );
    return;
  }

  const content = await readFile(gitignorePath, "utf8");
  if (gitignoreCoversKodaelus(content)) {
    return;
  }

  const suffix = content.endsWith("\n") ? "" : "\n";
  await writeFile(
    gitignorePath,
    `${content}${suffix}\n# Kodaelus local scratch (guidelines, backups, insights)\n${GITIGNORE_KODAELUS_ENTRY}\n`,
    "utf8",
  );
}

function gitignoreCoversKodaelus(content: string): boolean {
  return content
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trim();
      return (
        trimmed === GITIGNORE_KODAELUS_ENTRY ||
        trimmed === ".kodaelus" ||
        trimmed === ".kodaelus/**" ||
        trimmed === ".kodaelus/*"
      );
    });
}

const DEFAULT_PROJECT_GUIDELINES_TEMPLATE = `# Project guidelines (Kodaelus)

Supplemental guidelines for this repository. Read together with global Kodaelus policy (\`~/.cursor/kodaelus/instructions.md\`).

**Precedence:** Project guidelines override global policy on conflicts **except** safety-critical items (global always wins): git restrictions, File Deletion Protocol, scope creep guardrail, hook-enforced confidence format, and sub-70% delivery fail rules.

## Preferences

<!-- Kodaelus appends recurring user preferences here (~3 consistent requests) -->

## Conventions

<!-- Project-specific conventions not obvious from the codebase -->

## Notes

<!-- Manual edits welcome -->
`;

export function wrapTaskWithInstructions(
  instructions: string,
  task: string,
): string {
  const trimmed = task.trim();
  if (!trimmed) {
    throw new Error("Task prompt must not be empty.");
  }
  return [
    instructions.trim(),
    "",
    "---",
    "",
    "## User task",
    "",
    trimmed,
  ].join("\n");
}
