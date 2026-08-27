import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KODAELUS_HOOK_COMMANDS = new Set([
  "node ./hooks/kodaelus-session.mjs",
  "node ./hooks/block-git-when-kodaelus.mjs",
  "node ./hooks/guard-delete.mjs",
  "node ./hooks/guard-patch-delete.mjs",
  "node ./hooks/block-delete-shell.mjs",
  "node ./hooks/block-readonly-shell.mjs",
  "node ./hooks/scope-creep-guard.mjs",
  "node ./hooks/confidence-evidence-guard.mjs",
  "node ./hooks/dash-guard.mjs",
  "node ./hooks/ask-question-guard.mjs",
  "node ./hooks/manifest-verify.mjs",
  "node ./hooks/secrets-guard.mjs",
  "node ./hooks/delivery-structure-guard.mjs",
  "node ./hooks/prompt-fence-guard.mjs",
  "node ./hooks/test-evidence-guard.mjs",
  "node ./hooks/shell-evidence-recorder.mjs",
  "node ./hooks/tdd-order-guard.mjs",
]);

/** Relative paths under ~/.cursor/hooks removed on uninstall. */
export const KODAELUS_HOOK_RELATIVE_PATHS = [
  "kodaelus-session.mjs",
  "block-git-when-kodaelus.mjs",
  "guard-delete.mjs",
  "guard-patch-delete.mjs",
  "block-delete-shell.mjs",
  "block-readonly-shell.mjs",
  "scope-creep-guard.mjs",
  "confidence-evidence-guard.mjs",
  "dash-guard.mjs",
  "ask-question-guard.mjs",
  "manifest-verify.mjs",
  "secrets-guard.mjs",
  "delivery-structure-guard.mjs",
  "prompt-fence-guard.mjs",
  "test-evidence-guard.mjs",
  "shell-evidence-recorder.mjs",
  "tdd-order-guard.mjs",
  "lib/session-store.mjs",
  "lib/git-guard.mjs",
  "lib/entry-point-guard.mjs",
  "lib/deletion-guard.mjs",
  "lib/plan-estimate.mjs",
  "lib/confidence-format.mjs",
  "lib/dash-guard.mjs",
  "lib/ask-question-guard.mjs",
  "lib/patch-guard.mjs",
  "lib/deletion-manifest-io.mjs",
  "lib/suggestions-diff.mjs",
  "lib/mode-guard.mjs",
  "lib/kodaelus-mode.mjs",
  "lib/shell-mutator-guard.mjs",
  "lib/project-guidelines.mjs",
  "lib/preference-intent.mjs",
  "lib/preference-learning.mjs",
  "lib/restore.mjs",
  "lib/restore-handler.mjs",
  "lib/path-allowlist.mjs",
  "lib/secrets-guard.mjs",
  "lib/delivery-structure-guard.mjs",
  "lib/prompt-fence-guard.mjs",
  "lib/test-evidence-guard.mjs",
  "lib/tdd-order-guard.mjs",
  "lib/cloud-runtime.mjs",
];

export function mergeHooks(existing, template) {
  const merged = {
    version: template.version ?? existing?.version ?? 1,
    hooks: { ...(existing?.hooks ?? {}) },
  };

  for (const [event, entries] of Object.entries(template.hooks ?? {})) {
    const current = Array.isArray(merged.hooks[event]) ? merged.hooks[event] : [];
    const kept = current.filter((entry) => !KODAELUS_HOOK_COMMANDS.has(entry?.command));
    const incoming = Array.isArray(entries) ? entries : [];
    merged.hooks[event] = [...kept, ...incoming];
  }

  return merged;
}

export function stripKodaelusHooks(existing) {
  if (!existing?.hooks) return existing ?? { version: 1, hooks: {} };
  const hooks = {};
  for (const [event, entries] of Object.entries(existing.hooks)) {
    const kept = (Array.isArray(entries) ? entries : []).filter(
      (entry) => !KODAELUS_HOOK_COMMANDS.has(entry?.command),
    );
    if (kept.length > 0) hooks[event] = kept;
  }
  return { version: existing.version ?? 1, hooks };
}

export function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function installUserHooks({ repoRoot, cursorHome }) {
  const hooksSrcDir = join(repoRoot, "install", "hooks");
  const hooksDestDir = join(cursorHome, "hooks");
  const hooksJsonDest = join(cursorHome, "hooks.json");
  const templateHooks = readJson(join(repoRoot, "install", "templates", "hooks.json"));
  if (!templateHooks) {
    throw new Error("Missing install/templates/hooks.json");
  }

  mkdirSync(hooksDestDir, { recursive: true });
  cpSync(hooksSrcDir, hooksDestDir, { recursive: true, force: true });

  const existing = readJson(hooksJsonDest);
  const merged = mergeHooks(existing, templateHooks);
  writeFileSync(hooksJsonDest, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  return { hooksJsonDest, hooksDestDir };
}

export function uninstallUserHooks({ cursorHome }) {
  const hooksJsonDest = join(cursorHome, "hooks.json");
  const hooksDestDir = join(cursorHome, "hooks");

  if (existsSync(hooksJsonDest)) {
    const existing = readJson(hooksJsonDest);
    const stripped = stripKodaelusHooks(existing);
    const hasHooks = Object.keys(stripped.hooks ?? {}).length > 0;
    if (hasHooks) {
      writeFileSync(hooksJsonDest, `${JSON.stringify(stripped, null, 2)}\n`, "utf8");
    } else {
      rmSync(hooksJsonDest, { force: true });
    }
  }

  for (const rel of KODAELUS_HOOK_RELATIVE_PATHS) {
    const file = join(hooksDestDir, rel);
    if (existsSync(file)) rmSync(file, { force: true });
  }

  for (const rel of ["active-sessions.json", "active-sessions.json.lock"]) {
    const file = join(cursorHome, "kodaelus", rel);
    if (existsSync(file)) rmSync(file, { force: true });
  }

  const libDir = join(hooksDestDir, "lib");
  if (existsSync(libDir) && readdirSync(libDir).length === 0) {
    rmSync(libDir, { recursive: true, force: true });
  }
}

export function installSessionRule({ repoRoot, cursorHome }) {
  const rulesDir = join(cursorHome, "rules");
  const src = join(repoRoot, "install", "templates", "kodaelus-session.rule.mdc");
  const dest = join(rulesDir, "kodaelus-session.mdc");
  mkdirSync(rulesDir, { recursive: true });
  cpSync(src, dest, { force: true });
  return dest;
}

export function uninstallSessionRule({ cursorHome }) {
  const dest = join(cursorHome, "rules", "kodaelus-session.mdc");
  if (existsSync(dest)) rmSync(dest, { force: true });
}

export function defaultCursorHome() {
  return process.env.CURSOR_HOME ?? join(homedir(), ".cursor");
}
