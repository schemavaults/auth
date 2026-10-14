import { createAuthSessionLogoutRoute } from "@schemavaults/auth-server-sdk/auth-session-route";

// POST /auth/session/logout — revokes the session at the auth server and
// clears this app's session cookie (see ../token/route.ts).
export const { POST } = createAuthSessionLogoutRoute();

export const dynamic = "force-dynamic";
