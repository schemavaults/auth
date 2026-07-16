// openid-client-demo
//
// Shared configuration for the standard-OIDC sign-in demo that talks to
// the auth server with the off-the-shelf `openid-client` npm package
// (https://github.com/panva/openid-client) against the spec surface
// (/.well-known/openid-configuration + /api/oidc/*).
//
// This module (and the /openid-client/* routes that consume it)
// deliberately imports NOTHING from the @schemavaults/auth-* SDKs: the
// point of the flow — and of the E2E suite that drives it — is to prove
// that a third-party relying party using only a generic, spec-compliant
// OIDC client library can sign users in to the auth server.

import "server-only";
import * as oidc from "openid-client";
import type { NextRequest } from "next/server";

/**
 * Transient cookies binding the authorize redirect to the callback
 * (PKCE code_verifier per RFC 7636, `state` per RFC 6749 §10.12 and
 * `nonce` per OIDC Core §3.1.2.1).
 */
export const PKCE_VERIFIER_COOKIE = "openid_client_demo_pkce_verifier";
export const STATE_COOKIE = "openid_client_demo_state";
export const NONCE_COOKIE = "openid_client_demo_nonce";

/** Session cookie holding the signed-in identity after the callback. */
export const SESSION_COOKIE = "openid_client_demo_session";

/** Cookie path shared by the /openid-client/* routes. */
export const COOKIE_PATH = "/openid-client";

export const LOGIN_PATH = "/openid-client/login";
export const CALLBACK_PATH = "/openid-client/callback";
export const PROFILE_PATH = "/openid-client/profile";

/** Identity established by the openid-client sign-in flow. */
export interface OpenidClientDemoSession {
  /** `sub` claim from the validated id_token. */
  sub: string;
  /** `iss` claim from the validated id_token. */
  iss: string;
  /** `aud` claim from the validated id_token (the RP's client_id). */
  aud: string | string[];
  /** Claims returned by the OIDC userinfo endpoint. */
  userinfo: {
    sub: string;
    email?: string;
    email_verified?: boolean;
  };
}

/**
 * The auth server's OIDC Issuer Identifier. Overridable via
 * SCHEMAVAULTS_AUTH_SERVER_URL, with per-environment defaults matching
 * the docker-compose test network and the local dev auth server.
 */
function getIssuerUrl(): URL {
  const fromEnv: string | undefined = process.env.SCHEMAVAULTS_AUTH_SERVER_URL;
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return new URL(fromEnv);
  }
  const environment: string =
    process.env.SCHEMAVAULTS_APP_ENVIRONMENT ?? "development";
  switch (environment) {
    case "test":
      return new URL("http://schemavaults-auth");
    case "development":
      return new URL("http://localhost:6767");
    default:
      throw new Error(
        `No SCHEMAVAULTS_AUTH_SERVER_URL configured and no default auth server URL for environment '${environment}'!`,
      );
  }
}

/** The RP's client_id — the app id seeded/registered on the auth server. */
function getClientId(): string {
  const client_id: string | undefined = process.env.SCHEMAVAULTS_CLIENT_APP_ID;
  if (typeof client_id !== "string" || client_id.length === 0) {
    throw new Error(
      "Missing SCHEMAVAULTS_CLIENT_APP_ID environment variable (the OIDC client_id for the openid-client demo)!",
    );
  }
  return client_id;
}

/**
 * Discovers the auth server's OIDC provider metadata from its
 * /.well-known/openid-configuration document and returns an
 * openid-client Configuration for this RP.
 *
 * The auth server only supports public clients (there are no client
 * secrets on the platform; PKCE S256 is mandatory), so token endpoint
 * authentication is `none`. `allowInsecureRequests` is applied for
 * plain-HTTP issuers (the docker-compose test network / local dev) —
 * openid-client refuses non-TLS endpoints otherwise.
 */
export async function discoverAuthServer(): Promise<oidc.Configuration> {
  const issuer: URL = getIssuerUrl();
  return await oidc.discovery(issuer, getClientId(), undefined, oidc.None(), {
    execute: issuer.protocol === "http:" ? [oidc.allowInsecureRequests] : [],
  });
}

/**
 * The origin this app is publicly reachable at, derived from the
 * incoming request so the redirect_uri built at authorize time is
 * byte-identical to the one the callback derives for the token
 * exchange (and to the origin registered for the app on the auth
 * server).
 */
export function getPublicOrigin(request: NextRequest): string {
  const host: string | null = request.headers.get("host");
  if (!host) {
    throw new Error(
      "Missing Host header; cannot derive the openid-client demo redirect_uri!",
    );
  }
  const proto: string = request.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
