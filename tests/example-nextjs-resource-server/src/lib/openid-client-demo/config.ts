// openid-client-demo/config.ts
//
// Shared configuration for the standard-OIDC sign-in demos that talk to
// the auth server with the off-the-shelf `openid-client` npm package
// (https://github.com/panva/openid-client) against the spec surface
// (/.well-known/openid-configuration + /api/oidc/*).
//
// This module (and the route trees that consume it) deliberately
// imports NOTHING from the @schemavaults/auth-* SDKs: the point of the
// flow — and of the E2E suite that drives it — is to prove that a
// third-party relying party using only a generic, spec-compliant OIDC
// client library can sign users in to the auth server.
//
// Two variants of the same flow are wired up, so the E2E suite covers
// both of the auth server's client types:
//
//  - "public"       -> /openid-client/*              (PKCE only, token
//                                                     endpoint auth
//                                                     method `none`)
//  - "confidential" -> /openid-client-confidential/*  (PKCE *and* a
//                                                     registered client
//                                                     secret, sent with
//                                                     client_secret_basic)

import "server-only";
import * as oidc from "openid-client";
import type { NextRequest } from "next/server";

/** Which of the two demo relying parties a request belongs to. */
export type OpenidClientDemoVariant = "public" | "confidential";

/**
 * Everything that differs between the public and confidential demo
 * relying parties: their route tree, the cookies scoped to it, and the
 * `data-testid` prefix their profile page renders.
 */
export interface OpenidClientDemoConfig {
  variant: OpenidClientDemoVariant;
  /**
   * Transient cookies binding the authorize redirect to the callback
   * (PKCE code_verifier per RFC 7636, `state` per RFC 6749 §10.12 and
   * `nonce` per OIDC Core §3.1.2.1).
   */
  pkceVerifierCookie: string;
  stateCookie: string;
  nonceCookie: string;
  /** Session cookie holding the signed-in identity after the callback. */
  sessionCookie: string;
  /** Cookie path shared by this variant's routes. */
  cookiePath: string;
  loginPath: string;
  callbackPath: string;
  profilePath: string;
  /** Prefix of the profile page's `data-testid` attributes. */
  testIdPrefix: string;
}

const PUBLIC_CLIENT_DEMO_CONFIG: OpenidClientDemoConfig = {
  variant: "public",
  pkceVerifierCookie: "openid_client_demo_pkce_verifier",
  stateCookie: "openid_client_demo_state",
  nonceCookie: "openid_client_demo_nonce",
  sessionCookie: "openid_client_demo_session",
  cookiePath: "/openid-client",
  loginPath: "/openid-client/login",
  callbackPath: "/openid-client/callback",
  profilePath: "/openid-client/profile",
  testIdPrefix: "openid-client",
};

const CONFIDENTIAL_CLIENT_DEMO_CONFIG: OpenidClientDemoConfig = {
  variant: "confidential",
  pkceVerifierCookie: "openid_client_confidential_demo_pkce_verifier",
  stateCookie: "openid_client_confidential_demo_state",
  nonceCookie: "openid_client_confidential_demo_nonce",
  sessionCookie: "openid_client_confidential_demo_session",
  cookiePath: "/openid-client-confidential",
  loginPath: "/openid-client-confidential/login",
  callbackPath: "/openid-client-confidential/callback",
  profilePath: "/openid-client-confidential/profile",
  testIdPrefix: "openid-client-confidential",
};

export function getOpenidClientDemoConfig(
  variant: OpenidClientDemoVariant,
): OpenidClientDemoConfig {
  return variant === "confidential"
    ? CONFIDENTIAL_CLIENT_DEMO_CONFIG
    : PUBLIC_CLIENT_DEMO_CONFIG;
}

/** Identity established by an openid-client sign-in flow. */
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

function requireEnv(name: string, purpose: string): string {
  const value: string | undefined = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Missing ${name} environment variable (${purpose} for the openid-client demo)!`,
    );
  }
  return value;
}

/** The RP's client_id — the app id seeded/registered on the auth server. */
function getClientId(variant: OpenidClientDemoVariant): string {
  if (variant === "confidential") {
    return requireEnv(
      "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID",
      "the OIDC client_id of the confidential client",
    );
  }
  return requireEnv(
    "SCHEMAVAULTS_CLIENT_APP_ID",
    "the OIDC client_id of the public client",
  );
}

/**
 * The client authentication method this variant uses at the token
 * endpoint.
 *
 * Public clients register no secret and authenticate with `none` (PKCE
 * S256 is the binding, and is mandatory for every client). Confidential
 * clients have a client secret registered on the auth server and must
 * present it on every token request; `client_secret_basic` (an HTTP
 * Basic Authorization header, RFC 6749 §2.3.1) is the most common
 * real-world default, and is one of the two methods the auth server
 * advertises in `token_endpoint_auth_methods_supported` alongside
 * `client_secret_post`.
 */
function getClientAuthentication(
  variant: OpenidClientDemoVariant,
): oidc.ClientAuth {
  if (variant === "confidential") {
    return oidc.ClientSecretBasic(
      requireEnv(
        "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_SECRET",
        "the client secret of the confidential client",
      ),
    );
  }
  return oidc.None();
}

/**
 * Discovers the auth server's OIDC provider metadata from its
 * /.well-known/openid-configuration document and returns an
 * openid-client Configuration for the given demo relying party.
 *
 * `allowInsecureRequests` is applied for plain-HTTP issuers (the
 * docker-compose test network / local dev) — openid-client refuses
 * non-TLS endpoints otherwise.
 */
export async function discoverAuthServer(
  variant: OpenidClientDemoVariant,
): Promise<oidc.Configuration> {
  const issuer: URL = getIssuerUrl();
  return await oidc.discovery(
    issuer,
    getClientId(variant),
    undefined,
    getClientAuthentication(variant),
    {
      execute: issuer.protocol === "http:" ? [oidc.allowInsecureRequests] : [],
    },
  );
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
