import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  checkEntryPoint,
  extractDeletePath,
  extractShellDeleteTargets,
  isPathInside,
  resolveProjectRoot,
} from "./entry-point-guard.mjs";

let tempRoot;

test.beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "kodaelus-entry-"));
});

test.afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

test("extractDeletePath reads tool_input.path", () => {
  assert.equal(extractDeletePath({ tool_input: { path: "src/main.ts" } }), "src/main.ts");
});

test("checkEntryPoint blocks package.json main", () => {
  writeFileSync(
    join(tempRoot, "package.json"),
    JSON.stringify({ main: "index.js", scripts: { start: "node index.js" } }),
    "utf8",
  );
  writeFileSync(join(tempRoot, "index.js"), "console.log('ok');", "utf8");
  writeFileSync(join(tempRoot, "util.js"), "export {};", "utf8");

  const main = checkEntryPoint("index.js", tempRoot);
  assert.equal(main.blocked, true);
  assert.match(main.reasons.join(" "), /package\.json/);

  const util = checkEntryPoint("util.js", tempRoot);
  assert.equal(util.blocked, false);
});

test("checkEntryPoint blocks Python __main__", () => {
  writeFileSync(
    join(tempRoot, "main.py"),
    "if __name__ == '__main__':\n  print('run')\n",
    "utf8",
  );
  const result = checkEntryPoint("main.py", tempRoot);
  assert.equal(result.blocked, true);
  assert.match(result.reasons.join(" "), /__main__/);
});

test("checkEntryPoint blocks CI workflow references", () => {
  mkdirSync(join(tempRoot, ".github", "workflows"), { recursive: true });
  writeFileSync(
    join(tempRoot, ".github", "workflows", "ci.yml"),
    "jobs:\n  test:\n    steps:\n      - run: node scripts/run.mjs\n",
    "utf8",
  );
  mkdirSync(join(tempRoot, "scripts"), { recursive: true });
  writeFileSync(join(tempRoot, "scripts", "run.mjs"), "export {};", "utf8");

  const result = checkEntryPoint("scripts/run.mjs", tempRoot);
  assert.equal(result.blocked, true);
  assert.match(result.reasons.join(" "), /CI workflow/);
});

test("extractShellDeleteTargets parses rm and Remove-Item", () => {
  assert.deepEqual(extractShellDeleteTargets("rm -f src/main.ts"), ["src/main.ts"]);
  assert.deepEqual(extractShellDeleteTargets("Remove-Item -Force main.py"), ["main.py"]);
});

test("isPathInside rejects sibling directory names (project vs projects)", () => {
  const parent = mkdtempSync(join(tmpdir(), "kodaelus-sibling-"));
  const project = join(parent, "project");
  const projects = join(parent, "projects");
  mkdirSync(project);
  mkdirSync(projects);
  const siblingFile = join(projects, "file.js");

  assert.equal(isPathInside(project, siblingFile), false);
  assert.equal(isPathInside(project, join(project, "file.js")), true);

  rmSync(parent, { recursive: true, force: true });
});

test("isPathInside rejects project-backup sibling paths", () => {
  const parent = mkdtempSync(join(tmpdir(), "kodaelus-backup-"));
  const project = join(parent, "project");
  const backup = join(parent, "project-backup");
  mkdirSync(project);
  mkdirSync(backup);
  const backupFile = join(backup, "file.js");

  assert.equal(isPathInside(project, backupFile), false);

  rmSync(parent, { recursive: true, force: true });
});

test("resolveProjectRoot does not fall back to roots[0] when path is outside all roots", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "kodaelus-root-a-"));
  const otherRoot = mkdtempSync(join(tmpdir(), "kodaelus-root-b-"));
  const outsideFile = join(otherRoot, "index.js");
  writeFileSync(outsideFile, "export {};\n", "utf8");

  const resolved = resolveProjectRoot({ workspace_roots: [projectRoot] }, outsideFile);
  assert.notEqual(resolve(resolved), resolve(projectRoot));

  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(otherRoot, { recursive: true, force: true });
});

test("resolveProjectRoot picks containing root for paths under workspace", () => {
  const parent = mkdtempSync(join(tmpdir(), "kodaelus-workspace-"));
  const project = join(parent, "app");
  mkdirSync(project, { recursive: true });
  const file = join(project, "src", "index.js");
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(file, "export {};\n", "utf8");

  const resolved = resolveProjectRoot({ workspace_roots: [project] }, file);
  assert.equal(resolve(resolved), resolve(project));

  rmSync(parent, { recursive: true, force: true });
});

test("resolveProjectRoot picks longest containing root when nested", () => {
  const parent = mkdtempSync(join(tmpdir(), "kodaelus-nested-"));
  const outer = join(parent, "mono");
  const inner = join(outer, "packages", "app");
  mkdirSync(inner, { recursive: true });
  const file = join(inner, "src", "main.ts");
  mkdirSync(join(inner, "src"), { recursive: true });
  writeFileSync(file, "export {};\n", "utf8");

  const resolved = resolveProjectRoot({ workspace_roots: [outer, inner] }, file);
  assert.equal(resolve(resolved), resolve(inner));

  rmSync(parent, { recursive: true, force: true });
});

test("resolveProjectRoot maps relative paths against workspace root for shell deletes", () => {
  const project = mkdtempSync(join(tmpdir(), "kodaelus-relative-"));
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({ main: "index.js" }),
    "utf8",
  );
  writeFileSync(join(project, "index.js"), "console.log('ok');\n", "utf8");

  const resolved = resolveProjectRoot({ workspace_roots: [project] }, "index.js");
  assert.equal(resolve(resolved), resolve(project));

  rmSync(project, { recursive: true, force: true });
});
