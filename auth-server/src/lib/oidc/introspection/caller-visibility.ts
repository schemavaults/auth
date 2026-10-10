import "server-only";
import {
  OIDC_USERINFO_AUDIENCE_ID,
  getApiServerIdForTokenAudience,
  type ApiServerId,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { isResourceUrlAudience } from "@schemavaults/auth-common";
import type { CustomJWTPayload } from "@schemavaults/jwt";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import type { IntrospectableTokenKind, OidcIntrospectionCaller } from "./types";

// Which tokens each kind of caller may introspect. These rules are what keep
// one caller from probing another's tokens, so they live apart from the
// decoding and revocation machinery.

/**
 * How to verify a token the caller may see: the token kind, the audience id
 * its keyset is stored under, and (for access tokens) the `aud` the token
 * must carry.
 */
export type IntrospectionDecodePlan =
  | {
      kind: Extract<IntrospectableTokenKind, "access">;
      keyset_audience_id: ApiServerId;
      expected_audience: string;
    }
  | {
      kind: Extract<IntrospectableTokenKind, "refresh">;
      keyset_audience_id: ApiServerId;
    };

export interface ResolveIntrospectionDecodePlanOptions {
  caller: OidcIntrospectionCaller;
  /** The audience named in the token header (not yet verified). */
  token_audience: string;
  environment: SchemaVaultsAppEnvironment;
  auth_server_app_id?: AppId;
}

/**
 * Picks how to verify a token for the caller from the audience named in its
 * header, or returns null when the caller may not see tokens of that
 * audience.
 *
 *  - A client app introspects the OIDC surface's tokens: access tokens minted
 *    for the reserved `oidc-userinfo` audience (opaque to the RP; redeemable
 *    at /api/oidc/userinfo) and refresh tokens minted for the auth server's
 *    own audience. Tokens for resource-API audiences belong to those API
 *    servers. An ACCESS token for the auth server's audience is first-party
 *    only; decoded as a refresh token it fails the type check in
 *    `@schemavaults/jwt` and so reads as inactive, never as a refresh token.
 *  - An API server introspects the access tokens minted for it: its id as
 *    the audience, or an RFC 8707 resource URL that resolved to it at
 *    issuance. Either way the token is decrypted with the caller's own
 *    keyset, and keysets are looked up by (audience, keyset id), so another
 *    API server's token fails to decrypt. The auth server's own tokens never
 *    belong to an API server.
 */
export function resolveIntrospectionDecodePlan({
  caller,
  token_audience,
  environment,
  auth_server_app_id = getAuthServerAppId(),
}: ResolveIntrospectionDecodePlanOptions): IntrospectionDecodePlan | null {
  const is_userinfo_audience: boolean =
    token_audience === OIDC_USERINFO_AUDIENCE_ID;
  const is_auth_server_audience: boolean =
    getApiServerIdForTokenAudience(token_audience, environment) ===
    auth_server_app_id;

  if (caller.kind === "client_app") {
    if (is_userinfo_audience) {
      return {
        kind: "access",
        keyset_audience_id: OIDC_USERINFO_AUDIENCE_ID,
        expected_audience: OIDC_USERINFO_AUDIENCE_ID,
      };
    }
    if (is_auth_server_audience) {
      return { kind: "refresh", keyset_audience_id: auth_server_app_id };
    }
    return null;
  }

  if (is_userinfo_audience || is_auth_server_audience) {
    return null;
  }
  if (
    token_audience !== caller.api_server_id &&
    !isResourceUrlAudience(token_audience, environment)
  ) {
    return null;
  }
  return {
    kind: "access",
    keyset_audience_id: caller.api_server_id,
    expected_audience: token_audience,
  };
}

/**
 * Whether a verified token was issued to the caller. A client app may only
 * see its own tokens (`app` claim) — a confidential client can never probe
 * another client's. For an API server, decrypting with its own keyset
 * already proved the token was minted for it.
 */
export function isTokenIssuedToCaller(
  caller: OidcIntrospectionCaller,
  payload: Pick<CustomJWTPayload, "app">,
): boolean {
  return caller.kind === "api_server" || payload.app === caller.client_app_id;
}
