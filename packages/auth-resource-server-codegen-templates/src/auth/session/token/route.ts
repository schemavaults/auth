import { createAuthSessionTokenRoute } from "@schemavaults/auth-server-sdk/auth-session-route";

// POST /auth/session/token — one of the app's auth session routes (with
// ../whoami and ../logout). The auth provider sends the SDK's token requests
// here; this route forwards them to the auth server and keeps the refresh
// token in an HTTP-only cookie on this app's own domain: page scripts can
// never read it, and as a first-party cookie it works in browsers that block
// third-party cookies (Safari, every iOS browser).
//
// Reads SCHEMAVAULTS_CLIENT_APP_ID, SCHEMAVAULTS_APP_ENVIRONMENT and
// (optionally) SCHEMAVAULTS_AUTH_SERVER_URL.
export const { POST } = createAuthSessionTokenRoute();

export const dynamic = "force-dynamic";
