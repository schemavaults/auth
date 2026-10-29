---
name: crawler-policy
description: Keeping the auth server's `/robots.txt` and `/sitemap.xml` in step with its pages — `PUBLIC_PAGE_PATHS` and `CRAWLER_DISALLOWED_PATH_PREFIXES` in `auth-server/src/lib/seo/crawler-policy.ts`, the `src/app/robots.ts` / `src/app/sitemap.ts` metadata routes, the generated `/docs/<slug>` sitemap entries, the environment split (production rules vs. `Disallow: /` everywhere else), and the unit / E2E tests that pin them. Use when adding, removing, renaming or moving a `page.tsx` (or a route group, redirect or rewrite) under `auth-server/src/app`, when a page changes between public and signed-in, or when touching the robots / sitemap routes.
---

# Crawler policy (robots.txt + sitemap.xml)

## How it is built

- `auth-server/src/lib/seo/crawler-policy.ts` is the single source of truth:
  - `PUBLIC_PAGE_PATHS`: literal paths, listed first in the sitemap.
  - `CRAWLER_DISALLOWED_PATH_PREFIXES`: the production `Disallow:` lines.
  - `buildAuthServerSitemap()` and `buildAuthServerRobots()`.
- `src/app/sitemap.ts` lists `PUBLIC_PAGE_PATHS`, then one `/docs/<slug>` page per catalogued API operation, parsed from `getOpenApiDocument()`. A new API operation gets its sitemap entry automatically.
- `src/app/robots.ts`:
  - **Production:** `Allow: /`, every disallow prefix, and a `Sitemap:` line.
  - **Every other environment:** `Disallow: /` only, so development, staging and test deployments stay out of search results.
- Both routes are `force-dynamic` with `runtime = "nodejs"`. They read `SCHEMAVAULTS_AUTH_SERVER_URL` and `SCHEMAVAULTS_APP_ENVIRONMENT` per request, so white-label deployments get their own URLs (see `white-label-branding`). Keep them dynamic. Never hardcode a host: build absolute URLs with `new URL(path, auth_server_url)`.

## Classify every page you add

A page's path is its folders under `src/app` with route groups `(…)` dropped: `src/app/(client)/auth/(authenticate)/login/page.tsx` is `/auth/login`.

| The page is… | Do this |
| --- | --- |
| Signed-in only (under `(client)/(authenticated)/`) | Nothing, if its first segment is already disallowed (`/account`, `/admin`, `/apis`, `/apps`, `/mfa`, `/orgs`). For a new top-level segment, add `"/<segment>"` to `CRAWLER_DISALLOWED_PATH_PREFIXES`. |
| Public and worth finding in search: useful content signed out, at a fixed URL, with no token or query string required | Add the literal path to `PUBLIC_PAGE_PATHS`. Add it in the same position to the copy in `tests/e2e-auth-tests/cypress/e2e/misc/CrawlerFiles.cy.ts`, because that spec compares the sitemap's first entries to its list in order. |
| Public but only meaningful mid-flow or as a utility (needs a token or query params, or is a callback, error or "close this window" page) | Add a disallow prefix and don't list it. Existing examples: `/auth/logout`, `/auth/mfa`, `/auth/reset-password`, `/auth/verify-email`, `/close_window`, `/error`. |
| A public dynamic route worth indexing (like `/docs/[slug]`) | Never put a `[param]` path in `PUBLIC_PAGE_PATHS`. Enumerate the real URLs in `sitemap.ts` the way the docs pages are, and add the route pattern to `generatedRoutes` in `crawler-policy.test.ts`. |

Also:

- **Removing or renaming a page:** remove or rename its `PUBLIC_PAGE_PATHS` entry (and the E2E copy) or its disallow prefix.
- **Moving a page into or out of `(authenticated)`** changes its class, so classify it again.
- **Redirects** (`redirects()` in `next.config.ts`): never list a redirect source. Disallow it when it leads into the dashboard, as `/org/` does for the legacy `/org/*` → `/orgs/*` redirect.
- **Route handlers outside `/api`** (`/branding/*`, `/json-schema/*`, and the `/favicon.ico` and `/.well-known/*` rewrites) are files, not pages: leave them crawlable and unlisted. `/branding/` in particular must stay crawlable, because link-preview bots such as Twitterbot obey robots.txt and fetch the opengraph image from there.
- **`/api/` is already disallowed.**

## How the prefixes match (RFC 9309)

- Each entry is a prefix of the URL's path plus query string. `/apps` also matches `/apps-new` and `/apps?tab=1`.
- The trailing slash in `/api/` is what stops it from matching `/apis`.
- `?` is a literal character: `/auth/login?` blocks login links that carry a client app's authorization request, while the bare `/auth/login` stays crawlable.
- The longest matching rule wins, and `Allow` wins a tie, so the blanket `Allow: /` never overrides a disallow prefix.
- robots.txt stops crawling, not indexing of a URL linked from elsewhere. Signed-in pages already redirect anonymous visitors to the login page.

## Tests and verification

- `auth-server/src/lib/seo/crawler-policy.test.ts` walks `src/app` and fails when:
  - any page is neither listed (or generated) nor disallowed; the failure names the route to classify
  - a `PUBLIC_PAGE_PATHS` entry has no `page.tsx`, or is disallowed
  - a page under `(authenticated)` is crawlable

  Run it with `bun run test --filter @schemavaults/auth-server`.
- `auth-server/src/app/crawler-routes.test.ts` covers the route exports: the white-label URL, one docs entry per operation, and `Disallow: /` outside production.
- The E2E spec `misc/CrawlerFiles.cy.ts` runs in the test environment, so it only sees `Disallow: /`. It checks the sitemap's public entries and that each listed page answers 200. Only the unit tests cover the production rules.
- To see the production robots.txt yourself, start the built server with `SCHEMAVAULTS_APP_ENVIRONMENT=production` and `SCHEMAVAULTS_AUTH_SERVER_URL` set, then `curl /robots.txt` and `/sitemap.xml`. Neither route needs the database (see the `verify` skill for running the server).
- Commits: a change here bumps `auth-server`, and a change to the E2E spec bumps `e2e-auth-tests` (see the `commit-changes` skill).
