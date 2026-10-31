---
name: small-modules
description: Keeping source modules small — aim for under 200–300 lines — when writing new code or refactoring in this monorepo. Covers when to split a file, how to split it the way the repo already does (one exported function per kebab-case file in `auth-db` folders, a private `shared.ts`, a `types.ts`, an `index.ts` barrel so no importer changes), what not to split, and how to check that a split changed nothing. Use when creating modules, adding a sizeable chunk of code to an existing file, splitting a large file, or reviewing a change that grows a file past ~300 lines.
---

# Small modules

Aim to keep a module under ~200 lines and treat ~300 as the point to split.
This is a guideline, not a lint rule: a cohesive 320-line file is better
than three fragments that only make sense read together.

## Writing new code

- Give new code its own modules instead of appending it to an existing file:
  a new query, handler, report section or component gets its own file.
- When the file you would add to is already over ~300 lines, put the
  addition in a new sibling module and import it, rather than growing the
  file further. Don't restructure the rest of that file unless asked.
- Tests sit next to the module they cover (`foo.ts` + `foo.test.ts`).

## Split the way the repo already does

- **`auth-server/src/lib/auth-db/<resource>/`**: one exported query per
  kebab-case file named after it (`get-organization-mfa-requirement.ts`
  exports `getOrganizationMfaRequirement`), table types in
  `<resource>-table.ts`. `organizations/` and
  `organization-mfa-requirements/` are the reference folders.
- **Private helpers** the folder's modules share (row converters, argument
  assertions, the `Db = Kysely | Transaction` type) go in `shared.ts`, which
  the barrel does not re-export.
- **Domain types** used by several modules go in `types.ts`; a type used by
  one function (its params / result) stays in that function's module.
- **`index.ts` is the barrel**: explicit named re-exports grouped by concern.
  Importers keep importing the folder (`@/lib/auth-db/<resource>`), so a
  split changes no import outside it.
- **API routes**: `operation.ts` + `route.ts` per folder, large handlers in
  sibling files (see CLAUDE.md); builders shared by several routes go in
  `auth-server/src/lib/api/` (e.g. `scheduled-job-operations.ts`).
- **React components**: one component per file under
  `src/components/<Feature>/` with an `index.ts`; subcomponents and hooks
  move to their own files once the component grows.
- **Client-safe vs server-only**: keep modules that `import "server-only"`
  apart from code client components import (e.g.
  `lib/organization-mfa-requirements/policy.ts` and `types.ts` are
  client-safe; the DB modules are not). A split is a good moment to keep
  that boundary clean.

## Don't

- Split mechanically by line count: keep a function with its own types,
  and keep tightly coupled helpers together.
- Create one-line wrapper modules or chains of re-exports.
- Refactor unrelated large files on the side. About 100 files in the
  monorepo are over 300 lines today (e.g.
  `send-daily-report/buildReportHtml.ts`, `auth/register/handle_register.ts`,
  `auth-db/apps/app-registry/app-registry.ts`). Split one when the task is
  about it, the user asks, or you would otherwise grow it substantially, and
  mention the remaining large files in your summary instead.
- Change behaviour in a split. Move code verbatim so only imports change;
  fixes and renames go in a separate commit.

## Checking a split

1. Every name the old file exported is still exported from the same import
   path (diff the old file's `export` names against the barrel).
2. Every line of the old file landed in exactly one new module (no helper
   or comment dropped).
3. `bun run typecheck --filter <package>` (missing imports),
   `bun run lint --filter <package>` (unused imports), and the package's
   tests.
4. Commit per the `commit-changes` skill; a pure move is a patch bump.
