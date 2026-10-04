---
name: client-error-reporting
description: Client error reporting (telemetry): the auth client SDK's `ClientErrorReporter`, `reportError()` and the `disable_telemetry` option (also on `<SchemaVaultsAuthProvider>`), the public intake `POST /api/client-errors/{client_app_id}` with its gate (CORS, rate limits, per-app quota, storage cap), the `CLIENT_ERRORS` table (migration 00042), the `accept_client_error_reports` / `client_error_reports_max_storage_mb` / `client_error_reports_retention_days` server settings and the scheduled retention job (`/api/admin/client-errors/purge-expired`), the `/admin/client-errors` dashboard and its admin API, and the shared `clientErrorReportSchema` in `@schemavaults/auth-common`. Use when touching any of these, adding a field to error reports, changing which SDK errors are reported, or changing intake limits.
---

# Client error reporting

`@schemavaults/auth-client-sdk` reports the failures of its own auth flows to the auth server, Sentry style; apps can
send their own errors through the same channel; platform administrators browse the reports on `/admin/client-errors`.

## Report shape (`packages/auth-common/src/client-errors/`)

`clientErrorReportSchema` and `CLIENT_ERROR_REPORT_LIMITS` (field lengths, 8 KiB `context` JSON, 64 KiB request body)
are shared by the SDK, which truncates to fit, and the server, which refuses anything larger (400 / 413).

`redactClientErrorReport()` (`redact-client-error-secrets.ts`) replaces credentials in `message`, `stack` and `context`
with `[redacted]`: JWS/JWE compact tokens, `Bearer`/`DPoP`/`Basic` credentials, the values of secret-looking keys
(`isClientErrorSecretKey()`: `*token*`, `*secret*`, `password`, `authorization`, `cookie`, `code_verifier`, ...) in
`key=value`, `key: value` and (escaped) JSON, and `code=` parameters. The SDK applies it before sending and the
intake again before storing (older SDKs and other clients do not), so the fingerprint is computed from the redacted
message. The patterns must stay linear (the intake runs them on unauthenticated input) and free of lookbehind (older
Safari cannot parse it); over-redaction is accepted. Adding a
field means touching, in order: the schema and limits in auth-common, the SDK's `buildClientErrorReport()`, migration
00042 / `ClientErrorsTable`, `estimateClientErrorRowBytes()` (`row-size.ts`), the intake operation's row, and the
`AdminClientError` response schema (`auth-server/src/lib/api/domain-schemas/client-errors.ts`).

## SDK (`packages/auth-client-sdk/src/lib/telemetry/`)

- `SchemaVaultsAuthClient.withErrorReporting()` wraps the auth flows: `login`/`register` redirects,
  `handleSuccessfulAuthentication`, `acquireAccessToken`, `checkIfAuthenticatedWithServer`, `refreshUserData`,
  `sendAuthorizeClientApplicationRequest`, plus `logout`'s local-state failure. `sendAuthenticateRequest` is NOT
  wrapped: it throws for user-input problems (bad password, existing account). Expected session lifecycle errors are
  skipped by `isExpectedAuthClientError()` (`expected-errors.ts`, message fragments checked along the `cause` chain).
- Public API: `client.reportError(error, { operation, context })`, `client.telemetryEnabled`, and the
  `disable_telemetry` constructor option, threaded through `auth-react-provider`'s `SchemaVaultsAuthProviderProps` →
  `useAuthClientInitialization` → `AuthClientFactory`. With it set, nothing is ever sent.
- `ClientErrorReporter` (`client-error-reporter.ts`) never throws. It sends `text/plain` JSON with
  `credentials: "omit"` and `keepalive` (a CORS simple request: no preflight, survives page unload), reports an error
  object once (also when an SDK layer wraps it as a `cause`), dedupes equal errors for a minute, sends at most 25 per
  client, backs off for `Retry-After` on 429 / 503, and stops for good after a 403 / 404 or three network failures in
  a row (a refusal without CORS headers reads as a network failure).
- `buildClientErrorReport()` appends the `cause` chain to the stack as `Caused by:` sections and keeps only the
  page's origin + path: callback query strings carry authorization codes and `state`. A thrown value or `cause` that
  is not an `Error` is never serialized (only a string `message` member or its key names): `openid-client`
  (oauth4webapi) attaches the token response (`{ body }`) or the id_token claims (`{ claims }`) that way when it
  rejects them.

## Intake (`auth-server/src/app/api/client-errors/[client_app_id]/`)

`gate.ts` (the route's `configure` middleware) runs before the operation, cheapest first so a flood cannot drive
database load:

1. declared body over 64 KiB → 413;
2. `accept_client_error_reports` off → 403 `client_error_reporting_disabled`;
3. per-IP `CLIENT_ERROR_REPORT_RATE_LIMIT` (20/min) → 429;
4. app lookup + the per-client-app CORS policy (same rules as `validateCorsForClientApp`): unknown app 404,
   unregistered origin 403, web app without `Origin` 403;
5. per-app `CLIENT_ERROR_REPORT_APP_RATE_LIMIT` (1000/hour, rate-limit key source `client_app_id`) → 429. Counted
   only after the origin check so random app ids create no Redis keys;
6. stored reports at `client_error_reports_max_storage_mb` → 503 `client_error_storage_full` + `Retry-After`.

Refusals 2–3 carry `Access-Control-Allow-Origin: *` (reports carry no credentials, and the SDK must be able to read
why it was refused); later responses carry the app's own CORS headers. Every CORS response sets
`Access-Control-Expose-Headers: Retry-After, X-RateLimit-*`: without it cross-origin `fetch` hides `Retry-After`.
The gate must not read the body (the runtime parses it after), and `extractClientIp()` accepts any request-like value
for that reason. `OPTIONS` uses the shared `handleCorsPreflightForClientApp`.

The operation (`operation.ts`, `lenientContentType` body) stores the row: `fingerprint` from
`computeClientErrorFingerprint()` (`auth-server/src/lib/client-errors/fingerprint.ts`: name + message with uuids,
hex ids, URLs, quoted values and numbers normalized + operation; the app is left out so stats can count affected
apps), `page_url` through `sanitizeReportedPageUrl()`, `Origin` / `User-Agent` from the request, and `size_bytes`.
Then it adds the size to the cached total and runs the retention purge.

## Storage cap and retention (`auth-server/src/lib/client-errors/intake-policy.ts`)

- The cap counts `size_bytes` (UTF-8 size of the row's contents + 256 bytes, `row-size.ts`), not Postgres disk size,
  which never shrinks after deletes and would keep the intake blocked after a purge.
- The total is cached in Redis (`client-errors:stored-bytes`, 5-minute TTL, recomputed from `SUM(size_bytes)` when
  missing). **Every code path that deletes reports must call `forgetStoredClientErrorBytes()`**; the admin deletes
  and the retention purge do.
- Retention (`client_error_reports_retention_days`, 0 = keep) is enforced twice. The scheduled job
  `GET`/`POST /api/admin/client-errors/purge-expired` (`deleteExpiredClientErrors()`, no lock) runs daily: a
  Vercel cron in `auth-server/vercel.json`, a host crontab entry for the `deploy/` stack (`deploy/README.md`
  "Scheduled jobs"). It takes `Authorization: Bearer <CRON_SECRET>` via the route's `cron-bypass.ts` middleware
  (ahead of the admin guard, like `/api/admin/send-daily-report`) or an admin session. Between runs,
  `purgeExpiredClientErrors()` applies the same cutoff at most once an hour across instances (Redis `SET NX` lock)
  from the intake and the dashboard page.
- The three settings are declared in `server-setting-keys.ts`; the two number settings are what made
  `admin/AdminSettingsApi.cy.ts` allow `number` value types.

## Data (`auth-server/src/lib/auth-db/client-errors/`)

`CLIENT_ERRORS` (migration `00042-client-errors-table.ts`): no foreign keys (hardcoded apps such as the auth server's
own have no `APPS` row; `reported_uid` is client-reported and unverified). Queries: `listClientErrors` (filters +
total), `getClientErrorStats` (totals with the previous period, timeline in at most 90 buckets via
`lib/client-errors/timeline.ts`, top groups / apps / SDK versions / operations; the bucket width is inlined with
`sql.lit` so `SELECT` and `GROUP BY` match), `applyClientErrorFilters` (`q` escapes `LIKE` wildcards). Postgres
returns `BIGINT` / `COUNT` as strings: normalize with `toNumber`.

## Admin UI and API

- Pages: `auth-server/src/app/(client)/(authenticated)/admin/client-errors/` (dashboard, SSR-loads the snapshot for
  the URL's filters) and `[client_error_id]/` (detail). Components in `auth-server/src/components/ClientErrorsDashboard/`.
  Filters live in the URL (`lib/client-errors/client-error-page-filters.ts`: `range`, `app`, `group`, `q`, `page`);
  changing one navigates and the server reloads. Report content renders as escaped text; nothing from a report
  becomes a link.
- API (`routeGuard: "admin"`): `GET`/`DELETE /api/admin/client-errors` (list / purge before a cutoff),
  `GET /api/admin/client-errors/stats` (includes the unfiltered `storage` status),
  `GET`/`DELETE /api/admin/client-errors/{client_error_id}`, `GET`/`POST /api/admin/client-errors/purge-expired`
  (the retention job; also cron secret). Catalogued in `lib/api/operations/admin.ts`; the intake
  is the `Telemetry` tag (`lib/api/operations/telemetry.ts`).
- Daily admin report (`auth-server/src/app/api/admin/send-daily-report/`): a "Client errors" section built from
  `getClientErrorStats()` over the 24-hour window plus `loadClientErrorStorageStatus()`. Summary statistics only
  (totals with the change from the previous 24 hours, the top `DAILY_REPORT_CLIENT_ERROR_TOP_N` groups and apps,
  intake / storage / retention); every row links to the dashboard filtered to it (`range=24h` + `group` / `app`).
  Report text is escaped and shortened to one line; the response counts `client_errors_count` /
  `client_error_groups_count`.

## Tests

- Unit: `auth-common/src/client-errors/*.test.ts`, `auth-client-sdk/src/lib/telemetry/*.test.ts` (includes a
  client-level test with a fake adapter), `auth-server/src/lib/client-errors/*.test.ts`, and the daily report's
  section in `auth-server/src/app/api/admin/send-daily-report/buildReportHtml.test.ts`.
- E2E: `api_contract/ClientErrorReportsApi.cy.ts` (wire contract, CORS, refusals, off switch, storage cap filled to
  503, admin API) and `admin/AdminClientErrorsPage.cy.ts`. Reports are rate limited per IP and every spec shares
  one: call `POST /api/test/reset-rate-limit` before sending many. Specs that change the intake settings must restore
  them in `afterEach`, and must `cy.clearAllCookies()` first: `create_and_login_as_superuser_via_request()` refuses
  to run while a session is active.
- Locally (see the `verify` skill), cross-origin behavior is best checked from a page on another port bundling the
  SDK (`bun build`), with an app whose `APP_DOMAINS` row registers that origin.
