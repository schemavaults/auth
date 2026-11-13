---
name: audit-log
description: The user and organization audit logs of the auth server — the `AUDIT_EVENTS` table (migration 00054, with the triggers that detach a deleted organization's rows and delete a deleted user's), `recordAuditEvent()` and the event type list (`auth-server/src/lib/audit-log/`), which handlers record which event, `GET /api/me/audit-log` and `GET /api/organizations/{organization_id}/audit-log` (cursor pagination, who may read them, when `ip_address` / `user_agent` are returned), and the `/account/audit-log` and `/orgs/{organization_id}/audit-log` pages (`AuditLogCard`). Use when adding or changing a security-relevant action (it probably needs an event), adding an event type, or touching the audit log endpoints, pages or table.
---

# Audit logs

## What is recorded, and where

- `AUDIT_EVENTS` (migration `00054-audit-events-table.ts`, types in `src/lib/auth-db/audit-events/`): one row per security-relevant action.
  - `actor_uid` / `actor_email`: who did it. Both NULL when nobody was signed in (a refused sign-in, a password reset link) or the server did it (the MFA enforcement job).
  - `subject_uid` / `subject_email`: the account the event is about, when there is one. May be the actor.
  - `organization_id`: puts the row in that organization's log.
  - `client_app_id`, `ip_address`, `user_agent`, `details` (JSONB, event-specific).
- The e-mail columns are the addresses at the time. They keep a row readable after the account's address changes or the account is deleted (the uid columns are then set to NULL by their foreign keys).
- `src/lib/audit-log/event-types.ts` lists every event (`user.*`, `organization.*`). It is client-safe.

## Recording an event

Call `recordAuditEvent(db, { event_type, actor, subject, organization_id, client_app_id, request, details })` from `src/lib/audit-log/record-audit-event.ts` once the action has succeeded (or, for `*_failed` events, was refused).

- It never throws: a failed insert is captured to the ERRORS table (`op_name: "recordAuditEvent"`) and the action still succeeds. Always `await` it, because the request's database handle is released once the response is produced.
- `request` is anything with `headers`: `ctx.request` in an operation handler, the `NextRequest` in the legacy `handle_*.ts` handlers. The address comes from `extractClientIp()`.
- Pass a party's `email` when it is at hand (`actor: user` works for `ctx.auth.user`); otherwise it is looked up.
- Do not pass a transaction that may still roll back, unless the event should roll back with it.
- Never put secrets, codes or tokens in `details`.
- Skip no-ops: revoking an authorization that did not exist, or saving unchanged settings, is not an event.

### Adding an event type

1. Add it to `auditEventTypes` in `event-types.ts`.
2. Add its label and sentence in `describe-audit-event.ts` (the `Record` and the `switch` fail to compile until you do), and its icon in `src/components/AuditLog/AuditLogTimelineItem.tsx`.
3. Record it in the handler.
4. `describe-audit-event.test.ts` checks that every type has a label and a sentence.

`event_type` is TEXT without a CHECK constraint, so a new type needs no migration.

## Reading the logs

| | `GET /api/me/audit-log` | `GET /api/organizations/{organization_id}/audit-log` |
| --- | --- | --- |
| Lists | rows where the caller is the actor or the subject | rows with that `organization_id` |
| May read | the signed-in user | organization owners and platform administrators (members get 403) |
| `ip_address` / `user_agent` | only on the caller's own requests, and on events nobody was signed in for (a refused sign-in to their account) | never |

- Both take `limit` (default 25, at most 100), `cursor` (the previous page's `next_cursor`) and `event_type`. Rows are ordered newest first by `(created_at, audit_event_id)`.
- `toAuditLogEntry()` in `to-audit-log-entry.ts` applies the redaction rule; the address of a request belongs to the person who made it, so never return it to anyone else.
- The pages (`src/app/(client)/(authenticated)/account/audit-log/`, `.../orgs/[organization_id]/audit-log/`) preload the first page with `loadFirstAuditLogPage()` and render `AuditLogCard` (`src/components/AuditLog/`), which loads older pages with `useSWRInfinite`. The organization page repeats the endpoint's owner / administrator check.

## Deleted users and organizations

Both are handled by triggers in the migration, so every deletion path is covered:

- **Organization deleted:** its rows are detached (`organization_id` moves into `details.organization_id`). Organization ids are chosen by users and can be claimed again; a later organization of the same id must not see its predecessor's log. Detached rows stay in the logs of the users they name.
- **User deleted:** rows outside any organization's log that name no other remaining account are deleted. Rows that also name someone else, or belong to an organization's log, are kept with the deleted uid set to NULL.

## Tests

- Unit: `src/lib/audit-log/*.test.ts` (row building, redaction, cursors, wording).
- E2E: `organizations/AuditLogApi.cy.ts` (who may read, redaction, pagination, the reused organization id) and `account/AccountAuditLogPage.cy.ts`.

## Not built yet

- No retention job: rows are kept until their user or organization is deleted.
- No administrator view of another user's log.
- App and API server management (secrets, callback URLs, scopes) records no events yet.
