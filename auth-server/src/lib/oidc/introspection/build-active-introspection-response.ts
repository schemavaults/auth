import "server-only";
import type { AppId } from "@schemavaults/app-definitions";
import {
  accessTokenExpiry,
  formatOidcSubClaim,
  partitionGrantedScopes,
  refreshTokenExpiry,
} from "@schemavaults/auth-common";
import { toOidcIntrospectionActor } from "./introspection-actor";
import type {
  ActiveOidcIntrospectionResponseBody,
  DecodedIntrospectableToken,
} from "./types";

export interface BuildActiveIntrospectionResponseOptions {
  token: DecodedIntrospectableToken;
  /** Prefixes the OIDC `sub`. */
  auth_server_app_id: AppId;
  /** The `iss` to report: the auth server URL. */
  issuer: string;
}

/** The RFC 7662 §2.2 metadata of an active token. */
export function buildActiveIntrospectionResponse({
  token: { kind, payload },
  auth_server_app_id,
  issuer,
}: BuildActiveIntrospectionResponseOptions): ActiveOidcIntrospectionResponseBody {
  // The granted scope is reported as-is (RFC 7662 §2.2 `scope` is
  // OPTIONAL): its OIDC scopes and the API scopes of the API server the
  // token was minted for. A token minted for a plain OAuth 2.1 grant
  // carries none and is every bit as active as an OpenID one.
  const { oidc, api } = partitionGrantedScopes(payload.scope);
  const granted: string[] = (payload.scope ?? "")
    .split(" ")
    .filter(
      (token, index, all) =>
        all.indexOf(token) === index &&
        ((oidc as readonly string[]).includes(token) || api.includes(token)),
    );

  // `exp` is the token's own (decodeJWT reports it since jwt 0.17.0): a
  // delegated token can expire before iat + the per-type validity. The
  // reconstruction is a fallback for a payload without it, the window
  // decodeJWT enforces via maxTokenAge anyway.
  const validity_seconds: number =
    kind === "access" ? accessTokenExpiry : refreshTokenExpiry;

  return {
    active: true,
    ...(granted.length > 0 ? { scope: granted.join(" ") } : {}),
    client_id: payload.app,
    exp: payload.exp ?? payload.iat + validity_seconds,
    iat: payload.iat,
    // OIDC-facing `<auth_server_app_id>|<uid>` form, matching the
    // id_token and userinfo `sub` for the same user.
    sub: formatOidcSubClaim(auth_server_app_id, payload.uid),
    uid: payload.uid,
    aud: payload.aud,
    iss: issuer,
    ...(kind === "access" ? { token_type: "Bearer" as const } : {}),
    ...(payload.jti ? { jti: payload.jti } : {}),
    ...((oidc as readonly string[]).includes("email")
      ? { username: payload.email }
      : {}),
    // Who is calling, as far as the token says: introspecting resource
    // servers must learn what local verification learns (the server SDK
    // exposes both claims), or a machine or an agent would pass for the
    // user. A machine subject (client_credentials) is flagged...
    ...(payload.service_account === true
      ? { service_account: true as const }
      : {}),
    // ...and a delegated token names its actor (RFC 8693 §4.1: `act` MAY
    // appear in introspection responses), the current one outermost.
    ...(payload.act
      ? { act: toOidcIntrospectionActor(payload.act, auth_server_app_id) }
      : {}),
  };
}

export default buildActiveIntrospectionResponse;
