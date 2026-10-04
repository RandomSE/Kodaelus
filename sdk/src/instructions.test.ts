import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validatePolicyTree } from "../../install/lib/instructions-policy-keywords.mjs";
import {
  ensureProjectGuidelines,
  formatTaskModuleLog,
  globalInstructionsPath,
  loadInstructions,
  loadInstructionsWithProjectGuidelines,
  checkSdkDelivery,
  inferDeliveryTier,
  loadPolicyForMode,
  loadProjectGuidelines,
  normalizePreferenceKey,
  PREFERENCE_LOG_REL,
  projectGuidelinesPath,
  projectInstructionsPath,
  recordPreferenceCandidate,
  resolveDistributionRepoRoot,
  resolveInstructionsPath,
  selectTaskModules,
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

  it("serves core.md when the install layout is a redirect stub plus core", async () => {
    loadTempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-load-"));
    const cursorHome = path.join(loadTempDir, ".cursor");
    const policyDir = path.join(cursorHome, "kodaelus");
    await mkdir(policyDir, { recursive: true });
    await writeFile(
      path.join(policyDir, "instructions.md"),
      "# Kodaelus policy redirect\n\nThis file is a redirect. Do not treat it as the full policy.\n",
      "utf8",
    );
    await writeFile(
      path.join(policyDir, "core.md"),
      "# Kodaelus core policy\n\n## Confidence Scoring & Anti-Hallucination\n",
      "utf8",
    );
    await mkdir(path.join(policyDir, "modes"), { recursive: true });
    await writeFile(path.join(policyDir, "modes", "main.md"), "# Main mode\n", "utf8");
    await writeFile(
      path.join(policyDir, "policy-manifest.json"),
      JSON.stringify({ version: 1, modes: { main: { always: [], fragments: [] } }, conditional: [] }),
      "utf8",
    );

    const content = await loadInstructions({
      cwd: loadTempDir,
      cursorHome,
    });
    expect(content).toContain("# Kodaelus core policy");
    expect(content).not.toMatch(/^# Kodaelus policy redirect/m);

    const combined = await loadInstructionsWithProjectGuidelines({
      cwd: loadTempDir,
      cursorHome,
    });
    expect(combined).toContain("## Confidence Scoring & Anti-Hallucination");
    expect(combined).not.toContain("This file is a redirect");
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

  it("loads core plus one mode for a simple Main task", async () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    loadTempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-policy-"));
    const previous = process.env.KODAELUS_INSTRUCTIONS;
    process.env.KODAELUS_INSTRUCTIONS = path.join(repoRoot, "kodaelus");
    const content = await loadPolicyForMode("main", {
      cwd: loadTempDir,
      cursorHome: path.join(repoRoot, ".cursor-missing"),
      task: "add a field to the struct",
      logTaskMatch: false,
    });
    if (previous === undefined) delete process.env.KODAELUS_INSTRUCTIONS;
    else process.env.KODAELUS_INSTRUCTIONS = previous;
    expect(content).toContain("## Confidence Scoring & Anti-Hallucination");
    expect(content).toContain("## Delivery Tiers");
    expect(content).toContain("## Test Discovery & CI Parity");
    expect(content).toContain("## Follow-Up Queue");
    expect(content).not.toContain("## File Deletion Protocol");
    expect(content).not.toContain("### Bug Investigation mode");
    expect(content).not.toContain("No super files");
  });

  it("prompt mode does not load other modes or deletion protocol", async () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    loadTempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-policy-"));
    const previous = process.env.KODAELUS_INSTRUCTIONS;
    process.env.KODAELUS_INSTRUCTIONS = path.join(repoRoot, "kodaelus");
    const content = await loadPolicyForMode("prompt", {
      cwd: loadTempDir,
      cursorHome: path.join(repoRoot, ".cursor-missing"),
      task: "write a paste-ready spec",
      logTaskMatch: false,
    });
    expect(content).toContain("## Planner / Prompt response structure");
    expect(content).not.toContain("## File Deletion Protocol");
    expect(content).not.toContain("## Bug Investigation mode");
    expect(content).not.toContain("### Main mode response structure");
    if (previous === undefined) delete process.env.KODAELUS_INSTRUCTIONS;
    else process.env.KODAELUS_INSTRUCTIONS = previous;
  });

  it("includes project guidelines and logs skipped task modules", async () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    loadTempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-policy-"));
    const guidelinesPath = projectGuidelinesPath(loadTempDir);
    await mkdir(path.dirname(guidelinesPath), { recursive: true });
    await writeFile(guidelinesPath, "## Conventions\n\nUse vitest.\n", "utf8");

    const previous = process.env.KODAELUS_INSTRUCTIONS;
    process.env.KODAELUS_INSTRUCTIONS = path.join(repoRoot, "kodaelus");
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    try {
      const content = await loadPolicyForMode("main", {
        cwd: loadTempDir,
        cursorHome: path.join(repoRoot, ".cursor-missing"),
        task: "clean up this module",
      });
      expect(content).toContain("Use vitest.");
      expect(content).toContain("## Project-specific guidelines");
      expect(content).not.toContain("## File Deletion Protocol");
    } finally {
      console.error = original;
      if (previous === undefined) delete process.env.KODAELUS_INSTRUCTIONS;
      else process.env.KODAELUS_INSTRUCTIONS = previous;
    }
    expect(errors.join("\n")).toMatch(/best-effort keyword match, not guaranteed/);
    expect(errors.join("\n")).toMatch(/not loaded=.*engineering-bar/);
  });

  it("keyword match includes refactor and architecture review task files", async () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    loadTempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-policy-"));
    const previous = process.env.KODAELUS_INSTRUCTIONS;
    process.env.KODAELUS_INSTRUCTIONS = path.join(repoRoot, "kodaelus");
    const content = await loadPolicyForMode("main", {
      cwd: loadTempDir,
      cursorHome: path.join(repoRoot, ".cursor-missing"),
      task: "refactor the parser and redesign the boundary",
      logTaskMatch: false,
    });
    expect(content).toContain(".kodaelus/baselines/");
    expect(content).toContain("## Architecture Improvement Review");
    expect(content).toContain("# Engineering bar");
    if (previous === undefined) delete process.env.KODAELUS_INSTRUCTIONS;
    else process.env.KODAELUS_INSTRUCTIONS = previous;
  });

  it("policy tree passes keyword ownership checks", () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    expect(validatePolicyTree(path.join(repoRoot, "kodaelus"))).toEqual([]);
  });

  it("bug pack always includes Follow-Up Queue and the bug self-check", async () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    loadTempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-policy-"));
    const previous = process.env.KODAELUS_INSTRUCTIONS;
    process.env.KODAELUS_INSTRUCTIONS = path.join(repoRoot, "kodaelus");
    const content = await loadPolicyForMode("bug", {
      cwd: loadTempDir,
      cursorHome: path.join(repoRoot, ".cursor-missing"),
      task: "investigate the flake",
      logTaskMatch: false,
    });
    if (previous === undefined) delete process.env.KODAELUS_INSTRUCTIONS;
    else process.env.KODAELUS_INSTRUCTIONS = previous;
    expect(content).toContain("## Follow-Up Queue");
    expect(content).toContain("Placement rule");
    expect(content).toContain("no Outcome Validation section");
    expect(content).not.toContain("## File Deletion Protocol");
    expect(content).not.toContain("Before **Outcome Validation**");
  });

  it("Delivery Tier Lite Main pack omits TDD, test discovery, and follow-up tasks", async () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    loadTempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-policy-"));
    const previous = process.env.KODAELUS_INSTRUCTIONS;
    process.env.KODAELUS_INSTRUCTIONS = path.join(repoRoot, "kodaelus");
    const content = await loadPolicyForMode("main", {
      cwd: loadTempDir,
      cursorHome: path.join(repoRoot, ".cursor-missing"),
      task: "Delivery Tier: Lite wording tweak",
      logTaskMatch: false,
    });
    if (previous === undefined) delete process.env.KODAELUS_INSTRUCTIONS;
    else process.env.KODAELUS_INSTRUCTIONS = previous;
    expect(content).toContain("## Delivery Tiers");
    expect(content).toContain("## Delivery Self-Check");
    expect(content).not.toContain("# Test-Driven Development");
    expect(content).not.toContain("## Test Discovery & CI Parity");
    expect(content).not.toContain("## Follow-Up Queue");
  });

  it("mode files point at the manifest and do not paste the self-check table", () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    const main = readFileSync(path.join(repoRoot, "kodaelus", "modes", "main.md"), "utf8");
    const bug = readFileSync(path.join(repoRoot, "kodaelus", "modes", "bug.md"), "utf8");
    const prepare = readFileSync(path.join(repoRoot, "kodaelus", "modes", "prepare.md"), "utf8");
    expect(main).toContain("policy-manifest.json");
    expect(main).toContain("<!-- kodaelus:include fragments/delivery-self-check.md#main -->");
    expect(main).not.toContain("**TDD write order:**");
    expect(bug).toContain("<!-- kodaelus:include fragments/delivery-self-check.md#bug -->");
    expect(bug).not.toContain("Before **Outcome Validation**");
    expect(prepare).toContain("<!-- kodaelus:include fragments/delivery-self-check.md#prepare -->");
    expect(prepare).not.toContain("**TDD write order:**");
  });
});

describe("checkSdkDelivery", () => {
  it("hard-fails Main text missing Self-Check and Follow-Up Queue", async () => {
    const result = await checkSdkDelivery("main", "## Plan\nonly a short report");
    expect(result.hardFail).toBe(true);
    expect(result.missing).toEqual(
      expect.arrayContaining(["Delivery Self-Check", "Follow-Up Queue"]),
    );
    expect(result.warning).toMatch(/Delivery Self-Check/);
  });

  it("accepts a Main report that has both sections", async () => {
    const text = [
      "## Plan",
      "Delivery Tier: Full. Confidence: 90% | Evidence: `npm test` -> pass",
      "## Delivery Self-Check",
      "| Criterion | Evidence | Result |",
      "| tests | npm test | Pass |",
      "## Follow-Up Queue",
      "- FU-1: later",
    ].join("\n");
    const result = await checkSdkDelivery("main", text);
    expect(result.missing).toEqual([]);
    expect(result.hardFail).toBe(false);
    expect(result.warning).toBeNull();
  });

  it("soft-checks Mode Lite without requiring Follow-Up Queue", async () => {
    const missing = await checkSdkDelivery("lite", "## Implementation\nonly");
    expect(missing.hardFail).toBe(false);
    expect(missing.warning).toMatch(/Mode Lite/);
    expect(missing.missing.join(" ")).not.toMatch(/Follow-Up Queue/);

    const ok = await checkSdkDelivery(
      "lite",
      "## Tests\nnpm test pass\n## Delivery Self-Check\n| Tests | npm test | Pass |",
    );
    expect(ok.missing).toEqual([]);
    expect(ok.hardFail).toBe(false);
  });
});

describe("selectTaskModules", () => {
  it("treats clean-up wording as a logged miss", () => {
    const match = selectTaskModules("main", "clean up this module");
    expect(match.included).toEqual([]);
    expect(match.skipped).toContain("engineering-bar");
    expect(formatTaskModuleLog(match)).toMatch(/not loaded=.*engineering-bar/);
    expect(formatTaskModuleLog(match)).toMatch(/best-effort/);
  });

  it("includes the cursor playbook on a browser smoke task", () => {
    const match = selectTaskModules("main", "browser smoke the login page");
    expect(match.included).toContain("tasks/cursor-playbooks.md");
    expect(selectTaskModules("main", "browser verification of checkout").included).toContain(
      "tasks/cursor-playbooks.md",
    );
    expect(selectTaskModules("main", "multi-root workspace edit").included).toContain(
      "tasks/cursor-playbooks.md",
    );
    expect(selectTaskModules("main", "add a field to the struct").included).not.toContain(
      "tasks/cursor-playbooks.md",
    );
  });

  it("matches delete file, refactor, and architecture review phrases", () => {
    expect(selectTaskModules("lite", "delete the unused file").included).toContain(
      "tasks/file-deletion.md",
    );
    expect(selectTaskModules("main", "refactor the parser").included).toEqual(
      expect.arrayContaining(["tasks/refactor.md", "tasks/engineering-bar.md"]),
    );
    expect(
      selectTaskModules("prompt", "architecture review of the boundary").included,
    ).toContain("tasks/architecture-review.md");
  });

  it("reads always-packs from the manifest argument, not a hard-coded list", () => {
    const manifest = {
      version: 1,
      modes: {
        main: {
          always: ["tasks/from-manifest.md"],
          tiers: {
            full: { always: ["tasks/from-manifest.md"] },
            lite: { always: [] },
          },
        },
        bug: { always: ["tasks/follow-up-queue.md"] },
      },
      conditional: [
        {
          id: "file-deletion",
          file: "tasks/file-deletion.md",
          pattern: "\\b(?:delete|remove)\\b[\\s\\S]{0,40}\\bfiles?\\b",
          flags: "i",
        },
      ],
    };
    expect(selectTaskModules("main", "add a field", manifest).always).toEqual([
      "tasks/from-manifest.md",
    ]);
    expect(selectTaskModules("main", "add a field", manifest, { tier: "lite" }).always).toEqual(
      [],
    );
    const bug = selectTaskModules("bug", "investigate the flake", manifest);
    expect(bug.always).toEqual(["tasks/follow-up-queue.md"]);
    expect(bug.included).not.toContain("tasks/file-deletion.md");
  });

  it("keeps Mode Lite activation on the Full pack unless Delivery Tier Lite is named", () => {
    expect(inferDeliveryTier("use kodaelus lite", undefined)).toBe("full");
    expect(inferDeliveryTier("Delivery Tier: Lite docs tweak", undefined)).toBe("lite");
    expect(inferDeliveryTier("anything", "lite")).toBe("lite");
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
