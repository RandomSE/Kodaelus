# Kodaelus

Elite coding agent for Cursor IDE and the [Cursor SDK](https://cursor.com/docs/sdk/typescript). **Install once**, use in **every project** — no need to copy this repo into each workspace.

**License:** You may install and use Kodaelus for your own development. You may **not** redistribute, resell, or sublicense it. See [LICENSE](LICENSE). Kodaelus is **not** affiliated with Cursor; see [TRADEMARKS.md](TRADEMARKS.md).

## Install globally (one time)

From this folder:

```bash
npm run install:global
```

This writes:

| Location | Purpose |
|----------|---------|
| `~/.cursor/kodaelus/instructions.md` | Canonical policy (edit on reinstall) |
| `~/.cursor/agents/kodaelus.md` | Subagent available in all projects |
| `~/.cursor/skills/kodaelus/SKILL.md` | Skill when you ask for Kodaelus in chat |
| `~/.cursor/rules/kodaelus-session.mdc` | Session lock rule (keeps Kodaelus active in chat) |
| `~/.cursor/hooks.json` + `~/.cursor/hooks/` | Git block, delete guards, scope creep, session tracking |

**Windows (PowerShell alternative):** `.\install\install.ps1`

**Uninstall:** `npm run uninstall:global`

## Use in any project

1. Open any repo in Cursor (no Kodaelus files required in that repo).
2. Ask the main agent to use Kodaelus.

Say **stop kodaelus** to end session lock. Git commands are hook-blocked while Kodaelus is active in a chat.

### Modes

| Mode | Say | What you get |
|------|-----|--------------|
| **Main (0)** | `use kodaelus`, `use kodaelus main`, `use kodaelus bugfix` | Full TDD implementation |
| **Prompt (1)** | `use kodaelus 1`, `use kodaelus prompt`, `kodaelus planner` | Read-only handoff prompt |
| **Bug Investigation (2)** | `use kodaelus 2`, `use kodaelus bug` | Visibility, repro, dossier — not the fix |
| **Suggest (3)** | `use kodaelus suggest issues` / `suggest features` | Proactive audit or roadmap scan (read-only) |
| **Lite (4)** | `use kodaelus lite`, `use kodaelus fast` | Fast small changes; targeted tests only |
| **Question (5)** | `use kodaelus q`, `use kodaelus question` | Deep research Q&A (read-only) |
| **Upgrade** | `run it`, `execute`, `use kodaelus main` | Switch to Main; consume dossier/prompt |

**Mode Lite (4)** is an activation phrase for fast edits. **Delivery Tier Lite** is a shorter section set within a mode — they are different concepts.

`bugfix` / `bug fix` → **Main**, not Bug Investigation. After investigation, say **`use kodaelus bugfix`** to fix using the dossier at `.kodaelus/bugs/`.

Bare **`use kodaelus suggest`** asks you to pick Issues vs Features before scanning.

### Hook enforcement (while Kodaelus is active)

| Guard | Behavior |
|-------|----------|
| **Git** | Read-only only (`status`, `diff`, `log`) |
| **Delete tool / shell rm** | Entry points hard-blocked; other deletes require automatic backup to `.kodaelus/trash/` + manifest |
| **Scope creep** | Blocks edits past `max(10, 2× Plan file estimate)` until you reply **`scope approved`** |
| **Confidence format** | Flags bare `Confidence: NN%` without adjacent `Evidence:` on substantive deliveries |

**Troubleshooting:** If a delete is blocked, check Hooks output for backup/manifest errors. Restore via `restore <file>` or SDK `npm run restore`. Re-run **`npm run install:global`** after upgrading Kodaelus to refresh hooks.

### Architecture Improvement Review

Ask for improvements, alternatives, or tradeoffs **without** asking for code yet (e.g. “architecture review,” “what would you do differently”). Kodaelus returns a dedicated **Architecture Improvement Review** with rated decision points (1–5), options, recommendations, and confidence scores tied to repo evidence.

### Follow-Up Queue

After substantive deliveries (features, fixes, refactors, bug investigations), Kodaelus ends with a structured **Follow-Up Queue** (`FU-1`, `FU-2`, …) as the **final section** — related improvements with scope, effort, risk, and confidence.

To execute queued work, say **implement suggestions**, **implement follow-ups**, **implement FU-2**, or **implement all follow-ups**. Kodaelus expands its plan and runs the full TDD loop for the selected items.

## Layout

| Path | Purpose |
|------|---------|
| `kodaelus/instructions.md` | Source policy (copied on install) |
| `install/` | Global installer |
| `sdk/` | TypeScript SDK runner + tests |
| `.cursor/agents/kodaelus.mdc` | Optional stub in this repo only |

## Tests

```bash
npm test                 # policy smoke + hook unit/integration tests (repo root)
cd sdk && npm test       # SDK runner + restore helper tests
cd sdk && npm run build  # compile dist/ including public exports
```

## SDK (CLI and programmatic API)

The `sdk/` package wraps the [Cursor SDK](https://cursor.com/docs/sdk/typescript) with Kodaelus policy preloaded.

### Run Kodaelus on a task

```bash
cd sdk
export CURSOR_API_KEY=your_key
npm run kodaelus -- "Fix the failing auth test"
```

Optional env: `KODAELUS_CWD` (target project), `KODAELUS_MODEL`, `KODAELUS_INSTRUCTIONS`.

### Restore deleted files

When Kodaelus deletes files under policy, backups live in `.kodaelus/trash/` and entries in `.kodaelus/deletion-manifest.json`. Restore without git:

```bash
cd sdk
npm run restore -- src/removed.ts    # restore a specific path
npm run restore -- --last            # undo the most recent deletion
```

Set `KODAELUS_CWD` to the target project root when not running from that directory.

### Programmatic imports

After `npm run build`:

```typescript
import {
  runKodaelus,
  appendDeletionEntry,
  readDeletionManifest,
  restoreDeletedFile,
  undoLastDeletion,
} from "@kodaelus/sdk-runner";
```

`appendDeletionEntry` writes to `.kodaelus/deletion-manifest.json`; pair with a trash backup per Kodaelus **File Deletion Protocol**.

## Legal & distribution

| Document | Purpose |
|----------|---------|
| [LICENSE](LICENSE) | Use-only terms; no redistribution or sale; Licensor discretion |
| [NOTICE](NOTICE) | Third-party components (Cursor, SDK, npm deps) |
| [TRADEMARKS.md](TRADEMARKS.md) | Name usage; not affiliated with Cursor |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |

This repository may be **public** or **private** on GitHub. Either way, downstream users receive only the rights in LICENSE - not ownership or redistribution rights.