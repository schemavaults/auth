import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import * as oidc from "openid-client";
import { revokeToken } from "@schemavaults/auth-server-sdk";
import { discoverAuthServer, getPublicOrigin } from "@/lib/openid-client-demo/config";
import { AGENTS_SIGN_IN_SCOPE } from "../scopes";
import { agentsState, type AgentAppUser } from "../runtime/state";
import {
  AGENTS_COOKIE_PATH,
  AGENTS_SESSION_COOKIE,
  agentsApiServerId,
  agentsClientCredentials,
} from "./agents-client";

const PKCE_COOKIE = "example_agents_pkce_verifier";
const STATE_COOKIE = "example_agents_state";
const NONCE_COOKIE = "example_agents_nonce";
const TRANSIENT_COOKIE_MAX_AGE = 60 * 10;
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 8;

function cookieOptions(origin: string, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https:"),
    path: AGENTS_COOKIE_PATH,
    maxAge,
  } as const;
}

/**
 * GET /agents/login: the authorization code flow (PKCE, state, nonce) as the
 * confidential client, for the example API (`resource`) with the scopes an
 * agent may be given. The user consents to each on the auth server.
 */
export async function handleAgentsLogin(request: NextRequest): Promise<NextResponse> {
  const config = await discoverAuthServer("confidential");
  const code_verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const origin = getPublicOrigin(request);

  const authorizationUrl = oidc.buildAuthorizationUrl(config, {
    redirect_uri: `${origin}${AGENTS_COOKIE_PATH}/callback`,
    scope: AGENTS_SIGN_IN_SCOPE,
    resource: agentsApiServerId(),
    state,
    nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(code_verifier),
    code_challenge_method: "S256",
  });

  const response = NextResponse.redirect(authorizationUrl, 302);
  const options = cookieOptions(origin, TRANSIENT_COOKIE_MAX_AGE);
  response.cookies.set(PKCE_COOKIE, code_verifier, options);
  response.cookies.set(STATE_COOKIE, state, options);
  response.cookies.set(NONCE_COOKIE, nonce, options);
  return response;
}

/**
 * GET /agents/callback: redeems the code (client_secret_basic + PKCE, for the
 * example API), keeps the user's tokens server-side and gives the browser an
 * opaque session cookie.
 */
export async function handleAgentsCallback(request: NextRequest): Promise<NextResponse> {
  const pkceCodeVerifier = request.cookies.get(PKCE_COOKIE)?.value;
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const expectedNonce = request.cookies.get(NONCE_COOKIE)?.value;
  if (!pkceCodeVerifier || !expectedState || !expectedNonce) {
    return NextResponse.json(
      { error: "agents_sign_in_failed", error_description: "Start signing in at /agents/login." },
      { status: 400 },
    );
  }

  const origin = getPublicOrigin(request);
  const config = await discoverAuthServer("confidential");
  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(
      config,
      new URL(`${origin}${AGENTS_COOKIE_PATH}/callback${request.nextUrl.search}`),
      { pkceCodeVerifier, expectedState, expectedNonce, idTokenExpected: true },
      { resource: agentsApiServerId() },
    );
  } catch (e: unknown) {
    console.error("[agents] Authorization code grant failed", e);
    return NextResponse.json(
      {
        error: "agents_sign_in_failed",
        error_description: e instanceof Error ? e.message : String(e),
      },
      { status: 400 },
    );
  }
  const claims = tokens.claims();
  if (!claims) {
    return NextResponse.json(
      { error: "agents_sign_in_failed", error_description: "No id_token in the token response." },
      { status: 400 },
    );
  }

  const user: AgentAppUser = {
    id: crypto.randomUUID(),
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    access_token: tokens.access_token,
    access_token_expires_at: Date.now() + (tokens.expires_in ?? 60) * 1000,
    refresh_token: tokens.refresh_token ?? null,
    scope: tokens.scope ?? "",
  };
  agentsState().users.set(user.id, user);

  const response = NextResponse.redirect(new URL(`${origin}${AGENTS_COOKIE_PATH}`), 303);
  for (const transient of [PKCE_COOKIE, STATE_COOKIE, NONCE_COOKIE]) {
    response.cookies.set(transient, "", cookieOptions(origin, 0));
  }
  response.cookies.set(AGENTS_SESSION_COOKIE, user.id, cookieOptions(origin, SESSION_COOKIE_MAX_AGE));
  return response;
}

/**
 * POST /agents/logout: revokes the sign-in's refresh token (RFC 7009). The
 * auth server then revokes every token of this sign-in, including the
 * delegated tokens the agents were given in exchange for them, so signing
 * out cuts off the user's agents too without the app tracking their tokens.
 */
export async function handleAgentsLogout(request: NextRequest): Promise<NextResponse> {
  const sessionId = request.cookies.get(AGENTS_SESSION_COOKIE)?.value;
  const user = sessionId ? agentsState().users.get(sessionId) : undefined;
  if (user) {
    agentsState().users.delete(user.id);
    if (user.refresh_token) {
      try {
        await revokeToken({
          ...agentsClientCredentials(),
          token: user.refresh_token,
          token_type_hint: "refresh_token",
        });
      } catch (e: unknown) {
        console.error("[agents] Revoking the refresh token at sign-out failed", e);
      }
    }
  }
  const origin = getPublicOrigin(request);
  const response = NextResponse.redirect(new URL(`${origin}${AGENTS_COOKIE_PATH}`), 303);
  response.cookies.set(AGENTS_SESSION_COOKIE, "", cookieOptions(origin, 0));
  return response;
}

/**
 * The user's access token for the example API, renewed with the refresh
 * grant (as the confidential client, for the same `resource`) when it is
 * about to expire. Each agent session exchanges this token for its own.
 */
export async function freshUserAccessToken(user: AgentAppUser): Promise<string> {
  if (user.access_token_expires_at - Date.now() > 2 * 60 * 1000 || !user.refresh_token) {
    return user.access_token;
  }
  const config = await discoverAuthServer("confidential");
  const tokens = await oidc.refreshTokenGrant(config, user.refresh_token, {
    resource: agentsApiServerId(),
  });
  user.access_token = tokens.access_token;
  user.access_token_expires_at = Date.now() + (tokens.expires_in ?? 60) * 1000;
  user.refresh_token = tokens.refresh_token ?? user.refresh_token;
  return user.access_token;
}
