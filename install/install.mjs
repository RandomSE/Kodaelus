#!/usr/bin/env node
/**
 * Cross-platform Kodaelus global installer.
 * Usage: node install/install.mjs [--uninstall]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultCursorHome,
  installSessionRule,
  installUserHooks,
  uninstallSessionRule,
  uninstallUserHooks,
} from "./lib/user-hooks.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const policySrc = join(repoRoot, "kodaelus");
const coreSrc = join(policySrc, "core.md");

const cursorHome = defaultCursorHome();
const globalKodaelus = join(cursorHome, "kodaelus");
const agentsDir = join(cursorHome, "agents");

const AGENT_TEMPLATES = [
  ["kodaelus.agent.md", "kodaelus.md"],
  ["kodaelus-bug.agent.md", "kodaelus-bug.md"],
  ["kodaelus-prompt.agent.md", "kodaelus-prompt.md"],
];

const SKILL_TEMPLATES = [
  ["kodaelus.skill.md", "kodaelus"],
  ["kodaelus-file-deletion.skill.md", "kodaelus-file-deletion"],
  ["kodaelus-refactor.skill.md", "kodaelus-refactor"],
  ["kodaelus-architecture-review.skill.md", "kodaelus-architecture-review"],
];

const uninstall = process.argv.includes("--uninstall");

if (uninstall) {
  const removals = [
    globalKodaelus,
    ...AGENT_TEMPLATES.map(([, destName]) => join(agentsDir, destName)),
    ...SKILL_TEMPLATES.map(([, dirName]) => join(cursorHome, "skills", dirName)),
  ];
  for (const p of removals) {
    if (existsSync(p)) {
      rmSync(p, { recursive: true, force: true });
      console.log(`Removed: ${p}`);
    }
  }
  uninstallUserHooks({ cursorHome });
  uninstallSessionRule({ cursorHome });
  console.log("Kodaelus global install removed (including user hooks and session rule).");
  process.exit(0);
}

if (!existsSync(coreSrc)) {
  console.error(`Missing: ${coreSrc}`);
  process.exit(1);
}

mkdirSync(globalKodaelus, { recursive: true });
mkdirSync(agentsDir, { recursive: true });

for (const rel of ["core.md", "instructions.md", "policy-manifest.json"]) {
  cpSync(join(policySrc, rel), join(globalKodaelus, rel));
}
for (const dir of ["modes", "tasks", "fragments"]) {
  cpSync(join(policySrc, dir), join(globalKodaelus, dir), { recursive: true, force: true });
}
cpSync(
  join(__dirname, "templates", "project-instructions.template.md"),
  join(globalKodaelus, "project-instructions.template.md"),
);

for (const [templateName, destName] of AGENT_TEMPLATES) {
  const body = readFileSync(join(__dirname, "templates", templateName), "utf8");
  writeFileSync(join(agentsDir, destName), body, "utf8");
}

for (const [templateName, dirName] of SKILL_TEMPLATES) {
  const destDir = join(cursorHome, "skills", dirName);
  mkdirSync(destDir, { recursive: true });
  cpSync(join(__dirname, "templates", templateName), join(destDir, "SKILL.md"));
}

const { hooksJsonDest, hooksDestDir } = installUserHooks({ repoRoot, cursorHome });
const ruleDest = installSessionRule({ repoRoot, cursorHome });

console.log("Kodaelus installed for all Cursor projects.");
console.log("  Use is subject to the Kodaelus Proprietary License (LICENSE in this repo).");
console.log(`  Core:         ${join(globalKodaelus, "core.md")}`);
console.log(`  Manifest:     ${join(globalKodaelus, "policy-manifest.json")}`);
console.log(`  Modes:        ${join(globalKodaelus, "modes")}`);
console.log(`  Tasks:        ${join(globalKodaelus, "tasks")}`);
console.log(`  Stub:         ${join(globalKodaelus, "instructions.md")}`);
console.log(`  Subagents:    ${join(agentsDir, "kodaelus.md")}, kodaelus-bug.md, kodaelus-prompt.md`);
console.log(`  Skills:       kodaelus, kodaelus-file-deletion, kodaelus-refactor, kodaelus-architecture-review`);
console.log(`  Session rule: ${ruleDest}`);
console.log(`  User hooks:   ${hooksJsonDest}`);
console.log(`  Hook scripts: ${hooksDestDir}`);
console.log("");
console.log("In any project: ask the main agent to use Kodaelus.");
console.log("Say \"stop kodaelus\" to end session lock. Mutating git is hook-blocked while active (status/diff/log allowed).");
console.log("Re-run npm run install:global after editing kodaelus/core.md, modes/, tasks/, or policy-manifest.json.");
