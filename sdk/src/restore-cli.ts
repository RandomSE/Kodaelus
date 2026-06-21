import { restoreDeletedFile, undoLastDeletion } from "./deletion-manifest.js";

function usage(): never {
  console.error(`Usage:
  npm run restore -- <relative-path>
  npm run restore -- --last

Restores files recorded in .kodaelus/deletion-manifest.json from .kodaelus/trash/ backups.

Environment:
  KODAELUS_CWD   Project directory (default: process.cwd())
`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    usage();
  }

  const cwd = process.env.KODAELUS_CWD?.trim() || process.cwd();
  const target = args[0];

  const result =
    target === "--last" || target === "undo"
      ? undoLastDeletion(cwd)
      : restoreDeletedFile(cwd, target);

  console.log(
    `[kodaelus] restored ${result.path} from ${result.backup} at ${result.restoredAt}`,
  );
}

main().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error(`[kodaelus] ${err.message}`);
  } else {
    console.error("[kodaelus] restore failed", err);
  }
  process.exit(1);
});
