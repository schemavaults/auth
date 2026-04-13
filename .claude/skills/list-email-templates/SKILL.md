---
name: list-email-templates
description: Discover available email templates from the SchemaVaults mail-server `GET /api/templates` endpoint. Use before sending a template-based email to find the correct `template_id` and understand the expected `template_props` shape.
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

## Usage -- from the shell

```bash
curl -sS \
  -H "Authorization: Bearer $SCHEMAVAULTS_MAIL_API_KEY" \
  https://<mail-server-origin>/api/templates
```

## Usage -- Claude Code querying templates directly

Claude can query the template catalog from any repo that depends on `@schemavaults/send-email` by writing a short script to `/tmp/` and running it with Bun:

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
