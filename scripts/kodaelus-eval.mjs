#!/usr/bin/env node
/**
 * Eval JSONL transcripts for token share and behavior checks.
 *
 * Usage: node scripts/kodaelus-eval.mjs <dir-or-jsonl> [--write-baseline]
 *
 * A directory scan skips child directories named fixtures.
 * Pass evals/fixtures itself to evaluate the synthetic pair.
 */
import { resolve, sep } from "node:path";
import { evaluatePath } from "../install/lib/kodaelus-eval.mjs";

const args = process.argv.slice(2);
const writeBaseline = args.includes("--write-baseline");
const target = args.find((arg) => !arg.startsWith("--"));

if (!target) {
  console.error("usage: node scripts/kodaelus-eval.mjs <dir-or-jsonl> [--write-baseline]");
  process.exit(1);
}

const skipChildFixtures = !resolve(target).split(sep).includes("fixtures");
const result = evaluatePath(target, { skipChildFixtures, writeBaseline });
process.stdout.write(result.report.endsWith("\n") ? result.report : `${result.report}\n`);
process.exit(result.exitCode);
