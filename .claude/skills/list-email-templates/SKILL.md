---
name: list-email-templates
description: Discover available email templates from the SchemaVaults mail-server `GET /api/templates` endpoint, via either the `listEmailTemplates()` helper or the `schemavaults-send-email list-templates` CLI from `@schemavaults/send-email`. Use before sending a template-based email to find the correct `template_id` and understand the expected `template_props` shape. For one-off shell discovery, prefer the CLI (`bunx schemavaults-send-email list-templates`).
---

# List Email Templates

This skill teaches Claude how to discover which email templates are registered in the SchemaVaults mail-server catalog. Template IDs are needed when sending template-based emails via `sendEmail()` or `sendEmailToMailingList()` from `@schemavaults/send-email`. Because the template catalog changes over time, this skill intentionally does not hardcode a list -- always query the live catalog.

## When to use this skill

- Before sending a template-based email, to find the correct `template_id` and understand the expected `template_props` shape.
- When unsure whether a template exists for a particular notification type.
- When the user asks "what email templates are available?"

## Prerequisites

- `SCHEMAVAULTS_MAIL_API_KEY` must be set -- the same API key used for sending emails. The `GET /api/templates` endpoint accepts the same bearer-token auth as `POST /api/send`.

## Usage -- with the `listEmailTemplates()` helper (preferred)

The `@schemavaults/send-email` package exports a `listEmailTemplates()` function that handles API key resolution, environment-aware URL lookup, and response parsing -- the same conventions as `sendEmail()`:

```ts
import { listEmailTemplates } from "@schemavaults/send-email";

const templates = await listEmailTemplates();
// => [{ id: "welcome-email", description: "..." }, ...]
```

Options (all optional):

```ts
await listEmailTemplates({
  bearerToken: "svlts_mail_pk_...",   // override SCHEMAVAULTS_MAIL_API_KEY
  environment: "development",         // override SCHEMAVAULTS_APP_ENVIRONMENT
});
```

## Usage -- from the shell via the CLI (preferred for one-off discovery)

`@schemavaults/send-email` ships a `schemavaults-send-email` binary that wraps the same helpers. From any repo that has the package installed, run:

```bash
bunx schemavaults-send-email list-templates              # JSON output (default)
bunx schemavaults-send-email list-templates --format table  # tab-separated id<TAB>description
```

(Use `npx schemavaults-send-email …` if you don't have `bun` available.) The CLI reads `SCHEMAVAULTS_MAIL_API_KEY` from the environment, exactly like the helper. Pipe `--format json` output through `jq` for filtering, e.g.:

```bash
bunx schemavaults-send-email list-templates | jq '.[].id'
```

## Usage -- raw HTTP

```bash
curl -sS \
  -H "Authorization: Bearer $SCHEMAVAULTS_MAIL_API_KEY" \
  https://<mail-server-origin>/api/templates
```

## Usage -- Claude Code querying templates directly

For one-off discovery from a Claude Code session, prefer the CLI above -- a single shell command, no script file needed. Fall back to a `/tmp/` Bun script only when you need to do something more elaborate than print the catalog (e.g. fetch + filter + cross-reference with another data source):

```ts
// /tmp/list-email-templates.ts
import { listEmailTemplates } from "@schemavaults/send-email";

const templates = await listEmailTemplates();
for (const t of templates) {
  console.log(`- ${t.id}: ${t.description}`);
}
```

Run from the repo root:

```bash
bun run /tmp/list-email-templates.ts
```

## Response shape

```json
{
  "success": true,
  "data": [
    {
      "id": "<template-id>",
      "description": "<human-readable blurb; usually documents the expected props shape>"
    }
  ]
}
```

Each entry has an `id` (pass this verbatim as `template_id` in `sendEmail()` or `sendEmailToMailingList()`) and a `description` that, by convention, documents the expected `template_props` shape.

If the description is ambiguous about the props shape, either:
- (a) Pass the props and let the server reject malformed calls with HTTP 400.
- (b) Read the template's source file in the mail-server repo at `src/lib/EmailTemplatesCatalog/email-template-refs/<id>.ts` for authoritative type info.

## Errors

| Status | Error | Cause |
| --- | --- | --- |
| 401 | `Invalid or revoked API key.` | `SCHEMAVAULTS_MAIL_API_KEY` is wrong, expired, or revoked. |
| 500 | `Failed to list email templates!` | Unexpected server-side failure while loading the catalog; retry or escalate. |

## Relationship to the send-email-to-mailing-list skill

Use this skill first to discover template IDs, then use the `send-email-to-mailing-list` skill (or `sendEmail()` / `sendEmailToMailingList()` directly) to send the email. If none of the registered templates fit your notification, skip template discovery and use the raw `text`/`html` form instead.

Once you've picked a template, validate your `template_props` shape with `--dry-run` on the relevant send CLI (`bunx schemavaults-send-email send --dry-run …` or `send-to-mailing-list --dry-run …`) **instead of sending a blank real email**. Server-side props validation only runs on `POST /api/send`, so dry-run is the only way to catch `template_props` mismatches without delivering.
