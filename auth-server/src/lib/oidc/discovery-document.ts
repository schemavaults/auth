import "server-only";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  buildOidcProviderMetadata,
  type OidcProviderMetadata,
} from "@schemavaults/auth-common";
import { getAuthServerUri } from "@/lib/auth_server_uri";

/**
 * OpenID Provider Metadata (OIDC Discovery 1.0 §3) served at
 * /.well-known/openid-configuration and the RFC 8414 path
 * /.well-known/oauth-authorization-server (both rewritten in
 * next.config.ts to /api/oidc/openid-configuration).
 *
 * The document itself is built by `buildOidcProviderMetadata` in
 * `@schemavaults/auth-common`, which `@schemavaults/auth-client-sdk`
 * also feeds to `openid-client` as its server metadata — so what the
 * server advertises and what the SDK assumes can never drift. This
 * module only resolves the deployment's issuer identifier.
 *
 * `issuer` MUST be byte-identical to the `iss` claim in id_tokens —
 * both derive from getAuthServerUrl()/getAuthServerUri(), which never
 * emits a trailing slash.
 */
export type OidcDiscoveryDocument = OidcProviderMetadata;

export function buildOidcDiscoveryDocument(
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): OidcDiscoveryDocument {
  return buildOidcProviderMetadata(getAuthServerUri(environment));
}

export default buildOidcDiscoveryDocument;
