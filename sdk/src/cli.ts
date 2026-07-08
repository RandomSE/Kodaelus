import { runKodaelus } from "./agent.js";

function usage(): never {
  console.error(`Usage: npm run kodaelus -- "<task description>"

Environment:
  CURSOR_API_KEY          Required. User or service-account API key.
  KODAELUS_INSTRUCTIONS   Optional. Path to instructions.md (default: global install)

Project guidelines:
  Bootstraps .kodaelus/instructions.md in KODAELUS_CWD when missing and appends it to the policy prompt.

SDK vs IDE:
  The SDK preloads policy text and detects mode from the task string.
  Cursor IDE hooks enforce git read-only, delete backup/manifest, scope creep, and confidence format.
  Full safety guards require Kodaelus active in Cursor — not in programmatic SDK runs.

Options (env):
  KODAELUS_MODEL   Model id (default: composer-2.5)
  KODAELUS_CWD     Target project directory (default: process.cwd())
`);
  process.exit(1);
}

async function main(): Promise<void> {
  const task = process.argv.slice(2).join(" ").trim();
  if (!task) {
    usage();
  }

  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    console.error("[kodaelus] CURSOR_API_KEY is not set.");
    process.exit(1);
  }

  const outcome = await runKodaelus({
    apiKey,
    task,
    cwd: process.env.KODAELUS_CWD,
    modelId: process.env.KODAELUS_MODEL,
  });

  if (process.exitCode === undefined || process.exitCode === 0) {
    console.error(
      `\n[kodaelus] finished agent=${outcome.agentId} run=${outcome.runId} status=${outcome.result.status}`,
    );
  }
}

main().catch((err: unknown) => {
  if (process.exitCode === undefined) {
    process.exitCode = 1;
  }
  if (err instanceof Error) {
    console.error(`[kodaelus] ${err.message}`);
  } else {
    console.error("[kodaelus] unexpected error", err);
  }
});
