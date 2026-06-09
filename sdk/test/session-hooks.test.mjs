import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isBlockedGitShellCommand } from "../../install/hooks/lib/git-guard.mjs";
import {
  activateSession,
  deactivateSession,
  isActivatePrompt,
  isDeactivatePrompt,
  isSessionActive,
  withStoreLock,
} from "../../install/hooks/lib/session-store.mjs";

const activateChildScript = fileURLToPath(
  new URL("./helpers/activate-session-child.mjs", import.meta.url),
);

let tempHome;

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-hook-test-"));
  process.env.CURSOR_HOME = tempHome;
});

afterEach(() => {
  delete process.env.CURSOR_HOME;
  rmSync(tempHome, { recursive: true, force: true });
});

describe("session-store", () => {
  it("activates and deactivates a conversation", () => {
    expect(isSessionActive("conv-1")).toBe(false);
    activateSession("conv-1");
    expect(isSessionActive("conv-1")).toBe(true);
    deactivateSession("conv-1");
    expect(isSessionActive("conv-1")).toBe(false);
  });

  it("detects activation and deactivation prompts", () => {
    expect(isActivatePrompt("Use kodaelus for this task")).toBe(true);
    expect(isActivatePrompt("use kodaelus 1")).toBe(true);
    expect(isActivatePrompt("kodaelus planner")).toBe(true);
    expect(isActivatePrompt("kodaelus prompt mode")).toBe(true);
    expect(isActivatePrompt("please fix the bug")).toBe(false);
    expect(isDeactivatePrompt("stop kodaelus")).toBe(true);
    expect(isDeactivatePrompt("normal mode")).toBe(true);
  });

  it("releases the store lock after mutations", () => {
    activateSession("conv-lock");
    const lockPath = join(tempHome, "kodaelus", "active-sessions.json.lock");
    expect(existsSync(lockPath)).toBe(false);
    expect(() => withStoreLock(() => true)).not.toThrow();
  });

  it("waits for an existing lock without throwing on the main thread", async () => {
    const lockPath = join(tempHome, "kodaelus", "active-sessions.json.lock");
    mkdirSync(join(lockPath, ".."), { recursive: true });
    writeFileSync(lockPath, "99999", { flag: "wx" });

    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [activateChildScript, tempHome, "conv-after-lock"], {
        env: process.env,
      });
      child.on("error", reject);
      setTimeout(() => rmSync(lockPath, { force: true }), 50);
      child.on("close", (code) => resolve(code));
    });

    expect(exitCode).toBe(0);
    expect(isSessionActive("conv-after-lock")).toBe(true);
  });

  it("preserves all activations under concurrent hook processes", async () => {
    const count = 12;
    const results = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        new Promise((resolve) => {
          const child = spawn(process.execPath, [activateChildScript, tempHome, `conv-${i}`], {
            env: process.env,
          });
          child.on("close", (code) => resolve(code));
        }),
      ),
    );

    for (const code of results) {
      expect(code).toBe(0);
    }

    const storePath = join(tempHome, "kodaelus", "active-sessions.json");
    const stored = JSON.parse(readFileSync(storePath, "utf8"));
    expect(stored.conversationIds).toHaveLength(count);
    for (let i = 0; i < count; i++) {
      expect(stored.conversationIds).toContain(`conv-${i}`);
    }
  }, 15_000);
});

describe("git-guard", () => {
  it("allows read-only git and blocks mutating git and gh", () => {
    expect(isBlockedGitShellCommand("git status")).toBe(false);
    expect(isBlockedGitShellCommand("git diff")).toBe(false);
    expect(isBlockedGitShellCommand("git log --oneline")).toBe(false);
    expect(isBlockedGitShellCommand("git commit -m test")).toBe(true);
    expect(isBlockedGitShellCommand("gh pr create")).toBe(true);
    expect(isBlockedGitShellCommand("npm test")).toBe(false);
    expect(isBlockedGitShellCommand("echo hello")).toBe(false);
  });
});
