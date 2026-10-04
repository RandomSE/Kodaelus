import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedSuggestShellCommand,
  isBugDiagnosticWritePath,
  isDiagnosticInstrumentationPath,
  isProductEditPath,
  isSecretsFixturePath,
  isSuggestArtifactPath,
  isTestOrSpecPath,
  isWriteOrStrReplaceTool,
  isWriteStrReplaceOrPatchTool,
  resolveSuggestWritePath,
} from "./path-allowlist.mjs";

test("isBugDiagnosticWritePath allows .kodaelus, tests, diagnostic heuristics", () => {
  assert.equal(isBugDiagnosticWritePath(".kodaelus/bugs/x-dossier.md"), true);
  assert.equal(isBugDiagnosticWritePath(".kodaelus/bugs/x/traces/a.log"), true);
  assert.equal(isBugDiagnosticWritePath("src/foo.test.ts"), true);
  assert.equal(isBugDiagnosticWritePath("src/foo.spec.mjs"), true);
  assert.equal(isBugDiagnosticWritePath("debug/trace.js"), true);
  assert.equal(isBugDiagnosticWritePath("src/instrumentation/hook.ts"), true);
  assert.equal(isBugDiagnosticWritePath("repro_login.js"), true);
  assert.equal(isBugDiagnosticWritePath("src/app.ts"), false);
  assert.equal(isBugDiagnosticWritePath("install/hooks/scope-creep-guard.mjs"), false);
});

test("resolveSuggestWritePath salvages Windows absolute suggestions paths", () => {
  const stripped =
    "C:\\Users\\someone\\OneDrive\\Desktop\\Repo\\.kodaelus\\suggestions\\2026-10-02-issues.md";
  const posixRel =
    "C:/Users/someone/OneDrive/Desktop/Repo/.kodaelus/suggestions/2026-10-02-issues.md";
  assert.equal(
    resolveSuggestWritePath(posixRel, stripped),
    ".kodaelus/suggestions/2026-10-02-issues.md",
  );
  assert.equal(
    resolveSuggestWritePath("2026-10-02-issues.md", stripped),
    ".kodaelus/suggestions/2026-10-02-issues.md",
  );
  assert.equal(
    resolveSuggestWritePath(
      "evil/.kodaelus/suggestions/x.md",
      "evil/.kodaelus/suggestions/x.md",
    ),
    "evil/.kodaelus/suggestions/x.md",
  );
  assert.equal(
    resolveSuggestWritePath(".kodaelus/suggestions/x.md", ".kodaelus/suggestions/x.md"),
    ".kodaelus/suggestions/x.md",
  );
});

test("isSuggestArtifactPath only under .kodaelus/suggestions", () => {
  assert.equal(isSuggestArtifactPath(".kodaelus/suggestions/2026-01-01-issues.md"), true);
  assert.equal(isSuggestArtifactPath(".kodaelus/suggestions"), true);
  assert.equal(isSuggestArtifactPath(".kodaelus/bugs/x.md"), false);
  assert.equal(isSuggestArtifactPath("src/x.ts"), false);
});

test("isSecretsFixturePath allowlist", () => {
  assert.equal(isSecretsFixturePath("test/fixtures/keys.env"), true);
  assert.equal(isSecretsFixturePath("src/foo.test.ts"), true);
  assert.equal(isSecretsFixturePath(".kodaelus/tmp.env"), true);
  assert.equal(isSecretsFixturePath("src/config.ts"), false);
});

test("isProductEditPath excludes diagnostic allowlist", () => {
  assert.equal(isProductEditPath("src/app.ts"), true);
  assert.equal(isProductEditPath("src/app.test.ts"), false);
  assert.equal(isProductEditPath(".kodaelus/bugs/d.md"), false);
});

test("isAllowedSuggestShellCommand allows mkdir under suggestions", () => {
  assert.equal(isAllowedSuggestShellCommand("mkdir .kodaelus/suggestions"), true);
  assert.equal(isAllowedSuggestShellCommand("mkdir -p .kodaelus/suggestions"), true);
  assert.equal(isAllowedSuggestShellCommand("mkdir src/foo"), false);
  assert.equal(isAllowedSuggestShellCommand("npm install"), false);
});

test("isAllowedSuggestShellCommand allows gated mkdir wrappers under suggestions only", () => {
  assert.equal(
    isAllowedSuggestShellCommand(
      "if (-not (Test-Path .kodaelus/suggestions)) { mkdir .kodaelus/suggestions }",
    ),
    true,
  );
  assert.equal(
    isAllowedSuggestShellCommand(
      "New-Item -ItemType Directory -Force -Path .kodaelus/suggestions",
    ),
    true,
  );
  assert.equal(
    isAllowedSuggestShellCommand("mkdir -p .kodaelus/suggestions/2026"),
    true,
  );
  assert.equal(
    isAllowedSuggestShellCommand(
      "if (-not (Test-Path src/new)) { mkdir src/new }",
    ),
    false,
  );
  assert.equal(
    isAllowedSuggestShellCommand(
      "New-Item -ItemType Directory -Force -Path src/new",
    ),
    false,
  );
  assert.equal(
    isAllowedSuggestShellCommand(
      "mkdir .kodaelus/suggestions; Remove-Item src",
    ),
    false,
  );
});

test("isAllowedSuggestShellCommand rejects paths that only contain suggestions substring", () => {
  assert.equal(
    isAllowedSuggestShellCommand("mkdir /home/.kodaelus/suggestions/file"),
    false,
  );
  assert.equal(
    isAllowedSuggestShellCommand("mkdir evil/.kodaelus/suggestions"),
    false,
  );
  assert.equal(
    isAllowedSuggestShellCommand("mkdir not-.kodaelus/suggestions-trap"),
    false,
  );
});

test("tool name helpers", () => {
  assert.equal(isWriteOrStrReplaceTool("Write"), true);
  assert.equal(isWriteOrStrReplaceTool("StrReplace"), true);
  assert.equal(isWriteOrStrReplaceTool("ApplyPatch"), false);
  assert.equal(isWriteStrReplaceOrPatchTool("ApplyPatch"), true);
  assert.equal(isTestOrSpecPath("a.test.js"), true);
  assert.equal(isTestOrSpecPath("tests/engine.rs"), true);
  assert.equal(isTestOrSpecPath("tests/matching/mod.rs"), true);
  assert.equal(isTestOrSpecPath("src/engine.rs"), false);
  assert.equal(isTestOrSpecPath("src/foo_test.rs"), true);
  assert.equal(isDiagnosticInstrumentationPath("diag/out.log"), true);
});
