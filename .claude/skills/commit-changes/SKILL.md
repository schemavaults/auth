---
name: commit-changes
description: Commit changes in the SchemaVaults Auth monorepo using the repo's `<package>:<new-version> - <summary>` convention. Use whenever the user asks to commit, ship, or check in changes (including `/commit`). Bumps the affected package.json version(s) and writes the commit subject in the project-specific format instead of generic conventional-commit prefixes.
tools: Read, Edit, Bash, Glob
---

# commit-changes (SchemaVaults Auth)

This repo does **not** use generic conventional commits (`fix:`, `chore:`, `feat:`)
for changes that ship a package. The dominant pattern in `git log` is:

```
<package-name>:<new-version> - <summary of changes>
```

Multi-package changes are comma-separated:

```
auth-client-sdk:0.9.37, auth-react-provider:0.10.27 - <summary>
```

Whenever the user asks you to commit in this repo, follow the workflow below
**instead of** the default Claude Code commit flow. This skill takes precedence
over the global `/commit` instructions for subject formatting and version bumping;
all other safety rules from the global commit instructions still apply.

## Package map

The unscoped name on the left is what goes in the commit subject. The path on the
right is the `package.json` to read and edit when bumping a version.

| Subject name                            | package.json path                                              |
| --------------------------------------- | -------------------------------------------------------------- |
| `auth-server`                           | `auth-server/package.json`                                     |
| `app-definitions`                       | `packages/app-definitions/package.json`                        |
| `auth-common`                           | `packages/auth-common/package.json`                            |
| `jwt`                                   | `packages/jwt/package.json`                                    |
| `auth-server-sdk`                       | `packages/auth-server-sdk/package.json`                        |
| `auth-client-sdk`                       | `packages/auth-client-sdk/package.json`                        |
| `auth-react-provider`                   | `packages/auth-react-provider/package.json`                    |
| `auth-ui`                               | `packages/auth-ui/package.json`                                |
| `auth-resource-server-codegen-templates`| `packages/auth-resource-server-codegen-templates/package.json` |

Dependency order (base first, used to order multi-package commit subjects — taken
from `CLAUDE.md`'s package hierarchy):

1. `app-definitions`
2. `auth-common`
3. `jwt`
4. `auth-server-sdk`, `auth-client-sdk`
5. `auth-react-provider`
6. `auth-ui`
7. `auth-server`

`auth-resource-server-codegen-templates` is independent — list it last when mixed
with the others.

## Workflow

### 1. Inspect

In parallel:
- `git status` (no `-uall` flag)
- `git diff` (staged + unstaged)
- `git log --oneline -10` (to confirm the format and see latest versions in context)

### 2. Map changed files to packages

- A file under `auth-server/...` → belongs to `auth-server`.
- A file under `packages/<pkg>/...` → belongs to `<pkg>`.
- A file outside any package — root configs, `.github/`, `tests/`, top-level
  `CLAUDE.md`, top-level `README.md`, root `package.json`, `turbo.json`, lockfiles
  alone — is **repo-level**. See "Repo-level changes" below.

If the change touches both package code and repo-level files (e.g. you fixed
`packages/jwt/src/foo.ts` and also updated the root `bun.lock`), it still counts
as a package change — bump the package version and stage the lockfile alongside.

### 3. Bump versions

For each affected package:

1. `Read` its `package.json`.
2. Take the current `version` field.
3. Bump the **patch** segment by default (`0.22.29` → `0.22.30`, `0.7.5` → `0.7.6`).
4. Bump the **minor** segment only if the user explicitly says "minor", or the
   change is a clearly new feature/API addition.
5. **Never** bump the major segment without an explicit instruction from the user.
6. `Edit` the `package.json` to write the new version.

Do **not** run `bun version`, `npm version`, or any other version-bumping CLI —
edit the file directly so the change is visible in the diff.

### 4. Compose the commit subject

**Single package:**

```
auth-server:0.22.30 - fix owner_organization_id resolution in getApiServer
```

**Multiple packages** (comma-separated, in dependency order from the table above,
base packages first):

```
auth-client-sdk:0.9.37, auth-react-provider:0.10.27 - prevent PKCE session mismatch on login/register
```

Subject guidelines:
- Aim for ≤ 72 chars on the subject line where possible. If the summary won't fit,
  keep the subject short and put detail in the commit body.
- The summary should describe the **why** / user-visible effect, not list filenames.
- Lowercase imperative is fine (`fix`, `add`, `remove`) — match the style of recent
  commits in `git log`.
- Do **not** prefix with `fix:` / `feat:` / `chore:` when using this format. The
  package-version pattern replaces the conventional-commit type.

### 5. Repo-level changes (no package code touched)

If the diff only touches files outside any package (e.g. workflow edits in
`.github/`, top-level `README.md`, root `CLAUDE.md`, `turbo.json`), do **not**
invent a fake version bump. Fall back to conventional commits:

- `chore: ...` for build/tooling/lockfile-only changes
- `docs: ...` for documentation
- `ci: ...` for `.github/workflows/` changes

Recent examples from history: `chore: bump auth-server version to 0.22.30`,
`chore: update lockfile for auth-client-sdk and auth-react-provider version bumps`.

### 6. Stage and commit

- Stage files **by name** — never `git add -A` or `git add .`. Include the
  bumped `package.json`(s) and any lockfile changes alongside the source files.
- Never commit secrets (`.env`, `.env.local`, credentials). If you see them in
  the unstaged changes, warn the user instead.
- Use a HEREDOC for the commit message and end with the standard trailer required
  by the global commit instructions:

```bash
git commit -m "$(cat <<'EOF'
auth-server:0.22.30 - <summary>

<optional body explaining the why>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- After the commit, run `git status` to confirm a clean tree.

### 7. Guardrails (non-negotiable)

These are the same rules as the global commit instructions — restated here so they
apply to this skill too:

- **Never amend.** If a pre-commit hook fails, the commit did not happen — fix the
  underlying issue, re-stage, and create a **new** commit.
- **Never use `--no-verify`** or any flag that skips hooks/signing.
- **Never push** unless the user explicitly asks.
- **Never** run destructive git commands (`reset --hard`, `push --force`,
  `branch -D`, `clean -f`) without an explicit request.
- **Never** modify git config.

## Worked examples

**Single-package fix** (real commit `7b07d75`):

```
auth-server:0.22.29 - fix owner_organization_id resolution in getApiServer
```

Files staged: `auth-server/src/lib/auth-db/.../getApiServer.ts`,
`auth-server/package.json` (bumped 0.22.28 → 0.22.29).

**Coordinated multi-package bump** (real commit pattern):

```
auth-client-sdk:0.9.36, auth-react-provider:0.10.26, auth-server:0.22.27 - fix token exchange error handling
```

Files staged: source changes in all three packages plus each of their
`package.json` files. Subject lists packages in dependency order
(`auth-client-sdk` → `auth-react-provider` → `auth-server`).

**Repo-level chore** (real commit `dcda683`):

```
chore: bump auth-server version to 0.22.30
```

Used because the only file changed was `auth-server/package.json` itself with no
accompanying source change — i.e. a manual version-bump-only commit. (Normal
workflow bundles the bump with the source change instead, producing the
`auth-server:0.22.30 - ...` form.)
