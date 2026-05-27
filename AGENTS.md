# Kodaelus

Agent distribution — not required inside consumer projects. Use is governed by [LICENSE](LICENSE) (no redistribution or sale).

## One-time setup

```bash
npm run install:global
```

## In any other repo

- Pick subagent **kodaelus**, or ask to use Kodaelus.
- No `AGENTS.md` or `.cursor/rules` from this project needed.

## Policy source

[`kodaelus/instructions.md`](kodaelus/instructions.md) → copied to `~/.cursor/kodaelus/instructions.md` on install.

## SDK

See [README.md](README.md#sdk-cli-any-project-directory).

## Tests

```bash
cd sdk && npm test
```
