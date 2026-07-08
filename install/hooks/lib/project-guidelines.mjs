import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureKodaelusGitignore } from "./deletion-guard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PROJECT_GUIDELINES_REL = ".kodaelus/instructions.md";

const DEFAULT_TEMPLATE = `# Project guidelines (Kodaelus)

Supplemental guidelines for this repository. Read together with global Kodaelus policy (\`~/.cursor/kodaelus/instructions.md\`).

**Precedence:** Project guidelines override global policy on conflicts **except** safety-critical items (global always wins): git restrictions, File Deletion Protocol, scope creep guardrail, hook-enforced confidence format, and sub-70% delivery fail rules.

## Preferences

<!-- Kodaelus appends recurring user preferences here (~3 consistent requests) -->

## Conventions

<!-- Project-specific conventions not obvious from the codebase -->

## Notes

<!-- Manual edits welcome -->
`;

/**
 * @param {string} projectRoot
 * @returns {string}
 */
function readTemplate(projectRoot) {
  const cursorHome = process.env.CURSOR_HOME ?? join(homedir(), ".cursor");
  const candidates = [
    join(cursorHome, "kodaelus", "project-instructions.template.md"),
    join(__dirname, "..", "..", "templates", "project-instructions.template.md"),
    join(projectRoot, "install", "templates", "project-instructions.template.md"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf8");
    }
  }

  return DEFAULT_TEMPLATE;
}

/**
 * @param {string} projectRoot
 * @returns {{ created: boolean, path: string }}
 */
export function ensureProjectGuidelines(projectRoot) {
  const root = join(projectRoot);
  const filePath = join(root, PROJECT_GUIDELINES_REL);
  let created = false;

  if (!existsSync(filePath)) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, readTemplate(root), "utf8");
    created = true;
  }

  ensureKodaelusGitignore(root);

  return { created, path: filePath };
}
