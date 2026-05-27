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

**Windows (PowerShell alternative):** `.\install\install.ps1`

**Uninstall:** `npm run uninstall:global`

## Use in any project

1. Open any repo in Cursor (no Kodaelus files required in that repo).
2. Ask the main agent to use Kodaelus.


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
```

## Legal & distribution

| Document | Purpose |
|----------|---------|
| [LICENSE](LICENSE) | Use-only terms; no redistribution or sale; Licensor discretion |
| [NOTICE](NOTICE) | Third-party components (Cursor, SDK, npm deps) |
| [TRADEMARKS.md](TRADEMARKS.md) | Name usage; not affiliated with Cursor |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |

This repository may be **public** or **private** on GitHub. Either way, downstream users receive only the rights in LICENSE - not ownership or redistribution rights.