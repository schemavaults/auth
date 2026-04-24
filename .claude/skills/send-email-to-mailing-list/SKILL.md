---
name: send-email-to-mailing-list
description: Send an email to a mailing list via the SchemaVaults mail-server `/api/send` route, using either the `sendEmailToMailingList()` helper or the `schemavaults-send-email send-to-mailing-list` CLI from `@schemavaults/send-email`. Use when any server-side TypeScript/JavaScript code needs to send a notification to a mailing list audience — **or when Claude Code itself wants to send a one-shot notification at the end of a task** (preferred — invoke the CLI via `bunx schemavaults-send-email send-to-mailing-list …`; fallback — write a short script to `/tmp/` and run it with `bun`).
---

# Send Email to Mailing List

This skill teaches Claude how to send an email to a mailing list, either (a) from any server-side TypeScript/JavaScript project that imports `@schemavaults/send-email`, or (b) directly from a Claude Code session — for example, to send a "I just finished this workflow" notification at the end of a task. In both cases the `sendEmailToMailingList()` helper wraps the SchemaVaults mail-server `POST /api/send` route and automatically resolves the API key from environment variables. The skill is self-contained and portable — drop it into any project's `.claude/skills/` folder and you're done.

## When to use this skill

There are two distinct use cases. Either fits this skill:

**(a) Application code needs to send a notification to a mailing list audience.** For example:

- New user signup / first-purchase events
- Unhandled errors in background jobs or cron tasks
- Billing / subscription lifecycle events (trial ending, payment failed)
- Ops alerts (deploy succeeded, rate-limit tripped, healthcheck failed)
- Any ad-hoc "FYI, this just happened" message intended for a mailing list audience

**(b) Claude Code itself wants to notify a mailing list at the end of a workflow.** For example:

- Claude just finished implementing a feature and pushed the branch.
- Claude finished reviewing a PR and posted comments.
- A long-running build, migration, or CI task finished (success or failure).
- A scheduled maintenance script Claude was orchestrating completed.

For use case (b), see the "Usage -- Claude Code post-workflow notification" section below.

Do **not** use it for:

- Sending to individual end users (use `sendEmail()` with an email string instead)
- Client-side / browser code (the API key is a secret)
- High-volume broadcasts beyond 50 recipients per send (the mail-server caps each send call at 50 recipients)

## Prerequisites

1. **Install the helper package** in the target project:
   ```bash
   bun add @schemavaults/send-email
   # or: npm install @schemavaults/send-email
   ```

2. **Set two environment variables** wherever the code runs (local dev, CI, production):
   - `SCHEMAVAULTS_MAIL_API_KEY` -- Bearer token issued from the mail-server's `api_keys` table. Always starts with `svlts_mail_pk_`. Treat it like any other secret; never commit it, never ship it to browsers.
   - `SCHEMAVAULTS_MAILING_LIST_ID` -- UUID of the target mailing list from the mail-server's `MAILING_LISTS` table.

   Both are mandatory when not passing values directly -- the helper throws `Error("Failed to load ... from environment variable ...")` if either is missing.

3. **Optional third env var:** `SCHEMAVAULTS_APP_ENVIRONMENT` = `"production"` | `"development"` | `"staging"`. If unset, the helper falls back to `production` and targets the production mail-server. Only set this when you explicitly want to hit a non-prod environment.

4. **Call only from server-side code** -- API routes, server actions, cron handlers, background workers. Never from a React client component or browser bundle.

## Usage -- template form (preferred)

When a React Email template already exists in the mail-server catalog, reference it by `template_id` so the rendering (HTML + plain text) happens on the mail-server. Use `listEmailTemplates()` from `@schemavaults/send-email` (or see the `list-email-templates` skill) to discover available template IDs.

```ts
import { sendEmailToMailingList } from "@schemavaults/send-email";

export async function notifyMailingListOfSignup(userName: string): Promise<void> {
  await sendEmailToMailingList({
    body: {
      subject: `New signup: ${userName}`,
      message: {
        template_id: "<template-id-from-GET-/api/templates>",
        template_props: {
          /* prop shape per the template's description field */
        },
      },
    },
  });
}
```

**If none of the registered templates fits your notification**, use the raw `text`/`html` form below instead of trying to bend a mismatched template.

## Usage -- raw HTML/text form (ad-hoc)

For one-off notifications where spinning up a dedicated React Email template is overkill, supply `text` and `html` directly. **Both fields are required.**

```ts
import { sendEmailToMailingList } from "@schemavaults/send-email";

export async function notifyMailingListOfError(err: Error, context: string): Promise<void> {
  const subject = `[alert] ${context}: ${err.message}`;
  const text =
    `An error occurred in ${context}.\n\n` +
    `Message: ${err.message}\n\n` +
    `Stack:\n${err.stack ?? "(no stack)"}\n`;
  const html =
    `<p>An error occurred in <code>${context}</code>.</p>` +
    `<p><strong>Message:</strong> ${err.message}</p>` +
    `<pre>${err.stack ?? "(no stack)"}</pre>`;

  await sendEmailToMailingList({
    body: { subject, message: { text, html } },
  });
}
```

Escape user-supplied values before embedding them in `html` if they can contain `<` / `>` / `&` -- the mail-server does not sanitize this for you.

## Usage -- passing a mailing list ID explicitly

By default `sendEmailToMailingList` reads the mailing list UUID from the `SCHEMAVAULTS_MAILING_LIST_ID` env var. You can override this per-call:

```ts
await sendEmailToMailingList({
  mailingListId: "00000000-0000-0000-0000-000000000000",
  body: {
    subject: "Hello from a specific list",
    message: { text: "Hello", html: "<p>Hello</p>" },
  },
});
```

## Usage -- CLI (preferred for one-off / ad-hoc sends)

`@schemavaults/send-email` ships a `schemavaults-send-email` binary that wraps the same helper. For any one-off send -- a manual notification, a quick smoke test, a `bash` cron entry, or Claude Code firing off a single end-of-workflow email -- the CLI is the simplest path. No `/tmp/` script, no `bun run`.

```bash
# Raw text/html (both required)
bunx schemavaults-send-email send-to-mailing-list \
  --subject "[ops] nightly backup finished" \
  --text  "Backup completed at $(date -u +%FT%TZ). 0 errors." \
  --html  "<p>Backup completed at $(date -u +%FT%TZ). <strong>0 errors.</strong></p>"

# Template-based
bunx schemavaults-send-email send-to-mailing-list \
  --subject "Welcome aboard, Alice" \
  --template-id welcome-email \
  --template-props '{"name":"Alice"}'

# Override the mailing list per-call
bunx schemavaults-send-email send-to-mailing-list \
  --mailing-list-id 00000000-0000-0000-0000-000000000000 \
  --subject "..." --text "..." --html "..."

# Long bodies: read from files instead of inline strings
bunx schemavaults-send-email send-to-mailing-list \
  --subject "weekly digest" \
  --text-file /tmp/digest.txt \
  --html-file /tmp/digest.html

# Or supply the entire request body as a JSON file (validated server-side)
bunx schemavaults-send-email send-to-mailing-list --body-file /tmp/payload.json
```

(Substitute `npx` for `bunx` if `bun` is unavailable.) The CLI reads `SCHEMAVAULTS_MAIL_API_KEY` and `SCHEMAVAULTS_MAILING_LIST_ID` from the environment exactly like the helper, exits non-zero with a one-line error on failure, and exits `0` on a successful 200 from the mail-server.

Run `bunx schemavaults-send-email send-to-mailing-list --help` for the full flag reference.

### Validating before sending (`--dry-run`)

Because a mailing-list send fans out to every subscriber, **never use a real send to validate your request**. Use `--dry-run` to round-trip Zod body + `template_props` shape + API-key/mailing-list scoping through the server without dispatching anything:

```bash
bunx schemavaults-send-email send-to-mailing-list --dry-run \
  --subject "Welcome aboard, Alice" \
  --template-id welcome-email \
  --template-props '{"name":"Alice"}'
```

A successful dry-run prints `[dry-run] mailing-list request validated; no email sent.` and exits `0`. A malformed request exits non-zero with the server's validation error.

## Usage -- Claude Code post-workflow notification

Claude itself can use this skill to send a one-shot notification to a mailing list at the end of a workflow in any repo that depends on `@schemavaults/send-email` (this repo already does).

### Preferred: invoke the CLI directly

For most end-of-workflow notifications (a few sentences plus a short bullet list) the CLI is the right tool -- one shell command, no scratch file:

```bash
bunx schemavaults-send-email send-to-mailing-list \
  --subject "[claude-code] workflow finished: <short description>" \
  --text "$(printf 'Claude just finished a workflow.\n\nSummary:\n- <bullet 1>\n- <bullet 2>\n- <bullet 3>\n')" \
  --html "$(printf '<p>Claude just finished a workflow.</p><p><strong>Summary:</strong></p><ul><li>&lt;bullet 1&gt;</li><li>&lt;bullet 2&gt;</li><li>&lt;bullet 3&gt;</li></ul>')"
```

Replace the `<short description>` and bullet placeholders with a concrete summary. Keep the subject under ~70 characters and the body scannable (3-5 bullets is usually enough). A non-zero exit means the helper threw -- surface the error in your summary to the user rather than retrying silently.

### Fallback: write a `/tmp/` script

Reach for the script form only when the body is large enough or templated enough that string-quoting in shell is awkward (e.g. multi-paragraph HTML, dynamic data assembly, conditional content):

```ts
// /tmp/send-notification-after-workflow.ts
import { sendEmailToMailingList } from "@schemavaults/send-email";

async function main(): Promise<void> {
  await sendEmailToMailingList({
    body: {
      subject: "[claude-code] workflow finished: <short description>",
      message: {
        text:
          "Claude just finished a workflow.\n\n" +
          "Summary:\n" +
          "- <bullet 1>\n" +
          "- <bullet 2>\n" +
          "- <bullet 3>\n",
        html:
          "<p>Claude just finished a workflow.</p>" +
          "<p><strong>Summary:</strong></p>" +
          "<ul>" +
          "<li>&lt;bullet 1&gt;</li>" +
          "<li>&lt;bullet 2&gt;</li>" +
          "<li>&lt;bullet 3&gt;</li>" +
          "</ul>",
      },
    },
  });
  console.log("[notify] sent");
}

main().catch((err) => {
  console.error("[notify] failed:", err);
  process.exit(1);
});
```

Run from the repo root so Bun resolves `@schemavaults/send-email` through the repo's `node_modules/`:

```bash
bun run /tmp/send-notification-after-workflow.ts
```

### When to trigger this

Send **exactly one** notification at the **end** of a workflow, after all commits and pushes have landed, so the email reflects the final state.

### Cautions

- The env vars `SCHEMAVAULTS_MAIL_API_KEY` and `SCHEMAVAULTS_MAILING_LIST_ID` must be set in Claude's process. If they're missing, the helper (and CLI) throws a clear error -- report it to the user instead of retrying blindly.
- **One notification per workflow, not per step.** If a workflow had no meaningful outcome (e.g. "user asked a question, Claude answered"), skip the notification entirely. The inbox should not become chatty.
- **Do not send the notification before the work is finished.** Push first, notify second.
- **Ask before sending** if the user hasn't explicitly opted in to post-workflow notifications. Sending email is a side effect visible to other humans; don't do it silently on tasks where the user hasn't asked for it.
- **Never send a blank or "test" email to a mailing list to validate a request.** Use `--dry-run` (CLI) or `dryRun: true` (helper body). The mail-server validates the full request -- including `template_props` shape -- without dispatching to the audience. A misfired real test reaches every subscriber.

## Request body shape

`sendEmailToMailingList` accepts `Omit<SendEmailRequestBody, "to" | "cc" | "bcc">` -- the audience is the mailing list, so `to`, `cc`, and `bcc` are intentionally not allowed. Allowed fields:

```ts
type MailingListNotificationBody = {
  subject: string;
  message:
    | { template_id: string; template_props?: unknown }
    | { text: string; html: string };
  from?: string;      // defaults to the mail-server's configured sender
  replyTo?: string;   // optional reply-to override
  dryRun?: boolean;   // server validates without dispatching
};

// Full call signature:
type ISendEmailToMailingListOpts = {
  body: MailingListNotificationBody;
  mailingListId?: string; // override SCHEMAVAULTS_MAILING_LIST_ID
  bearerToken?: string;   // override SCHEMAVAULTS_MAIL_API_KEY; rarely needed
  mailServerUrl?: string; // override the server origin; rarely needed
  environment?: "production" | "development" | "staging";
  dryRun?: boolean;       // convenience; sets body.dryRun
};
```

## Error handling

The helper throws on any non-200 response -- wrap the call in `try/catch` whenever a failed notification should **not** break the caller's primary flow:

```ts
try {
  await sendEmailToMailingList({
    body: {
      subject: `New signup: ${userName}`,
      message: { text, html },
    },
  });
} catch (notifyErr) {
  console.error("[notify] failed to send mailing list notification", notifyErr);
}
```

Common failure modes:

| Error | Cause |
| --- | --- |
| `Failed to load API key from environment variable 'SCHEMAVAULTS_MAIL_API_KEY'` | Env var not set (or empty string) in the runtime environment. |
| `Failed to load mailing list ID from environment variable 'SCHEMAVAULTS_MAILING_LIST_ID'` | Env var not set (or empty string) in the runtime environment. |
| `Bad request body to send email with!` | Your `body` does not match the schema -- typically a missing `subject`, missing `text`/`html` pair, or unknown fields. |
| `Invalid or revoked API key.` (HTTP 401) | `SCHEMAVAULTS_MAIL_API_KEY` is wrong, expired, or revoked. |
| `This API key is not permitted...` (HTTP 403) | The API key is allowlisted to a different mailing list than the one targeted. |
| `Failed to parse request body!` (HTTP 400) | Server-side Zod parsing failed; usually a template `template_props` shape mismatch. |

## Environment targeting

By default the helper resolves the mail-server URL for the `production` environment. To hit staging or development explicitly:

```ts
await sendEmailToMailingList({
  environment: "development",
  body: {
    subject: "dev smoke test",
    message: { template_id: "my-test-email", template_props: { name: "test" } },
  },
});
```

Or set `SCHEMAVAULTS_APP_ENVIRONMENT` at the process level -- the helper reads it via `getAppEnvironment()` from `@schemavaults/app-definitions` when `opts.environment` is not passed in.

## Adding this skill to another project

1. Copy this file into the target project's `.claude/skills/` folder.
2. In the target project, install the helper package:
   ```bash
   bun add @schemavaults/send-email
   ```
3. Populate the two environment variables via the project's normal secret management (e.g. `.env.local` for local dev, your hosting provider's secret store for production):
   ```bash
   SCHEMAVAULTS_MAIL_API_KEY=svlts_mail_pk_...
   SCHEMAVAULTS_MAILING_LIST_ID=00000000-0000-0000-0000-000000000000
   ```
4. Commit the skill file. The next Claude Code session in that repo will automatically discover the skill.

## Reference

Source files inside the installed package (`node_modules/@schemavaults/send-email/dist/`) -- read these when you need ground truth:

- `send-email-to-mailing-list.{d.ts,js}` -- the `sendEmailToMailingList()` helper and its `ISendEmailToMailingListOpts` interface.
- `send-email.{d.ts,js}` -- the underlying `sendEmail()` implementation, including `getSchemaVaultsMailApiKey()` and server-URL resolution.
- `send-email-request-body-schema.{d.ts,js}` -- the Zod schema (`createSendEmailRequestBodySchema`) that both the client helper and the mail-server route use to validate bodies.
- `index.d.ts` -- package entry point; lists every exported symbol.
