import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KODAELUS_HOOK_RELATIVE_PATHS,
  mergeHooks,
  stripKodaelusHooks,
  uninstallUserHooks,
} from "../../install/lib/user-hooks.mjs";

describe("user-hooks merge", () => {
  it("merges Kodaelus hooks without duplicating on reinstall", () => {
    const existing = {
      version: 1,
      hooks: {
        beforeShellExecution: [{ command: "node ./hooks/custom.mjs" }],
      },
    };
    const template = {
      version: 1,
      hooks: {
        beforeShellExecution: [{ command: "node ./hooks/block-git-when-kodaelus.mjs" }],
        sessionEnd: [{ command: "node ./hooks/kodaelus-session.mjs" }],
      },
    };

    const first = mergeHooks(existing, template);
    expect(first.hooks.beforeShellExecution).toHaveLength(2);

    const second = mergeHooks(first, template);
    expect(second.hooks.beforeShellExecution).toHaveLength(2);
    expect(second.hooks.sessionEnd).toHaveLength(1);
  });

  it("strips Kodaelus hooks on uninstall", () => {
    const merged = stripKodaelusHooks({
      version: 1,
      hooks: {
        beforeShellExecution: [
          { command: "node ./hooks/custom.mjs" },
          { command: "node ./hooks/block-git-when-kodaelus.mjs" },
        ],
        sessionEnd: [{ command: "node ./hooks/kodaelus-session.mjs" }],
      },
    });

    expect(merged.hooks.beforeShellExecution).toEqual([{ command: "node ./hooks/custom.mjs" }]);
    expect(merged.hooks.sessionEnd).toBeUndefined();
  });

  it("lists git-guard for uninstall", () => {
    expect(KODAELUS_HOOK_RELATIVE_PATHS).toContain("lib/git-guard.mjs");
  });

  it("removes all Kodaelus hook files including git-guard on uninstall", () => {
    const cursorHome = mkdtempSync(join(tmpdir(), "kodaelus-uninstall-"));
    const hooksDir = join(cursorHome, "hooks");

    for (const rel of KODAELUS_HOOK_RELATIVE_PATHS) {
      const file = join(hooksDir, rel);
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, "", "utf8");
    }

    uninstallUserHooks({ cursorHome });

    for (const rel of KODAELUS_HOOK_RELATIVE_PATHS) {
      expect(existsSync(join(hooksDir, rel))).toBe(false);
    }
    expect(existsSync(join(hooksDir, "lib"))).toBe(false);

    rmSync(cursorHome, { recursive: true, force: true });
  });
});
