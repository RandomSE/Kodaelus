# Kodaelus

Kodaelus is a Cursor session policy that replaces ad-hoc prompt engineering with locked modes, action boundaries, and delivery formats. Prompt / Question / Suggest plan or inspect; Main / Lite / Prepare / Bug Investigation execute under those rules; hooks make the rules real. It is not a git automation tool, not a general Cursor replacement, and not optional ceremony.

**Install once**, use in **every project** -- no need to copy this repo into each workspace. Works with Cursor IDE and the [Cursor SDK](https://cursor.com/docs/sdk/typescript).

**License:** You may install and use Kodaelus for your own development. You may **not** redistribute, resell, or sublicense it. See [LICENSE](LICENSE). Kodaelus is **not** affiliated with Cursor; see [TRADEMARKS.md](TRADEMARKS.md).

## Install globally (one time)

From this folder:

```bash
npm run install:global
```

This writes:

| Location | Purpose |
|----------|---------|
| `~/.cursor/kodaelus/core.md` | Always-on policy (identity, boundaries, confidence, mode routing) |
| `~/.cursor/kodaelus/modes/` | One file per mode; a turn reads the active mode only |
| `~/.cursor/kodaelus/tasks/` | Task modules (deletion, refactor, review, TDD, tests, follow-ups) |
| `~/.cursor/kodaelus/instructions.md` | Short redirect stub |
| `~/.cursor/agents/kodaelus.md` | Main subagent |
| `~/.cursor/agents/kodaelus-bug.md` | Bug Investigation subagent (dossier, not the fix) |
| `~/.cursor/agents/kodaelus-prompt.md` | Planner / Prompt subagent (read-only paste-ready spec) |
| `~/.cursor/skills/kodaelus/SKILL.md` | Router skill: read core, then one mode file |
| `~/.cursor/skills/kodaelus-file-deletion/` | Deletion protocol skill |
| `~/.cursor/skills/kodaelus-refactor/` | Refactor workflow skill |
| `~/.cursor/skills/kodaelus-architecture-review/` | Architecture review skill |
| `~/.cursor/rules/kodaelus-session.mdc` | Session lock rule (keeps Kodaelus active in chat) |
| `~/.cursor/hooks.json` + `~/.cursor/hooks/` | Git block, delete guards, scope creep, session tracking |

**Windows (PowerShell alternative):** `.\install\install.ps1`

**Uninstall:** `npm run uninstall:global`

## Use in any project

1. Open any repo in Cursor (no Kodaelus files required in that repo).
2. Ask the main agent to use Kodaelus.

Say **stop kodaelus** to end session lock. Git commands are hook-blocked while Kodaelus is active in a chat.

### Project-specific guidelines

Each workspace can keep supplemental Kodaelus preferences at **`.kodaelus/instructions.md`** (local, gitignored by default). Kodaelus reads global policy first, then project guidelines; project rules override global on non-safety conflicts (git, deletion, scope creep, and confidence format stay global).

On first substantive technical work, Kodaelus bootstraps the file from `install/templates/project-instructions.template.md` and ensures `.kodaelus/` is in `.gitignore`. Repeated user preferences (~3×) append to `## Preferences` with tracking in `.kodaelus/preference-log.json`.

SDK helpers: `loadProjectGuidelines()`, `ensureProjectGuidelines()`, `loadInstructionsWithProjectGuidelines()`, `recordPreferenceCandidate()`, `projectGuidelinesPath()`.

Example `.kodaelus/instructions.md` (created automatically on first technical task):

```markdown
# Project guidelines (Kodaelus)

Supplemental guidelines for this repository. Read together with global Kodaelus policy: `~/.cursor/kodaelus/core.md`. `instructions.md` in that directory is a redirect stub.

## Preferences

2026-07-08 | source: repeated request | Always run vitest with --coverage for this repo

## Conventions

- API routes live under `src/routes/`; match existing error envelope `{ error, code }`.
- Prefer `pnpm` over npm in scripts and docs.

## Notes

- Staging API base URL is in `.env.example` as `STAGING_API_URL`.
```

### When to say what

Pick the mode that matches your intent, then say the activation phrase.

- **Paste-ready spec** (the prompt-engineering saver) -> **Planner / Prompt (1)** (`use kodaelus prompt`)
- **Do the work** -> **Main (0)** (`use kodaelus`)
- **Hard bug, do not patch yet** -> **Bug Investigation (2)** (`use kodaelus bug`)
- **Tiny edit** -> **Mode Lite (4)** (`use kodaelus lite`)
- **About to commit** -> **Prepare (6)** (`use kodaelus prepare`)
- **Commit, push, and open a PR** -> **Ship (7)** (`use kodaelus ship`)
- **What's wrong / what to build** -> **Suggest (3)** (`use kodaelus suggest`)
- **Just explain** -> **Question (5)** (`use kodaelus question`)

### Modes

`use kodaelus bug` investigates, `bugfix` / `use kodaelus bugfix` implements in Main.

| Mode | Say | What you get |
|------|-----|--------------|
| **Main (0)** | `use kodaelus`, `use kodaelus main`, `use kodaelus bugfix` | Full TDD implementation |
| **Planner / Prompt (1)** | `use kodaelus 1`, `use kodaelus prompt`, `kodaelus planner` | Read-only paste-ready spec; the prompt-engineering saver |
| **Bug Investigation (2)** | `use kodaelus 2`, `use kodaelus bug` | Visibility, repro, dossier -- not the fix |
| **Suggest (3)** | `use kodaelus suggest issues` / `suggest features` | Proactive audit or roadmap scan (read-only) |
| **Mode Lite (4)** | `use kodaelus lite`, `use kodaelus fast` | Fast small changes; targeted tests only |
| **Question (5)** | `use kodaelus q`, `use kodaelus question` | Deep research Q&A (read-only) |
| **Prepare (6)** | `use kodaelus prepare`, `use kodaelus 6`, `use kodaelus prep` | Pre-commit gate: diff vs HEAD, full suite (max 3 fix-rerun cycles), propose commit message (never commits) |
| **Ship (7)** | `use kodaelus ship`, `use kodaelus 7`, `kodaelus ship mode` | Prepare gate, then commit, push, open or reuse a PR, and report CI. No force-push. |
| **Upgrade** | `run it`, `execute`, `use kodaelus main` | Switch to Main; consume dossier/prompt |

Ship reports CI. When checks fail, it may repair up to 3 product cycles (pull `gh run view` or `gh pr checks`, fix, re-test, commit, push, re-poll), then it stops until `ship ci continue`. Pending checks are polled at most 4 times (backoff 15s, then 30s, then 60s). Ship is not an open-ended babysitter. It never merges, force-pushes, or pushes `main` or `master`.

**Mode Lite (4)** is an activation phrase for fast edits. **Delivery Tier Lite** is a shorter section set within a mode -- they are different concepts.

`bugfix` / `bug fix` → **Main**, not Bug Investigation. After investigation, say **`use kodaelus bugfix`** to fix using the dossier at `.kodaelus/bugs/`.

Bare **`use kodaelus suggest`** asks you to pick Issues vs Features before scanning.

### Hook enforcement (while Kodaelus is active)

| Guard | Behavior |
|-------|----------|
| **Git** | Read-only only (`status`, `diff`, `log`) |
| **Read-only modes** | `prompt` / `suggest` / `question` block Write, StrReplace, Delete, ApplyPatch |
| **Read-only shell** | `block-readonly-shell` denies workspace mutators (`npm install`, `mkdir`, `npm run build`, file redirects `>` / `>>`, etc.) |
| **Bug Investigation** | Deletes outside `.kodaelus/` blocked; `.kodaelus/` diagnostic artifacts allowed |
| **Delete tool / shell rm** | Entry points hard-blocked; other deletes require automatic backup to `.kodaelus/trash/` + manifest |
| **Scope creep** | Blocks edits past `max(10, 2× Plan file estimate)` until you reply **`scope approved`** |
| **Confidence format** | Flags bare `Confidence: NN%` without adjacent `Evidence:` on substantive deliveries |
| **AskQuestion guard** | In Main/Lite/Bug/Prepare, denies `AskQuestion`/`AskUserQuestion` **when Cursor fires `preToolUse` for those tools**; `stop` follow-up if open clarification prose is detected. Policy + Prompt ambiguity pre-emption remain primary |
| **Project guidelines** | Bootstrapped on activation; `restore <file>` / `undo last delete` phrases restore from manifest |
| **Preferences** | ~3× repeated requests append to `.kodaelus/instructions.md` via hook |

**AskQuestion platform gap (2026):** Cursor IDE/CLI often omit `AskQuestion` / `AskUserQuestion` from the `preToolUse` / `postToolUse` pipeline (confirmed in Cursor forum reports). Kodaelus therefore:

1. Relies on policy (**Cursor clarifying questions** resolution priority) and Prompt-mode **ambiguity pre-emption** to avoid mid-run pauses.
2. Ships `ask-question-guard.mjs` as defense-in-depth so deny/heuristic path works when Cursor wires the tool into hooks.
3. Keeps the ask-question-guard `preToolUse` entry **fail-open** (`failClosed` omitted / not true) until Cursor confirms AskQuestion hook events. When confirmed, set `ASK_QUESTION_HOOK_FAIL_CLOSED_READY` to `true` in `install/hooks/lib/ask-question-guard.mjs` and add `"failClosed": true` on that hooks.json entry, then re-run `npm run install:global`.

**Mode sticky paste tip:** Put the activation phrase on the **first line** (`use kodaelus main`). Mode detection prefers the leading preamble so body text that mentions `use kodaelus 1` / `kodaelus prompt mode` cannot pin the session in Prompt mode.

### SDK vs IDE

| Capability | Cursor IDE (hooks) | SDK (`runKodaelus`) |
|------------|-------------------|---------------------|
| Policy text + project guidelines | Yes | Yes |
| Mode detection from task string | Yes | Yes (prompt header only) |
| Git read-only enforcement | **Hook-enforced** | Not enforced — use IDE |
| Delete backup / manifest | **Hook-enforced** | Not enforced — use IDE or `npm run restore` |
| Scope creep guard | **Hook-enforced** | Not enforced |
| Confidence format flag | **Hook-enforced** | Not enforced |
| Read-only mode tool block | **Hook-enforced** | Policy instruction only |
| Read-only shell mutator block | **Hook-enforced** (`block-readonly-shell`) | Soft warn via `runSdkPreflight()` |
| Preflight / limitation notice | Hooks + UI | `runSdkPreflight()` stderr warnings |

The SDK is for **programmatic runs with policy preloaded**, not a full replacement for IDE hooks. Use Cursor with Kodaelus active when you need hard safety guards.

### Cursor cloud and SDK (no IDE hooks)

Cursor cloud agents and SDK `runKodaelus` do not load `~/.cursor/hooks.json`, so dash, confidence, structure, and git guards never fire in the IDE hook host. The **Hook-absent contract** in `kodaelus/core.md` (`## Hook-absent contract (cloud / SDK)`) still applies: Plan before the first mutating write (`emit Plan first`), TDD write order including a failing test run before impl, honor-system dash / confidence / AskQuestion / deletion rules. Progress may be one short sentence. The Plan-first message is exempt from the length >= 500 Full-order rule. Only the final report of the turn uses Main Full section order. SDK `runKodaelus` reuses `install/hooks/lib/delivery-structure-guard.mjs` on the final result text: Main, Bug, Prepare, and Ship missing sections are a hard check (stderr warning and exit code 2); Mode Lite is a soft check (Tests + Delivery Self-Check, no Follow-Up Queue). Cloud agents that are not the SDK runner still self-enforce structure. Cloud and SDK runners may commit when the platform must ship. In the IDE, Ship (`use kodaelus ship`) is the mode that may commit, push, and open a PR. Other IDE modes stay git-read-only via hooks. Re-run `npm run install:global` after Ship hooks land so the allowlist is the installed copy.

**Troubleshooting:** If a delete is blocked, check Hooks output for backup/manifest errors. Restore via `restore <file>` or SDK `npm run restore`. Re-run **`npm run install:global`** after this policy split (core, modes, tasks, manifest, and the new subagents) and after any hook change. Suggest persistence is the installed copy of `scope-creep-guard`, `path-allowlist`, and `block-readonly-shell`: Write/StrReplace under `.kodaelus/suggestions/**` is allowed (including Cursor `file_path` and OneDrive `\\?\` paths that still contain that tree), and product paths stay denied with the suggestions allowlist message. A generic "suggest mode is read-only" deny on a suggestions Write means the installed hook is stale or path extraction failed; re-run `npm run install:global` so `~/.cursor/hooks` matches this repo, then retry. Product-path denies should name `.kodaelus/suggestions/`, not claim Suggest can never Write. Smoke-check: activate **`use kodaelus 1`**, try `mkdir tmp-kodaelus-smoke` in the agent. It should be denied. Then **`stop kodaelus`**. If a long `use kodaelus main` paste stays read-only, confirm the activation line is first, then re-run install:global.

### Enable AskQuestion fail-closed (only after Cursor confirms)

`ASK_QUESTION_HOOK_FAIL_CLOSED_READY` stays false. Current Cursor often skips `preToolUse` for AskQuestion / AskUserQuestion, so a stop heuristic is the gate that actually runs. Do not claim full fail-closed. Ship stays in the deny set either way.

Checked procedure. Flip the flag only after step 2 is true:

1. Start a mutating Kodaelus session (`use kodaelus main`).
2. Invoke AskQuestion. In Hooks output, confirm `ask-question-guard` ran on `preToolUse` and denied the call.
3. Only after that deny is visible, set `ASK_QUESTION_HOOK_FAIL_CLOSED_READY` to true in `install/hooks/lib/ask-question-guard.mjs`.
4. Add `"failClosed": true` on the preToolUse `ask-question-guard.mjs` entry in `install/templates/hooks.json` (matcher `AskQuestion|AskUserQuestion`).
5. Run `npm test`, then `npm run install:global`.
6. Invoke AskQuestion again and confirm the tool is denied.

Until step 2 shows a preToolUse deny, leave the flag false and leave `failClosed` off that hook entry.

### Architecture Improvement Review

Ask for improvements, alternatives, or tradeoffs **without** asking for code yet (e.g. “architecture review,” “what would you do differently”). Kodaelus returns a dedicated **Architecture Improvement Review** with rated decision points (1–5), options, recommendations, and confidence scores tied to repo evidence.

### Follow-Up Queue

After substantive deliveries (features, fixes, refactors, bug investigations), Kodaelus ends with a structured **Follow-Up Queue** (`FU-1`, `FU-2`, …) as the **final section** — related improvements with scope, effort, risk, and confidence.

To execute queued work, say **implement suggestions**, **implement follow-ups**, **implement FU-2**, or **implement all follow-ups**. Kodaelus expands its plan and runs the full TDD loop for the selected items.

## Layout

| Path | Purpose |
|------|---------|
| `kodaelus/core.md` | Always-on policy copied on install |
| `kodaelus/policy-manifest.json` | Mode task packs, tier omissions, and self-check fragments |
| `kodaelus/modes/` | Per-mode response structure |
| `kodaelus/tasks/` | Task modules loaded only when the active mode says they match |
| `kodaelus/instructions.md` | Redirect stub (not the full policy) |
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
  loadProjectGuidelines,
  ensureProjectGuidelines,
  loadInstructionsWithProjectGuidelines,
  recordPreferenceCandidate,
  extractPreferenceIntent,
  normalizePreferenceKey,
  runSdkPreflight,
  projectGuidelinesPath,
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

The name **Kodaelus** combines Koda and Daedalus. That etymology is a footnote, not the product.