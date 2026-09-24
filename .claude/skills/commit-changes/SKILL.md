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

The unscoped name on the left is what goes in the commit subject. The path is the
`package.json` to read and edit when bumping a version. "Ships as" says how the
version reaches anyone outside the monorepo (npm + GitHub Packages publishing is
the `on-push-main-branch-prod-cicd.yml` workflow).

| Subject name                             | package.json path                                                | Ships as |
| ---------------------------------------- | ---------------------------------------------------------------- | -------- |
| `app-definitions`                        | `packages/app-definitions/package.json`                          | published |
| `auth-common`                            | `packages/auth-common/package.json`                              | published |
| `jwt`                                    | `packages/jwt/package.json`                                      | published |
| `auth-client-sdk`                        | `packages/auth-client-sdk/package.json`                          | published |
| `auth-react-provider`                    | `packages/auth-react-provider/package.json`                      | published |
| `auth-ui`                                | `packages/auth-ui/package.json`                                  | published |
| `auth-resource-server-codegen-templates` | `packages/auth-resource-server-codegen-templates/package.json`   | not published on its own; copied into `auth-server-sdk`'s dist at build time |
| `auth-server-sdk`                        | `packages/auth-server-sdk/package.json`                          | published (includes the `auth-server-sdk codegen` CLI) |
| `trpc-backend-init`                      | `packages/trpc-backend-init/package.json`                        | published |
| `openapi-operations`                     | `packages/openapi-operations/package.json`                       | published |
| `openapi-docs-ui`                        | `packages/openapi-docs-ui/package.json`                          | published |
| `auth-server`                            | `auth-server/package.json`                                       | deployed app (private) |
| `cypress-e2e-auth-tests-helper-commands` | `tests/cypress-e2e-auth-tests-helper-commands/package.json`      | test workspace |
| `e2e-auth-tests`                         | `tests/e2e-auth-tests/package.json`                              | test workspace |
| `example-nextjs-resource-server`         | `tests/example-nextjs-resource-server/package.json`              | test workspace |

The rows are in **dependency order** (base first). Use this order for the
packages in a multi-package commit subject; test workspaces always come last.

## Direct dependencies (source of truth)

Workspace-to-workspace edges, taken from each `package.json` (`dependencies`,
`peerDependencies`, `devDependencies`, all `workspace:*`) plus the one build-time
edge that no `package.json` records. External `@schemavaults/*` packages
(`ui`, `theme`, `dbh`, `send-email`) come from npm and are not part of the
cascade.

| Package                                  | Depends on (workspace packages)                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `app-definitions`                        | (none)                                                                                          |
| `auth-common`                            | `app-definitions`                                                                               |
| `jwt`                                    | `app-definitions`, `auth-common`                                                                |
| `auth-client-sdk`                        | `app-definitions`, `auth-common`                                                                |
| `auth-react-provider`                    | `app-definitions`, `auth-common`, `auth-client-sdk`                                             |
| `auth-ui`                                | `app-definitions`, `auth-common`, `auth-react-provider` (all peerDeps)                          |
| `auth-resource-server-codegen-templates` | `auth-react-provider` (the templates import it; devDep). Its devDeps on `jwt`, `auth-common` and `auth-client-sdk` are type-check only; the templates never import them |
| `auth-server-sdk`                        | `app-definitions`, `auth-common`, `jwt`; **`auth-resource-server-codegen-templates` (build-time copy, see note)** |
| `trpc-backend-init`                      | `app-definitions`, `auth-server-sdk` (both peerDeps)                                            |
| `openapi-operations`                     | `auth-common`                                                                                   |
| `openapi-docs-ui`                        | (none; peerDep on the external `@schemavaults/ui` only)                                          |
| `auth-server`                            | `app-definitions`, `auth-common`, `jwt`, `auth-client-sdk`, `auth-react-provider`, `auth-ui`, `auth-server-sdk`, `openapi-operations`, `openapi-docs-ui` |
| `cypress-e2e-auth-tests-helper-commands` | `app-definitions`, `auth-common`, `jwt`                                                         |
| `e2e-auth-tests`                         | `app-definitions`, `auth-common`, `jwt`, `auth-client-sdk`, `cypress-e2e-auth-tests-helper-commands` |
| `example-nextjs-resource-server`         | `auth-common`, `auth-client-sdk`, `auth-react-provider`, `auth-server-sdk`, `openapi-operations`, `openapi-docs-ui` |

Nothing depends on `auth-ui` except `auth-server`, and nothing in the monorepo
depends on `trpc-backend-init` or `auth-server`.

## Downstream dependents (REQUIRED cascade bumps)

**Whenever you bump a package, you MUST also bump every package listed in its
"downstream dependents" column**, even if the downstream package has no source
changes of its own. Published npm / GitHub Packages consumers need a new
downstream version to pull in the updated base package; skipping this leaves
`auth-react-provider@0.10.31` on a `workspace:*` resolution of
`auth-client-sdk@0.9.42` that never appears in published artifacts.

Each row is the **complete transitive closure** of the direct-dependency table
above, so one lookup per directly-changed package is enough. Do not chase
dependents of dependents.

| Bumped package                            | Downstream dependents that MUST also be bumped                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `app-definitions`                         | `auth-common`, `jwt`, `auth-client-sdk`, `auth-react-provider`, `auth-ui`, `auth-resource-server-codegen-templates`, `auth-server-sdk`, `trpc-backend-init`, `openapi-operations`, `auth-server` |
| `auth-common`                             | `jwt`, `auth-client-sdk`, `auth-react-provider`, `auth-ui`, `auth-resource-server-codegen-templates`, `auth-server-sdk`, `trpc-backend-init`, `openapi-operations`, `auth-server` |
| `jwt`                                     | `auth-server-sdk`, `trpc-backend-init`, `auth-server`                                |
| `auth-client-sdk`                         | `auth-react-provider`, `auth-ui`, `auth-resource-server-codegen-templates`, `auth-server-sdk`, `trpc-backend-init`, `auth-server` |
| `auth-react-provider`                     | `auth-ui`, `auth-resource-server-codegen-templates`, `auth-server-sdk`, `trpc-backend-init`, `auth-server` |
| `auth-ui`                                 | `auth-server`                                                                        |
| `auth-resource-server-codegen-templates`  | `auth-server-sdk`, `trpc-backend-init`, `auth-server`                                |
| `auth-server-sdk`                         | **`trpc-backend-init` (REQUIRED — see note below)**, `auth-server`                   |
| `trpc-backend-init`                       | (none — leaf)                                                                        |
| `openapi-operations`                      | `auth-server`                                                                        |
| `openapi-docs-ui`                         | `auth-server`                                                                        |
| `auth-server`                             | (none — leaf)                                                                        |
| test workspaces                           | (none — never cascade; see note below)                                               |

**Note on `auth-resource-server-codegen-templates` → `auth-server-sdk`:** the
`auth-server-sdk` build script (`copy-codegen-templates.sh`) copies the codegen
templates' source into `auth-server-sdk/dist/codegen-templates/` and bundles them
into the published CLI. There is no `package.json` edge between the two (the
coupling is build-time only), so `grep` won't reveal it. Any change to
`auth-resource-server-codegen-templates` (including updating one of its own
dependencies, like `@schemavaults/ui`) requires republishing `auth-server-sdk` so
consumers of the CLI pick up the new template content. The edge only runs this
way: the templates do not depend on `auth-server-sdk`, so an `auth-server-sdk`
change does **not** bump the templates.

**Note on `auth-react-provider` → `auth-resource-server-codegen-templates`:** the
generated pages import hooks from `@schemavaults/auth-react-provider` (and
components from the external `@schemavaults/ui`), so an `auth-react-provider`
bump, and anything that cascades into it (`app-definitions`, `auth-common`,
`auth-client-sdk`), must flow through the templates and on to `auth-server-sdk`.
The templates do **not** import `@schemavaults/auth-ui`, so an `auth-ui`-only
change bumps just `auth-ui` and `auth-server`. If a template ever starts importing
`auth-ui` (or another workspace package), add the edge to both tables.

**Older commits bumped extra packages:** before this table was corrected, `auth-ui`
changes were cascaded through `auth-resource-server-codegen-templates`,
`auth-server-sdk` and `trpc-backend-init` (e.g. `2206915`), and `auth-server-sdk`
changes bumped the templates (e.g. `0e0a6b7`). Neither edge exists; follow the
table, not those subjects.

**Note on `auth-server-sdk` / `app-definitions` → `trpc-backend-init` (DO NOT SKIP):**
`trpc-backend-init` peer-depends on both `@schemavaults/auth-server-sdk` and
`@schemavaults/app-definitions` (workspace:* in the monorepo). **Any bump to
either of those base packages, including transitive cascade bumps triggered
by an `auth-common`, `jwt`, `auth-client-sdk`, `auth-react-provider`, or
`auth-resource-server-codegen-templates` change that flows into
`auth-server-sdk`, REQUIRES bumping `trpc-backend-init` in the same commit.**
Without that bump, the peerDependency range advertised to npm consumers still
points at the previous `auth-server-sdk` version and the new
`auth-server-sdk` never reaches `trpc-backend-init` consumers.
`trpc-backend-init` itself is a leaf (nothing else in the monorepo depends
on it), so the cascade terminates there.

In practice: **if `auth-server-sdk` appears in your commit subject,
`trpc-backend-init` MUST appear in it too.** Sanity-check this before
committing.

**Note on `openapi-operations` / `openapi-docs-ui` → `auth-server`:** the auth
server serves every `/api/**` route through `@schemavaults/openapi-operations` and
renders `/docs` with `@schemavaults/openapi-docs-ui`, so a change to either
package bumps `auth-server` too (e.g. `21bfe41`). Neither package depends on
`auth-server-sdk`, so they never pull in `trpc-backend-init`.

**Note on test workspaces:** `cypress-e2e-auth-tests-helper-commands`,
`e2e-auth-tests` and `example-nextjs-resource-server` are never published and
consume every workspace package from source, so they are **not** cascade-bumped
when a package they depend on changes. Bump one only when files inside it change
(e.g. a new Cypress spec bumps `e2e-auth-tests`).

When the tables and the code might have drifted apart (a new package, a new
import), re-derive the edges before trusting them:

```bash
# package.json edges (dependencies, peerDependencies and devDependencies)
grep -l '"@schemavaults/<pkg>"' packages/*/package.json auth-server/package.json tests/*/package.json
# what a package's source actually imports
grep -rhoE "from ['\"]@schemavaults/[a-z0-9-]+" packages/<pkg>/src | sort | uniq -c
```

Neither command shows the build-time templates → `auth-server-sdk` edge; keep the
note above in mind. See the cascade worked example at the end of this file
(commit `66b8894`) for a real commit that follows the table.

## Workflow

### 1. Inspect

In parallel:
- `git status` (no `-uall` flag)
- `git diff` (staged + unstaged)
- `git log --oneline -10` (to confirm the format and see latest versions in context)

### 2. Map changed files to packages

- A file under `auth-server/...` → belongs to `auth-server`.
- A file under `packages/<pkg>/...` → belongs to `<pkg>`.
- A file under `tests/<workspace>/...` → belongs to that test workspace
  (`e2e-auth-tests`, `example-nextjs-resource-server`,
  `cypress-e2e-auth-tests-helper-commands`). Bump it like any other package, but
  it never cascades (see the note on test workspaces).
- A file outside any workspace — root configs, `.github/`, `.claude/`, top-level
  `CLAUDE.md`, top-level `README.md`, root `package.json`, `turbo.json`, lockfiles
  alone — is **repo-level**. See "Repo-level changes" below.

If the change touches both package code and repo-level files (e.g. you fixed
`packages/jwt/src/foo.ts` and also updated the root `bun.lock`), it still counts
as a package change — bump the package version and stage the lockfile alongside.

### 3. Bump versions

**Step 3a — Directly changed packages.** For each package whose source was
modified, `Read` its `package.json` and bump the version:

1. Bump the **patch** segment by default (`0.22.29` → `0.22.30`, `0.7.5` → `0.7.6`).
2. Bump the **minor** segment only if the user explicitly says "minor", or the
   change is a clearly new feature/API addition.
3. **Never** bump the major segment without an explicit instruction from the user.
4. `Edit` the `package.json` to write the new version.

Do **not** run `bun version`, `npm version`, or any other version-bumping CLI —
edit the file directly so the change is visible in the diff.

**Step 3b — Cascade to downstream dependents (REQUIRED, do not skip).** For
every package you bumped in Step 3a, look it up in the
"Downstream dependents" table above and bump every package listed, even if its
source code did not change. Add those `package.json` edits to the same commit.
They belong in the same commit subject alongside the directly-changed ones.

Sanity check before committing: every package named in the commit subject must
have a corresponding `package.json` modification in `git diff --cached`. If you
bumped `auth-client-sdk`, the subject MUST also name
`auth-react-provider`, `auth-ui`, `auth-resource-server-codegen-templates`,
`auth-server-sdk`, `trpc-backend-init`, and `auth-server` — and those six
`package.json` files must be staged.

**Specific recurring miss: `trpc-backend-init`.** If `auth-server-sdk` (or
`app-definitions`) is in the subject, `trpc-backend-init` must be too. This is
easy to forget because `trpc-backend-init` has no `dependencies` edge to
`auth-server-sdk` in its `package.json` — the relationship is via
`peerDependencies`, which `grep` over `dependencies` will not catch. Always
re-check the downstream-dependents table for `auth-server-sdk` before
finalizing the subject.

### 4. Compose the commit subject

**Single package:**

```
auth-server:0.22.30 - fix owner_organization_id resolution in getApiServer
```

**Multiple packages** (comma-separated, in the dependency order of the package map,
base packages first, test workspaces last):

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

<Co-Authored-By trailer (and any other attribution lines) from the global commit instructions>
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

**Cascade bump — source change in base packages, dependents bumped with no
source change of their own** (real commit `66b8894`):

```
app-definitions:0.13.3, auth-common:0.27.2, jwt:0.13.11, auth-client-sdk:0.19.1, auth-react-provider:0.16.36, auth-ui:0.15.6, auth-resource-server-codegen-templates:0.0.149, auth-server-sdk:0.29.1, trpc-backend-init:0.9.64, openapi-operations:0.1.8, auth-server:0.43.5 - accept any port for registered loopback redirect URIs
```

Source changed only in `app-definitions`, `auth-common` and `auth-server`; the
other eight packages got a `package.json`-only version bump so the new base
packages reach published consumers. That set is exactly the `app-definitions`
row of the downstream-dependents table, `trpc-backend-init` and
`openapi-operations` included. The subject names every package that got a
version bump, not just the ones whose code changed.

**Leaf packages with a test change** (real commit `21bfe41`):

```
openapi-operations:0.3.1, openapi-docs-ui:0.1.7, auth-server:0.45.3, e2e-auth-tests:0.11.29 - tidy API docs spacing; white-label-aware docs copy
```

`openapi-operations` and `openapi-docs-ui` cascade only into `auth-server`;
`e2e-auth-tests` is listed because a spec under `tests/e2e-auth-tests/` changed,
and it goes last.

**Repo-level chore** (real commit `dcda683`):

```
chore: bump auth-server version to 0.22.30
```

Used because the only file changed was `auth-server/package.json` itself with no
accompanying source change — i.e. a manual version-bump-only commit. (Normal
workflow bundles the bump with the source change instead, producing the
`auth-server:0.22.30 - ...` form.)
