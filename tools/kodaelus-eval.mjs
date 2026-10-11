#!/usr/bin/env node
/**
 * Eval JSONL transcripts for token share and behavior checks.
 *
 * Usage: node tools/kodaelus-eval.mjs <dir-or-jsonl> [--write-baseline]
 *        node tools/kodaelus-eval.mjs --expect [dir]   (default evals/local; skips when absent)
 *
 * A file named bad.jsonl or ending in .negative.jsonl is expected to fail
 * its behavior checks. The process exits 0 when those failures happen and
 * every other transcript passes, including the category gate.
 */
import { evaluatePath, expectLocal } from "../install/lib/kodaelus-eval.mjs";

const args = process.argv.slice(2);

if (args.includes("--expect")) {
  const dir = args.find((arg) => !arg.startsWith("--")) || "evals/local";
  const checked = expectLocal(dir);
  process.stdout.write(checked.report);
  process.exit(checked.exitCode);
}
const writeBaseline = args.includes("--write-baseline");
const target = args.find((arg) => !arg.startsWith("--"));

if (!target) {
  console.error("usage: node tools/kodaelus-eval.mjs <dir-or-jsonl> [--write-baseline]");
  process.exit(1);
}

const result = evaluatePath(target, { skipChildFixtures: false, writeBaseline });
process.stdout.write(result.report.endsWith("\n") ? result.report : `${result.report}\n`);
process.exit(result.exitCode);
