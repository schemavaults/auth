---
name: rate-limiting
description: The auth server's Redis rate limits and lockouts — `auth-server/src/lib/rate-limit/` (`checkRateLimit` / `checkRateLimits`, the failure-counted `checkRateLimitCount(s)` + `incrementRateLimitCounter(s)`, `clearRateLimitCounter`, `buildRateLimitKey()` with e-mail normalization and IPv6 /64 buckets, `extractClientIp()`, `rateLimitResponse()`), the limit configs in `rate-limit-configs.ts`, the login lockouts (`loginLockoutChecks()`, cleared by a password reset), the per-account MFA proof lockout (`lib/mfa/proof-failure-lockout.ts`), the 429 response schemas, fail-open behaviour, the proxy headers the per-IP limits trust, and the `rate_limiting` E2E suite. Use when adding an endpoint that verifies a guessable secret, sends e-mail, or creates rows for anonymous callers; when adding or changing any limit; or when touching client IP extraction or proxy configuration.
---

# Rate limiting

Every limit is a fixed-window counter in Redis (`rl:<config name>:<bucket>`,
an atomic `INCR` + `EXPIRE` Lua script that also re-arms a key that lost its
TTL). The configs live in `auth-server/src/lib/rate-limit/rate-limit-configs.ts`,
one exported `RateLimitConfig` each (`name`, `maxAttempts`, `windowSeconds`,
`keySource`), with a doc comment saying **what the budget bounds and why the
number**. Import everything from `@/lib/rate-limit`.

## Two kinds of limit

- **Attempt-counted** (`checkRateLimit`, or `checkRateLimits` for several in
  order): every request is counted, and a request is refused once the count
  exceeds `maxAttempts`. `checkRateLimits` stops at the first refusal, so the
  later limits' budgets are not spent; list the broadest one (per IP) first so
  refused requests still cost the caller.
- **Failure-counted lockouts** (`checkRateLimitCount(s)` before the check,
  `incrementRateLimitCounter(s)` after a failure): only failures count, a budget
  of N allows exactly N failures, and while spent the right credential is
  refused too (otherwise the response leaks it). Use them for anything that
  verifies a guessable secret. `clearRateLimitCounter` ends a window early (a
  completed password reset clears the account's login lockouts).

## Keys: count the subject the handler acts on

`buildRateLimitKey()` normalizes every identifier, so callers pass raw values:

- **E-mail addresses** go through `normalizeEmail()` (trim + lowercase), the
  same normalization `normalizedEmailSchema` applies before an account lookup.
  A limiter keyed on a different spelling than the handler reads is bypassed
  (`" Victim@x.com"` used to get a fresh login budget per spelling). If a
  handler normalizes some other way, normalize the limiter's identifier the
  same way.
- **IPs** go through `rateLimitIpBucket()`: IPv4 as is, IPv6 per /64 (one
  subscriber holds a whole /64), IPv4-mapped IPv6 as its IPv4 address, ports
  and brackets dropped.
- Per-account budgets use `uid` (or `email` before sign-in); `ip+uid` /
  `ip+email` give each account its own budget per address.

Pair a per-account limit with a per-IP one: per-account alone lets one address
spray many accounts, per-IP alone lets a botnet or proxy pool hammer one account.

## Client IP and proxies

`extractClientIp()` trusts `X-Real-IP`, then the first `X-Forwarded-For` entry,
and falls back to `127.0.0.1` in development and test. Production deployments
must overwrite `X-Real-IP` at their edge: Vercel does, and the `deploy/` nginx
template sets it to `$remote_addr`. Behind another load balancer, the real_ip
module must restore the client address first (see the template's comment), or
every client shares one budget. Public endpoints answer `ipRequiredResponse()`
(400) when no IP can be determined.

## Failure behaviour

Redis errors fail open (the request is allowed) and are recorded in the ERRORS
table once a minute per limiter (`rateLimit.<op>:<name>`). A missing identifier
throws inside the same `try`, so it fails open too: check for the identifier at
the call site (as login does with the e-mail address) rather than relying on it.

## Responses and docs

Answer with `rateLimitResponse(result)`: 429, `Retry-After`, `X-RateLimit-Limit`
/ `-Remaining` / `-Reset`, body `{ success: false, message }` (every UI caller
shows `message`). Declare the 429 in the operation's `responses`
(`authRateLimitedResponse` for `/api/auth/*`, `mfaProofLockedOutResponse` for MFA
proofs, or `RateLimitedResponse` with an endpoint-specific description) and give
the budget in the operation's `description`.

## Checklist for a new endpoint

- Verifies a password, TOTP / recovery code, or other short secret: a
  failure-counted per-account lockout (across IPs) and a per-IP limit. Every
  MFA proof goes through `mfaProofFailureLockoutResponse()` /
  `recordMfaProofFailure()` (`lib/mfa/proof-failure-lockout.ts`), which share one
  per-account budget across the login challenge and the step-up proofs.
- Sends e-mail to a caller-chosen address: per address **and** per IP, counted
  whether or not an account exists (otherwise the 429 enumerates accounts).
- Creates rows or does work for anonymous callers (registration, dynamic client
  registration, device authorization, client error reports): per IP, plus a
  per-target quota where one target could be flooded from many IPs.
- Replayable without user interaction (refresh, client credentials, token
  exchange): per IP, in a bucket of its own so one grant cannot starve another.
- High-entropy secrets (256-bit client secrets, single-use authorization codes)
  need no guessing limit; say so in a comment rather than implying one.

## Tests

- Unit: `rate-limit-key.test.ts`, `ip-bucket.test.ts` (pure; CI's unit job has
  no Redis).
- E2E: the `rate_limiting` suite (`Run-Rate-Limiting-E2E-Tests` in
  `run-e2e-tests.yml`): `RateLimiting.cy.ts` (endpoint budgets, spellings of one
  address) and `MfaProofLockout.cy.ts`. `cy.reset_rate_limit()` (test-only `POST
  /api/test/reset-rate-limit`) deletes every `rl:*` key, and `cy.login()`,
  `cy.register()` and their `_via_request` variants call it: a spec asserting a
  lockout must not call them between the failures and the assertion. All E2E
  traffic comes from one IP, so keep per-IP budgets above what one suite sends
  between resets.

## Known trade-offs

- Fixed windows allow up to twice a budget in a burst straddling a window edge.
- The per-account login lockout (`LOGIN_ACCOUNT_LOCKOUT`) and the MFA proof
  lockout let anyone who knows an address (or, for MFA, the password) lock that
  account out for up to an hour. A password reset clears the login lockouts;
  nothing clears the MFA one early.
- Failing open means a Redis outage turns brute-force protection off (MFA
  challenges, which also live in Redis, stop working at the same time).
