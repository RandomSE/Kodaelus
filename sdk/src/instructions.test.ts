import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateInstructionsPolicy } from "../../install/lib/instructions-policy-keywords.mjs";
import {
  ensureProjectGuidelines,
  globalInstructionsPath,
  loadInstructions,
  loadInstructionsWithProjectGuidelines,
  loadProjectGuidelines,
  normalizePreferenceKey,
  PREFERENCE_LOG_REL,
  projectGuidelinesPath,
  projectInstructionsPath,
  recordPreferenceCandidate,
  resolveDistributionRepoRoot,
  resolveInstructionsPath,
  wrapTaskWithInstructions,
} from "./instructions.js";

describe("resolveDistributionRepoRoot", () => {
  it("returns parent when cwd is sdk/", () => {
    const repo = path.resolve("/repo");
    expect(resolveDistributionRepoRoot(path.join(repo, "sdk"))).toBe(repo);
  });
});

describe("globalInstructionsPath", () => {
  it("points under .cursor/kodaelus in the user home", () => {
    expect(globalInstructionsPath("/home/user/.cursor")).toBe(
      path.join("/home/user/.cursor", "kodaelus", "instructions.md"),
    );
  });
});

describe("resolveInstructionsPath", () => {
  let tempDir: string;
  const originalEnv = process.env.KODAELUS_INSTRUCTIONS;

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.KODAELUS_INSTRUCTIONS;
    } else {
      process.env.KODAELUS_INSTRUCTIONS = originalEnv;
    }
    if (tempDir) {
      await import("node:fs/promises").then(({ rm }) =>
        rm(tempDir, { recursive: true, force: true }),
      );
    }
  });

  it("prefers KODAELUS_INSTRUCTIONS when set", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-"));
    const custom = path.join(tempDir, "custom.md");
    await writeFile(custom, "# Custom", "utf8");
    process.env.KODAELUS_INSTRUCTIONS = custom;

    await expect(resolveInstructionsPath()).resolves.toBe(custom);
  });

  it("uses global path when present", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-"));
    const cursorHome = path.join(tempDir, ".cursor");
    const globalPath = globalInstructionsPath(cursorHome);
    await mkdir(path.dirname(globalPath), { recursive: true });
    await writeFile(globalPath, "# Global", "utf8");

    await expect(
      resolveInstructionsPath({ cursorHome }),
    ).resolves.toBe(globalPath);
  });

  it("falls back to project-local in distribution repo", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-"));
    const localPath = projectInstructionsPath(tempDir);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, "# Local", "utf8");

    await expect(
      resolveInstructionsPath({ cwd: tempDir, cursorHome: path.join(tempDir, "missing") }),
    ).resolves.toBe(localPath);
  });
});

describe("loadInstructions", () => {
  let loadTempDir: string;

  afterEach(async () => {
    if (loadTempDir) {
      await import("node:fs/promises").then(({ rm }) =>
        rm(loadTempDir, { recursive: true, force: true }),
      );
    }
  });

  it("reads from resolved path", async () => {
    loadTempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-load-"));
    const localPath = projectInstructionsPath(loadTempDir);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, "# Kodaelus\n\nBody.", "utf8");

    const content = await loadInstructions({
      cwd: loadTempDir,
      cursorHome: path.join(loadTempDir, "no-global"),
    });
    expect(content).toContain("Kodaelus");
  });

  it("includes required policy sections in distribution instructions", async () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    const content = await loadInstructions({
      cwd: repoRoot,
      cursorHome: path.join(repoRoot, ".cursor-missing"),
    });
    expect(content).toContain("## Process Framework");
    expect(content).toContain("## Session Lock");
    expect(content).toContain("## Confidence Scoring & Anti-Hallucination");
    expect(content).not.toContain("No super files");
  });

  it("includes architecture review, follow-up queue, and kodaelus modes", async () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    const content = await loadInstructions({
      cwd: repoRoot,
      cursorHome: path.join(repoRoot, ".cursor-missing"),
    });
    expect(content).toContain("## Architecture Improvement Review");
    expect(content).toContain("## Follow-Up Queue");
    expect(content).toContain("## Kodaelus Modes");
    expect(content).toContain("use kodaelus 1");
    expect(content).toContain("implement suggestions");
    expect(content).toContain("FU-1");
    expect(content).toContain("Placement rule");
    expect(content).toContain("Final section");
    expect(content).toMatch(/Follow-Up Queue.*Final section.*use kodaelus bugfix/s);
    expect(content).toContain("use kodaelus suggest issues");
    expect(content).toContain("use kodaelus lite");
    expect(content).toContain("use kodaelus question");
    expect(content).toContain("guard-delete.mjs");
    expect(content).toContain("scope approved");
  });

  it("includes project-specific guidelines policy", async () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    const content = await loadInstructions({
      cwd: repoRoot,
      cursorHome: path.join(repoRoot, ".cursor-missing"),
    });
    expect(content).toContain("## Project-Specific Guidelines");
    expect(content).toContain(".kodaelus/instructions.md");
    expect(content).toContain(".kodaelus/preference-log.json");
    expect(content).toContain("ensureProjectGuidelines");
  });

  it("includes hardened policy keywords shared with install smoke tests", async () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    const content = await loadInstructions({
      cwd: repoRoot,
      cursorHome: path.join(repoRoot, ".cursor-missing"),
    });
    expect(validateInstructionsPolicy(content)).toEqual([]);
  });
});

describe("projectGuidelinesPath", () => {
  it("points to .kodaelus/instructions.md under cwd", () => {
    const repo = path.resolve("/repo");
    expect(projectGuidelinesPath("/repo")).toBe(
      path.join(repo, ".kodaelus", "instructions.md"),
    );
  });
});

describe("loadProjectGuidelines", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await import("node:fs/promises").then(({ rm }) =>
        rm(tempDir, { recursive: true, force: true }),
      );
    }
  });

  it("returns null when project guidelines are absent", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-guidelines-"));
    await expect(loadProjectGuidelines({ cwd: tempDir })).resolves.toBeNull();
  });

  it("reads existing project guidelines", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-guidelines-"));
    const guidelinesPath = projectGuidelinesPath(tempDir);
    await mkdir(path.dirname(guidelinesPath), { recursive: true });
    await writeFile(guidelinesPath, "# Project guidelines\n", "utf8");

    await expect(loadProjectGuidelines({ cwd: tempDir })).resolves.toContain(
      "Project guidelines",
    );
  });
});

describe("ensureProjectGuidelines", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await import("node:fs/promises").then(({ rm }) =>
        rm(tempDir, { recursive: true, force: true }),
      );
    }
  });

  it("creates guidelines and gitignore entry in a git repo", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-ensure-"));
    await mkdir(path.join(tempDir, ".git"), { recursive: true });

    const first = await ensureProjectGuidelines({ cwd: tempDir });
    expect(first.created).toBe(true);
    expect(first.path).toBe(projectGuidelinesPath(tempDir));

    const guidelines = await readFile(first.path, "utf8");
    expect(guidelines).toContain("# Project guidelines (Kodaelus)");
    expect(guidelines).toContain("## Preferences");

    const gitignore = await readFile(path.join(tempDir, ".gitignore"), "utf8");
    expect(gitignore).toContain(".kodaelus/");
  });

  it("is idempotent on a second call", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-ensure-"));
    await mkdir(path.join(tempDir, ".git"), { recursive: true });

    const first = await ensureProjectGuidelines({ cwd: tempDir });
    const second = await ensureProjectGuidelines({ cwd: tempDir });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.path).toBe(first.path);
  });
});

describe("loadInstructionsWithProjectGuidelines", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await import("node:fs/promises").then(({ rm }) =>
        rm(tempDir, { recursive: true, force: true }),
      );
    }
  });

  it("bootstraps and appends project guidelines to global policy", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-combined-"));
    const localPath = projectInstructionsPath(tempDir);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, "# Global policy body", "utf8");

    const guidelinesPath = projectGuidelinesPath(tempDir);
    await mkdir(path.dirname(guidelinesPath), { recursive: true });
    await writeFile(guidelinesPath, "## Conventions\n\nUse vitest.\n", "utf8");

    const combined = await loadInstructionsWithProjectGuidelines({
      cwd: tempDir,
      cursorHome: path.join(tempDir, "no-global"),
    });

    expect(combined).toContain("# Global policy body");
    expect(combined).toContain("## Project-specific guidelines");
    expect(combined).toContain("Use vitest.");
  });
});

describe("recordPreferenceCandidate", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await import("node:fs/promises").then(({ rm }) =>
        rm(tempDir, { recursive: true, force: true }),
      );
    }
  });

  it("normalizes preference keys loosely", () => {
    expect(normalizePreferenceKey("  Use   Vitest ")).toBe("use vitest");
    expect(normalizePreferenceKey("run vitest")).toBe("run vitest");
  });

  it("tracks counts and appends on the third occurrence", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-pref-"));

    const first = await recordPreferenceCandidate("use vitest", { cwd: tempDir });
    const second = await recordPreferenceCandidate("Use vitest", { cwd: tempDir });
    const third = await recordPreferenceCandidate("use  vitest", { cwd: tempDir });

    expect(first).toEqual({ count: 1, appended: false, guidelineLine: undefined });
    expect(second).toEqual({ count: 2, appended: false, guidelineLine: undefined });
    expect(third.appended).toBe(true);
    expect(third.guidelineLine).toContain("use vitest");
    expect(third.count).toBe(0);

    const guidelines = await readFile(projectGuidelinesPath(tempDir), "utf8");
    expect(guidelines).toContain("source: repeated request | use vitest");

    const fourth = await recordPreferenceCandidate("use vitest", { cwd: tempDir });
    expect(fourth).toEqual({ count: 1, appended: false, guidelineLine: undefined });
  });

  it("rejects empty preference intent", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-pref-"));
    await expect(recordPreferenceCandidate("  ", { cwd: tempDir })).rejects.toThrow(
      /empty/i,
    );
  });

  it("resets preference log when JSON is corrupted", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-pref-corrupt-"));
    const logPath = path.join(tempDir, PREFERENCE_LOG_REL);
    await mkdir(path.dirname(logPath), { recursive: true });
    await writeFile(logPath, "not-json{{{", "utf8");

    const result = await recordPreferenceCandidate("use vitest", { cwd: tempDir });
    expect(result).toEqual({ count: 1, appended: false, guidelineLine: undefined });

    const log = JSON.parse(await readFile(logPath, "utf8"));
    expect(log.candidates).toHaveLength(1);
    expect(log.candidates[0].key).toBe("use vitest");
  });
});

describe("wrapTaskWithInstructions", () => {
  it("prepends instructions and separates user task", () => {
    const wrapped = wrapTaskWithInstructions("# Policy", "Fix the login bug");
    expect(wrapped).toMatch(/^# Policy/);
    expect(wrapped).toContain("## User task");
    expect(wrapped).toContain("Fix the login bug");
  });

  it("rejects empty task", () => {
    expect(() => wrapTaskWithInstructions("# Policy", "   ")).toThrow(
      /empty/i,
    );
  });
});
