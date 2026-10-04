# Kodaelus

Kodaelus is a Cursor session policy that replaces ad-hoc prompt engineering with locked modes, action boundaries, and delivery formats. Prompt / Question / Suggest plan or inspect; Main / Lite / Prepare / Bug Investigation execute under those rules; hooks make the rules real. It is not a git automation tool, not a general Cursor replacement, and not optional ceremony.

Agent distribution -- not required inside consumer projects. Use is governed by [LICENSE](LICENSE) (no redistribution or sale).

## One-time setup

```bash
npm run install:global
```

## Use in any repo

- Pick subagent **kodaelus**, or ask to use Kodaelus.
- Modes: Main (0), Planner / Prompt (1), Bug Investigation (2), Suggest (3), Mode Lite (4), Question (5), Prepare (6), Ship (7).
- `use kodaelus bug` investigates, `bugfix` / `use kodaelus bugfix` implements in Main.
- Ship reports CI and may repair up to 3 product cycles after a red check (`ship ci continue` unlocks). It does not merge or force-push.
- No `AGENTS.md` or `.cursor/rules` from this project needed.

## Policy source

[`kodaelus/core.md`](kodaelus/core.md), [`kodaelus/policy-manifest.json`](kodaelus/policy-manifest.json), and [`kodaelus/modes/`](kodaelus/modes/) → copied to `~/.cursor/kodaelus/` on install. [`kodaelus/instructions.md`](kodaelus/instructions.md) is a redirect stub. Re-run `npm run install:global` after policy or hook changes so Suggest writes under `.kodaelus/suggestions/**` use the installed allowlist.

## SDK (CLI and programmatic API)

See [README.md](README.md#sdk-cli-and-programmatic-api).

## Tests

```bash
npm test                 # policy smoke + hook unit/integration tests (repo root)
cd sdk && npm test       # SDK runner + restore helper tests
```
