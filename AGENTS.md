# Kodaelus

Agent distribution — not required inside consumer projects. Use is governed by [LICENSE](LICENSE) (no redistribution or sale).

## One-time setup

```bash
npm run install:global
```

## Use in any repo

- Pick subagent **kodaelus**, or ask to use Kodaelus.
- Modes: Main (0), Prompt (1), Bug Investigation (2), Suggest (3), Lite (4), Question (5), Prepare (6).
- No `AGENTS.md` or `.cursor/rules` from this project needed.

## Policy source

[`kodaelus/instructions.md`](kodaelus/instructions.md) → copied to `~/.cursor/kodaelus/instructions.md` on install.

## SDK

See [README.md](README.md#sdk-cli-any-project-directory).

## Tests

```bash
cd sdk && npm test
```
