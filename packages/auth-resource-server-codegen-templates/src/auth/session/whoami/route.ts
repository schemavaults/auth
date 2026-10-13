import { createAuthSessionWhoamiRoute } from "@schemavaults/auth-server-sdk/auth-session-route";

// GET /auth/session/whoami — the signed-in user, loaded from the auth
// server with the refresh token this app's session cookie holds (see
// ../token/route.ts).
export const { GET } = createAuthSessionWhoamiRoute();

export const dynamic = "force-dynamic";
