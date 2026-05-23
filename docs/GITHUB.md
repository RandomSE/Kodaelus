# Publishing to a private GitHub repository

This folder is its own git repository, separate from any parent directory that might already be under version control.

## If Git shows files from your whole PC

You likely have **two** repositories:

| Repository | Path | Should you commit here? |
|------------|------|-------------------------|
| Kodaelus (correct) | `...\Desktop\Kodaelus\.git` | **Yes** |
| Accidental home repo (wrong) | `C:\Users\the11\.git` | **No** |

**In Cursor:** open the folder `Kodaelus` as the workspace root (File → Open Folder), not `Desktop` or your user profile. This repo’s `.vscode/settings.json` disables parent-folder git detection.

**Before every commit**, confirm the repo root:

```powershell
cd "c:\Users\the11\OneDrive\Desktop\Kodaelus"
git rev-parse --show-toplevel
# Must print: ...\Kodaelus
```

If it prints `C:\Users\the11`, you are in the wrong repository — `cd` into Kodaelus first.

A `.gitignore` at `C:\Users\the11` now ignores `*` so the accidental home repo should not offer your entire profile for staging. To remove that repo completely (optional): `Remove-Item -Recurse -Force "$env:USERPROFILE\.git"`

## Prerequisites

- [Git](https://git-scm.com/)
- [GitHub CLI](https://cli.github.com/) (`gh`) logged in: `gh auth login`
- Node 20+ (for local verification)

## First-time setup

From the repository root:

```powershell
cd "c:\Users\the11\OneDrive\Desktop\Kodaelus"

# Optional: verify tests before pushing
cd sdk
npm ci
npm test
npm run build
cd ..

git add -A
git status   # confirm no .env or node_modules/ are staged
git commit -m "Initial commit: Kodaelus agent distribution"
```

Create the **private** remote and push (replace `YOUR_USER` if needed):

```powershell
gh repo create Kodaelus --private --source=. --remote=origin --push
```

If the repo name is taken or you use an organization:

```powershell
gh repo create YOUR_USER/Kodaelus --private --source=. --remote=origin --push
```

## Push updates later

```powershell
git add -A
git commit -m "Describe your change"
git push origin main
```

If your default branch is `master`, use that name instead of `main`.

## Security checklist

- Never commit `.env` or real `CURSOR_API_KEY` values (only `.env.example` is tracked).
- Keep the repository **private** in GitHub: **Settings → General → Danger Zone** if you need to confirm visibility.
- Collaborators need explicit GitHub access; global Kodaelus install (`npm run install:global`) is per-machine, not per-clone.

## Without GitHub CLI

1. Create an empty **private** repo on github.com (no README license or .gitignore).
2. Then:

```powershell
git remote add origin https://github.com/YOUR_USER/Kodaelus.git
git branch -M main
git push -u origin main
```
