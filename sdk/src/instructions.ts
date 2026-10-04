import { readFileSync } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { KodaelusModeName } from "./runtime-guards.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Relative path to per-project supplemental guidelines in consumer workspaces. */
export const PROJECT_GUIDELINES_REL = ".kodaelus/instructions.md";

/** Relative path to Kodaelus scratch directory under a project root. */
export const KODAELUS_DIR_REL = ".kodaelus";

/** Relative path to cross-session preference tracking for the 3× rule. */
export const PREFERENCE_LOG_REL = ".kodaelus/preference-log.json";

/** Occurrences required before appending a preference to project guidelines. */
export const PREFERENCE_THRESHOLD = 3;

/** Durable outcome notes. Main and Prepare load this on the next policy read. */
export const INSIGHTS_REL = ".kodaelus/insights.md";

/** Above this line count, append a prune note instead of another insight. */
export const INSIGHTS_LINE_CAP = 100;

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
 * Legacy file resolver. Canonical loader is loadPolicyForMode.
 * Resolution order:
 * 1. KODAELUS_INSTRUCTIONS env (policy directory, or a file inside it)
 * 2. Global install (~/.cursor/kodaelus/instructions.md, often a redirect stub)
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
      `or set KODAELUS_INSTRUCTIONS to the policy directory (or a file inside it).`,
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

function isRedirectStub(text: string): boolean {
  return /this file is a redirect/i.test(text) || /redirect stub/i.test(text);
}

/**
 * Canonical policy load is `loadPolicyForMode`. This legacy helper reads a
 * single file. When that file is the install redirect stub, it serves `core.md`
 * from the same directory and logs that the stub is not the full policy.
 */
export async function loadInstructions(
  options: ResolveInstructionsOptions = {},
): Promise<string> {
  const filePath = await resolveInstructionsPath(options);
  const text = await readFile(filePath, "utf8");
  if (!isRedirectStub(text)) {
    return text;
  }

  const corePath = path.join(path.dirname(filePath), "core.md");
  if (!(await fileExists(corePath))) {
    throw new Error(
      "Kodaelus instructions.md is a redirect stub and core.md is missing. " +
        "Canonical loader is loadPolicyForMode. Run npm run install:global.",
    );
  }

  console.error(
    "[kodaelus] instructions.md is a redirect stub. Canonical loader is loadPolicyForMode. Serving core.md.",
  );
  return readFile(corePath, "utf8");
}

const MODE_FILES: Record<KodaelusModeName, string> = {
  main: "modes/main.md",
  prompt: "modes/prompt.md",
  bug: "modes/bug.md",
  suggest: "modes/suggest.md",
  lite: "modes/lite.md",
  question: "modes/question.md",
  prepare: "modes/prepare.md",
  ship: "modes/ship.md",
};

export const POLICY_MANIFEST_REL = "policy-manifest.json";

export type DeliveryTierName = "full" | "standard" | "lite";

export type PolicyFragmentRef = {
  file: string;
  section?: string;
};

export type PolicyModeSpec = {
  file?: string;
  always?: string[];
  tiers?: Partial<Record<DeliveryTierName, { always?: string[] }>>;
  fragments?: PolicyFragmentRef[];
};

export type PolicyConditionalRule = {
  id: string;
  file: string;
  pattern: string;
  flags?: string;
  note?: string;
};

/** Machine-readable task packs. Mode prose points here; do not duplicate lists in code. */
export type PolicyManifest = {
  version: number;
  modes: Record<string, PolicyModeSpec>;
  conditional?: PolicyConditionalRule[];
};

export type PolicyTaskMatch = {
  always: string[];
  included: string[];
  skipped: string[];
  tier: DeliveryTierName;
};

export type LoadPolicyOptions = ResolveInstructionsOptions & {
  task?: string;
  /** Delivery tier. When omitted, inferred from task text, otherwise Full. */
  tier?: DeliveryTierName | string;
  /** Log skipped conditional task files. Default true. */
  logTaskMatch?: boolean;
};

export type SdkDeliveryCheck = {
  missing: string[];
  warning: string | null;
  hardFail: boolean;
};

/**
 * Explicit tier wins. "Delivery Tier Lite" is the short Main pack.
 * "use kodaelus lite" is Mode Lite and stays Full when tier is unknown.
 */
export function inferDeliveryTier(
  task: string,
  explicit?: string | null,
): DeliveryTierName {
  const named = `${explicit ?? ""}`.trim().toLowerCase();
  if (named === "full" || named === "standard" || named === "lite") {
    return named;
  }
  const text = task ?? "";
  if (/delivery\s+tier\s*:\s*lite\b/i.test(text) || /\bdelivery tier lite\b/i.test(text)) {
    return "lite";
  }
  if (
    /delivery\s+tier\s*:\s*standard\b/i.test(text) ||
    /\bdelivery tier standard\b/i.test(text)
  ) {
    return "standard";
  }
  return "full";
}

export function alwaysTasksForMode(
  manifest: PolicyManifest,
  mode: string,
  tier: DeliveryTierName,
): string[] {
  const spec = manifest.modes?.[mode];
  if (!spec) return [];
  const tierAlways = spec.tiers?.[tier]?.always;
  if (Array.isArray(tierAlways)) return [...tierAlways];
  return [...(spec.always ?? [])];
}

/** Slice one mode's self-check out of the shared fragment file. */
export function extractSelfCheckSection(fragmentText: string, section: string): string {
  const re = /<!--\s*kodaelus:self-check\s+([a-z0-9_-]+)\s*-->/gi;
  const matches = [...fragmentText.matchAll(re)];
  const idx = matches.findIndex((match) => match[1].toLowerCase() === section.toLowerCase());
  if (idx < 0) {
    throw new Error(`Kodaelus self-check section missing: ${section}`);
  }
  const start = (matches[idx].index ?? 0) + matches[idx][0].length;
  const end = idx + 1 < matches.length ? (matches[idx + 1].index ?? fragmentText.length) : fragmentText.length;
  return fragmentText.slice(start, end).trim();
}

function defaultManifestPath(): string {
  return path.join(__dirname, "..", "..", "kodaelus", POLICY_MANIFEST_REL);
}

export function readPolicyManifestSync(manifestPath: string): PolicyManifest {
  const raw = readFileSync(manifestPath, "utf8");
  return JSON.parse(raw) as PolicyManifest;
}

/**
 * Conditional task modules are keyword matches from policy-manifest.json.
 * "clean up this module" does not match engineering-bar; the skip is logged.
 * Pass a manifest to override the on-disk pack (tests use this to prove there is no second list).
 */
export function selectTaskModules(
  mode: string,
  task: string,
  manifest?: PolicyManifest,
  options?: { tier?: string },
): PolicyTaskMatch {
  const source = manifest ?? readPolicyManifestSync(defaultManifestPath());
  const tier = inferDeliveryTier(task ?? "", options?.tier);
  const always = alwaysTasksForMode(source, mode, tier);
  const included: string[] = [];
  const skipped: string[] = [];
  for (const rule of source.conditional ?? []) {
    const pattern = new RegExp(rule.pattern, rule.flags ?? "");
    if (pattern.test(task ?? "")) included.push(rule.file);
    else skipped.push(rule.id);
  }
  return { always, included, skipped, tier };
}

export function formatTaskModuleLog(match: PolicyTaskMatch): string {
  const includedIds = match.included.map((file) =>
    file.replace(/^tasks\//, "").replace(/\.md$/, ""),
  );
  return [
    "[kodaelus] policy task modules (best-effort keyword match, not guaranteed):",
    `tier=${match.tier};`,
    `included=${includedIds.length ? includedIds.join(", ") : "none"};`,
    `not loaded=${match.skipped.length ? match.skipped.join(", ") : "none"}.`,
  ].join(" ");
}

/** Directory that contains core.md. Env may be that directory or a file inside it. */
export async function resolvePolicyDir(
  options: ResolveInstructionsOptions = {},
): Promise<string> {
  const envPath = process.env.KODAELUS_INSTRUCTIONS?.trim();
  if (envPath) {
    const resolved = path.resolve(envPath);
    try {
      const info = await stat(resolved);
      return info.isDirectory() ? resolved : path.dirname(resolved);
    } catch {
      throw new Error(`KODAELUS_INSTRUCTIONS path does not exist: ${resolved}`);
    }
  }

  const globalDir = path.join(
    options.cursorHome ?? path.join(homedir(), ".cursor"),
    "kodaelus",
  );
  if (await fileExists(path.join(globalDir, "core.md"))) {
    return globalDir;
  }

  const localDir = path.join(
    resolveDistributionRepoRoot(options.cwd ?? process.cwd()),
    "kodaelus",
  );
  if (await fileExists(path.join(localDir, "core.md"))) {
    return localDir;
  }

  throw new Error(
    `Kodaelus policy directory not found (expected core.md). Install with npm run install:global or set KODAELUS_INSTRUCTIONS. Looked in ${globalDir} and ${localDir}.`,
  );
}

export function corePolicyPath(policyDir: string): string {
  return path.join(policyDir, "core.md");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace `<!-- kodaelus:include path#section -->` with that fragment section.
 * When the marker is absent, append the section so the pack still contains one copy.
 */
async function expandFragmentIncludes(
  modeText: string,
  policyDir: string,
  fragments: PolicyFragmentRef[],
): Promise<{ text: string; appended: string[] }> {
  let text = modeText;
  const appended: string[] = [];
  for (const frag of fragments) {
    const abs = path.join(policyDir, frag.file);
    if (!(await fileExists(abs))) {
      throw new Error(`Kodaelus policy fragment missing: ${abs}`);
    }
    const raw = await readFile(abs, "utf8");
    const body = frag.section ? extractSelfCheckSection(raw, frag.section) : raw.trim();
    const markerSource = frag.section ? `${frag.file}#${frag.section}` : frag.file;
    const markerRe = new RegExp(
      `<!--\\s*kodaelus:include\\s+${escapeRegExp(markerSource)}\\s*-->`,
    );
    if (markerRe.test(text)) {
      text = text.replace(markerRe, body);
    } else {
      appended.push(body);
    }
  }
  return { text, appended };
}

/**
 * core.md + one mode file (fragment markers expanded) + manifest task files
 * + project guidelines. Does not append other mode files.
 */
export async function loadPolicyForMode(
  mode: KodaelusModeName,
  options: LoadPolicyOptions = {},
): Promise<string> {
  const modeRel = MODE_FILES[mode];
  if (!modeRel) {
    throw new Error(`Unknown Kodaelus mode: ${mode}`);
  }

  const policyDir = await resolvePolicyDir(options);
  const manifestPath = path.join(policyDir, POLICY_MANIFEST_REL);
  if (!(await fileExists(manifestPath))) {
    throw new Error(`Kodaelus policy manifest missing: ${manifestPath}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PolicyManifest;
  const match = selectTaskModules(mode, options.task ?? "", manifest, {
    tier: options.tier,
  });
  if (options.logTaskMatch !== false) {
    console.error(formatTaskModuleLog(match));
  }

  const parts: string[] = [];
  const modePath = path.join(policyDir, modeRel);
  if (!(await fileExists(path.join(policyDir, "core.md"))) || !(await fileExists(modePath))) {
    throw new Error(`Kodaelus policy file missing: ${modePath}`);
  }
  const coreText = (await readFile(path.join(policyDir, "core.md"), "utf8")).trim();
  const expandedMode = await expandFragmentIncludes(
    (await readFile(modePath, "utf8")).trim(),
    policyDir,
    manifest.modes?.[mode]?.fragments ?? [],
  );
  parts.push(coreText, expandedMode.text);
  for (const rel of [...match.always, ...match.included]) {
    const filePath = path.join(policyDir, rel);
    if (!(await fileExists(filePath))) {
      throw new Error(`Kodaelus policy file missing: ${filePath}`);
    }
    parts.push((await readFile(filePath, "utf8")).trim());
  }
  parts.push(...expandedMode.appended);

  const cwd = path.resolve(options.cwd ?? process.cwd());
  await ensureProjectGuidelines({ cwd });
  const projectGuidelines = await loadProjectGuidelines({ cwd });
  if (projectGuidelines?.trim()) {
    parts.push("## Project-specific guidelines", projectGuidelines.trim());
  }
  if (mode === "main" || mode === "prepare" || mode === "ship") {
    const insights = await loadProjectInsights({ cwd });
    if (insights?.trim()) {
      parts.push("## Project insights", insights.trim());
    }
  }

  return parts.join("\n\n");
}

/**
 * Bootstrap project guidelines, load global policy, and append project guidelines when present.
 */
export async function loadInstructionsWithProjectGuidelines(
  options: ResolveInstructionsOptions = {},
): Promise<string> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  await ensureProjectGuidelines({ cwd });

  try {
    return await loadPolicyForMode("main", {
      ...options,
      cwd,
      logTaskMatch: false,
    });
  } catch (err) {
    console.error(
      `[kodaelus] loadPolicyForMode unavailable (${err instanceof Error ? err.message : "unknown"}). ` +
        "Falling back to loadInstructions. Canonical loader is loadPolicyForMode.",
    );
  }

  const globalInstructions = await loadInstructions({ ...options, cwd });
  const projectGuidelines = await loadProjectGuidelines({ cwd });
  const insights = await loadProjectInsights({ cwd });
  const chunks = [globalInstructions.trim()];
  if (projectGuidelines?.trim()) {
    chunks.push("---", "## Project-specific guidelines", "", projectGuidelines.trim());
  }
  if (insights?.trim()) {
    chunks.push("## Project insights", "", insights.trim());
  }
  return chunks.join("\n");
}

function insightLineCount(text: string): number {
  if (!text) return 0;
  const parts = text.split("\n");
  return text.endsWith("\n") ? parts.length - 1 : parts.length;
}

export async function loadProjectInsights(
  options: ProjectGuidelinesOptions = {},
): Promise<string | null> {
  const filePath = path.join(path.resolve(options.cwd ?? process.cwd()), INSIGHTS_REL);
  if (!(await fileExists(filePath))) return null;
  return readFile(filePath, "utf8");
}

/**
 * Append one insight line. Past 100 lines, record a prune note instead.
 */
export async function appendProjectInsight(
  insight: string,
  options: ProjectGuidelinesOptions = {},
): Promise<{ path: string; appended: boolean; pruneNoted: boolean }> {
  const line = insight.trim();
  if (!line) throw new Error("Insight must not be empty.");

  const cwd = path.resolve(options.cwd ?? process.cwd());
  await ensureProjectGuidelines({ cwd });
  const filePath = path.join(cwd, INSIGHTS_REL);
  const existing = (await fileExists(filePath)) ? await readFile(filePath, "utf8") : "";
  if (existing.includes(line)) {
    return { path: filePath, appended: false, pruneNoted: false };
  }

  const pruneNote = `${new Date().toISOString().slice(0, 10)} | insights | prune: file exceeded 100 lines; queue a prune before adding more.`;
  if (insightLineCount(existing) >= INSIGHTS_LINE_CAP) {
    if (!existing.includes("prune: file exceeded 100 lines")) {
      const suffix = existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
      await writeFile(filePath, `${existing}${suffix}${pruneNote}\n`, "utf8");
    }
    return { path: filePath, appended: false, pruneNoted: true };
  }

  const suffix = existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
  await writeFile(filePath, `${existing}${suffix}${line}\n`, "utf8");
  return { path: filePath, appended: true, pruneNoted: false };
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

Supplemental guidelines for this repository. Read together with global Kodaelus policy: \`~/.cursor/kodaelus/core.md\`, one \`modes/<active>.md\`, and \`policy-manifest.json\`. \`instructions.md\` in that directory is a redirect stub.

**Precedence:** Project guidelines override global policy on conflicts **except** safety-critical items (global always wins): git restrictions, File Deletion Protocol, scope creep guardrail, hook-enforced confidence format, and sub-70% delivery fail rules.

## Preferences

<!-- Kodaelus appends recurring user preferences here (~3 consistent requests) -->

## Conventions

<!-- Project-specific conventions not obvious from the codebase -->

## Notes

<!-- Manual edits welcome -->
`;

type DeliveryGuardModule = {
  findMissingDeliverySections: (
    mode: string,
    text: string,
    options?: { prepareCapped?: boolean },
  ) => string[];
  buildDeliveryStructureFollowup: (
    missing: string[],
    mode: string,
    loopCount?: number,
  ) => string;
};

async function loadDeliveryGuard(): Promise<DeliveryGuardModule> {
  const filePath = path.join(
    __dirname,
    "..",
    "..",
    "install",
    "hooks",
    "lib",
    "delivery-structure-guard.mjs",
  );
  return import(pathToFileURL(filePath).href) as Promise<DeliveryGuardModule>;
}

/**
 * Reuse the IDE delivery-structure guard on SDK final text.
 * Main, bug, prepare, and ship missing sections are a hard check. Mode Lite warns only.
 */
export async function checkSdkDelivery(mode: string, text: string): Promise<SdkDeliveryCheck> {
  const checked =
    mode === "main" || mode === "bug" || mode === "prepare" || mode === "ship" || mode === "lite";
  if (!checked) {
    return { missing: [], warning: null, hardFail: false };
  }
  const guard = await loadDeliveryGuard();
  const missing = guard.findMissingDeliverySections(mode, text);
  if (missing.length === 0) {
    return { missing: [], warning: null, hardFail: false };
  }
  return {
    missing,
    warning: guard.buildDeliveryStructureFollowup(missing, mode),
    hardFail: mode === "main" || mode === "bug" || mode === "prepare" || mode === "ship",
  };
}

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
