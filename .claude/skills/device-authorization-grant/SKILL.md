---
name: device-authorization-grant
description: The OAuth 2.0 Device Authorization Grant (RFC 8628) — `POST /api/oidc/device_authorization`, the `urn:ietf:params:oauth:grant-type:device_code` grant at `POST /api/oidc/token` (`device_code_grant.ts`, `authorization_pending` / `slow_down` / `access_denied` / `expired_token`), the `DEVICE_AUTHORIZATIONS` and `APP_DEVICE_AUTHORIZATION_POLICIES` tables (migration 00055), the per-app opt-in (`GET`/`PUT /api/apps/{app_id}/device-authorization`, `AppDeviceAuthorizationCard`), the `/device` verification page and its `/api/auth/device/{lookup,approve,deny}` endpoints, the user code format and helpers in `@schemavaults/auth-common`, the client SDK's `signInWithDeviceAuthorization()` / `requestDeviceAuthorization()` / `pollDeviceAuthorization()`, the server SDK's `startDeviceAuthorization()` / `pollDeviceAuthorization()` / `requestDeviceAccessToken()` (`/confidential-client`), and the `device_authorization` E2E suite. Use when touching any of these, or a sign-in for a device that cannot show the login page (CLIs, TV apps).
---

# Device authorization grant (RFC 8628)

A device that cannot show the login page (a CLI, a TV app) signs a user in by
showing a short code: the user enters it on the auth server's `/device` page,
signs in there, and approves (or denies) the request, while the device polls
the token endpoint.

## Shared definitions (`@schemavaults/auth-common`, `src/oidc/device-authorization/`)

- `OAUTH_DEVICE_CODE_GRANT_TYPE`, `DEVICE_AUTHORIZATION_EXPIRES_IN_SECONDS`
  (15 minutes), `DEVICE_AUTHORIZATION_DEFAULT_INTERVAL_SECONDS` (5),
  `DEVICE_AUTHORIZATION_SLOW_DOWN_INCREMENT_SECONDS` (5), `DEVICE_VERIFICATION_PATH`
  (`/device`), `DEVICE_ACCESS_TOKEN_ERRORS`.
- User codes: 8 characters of the base-20 consonant alphabet `BCDFGHJKLMNPQRSTVWXZ`
  (RFC 8628 §6.1; ~2^34.6 codes, no vowels so no words), displayed `BCDF-GHJK`.
  `generateUserCode()` (rejection sampling), `normalizeUserCode()` (case-insensitive,
  ignores dashes and spaces; null when malformed), `formatUserCode()`.
- `deviceAuthorizationResponseSchema`, `getDeviceVerificationUri()` /
  `getDeviceVerificationUriComplete()`.
- `OIDC_ENDPOINT_PATHS.device_authorization` and `buildOidcProviderMetadata()`
  advertise `device_authorization_endpoint` and the grant in `grant_types_supported`
  (the client SDK builds its `openid-client` configuration from the same metadata).

## Storage (migration `00055-device-authorizations.ts`, `src/lib/auth-db/device-authorizations/`)

- `APP_DEVICE_AUTHORIZATION_POLICIES`: a row means the app's managers enabled the
  grant. **Off by default**, because whoever starts a device flow chooses who is shown
  the code (anyone who knows an app id can ask a user to approve a request in its
  name). Hardcoded apps (the auth server's own app) can never enable it; dynamically
  registered clients can never use it (`checkDeviceFlowClient()`, and
  `isGrantTypeAllowedForClientApp()` refuses the grant for them like the
  service-account grants). Disabling deletes the app's unredeemed requests.
- `DEVICE_AUTHORIZATIONS`: one row per request. Only SHA-256 hashes of the device
  code (256 random bits) and of the normalized user code are stored; at most one
  pending row holds a user code (partial unique index; a collision retries with a
  new code). Status `pending → approved | denied → redeemed`; `uid` + `decided_at` on
  a decision, the granted `scope` + `scope_api_server_id` on approval;
  `interval_seconds` grows by 5 on each `slow_down`; rows are deleted an hour after
  they expire (opportunistically, on each new request).
- `evaluateDevicePoll()` is the pure decision behind a poll (unit tested);
  `pollDeviceAuthorization()` applies it under `SELECT … FOR UPDATE`, so a device code
  yields tokens exactly once.

## Endpoints

- `POST /api/oidc/device_authorization` (`src/app/api/oidc/device_authorization/`):
  form-encoded `client_id`, optional `scope` and RFC 8707 `resource`; clients
  authenticate as at the token endpoint. A form `client_id` that differs from the
  HTTP Basic credentials' is refused with `invalid_client` while parsing
  (`parseDeviceAuthorizationRequest()`). `invalid_client` (401) for an unknown app,
  `unauthorized_client` until the grant is enabled; rate limited per IP
  (`DEVICE_AUTHORIZATION_RATE_LIMIT`). What is granted is decided at approval.
- `POST /api/oidc/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code`
  (`device_code_grant.ts`): re-checks `checkDeviceFlowClient()` on every poll (so
  disabling cuts off flows in progress), then answers `authorization_pending`,
  `slow_down` (polled sooner than the interval, 500 ms tolerance), `access_denied`,
  `expired_token`, or `invalid_grant` (unknown / another client's / already redeemed).
  Redeeming re-checks what the code grant does: the approving session was not
  revoked since (`tokens_valid_after` vs `decided_at`), the account is enabled, the app
  is still authorized, API scopes are still allowed and consented (`splitTokenScopes`).
  It mints access + refresh tokens (+ id_token with `openid`); issued tokens record
  `grant_type: "device_code"`. Rate limited per IP (`DEVICE_CODE_RATE_LIMIT`).
- `GET`/`PUT /api/apps/{app_id}/device-authorization` (management access,
  `loadAppForManagement`): the opt-in. After the permission check, `PUT` re-asserts that
  `enabled` is a boolean (400 otherwise) and answers 409 for every request about a
  dynamically registered client, enabling or disabling. UI: `AppDeviceAuthorizationCard`
  on the app page.

## The `/device` page (`src/app/(client)/device/`, `src/components/DeviceVerification/`)

- Signed-in only (route guard; `next_href` keeps a valid `?user_code=`). Disallowed in
  `/robots.txt` (`/device` in `CRAWLER_DISALLOWED_PATH_PREFIXES`).
- Code entry (`OTPInput`), auto-lookup when the link carries the code, then the review
  card: the code in large type to compare with the device (RFC 8628 §5.4 remote
  phishing), the app (unverified name/description), the permissions
  (`ConsentPermissions`, shared with the PKCE consent screen, with the API scope
  checkboxes), an expiry countdown (`FlowExpiryCountdown`), a phishing warning, and
  Approve / Deny. Approve is disabled once the code expires.
- `POST /api/auth/device/lookup|approve|deny` (session auth, JSON): misses are counted
  per account (10 / 15 min) and per IP (30 / 15 min) and answer 404
  `invalid_user_code`; once a budget is spent every lookup answers 429 until the
  window passes (`findDeviceAuthorizationForUser()`). Approving applies the
  third-party e-mail verification gate (403 `email_verification_required`),
  authorizes the app with the approved API scopes, records implicit first-party
  consent, then binds the resolved grant to the request.
- Audit events: `user.device_authorized` (with `api_scopes`), `user.device_authorization_denied`.

## SDKs

- `@schemavaults/auth-client-sdk`: `client.signInWithDeviceAuthorization({ scope,
  resource, onUserCode, signal })` (scope must include `openid`; stores the session
  through `establishSessionFromTokenResponse()`, shared with the code grant), and the
  standalone `requestDeviceAuthorization()` / `pollDeviceAuthorization()` on
  `openid-client`'s `initiateDeviceAuthorization` / `pollDeviceAuthorizationGrant`.
  `access_denied` / `expired_token` are not reported as client errors.
  `client.get|setClientApplicationDeviceAuthorization(app_id[, enabled])` manage the opt-in.
- `@schemavaults/auth-server-sdk/confidential-client`: `startDeviceAuthorization()`,
  `pollDeviceAuthorization()` (paced loop) and `requestDeviceAccessToken()` (one poll)
  with `client_secret_basic`.

## Tests

- Unit: `auth-common` `device-authorization.test.ts`, `provider-metadata.test.ts`;
  auth-server `evaluate-device-poll.test.ts`, `client-grant-types.test.ts`,
  `find-misplaced-token-exchange-param.test.ts`; both SDKs' `device-authorization.test.ts`.
- E2E: the `device_authorization` suite (`DeviceAuthorizationGrant.cy.ts`); apps are
  created by request, or seeded with `enable_device_authorization: true` on
  `POST /api/test/seed/create-test-nextjs-app/{api_server_id}`.
