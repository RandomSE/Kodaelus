/**
 * Copy Kodaelus policy into a target repo and point agents at core.md.
 * Cloud agents do not have ~/.cursor, so the instruction has to live in the repo.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const LOAD_IMPERATIVE =
  "First tool call: Read `.cursor/kodaelus/core.md`, then the active mode file `.cursor/kodaelus/modes/<active>.md`. Work done without that read is invalid.";

const AGENTS_SNIPPET = `# Kodaelus\n\n${LOAD_IMPERATIVE}\n`;

const RULE = `---
description: Load Kodaelus core before any other work
alwaysApply: true
---

${LOAD_IMPERATIVE}
`;

/**
 * @param {{ repoRoot: string, targetRoot: string }} params
 */
export function installProject({ repoRoot, targetRoot }) {
  if (!repoRoot || !targetRoot) {
    throw new Error("installProject requires repoRoot and targetRoot");
  }
  if (!existsSync(targetRoot)) {
    throw new Error(`Missing target: ${targetRoot}`);
  }
  const policySrc = join(repoRoot, "kodaelus");
  if (!existsSync(join(policySrc, "core.md"))) {
    throw new Error(`Missing: ${join(policySrc, "core.md")}`);
  }

  const policyDest = join(targetRoot, ".cursor", "kodaelus");
  mkdirSync(policyDest, { recursive: true });
  for (const rel of ["core.md", "instructions.md", "policy-manifest.json"]) {
    cpSync(join(policySrc, rel), join(policyDest, rel));
  }
  for (const dir of ["modes", "tasks", "fragments"]) {
    cpSync(join(policySrc, dir), join(policyDest, dir), { recursive: true, force: true });
  }

  const rulesDir = join(targetRoot, ".cursor", "rules");
  mkdirSync(rulesDir, { recursive: true });
  writeFileSync(join(rulesDir, "kodaelus-load.mdc"), RULE, "utf8");

  const agentsPath = join(targetRoot, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    writeFileSync(agentsPath, `${AGENTS_SNIPPET}\n`, "utf8");
  } else {
    const current = readFileSync(agentsPath, "utf8");
    if (!current.includes(LOAD_IMPERATIVE)) {
      const gap = current.startsWith("\n") ? "" : "\n";
      writeFileSync(agentsPath, `${AGENTS_SNIPPET}${gap}${current}`, "utf8");
    }
  }

  return { policyDest, agentsPath, rulePath: join(rulesDir, "kodaelus-load.mdc") };
}
