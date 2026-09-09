/**
 * OpenID Provider Metadata (OIDC Discovery 1.0 §3 / RFC 8414) for the
 * auth server, as a pure function of its issuer identifier.
 *
 * Single source of truth consumed by BOTH ends of the protocol:
 *   - the auth server serves it verbatim at
 *     /.well-known/openid-configuration, and
 *   - `@schemavaults/auth-client-sdk` hands the same object to
 *     `openid-client` as its server metadata instead of fetching the
 *     document (so the SDK can never drift from what the server
 *     advertises — a change here changes both sides together).
 *
 * `issuer` MUST be byte-identical to the `iss` claim in id_tokens and
 * the `iss` authorization-response parameter — both derive from the auth
 * server URL, which never carries a trailing slash.
 */

import { getOidcEndpointUrl } from "./endpoints";
import { OIDC_SUPPORTED_SCOPES } from "./scope";

/**
 * The advertised metadata. List fields are plain mutable arrays because
 * that is how `openid-client` types its `ServerMetadata`; treat them as
 * read-only in practice (every call builds a fresh document). Declared
 * as a type alias (not an interface) so it carries the implicit index
 * signature `openid-client`'s metadata type requires.
 */
export type OidcProviderMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  introspection_endpoint: string;
  jwks_uri: string;
  response_types_supported: string[];
  response_modes_supported: string[];
  grant_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  scopes_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  introspection_endpoint_auth_methods_supported: string[];
  code_challenge_methods_supported: string[];
  claims_supported: string[];
  authorization_response_iss_parameter_supported: boolean;
  request_parameter_supported: boolean;
  request_uri_parameter_supported: boolean;
};

/**
 * Builds the provider metadata for the auth server at `issuer`. A
 * trailing slash on `issuer` is stripped so the endpoints and the
 * `issuer` field stay consistent with the `iss` claim.
 */
export function buildOidcProviderMetadata(
  issuer: string,
): OidcProviderMetadata {
  if (typeof issuer !== "string" || issuer.length === 0) {
    throw new TypeError("Expected 'issuer' to be a non-empty string!");
  }
  const normalized_issuer: string = issuer.endsWith("/")
    ? issuer.slice(0, -1)
    : issuer;

  return {
    issuer: normalized_issuer,
    authorization_endpoint: getOidcEndpointUrl(normalized_issuer, "authorization"),
    token_endpoint: getOidcEndpointUrl(normalized_issuer, "token"),
    userinfo_endpoint: getOidcEndpointUrl(normalized_issuer, "userinfo"),
    introspection_endpoint: getOidcEndpointUrl(
      normalized_issuer,
      "introspection",
    ),
    jwks_uri: getOidcEndpointUrl(normalized_issuer, "jwks"),
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: [...OIDC_SUPPORTED_SCOPES],
    // Apps without a registered client secret are public clients
    // ("none"); apps with one are confidential clients and must
    // authenticate via client_secret_basic or client_secret_post.
    // PKCE S256 is mandatory for every client either way.
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_basic",
      "client_secret_post",
    ],
    // RFC 7662 token introspection (advertised per RFC 8414 §2). "none"
    // is deliberately absent: §2.1 requires the endpoint to be
    // authorized, so only confidential clients may introspect.
    introspection_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
    ],
    code_challenge_methods_supported: ["S256"],
    claims_supported: [
      "sub",
      "iss",
      "aud",
      "exp",
      "iat",
      "nonce",
      "email",
      "email_verified",
      // Profile-scoped claims (OIDC Core §5.1), derived from the user's
      // stored profile name fields; emitted only when set.
      "name",
      "given_name",
      "middle_name",
      "family_name",
      "preferred_username",
    ],
    // RFC 9207: the auth server puts `iss` on every authorization
    // response. Advertising it makes spec-compliant clients (including
    // the platform SDK via openid-client) require and verify it on
    // redirect callbacks — authorization-server mix-up protection.
    authorization_response_iss_parameter_supported: true,
    // Request Objects (JAR, OIDC Core §6 / RFC 9101) are not implemented;
    // the authorize endpoint rejects `request`/`request_uri` with
    // request_not_supported / request_uri_not_supported. Declared
    // explicitly because OIDC Discovery §3 defaults
    // request_uri_parameter_supported to TRUE when omitted — leaving it
    // out would falsely advertise support.
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
  };
}

export default buildOidcProviderMetadata;
