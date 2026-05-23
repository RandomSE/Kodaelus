# Kodaelus

Elite coding agent for Cursor IDE and the [Cursor SDK](https://cursor.com/docs/sdk/typescript). **Install once**, use in **every project** — no need to copy this repo into each workspace.

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

After editing `kodaelus/instructions.md` here, run `npm run install:global` again to push updates to your user profile.

**Uninstall:** `npm run uninstall:global`

## Use in any project

1. Open any repo in Cursor (no Kodaelus files required in that repo).
2. Choose the **kodaelus** subagent from the agent picker, or ask the main agent to use Kodaelus.

Project-level `.cursor/agents/kodaelus.mdc` in *this* repo is only a stub for contributors; other projects do not need it.

## SDK CLI (any project directory)

Run from the **target** project (not necessarily this repo):

```bash
cd path/to/your-project
export CURSOR_API_KEY="cursor_..."
npx --prefix path/to/Kodaelus/sdk npm run kodaelus -- "Your task"
```

Or after `cd Kodaelus/sdk && npm install`:

```bash
cd path/to/your-project
KODAELUS_CWD="$(pwd)" npm --prefix path/to/Kodaelus/sdk run kodaelus -- "Your task"
```

Instructions resolve from `~/.cursor/kodaelus/instructions.md` after global install, or `KODAELUS_INSTRUCTIONS` if set.

## Customize policy

1. Edit [`kodaelus/instructions.md`](kodaelus/instructions.md) in this repo.
2. Run `npm run install:global`.

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

## Private GitHub repository

This project is intended as a **private** repo. It uses its own git root (not your home directory).

1. **Open this folder in Cursor** (`Kodaelus`), not your user profile or `Desktop`.
2. Before committing, run `git rev-parse --show-toplevel` — it must end with `\Kodaelus`.
3. Follow [docs/GITHUB.md](docs/GITHUB.md) for first push with `gh repo create ... --private`.
4. Do not commit `.env` — use `.env.example` as a template only.

If Source Control lists `.android`, `Downloads`, etc., you are on the wrong git root — see [docs/GITHUB.md](docs/GITHUB.md#if-git-shows-files-from-your-whole-pc).

After cloning on a new machine:

```bash
npm run install:global
cd sdk && npm ci
```
