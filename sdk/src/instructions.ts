import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
