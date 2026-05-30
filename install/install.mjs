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
const instructionsSrc = join(repoRoot, "kodaelus", "instructions.md");
const templateAgent = join(__dirname, "templates", "kodaelus.agent.md");
const templateSkill = join(__dirname, "templates", "kodaelus.skill.md");

const cursorHome = defaultCursorHome();
const globalKodaelus = join(cursorHome, "kodaelus");
const agentsDir = join(cursorHome, "agents");
const skillsDir = join(cursorHome, "skills", "kodaelus");

const uninstall = process.argv.includes("--uninstall");

if (uninstall) {
  for (const p of [
    globalKodaelus,
    join(agentsDir, "kodaelus.md"),
    skillsDir,
  ]) {
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

if (!existsSync(instructionsSrc)) {
  console.error(`Missing: ${instructionsSrc}`);
  process.exit(1);
}

const instructions = readFileSync(instructionsSrc, "utf8");
const agentTemplate = readFileSync(templateAgent, "utf8");
const agentBody = agentTemplate.replace("{{INSTRUCTIONS}}", instructions.trimEnd());

mkdirSync(globalKodaelus, { recursive: true });
mkdirSync(agentsDir, { recursive: true });
mkdirSync(skillsDir, { recursive: true });

writeFileSync(join(globalKodaelus, "instructions.md"), instructions, "utf8");
writeFileSync(join(agentsDir, "kodaelus.md"), agentBody, "utf8");
cpSync(templateSkill, join(skillsDir, "SKILL.md"));

const { hooksJsonDest, hooksDestDir } = installUserHooks({ repoRoot, cursorHome });
const ruleDest = installSessionRule({ repoRoot, cursorHome });

console.log("Kodaelus installed for all Cursor projects.");
console.log("  Use is subject to the Kodaelus Proprietary License (LICENSE in this repo).");
console.log(`  Instructions: ${join(globalKodaelus, "instructions.md")}`);
console.log(`  Subagent:     ${join(agentsDir, "kodaelus.md")}`);
console.log(`  Skill:        ${join(skillsDir, "SKILL.md")}`);
console.log(`  Session rule: ${ruleDest}`);
console.log(`  User hooks:   ${hooksJsonDest}`);
console.log(`  Hook scripts: ${hooksDestDir}`);
console.log("");
console.log("In any project: ask the main agent to use Kodaelus.");
console.log("Say \"stop kodaelus\" to end session lock. Git is hook-blocked while active.");
console.log("Re-run after editing kodaelus/instructions.md in this repo.");
