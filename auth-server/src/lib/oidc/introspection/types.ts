import "server-only";
import type { ApiServerId, AppId } from "@schemavaults/app-definitions";
import type { CustomJWTPayload } from "@schemavaults/jwt";

/**
 * RFC 7662 §2.2 introspection response. An inactive token yields the
 * bare `{ active: false }` object — §2.2 says the server SHOULD NOT
 * include any other members, so callers cannot distinguish "expired"
 * from "revoked" from "not ours" and learn nothing about tokens they
 * were not issued.
 */
export type OidcIntrospectionResponseBody =
  | { active: false }
  | {
      active: true;
      /**
       * Space-delimited granted scopes; absent when the token was minted
       * for a plain OAuth 2.1 grant (nothing granted) — RFC 7662 §2.2
       * makes `scope` OPTIONAL.
       */
      scope?: string;
      client_id: AppId;
      /** The resource owner's email; only when the `email` scope was granted. */
      username?: string;
      /** RFC 6749 §7.1 token type — present for access tokens only. */
      token_type?: "Bearer";
      exp: number;
      iat: number;
      /** OIDC subject `<auth_server_app_id>|<uid>`. */
      sub: string;
      /** The platform user id (the uid inside `sub`). */
      uid: string;
      aud: string;
      iss: string;
      jti?: string;
    };

export type ActiveOidcIntrospectionResponseBody = Extract<
  OidcIntrospectionResponseBody,
  { active: true }
>;

/** The one inactive answer, whatever the reason (§2.2). */
export const INACTIVE_INTROSPECTION_RESPONSE = {
  active: false,
} as const satisfies OidcIntrospectionResponseBody;

/**
 * Who is introspecting, as established by client authentication:
 *  - a confidential client app (client secret), which may introspect the
 *    OIDC-surface tokens issued to it;
 *  - an API server (`private_key_jwt` with its JWKS access key), which may
 *    introspect the access tokens minted for it.
 */
export type OidcIntrospectionCaller =
  | { kind: "client_app"; client_app_id: AppId }
  | { kind: "api_server"; api_server_id: ApiServerId };

export type IntrospectableTokenKind = "access" | "refresh";

/** A token that verified and that the caller may see. */
export interface DecodedIntrospectableToken {
  kind: IntrospectableTokenKind;
  payload: CustomJWTPayload;
}
