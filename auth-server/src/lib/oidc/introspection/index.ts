import "server-only";

/**
 * RFC 7662 token introspection (`POST /api/oidc/introspect`):
 *
 *   - client-authentication/: who is asking — parse the request and verify
 *     its client secret (client apps) or `private_key_jwt` assertion (API
 *     servers)
 *   - introspect-oidc-token.ts: what the caller learns, chaining the steps
 *     below
 *   - caller-visibility.ts: which tokens each caller (client app / API
 *     server) may see — pure rules
 *   - decode-introspectable-token.ts: verify the token with the keyset the
 *     caller's rules name
 *   - is-introspected-token-active.ts: revocation, consent and app-to-API
 *     connection checks
 *   - build-active-introspection-response.ts: the §2.2 metadata — pure
 */

export {
  authenticateApiServer,
  authenticateClientApp,
  authenticateIntrospectionCaller,
  getUnverifiedAssertionIssuer,
  invalidIntrospectionClient,
  invalidIntrospectionRequest,
  parseIntrospectionRequest,
} from "./client-authentication";
export type {
  AuthenticateApiServerOptions,
  AuthenticateClientAppOptions,
  AuthenticateIntrospectionCallerResult,
  IntrospectionClientCredentials,
  IntrospectionRequestError,
  ParsedIntrospectionRequest,
  ParseIntrospectionRequestResult,
} from "./client-authentication";

export { introspectOidcToken } from "./introspect-oidc-token";
export type { IntrospectOidcTokenOptions } from "./introspect-oidc-token";

export {
  isTokenIssuedToCaller,
  resolveIntrospectionDecodePlan,
} from "./caller-visibility";
export type {
  IntrospectionDecodePlan,
  ResolveIntrospectionDecodePlanOptions,
} from "./caller-visibility";

export { decodeIntrospectableToken } from "./decode-introspectable-token";
export type { DecodeIntrospectableTokenOptions } from "./decode-introspectable-token";

export { isIntrospectedTokenActive } from "./is-introspected-token-active";
export type { IsIntrospectedTokenActiveOptions } from "./is-introspected-token-active";

export { buildActiveIntrospectionResponse } from "./build-active-introspection-response";
export type { BuildActiveIntrospectionResponseOptions } from "./build-active-introspection-response";

export { INACTIVE_INTROSPECTION_RESPONSE } from "./types";
export type {
  ActiveOidcIntrospectionResponseBody,
  DecodedIntrospectableToken,
  IntrospectableTokenKind,
  OidcIntrospectionCaller,
  OidcIntrospectionResponseBody,
} from "./types";
