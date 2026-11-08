# @schemavaults/example-nextjs-resource-server

An example Next.js 16 (App Router) app that signs users in with a SchemaVaults auth server and serves its own
protected API. It is the resource server the [E2E suite](../e2e-auth-tests) runs against, and a worked example of
each way a third-party app can integrate with the auth server.

- [What's inside](#whats-inside)
- [Configuration](#configuration)
- [Run it locally](#run-it-locally)
- [Deploy on Vercel](#deploy-on-vercel)
- [Troubleshooting](#troubleshooting)

## What's inside

Every page shares a header (the SchemaVaults logo and navigation between the demos) and a footer, both in
[`src/components/site/`](./src/components/site).

| Path | What it shows |
| --- | --- |
| `/` | Every demo, grouped by the client app it signs in as, with the id of each app this deployment uses. It also explains why the public and confidential clients must be separate apps. |
| `/auth/*`, `/account` | Sign-in with the SchemaVaults SDKs: `@schemavaults/auth-react-provider` in the browser, plus same-origin session routes (`/auth/session/{token,whoami,logout}`) that keep the refresh token in an HttpOnly cookie on this app's own domain. `src/app/auth/` is written at build time by `auth-server-sdk codegen` and is git-ignored. Signs in as the **public client** (`SCHEMAVAULTS_CLIENT_APP_ID`). |
| `/api/*` | The example API, declared with `@schemavaults/openapi-operations` (an `operation.ts` beside each `route.ts`). Access tokens are verified against the auth server's JWKS. `/api/health` needs no token. |
| `/api/openapi.json`, `/docs` | The OpenAPI 3.1 document and the API reference pages, generated from those declarations (`@schemavaults/openapi-docs-ui`). |
| `/openid-client/*` | Standard OIDC sign-in with the off-the-shelf [`openid-client`](https://github.com/panva/openid-client) package and no SchemaVaults SDK, as the public client. |
| `/openid-client-confidential/*` | The same flow as a **confidential client**: a client secret on top of PKCE, sent with `client_secret_basic`. |
| `/agents` | Agents acting for the user with delegated tokens (RFC 8693). The agents' sandboxes run in the user's browser, each agent's token is narrowed to the scopes the user picks, and revoking it cuts the agent off at once. Signs in as the confidential client. |
| `/.well-known/oauth-protected-resource` | RFC 9728 protected resource metadata. Published only when `SCHEMAVAULTS_RESOURCE_URL` is set; answers 404 otherwise. |

## Configuration

Every variable is read at request time. `next build` needs none of them, so the build never sees a secret.

| Variable | Required | Description |
| --- | --- | --- |
| `SCHEMAVAULTS_APP_ENVIRONMENT` | Yes | `production`, `staging`, `development` or `test`. Use `production` on Vercel: under `NODE_ENV=production`, which Vercel always sets, every request answers 500 while it is unset. `production` and `staging` require `https` auth server and resource URLs. |
| `SCHEMAVAULTS_AUTH_SERVER_URL` | Yes, outside `development` / `test` | The auth server, e.g. `https://auth.schemavaults.com`. The `/openid-client*` demos and `/agents` have no default for `production`. See [Using your own auth server](#using-your-own-auth-server). |
| `SCHEMAVAULTS_CLIENT_APP_ID` | Yes | Id of the public client app. Every page reads it. |
| `SCHEMAVAULTS_API_SERVER_ID` | Yes | Id of the API server: the audience of the access tokens `/api/*` accepts. Every page reads it. |
| `SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY` | Yes, for `/api/*` | The API server's JWKS access private key, which lets the API fetch the keys that verify its tokens. Calls that need a token answer 500 without it. See [The private key](#the-private-key) for the accepted formats. |
| `OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID` | For `/openid-client-confidential/*` and `/agents` | Id of the confidential client app. |
| `OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_SECRET` | For `/openid-client-confidential/*` and `/agents` | Its client secret. The key that seals the `/agents` sign-in cookies is derived from it, so rotating the secret signs everyone out of `/agents`. |
| `SCHEMAVAULTS_RESOURCE_URL` | No | The RFC 8707 resource URL clients name this API by, e.g. `https://<your-domain>/api`. Publishes the protected resource metadata (at `/.well-known/oauth-protected-resource/api` for that example) and accepts tokens whose `aud` is that URL, as MCP and dynamically registered clients request them. Those clients also need the API server's dynamic-client policy on the auth server. |
| `SCHEMAVAULTS_ACCEPTED_TOKEN_AUDIENCES` | No | Comma-separated extra resource URLs accepted as a token `aud`. |
| `SCHEMAVAULTS_EXAMPLE_RESOURCE_SERVER_URL` | No | Pins the server URL shown in `/api/openapi.json` and on `/docs`. Unset, it is taken from each request's `X-Forwarded-Host` / `X-Forwarded-Proto`, which Vercel sets. |

[`.env.example`](./.env.example) lists them with local development values.

## Run it locally

You need an auth server on `http://localhost:6767` (see the [auth-server README](../../auth-server/README.md)) with
this app registered for its `development` environment at `http://localhost:3007`. The steps are the ones in
[Register the app on the auth server](#2-register-the-app-on-the-auth-server), with that origin.

From the repository root:

```bash
bun install
```

```bash
cp tests/example-nextjs-resource-server/.env.example tests/example-nextjs-resource-server/.env.local
```

Fill in `.env.local`, then start it on port 3007:

```bash
bun run dev --filter @schemavaults/example-nextjs-resource-server
```

Turborepo builds the workspace packages it depends on first; the `dev` script then runs the auth codegen and
`next dev`.

## Deploy on Vercel

**Why it fits Vercel.** The server keeps nothing between requests: no database, no cache, no memory. The SDK
sign-in lives in an HttpOnly cookie, the `/agents` sign-in in sealed (AES-256-GCM) HttpOnly cookies, and agent
sessions and their sandboxes in the user's `localStorage`. Any function instance can answer any request, and every
route is rendered on demand.

**Why the commands run from the repository root.** The app depends on workspace packages (`workspace:*`) that
must be built first. The Turborepo `build` task does that (`dependsOn: ["^build"]` in
[`turbo.json`](../../turbo.json)), then the app's `build` script runs `auth-codegen` with the freshly built
`auth-server-sdk` CLI and `next build`. The auth server's own Vercel project builds the same way (see
[`auth-server/vercel.json`](../../auth-server/vercel.json)).

### 1. Create the Vercel project

Import the repository in Vercel (**Add New → Project**) and set:

| Setting | Value |
| --- | --- |
| Root Directory | `tests/example-nextjs-resource-server` |
| Framework Preset | Next.js |
| Install Command | `cd ../.. && bun install` |
| Build Command | `cd ../.. && bun run build --filter @schemavaults/example-nextjs-resource-server` |
| Output Directory | `.next` (the default) |
| Node.js Version | 20.9 or newer (Next.js 16's minimum; the [Docker image](./Dockerfile) runs 24) |

Leave **Include files outside the root directory in the Build Step** on, as it is by default. The build needs
`packages/*`, the root `package.json`, `bun.lock` and `turbo.json`. There is no `vercel.json` in this directory, so
these settings live on the Vercel project.

The install covers the whole monorepo, including the E2E suite's Cypress, whose postinstall downloads its test
runner binary. This app does not use it: set `CYPRESS_INSTALL_BINARY=0` on the project to skip the download.

The first deployment answers 500 on every page until the environment variables are set (step 3). Note the
project's production domain under **Settings → Domains**, or add a custom domain: the auth server must know it
before anyone can sign in. The steps below write it as `https://<your-domain>`.

### 2. Register the app on the auth server

Sign in to the auth server's console (e.g. `https://auth.schemavaults.com`) with an account that may create apps
and API servers. Register everything for the environment **the auth server** runs in (`production` for
`auth.schemavaults.com`): it matches domains and callback URLs against its own environment.

The origin is `https://<your-domain>` exactly: scheme and host, no path, no trailing slash.

1. **The API server.** Create it on `/apis` and copy its id (`SCHEMAVAULTS_API_SERVER_ID`). On its page, add the
   origin under **Connected Domains**.
2. **Its JWKS access key.** Generate it on `/apis/<api_server_id>/jwks-access-keys` and copy the private key
   (`SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY`). It is shown once: the auth server keeps only the public key.
3. **The public client app.** Create it on `/apps` and copy its id (`SCHEMAVAULTS_CLIENT_APP_ID`). On its page:
   - add the origin under **Connected Domains**;
   - add both callback URLs under **Callback URLs** (a public client accepts only exactly registered ones):
     - `https://<your-domain>/auth/authorize` (the SDK sign-in)
     - `https://<your-domain>/openid-client/callback` (the openid-client demo)
   - under **Connected API Servers**, choose **Connect API server** and pick the API server from step 1.

   Do not give this app a client secret. The `/openid-client/*` demo signs in as a public client, and a secret
   would make the token endpoint require client authentication.
4. **The confidential client app** (optional, for `/openid-client-confidential/*` and `/agents`). Create a
   second app on `/apps` and copy its id (`OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID`). On its page:
   - under **Client Secret**, choose **Generate client secret** and copy it
     (`OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_SECRET`). It is shown once.
   - add the same origin under **Connected Domains**;
   - add `https://<your-domain>/openid-client-confidential/callback` under **Callback URLs**. A confidential
     client without callback URLs accepts any path on its domains, so this is optional but tighter;
   - connect it to the same API server.
5. **Agents** (optional, for `/agents`). On the API server's page, add the scope `example:notes.read` under
   **Scopes** and switch on **Delegated Access (Agents)**. The confidential app's service account, which agents'
   tokens name as their actor, is created on first use.

### 3. Set the environment variables

Under the project's **Settings → Environment Variables**, add these for the **Production** environment (see
[Configuration](#configuration) for the optional ones):

```dotenv
SCHEMAVAULTS_APP_ENVIRONMENT=production
SCHEMAVAULTS_AUTH_SERVER_URL=https://auth.schemavaults.com
SCHEMAVAULTS_CLIENT_APP_ID=<public client app id>
SCHEMAVAULTS_API_SERVER_ID=<API server id>
SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY=<private key, see below>

# Optional: /openid-client-confidential/* and /agents
OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID=<confidential client app id>
OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_SECRET=<its client secret>

# Optional: skip the Cypress binary download during install
CYPRESS_INSTALL_BINARY=0
```

Mark the private key and the client secret as **Sensitive**.

#### The private key

`SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY` takes either:

- the PEM exactly as the auth server shows it: the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
  lines, real line breaks, and nothing after the last line; or
- that PEM base64url-encoded, on one line.

A PEM with a trailing newline, or with its line breaks written as `\n`, is rejected. The one-line form is the
easiest to paste. Save the key to `jwks-access-key.pem`, print the encoded value, then delete the file:

```bash
node -e 'process.stdout.write(Buffer.from(require("fs").readFileSync(process.argv[1], "utf8").trim()).toString("base64url"))' jwks-access-key.pem
```

### 4. Redeploy and check

Vercel applies environment variable changes to new deployments only: redeploy the latest deployment
(**Deployments → ⋯ → Redeploy**) or push a commit. Then:

```bash
curl https://<your-domain>/api/health
```

This should answer `{"ok":true,"environment":"production",...}`. In a browser:

- **Login** on `/` signs in through the auth server and lands on `/account`.
- **Sign in with openid-client** ends on `/openid-client/profile`.
- `/docs` lists the API; `/api/whoami` answers 401 without a token.
- `/agents` names any configuration it is missing.

By default the auth server asks users to verify their email address before it signs them in to a third-party
app like this one.

### Preview deployments

Each preview deployment has its own URL. The auth server doesn't know it, so sign-in on a preview fails. Either:

- set the variables for **Production** only and use previews just to check that the build passes (their pages
  answer 500); or
- register a branch's stable preview URL (`<project>-git-<branch>-<team>.vercel.app`) on both apps (domain and
  callback URLs) and on the API server (domain), and set the variables for **Preview** too.

Vercel's Deployment Protection, on for previews by default, puts a Vercel login in front of them. API calls from
`curl` or another server then get Vercel's response, not the example's.

### Deploying from CI

The auth server deploys from GitHub Actions with prebuilt artifacts
([`deploy-vercel-production.yml`](../../.github/workflows/deploy-vercel-production.yml)). The same commands deploy
this app. Run them from the repository root, with `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` set to this project's
values; `vercel build` uses the Root Directory and commands from [step 1](#1-create-the-vercel-project).

```bash
vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
```

```bash
vercel build --prod --token="$VERCEL_TOKEN"
```

```bash
vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN"
```

### Using your own auth server

Pointing this example at an auth server other than `https://auth.schemavaults.com` (a self-hosted or
white-label deployment) needs a code change today. The server-side code reads `SCHEMAVAULTS_AUTH_SERVER_URL`: the
session routes, token verification in `/api/*`, the openid-client demos and `/agents`. Browser code can't read it,
though, and [`src/app/client-layout.tsx`](./src/app/client-layout.tsx) doesn't pass `auth_server_url` to the
generated `AuthProvider`. So the `/auth/*` pages send the browser to the default auth server for
`SCHEMAVAULTS_APP_ENVIRONMENT` (`https://auth.schemavaults.com` in `production`). To fix it, resolve
`getSchemaVaultsAuthServerUrl()` from `@schemavaults/auth-server-sdk` in [`src/app/layout.tsx`](./src/app/layout.tsx)
and pass it through `ClientLayout` as the provider's `auth_server_url` prop.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Every page and `/api/health` answer 500; the logs say `NODE_ENV is set to 'production', but SCHEMAVAULTS_APP_ENVIRONMENT environment variable is not defined!` | Set `SCHEMAVAULTS_APP_ENVIRONMENT`, then redeploy. |
| Every page answers 500; the logs say `Environment variable 'SCHEMAVAULTS_API_SERVER_ID' is not set!` (or `SCHEMAVAULTS_CLIENT_APP_ID`) | Set both ids, then redeploy. |
| `/openid-client*/login` fails; the logs say `No SCHEMAVAULTS_AUTH_SERVER_URL configured and no default auth server URL for environment 'production'!` | Set `SCHEMAVAULTS_AUTH_SERVER_URL`. |
| `/api/*` calls with a token answer 500 `auth_not_configured`: `... the 'SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY' environment variable is not set` | Set the [private key](#the-private-key), then redeploy. |
| `/api/*` calls with a token answer 500 `auth_not_configured`: `... does not hold a usable private key`; the logs say `Failed to load the JWKS access private key ...`, e.g. `Failed to determine what format the key ... is in!` for a trailing newline | Re-enter the key in one of the [accepted formats](#the-private-key). |
| The auth server refuses the sign-in because the redirect URI is not allowed | Callback URLs must match exactly (scheme, host, path), and be registered for the auth server's own environment. A new domain or a preview URL needs its own. |
| `/.well-known/oauth-protected-resource` answers 404 | Expected while `SCHEMAVAULTS_RESOURCE_URL` is unset. |
| The install fails in Cypress's postinstall | Set `CYPRESS_INSTALL_BINARY=0` on the project. |
