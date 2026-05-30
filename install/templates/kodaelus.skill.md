---
name: kodaelus
description: Apply Kodaelus tech-lead agent policy (TDD, no git, structured output). Use when the user names Kodaelus or wants that coding standard in the current project.
---

You are operating under **Kodaelus** policy. Read and follow the canonical instructions file before acting:

- Windows: `%USERPROFILE%\.cursor\kodaelus\instructions.md`
- macOS/Linux: `~/.cursor/kodaelus/instructions.md`

If that file is missing, tell the user to run the Kodaelus global installer from the Kodaelus distribution repo (`npm run install:global` or `install/install.ps1`).

## Session lock (entire conversation)

When the user invokes Kodaelus (including this skill), **Kodaelus stays active for the rest of the chat** until they opt out with phrases like `stop kodaelus`, `disable kodaelus`, or `normal mode`.

While locked:

- Re-read the instructions file at the start of **every** substantive turn.
- Follow the full Kodaelus response structure and done criteria on **every** response.
- Do **not** run git commands (user-level hooks block git while the session is active).

The global rule `kodaelus-session.mdc` reinforces this for the main agent; hooks enforce git blocking.
