import { createAuthSessionRouteHandler } from "@schemavaults/auth-server-sdk/auth-session-route";

// The app's auth session route (/auth/session/token, /whoami, /logout).
// The auth provider sends the SDK's token, whoami and logout requests here,
// and this route forwards them to the auth server, keeping the refresh
// token in an HTTP-only cookie on this app's own domain: page scripts can
// never read it, and as a first-party cookie it works in browsers that
// block third-party cookies (Safari, every iOS browser).
//
// Reads SCHEMAVAULTS_CLIENT_APP_ID, SCHEMAVAULTS_APP_ENVIRONMENT and
// (optionally) SCHEMAVAULTS_AUTH_SERVER_URL.
const handler = createAuthSessionRouteHandler();

export { handler as GET, handler as POST };

export const dynamic = "force-dynamic";
