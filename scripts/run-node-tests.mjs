#!/usr/bin/env node
/**
 * Cross-platform node:test runner (shell globs fail on Windows cmd/PowerShell).
 *
 * Usage: node scripts/run-node-tests.mjs <dir> [dir...]
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

/**
 * @param {string} dir
 * @returns {string[]}
 */
function collectTestFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "fixtures") continue;
      results.push(...collectTestFiles(full));
      continue;
    }
    if (entry.name.endsWith(".test.mjs")) {
      results.push(full);
    }
  }

  return results;
}

const dirs = process.argv.slice(2).map((dir) => resolve(repoRoot, dir));
if (dirs.length === 0) {
  console.error("usage: node scripts/run-node-tests.mjs <dir> [dir...]");
  process.exit(1);
}

const files = [...new Set(dirs.flatMap((dir) => collectTestFiles(dir)))].sort();
if (files.length === 0) {
  console.error(`No *.test.mjs files found under: ${dirs.join(", ")}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  cwd: repoRoot,
});

process.exit(result.status ?? 1);
