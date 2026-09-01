import "server-only";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { OIDC_SUPPORTED_SCOPES } from "@schemavaults/auth-common";
import { getAuthServerUri } from "@/lib/auth_server_uri";

/**
 * OpenID Provider Metadata (OIDC Discovery 1.0 §3) served at
 * /.well-known/openid-configuration (rewritten in next.config.ts to
 * /api/oidc/openid-configuration).
 *
 * `issuer` MUST be byte-identical to the `iss` claim in id_tokens —
 * both derive from getAuthServerUrl()/getAuthServerUri(), which never
 * emits a trailing slash.
 */
export interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  introspection_endpoint: string;
  jwks_uri: string;
  response_types_supported: readonly string[];
  response_modes_supported: readonly string[];
  grant_types_supported: readonly string[];
  subject_types_supported: readonly string[];
  id_token_signing_alg_values_supported: readonly string[];
  scopes_supported: readonly string[];
  token_endpoint_auth_methods_supported: readonly string[];
  introspection_endpoint_auth_methods_supported: readonly string[];
  code_challenge_methods_supported: readonly string[];
  claims_supported: readonly string[];
  authorization_response_iss_parameter_supported: boolean;
  request_parameter_supported: boolean;
  request_uri_parameter_supported: boolean;
}

export function buildOidcDiscoveryDocument(
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): OidcDiscoveryDocument {
  const issuer: string = getAuthServerUri(environment);
  return {
    issuer,
    authorization_endpoint: `${issuer}/api/oidc/authorize`,
    token_endpoint: `${issuer}/api/oidc/token`,
    userinfo_endpoint: `${issuer}/api/oidc/userinfo`,
    introspection_endpoint: `${issuer}/api/oidc/introspect`,
    jwks_uri: `${issuer}/api/oidc/jwks`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: OIDC_SUPPORTED_SCOPES,
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
    authorization_response_iss_parameter_supported: true,
    // Request Objects (JAR, OIDC Core §6 / RFC 9101) are not implemented;
    // the authorize endpoint rejects `request`/`request_uri` with
    // request_not_supported / request_uri_not_supported (see
    // validate-authorize-request.ts). Declared explicitly because OIDC
    // Discovery §3 defaults request_uri_parameter_supported to TRUE when
    // omitted — leaving it out would falsely advertise support.
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
  };
}

export default buildOidcDiscoveryDocument;
