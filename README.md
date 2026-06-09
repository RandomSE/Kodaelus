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
| `~/.cursor/hooks.json` + `~/.cursor/hooks/` | Git block + session tracking hooks |

**Windows (PowerShell alternative):** `.\install\install.ps1`

**Uninstall:** `npm run uninstall:global`

## Use in any project

1. Open any repo in Cursor (no Kodaelus files required in that repo).
2. Ask the main agent to use Kodaelus.

Say **stop kodaelus** to end session lock. Git commands are hook-blocked while Kodaelus is active in a chat.

### Modes

| Mode | Say | What you get |
|------|-----|--------------|
| **Full** | `use kodaelus` | TDD, implementation, verification, structured delivery |
| **Kodaelus 1** | `use kodaelus 1`, `kodaelus planner`, `kodaelus prompt mode` | Read-only planning; outputs an expanded **Recommended Kodaelus Prompt** to paste and run in full mode |
| **Upgrade** | `use kodaelus`, `run it`, or `execute` after Kodaelus 1 | Switches to full mode using the recommended prompt as the task |

### Architecture Improvement Review

Ask for improvements, alternatives, or tradeoffs **without** asking for code yet (e.g. “architecture review,” “what would you do differently”). Kodaelus returns a dedicated **Architecture Improvement Review** with rated decision points (1–5), options, recommendations, and confidence scores tied to repo evidence.

### Follow-Up Queue

After substantive deliveries (features, fixes, refactors), Kodaelus appends a structured **Follow-Up Queue** (`FU-1`, `FU-2`, …) with scope, effort, risk, and confidence — not open-ended “say the word” suggestions.

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
cd sdk && npm test
npm run test:hooks
```

`test:hooks` runs hook unit tests (git guard, session-store activation phrases).

## Legal & distribution

| Document | Purpose |
|----------|---------|
| [LICENSE](LICENSE) | Use-only terms; no redistribution or sale; Licensor discretion |
| [NOTICE](NOTICE) | Third-party components (Cursor, SDK, npm deps) |
| [TRADEMARKS.md](TRADEMARKS.md) | Name usage; not affiliated with Cursor |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |

This repository may be **public** or **private** on GitHub. Either way, downstream users receive only the rights in LICENSE - not ownership or redistribution rights.